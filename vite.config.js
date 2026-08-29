import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
export default defineConfig({
  // מסלול תאימות לדפדפנים עתיקים (30.8): הטאבלט של הבעלים מריץ WebView
  // כל כך ישן שהוא לא מכיר <script type="module"> — האפליקציה המותקנת
  // נפתחה כמסך לבן עם «Unexpected token import». התוסף מוסיף גרסה שנייה
  // של הקוד בפורמט הישן (SystemJS + polyfills) שנטענת רק היכן שהחדש לא
  // רץ. דפדפן מודרני ממשיך לקבל את הקוד המודרני — בלי שינוי.
  plugins: [react(), legacy({ targets: ['defaults', 'chrome >= 50', 'android >= 5'] })],
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
