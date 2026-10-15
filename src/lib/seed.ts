import { db } from '../db/db'
import { newCard } from './srs'
import { autoSegments, completeReading, readingFromSegments } from './furigana'
import { resolveBlank } from './blank'

// Sample words so you can try the review flow without adding words by hand.
// Auto-seeds once on first launch (see seedDemoIfEmpty). You can also call
// window.seedDemo() / window.wipeAll() from the console.
//
// NOTE the examples: verbs/adjectives use their CONJUGATED surface form and
// mark the blank span with {…}, so you can see cloze blanking work on forms
// that differ from the stored dictionary word (食べる vs 食べます).
const SAMPLE = [
  // Nouns — the word appears verbatim, no marker needed.
  { word: '学校', reading: 'がっこう', meaning: '學校', pos: '名詞', jp: '毎日{学校}へ行きます。', tl: '每天去學校。' },
  { word: '天気', reading: 'てんき', meaning: '天氣', pos: '名詞', jp: '今日は{天気}がいいです。', tl: '今天天氣很好。' },
  { word: '時間', reading: 'じかん', meaning: '時間', pos: '名詞', jp: 'もう{時間}がありません。', tl: '已經沒有時間了。' },
  // い-adjectives — conjugate on the tail.
  { word: '正しい', reading: 'ただしい', meaning: '正確、對的', pos: 'い形容詞', jp: 'その答えは{正しい}。', tl: '那個答案是正確的。' },
  { word: '難しい', reading: 'むずかしい', meaning: '困難的', pos: 'い形容詞', jp: 'この問題は{難しかった}。', tl: '這個問題很難（過去式）。' },
  { word: '安い', reading: 'やすい', meaning: '便宜的', pos: 'い形容詞', jp: 'この店はとても{安い}です。', tl: '這家店很便宜。' },
  // な-adjective.
  { word: '静か', reading: 'しずか', meaning: '安靜的', pos: 'な形容詞', jp: '図書館は{静か}です。', tl: '圖書館很安靜。' },
  // Verbs — conjugated; dictionary form would NOT be found by indexOf.
  { word: '食べる', reading: 'たべる', meaning: '吃', pos: '他動詞', jp: '毎朝パンを{食べます}。', tl: '每天早上吃麵包。' },
  { word: '飲む', reading: 'のむ', meaning: '喝', pos: '他動詞', jp: '水を{飲みたい}。', tl: '想喝水。' },
  { word: '行く', reading: 'いく', meaning: '去', pos: '自動詞', jp: '友だちと映画に{行った}。', tl: '和朋友去看了電影。' }
]

async function insert(s: (typeof SAMPLE)[number]) {
  const { jp, blankStart, blankEnd } = resolveBlank(s.jp, s.word)
  const wordId = await db.words.add({
    segments: autoSegments(s.word, s.reading),
    reading: s.reading,
    meaning: s.meaning,
    partOfSpeech: s.pos,
    examples: [{ jp, translation: s.tl, blankStart, blankEnd }],
    addedDate: new Date().toISOString()
  })
  await db.cards.add(newCard(wordId as number))
}

export async function seedDemo() {
  for (const s of SAMPLE) await insert(s)
  return `${SAMPLE.length} words seeded — reload the page.`
}

// Runs on startup: only seeds when the DB is completely empty, so it never
// duplicates words or clobbers anything you've added yourself.
export async function seedDemoIfEmpty() {
  const count = await db.words.count()
  if (count === 0) await seedDemo()
}

// One-time repair for words whose stored data predates fixes to furigana
// handling. Three problems are healed, all derived from the surface word /
// segments so no guessing is involved:
//
//   1. Incomplete READING (okurigana) — the kana for the whole word was saved
//      missing its okurigana (叱る stored as しか instead of しかる). The
//      surface word spells out the okurigana (…る), so completeReading()
//      appends it.
//   2. Incomplete READING (interior kana) — an interleaved word stored a flat
//      reading missing an INTERIOR kana particle (役に立つ stored as やくたつ,
//      dropping the に), so the kana-recall prompt showed a gap. When the
//      SEGMENTS are complete they encode the full reading losslessly
//      (役→やく / に / 立→た / つ), so readingFromSegments() rebuilds やくにたつ.
//   3. Incomplete SEGMENTS — multi-kanji compounds (待ち合わせ, 乗り換える …)
//      stored a kanji segment with rt:'' (empty furigana). We re-derive them.
//
// Idempotent and cheap: words already correct are skipped. Only `reading` and
// `segments` are touched — meaning/examples/scheduling are untouched.
export async function repairSegments(): Promise<number> {
  const all = await db.words.toArray()
  let fixed = 0
  for (const w of all) {
    const surface = w.segments.map((s) => s.base).join('')
    const segsBroken = w.segments.some((s) => s.rt === '')

    // Prefer the reading encoded by COMPLETE segments — it is lossless for
    // interleaved words (recovers interior kana a flat reading dropped).
    // Fall back to okurigana completion when segments are incomplete.
    const fromSegs = segsBroken ? '' : readingFromSegments(w.segments)
    const fixedReading = fromSegs || completeReading(surface, w.reading)
    const readingBroken = fixedReading !== w.reading

    if (!segsBroken && !readingBroken) continue

    const next = autoSegments(surface, fixedReading)
    // Don't overwrite segments if the recomputed split is still incomplete
    // (irregular reading) — but DO still save a healed reading if we have one.
    const nextStillBroken = next.some((s) => s.rt === '')
    const update: Partial<typeof w> = {}
    if (readingBroken) update.reading = fixedReading
    if (!nextStillBroken) update.segments = next
    if (Object.keys(update).length === 0) continue
    await db.words.update(w.id!, update)
    fixed++
  }
  return fixed
}

export async function wipeAll() {
  await db.words.clear()
  await db.cards.clear()
  await db.logs.clear()
  return 'all cleared — reload the page.'
}

// Expose on window for console use in dev.
;(window as unknown as Record<string, unknown>).seedDemo = seedDemo
;(window as unknown as Record<string, unknown>).wipeAll = wipeAll
