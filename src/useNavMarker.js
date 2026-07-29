// useNavMarker — הפס הכתום שמסמן את הפריט הפעיל בסיידבר, גולש במקום לקפוץ.
//
// עד היום הסימון היה `::before` על הפריט הפעיל עצמו (index.css:2059, 6380):
// בכל החלפת מסך הוא נעלם בפריט אחד ומופיע באחר — קפיצה, לא מעבר.
// כאן יש פס **אחד** שמוזז ב-transform לגובה הפריט הפעיל.
//
// המיקום נמדד מה-DOM (offsetTop/offsetHeight) ולא מחושב מ-index כפול גובה:
// חישוב כזה נשבר ברגע שמישהו משנה padding, gap או גודל גופן, ובלי טסטים
// אוטומטיים אף אחד לא היה תופס את זה.

import { useLayoutEffect, useRef, useState } from 'react'

export default function useNavMarker(key) {
  const ref = useRef(null)
  const [box, setBox] = useState(null)

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector('.nav-item.active')
      setBox(el ? { y: el.offsetTop, h: el.offsetHeight } : null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [key])

  return [ref, box]
}
