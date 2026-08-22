// בונה את ההרנס (vite, עם dossierApi מוחלף בדמה) ומצלם את המסך האמיתי
// בשלושה גדלים. שימוש: node tools/dossier-harness/shoot.mjs [outDir]
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const out = path.resolve(process.argv[2] || path.join(here, 'dist'))
const mock = path.join(here, 'dossierApi.mock.js')

await build({
  root: here,
  base: './',            // נטען מ-file:// — נתיבים יחסיים, לא /assets
  configFile: false,
  logLevel: 'warn',
  plugins: [
    react(),
    {
      // הקומפוננטה מייבאת './dossierApi' — מחליפים לדמה בלי לגעת בקוד
      name: 'dossier-mock',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer && source === './dossierApi' && importer.replace(/\\/g, '/').endsWith('/src/PlayerDossier.jsx')) return mock
        return null
      },
    },
  ],
  resolve: { alias: { '@': path.join(repo, 'src') } },
  build: { outDir: out, emptyOutDir: true, minify: false },
})

// module scripts מ-file:// נחסמים ב-CORS — הדגל מתיר זאת לבדיקה מקומית
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] })
const url = pathToFileURL(path.join(out, 'index.html')).href
const shots = [
  ['desktop', 1300, 1000, false], ['ipad', 1024, 1366, true], ['phone', 402, 874, true],
]
for (const [name, w, h, touch] of shots) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('page: ' + String(e).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)) })
  page.on('requestfailed', (r) => errs.push('request failed: ' + r.url().slice(-80)))
  await page.goto(url)
  await page.waitForSelector('.pd-screen', { timeout: 8000 }).catch(() => errs.push('no .pd-screen rendered'))
  // בשלד הטלפון הגלילה היא בתוך .main-content ולא במסמך — fullPage צילם רק
  // את גובה החלון. משחררים את הגבהים כדי שהמסמך יגדל לגובה התוכן.
  await page.addStyleTag({ content: 'html,body,.layout,.main-content{height:auto!important;max-height:none!important;overflow:visible!important}' })
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(out, `dossier-${name}.png`), fullPage: true })
  if (name === 'desktop') {
    for (const [tab, file] of [['סבב דירוג', 'round'], ['מי רואה את התיקים', 'access'], ['המועדון', 'club'], ['הקטלוג', 'catalog']]) {
      const btn = page.getByRole('button', { name: tab, exact: true }).first()
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, `dossier-${file}.png`), fullPage: true }) }
    }
  }
  console.log(`${name}: ${errs.length ? 'ERRORS ' + errs.join(' | ') : 'ok'}`)
  await ctx.close()
}
await browser.close()
console.log('shots in', out)
