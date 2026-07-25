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

-- ------------------------------------------------------------
-- לולאת תגובות בטאפ אחד — הנער מרגיש שרואים אותו
-- ------------------------------------------------------------
-- המאמן מסמן "ראיתי" על סיכום אימון של שחקן
alter table public.session_effort add column if not exists coach_ack boolean not null default false;

create or replace function public.ack_session_effort(p_session_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.session_effort
     set coach_ack = true
   where session_id = p_session_id
     and player_id = p_player_id
     and coach_id = auth.uid(); -- רק המאמן של השורה
end;
$$;

revoke all on function public.ack_session_effort(uuid, uuid) from public, anon;
grant execute on function public.ack_session_effort(uuid, uuid) to authenticated;

-- השחקן מגיב באמוג'י על משוב אישי מהמאמן
alter table public.player_feedback add column if not exists player_reaction text;

create or replace function public.react_to_feedback(p_id uuid, p_reaction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reaction is not null and p_reaction not in ('👍', '🔥', '💪', '🙏') then
    raise exception 'תגובה לא מוכרת';
  end if;
  update public.player_feedback
     set player_reaction = p_reaction
   where id = p_id
     and player_id = auth.uid(); -- רק השחקן שקיבל את המשוב
end;
$$;

revoke all on function public.react_to_feedback(uuid, text) from public, anon;
grant execute on function public.react_to_feedback(uuid, text) to authenticated;

do $mig$ begin perform public.mark_migration('supabase_engagement2.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';
