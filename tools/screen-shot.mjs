// צילום יעד מ-«Courtside Mobile.dc.html» מול צילום האפליקציה, למסכים שמאחורי התחברות.
// אימות ויזואלי בלבד (dev). הסיסמה לא נשמרת בקובץ — מגיעה ממשתני סביבה:
//   COURTSIDE_EMAIL=... COURTSIDE_PASSWORD=... node tools/screen-shot.mjs 3a
//   ... node tools/screen-shot.mjs coach     // כל מסכי המאמן העליונים
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROTO = path.join(ROOT, 'design_handoff/design/Courtside Mobile.dc.html')
const OUT = path.join(ROOT, 'shots-mobile')
const VIEW = { width: 390, height: 844 }
const appUrl = process.env.APP_URL ?? 'http://localhost:5173'

// מסך → האינדקס של הפריט במגירה (סדר NAV ב-Dashboard.jsx)
const COACH = {
  '3a': { nav: 0, name: 'בית המאמן' },
  '11a': { nav: 1, name: 'קהילה' },
  '7a': { nav: 3, name: 'הודעות' },
  '13a': { nav: 4, name: 'בניית אימון' },
  '4a': { nav: 5, name: 'הקבוצה שלי' },
  '16a': { nav: 6, name: 'לו״ז' },
  '14a': { nav: 7, name: 'מדיה' },
  '3c': { nav: 0, name: 'בית המאמן · כהה', dark: true },
  // מסכים שאינם פריט במגירה — נגישים דרך כרטיס המשתמש או טאב פנימי
  '10a': { nav: -1, name: 'פרופיל המאמן', click: '.sidebar-user' },
  '5a': { nav: 4, name: 'ספריית התרגילים', tab: 'בניית תרגיל' },
}

const arg = process.argv[2] ?? 'coach'
const ids = arg === 'coach' ? Object.keys(COACH) : [arg]
fs.mkdirSync(OUT, { recursive: true })

// --- פרטי החיבור מ-.env.local, בלי להעתיק אותם לקוד ---
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const SB_URL = env.VITE_SUPABASE_URL
const SB_KEY = env.VITE_SUPABASE_ANON_KEY
const ref = new URL(SB_URL).hostname.split('.')[0]

const email = process.env.COURTSIDE_EMAIL
const password = process.env.COURTSIDE_PASSWORD
if (!email || !password) {
  console.error('חסר COURTSIDE_EMAIL / COURTSIDE_PASSWORD במשתני הסביבה')
  process.exit(1)
}

const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const session = await res.json()
if (!session.access_token) {
  console.error('ההתחברות נכשלה:', session.error_description || session.msg || JSON.stringify(session).slice(0, 200))
  process.exit(1)
}
console.log('מחובר:', session.user?.email)

const browser = await chromium.launch({ channel: 'chrome' })

// --- צילומי היעד מהפרוטוטייפ ---
const proto = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
await proto.goto('file:///' + PROTO.replace(/\\/g, '/'), { waitUntil: 'load' })
await proto.waitForTimeout(2500)
for (const id of ids) {
  // מזהה שמתחיל בספרה אינו חוקי כבורר CSS — דרך מאפיין
  const el = proto.locator(`[id="${id}"] .dv-card`).first()
  if (await el.count()) {
    await el.scrollIntoViewIfNeeded()
    await proto.waitForTimeout(400)
    await el.screenshot({ path: path.join(OUT, `target-${id}.png`) })
    console.log('target', id)
  } else console.log('target', id, 'לא נמצא בפרוטוטייפ')
}
await proto.close()

// --- צילומי האפליקציה ---
for (const id of ids) {
  const spec = COACH[id]
  if (!spec) { console.log('app', id, 'אין מסלול מוגדר'); continue }
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: 'he-IL' })
  const page = await ctx.newPage()
  await page.addInitScript(
    ([k, v, theme]) => {
      localStorage.setItem(k, v)
      if (theme) localStorage.setItem('theme', 'dark')
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session), !!spec.dark],
  )
  try {
    // לא networkidle — לאפליקציה יש חיבור realtime פתוח שלא נסגר לעולם
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.bn-item, .nav-item', { timeout: 20000 })
    if (spec.click) {
      await page.locator('button[aria-label]').first().click()
      await page.waitForTimeout(500)
      await page.locator(spec.click).first().click()
      await page.waitForTimeout(6000)
    } else if (spec.nav > 0) {
      await page.locator('[aria-label]').filter({ hasText: '' }).first().waitFor({ timeout: 5000 }).catch(() => {})
      await page.locator('button[aria-label]').first().click() // פתיחת המגירה
      await page.waitForTimeout(500)
      await page.locator('.nav-item').nth(spec.nav).click()
      await page.waitForTimeout(3000)
      if (spec.tab) {
        await page.locator('.tab', { hasText: spec.tab }).first().click().catch(() => {})
        await page.waitForTimeout(3500)
      } else await page.waitForTimeout(3000)
    } else {
      await page.waitForTimeout(6000)
    }
    await page.screenshot({ path: path.join(OUT, `app-${id}.png`), fullPage: true })
    console.log('app', id, '·', spec.name)
  } catch (e) {
    console.log('app', id, 'נכשל:', String(e.message).split('\n')[0].slice(0, 140))
  }
  await ctx.close()
}

await browser.close()
