import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { gradeCard, previewIntervals, Rating } from '../lib/srs'
import { buildQueue, firstType, type QueueItem } from '../lib/queue'
import { Furigana } from '../components/Furigana'
import { DrawPad } from '../components/DrawPad'
import type { Grade } from 'ts-fsrs'

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
  const type = item ? item.reviewType : 'write'
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
    // Log every attempt (both quizzes of the pair) for stats/history.
    await db.logs.add({
      wordId: item.word.id!,
      rating,
      reviewType: type,
      reviewedAt: new Date().toISOString()
    })

    // Only the GRADING item of the pair advances the FSRS schedule, so one
    // word = one scheduling event even though it's quizzed twice.
    if (item.grades) {
      const updated = gradeCard(item.card, rating)
      await db.cards.update(item.card.id!, updated)

      // If the card is due again very soon (relearning — e.g. 再一次/有點難
      // gives a minutes-away interval), re-queue the WHOLE PAIR at the end of
      // this session so you drill both quizzes again. Cards scheduled days out
      // just leave.
      const soonMs = 10 * 60 * 1000 // 10 minutes
      const dueSoon = new Date(updated.due).getTime() - Date.now() <= soonMs
      setQueue((q) => {
        if (!dueSoon) return q
        // Re-drill the SAME partner quiz you just failed this session (not a
        // freshly-alternated one), so relearning stays consistent.
        return [
          ...q,
          { word: item.word, card: updated, reviewType: firstType(item.word), grades: false },
          { word: item.word, card: updated, reviewType: item.reviewType, grades: true }
        ]
      })
    }

    setRevealed(false)
    setIdx((i) => i + 1)
  }

  const ex = item.word.examples[0]

  // The first quiz of a pair (the 'meaning' recall) does NOT advance the
  // schedule, so showing four FSRS buttons with interval previews there would
  // mislead. That quiz gets a single 下一題 button; the grading quiz gets the
  // real 再一次/有點難/普通/簡單 buttons.
  const gradeControls = item.grades ? (
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
  ) : (
    <button className="primary wide" onClick={() => grade(Rating.Good as Grade)}>
      下一題
    </button>
  )

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="link" onClick={onDone}>× 結束</button>
        <span className="muted">{idx + 1} / {queue.length}</span>
        <span className="pill">{type === 'write' ? '手寫' : type === 'cloze' ? '填空' : type === 'kana' ? '假名回想' : '看字回想'}</span>
      </header>

      <div className="card">
        {type === 'write' ? (
          <div className={revealed ? 'answer' : 'prompt'}>
            {/* Cue: shown before reveal. */}
            {!revealed && (
              <>
                <p className="cue">{item.word.meaning}</p>
                {item.word.partOfSpeech && (
                  <span className="pos-tag">{item.word.partOfSpeech}</span>
                )}
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
            {revealed && gradeControls}
          </div>
        ) : type === 'cloze' ? (
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
              gradeControls
            )}
          </div>
        ) : type === 'meaning' ? (
          /* MEANING — show the Japanese word (+ reading, + example as context)
             and recall the Chinese meaning; reveal it on tap. */
          <div className={revealed ? 'answer' : 'prompt'}>
            <Furigana segments={item.word.segments} size={40} />
            <p className="reading muted jp">{item.word.reading}</p>

            {!revealed ? (
              <>
                {ex && <p className="cue jp meaning-ex">{ex.jp}</p>}
                <p className="hint muted">請回想這個單字的中文意思</p>
                <button className="primary wide" onClick={() => setRevealed(true)}>
                  顯示答案
                </button>
              </>
            ) : (
              <>
                <p className="meaning">{item.word.meaning}</p>
                {ex && (
                  <div className="example">
                    <p className="jp">{ex.jp}</p>
                    {ex.translation && <p className="muted">{ex.translation}</p>}
                  </div>
                )}
                {gradeControls}
              </>
            )}
          </div>
        ) : (
          /* KANA — show ONLY the 平假名/片假名 reading (no kanji) and recall the
             meaning, mirroring the N4/N3 format where only kana is given. On
             reveal, show the full word WITH kanji (furigana) so you connect the
             kana back to the written form. */
          <div className={revealed ? 'answer' : 'prompt'}>
            {!revealed ? (
              <>
                <p className="cue jp kana-prompt">{item.word.reading}</p>
                <p className="hint muted">只看假名，請回想中文意思（與漢字寫法）</p>
                <button className="primary wide" onClick={() => setRevealed(true)}>
                  顯示答案
                </button>
              </>
            ) : (
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
                {gradeControls}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
