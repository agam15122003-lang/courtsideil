// צילום סרטוני ההדרכה של CourtSide.
//
// מריץ את האפליקציה האמיתית מול המוק שב-harness/, מנווט לאט ובכוונה,
// מזריק כתוביות בעברית, ומייצא mp4 שמתנגן בוואטסאפ ובאייפון.
//
//   node tools/tutorial/record.mjs            # הכול
//   node tools/tutorial/record.mjs roster     # קטע אחד
//
// דורש ששרת ההרנס ירוץ:
//   npx vite --config tools/tutorial/harness/vite.config.mjs
//
// הפלט: tools/tutorial/out/*.mp4 — חמישה קצרים + אחד ארוך מחובר.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const RAW = path.join(OUT, 'raw')
const URL = 'http://localhost:5200/tools/tutorial/harness/index.html'
const SIZE = { width: 1280, height: 800 }
// ⚠ ה-ffmpeg שמגיע עם Playwright הוא בילד מקוצץ (--disable-everything):
//   הוא יודע webm/VP8 בלבד — **בלי libx264 ובלי מוקסר mp4**. לכן הצילום
//   תמיד מפיק webm, וההמרה ל-mp4 (מה שוואטסאפ ואייפון מנגנים) רצה רק אם
//   נמצא ffmpeg מלא. בלעדיו הקבצים עדיין תקינים, פשוט בפורמט אחר.
const PW_FFMPEG = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe')

function findFullFfmpeg() {
  const cands = [
    process.env.FFMPEG,
    'ffmpeg',
    'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
    'C:/ffmpeg/bin/ffmpeg.exe',
    // winget install Gyan.FFmpeg — ה-PATH מתעדכן רק אחרי פתיחת מסוף חדש,
    // ולכן מחפשים גם ישירות בתיקיית החבילות
    ...(() => {
      const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages')
      try {
        const dir = fs.readdirSync(base).find((d) => /Gyan.FFmpeg/i.test(d))
        if (!dir) return []
        const build = fs.readdirSync(path.join(base, dir)).find((d) => /ffmpeg/i.test(d))
        return build ? [path.join(base, dir, build, 'bin', 'ffmpeg.exe')] : []
      } catch { return [] }
    })(),
  ].filter(Boolean)
  for (const c of cands) {
    try {
      const enc = execFileSync(c, ['-hide_banner', '-encoders'], { stdio: 'pipe' }).toString()
      if (/libx264|h264_/.test(enc)) return c
    } catch { /* אין כזה — ממשיכים */ }
  }
  return null
}
const FULL = findFullFfmpeg()

// ---------- שכבת הכתוביות ----------
// מוזרקת לדף עצמו ולא נשרפת בעריכה: כך אפשר לתקן נוסח בלי לצלם מחדש.
const OVERLAY = `
(() => {
  if (window.__cap) return
  const bar = document.createElement('div')
  bar.id = 'tut-cap'
  bar.setAttribute('dir', 'rtl')
  bar.style.cssText = [
    'position:fixed', 'inset-inline:0', 'bottom:0', 'z-index:2147483647',
    'padding:18px 28px 22px', 'box-sizing:border-box',
    'background:linear-gradient(to top, rgba(9,17,34,.96), rgba(9,17,34,.86) 62%, rgba(9,17,34,0))',
    'color:#fff', 'font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif',
    'font-size:27px', 'line-height:1.35', 'font-weight:700', 'text-align:center',
    'pointer-events:none', 'opacity:0', 'transition:opacity .25s ease',
    'text-shadow:0 2px 10px rgba(0,0,0,.55)',
  ].join(';')
  document.documentElement.appendChild(bar)
  window.__cap = (t) => { bar.textContent = t || ''; bar.style.opacity = t ? '1' : '0' }
  // הדגשה רכה על מה שעומדים ללחוץ — במקום סמן עכבר, שלא מוקלט
  window.__spot = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    const r = el.getBoundingClientRect()
    const ring = document.createElement('div')
    ring.style.cssText = [
      'position:fixed', 'z-index:2147483646', 'pointer-events:none',
      'border:3px solid #E86A2C', 'border-radius:12px',
      'box-shadow:0 0 0 6px rgba(232,106,44,.25)',
      'top:' + (r.top - 5) + 'px', 'left:' + (r.left - 5) + 'px',
      'width:' + (r.width + 10) + 'px', 'height:' + (r.height + 10) + 'px',
      'transition:opacity .3s ease',
    ].join(';')
    document.documentElement.appendChild(ring)
    setTimeout(() => { ring.style.opacity = '0'; setTimeout(() => ring.remove(), 350) }, 900)
    return true
  }
})()
`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function scene(page, text, ms = 3400) {
  await page.evaluate((t) => window.__cap?.(t), text)
  await sleep(ms)
}
async function clearCap(page) { await page.evaluate(() => window.__cap?.('')) }

