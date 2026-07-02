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

## הרצה על מחשב חדש (לפטופ) 💻

הקובץ `.env.local` **לא נשמר בגיט** (יש בו מפתחות) — ולכן שיבוט טרי מציג מסך "חסר קובץ הגדרות":

1. `git clone https://github.com/agam15122003-lang/The-basketball-world.git`
2. `cd The-basketball-world` ואז `npm install`
3. צור קובץ `.env.local` בתיקיית השורש — העתק את `.env.local.example` ומלא את שני הערכים
   (מהמחשב הראשי, או מ-Supabase → Project Settings → API: ה-URL וה-anon key)
4. `npm run dev` — ואם הפורט תפוס, Vite יבחר אחד פנוי ויציג את הכתובת בטרמינל

> טיפ: אם רואים מסך לבן — לפתוח את הקונסול (F12); מהיום מוצג מסך הסבר במקום.

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
