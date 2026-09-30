import { db } from '../db/db'
import type { Card, Word } from './types'
import { State } from 'ts-fsrs'

export interface QueueItem {
  word: Word
  card: Card
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
  const items: QueueItem[] = []
  for (const card of ordered) {
    const word = await db.words.get(card.wordId)
    if (word) items.push({ word, card })
  }
  return items
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
