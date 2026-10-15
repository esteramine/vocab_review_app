import { db } from '../db/db'
import type { Card, Word, ReviewType } from './types'
import { State } from 'ts-fsrs'

export interface QueueItem {
  word: Word
  card: Card
  // Which quiz this item is. Each due word is expanded into a PAIR spread
  // across two phases: a recall quiz (phase 1) and a partner quiz (phase 2).
  // BOTH quizzes are rated by the user, but the FSRS schedule is advanced only
  // ONCE per word — when the partner item (`grades: true`) is graded, using
  // the combined (worst-of) rating of the pair. So one word still produces
  // exactly one scheduling event per review.
  reviewType: ReviewType
  grades: boolean
}

export interface QueueCounts {
  due: number
  fresh: number
}

const NEW_PER_DAY = 30 // cap on brand-new cards introduced per session

// Day-granularity due cutoff: a card is "due today" if its due timestamp is
// any time on or before the END of the given day. This makes a card scheduled
// for today available from midnight (like Anki), rather than only after the
// exact clock time it was graded. Minute-level relearning still qualifies
// since those due times are the same day.
function endOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d
}

// Returns cards due today (state != New, due ≤ end of today) plus up to
// NEW_PER_DAY new cards. New cards are surfaced after due ones, and among the
// new ones the MOST RECENTLY ADDED come first (so today's additions are
// reviewed before older untouched backlog).
export async function buildQueue(now = new Date()): Promise<QueueItem[]> {
  const cutoff = endOfDay(now)
  const cards = await db.cards.toArray()
  const dueCards = cards
    .filter((c) => c.state !== State.New && new Date(c.due) <= cutoff)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())

  // New cards, newest-added first. Sort by their word's addedDate (desc),
  // then take the cap.
  const newCardsRaw = cards.filter((c) => c.state === State.New)
  const words = await db.words.bulkGet(newCardsRaw.map((c) => c.wordId))
  const addedAt = new Map<number, string>()
  newCardsRaw.forEach((c, i) => addedAt.set(c.wordId, words[i]?.addedDate ?? ''))
  const newCards = newCardsRaw
    .sort((a, b) => (addedAt.get(b.wordId) ?? '').localeCompare(addedAt.get(a.wordId) ?? ''))
    .slice(0, NEW_PER_DAY)

  const ordered = [...dueCards, ...newCards]

  // Each word gets TWO quizzes, split into TWO PHASES across the session:
  //   Phase 1 — the reading-based recall for EVERY word (A, B, C …), then
  //   Phase 2 — the partner quiz for every word (A, B, C …).
  // So the session runs A(recall) B(recall) C(recall) A(partner) B(partner)
  // C(partner), not the per-word pairs. The partner item carries grades:true,
  // but BOTH quizzes are rated and combined into one schedule update when the
  // partner is graded (see ReviewScreen) — one word still = one scheduling
  // event.
  const phase1: QueueItem[] = []
  const phase2: QueueItem[] = []
  for (const card of ordered) {
    const word = await db.words.get(card.wordId)
    if (!word) continue
    phase1.push({ word, card, reviewType: firstType(word), grades: false })
    phase2.push({ word, card, reviewType: partnerType(word, card), grades: true })
  }
  return [...phase1, ...phase2]
}

// True when the word contains at least one kanji run (a segment with a reading).
export function hasKanji(word: Word): boolean {
  return word.segments.some((s) => s.rt !== null)
}

// The FIRST (non-grading) quiz of the pair. For a word with kanji it's 'kana'
// — show only the 平假名/片假名 reading, no kanji, and recall the meaning (the
// N4/N3 "kana-only" format). For a pure-kana word that's identical to seeing
// the word itself, so it falls back to 'meaning' (shows the word + reading).
export function firstType(word: Word): ReviewType {
  return hasKanji(word) ? 'kana' : 'meaning'
}

// The partner quiz paired with the first recall. For a word WITH an example
// sentence it alternates between 填空 (cloze) and 手寫 (write) across reviews
// for variety, keyed on the card's review count so it flips each time. A word
// with NO example can only be 手寫.
export function partnerType(word: Word, card: Card): ReviewType {
  if (word.examples.length === 0) return 'write'
  return card.reps % 2 === 0 ? 'cloze' : 'write'
}

export async function queueCounts(now = new Date()): Promise<QueueCounts> {
  const cutoff = endOfDay(now)
  const cards = await db.cards.toArray()
  const due = cards.filter((c) => c.state !== State.New && new Date(c.due) <= cutoff).length
  const fresh = Math.min(
    cards.filter((c) => c.state === State.New).length,
    NEW_PER_DAY
  )
  return { due, fresh }
}

// Familiarity tiers derived from FSRS state + stability (days until ~90%
// recall). Thresholds follow the common young/mature convention; tweak freely.
export interface FamiliarityStats {
  total: number
  isNew: number       // never reviewed
  learning: number    // in (re)learning
  young: number       // reviewing, stability < 21d
  mature: number      // reviewing, 21d ≤ stability < 60d
  veryFamiliar: number // reviewing, stability ≥ 60d
}

const MATURE_DAYS = 21
const VERY_FAMILIAR_DAYS = 60

// Familiarity tier of a single card, as one of the FamiliarityStats keys.
export type Tier = 'veryFamiliar' | 'mature' | 'young' | 'learning' | 'isNew'

export function cardTier(card: Card): Tier {
  if (card.state === State.New) return 'isNew'
  if (card.state === State.Learning || card.state === State.Relearning) return 'learning'
  const stab = card.stability ?? 0
  if (stab >= VERY_FAMILIAR_DAYS) return 'veryFamiliar'
  if (stab >= MATURE_DAYS) return 'mature'
  return 'young'
}

// Shared tier metadata (label + CSS color + a rank for sorting most→least
// familiar). Used by Home stats and the word-list indicator/sort.
export const TIER_META: Record<Tier, { label: string; color: string; rank: number }> = {
  veryFamiliar: { label: '非常熟悉', color: 'var(--good)', rank: 4 },
  mature: { label: '熟悉', color: 'var(--accent-2)', rank: 3 },
  young: { label: '複習中', color: 'var(--easy)', rank: 2 },
  learning: { label: '學習中', color: 'var(--hard)', rank: 1 },
  isNew: { label: '未學習', color: 'var(--muted)', rank: 0 }
}

export async function familiarityStats(): Promise<FamiliarityStats> {
  const cards = await db.cards.toArray()
  const s: FamiliarityStats = {
    total: cards.length,
    isNew: 0,
    learning: 0,
    young: 0,
    mature: 0,
    veryFamiliar: 0
  }
  for (const c of cards) {
    s[cardTier(c)]++
  }
  return s
}
