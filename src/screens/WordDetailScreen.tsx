import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { gradeCard, previewIntervals, Rating } from '../lib/srs'
import { Furigana } from '../components/Furigana'
import { DrawPad } from '../components/DrawPad'
import type { Card, Word } from '../lib/types'
import type { Grade } from 'ts-fsrs'
import { State } from 'ts-fsrs'

const STATE_LABEL: Record<number, string> = {
  [State.New]: '新',
  [State.Learning]: '學習中',
  [State.Review]: '複習中',
  [State.Relearning]: '重新學習'
}

function fmtDate(iso?: string | Date) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('zh-Hant', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function clozeSentence(jp: string, start: number, end: number) {
  if (start < 0 || end <= start) return jp
  return jp.slice(0, start) + '＿＿＿' + jp.slice(end)
}

export function WordDetailScreen({ wordId, onBack }: { wordId: number; onBack: () => void }) {
  const [word, setWord] = useState<Word | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const load = () => {
    db.words.get(wordId).then((w) => setWord(w ?? null))
    db.cards.where('wordId').equals(wordId).first().then((c) => setCard(c ?? null))
  }
  useEffect(load, [wordId])

  const intervals = useMemo(() => (card ? previewIntervals(card) : null), [card])

  if (!word) return <div className="screen center"><p className="muted">載入中…</p></div>

  const ex = word.examples[0]

  const del = async () => {
    if (!confirm(`確定刪除「${word.reading}」？此動作無法復原。`)) return
    await db.words.delete(wordId)
    if (card?.id != null) await db.cards.delete(card.id)
    await db.logs.where('wordId').equals(wordId).delete()
    onBack()
  }

  const grade = async (rating: Grade) => {
    if (!card) return
    const updated = gradeCard(card, rating)
    await db.cards.update(card.id!, updated)
    await db.logs.add({
      wordId,
      rating,
      reviewType: 'write',
      reviewedAt: new Date().toISOString()
    })
    setRevealed(false)
    setReviewing(false)
    load()
  }

  // Single-word review (write prompt) — same flow as the review session.
  if (reviewing) {
    return (
      <div className="screen">
        <header className="screen-head">
          <button className="link" onClick={() => { setReviewing(false); setRevealed(false) }}>× 取消</button>
          <span className="pill">手寫</span>
        </header>
        <div className="card">
          <div className={revealed ? 'answer' : 'prompt'}>
            {!revealed && (
              <>
                <p className="cue">{word.meaning}</p>
                {ex && <p className="cue jp cloze-hint">{clozeSentence(ex.jp, ex.blankStart, ex.blankEnd)}</p>}
                <p className="hint muted">請寫出這個意思的日文單字</p>
              </>
            )}
            {revealed && (
              <>
                <Furigana segments={word.segments} size={40} />
                <p className="reading muted jp">{word.reading}</p>
                <p className="meaning">{word.meaning}</p>
                {ex && (
                  <div className="example">
                    <p className="jp">{ex.jp}</p>
                    {ex.translation && <p className="muted">{ex.translation}</p>}
                  </div>
                )}
                <p className="hint muted">你的手寫 ↓ 對照答案</p>
              </>
            )}
            <DrawPad key={wordId} height={revealed ? 120 : 220} readOnly={revealed} />
            {!revealed && (
              <button className="primary wide" onClick={() => setRevealed(true)}>顯示答案</button>
            )}
            {revealed && intervals && (
              <div className="grades">
                <button className="g-again" onClick={() => grade(Rating.Again as Grade)}>再一次<small>{intervals[Rating.Again]}</small></button>
                <button className="g-hard" onClick={() => grade(Rating.Hard as Grade)}>有點難<small>{intervals[Rating.Hard]}</small></button>
                <button className="g-good" onClick={() => grade(Rating.Good as Grade)}>普通<small>{intervals[Rating.Good]}</small></button>
                <button className="g-easy" onClick={() => grade(Rating.Easy as Grade)}>簡單<small>{intervals[Rating.Easy]}</small></button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Detail view
  return (
    <div className="screen">
      <header className="screen-head">
        <button className="link" onClick={onBack}>← 返回</button>
        <h2>單字詳情</h2>
        <button className="link danger" onClick={del}>刪除</button>
      </header>

      <div className="card detail">
        <Furigana segments={word.segments} size={44} />
        <p className="reading muted jp">{word.reading}</p>
        {word.partOfSpeech && <span className="pill soft">{word.partOfSpeech}</span>}
        <p className="meaning big">{word.meaning}</p>

        {ex && (
          <div className="example">
            <p className="jp">{ex.jp}</p>
            {ex.translation && <p className="muted">{ex.translation}</p>}
          </div>
        )}

        {card && (
          <div className="srs-meta">
            <span className="pill soft">{STATE_LABEL[card.state] ?? '—'}</span>
            <span className="muted">下次複習：{fmtDate(card.due)}</span>
            <span className="muted">複習次數：{card.reps}</span>
          </div>
        )}
        <p className="hint muted">新增於 {fmtDate(word.addedDate)}</p>

        <button className="primary wide" onClick={() => { setReviewing(true); setRevealed(false) }}>
          複習這個單字
        </button>
      </div>
    </div>
  )
}
