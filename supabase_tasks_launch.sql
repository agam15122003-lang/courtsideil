-- ============================================================
-- CourtSide — משימות, מסמך ההשקה 1.6
-- מוסיף player_assignments.status: 'active' / 'archived'.
-- ארכוב אוטומטי כשעבר תאריך היעד או שכולם סיימו, וסגירה ידנית
-- של המאמן — במסך «מה נשלח ומי ביצע». אידמפוטנטי.
-- הרץ אחרי supabase_assignments_progress.sql.
-- ============================================================

alter table public.player_assignments
  add column if not exists status text not null default 'active';

do $$
begin
  begin
    alter table public.player_assignments
      add constraint player_assignments_status_check check (status in ('active', 'archived'));
  exception when duplicate_object then null;
  end;
end $$;

create index if not exists player_assignments_status_idx
  on public.player_assignments (coach_id, status);

-- רישום בטבלת המיגרציות (אם הלדג'ר קיים)
do $$
begin
  begin
    perform public.mark_migration('supabase_tasks_launch.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
