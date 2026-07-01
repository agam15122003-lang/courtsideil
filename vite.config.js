import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
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
