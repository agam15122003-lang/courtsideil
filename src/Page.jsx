// Page — הבאנר הנייבי והגלולה, כדפוס אחיד לכל מסך באפליקציה.
//
// מקור האמת: design_handoff_auth (29.7.2026) — אותה שפה של מסכי הכניסה,
// רק בתוך מעטפת ה-Dashboard. אותם טוקנים, אותו eyebrow זהוב על נייבי,
// אותה גלולה ברדיוס 28 שעולה 26px מעל הבאנר.
//
//   eyebrow זהוב (Heebo 800 11px, letter-spacing .16em)
//   כותרת H1 לבנה (Heebo 900)
//   תת-כותרת בלבן 74%
//   [ שורת פעולות ]
//   ---------------------------------  ← גבול הבאנר
//   הגלולה עם תוכן המסך
//
// `overlap` הוא כרטיס שיושב על התפר בין הבאנר לגלולה.

import { useEffect, useRef, useState } from 'react'
import CourtArt from './CourtArt'
import { motionOff } from './anim'

export default function Page({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  subtitle,
  actions,
  overlap,
  variant = 'page',
  size = 'md',        // 'sm' · 'md' · 'lg'
  bar = true,         // רצועה דביקה אחרי שהבאנר נגלל
  children,
}) {
  const sentinel = useRef(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    if (!bar) return
    const el = sentinel.current
    if (!el) return
    // IntersectionObserver ולא מאזין scroll: אפס עבודה בכל פריים גלילה
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [bar])

  return (
    <div className="cs-page">
      <header className={`cs-hero cs-hero--${size}`}>
        <span className="cs-hero-art" aria-hidden="true">
          <CourtArt variant={variant} />
        </span>
        <span className="cs-hero-veil" aria-hidden="true" />
        <div className="cs-hero-body">
          {eyebrow && (
            <span className="cs-hero-eyebrow">
              {EyebrowIcon && <EyebrowIcon size={13} aria-hidden="true" />}
              {eyebrow}
            </span>
          )}
          <h1 className="cs-hero-title">{title}</h1>
          {subtitle && <p className="cs-hero-sub">{subtitle}</p>}
          {actions && <div className="cs-hero-acts">{actions}</div>}
        </div>
      </header>

      {/* נקודת המדידה לרצועה — גובה אפס, לא משפיעה על הלייאאוט */}
      <span ref={sentinel} className="cs-hero-sentinel" aria-hidden="true" />

      {bar && (
        <div
          className="cs-hero-bar"
          data-show={stuck ? 'true' : 'false'}
          data-still={motionOff() ? 'true' : 'false'}
          aria-hidden={stuck ? undefined : 'true'}
        >
          <b>{title}</b>
        </div>
      )}

      {overlap && <div className="cs-overlap">{overlap}</div>}

      <div className={overlap ? 'cs-sheet cs-sheet--overlapped' : 'cs-sheet'}>{children}</div>
    </div>
  )
}
