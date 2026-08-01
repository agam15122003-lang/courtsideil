-- ============================================================
-- CourtSide — שלב 2 של מסמך ההשקה (2.1 + 2.3)
--
-- 2.1 משחקי אימון: מרחיב את game_requests הקיימת — אזור (8 אזורים),
--     טווח תאריכים, בית/חוץ, וסטטוס פתוחה/סגורה + מדיניות עדכון
--     לבעל הבקשה (עד היום לא הייתה מדיניות UPDATE בכלל).
-- 2.3 ייבוא מדיה: RPC למחיקת סרטון על ידי אדמין (מחיקה ידנית מהפאנל;
--     המדיניות הקיימת מתירה מחיקה רק ליוצר).
--
-- אידמפוטנטי. הרץ אחרי supabase_games.sql + supabase_privacy4.sql.
-- ============================================================

-- ---------- 2.1 משחקי אימון ----------
alter table public.game_requests add column if not exists region text
  check (region is null or region in ('צפון', 'חיפה', 'שרון', 'מרכז', 'תל אביב', 'ירושלים', 'שפלה', 'דרום'));
alter table public.game_requests add column if not exists date_from date;
alter table public.game_requests add column if not exists date_to date;
alter table public.game_requests add column if not exists home_away text
  check (home_away is null or home_away in ('home', 'away', 'either'));
alter table public.game_requests add column if not exists status text not null default 'open'
  check (status in ('open', 'closed'));

-- בעל הבקשה סוגר/מעדכן אותה
drop policy if exists "games_update_own" on public.game_requests;
create policy "games_update_own" on public.game_requests
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create index if not exists game_requests_open_idx on public.game_requests (status, created_at desc);

-- ---------- 2.3 מחיקת סרטון על ידי אדמין ----------
create or replace function public.admin_delete_video(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  delete from public.drill_videos where id = p_id;
end $$;
grant execute on function public.admin_delete_video(uuid) to authenticated;

-- רישום בטבלת המיגרציות (אם הלדג'ר קיים)
do $$
begin
  begin
    perform public.mark_migration('supabase_stage2_launch.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
