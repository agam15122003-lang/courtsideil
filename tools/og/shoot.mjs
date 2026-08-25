// כלי הפקה — לא חלק מהבילד. מריצים מתוך שורש הפרויקט: node tools/og/shoot.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const OG = path.dirname(fileURLToPath(import.meta.url)).split(path.sep).join('/')
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'he-IL' })
const p = await ctx.newPage()
await p.goto('file:///' + OG + '/og.html')
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)
await p.screenshot({ path: OG + '/og-image.png' })
await b.close()
console.log('shot')
