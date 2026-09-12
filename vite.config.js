import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

// 12.9.2026 — למה הסקריפטים המוטבעים יוצאים לקבצים, וסקריפט צביעה מוקדם.
//
// (א) ה-CSP שוורסל שולח (vercel.json) הוא `script-src 'self'` — בלי
//     'unsafe-inline', בלי nonce ובלי hashes. כלומר **כל** סקריפט מוטבע
//     ב-index.html נחסם בפרודקשן: גלאי הדפדפן המודרני של plugin-legacy,
//     טוען הצ'אנקים הישנים, ה-System.import של מסלול התאימות, תיקון ה-nomodule
//     של ספארי — וגם כתב-השגיאות שכל תפקידו להסביר מסך לבן. על WebView עתיק
//     (בדיוק המכשיר שבשבילו נוסף plugin-legacy) התוצאה היא מסך לבן שקט:
//     המסלול הישן לא מופעל, וההודעה שהייתה מסבירה זאת חסומה גם היא.
//     למה להוציא לקבצים ולא להוסיף sha256 ל-CSP: hash מתיישן בשקט בכל שינוי
//     של index.html או של גרסת התוסף, והכשל שהוא מייצר הוא שוב מסך לבן.
//     קובץ חיצוני מאותו מקור מכוסה ב-'self' לתמיד, בלי תחזוקה.
// (ב) באותה הזדמנות מוזרק לראש ה-<head> סקריפט צביעה זעיר: data-theme="dark"
//     הוחל עד היום רק ב-useEffect של App, כלומר אחרי שכל ה-bundle ירד —
//     מי שבחר מצב כהה קיבל מסך לבן מלא (נמדד: ~170ms בקו מהיר, וכמה שניות
//     ב-3G). הוא קורא בדיוק את אותו מפתח שהאפליקציה כותבת ('theme'), ולכן
//     אין שינוי התנהגות — רק הקדמה.
//
// ⚠ THEME_INIT הוא הסקריפט היחיד שנשאר **מוטבע**, ובכוונה: הוא חוסם צביעה
//   בראש ה-head, וקובץ חיצוני היה מוסיף לו round-trip שלם לפני הצביעה
//   הראשונה — כלומר מרפא את ההבהוב ומזיק לזמן הטעינה. במקום זה ה-sha256
//   שלו רשום ב-‎script-src‎ בתוך vercel.json.
//   ⚠⚠ שינית את המחרוזת? חשב מחדש את ה-hash ועדכן את vercel.json, אחרת
//      הדפדפן יחסום אותו וההבהוב הלבן יחזור:
//      node -e "console.log('sha256-'+require('crypto').createHash('sha256').update(require('fs').readFileSync(0)).digest('base64'))"
const THEME_INIT = "try{if(localStorage.getItem('theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}"
// sha256-B9H1X+RXYH9E9pU4uymsE4bvKz2H1bbcJEGsPZ0Jous=  ← הערך שרשום ב-vercel.json

function csInlineScriptsToFiles() {
  const pending = new Map() // שם קובץ → קוד (מפתח = תוכן, ולכן אין כפילויות)
  return {
    name: 'courtside-inline-scripts-to-files',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      // 'post' + המיקום האחרון במערך plugins — כדי לראות את ה-HTML אחרי
      // ש-plugin-legacy כבר הזריק את כל התגים שלו
      order: 'post',
      handler(html) {
        // מוזרק מיד אחרי הכרזת ה-charset ולפני ה-CSS — כך הצביעה הראשונה
        // כבר כהה, ובלי לדחוק את ההכרזה ממקומה בראש המסמך
        const anchor = /<meta[^>]+charset[^>]*>/i.test(html) ? /(<meta[^>]+charset[^>]*>)/i : /(<head[^>]*>)/i
        const withTheme = html.replace(anchor, `$1<script data-cs-theme>${THEME_INIT}</script>`)
        return withTheme.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
          if (/\sdata-cs-theme\b/i.test(attrs)) return m // מוטבע בכוונה, מכוסה ב-sha256
          if (/\ssrc\s*=/i.test(attrs)) return m // כבר חיצוני
          // בלוק נתונים (JSON-LD) אינו סקריפט בר-הרצה — CSP לא חוסם אותו
          if (/\stype\s*=\s*["']?[^"'\s>]*json/i.test(attrs)) return m
          if (!body.trim()) return m
          const name = `csboot-${createHash('sha256').update(body).digest('hex').slice(0, 10)}.js`
          pending.set(name, body)
          // כל שאר התכונות נשמרות כלשונן: nomodule / type=module / id /
          // data-src — מסלול התאימות מסתמך עליהן (getElementById('vite-legacy-entry'))
          return `<script${attrs} src="/${name}"></script>`
        })
      },
    },
    async writeBundle(options) {
      const dir = options.dir || 'dist'
      await Promise.all([...pending].map(([name, code]) => writeFile(path.join(dir, name), code, 'utf8')))
      pending.clear()
    },
  }
}

export default defineConfig({
  // מסלול תאימות לדפדפנים עתיקים (30.8): הטאבלט של הבעלים מריץ WebView
  // כל כך ישן שהוא לא מכיר <script type="module"> — האפליקציה המותקנת
  // נפתחה כמסך לבן עם «Unexpected token import». התוסף מוסיף גרסה שנייה
  // של הקוד בפורמט הישן (SystemJS + polyfills) שנטענת רק היכן שהחדש לא
  // רץ. דפדפן מודרני ממשיך לקבל את הקוד המודרני — בלי שינוי.
  // csInlineScriptsToFiles אחרון בכוונה — הוא חייב לרוץ אחרי plugin-legacy
  plugins: [react(), legacy({ targets: ['defaults', 'chrome >= 50', 'android >= 5'] }), csInlineScriptsToFiles()],
  build: {
    // es2017 ולא ברירת המחדל (chrome87+): האפליקציה רצה גם בתוך WebView של
    // אנדרואיד, וטאבלט שלא עדכן את System WebView מזמן נופל על תחביר חדש
    // (?. ו-??) עם מסך לבן. es2017 מתרגם את התחביר; המחיר — bundle מעט גדול.
    target: 'es2017',
    rollupOptions: {
      output: {
        // ספריות צד-שלישי בקבצים נפרדים — קאש הדפדפן שורד דיפלויים
        // (הקוד שלנו משתנה בכל דיפלוי; React ו-Supabase כמעט אף פעם לא)
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
