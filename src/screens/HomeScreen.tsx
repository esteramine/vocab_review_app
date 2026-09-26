import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { queueCounts, type QueueCounts } from '../lib/queue'

export function HomeScreen({
  onReview,
  onAdd
}: {
  onReview: () => void
  onAdd: () => void
}) {
  const [counts, setCounts] = useState<QueueCounts>({ due: 0, fresh: 0 })
  const [total, setTotal] = useState(0)

  useEffect(() => {
    queueCounts().then(setCounts)
    db.words.count().then(setTotal)
  }, [])

  const nothing = counts.due === 0 && counts.fresh === 0

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

      <p className="muted total">單字總數：{total}</p>
    </div>
  )
}
