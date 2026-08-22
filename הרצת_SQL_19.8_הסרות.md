# הרצת SQL — ההסרות · 19.8.2026

שני קבצים, וסדר שחשוב לשמור עליו. **שום נתון לא נמחק בשום שלב.**

---

## למה בכלל צריך SQL כדי «להוריד מסך»

אפליקציית האנדרואיד ארוזה עם הקוד **בתוך המכשיר**. מי שהתקין אותה ימשיך
להריץ את המסכים הישנים גם אחרי שהאתר יתעדכן — ולשלוח הודעות ולהעלות
קליפים. הסרה אמיתית חייבת להיסגר בשרת, לא רק במסך.

---

## סדר הפעולות — ארבעה שלבים

### 1. לפני הפריסה: להכריז על אתגר פתוח (אם יש)

היכנס עכשיו ל**ניהול → עולם הכדורסל → הבנק**, ואם יש אתגר במצב «פתוח» —
לחץ «הכרז עכשיו». **אחרי הפריסה המסך הזה כבר לא קיים**, והאתגר יישאר
תקוע במצב פתוח לנצח.

אם אין אתגר פתוח — דלג.

### 2. לפני הפריסה: לבדוק משימות מתוזמנות

```sql
select jobname, schedule, command from cron.job;
```

אם חוזרת שגיאה שהטבלה לא קיימת — **אין משימות מתוזמנות, אפשר להמשיך.**
אם חוזרת שורה שקוראת לפונקציית אתגר — `select cron.unschedule('שם-המשימה');`

### 3. הפריסה

אני מעלה את הגרסה החדשה. **חכה שאאשר שהיא באוויר** לפני שלב 4 — אם
תריץ קודם, ילד באמצע שיחה יראה שגיאה אדומה.

### 4. שני הקבצים

| קובץ | מה הוא סוגר |
|---|---|
| `supabase_player_room_off_19_8.sql` | הוספת הודעות לחדר השחקנים הארצי |
| `supabase_game_challenge_off_19_8.sql` | הגשות לאתגר, העלאת קליפים, **וגם הצפייה בקליפים הקיימים** |

---

## הבדיקות אחרי ההרצה

**1. חדר השחקנים סגור:**

```sql
select policyname, permissive, cmd from pg_policies
 where tablename = 'player_messages' and policyname = 'pmsg_room_closed';
```
שורה אחת, `RESTRICTIVE`, `INSERT`.

**2. הקליפים — הבדיקה החשובה ביותר** (החלק הזה יכול להיכשל בשקט):

```sql
select policyname, cmd, permissive from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like '%challenges%' order by 1;
```
צריכות להופיע `media_challenges_no_upload` ו-`media_challenges_no_read`,
ו-`media_insert_challenges` **לא** אמורה להופיע.

**3. בזמן שאתה שם — תקלה ותיקה שכדאי לבדוק:**

```sql
select policyname from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname = 'media_no_player_avatars';
```
אם חזר **ריק** — מדיניות שחוסמת תמונת פרופיל של שחקן נמחקה בשקט מתישהו
בעבר. התיקון: להריץ שוב את `supabase_no_player_avatars.sql`.

**4. שום דבר לא נמחק** (הרץ לפני ואחרי — אותם מספרים):

```sql
select count(*) from public.player_messages;
select count(*) from public.game_challenge_submissions;
```

---

## ביטול

**חדר השחקנים:**
```sql
drop policy if exists "pmsg_room_closed" on public.player_messages;
```

**האתגר:**
```sql
grant insert, update on public.game_challenge_submissions to authenticated;
grant execute on function public.game_challenge_feed(uuid) to authenticated;
grant execute on function public.game_challenge_top5(uuid) to authenticated;
drop policy if exists "media_challenges_no_upload" on storage.objects;
drop policy if exists "media_challenges_no_read"   on storage.objects;
```
ואז להריץ שוב את `supabase_game_media_12_8.sql`.

המסכים עצמם חוזרים ב-revert של הקומיטים — תגיד לי ואני עושה את זה.

---

## מה נשאר במוצר, שלא תתבלבל

✅ חידונים · דו-קרבות · טבלת הנקודות · ניחושים · צ'אט הקבוצה · הודעות
פרטיות מול המאמן · כל צד המאמן.

❌ חדר השחקנים הארצי · האתגר השבועי · העלאת וידאו · פרסים · ייצוא
לאינסטגרם.
