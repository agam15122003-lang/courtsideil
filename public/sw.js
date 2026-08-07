/* CourtSide service worker — התקנה כאפליקציה + טעינה מהירה.
   אסטרטגיה: נכסים סטטיים (JS/CSS/פונטים/תמונות) — stale-while-revalidate;
   ניווט (HTML) — network-first עם נפילה לעותק שמור כשאין רשת.
   קריאות API (Supabase וכו') לא נשמרות במטמון לעולם. */
/* __BUILD_ID__ מוחלף בזמן build (vite.config.js): כל דיפלוי משנה את
   הבייטים של הקובץ → הדפדפן מתקין SW חדש → activate מוחק את המטמון
   הישן → controllerchange ב-main.jsx מרענן פעם אחת. בלי זה הקובץ היה
   זהה בין דיפלויים וכל צינור העדכון היה מת — טלפונים נתקעו על גרסה
   ישנה לתמיד (7.8). */
const CACHE = 'courtside-__BUILD_ID__'

self.addEventListener('install', (e) => {
  // cache:'reload' — עוקף את מטמון ה-HTTP של הדפדפן; בלעדיו העותק
  // השמור של '/' יכול להיוולד ישן כבר בהתקנה
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request('/', { cache: 'reload' }))))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // רק אותו מקור — API חיצוני (Supabase, פונטים) עובר ישירות לרשת
  if (url.origin !== location.origin) return

  // ניווט: רשת קודם, ואם אין — העותק השמור של הדף
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          // waitUntil — בלעדיו ה-SW יכול להיסגר לפני שהכתיבה הסתיימה,
          // והעותק השמור נשאר בשקט על הגרסה הקודמת
          e.waitUntil(caches.open(CACHE).then((c) => c.put('/', copy)))
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // נכסים סטטיים: מהמטמון מיד, רענון ברקע
  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname) || url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          })
          .catch(() => cached)
        return cached || fresh
      })
    )
  }
})
