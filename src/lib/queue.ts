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