// לחיצה "מוסברת": טבעת קצרה על היעד, ואז הלחיצה עצמה
async function tap(page, selector, waitAfter = 1800) {
  const ok = await page.evaluate((s) => window.__spot?.(s), selector)
  if (ok) await sleep(950)
  await page.click(selector, { timeout: 8000 }).catch(() => {})
  await sleep(waitAfter)
}
async function tapText(page, selector, text, waitAfter = 1800) {
  for (const el of await page.$$(selector)) {
    if ((await el.innerText()).includes(text)) {
      const box = await el.boundingBox()
      if (box) {
        await page.evaluate((b) => {
          const ring = document.createElement('div')
          ring.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #E86A2C;border-radius:12px;box-shadow:0 0 0 6px rgba(232,106,44,.25);top:${b.y - 5}px;left:${b.x - 5}px;width:${b.width + 10}px;height:${b.height + 10}px;transition:opacity .3s ease`
          document.documentElement.appendChild(ring)
          setTimeout(() => { ring.style.opacity = '0'; setTimeout(() => ring.remove(), 350) }, 900)
        }, box)
        await sleep(950)
      }
      await el.click()
      await sleep(waitAfter)
      return true
    }
  }
  return false
}
const nav = (page, label, wait = 2400) => tapText(page, '.sidebar-nav .nav-item', label, wait)

// גלילה **בתוך** מיכל: מודל סקירת האימון גולל בפנים (.sd-scroll),
// וגלגלת על הדף לא מזיזה בו כלום.
async function scrollIn(page, sel, px, steps = 16) {
  for (let n = 0; n < steps; n++) {
    await page.evaluate(([s2, d]) => { const el = document.querySelector(s2); if (el) el.scrollTop += d }, [sel, px / steps])
    await sleep(110)
  }
  await sleep(600)
}

// חזרה למצב נקי בין קטעים בסרטון הארוך. בלי זה מודל סקירת האימון
// שנשאר פתוח מהקטע הקודם חוסם את הסרגל, ושני הקטעים הבאים נופלים
// ב-timeout של הלחיצה.
async function reset(page) {
  await page.keyboard.press("Escape").catch(() => {})
  await sleep(400)
  await page.evaluate(() => {
    document.querySelector(".sd-close")?.click()
    document.querySelector(".cal-form .icon-btn")?.click()
  }).catch(() => {})
  await sleep(700)
  for (const it of await page.$$(".sidebar-nav .nav-item")) {
    if ((await it.innerText()).includes("בית")) { await it.click(); break }
  }
  await sleep(1600)
}

// פתיחת אימון קיים מהלו״ז עד למסך «נוכחות ומשוב»
async function openSession(page) {
  await tapText(page, ".cal-event", "18:00", 2200)
  await tapText(page, "button", "נוכחות ומשוב", 3000)
}

async function slowScroll(page, px, steps = 14) {
  for (let n = 0; n < steps; n++) {
    await page.mouse.wheel(0, px / steps)
    await sleep(110)
  }
  await sleep(600)
}

