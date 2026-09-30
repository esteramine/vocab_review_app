import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/db'
import { Furigana } from '../components/Furigana'
import { WordDetailScreen } from './WordDetailScreen'
import { cardTier, TIER_META, type Tier } from '../lib/queue'
import type { Word } from '../lib/types'

const REVEAL = 84 // px the row slides left to expose the delete button

// One swipeable list row. Swiping left reveals a 刪除 button (does NOT delete);
// tapping that button asks to confirm before deleting. Tapping the row body
// (when closed) opens the detail view.
function WordRow({
  word,
  tier,
  open,
  onOpenSwipe,
  onCloseSwipe,
  onOpenDetail,
  onDelete
}: {
  word: Word
  tier: Tier | undefined
  open: boolean
  onOpenSwipe: () => void
  onCloseSwipe: () => void
  onOpenDetail: () => void
  onDelete: () => void
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const dragging = useRef(false)
  const moved = useRef(false)
  const [dx, setDx] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // While dragging, follow the finger (dx). When settled, reflect open state.
  const offset = isDragging ? dx : open ? -REVEAL : 0

  const down = (e: React.PointerEvent) => {
    startX.current = e.clientX
    startY.current = e.clientY
    dragging.current = true
    moved.current = false
    // Seed dx from the current resting position so the drag continues from here.
    setDx(open ? -REVEAL : 0)
    setIsDragging(true)
  }
  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const deltaX = e.clientX - startX.current
    const deltaY = e.clientY - startY.current
    // Ignore mostly-vertical gestures (let the list scroll).
    if (Math.abs(deltaY) > Math.abs(deltaX)) return
    if (Math.abs(deltaX) > 6) moved.current = true
    // Continue from the resting base; clamp between fully-closed and fully-open.
    const base = open ? -REVEAL : 0
    const next = Math.min(0, Math.max(-REVEAL, base + deltaX))
    setDx(next)
  }
  const up = () => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    // Snap based on where the drag ended: past the halfway point → open, else closed.
    if (dx < -REVEAL / 2) onOpenSwipe()
    else onCloseSwipe()
  }

  const clickBody = () => {
    // A swipe shouldn't count as a tap; and if the row is open, a tap closes it.
    if (moved.current) return
    if (open) {
      onCloseSwipe()
      return
    }
    onOpenDetail()
  }

  return (
    <li className="swipe-wrap">
      <button className="swipe-delete" onClick={onDelete} aria-label="刪除">
        刪除
      </button>
      <div
        className="wordrow swipeable"
        style={{ transform: `translateX(${offset}px)`, transition: isDragging ? 'none' : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={clickBody}
      >
        {tier && (
          <span
            className="tier-dot"
            style={{ background: TIER_META[tier].color }}
            title={TIER_META[tier].label}
            aria-label={TIER_META[tier].label}
          />
        )}
        <div className="wordrow-main">
          <Furigana segments={word.segments} size={24} />
          <span className="wordrow-meaning muted">
            {word.partOfSpeech && <span className="pos-tag">{word.partOfSpeech}</span>}
            {word.meaning}
          </span>
        </div>
        <span className="chev muted">›</span>
      </div>
    </li>
  )
}

export function WordListScreen() {
  const [words, setWords] = useState<Word[]>([])
  const [tiers, setTiers] = useState<Map<number, Tier>>(new Map())
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [openId, setOpenId] = useState<number | null>(null) // row with delete revealed
  const [sort, setSort] = useState<'added' | 'reading' | 'familiar'>('added')
  const [famDir, setFamDir] = useState<'desc' | 'asc'>('desc') // familiar sort direction

  const load = () => {
    db.words.orderBy('addedDate').reverse().toArray().then(setWords)
    // Build a wordId → familiarity tier map from the cards.
    db.cards.toArray().then((cards) => {
      const m = new Map<number, Tier>()
      for (const c of cards) m.set(c.wordId, cardTier(c))
      setTiers(m)
    })
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = !s
      ? words
      : words.filter(
          (w) =>
            w.reading.toLowerCase().includes(s) ||
            w.meaning.toLowerCase().includes(s) ||
            w.segments.map((seg) => seg.base).join('').toLowerCase().includes(s)
        )
    if (sort === 'reading') {
      // 五十音 order by kana reading (あいうえお…). Japanese locale sorts kana
      // correctly; copy first so we don't mutate the source array.
      return [...base].sort((a, b) => a.reading.localeCompare(b.reading, 'ja'))
    }
    if (sort === 'familiar') {
      // Sort by familiarity rank; direction toggles via famDir. desc = most
      // familiar first (非常熟悉 → 未學習), asc = least first. Tie-break by
      // reading. A word with no card yet ranks as 未學習 (rank 0).
      const rank = (w: Word) => {
        const t = w.id != null ? tiers.get(w.id) : undefined
        return t ? TIER_META[t].rank : 0
      }
      const dir = famDir === 'desc' ? 1 : -1
      return [...base].sort(
        (a, b) => dir * (rank(b) - rank(a)) || a.reading.localeCompare(b.reading, 'ja')
      )
    }
    return base // 'added' — words already come newest-first from the DB
  }, [words, q, sort, famDir, tiers])

  const remove = async (w: Word) => {
    // Confirm step — swipe only REVEALS the button; deletion still asks first.
    if (!confirm(`確定刪除「${w.reading}」？此動作無法復原。`)) return
    const id = w.id!
    await db.words.delete(id)
    const card = await db.cards.where('wordId').equals(id).first()
    if (card?.id != null) await db.cards.delete(card.id)
    await db.logs.where('wordId').equals(id).delete()
    setOpenId(null)
    load()
  }

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
      <div className="list-sticky">
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

        <div className="sort-toggle">
          <button
            className={sort === 'added' ? 'on' : ''}
            onClick={() => setSort('added')}
          >
            新增順
          </button>
          <button
            className={sort === 'reading' ? 'on' : ''}
            onClick={() => setSort('reading')}
          >
            讀音順（あいうえお）
          </button>
          <button
            className={sort === 'familiar' ? 'on' : ''}
            onClick={() =>
              sort === 'familiar'
                ? setFamDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                : setSort('familiar')
            }
          >
            熟悉度 {sort === 'familiar' ? (famDir === 'desc' ? '▼' : '▲') : ''}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted center-text">
          {words.length === 0 ? '還沒有單字，去「新增」或「資料」匯入吧。' : '找不到符合的單字'}
        </p>
      ) : (
        <>
          <p className="hint muted">← 向左滑可刪除</p>
          <ul className="wordlist">
            {filtered.map((w) => (
              <WordRow
                key={w.id}
                word={w}
                tier={w.id != null ? tiers.get(w.id) : undefined}
                open={openId === w.id}
                onOpenSwipe={() => setOpenId(w.id!)}
                onCloseSwipe={() => setOpenId((cur) => (cur === w.id ? null : cur))}
                onOpenDetail={() => setSelected(w.id!)}
                onDelete={() => remove(w)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
