// Deciding WHERE to blank the target word inside an example sentence.
//
// The hard part: the dictionary form we store (食べる, 安い) is often NOT the
// surface form in the sentence (食べます, 安かった). Plain indexOf fails on any
// conjugated word. We resolve the blank span with three strategies, best first:
//
//   1. Explicit marker  — the author wraps the target in {…} in the example,
//      e.g. "毎朝パンを{食べ}ます。". 100% accurate, no NLP. The braces are
//      stripped from the stored sentence and their span becomes the blank.
//   2. Exact match       — indexOf(word). Works for nouns and dictionary-form
//      quotes (学校, 正しい that appears verbatim).
//   3. Stem match        — strip trailing okurigana from the word and search for
//      the longest leading kanji/kana stem (食べる → 食べ, 難しい → 難). Catches
//      most conjugations. Falls back to no-blank if even the stem is absent.

export interface BlankResult {
  jp: string          // sentence WITHOUT the {…} markers
  blankStart: number  // -1 when no blank could be located
  blankEnd: number
}

const MARKER = /\{([^}]*)\}/

// Longest leading run of the word that is likely to survive conjugation.
// Verbs/adjectives conjugate on the TAIL, so the head (usually the kanji stem)
// is the stable part. We shrink from the full word down to its first char.
function stemCandidates(word: string): string[] {
  const out: string[] = []
  for (let len = word.length; len >= 1; len--) {
    out.push(word.slice(0, len))
  }
  return out
}

export function resolveBlank(rawExample: string, word: string): BlankResult {
  // 1. Explicit {…} marker wins.
  const m = rawExample.match(MARKER)
  if (m) {
    const start = m.index!
    const inner = m[1]
    const jp = rawExample.slice(0, start) + inner + rawExample.slice(start + m[0].length)
    return { jp, blankStart: start, blankEnd: start + inner.length }
  }

  const jp = rawExample.trim()

  // 2. Exact dictionary form present verbatim.
  const exact = jp.indexOf(word)
  if (exact >= 0) {
    return { jp, blankStart: exact, blankEnd: exact + word.length }
  }

  // 3. Stem match — longest leading substring of the word found in the sentence.
  for (const stem of stemCandidates(word)) {
    if (stem.length < 1) continue
    const at = jp.indexOf(stem)
    if (at >= 0) {
      // Extend the blank rightward to swallow trailing kana (the conjugation),
      // stopping at the next punctuation / space / ASCII so we don't eat の, を…
      let end = at + stem.length
      while (end < jp.length && isOkurigana(jp[end])) end++
      return { jp, blankStart: at, blankEnd: end }
    }
  }

  // 4. Give up — no blank. Caller shows the sentence unblanked (or hides it).
  return { jp, blankStart: -1, blankEnd: -1 }
}

// Hiragana only — trailing conjugation kana we absorb into the blank after a
// kanji stem. We deliberately do NOT absorb katakana, kanji, punctuation, or
// particles beyond the immediate okurigana. This is a heuristic, not a parser.
function isOkurigana(ch: string): boolean {
  const c = ch.codePointAt(0)!
  return c >= 0x3041 && c <= 0x309f // hiragana block
}
