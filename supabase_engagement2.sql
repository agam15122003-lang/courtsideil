-- ============================================================
-- CourtSide — אנגייג'מנט 2: סרטונים מומלצים ("המאמן ממליץ")
-- נכתב 25.7.2026. הרץ אחרי supabase_privacy4.sql. בטוח להרצה חוזרת.
--
-- למה: לשחקן מוצג קיר של ~106 סרטונים מיובאים. במקום זה — מדף קטן של
-- סרטונים שאדמין סימן בכוכב, והספרייה המלאה בלחיצה.
-- ============================================================

alter table public.drill_videos add column if not exists featured boolean not null default false;

-- סימון/ביטול המלצה — אדמין בלבד (אותו דפוס כמו set_video_approved)
create or replace function public.set_video_featured(p_id uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'סימון סרטונים מומלצים מותר למנהלים בלבד';
  end if;
  update public.drill_videos set featured = p_featured where id = p_id;
end;
$$;

revoke all on function public.set_video_featured(uuid, boolean) from public, anon;
grant execute on function public.set_video_featured(uuid, boolean) to authenticated;

do $mig$ begin perform public.mark_migration('supabase_engagement2.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';
