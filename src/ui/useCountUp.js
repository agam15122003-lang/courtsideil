// אנימציית count-up למספרים בדשבורד — מכבדת prefers-reduced-motion.
// שימוש: const shown = useCountUp(stats.drills)
import { useEffect, useRef, useState } from 'react'
import { motionOff } from './motion'

export default function useCountUp(target, { duration = 900, enabled = true } = {}) {
  const final = Number(target) || 0
  const [val, setVal] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (!enabled || reduced || motionOff() || final <= 0) {
      setVal(final)
      return
    }
    const t0 = performance.now()
    const ease = (t) => 1 - Math.pow(1 - t, 3) // ease-out-cubic
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      setVal(Math.round(final * ease(p)))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [final, duration, enabled])

  return val
}
