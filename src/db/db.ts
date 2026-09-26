import Dexie, { type Table } from 'dexie'
import type { Word, Card, ReviewLog } from '../lib/types'

export class ReviewDB extends Dexie {
  words!: Table<Word, number>
  cards!: Table<Card, number>
  logs!: Table<ReviewLog, number>

  constructor() {
    super('review-app')
    this.version(1).stores({
      // indexed fields only; other props are stored but not indexed
      words: '++id, addedDate',
      cards: '++id, wordId, due',
      logs: '++id, wordId, reviewedAt'
    })
  }
}

export const db = new ReviewDB()
