import { db } from '../db/db'
import { newCard } from './srs'
import { autoSegments } from './furigana'
import { resolveBlank } from './blank'
import type { Card, Example, ReviewLog, Word } from './types'

// ---------------------------------------------------------------------------
// Bulk line parsing
// ---------------------------------------------------------------------------
// One word per line, fields separated by TAB or comma (tab preferred, since
// meanings/sentences can contain commas). Column order:
//
//   word <TAB> reading <TAB> meaning <TAB> exampleJp? <TAB> exampleTl? <TAB> pos?
//
// Only the first three are required. Wrap the cloze target in {…} inside the
// example (esp. conjugated forms), e.g.  毎朝パンを{食べます}。
// Lines that are blank or start with # are ignored (so you can add comments).

export interface ParsedRow {
  word: string
  reading: string
  meaning: string
  exampleJp?: string
  exampleTl?: string
  partOfSpeech?: string
}

export interface ParseResult {
  rows: ParsedRow[]
  errors: { line: number; text: string; reason: string }[]
}

// A normalized key for detecting duplicate words: surface word + space-free
// reading. Using both means true homophones (橋/箸 = はし) are NOT flagged,
// only genuinely identical entries.
export function dupKey(word: string, reading: string): string {
  return `${word.trim()}\u0000${reading.trim().replace(/\s+/g, '')}`
}

export interface DuplicateFinding {
  line: number
  text: string
  where: 'existing' | 'batch' // already in the deck, or repeated within this paste
}

// Warn-only duplicate detection for a parsed batch. Compares each row against
// the words already in the DB AND against earlier rows in the same paste.
// Does NOT merge, skip, or modify anything — the caller decides.
export async function findDuplicates(rows: ParsedRow[]): Promise<DuplicateFinding[]> {
  const existing = new Set((await db.words.toArray()).map((w) => dupKey(bareWord(w), w.reading)))
  const seen = new Set<string>()
  const out: DuplicateFinding[] = []
  rows.forEach((r, i) => {
    const key = dupKey(r.word, r.reading)
    if (existing.has(key)) out.push({ line: i + 1, text: `${r.word}（${r.reading}）`, where: 'existing' })
    else if (seen.has(key)) out.push({ line: i + 1, text: `${r.word}（${r.reading}）`, where: 'batch' })
    seen.add(key)
  })
  return out
}

// The surface word of a stored Word (segments joined) for dup comparison.
function bareWord(w: Word): string {
  return w.segments.map((s) => s.base).join('')
}

// Does a single (word, reading) already exist in the deck? For the Add form.
export async function isDuplicate(word: string, reading: string): Promise<boolean> {
  const key = dupKey(word, reading)
  const all = await db.words.toArray()
  return all.some((w) => dupKey(bareWord(w), w.reading) === key)
}

export function parseBulk(text: string): ParseResult {
  const rows: ParsedRow[] = []
  const errors: ParseResult['errors'] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    // Prefer tab split; fall back to comma if there are no tabs.
    const parts = (raw.includes('\t') ? raw.split('\t') : raw.split(',')).map((p) => p.trim())
    const [word, reading, meaning, exampleJp, exampleTl, partOfSpeech] = parts
    if (!word || !reading || !meaning) {
      errors.push({
        line: i + 1,
        text: line,
        reason: '至少需要 單字 / 讀音 / 意思 三欄'
      })
      return
    }
    rows.push({
      word,
      reading,
      meaning,
      exampleJp: exampleJp || undefined,
      exampleTl: exampleTl || undefined,
      partOfSpeech: partOfSpeech || undefined
    })
  })
  return { rows, errors }
}

// Turn a parsed row into a Word (computing segments + cloze blank).
function rowToWord(r: ParsedRow): Word {
  const examples: Example[] = []
  if (r.exampleJp) {
    const { jp, blankStart, blankEnd } = resolveBlank(r.exampleJp, r.word)
    examples.push({ jp, translation: r.exampleTl, blankStart, blankEnd })
  }
  return {
    segments: autoSegments(r.word, r.reading),
    reading: r.reading.replace(/\s+/g, ''),
    meaning: r.meaning,
    partOfSpeech: r.partOfSpeech,
    examples,
    addedDate: new Date().toISOString()
  }
}

// Insert parsed rows, each with a fresh SRS card. Returns count inserted.
export async function insertRows(rows: ParsedRow[]): Promise<number> {
  let n = 0
  for (const r of rows) {
    const wordId = await db.words.add(rowToWord(r))
    await db.cards.add(newCard(wordId as number))
    n++
  }
  return n
}

// ---------------------------------------------------------------------------
// JSON export / import (the Mac ↔ phone bridge + backup)
// ---------------------------------------------------------------------------

export interface Backup {
  format: 'review-app'
  version: 1
  exportedAt: string
  words: Word[]
  cards: Card[]
  logs: ReviewLog[]
}

export async function exportBackup(): Promise<Backup> {
  const [words, cards, logs] = await Promise.all([
    db.words.toArray(),
    db.cards.toArray(),
    db.logs.toArray()
  ])
  return {
    format: 'review-app',
    version: 1,
    exportedAt: new Date().toISOString(),
    words,
    cards,
    logs
  }
}

// Trigger a browser download of the backup JSON.
export async function downloadBackup() {
  const data = await exportBackup()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `review-app-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  words: number
  cards: number
  logs: number
}

// Import a backup. 'merge' adds its words alongside existing ones (re-keying
// ids so nothing collides); 'replace' wipes everything first. Cards/logs keep
// their link to their word via the remapped id.
export async function importBackup(data: Backup, mode: ImportMode): Promise<ImportResult> {
  if (data.format !== 'review-app') throw new Error('不是有效的備份檔（format 不符）')
  if (mode === 'replace') {
    await db.words.clear()
    await db.cards.clear()
    await db.logs.clear()
  }

  // Remap old wordId → new wordId so merges never collide with existing rows.
  const idMap = new Map<number, number>()
  for (const w of data.words) {
    const oldId = w.id
    const { id: _drop, ...rest } = w
    const newId = (await db.words.add(rest as Word)) as number
    if (oldId != null) idMap.set(oldId, newId)
  }
  let cardCount = 0
  for (const c of data.cards) {
    const newWordId = idMap.get(c.wordId)
    if (newWordId == null) continue
    const { id: _drop, ...rest } = c
    await db.cards.add({ ...(rest as Card), wordId: newWordId })
    cardCount++
  }
  let logCount = 0
  for (const l of data.logs) {
    const newWordId = idMap.get(l.wordId)
    if (newWordId == null) continue
    const { id: _drop, ...rest } = l
    await db.logs.add({ ...(rest as ReviewLog), wordId: newWordId })
    logCount++
  }
  return { words: idMap.size, cards: cardCount, logs: logCount }
}

// Parse a File (from an <input type=file>) into a Backup object.
export async function readBackupFile(file: File): Promise<Backup> {
  const text = await file.text()
  return JSON.parse(text) as Backup
}
