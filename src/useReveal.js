// useReveal — חושף מקטעים בגלילה, בדפוס שכבר עבד בדף הנחיתה
// (Landing.jsx:24-30 + index.css:6246), מוכלל לשימוש חוזר.
//
// שני עקרונות:
// 1. **מסתירים רק כשה-JS באמת רץ.** המחלקה `js-reveal` נוספת מתוך ה-effect,
//    ורק אז `.reveal-up` מתחיל שקוף. אם ה-observer לא נתמך או ה-JS נכשל —
//    התוכן פשוט נראה. אף פעם לא מסך ריק בגלל אפקט.
// 2. **תואם להיררכיית התנועה של שלב א'.** המקטע רק מתעמעם; הכרטיסים שבתוכו
//    הם שזזים, עם ה-stagger הקיים שלהם. `animation-play-state` מחזיק את
//    card-enter עצור עד שהמקטע נכנס למסך, כך שהאנימציה לא "מתבזבזת" על
//    תוכן שנמצא מתחת לקו הקיפול.

import { useEffect } from 'react'
import { motionOff } from './anim'

export default function useReveal(rootRef, deps = []) {
  useEffect(() => {
    // חוזה DESIGN.md §3 — כיבוי כפול. לא מאתחלים observer בכלל.
    if (motionOff() || typeof IntersectionObserver === 'undefined') return
    const root = rootRef.current
    if (!root) return
    const els = root.querySelectorAll('.reveal-up:not(.is-in)')
    if (!els.length) return

    root.classList.add('js-reveal')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target) // חד-פעמי: גלילה חזרה למעלה לא מנפישה שוב
        }
      },
      // -8% מלמטה כדי שהחשיפה תתחיל כשהמקטע באמת נכנס, לא ברגע שקצהו נגע
      { rootMargin: '0px 0px -8% 0px', threshold: 0.04 }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
