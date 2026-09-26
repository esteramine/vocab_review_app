import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { Furigana } from '../components/Furigana'
import { WordDetailScreen } from './WordDetailScreen'
import type { Word } from '../lib/types'

export function WordListScreen() {
  const [words, setWords] = useState<Word[]>([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  const load = () => {
    db.words.orderBy('addedDate').reverse().toArray().then(setWords)
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return words
    return words.filter(
      (w) =>
        w.reading.toLowerCase().includes(s) ||
        w.meaning.toLowerCase().includes(s) ||
        w.segments.map((seg) => seg.base).join('').toLowerCase().includes(s)
    )
  }, [words, q])

  // When a word is open, show its detail; on back, reload the list (counts,
  // deletions, review state may have changed).
  if (selected != null) {
    return (
      <WordDetailScreen
        wordId={selected}
        onBack={() => {
          setSelected(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h2>單字列表</h2>
        <span className="muted">{words.length}</span>
      </header>

      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜尋（漢字／讀音／意思）"
      />

      {filtered.length === 0 ? (
        <p className="muted center-text">{words.length === 0 ? '還沒有單字，去「新增」或「資料」匯入吧。' : '找不到符合的單字'}</p>
      ) : (
        <ul className="wordlist">
          {filtered.map((w) => (
            <li key={w.id} className="wordrow" onClick={() => setSelected(w.id!)}>
              <div className="wordrow-main">
                <Furigana segments={w.segments} size={24} />
                <span className="wordrow-meaning muted">
                  {w.partOfSpeech && <span className="pos-tag">{w.partOfSpeech}</span>}
                  {w.meaning}
                </span>
              </div>
              <span className="chev muted">›</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
