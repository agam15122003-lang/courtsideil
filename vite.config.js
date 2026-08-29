import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
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
