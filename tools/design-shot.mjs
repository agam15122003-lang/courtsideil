// צילום יעד מהפרוטוטייפ מול צילום האפליקציה — כלי אימות ויזואלי בלבד (dev).
// שימוש:  node tools/design-shot.mjs 1b [http://localhost:5173]
//         node tools/design-shot.mjs all
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROTO = path.join(ROOT, 'design_handoff_auth/design/Courtside Auth.dc.html')
const OUT = path.join(ROOT, 'shots-auth')
const VIEW = { width: 390, height: 844 }

const ids = process.argv[2] === 'all'
  ? ['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h', '1j']
  : [process.argv[2] ?? '1b']
const appUrl = process.argv[3] ?? 'http://localhost:5173'

fs.mkdirSync(OUT, { recursive: true })

// חוסם כל קריאה אמיתית ל-Supabase: אין מיילים אמיתיים בזמן צילום.
async function stubAuth(page) {
  await page.route('**/auth/v1/**', (route) => {
    const u = route.request().url()
    if (u.includes('otp') || u.includes('recover')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    })
  })
}

const byText = (page, text) => page.locator(`text=${text}`).first()

// המסלול מדף הנחיתה עד כל מסך. RolePicker הוא השער לכל השאר.
const routes = {
  async '1a'(page) {
    await byText(page, 'התחברות / הרשמה').click()
  },
  async '1b'(page) {
    await routes['1a'](page)
    await byText(page, 'כניסה').last().click()
  },
  async '1c'(page) {
    await routes['1a'](page)
    await byText(page, 'מאמן').first().click()
  },
  async '1d'(page) {
    await routes['1a'](page)
    await byText(page, 'שחקן').first().click()
  },
  async '1e'(page) {
    await routes['1b'](page)
    await byText(page, 'שכחת סיסמה?').click()
  },
  async '1f'(page) {
    await routes['1e'](page)
    await page.locator('input[type="email"]').fill('coach@example.com')
    await byText(page, 'שליחת קישור איפוס').click()
    await page.waitForTimeout(600)
  },
  async '1g'(page) {
    await routes['1b'](page)
    await byText(page, 'כניסה עם קוד למייל').click()
    await page.locator('input[type="email"]').fill('coach@example.com')
    await byText(page, 'שליחת קוד למייל').click()
    await page.waitForTimeout(600)
  },
  async '1h'(page) {
    await page.goto(appUrl + '?reset=true', { waitUntil: 'networkidle' })
  },
  async '1j'(page) {
    await routes['1b'](page)
  },
}

const browser = await chromium.launch({ channel: 'chrome' })

// --- צילום היעד: הבלוק של המסך מתוך הפרוטוטייפ ---
const proto = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
await proto.goto('file:///' + PROTO.replace(/\\/g, '/'), { waitUntil: 'load' })
await proto.waitForTimeout(900)
for (const id of ids) {
  const el = proto.locator(`[data-screen-label="${id}"]`)
  if (await el.count()) {
    await el.screenshot({ path: path.join(OUT, `target-${id}.png`) })
    console.log('target', id)
  }
}
await proto.close()

// --- צילום האפליקציה ---
for (const id of ids) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: 'he-IL' })
  const page = await ctx.newPage()
  await stubAuth(page)
  if (id === '1j') {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  }
  try {
    await page.goto(appUrl, { waitUntil: 'networkidle' })
    await routes[id](page)
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(OUT, `app-${id}.png`) })
    console.log('app', id)
  } catch (e) {
    console.log('app', id, 'FAILED:', String(e.message).split('\n')[0].slice(0, 120))
  }
  await ctx.close()
}

await browser.close()
