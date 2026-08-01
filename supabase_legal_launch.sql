-- ============================================================
-- CourtSide — משפטי לפני בטא, מסמך ההשקה 1.15
-- 1) טלפון הורה + גרסת נוסח ההסכמה על profiles — רשומת הסכמה
--    מלאה: מי (guardian_*), מתי (guardian_consent_at), איזה נוסח.
-- 2) סף הקטינות עולה מ-16 ל-18: הפעלת חשבון שחקן מתחת ל-18
--    דורשת הסכמת הורה (מייל + אישור). קטין קיים בין 16 ל-18 בלי
--    הסכמה יידרש להשלים אותה בעריכת הפרופיל הבאה.
-- 3) account_deletion_requests — נתיב בקשת מחיקת חשבון בתוך
--    האפליקציה; אדמין רואה ומטפל.
-- אידמפוטנטי. הרץ אחרי supabase_privacy4.sql.
-- ============================================================

alter table public.profiles add column if not exists guardian_phone text;
alter table public.profiles add column if not exists guardian_consent_version text;

-- טריגר הקטינים — סף 18 (החלפת הגרסה של privacy4 שבדקה 16)
create or replace function public.enforce_minor_consent()
returns trigger
language plpgsql
as $$
declare
  age int;
begin
  if new.role = 'player' and new.first_name is not null then
    age := extract(year from now())::int - coalesce(new.birth_year, 0);
    -- שנת לידה חובה לשחקן (בלעדיה אין דרך לדעת אם הוא קטין)
    if new.birth_year is null then
      raise exception 'חובה למלא שנת לידה בפרופיל שחקן';
    end if;
    if age < 18 and (new.guardian_email is null or new.guardian_consent_at is null) then
      raise exception 'שחקן מתחת לגיל 18 — נדרשת הסכמת הורה (מייל ואישור)';
    end if;
    -- שחקן לא חושף טלפון
    new.phone_public := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_minor_consent on public.profiles;
create trigger trg_minor_consent
  before insert or update on public.profiles
  for each row execute function public.enforce_minor_consent();

-- נתיב בקשת מחיקת חשבון
create table if not exists public.account_deletion_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text check (reason is null or char_length(reason) <= 500),
  status     text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;

drop policy if exists "adr_insert_own" on public.account_deletion_requests;
create policy "adr_insert_own" on public.account_deletion_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "adr_select_own" on public.account_deletion_requests;
create policy "adr_select_own" on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "adr_admin_update" on public.account_deletion_requests;
create policy "adr_admin_update" on public.account_deletion_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- רישום בטבלת המיגרציות (אם הלדג'ר קיים)
do $$
begin
  begin
    perform public.mark_migration('supabase_legal_launch.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
