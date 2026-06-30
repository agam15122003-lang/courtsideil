# פנקס המאמן 🏀

פלטפורמה חברתית-מקצועית למאמני כדורסל.

**טכנולוגיה:** React (Vite) + Supabase + Netlify

## התחלה מהירה

המדריך המלא נמצא בקובץ **`מדריך-התקנה.md`** — פתח אותו והתחל משם.

בקצרה:
1. `npm install` — התקנת רכיבים
2. הרצת `supabase_setup.sql` ב-Supabase
3. יצירת קובץ `.env.local` עם מפתחות Supabase
4. `npm run dev` — הרצה מקומית
5. `npm run build` + העלאה ל-Netlify — אתר חי

## מבנה הפרויקט (שלב 1)

```
src/
  main.jsx          נקודת הכניסה
  App.jsx           ניהול מצב התחברות
  Auth.jsx          מסך הרשמה/התחברות
  Dashboard.jsx     מסך אחרי התחברות
  supabaseClient.js חיבור ל-Supabase
  index.css         עיצוב
supabase_setup.sql  הקמת מסד הנתונים
```
