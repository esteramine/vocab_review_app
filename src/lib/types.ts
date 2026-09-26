import type { Card as FsrsCard } from 'ts-fsrs'

// One furigana-aligned run: kanji base with its reading, or kana with rt=null
export interface Segment {
  base: string
  rt: string | null
}

export interface Example {
  jp: string          // "その答えは正しい。"
  translation?: string // zh-Hant, optional
  // character offsets of the target word inside `jp`, for cloze blanking
  blankStart: number
  blankEnd: number
}

export interface Word {
  id?: number
  segments: Segment[] // [{base:"正",rt:"ただ"},{base:"しい",rt:null}]
  reading: string     // full kana reading "ただしい"
  meaning: string     // zh-Hant gloss "正確、對的"
  partOfSpeech?: string // e.g. "他動詞" / "い形容詞" — optional
  examples: Example[]
  addedDate: string   // ISO date
}

// Suggested part-of-speech options for the Add form (free text also allowed).
export const POS_OPTIONS = [
  '名詞',
  '自動詞',
  '他動詞',
  '自他動詞',
  'い形容詞',
  'な形容詞',
  '副詞',
  '連体詞',
  '接続詞',
  '助詞',
  '感動詞',
  '表現・慣用句'
] as const

// FSRS card state, stored alongside the word (1:1)
export interface Card extends FsrsCard {
  id?: number
  wordId: number
}

export type ReviewType = 'write' | 'cloze'

export interface ReviewLog {
  id?: number
  wordId: number
  rating: number      // Grade enum value from ts-fsrs
  reviewType: ReviewType
  reviewedAt: string  // ISO
}