// ---------- הקטעים ----------
//
// הסרטון הארוך עובר על **התפריט מימין, מלמעלה למטה** — כל יעד מקבל קטע
// משלו. שני כללים שהבעלים קבע ואסור להפר:
//  (א) שום דבר על צד השחקן. אין חשבונות שחקן, אין מי שיקרא, ואין משוב
//      שמנוסח כפנייה לילד — מה שהמאמן כותב נשאר אצלו.
//  (ב) «מהקהילה» מקבל את הקטע הארוך ביותר: תוכניות ותרגילים שמאמנים
//      אחרים שיתפו הם הדבר שהכי חבל לפספס, והם היו חסרים בגרסה הקודמת.
const CLIPS = {
  home: {
    title: 'בית',
    run: async (page) => {
      await scene(page, 'CourtSide — כל מה שמאמן צריך, במקום אחד', 3600)
      await scene(page, 'נעבור על התפריט מימין, מלמעלה למטה', 3400)
      await scene(page, '«בית» — מה קורה היום ומה נשאר פתוח', 3600)
      await scene(page, 'למעלה: האימון הקרוב, ומתי בדיוק הוא מתחיל', 3800)
      await slowScroll(page, 420)
      await scene(page, '«דברים לביצוע» — מה שנשאר פתוח, לפי סדר', 3800)
      await scene(page, 'ולצידו הלו״ז של השבוע הקרוב', 3400)
    },
  },

  teams: {
    title: 'הקבוצות שלי',
    run: async (page) => {
      await nav(page, 'הקבוצות')
      await scene(page, '«הקבוצות שלי» — כאן הכול מתחיל', 3400)
      await scene(page, 'הסגל: שם, מספר, תפקיד ואחוז נוכחות עונתי', 4000)
      await slowScroll(page, 600)
      await scene(page, 'שחקן פצוע נשאר ברשימה — רק מסומן', 3600)
      await slowScroll(page, -600)
      await scene(page, 'שלוש לשוניות: סגל · לו״ז ונוכחות · יעדים', 3800)
      await tapText(page, '.tabs .tab', 'יעדים ומשימות', 2600)
      await scene(page, 'יעדים ומשימות לקבוצה או לשחקן בודד', 3800)
      await scene(page, 'כל מה שתרשום על שחקן נשאר אצלך בלבד', 4000)
    },
  },

  work: {
    title: 'אימונים ותרגילים',
    run: async (page) => {
      await nav(page, 'אימונים ותרגילים')
      await scene(page, '«אימונים ותרגילים» — כאן בונים את האימון', 3600)
      await scene(page, '«בניית תוכנית»: דף מחברת אחד לכל אימון', 3800)
      await scene(page, 'חלקים, זמנים, תרגילים — ושרטוט מגרש ביד', 4000)
      await slowScroll(page, 450)
      await scene(page, 'תוכנית שבנית פעם אחת חוזרת בכל פעם שתרצה', 3800)
      await tapText(page, '.tabs .tab', 'בניית תרגיל', 2800)
      await scene(page, '«בניית תרגיל» — ספריית התרגילים המלאה', 3600)
      await scene(page, 'חיפוש וסינון לפי קטגוריה, גיל ומקור', 3600)
    },
  },

  // ⚠ הקטע החשוב. הבעלים אמר במפורש שזה היה חסר.
  fromCommunity: {
    title: 'מהקהילה',
    run: async (page) => {
      await nav(page, 'אימונים ותרגילים')
      await scene(page, 'ועכשיו מה שהכי חבל לפספס: «מהקהילה»', 3800)
      await tapText(page, '.tabs .tab', 'מהקהילה', 3000)
      await scene(page, 'כל מה שמאמנים אחרים שיתפו — פתוח לך', 3800)
      await scene(page, '«תוכניות»: מערכי אימון שלמים של מאמנים אחרים', 4200)
      await slowScroll(page, 380)
      await scene(page, '«צפה כמערך אימון» — רואים את הדף שלו במלואו', 4200)
      await scene(page, 'ו«העתק אליי» — והתוכנית שלך, לשנות איך שבא לך', 4400)
      await tapText(page, '.cw-kind .cw-kind-btn', 'תרגילים', 3000)
      await scene(page, '«תרגילים» — אותו דבר, תרגיל אחרי תרגיל', 3800)
      await slowScroll(page, 400)
      await scene(page, 'מסננים לפי קטגוריה וגיל, מדרגים ושומרים', 4000)
      await scene(page, 'וכל תרגיל נכנס בלחיצה לתוך תוכנית שלך', 4000)
      await scene(page, 'ומה שאתה תשתף — יעזור למאמן הבא', 3800)
    },
  },

  schedule: {
    title: 'לו״ז',
    run: async (page) => {
      await nav(page, 'לו"ז')
      await scene(page, '«לו״ז» — כל האימונים והמשחקים של השבוע', 3800)
      await scene(page, 'ימי אימון קבועים נכנסים לבד, שבוע אחרי שבוע', 4000)
      await scene(page, 'לחיצה על אימון פותחת אותו', 2800)
      await openSession(page)
      await scene(page, 'נוכחות בלחיצה אחת לכל שחקן', 3600)
      await scene(page, 'או «כולם נוכחים» — וסימנת את כל הסגל', 3600)
      await scrollIn(page, '.sd-scroll', 300)
      await scene(page, 'עומס אחרי אימון: 1 עד 10, ליד כל שחקן', 4000)
      await scrollIn(page, '.sd-scroll', 300)
      await scene(page, 'והיעדים שסימנת מראש — מי עמד בהם', 3800)
    },
  },

  review: {
    title: 'הסקירה',
    run: async (page) => {
      await nav(page, 'לו"ז')
      await openSession(page)
      await scene(page, 'בסוף האימון — שורה או שתיים לעצמך', 3600)
      await scrollIn(page, '.sd-scroll', 420)
      await scene(page, 'ההערות נשמרות אצלך בלבד. אף אחד אחר לא רואה', 4400)
      await scrollIn(page, '.sd-scroll', -900, 20)
      await scene(page, 'ולמעלה — עומס קבוצתי ממוצע ואחוז נוכחות', 4200)
      await scene(page, 'שמירה אחת, והאימון מתועד לכל העונה', 3800)
    },
  },

  community: {
    title: 'קהילה',
    run: async (page) => {
      await nav(page, 'קהילה')
      await scene(page, '«קהילה» — המגרש הביתי של המאמנים', 3600)
      await scene(page, 'שאלות, טיפים ורעיונות ממאמנים אחרים', 3800)
      await slowScroll(page, 600)
      await scene(page, 'אפשר לקרוא בשקט, ואפשר לשאול', 3400)
      await scene(page, 'ויש גם ערוצי צ׳אט לפי שכבת גיל ונושא', 3800)
    },
  },

  finder: {
    title: 'חיפוש מאמנים',
    run: async (page) => {
      await nav(page, 'חיפוש מאמנים')
      await scene(page, '«חיפוש מאמנים» — למצוא את מי שאתה צריך', 3800)
      await scene(page, 'מסננים לפי מועדון ולפי שכבת גיל', 3600)
      await scene(page, 'ומהפרופיל שלו: התרגילים והתוכניות ששיתף', 4000)
      await tapText(page, '.tabs .tab', 'משחקי אימון', 2800)
      await scene(page, 'ובלשונית «משחקי אימון» — מחפשים יריבה לשבת', 4200)
    },
  },

  messages: {
    title: 'הודעות',
    run: async (page) => {
      await nav(page, 'הודעות')
      await scene(page, '«הודעות» — שיחות אישיות עם מאמנים אחרים', 3800)
      await scene(page, 'בדיוק כמו וואטסאפ, רק בתוך האפליקציה', 3600)
    },
  },

  media: {
    title: 'מדיה',
    run: async (page) => {
      await nav(page, 'מדיה')
      await scene(page, '«מדיה» — סרטוני אימון שהמאמנים אספו', 3800)
      await scene(page, 'מסננים לפי נושא, וצופים בלי לצאת מכאן', 3800)
      await slowScroll(page, 450)
      await scene(page, 'מדרגים בכוכבים, והטובים עולים למעלה', 3800)
    },
  },

  help: {
    title: 'שאלות ותשובות',
    run: async (page) => {
      await nav(page, 'שאלות')
      await scene(page, '«שאלות ותשובות» — כשמשהו לא ברור', 3600)
      await scene(page, 'בוחרים נושא, ורואים רק אותו', 3200)
      await tapText(page, '.hlp-tile', 'הקבוצה והסגל', 2600)
      await tapText(page, '.hlp-q', '', 2400)
      await scene(page, 'או מקלידים מילה אחת ומקבלים תשובה', 3600)
      await scene(page, 'ומה שאין כאן — כפתור אחד, ואנחנו עונים', 4000)
    },
  },
}

