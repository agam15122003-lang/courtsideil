import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// שרת מקומי שמריץ את האפליקציה האמיתית מול מוק — לצילום סרטוני ההדרכה.
// לא חלק מהאתר: `npm run build` לא נוגע בתיקייה הזו.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJ = path.resolve(HERE, '../../..')

export default defineConfig({
  // ה-root הוא הפרויקט עצמו כדי ש-/src/main.jsx ייפתר כרגיל; הדף עצמו
  // נפתח בכתובת tools/tutorial/harness/index.html
  root: PROJ,
  publicDir: path.join(PROJ, 'public'),
  plugins: [react()],
  resolve: {
    // ⚠ הרג"ב חייב לתפוס את כל המחרוזת: עם regex חלקי ה-replacement מחליף
    // רק את החלק שנתפס, ו-'./supabaseClient' היה הופך ל-'./C:/...' שבור.
    alias: [{ find: /^\.{1,2}\/supabaseClient(\.js)?$/, replacement: path.join(HERE, 'mockSupabase.js') }],
  },
  server: { port: 5200, strictPort: true, fs: { allow: [PROJ] } },
})
