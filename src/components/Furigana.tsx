import type { Segment } from '../lib/types'

// Renders furigana-aligned text: each kanji segment gets its reading floating
// exactly above it via <ruby>, kana segments sit on the baseline.
export function Furigana({ segments, size = 32 }: { segments: Segment[]; size?: number }) {
  return (
    <span className="furigana" style={{ fontSize: size }}>
      {segments.map((seg, i) =>
        seg.rt ? (
          <ruby key={i}>
            {seg.base}
            <rt>{seg.rt}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.base}</span>
        )
      )}
    </span>
  )
}
