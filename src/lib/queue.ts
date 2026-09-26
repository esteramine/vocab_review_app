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

const NEW_PER_DAY = 20 // cap on brand-new cards introduced per session

// Returns cards that are due now (state != New and due<=now) plus up to
// NEW_PER_DAY new cards. New cards are surfaced after due ones.
export async function buildQueue(now = new Date()): Promise<QueueItem[]> {
  const cards = await db.cards.toArray()
  const dueCards = cards
    .filter((c) => c.state !== State.New && new Date(c.due) <= now)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
  const newCards = cards.filter((c) => c.state === State.New).slice(0, NEW_PER_DAY)

  const ordered = [...dueCards, ...newCards]
  const items: QueueItem[] = []
  for (const card of ordered) {
    const word = await db.words.get(card.wordId)
    if (word) items.push({ word, card })
  }
  return items
}

export async function queueCounts(now = new Date()): Promise<QueueCounts> {
  const cards = await db.cards.toArray()
  const due = cards.filter((c) => c.state !== State.New && new Date(c.due) <= now).length
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
    if (c.state === State.New) s.isNew++
    else if (c.state === State.Learning || c.state === State.Relearning) s.learning++
    else {
      // State.Review — bucket by stability
      const stab = c.stability ?? 0
      if (stab >= VERY_FAMILIAR_DAYS) s.veryFamiliar++
      else if (stab >= MATURE_DAYS) s.mature++
      else s.young++
    }
  }
  return s
}