// ---------- הרצה ----------
const only = process.argv[2]
const names = only ? [only] : Object.keys(CLIPS)
if (only && !CLIPS[only]) { console.error('אין קטע בשם', only, '— יש:', Object.keys(CLIPS).join(', ')); process.exit(1) }

fs.mkdirSync(RAW, { recursive: true })
const browser = await chromium.launch()
const made = []

for (const name of names) {
  const clip = CLIPS[name]
  const dir = path.join(RAW, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir, size: SIZE },
    locale: 'he-IL',
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  })
  const page = await ctx.newPage()
  await page.addInitScript(OVERLAY)
  await page.goto(URL)
  await page.waitForSelector('.nh-coach', { timeout: 30000 })
  await sleep(2200)
  await page.evaluate(OVERLAY)
  try {
    await clip.run(page)
  } catch (e) {
    console.error(`  ⚠ ${name}:`, e.message)
  }
  await clearCap(page)
  await sleep(900)
  const vid = page.video()
  await ctx.close()
  const webm = await vid.path()
  let final = path.join(OUT, `courtside-${name}.webm`)
  fs.copyFileSync(webm, final)
  if (FULL) {
    const mp4 = path.join(OUT, `courtside-${name}.mp4`)
    // yuv420p + faststart — בלעדיהם וואטסאפ ואייפון מסרבים לנגן
    execFileSync(FULL, ['-y', '-i', webm, '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'pipe' })
    fs.rmSync(final, { force: true })
    final = mp4
  }
  console.log(`✓ ${name} → ${path.basename(final)} (${(fs.statSync(final).size / 1024 / 1024).toFixed(1)} MB)`)
  made.push(final)
}

// ---------- הסרטון הארוך ----------
// מוקלט כרצף אחד ולא מחובר מהקצרים: ה-ffmpeg של Playwright הוא בילד
// מקוצץ בלי דמוקסר concat, והקלטה רציפה ממילא נראית טוב יותר —
// בלי קפיצות תאורה בין קטעים.
if (!only) {
  const dir = path.join(RAW, "full")
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE }, locale: "he-IL", deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.addInitScript(OVERLAY)
  await page.goto(URL)
  await page.waitForSelector(".nh-coach", { timeout: 30000 })
  await sleep(2200)
  await page.evaluate(OVERLAY)
  await scene(page, "CourtSide — סיור מלא באפליקציה", 3600)
  for (const name of Object.keys(CLIPS)) {
    await reset(page)
    await scene(page, "‹ " + CLIPS[name].title + " ›", 2400)
    try { await CLIPS[name].run(page) } catch (e) { console.error(`  ⚠ full/${name}:`, e.message) }
  }
  await reset(page)
  await reset(page)
  await scene(page, "וזהו — כל התפריט, מלמעלה למטה", 3600)
  await scene(page, "היום זה כולו שלך: השחקנים לא מתחברים לכלום", 4200)
  await scene(page, "ומה שרשמת עליהם נשאר אצלך בלבד", 3800)
  await scene(page, "בקרוב ייפתח גם צד לשחקנים", 3600)
  await scene(page, "courtsideil.vercel.app", 4000)
  await clearCap(page)
  await sleep(900)
  const vid = page.video()
  await ctx.close()
  const webm = await vid.path()
  let final = path.join(OUT, "courtside-hadracha.webm")
  fs.copyFileSync(webm, final)
  if (FULL) {
    const mp4 = path.join(OUT, "courtside-hadracha.mp4")
    execFileSync(FULL, ["-y", "-i", webm, "-c:v", "libx264", "-preset", "medium", "-crf", "22",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { stdio: "pipe" })
    fs.rmSync(final, { force: true })
    final = mp4
  }
  console.log(`✓ הארוך → ${path.basename(final)} (${(fs.statSync(final).size / 1024 / 1024).toFixed(1)} MB)`)
}

if (!FULL) {
  console.log("")
  console.log("⚠ הפלט הוא webm — וואטסאפ ואייפון לא תמיד מנגנים אותו.")
  console.log("  להמרה ל-mp4 צריך ffmpeg מלא (winget install Gyan.FFmpeg),")
  console.log("  ואז להריץ שוב את הסקריפט — הוא מוצא אותו לבד.")
}
await browser.close()
