import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { queueCounts, familiarityStats, type QueueCounts, type FamiliarityStats } from '../lib/queue'

const TIERS: { key: keyof FamiliarityStats; label: string; color: string }[] = [
  { key: 'veryFamiliar', label: '非常熟悉', color: 'var(--good)' },
  { key: 'mature', label: '熟悉', color: 'var(--accent-2)' },
  { key: 'young', label: '複習中', color: 'var(--easy)' },
  { key: 'learning', label: '學習中', color: 'var(--hard)' },
  { key: 'isNew', label: '未學習', color: 'var(--muted)' }
]

export function HomeScreen({
  onReview,
  onAdd
}: {
  onReview: () => void
  onAdd: () => void
}) {
  const [counts, setCounts] = useState<QueueCounts>({ due: 0, fresh: 0 })
  const [stats, setStats] = useState<FamiliarityStats | null>(null)

  useEffect(() => {
    queueCounts().then(setCounts)
    familiarityStats().then(setStats)
  }, [])

  const nothing = counts.due === 0 && counts.fresh === 0
  const total = stats?.total ?? 0

  return (
    <div className="screen center home">
      <h1>單字複習</h1>

      <div className="counts">
        <div className="count">
          <span className="n">{counts.due}</span>
          <span className="l muted">待複習</span>
        </div>
        <div className="count">
          <span className="n">{counts.fresh}</span>
          <span className="l muted">新單字</span>
        </div>
      </div>

      <button className="primary wide" disabled={nothing} onClick={onReview}>
        {nothing ? '今天都複習完了 🎉' : '開始複習'}
      </button>
      <button className="secondary wide" onClick={onAdd}>
        ＋ 新增單字
      </button>

      {/* Familiarity breakdown */}
      {stats && total > 0 && (
        <div className="fam">
          <div className="fam-head">
            <span className="fam-title muted">熟悉度分佈</span>
            <span className="fam-total">共 {total} 個</span>
          </div>
          <div className="fam-bar">
            {TIERS.map((t) =>
              stats[t.key] > 0 ? (
                <div
                  key={t.key}
                  className="fam-seg"
                  style={{ flex: stats[t.key], background: t.color }}
                  title={`${t.label}: ${stats[t.key]}`}
                />
              ) : null
            )}
          </div>
          <ul className="fam-legend">
            {TIERS.map((t) => (
              <li key={t.key}>
                <span className="dot" style={{ background: t.color }} />
                <span className="fam-label">{t.label}</span>
                <span className="fam-count">{stats[t.key]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted total">單字總數：{total}</p>
    </div>
  )
}
