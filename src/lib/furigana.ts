import type { Segment } from './types'

const isKana = (ch: string) => /[\u3040-\u309F\u30A0-\u30FF\u30FC]/.test(ch)
const isKanji = (ch: string) => /[\u4E00-\u9FFF\u3005]/.test(ch)

// Best-effort auto-split of a word into furigana segments given its full reading.
// Trailing/leading kana (okurigana) get rt=null; kanji runs get the leftover reading.
// This is a heuristic starting point — the Add screen lets you correct it by hand.
//
// PER-KANJI READINGS: if `reading` contains spaces, each space-separated part is
// assigned left-to-right to each KANJI CHARACTER in the word (kana characters
// are okurigana and get rt=null). This lets you align 綺麗 → "き れい" as
// 綺=き, 麗=れい. If the part count doesn't match the kanji count, it falls back
// to the space-less heuristic below.
//
// Example: word="正しい", reading="ただしい"
//   → kana suffix "しい" matches → [{base:"正",rt:"ただ"},{base:"しい",rt:null}]
// Example: word="綺麗", reading="き れい"
//   → [{base:"綺",rt:"き"},{base:"麗",rt:"れい"}]
export function autoSegments(word: string, reading: string): Segment[] {
  if (!word) return []
  // No kanji at all → single kana segment, no furigana.
  if (![...word].some(isKanji)) return [{ base: word, rt: null }]

  // Per-kanji readings via spaces: one part per kanji CHARACTER, in order.
  if (/\s/.test(reading.trim())) {
    const parts = reading.trim().split(/\s+/)
    const chars = [...word]
    const kanjiCount = chars.filter(isKanji).length
    if (parts.length === kanjiCount) {
      let pi = 0
      const segs: Segment[] = []
      for (const ch of chars) {
        if (isKanji(ch)) segs.push({ base: ch, rt: parts[pi++] })
        else {
          // merge consecutive kana into the previous kana segment if any
          const last = segs[segs.length - 1]
          if (last && last.rt === null) last.base += ch
          else segs.push({ base: ch, rt: null })
        }
      }
      return segs
    }
    // Count mismatch → drop the spaces and fall through to the heuristic.
    reading = parts.join('')
  }

  // Split the word into maximal kanji / kana runs.
  const runs: { text: string; kanji: boolean }[] = []
  for (const ch of word) {
    const kanji = isKanji(ch)
    const last = runs[runs.length - 1]
    if (last && last.kanji === kanji) last.text += ch
    else runs.push({ text: ch, kanji })
  }

  // Peel matching kana off both ends of the reading, assign the middle to kanji runs.
  let r = reading
  const leadKana = runs[0].kanji ? '' : runs[0].text
  const tailKana = runs.length > 1 && !runs[runs.length - 1].kanji ? runs[runs.length - 1].text : ''
  if (leadKana && r.startsWith(leadKana)) r = r.slice(leadKana.length)
  if (tailKana && r.endsWith(tailKana)) r = r.slice(0, r.length - tailKana.length)

  const segments: Segment[] = []
  const kanjiRuns = runs.filter((x) => x.kanji)
  runs.forEach((run) => {
    if (!run.kanji) {
      segments.push({ base: run.text, rt: null })
    } else if (kanjiRuns.length === 1) {
      // Single kanji run gets the whole remaining reading.
      segments.push({ base: run.text, rt: r || null })
    } else {
      // Multiple kanji runs: we can't reliably split — assign all to the first,
      // leave others empty for manual correction.
      segments.push({ base: run.text, rt: run === kanjiRuns[0] ? r || null : '' })
    }
  })
  return segments
}
