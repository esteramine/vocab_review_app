import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { gradeCard, previewIntervals, Rating } from '../lib/srs'
import { autoSegments } from '../lib/furigana'
import { resolveBlank } from '../lib/blank'
import { Furigana } from '../components/Furigana'
import { DrawPad } from '../components/DrawPad'
import { POS_OPTIONS, type Card, type Example, type Word } from '../lib/types'
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

// Rebuild the example the way the sentence is stored. The stored jp has the
// {…} marker already stripped, so to keep editing lossless we re-wrap the
// blanked span in {…} for the edit field, then re-resolve on save.
function exampleToEditable(ex?: Example): string {
  if (!ex) return ''
  if (ex.blankStart < 0 || ex.blankEnd <= ex.blankStart) return ex.jp
  return ex.jp.slice(0, ex.blankStart) + '{' + ex.jp.slice(ex.blankStart, ex.blankEnd) + '}' + ex.jp.slice(ex.blankEnd)
}

export function WordDetailScreen({ wordId, onBack }: { wordId: number; onBack: () => void }) {
  const [word, setWord] = useState<Word | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)

  // Edit form state
  const [eWord, setEWord] = useState('')
  const [eReading, setEReading] = useState('')
  const [eMeaning, setEMeaning] = useState('')
  const [ePos, setEPos] = useState('')
  const [ePosCustom, setEPosCustom] = useState('')
  const [eJp, setEJp] = useState('')
  const [eTl, setETl] = useState('')

  const load = () => {
    db.words.get(wordId).then((w) => setWord(w ?? null))
    db.cards.where('wordId').equals(wordId).first().then((c) => setCard(c ?? null))
  }
  useEffect(load, [wordId])

  const intervals = useMemo(() => (card ? previewIntervals(card) : null), [card])

  if (!word) return <div className="screen center"><p className="muted">載入中…</p></div>

  const ex = word.examples[0]

  const startEdit = () => {
    setEWord(word.segments.map((s) => s.base).join(''))
    setEReading(word.reading)
    setEMeaning(word.meaning)
    // If the current POS is one of the presets, select it; else use custom.
    if (word.partOfSpeech && (POS_OPTIONS as readonly string[]).includes(word.partOfSpeech)) {
      setEPos(word.partOfSpeech)
      setEPosCustom('')
    } else if (word.partOfSpeech) {
      setEPos('__custom__')
      setEPosCustom(word.partOfSpeech)
    } else {
      setEPos('')
      setEPosCustom('')
    }
    setEJp(exampleToEditable(ex))
    setETl(ex?.translation ?? '')
    setEditing(true)
  }

  const editSegments = eWord && eReading ? autoSegments(eWord, eReading) : []
  const canSaveEdit = eWord.trim() && eReading.trim() && eMeaning.trim()
  const resolvedPos = (ePos === '__custom__' ? ePosCustom.trim() : ePos).trim() || undefined

  const saveEdit = async () => {
    if (!canSaveEdit) return
    const examples: Example[] = []
    if (eJp.trim()) {
      const { jp, blankStart, blankEnd } = resolveBlank(eJp, eWord.trim())
      examples.push({ jp, translation: eTl.trim() || undefined, blankStart, blankEnd })
    }
    await db.words.update(wordId, {
      segments: autoSegments(eWord.trim(), eReading.trim()),
      reading: eReading.trim(),
      meaning: eMeaning.trim(),
      partOfSpeech: resolvedPos,
      examples
    })
    setEditing(false)
    load()
  }

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

  // ── EDIT MODE ─────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="screen">
        <header className="screen-head">
          <button className="link" onClick={() => setEditing(false)}>× 取消</button>
          <h2>編輯單字</h2>
          <button className="link" disabled={!canSaveEdit} onClick={saveEdit}>儲存</button>
        </header>

        <label className="field">
          <span>單字（漢字或假名）</span>
          <input className="jp" value={eWord} onChange={(e) => setEWord(e.target.value)} placeholder="正しい / ねこ" />
        </label>
        <label className="field">
          <span>讀音（假名）</span>
          <input className="jp" value={eReading} onChange={(e) => setEReading(e.target.value)} placeholder="ただしい" />
        </label>
        {editSegments.length > 0 && (
          <div className="preview">
            <span className="muted">預覽：</span>
            <Furigana segments={editSegments} size={30} />
            <p className="hint muted">無漢字時只顯示假名，不會有標音浮在上面</p>
          </div>
        )}
        <label className="field">
          <span>意思（中文）</span>
          <input value={eMeaning} onChange={(e) => setEMeaning(e.target.value)} placeholder="正確、對的" />
        </label>
        <label className="field">
          <span>詞性（可留空）</span>
          <select value={ePos} onChange={(e) => setEPos(e.target.value)}>
            <option value="">— 選擇 —</option>
            {POS_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="__custom__">其他（自行輸入）</option>
          </select>
        </label>
        {ePos === '__custom__' && (
          <label className="field">
            <span>自訂詞性</span>
            <input value={ePosCustom} onChange={(e) => setEPosCustom(e.target.value)} placeholder="例：形式名詞" />
          </label>
        )}
        <label className="field">
          <span>例句（日文・可留空）</span>
          <input className="jp" value={eJp} onChange={(e) => setEJp(e.target.value)} placeholder="毎朝パンを{食べ}ます。" />
        </label>
        <p className="hint muted">用 <code>{'{ }'}</code> 框住要挖空的部分（尤其動詞變化形）。</p>
        <label className="field">
          <span>例句翻譯（中文・可留空）</span>
          <input value={eTl} onChange={(e) => setETl(e.target.value)} placeholder="那個答案是正確的。" />
        </label>

        <div className="row">
          <button className="primary" disabled={!canSaveEdit} onClick={saveEdit}>儲存</button>
          <button className="secondary" onClick={() => setEditing(false)}>取消</button>
        </div>
      </div>
    )
  }

  // ── SINGLE-WORD REVIEW ────────────────────────────────────────────────
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

  // ── DETAIL VIEW ───────────────────────────────────────────────────────
  return (
    <div className="screen">
      <header className="screen-head">
        <button className="link" onClick={onBack}>← 返回</button>
        <div className="head-actions">
          <button className="link" onClick={startEdit}>編輯</button>
          <button className="link danger" onClick={del}>刪除</button>
        </div>
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
