import { fsrs, generatorParameters, createEmptyCard, Rating, type Grade } from 'ts-fsrs'
import type { Card } from '../lib/types'

// Target ~90% retention — FSRS spaces reviews to hit this.
const params = generatorParameters({ enable_fuzz: true, request_retention: 0.9 })
const scheduler = fsrs(params)

export { Rating }

// Create a fresh FSRS card for a newly added word.
export function newCard(wordId: number): Card {
  const empty = createEmptyCard(new Date())
  return { ...empty, wordId }
}

// Grade a card. Returns the updated card (new due, stability, etc.).
export function gradeCard(card: Card, rating: Grade, now = new Date()): Card {
  const { card: next } = scheduler.next(card, now, rating)
  return { ...next, id: card.id, wordId: card.wordId }
}

// Human-readable "next interval" preview for each button (e.g. "3d", "10m").
export function previewIntervals(card: Card, now = new Date()): Record<number, string> {
  const scheduling = scheduler.repeat(card, now)
  const fmt = (d: Date) => {
    const mins = Math.round((d.getTime() - now.getTime()) / 60000)
    if (mins < 60) return `${Math.max(1, mins)}m`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.round(hrs / 24)
    if (days < 30) return `${days}d`
    const months = Math.round(days / 30)
    if (months < 12) return `${months}mo`
    return `${Math.round(months / 12)}y`
  }
  return {
    [Rating.Again]: fmt(scheduling[Rating.Again].card.due),
    [Rating.Hard]: fmt(scheduling[Rating.Hard].card.due),
    [Rating.Good]: fmt(scheduling[Rating.Good].card.due),
    [Rating.Easy]: fmt(scheduling[Rating.Easy].card.due)
  }
}
