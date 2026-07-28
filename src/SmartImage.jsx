// SmartImage — תמונה מהמאגר שנבנה ב-`npm run images` (scripts/fetch-images.mjs).
//
// שלוש הבטחות:
// 1. **אפס קפיצת layout** — המקום נשמר מראש מיחס הרוחב-גובה האמיתי של הקובץ.
// 2. **placeholder מטושטש בלי בקשת רשת** — ה-LQIP הוא data-URI של 24px שיושב
//    כבר ב-JSON, ולכן הוא על המסך בפריים הראשון ולא אחרי round-trip.
// 3. **קרדיט** — שם הצלם מופיע בריחוף; הרישיון והקישור שמורים ב-JSON.
//    (cc0/pdm אינם מחייבים ייחוס, by כן — ולכן הוא מוצג תמיד.)

import { useEffect, useRef, useState } from 'react'
import IMAGES from './data/images.json'
import { motionOff } from './anim'
import { L } from './i18n'

const HOLD_MS = 7000 // כל כמה זמן ההירו מתחלף — תואם ל-QuoteStrip הקיים

// בחירה אקראית של `count` פריטים **שונים** מהקטגוריה.
export function pickImages(category, count = 1) {
  const pool = IMAGES[category] || []
  if (!pool.length) return []
  const bag = [...pool]
  const out = []
  while (out.length < Math.min(count, bag.length)) {
    out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0])
  }
  return out
}

// שכבת ה-<img> עצמה. מופרדת כדי שגם התמונה הבודדת וגם המחליף ישתמשו בה.
function Layer({ pic, priority, sizes, active }) {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef(null)

  // תמונה שהגיעה מה-cache עשויה להיות complete עוד לפני שה-onLoad נקשר —
  // בלי הבדיקה הזאת היא הייתה נתקעת על ה-LQIP המטושטש לנצח.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true)
  }, [])

  return (
    <img
      ref={ref}
      className="si-img"
      src={pic.src}
      srcSet={`${pic.srcSmall} ${pic.wSmall}w, ${pic.src} ${pic.w}w`}
      sizes={sizes}
      width={pic.w}
      height={pic.h}
      alt={pic.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={priority ? 'high' : undefined}
      data-loaded={loaded ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      onLoad={() => setLoaded(true)}
      // כשל טעינה: מסירים את ההסתרה כדי שה-alt ייקרא, ולא נשארים עם ריבוע מטושטש
      onError={() => setLoaded(true)}
    />
  )
}

function Credit({ pic }) {
  if (!pic.creator) return null
  return (
    <span className="si-credit">
      {L('צילום', 'Photo')}: {pic.creator}
    </span>
  )
}

// תמונה בודדת. `ratio` שומר את המקום; `fill` למי שממלא הורה ממוקם.
export default function SmartImage({
  category,
  image,
  className = '',
  ratio,
  fill = false,
  priority = false,
  scrim = false,
  sizes = '(max-width: 900px) 100vw, 420px',
}) {
  // ההגרלה חייבת לקרות פעם אחת ב-mount ולא בכל render — אחרת התמונה
  // מתחלפת בכל setState של ההורה.
  const [pic] = useState(() => image || pickImages(category, 1)[0] || null)
  if (!pic) return null

  const style = fill ? undefined : { aspectRatio: ratio || `${pic.w} / ${pic.h}` }
  return (
    <span
      className={`si${fill ? ' si-fill' : ''}${scrim ? ' si-scrim' : ''} ${className}`.trim()}
      style={{ ...style, backgroundImage: `url("${pic.lqip}")` }}
    >
      <Layer pic={pic} priority={priority} sizes={sizes} active />
      <Credit pic={pic} />
    </span>
  )
}

// מחליף תמונות ב-crossfade. כל השכבות ב-DOM מההתחלה כדי שההחלפה לא תמתין
// לרשת; רק ה-opacity זז.
//
// תחת motionOff() אין החלפה בכלל — לא רק שה-crossfade כבוי, גם הטיימר לא
// נדלק. "prefers-reduced-motion מבטל הכל" כולל תוכן שמתחלף מעצמו.
export function SmartImageRotator({
  category,
  count = 3,
  className = '',
  sizes = '100vw',
  onTick,
}) {
  const [pics] = useState(() => pickImages(category, count))
  const [i, setI] = useState(0)
  const tickRef = useRef(onTick)
  tickRef.current = onTick

  useEffect(() => {
    if (pics.length < 2 || motionOff()) return
    const t = setInterval(() => {
      setI((n) => {
        const next = (n + 1) % pics.length
        tickRef.current?.(next)
        return next
      })
    }, HOLD_MS)
    return () => clearInterval(t)
  }, [pics.length])

  if (!pics.length) return null
  return (
    <span className={`si si-fill si-rotator ${className}`.trim()}>
      {pics.map((p, n) => (
        <Layer key={p.id} pic={p} priority={n === 0} sizes={sizes} active={n === i} />
      ))}
      <Credit pic={pics[i]} />
    </span>
  )
}

// שורת הקרדיט הכללית. cc0/pdm/by — הייחוס לצלם על התמונה, והמקור כאן.
export function ImageCredit() {
  return (
    <p className="si-source">
      {L('תמונות', 'Images')}:{' '}
      <a href="https://openverse.org" target="_blank" rel="noopener noreferrer">
        Openverse
      </a>{' '}
      · CC0 / PDM / CC BY
    </p>
  )
}
