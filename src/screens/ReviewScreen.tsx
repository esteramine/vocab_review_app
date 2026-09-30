import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { gradeCard, previewIntervals, Rating } from '../lib/srs'
import { buildQueue, type QueueItem } from '../lib/queue'
import { Furigana } from '../components/Furigana'
import { DrawPad } from '../components/DrawPad'
import type { Grade } from 'ts-fsrs'
import type { ReviewType } from '../lib/types'

// Pick which prompt to show for a given card. Alternate by reps so the same
// word is practised as writing sometimes and cloze other times.
function promptFor(item: QueueItem): ReviewType {
  const hasExample = item.word.examples.length > 0
  if (!hasExample) return 'write'
  return item.card.reps % 2 === 0 ? 'write' : 'cloze'
}

function clozeSentence(jp: string, start: number, end: number) {
  // start === -1 (or an empty span) means we couldn't locate the word — show
  // the sentence intact rather than blanking the wrong spot.
  if (start < 0 || end <= start) return jp
  return jp.slice(0, start) + '＿＿＿' + jp.slice(end)
}

export function ReviewScreen({ onDone }: { onDone: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    buildQueue().then((q) => {
      setQueue(q)
      setLoading(false)
    })
  }, [])

  const item = queue[idx]
  const type = useMemo(() => (item ? promptFor(item) : 'write'), [item])
  const intervals = useMemo(() => (item ? previewIntervals(item.card) : null), [item])

  if (loading) return <div className="screen center"><p className="muted">載入中…</p></div>

  if (!item) {
    return (
      <div className="screen center">
        <h2>辛苦了！🎉</h2>
        <p className="muted">今天的複習完成了。</p>
        <button className="primary" onClick={onDone}>回首頁</button>
      </div>
    )
  }

  const grade = async (rating: Grade) => {
    const updated = gradeCard(item.card, rating)
    await db.cards.update(item.card.id!, updated)
    await db.logs.add({
      wordId: item.word.id!,
      rating,
      reviewType: type,
      reviewedAt: new Date().toISOString()
    })

    // If the card is due again very soon (relearning — e.g. 再一次/有點難 gives
    // a minutes-away interval), re-queue it at the END of this session instead
    // of making the user reopen the app. Cards scheduled days out just leave.
    const soonMs = 10 * 60 * 1000 // 10 minutes
    const dueSoon = new Date(updated.due).getTime() - Date.now() <= soonMs
    setQueue((q) => {
      if (!dueSoon) return q
      // append the updated card+word to the back
      return [...q, { word: item.word, card: updated }]
    })

    setRevealed(false)
    setIdx((i) => i + 1)
  }

  const ex = item.word.examples[0]

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="link" onClick={onDone}>× 結束</button>
        <span className="muted">{idx + 1} / {queue.length}</span>
        <span className="pill">{type === 'write' ? '手寫' : '填空'}</span>
      </header>

      <div className="card">
        {type === 'write' ? (
          <div className={revealed ? 'answer' : 'prompt'}>
            {/* Cue: shown before reveal. */}
            {!revealed && (
              <>
                <p className="cue">{item.word.meaning}</p>
                {ex && (
                  <p className="cue jp cloze-hint">
                    {clozeSentence(ex.jp, ex.blankStart, ex.blankEnd)}
                  </p>
                )}
                <p className="hint muted">請寫出這個意思的日文單字</p>
              </>
            )}

            {/* Answer: shown after reveal, ABOVE the shrunk drawing. */}
            {revealed && (
              <>
                <Furigana segments={item.word.segments} size={40} />
                <p className="reading muted jp">{item.word.reading}</p>
                <p className="meaning">{item.word.meaning}</p>
                {ex && (
                  <div className="example">
                    <p className="jp">{ex.jp}</p>
                    {ex.translation && <p className="muted">{ex.translation}</p>}
                  </div>
                )}
                <p className="hint muted">你的手寫 ↓ 對照答案</p>
              </>
            )}

            {/*
              The DrawPad stays MOUNTED across reveal (same key per word), so
              your strokes survive. On reveal it just shrinks and goes
              read-only so you can compare. `key` resets it for the next word.
            */}
            <DrawPad key={item.word.id} height={revealed ? 120 : 220} readOnly={revealed} />

            {!revealed && (
              <button className="primary wide" onClick={() => setRevealed(true)}>
                顯示答案
              </button>
            )}
            {revealed && (
              <div className="grades">
                <button className="g-again" onClick={() => grade(Rating.Again as Grade)}>
                  再一次<small>{intervals?.[Rating.Again]}</small>
                </button>
                <button className="g-hard" onClick={() => grade(Rating.Hard as Grade)}>
                  有點難<small>{intervals?.[Rating.Hard]}</small>
                </button>
                <button className="g-good" onClick={() => grade(Rating.Good as Grade)}>
                  普通<small>{intervals?.[Rating.Good]}</small>
                </button>
                <button className="g-easy" onClick={() => grade(Rating.Easy as Grade)}>
                  簡單<small>{intervals?.[Rating.Easy]}</small>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* CLOZE — keep the sentence in place; fill the blank on reveal. */
          <div className="answer cloze">
            {/* On reveal, show the DICTIONARY form (furigana) above the
                sentence with its reading + meaning right below it, while the
                blank fills with the ACTUAL conjugated surface from the
                sentence — so the sentence stays grammatical. */}
            {revealed && (
              <div className="cloze-dict">
                <div className="cloze-dict-word">
                  <Furigana segments={item.word.segments} size={30} />
                  <span className="cloze-dict-tag muted">辭書形</span>
                </div>
                <p className="reading muted jp">{item.word.reading}</p>
                <p className="meaning">{item.word.meaning}</p>
              </div>
            )}
            {ex && ex.blankStart >= 0 && ex.blankEnd > ex.blankStart ? (
              <p className="cue jp cloze-line">
                <span>{ex.jp.slice(0, ex.blankStart)}</span>
                {revealed ? (
                  <span className="cloze-fill">{ex.jp.slice(ex.blankStart, ex.blankEnd)}</span>
                ) : (
                  <span className="cloze-gap" aria-label="填空" />
                )}
                <span>{ex.jp.slice(ex.blankEnd)}</span>
              </p>
            ) : (
              // No locatable blank: just show the sentence (dict form already
              // shown above on reveal).
              <p className="cue jp cloze-line">{ex ? ex.jp : ''}</p>
            )}
            {/* Sentence translation sits directly under the sentence on reveal. */}
            {revealed && ex?.translation && <p className="muted cloze-tl">{ex.translation}</p>}

            {!revealed ? (
              <>
                <p className="hint muted">提示：{item.word.meaning}</p>
                <button className="primary wide" onClick={() => setRevealed(true)}>
                  顯示答案
                </button>
              </>
            ) : (
              <div className="grades">
                <button className="g-again" onClick={() => grade(Rating.Again as Grade)}>
                  再一次<small>{intervals?.[Rating.Again]}</small>
                </button>
                <button className="g-hard" onClick={() => grade(Rating.Hard as Grade)}>
                  有點難<small>{intervals?.[Rating.Hard]}</small>
                </button>
                <button className="g-good" onClick={() => grade(Rating.Good as Grade)}>
                  普通<small>{intervals?.[Rating.Good]}</small>
                </button>
                <button className="g-easy" onClick={() => grade(Rating.Easy as Grade)}>
                  簡單<small>{intervals?.[Rating.Easy]}</small>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
