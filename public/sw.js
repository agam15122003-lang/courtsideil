/* CourtSide service worker — התקנה כאפליקציה + טעינה מהירה.
   אסטרטגיה: נכסים סטטיים (JS/CSS/פונטים/תמונות) — stale-while-revalidate;
   ניווט (HTML) — network-first עם נפילה לעותק שמור כשאין רשת.
   קריאות API (Supabase וכו') לא נשמרות במטמון לעולם. */
const CACHE = 'courtside-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])))
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
          caches.open(CACHE).then((c) => c.put('/', copy))
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
