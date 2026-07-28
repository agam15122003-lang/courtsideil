// שכבת עזר ל-GSAP — מקום אחד שיודע (א) מתי אסור להנפיש בכלל, (ב) איך לקרוא
// את טוקני משך הזמן של index.css, (ג) איך לטעון את gsap בעצלתיים.
//
// חוזה DESIGN.md §3 — כיבוי כפול: prefers-reduced-motion **וגם** html.a11y-motion.
// ב-JS זה אומר לא לאתחל את ה-timeline בכלל; `transition-duration: 0.001ms`
// של הכלל הגלובלי לא עוצר timeline של GSAP.
//
// חלוקת התפקידים (PLAN.md): GSAP הוא ציר-זמן מתוזמן ו-SVG בלבד. לא hover,
// לא כניסות כרטיסים — אלה נשארים ב-CSS.

// המקבילה בזמן ריצה ל---ease-out שב-index.css
// (cubic-bezier(0.22, 1, 0.36, 1) = ease-out-quint ≈ power4.out)
export const EASE_OUT = 'power4.out'

export function motionOff() {
  if (typeof window === 'undefined') return true
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true
  return document.documentElement.classList.contains('a11y-motion')
}

// טוקן משך מ-index.css → שניות (GSAP עובד בשניות). כדי שלא יהיה ms קשיח בקוד.
const durCache = new Map()
export function dur(token, fallbackSeconds) {
  const hit = durCache.get(token)
  if (hit !== undefined) return hit
  let s = NaN
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    if (raw.endsWith('ms')) s = parseFloat(raw) / 1000
    else if (raw.endsWith('s')) s = parseFloat(raw)
  } catch {
    // getComputedStyle לא זמין — נופלים לברירת המחדל
  }
  if (!Number.isFinite(s) || s <= 0) return fallbackSeconds
  durCache.set(token, s)
  return s
}

// gsap + DrawSVGPlugin נטענים פעם אחת, בעצלתיים: ~70KB שלא נכנסים ל-bundle
// הראשי ולא נטענים בכלל כשהמשתמש ביקש פחות תנועה.
let gsapPromise = null
export function loadGsap() {
  if (!gsapPromise) {
    gsapPromise = Promise.all([import('gsap'), import('gsap/DrawSVGPlugin')])
      .then(([core, draw]) => {
        const gsap = core.gsap || core.default
        const DrawSVGPlugin = draw.DrawSVGPlugin || draw.default
        gsap.registerPlugin(DrawSVGPlugin)
        return gsap
      })
      .catch(() => null) // כשל טעינה = בלי אנימציה, לא מסך שבור
  }
  return gsapPromise
}

// ===== ציור הדרגתי של חצים =====
// חץ ישר (תנועה/מסירה) מצויר בהארכת נקודת הסיום, ולא ב-DrawSVG:
// חץ מסירה הוא מקווקו (strokeDasharray), ו-DrawSVG דורס בדיוק את התכונה הזו —
// התוצאה הייתה החלקת המקפים במקום קו שנמתח. הארכת x2/y2 שומרת על המקפים,
// ובנוסף ראש החץ (markerEnd) נגרר עם הקצה בחינם.
// חץ זריקה לסל הוא קשת (path) — שם DrawSVG הוא הכלי הנכון, וראש החץ מוסתר
// עד סוף הציור כדי שלא ירחף על קו חלקי.

export const STRAIGHT = '[data-draw="line"]'
export const CURVED = '[data-draw="arc"]'

// מצב פתיחה — מוחל סינכרונית (useLayoutEffect) כדי שלא יהיה הבזק של חצים
// מצוירים במלואם בזמן שה-import של gsap עוד בדרך.
export function resetArrowDraw(host) {
  if (!host) return
  host.querySelectorAll(STRAIGHT).forEach((el) => {
    el.setAttribute('x2', el.getAttribute('x1'))
    el.setAttribute('y2', el.getAttribute('y1'))
    // קו באורך אפס עדיין מצייר את ראש החץ שלו — בלי opacity 0 היה ראש חץ
    // בודד מרחף על המגרש לאורך ההשהיה שלפני התור של החץ הזה.
    el.style.opacity = '0'
  })
  host.querySelectorAll(CURVED).forEach((el) => {
    el.style.opacity = '0'
    el.style.markerEnd = 'none'
  })
}

// מנקה כל מה ש-resetArrowDraw/GSAP הותירו — חוזרים לחצים מלאים וסטטיים.
// (נגישות, כשל טעינה, פירוק הרכיב, הדפסה באמצע אנימציה)
//
// עובר על geom ולא על ה-DOM בכוונה: כשמחליפים שלב, React כבר החליף את החצים
// לפני שה-cleanup של השלב הקודם רץ. מעבר על ה-DOM היה מנקה את מצב הפתיחה
// של השלב **החדש** שזה עתה הוחל.
export function clearArrowDraw(host, geom) {
  if (!host || !geom) return
  geom.forEach((a, id) => {
    const el = host.querySelector(`[data-arrow-id="${id}"]`)
    if (!el) return
    if (el.dataset.draw === 'line') {
      el.setAttribute('x2', a.x2)
      el.setAttribute('y2', a.y2)
    }
    el.style.removeProperty('opacity')
    el.style.removeProperty('marker-end')
    el.style.removeProperty('stroke-dasharray')
    el.style.removeProperty('stroke-dashoffset')
  })
}

// בונה timeline מושהה שמצייר את כל החצים שבתוך host, בהשהיה מדורגת.
// מוחזר paused — מי שקורא אחראי להריץ (`play()`) או לגרור (`progress()`).
export function buildArrowDraw(gsap, host, geom, { each, stagger, shotMarker }) {
  const tl = gsap.timeline({ paused: true })
  const straights = [...host.querySelectorAll(STRAIGHT)]
  const curves = [...host.querySelectorAll(CURVED)]
  const order = [...straights, ...curves]

  straights.forEach((el) => {
    const a = geom.get(el.dataset.arrowId)
    if (!a) return
    const at = order.indexOf(el) * stagger
    // opacity נדלק בדיוק כשהתור של החץ הזה מגיע, לא לפני
    tl.set(el, { opacity: 1 }, at)
    tl.to(el, { attr: { x2: a.x2, y2: a.y2 }, duration: each, ease: EASE_OUT }, at)
  })

  curves.forEach((el) => {
    const at = order.indexOf(el) * stagger
    tl.fromTo(
      el,
      { drawSVG: '0%', opacity: 1 },
      { drawSVG: '100%', duration: each, ease: EASE_OUT },
      at
    )
    // ראש החץ מופיע רק כשהקשת הגיעה ליעד
    tl.set(el, { markerEnd: `url(#${shotMarker})` }, at + each * 0.9)
  })

  return tl
}
