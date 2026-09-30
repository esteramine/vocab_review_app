import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { newCard } from '../lib/srs'
import { autoSegments } from '../lib/furigana'
import { resolveBlank } from '../lib/blank'
import { isDuplicate } from '../lib/io'
import { Furigana } from '../components/Furigana'
import { POS_OPTIONS, type Example, type Segment } from '../lib/types'

export function AddScreen({ onDone }: { onDone: () => void }) {
  const [word, setWord] = useState('')
  const [reading, setReading] = useState('')
  const [meaning, setMeaning] = useState('')
  const [pos, setPos] = useState('')
  const [posCustom, setPosCustom] = useState('')
  const [exampleJp, setExampleJp] = useState('')
  const [exampleTl, setExampleTl] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [isDup, setIsDup] = useState(false)

  // Live segment preview
  const segments: Segment[] = word && reading ? autoSegments(word, reading) : []

  // Warn (don't block) if this word+reading already exists in the deck.
  useEffect(() => {
    let alive = true
    if (!word.trim() || !reading.trim()) {
      setIsDup(false)
      return
    }
    isDuplicate(word.trim(), reading.trim()).then((d) => {
      if (alive) setIsDup(d)
    })
    return () => {
      alive = false
    }
  }, [word, reading])

  const reset = () => {
    setWord('')
    setReading('')
    setMeaning('')
    setPos('')
    setPosCustom('')
    setExampleJp('')
    setExampleTl('')
  }

  const canSave = word.trim() && reading.trim() && meaning.trim()

  // '__custom__' lets you type a POS not in the list.
  const resolvedPos = (pos === '__custom__' ? posCustom.trim() : pos).trim() || undefined

  const save = async () => {
    if (!canSave) return
    // Compute cloze blank offsets. resolveBlank handles the {…} marker, exact
    // match, and a stem fallback for conjugated verbs/adjectives.
    const examples: Example[] = []
    if (exampleJp.trim()) {
      const { jp, blankStart, blankEnd } = resolveBlank(exampleJp, word.trim())
      examples.push({
        jp,
        translation: exampleTl.trim() || undefined,
        blankStart,
        blankEnd
      })
    }
    const wordId = await db.words.add({
      segments,
      reading: reading.trim().replace(/\s+/g, ''),
      meaning: meaning.trim(),
      partOfSpeech: resolvedPos,
      examples,
      addedDate: new Date().toISOString()
    })
    await db.cards.add(newCard(wordId as number))
    setSavedCount((n) => n + 1)
    reset()
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="link" onClick={onDone}>← 返回</button>
        <h2>新增單字</h2>
        <span className="muted">已新增 {savedCount}</span>
      </header>

      <label className="field">
        <span>單字（漢字）</span>
        <input className="jp" value={word} onChange={(e) => setWord(e.target.value)} placeholder="正しい" autoFocus />
      </label>

      <label className="field">
        <span>讀音（假名）</span>
        <input className="jp" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="ただしい（多漢字可用空格分開，如 き れい）" />
      </label>

      {segments.length > 0 && (
        <div className="preview">
          <span className="muted">預覽：</span>
          <Furigana segments={segments} size={30} />
          <p className="hint muted">
            若假名標註不正確，請調整讀音（多個漢字有時無法自動分割）
          </p>
        </div>
      )}

      {isDup && (
        <p className="banner warn-banner">⚠ 單字庫已有相同單字（{word.trim()}／{reading.trim().replace(/\s+/g, '')}），仍可儲存。</p>
      )}

      <label className="field">
        <span>意思（中文）</span>
        <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="正確、對的" />
      </label>

      <label className="field">
        <span>詞性（可留空）</span>
        <select value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">— 選擇 —</option>
          {POS_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value="__custom__">其他（自行輸入）</option>
        </select>
      </label>
      {pos === '__custom__' && (
        <label className="field">
          <span>自訂詞性</span>
          <input value={posCustom} onChange={(e) => setPosCustom(e.target.value)} placeholder="例：形式名詞" />
        </label>
      )}

      <label className="field">
        <span>例句（日文・可留空）</span>
        <input className="jp" value={exampleJp} onChange={(e) => setExampleJp(e.target.value)} placeholder="毎朝パンを{食べ}ます。" />
      </label>
      <p className="hint muted">
        提示：用 <code>{'{ }'}</code> 框住要挖空的部分（尤其是動詞變化形），例如 <span className="jp">毎朝パンを{'{食べ}'}ます。</span> 未標註時會自動尋找。
      </p>

      <label className="field">
        <span>例句翻譯（中文・可留空）</span>
        <input value={exampleTl} onChange={(e) => setExampleTl(e.target.value)} placeholder="那個答案是正確的。" />
      </label>

      <div className="row">
        <button className="primary" disabled={!canSave} onClick={save}>
          儲存並繼續
        </button>
        <button className="secondary" onClick={onDone}>
          完成
        </button>
      </div>
    </div>
  )
}
