import type { Segment } from './types'

const isKana = (ch: string) => /[\u3040-\u309F\u30A0-\u30FF\u30FC]/.test(ch)
const isKanji = (ch: string) => /[\u4E00-\u9FFF\u3005]/.test(ch)

// Complete a reading that is missing the okurigana the SURFACE word already
// spells out. The app's model wants `reading` to be the full kana for the
// WHOLE word (正しい → ただしい, 食べる → たべる, 叱る → しかる). If a word was
// entered with only the kanji's reading (叱る stored as しか), the trailing
// kana written in the word (る) are literal kana we can safely append; same
// for leading kana. Returns the reading unchanged when it already ends/starts
// with the surface's okurigana, so it is idempotent and never doubles kana.
//
// NOTE: this only heals LEADING/TRAILING kana. Interior kana (particles such
// as the に in 役に立つ) cannot be recovered from a flat reading string —
// their position is ambiguous — so for the full kana of an interleaved word,
// derive it from the SEGMENTS via `readingFromSegments`, which is lossless.
export function completeReading(surface: string, reading: string): string {
  const chars = [...surface]
  if (chars.length === 0 || !chars.some(isKanji)) return reading
  let out = reading

  // Trailing okurigana: the run of kana at the END of the surface word.
  let tail = ''
  for (let i = chars.length - 1; i >= 0 && isKana(chars[i]); i--) tail = chars[i] + tail
  if (tail && !out.endsWith(tail)) out = out + tail

  // Leading kana prefix (rare: お手洗い-style has none, but be symmetric).
  let lead = ''
  for (let i = 0; i < chars.length && isKana(chars[i]); i++) lead += chars[i]
  if (lead && !out.startsWith(lead)) out = lead + out

  return out
}

// Reconstruct the full, continuous kana reading of a word from its furigana
// SEGMENTS. Each kanji segment contributes its reading (`rt`); each kana
// segment contributes its literal text (`base`). Unlike the flat `reading`
// field, this is LOSSLESS for interleaved words — the interior particle in
// 役に立つ (役→やく / に / 立→た / つ → "やくにたつ") is preserved because the
// kana segment carries it structurally. Returns '' if a kanji segment is
// missing its reading (broken segments), so callers can fall back.
export function readingFromSegments(segments: Segment[]): string {
  let out = ''
  for (const seg of segments) {
    if (seg.rt === null) out += seg.base
    else if (seg.rt) out += seg.rt
    else return '' // kanji segment with empty reading → segments are incomplete
  }
  return out
}

// The single source of truth for turning a user's (surface, reading) input into
// the two stored fields: `segments` (for furigana display) and `reading` (the
// flat, continuous kana used by the kana-recall prompt, search, etc).
//
// It runs autoSegments on the RAW reading input first, so the space-separated
// per-kanji form (「やく た」 for 役に立つ) is split correctly, THEN derives the
// flat reading from those segments — which is LOSSLESS, so interior kana
// particles (the に in 役に立つ) survive instead of being dropped. When the
// segments come out incomplete (irregular reading the heuristic can't split),
// it falls back to okurigana completion so leading/trailing kana are still
// restored. Used by Add, Edit and import so they can never drift apart.
export function deriveWord(surface: string, readingInput: string): {
  segments: Segment[]
  reading: string
} {
  const s = surface.trim()
  const segments = autoSegments(s, readingInput.trim())
  const fromSegs = segments.some((seg) => seg.rt === '') ? '' : readingFromSegments(segments)
  const reading = fromSegs || completeReading(s, readingInput.trim().replace(/\s+/g, ''))
  return { segments, reading }
}

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

  // Use the kana runs as ANCHORS to carve the reading into per-kanji-run pieces.
  // The reading reads left-to-right as: [kanji₀ reading][kana₀][kanji₁ reading]
  // [kana₁]… — every kana run appears verbatim in the reading, in order, so we
  // can locate each one and treat the text between anchors as the kanji run's
  // reading. This correctly handles compounds with multiple kanji runs
  // separated by okurigana (待ち合わせ, 乗り換える, 申し込む, …), which the old
  // code left half-unannotated.
  const kanjiRuns = runs.filter((x) => x.kanji)

  // Fast path: a single kanji run — peel matching kana off both ends and give
  // the kanji run whatever reading remains in the middle.
  if (kanjiRuns.length <= 1) {
    let r = reading
    const leadKana = runs[0].kanji ? '' : runs[0].text
    const tailKana =
      runs.length > 1 && !runs[runs.length - 1].kanji ? runs[runs.length - 1].text : ''
    if (leadKana && r.startsWith(leadKana)) r = r.slice(leadKana.length)
    if (tailKana && r.endsWith(tailKana)) r = r.slice(0, r.length - tailKana.length)
    return runs.map((run) =>
      run.kanji ? { base: run.text, rt: r || null } : { base: run.text, rt: null }
    )
  }

  // Multiple kanji runs: walk the runs, consuming the reading as we go. For a
  // kana run we match its text at the current position (it must appear
  // verbatim); for a kanji run we take everything up to the NEXT kana run's
  // text (or the end of the reading for a trailing kanji run).
  const r = reading
  let pos = 0
  const segs: Segment[] = []
  let matchedCleanly = true

  for (let i = 0; i < runs.length && matchedCleanly; i++) {
    const run = runs[i]
    if (!run.kanji) {
      // Kana run — it should sit at the current position in the reading.
      if (r.startsWith(run.text, pos)) {
        pos += run.text.length
        segs.push({ base: run.text, rt: null })
      } else {
        matchedCleanly = false
      }
    } else {
      // Kanji run — its reading runs until the next kana run's text appears
      // (search from the current position), or to the end if none follows.
      const nextKana = runs.slice(i + 1).find((x) => !x.kanji)
      let end: number
      if (nextKana) {
        const at = r.indexOf(nextKana.text, pos + 1)
        end = at === -1 ? -1 : at
      } else {
        end = r.length
      }
      if (end === -1 || end <= pos) {
        matchedCleanly = false
      } else {
        segs.push({ base: run.text, rt: r.slice(pos, end) || null })
        pos = end
      }
    }
  }

  // Anchors all matched and the whole reading was consumed → trust the split.
  if (matchedCleanly && pos === r.length) return segs

  // Fallback: anchors didn't line up (irregular reading). Assign the full
  // reading to the first kanji run and leave the rest blank for manual
  // correction — same conservative behavior as before, no worse than today.
  return runs.map((run) =>
    run.kanji
      ? { base: run.text, rt: run === kanjiRuns[0] ? reading || null : '' }
      : { base: run.text, rt: null }
  )
}
