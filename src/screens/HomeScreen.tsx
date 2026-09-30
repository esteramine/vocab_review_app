import { useEffect, useState } from 'react'
import {
  queueCounts,
  familiarityStats,
  TIER_META,
  type QueueCounts,
  type FamiliarityStats,
  type Tier
} from '../lib/queue'
// Home breakdown order: most → least familiar.
const TIER_ORDER: Tier[] = ['veryFamiliar', 'mature', 'young', 'learning', 'isNew']

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
            {TIER_ORDER.map((key) =>
              stats[key] > 0 ? (
                <div
                  key={key}
                  className="fam-seg"
                  style={{ flex: stats[key], background: TIER_META[key].color }}
                  title={`${TIER_META[key].label}: ${stats[key]}`}
                />
              ) : null
            )}
          </div>
          <ul className="fam-legend">
            {TIER_ORDER.map((key) => (
              <li key={key}>
                <span className="dot" style={{ background: TIER_META[key].color }} />
                <span className="fam-label">{TIER_META[key].label}</span>
                <span className="fam-count">{stats[key]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted total">單字總數：{total}</p>
    </div>
  )
}
