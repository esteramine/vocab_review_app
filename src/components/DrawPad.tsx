import { useRef, useEffect, useState } from 'react'

// A finger/mouse drawing pad. No recognition — the user draws, then reveals
// the answer and self-grades. Supports undo (per stroke) and clear.
//
// `readOnly` keeps the strokes on screen but disables drawing and hides the
// controls — used AFTER reveal so you can compare your writing to the answer.
// The component stays mounted across reveal (parent must not unmount it), so
// the strokes survive; only the height + readOnly flag change.
//
// Strokes are stored in the coordinate space of the height they were drawn at
// (`drawHeight`). On redraw we scale them to the CURRENT height, so shrinking
// the pad on reveal fits the whole drawing instead of clipping the bottom.
export function DrawPad({
  height = 220,
  readOnly = false
}: {
  height?: number
  readOnly?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<{ x: number; y: number }[][]>([])
  const drawHeight = useRef(height) // height (px) the strokes were captured at
  const drawing = useRef(false)
  const [, force] = useState(0)

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width / (window.devicePixelRatio || 1)
    const h = canvas.height / (window.devicePixelRatio || 1)
    ctx.clearRect(0, 0, w, h)
    // guide lines (center cross)
    ctx.strokeStyle = 'rgba(180,160,150,0.30)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
    // ink — dark so it shows on the light cream/white pad.
    // Scale strokes from the height they were drawn at to the current height,
    // so a shrunk read-only pad shows the whole drawing, not a clipped top.
    const scale = h / drawHeight.current
    ctx.strokeStyle = '#3a2f2a'
    ctx.lineWidth = 6 * scale
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // Center the scaled drawing in the pad. Anchoring at the origin leaves the
    // ink in the upper-left (width stays full while height shrinks), so
    // measure the scaled bounding box and offset it to the middle.
    let offX = 0
    let offY = 0
    if (scale !== 1 && strokes.current.length) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      strokes.current.forEach((stroke) =>
        stroke.forEach((p) => {
          const x = p.x * scale
          const y = p.y * scale
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        })
      )
      offX = (w - (maxX - minX)) / 2 - minX
      offY = (h - (maxY - minY)) / 2 - minY
    }

    strokes.current.forEach((stroke) => {
      ctx.beginPath()
      stroke.forEach((p, i) => {
        const x = p.x * scale + offX
        const y = p.y * scale + offY
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
    })
  }

  // Re-fit the backing store to the current CSS size whenever the height
  // changes (e.g. shrinking on reveal), preserving + rescaling the strokes.
  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const down = (e: React.PointerEvent) => {
    if (readOnly) return
    drawHeight.current = height // capture at the live (full) height
    drawing.current = true
    strokes.current.push([pos(e)])
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (readOnly || !drawing.current) return
    strokes.current[strokes.current.length - 1].push(pos(e))
    redraw()
  }
  const up = () => {
    drawing.current = false
  }

  return (
    <div className="drawpad">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, touchAction: 'none' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      {!readOnly && (
        <div className="drawpad-controls">
          <button
            type="button"
            onClick={() => {
              strokes.current.pop()
              redraw()
              force((n) => n + 1)
            }}
          >
            復原
          </button>
          <button
            type="button"
            onClick={() => {
              strokes.current = []
              redraw()
              force((n) => n + 1)
            }}
          >
            清除
          </button>
        </div>
      )}
    </div>
  )
}
