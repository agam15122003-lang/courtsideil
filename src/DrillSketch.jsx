import { useRef, useEffect, useState } from 'react'

// לוח ציור חופשי לסרטוט תרגיל. שולח את התמונה (dataURL) ל-onChange.
export default function DrillSketch({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#1B2A4A'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pos = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    }
  }

  const start = (e) => {
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const draw = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    if (empty) setEmpty(false)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    if (onChange) onChange(empty ? null : canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    setEmpty(true)
    if (onChange) onChange(null)
  }

  return (
    <div className="field-group">
      <span className="field-label">סרטוט התרגיל (לא חובה)</span>
      <canvas
        ref={canvasRef}
        width={600}
        height={340}
        className="sketch-canvas"
        style={{ touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button
        type="button"
        className="btn-ghost"
        style={{ marginTop: 8, width: 'fit-content' }}
        onClick={clear}
      >
        נקה סרטוט
      </button>
    </div>
  )
}
