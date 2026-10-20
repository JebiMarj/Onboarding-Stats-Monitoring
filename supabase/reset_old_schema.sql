-- Drop the OLD Create & Reach tracker tables.
--
-- Read supabase/backup_before_reset.md first and store the export outside git.
-- Then change the latch below from NO to YES and run this whole file once
-- in the Supabase SQL editor.
--
-- This transaction does NOT touch:
--   auth.users, auth.identities, auth.sessions, or any other auth.* object
--   storage
--   the rebuilt tables (profiles, batches, va_profiles, attendance_days,
--   weekly_evaluations, weekly_qa, weekly_wbr, weekly_competencies,
--   coaching_sessions, status_history, app_settings)
--
-- It DOES drop the old app tables, their rows, indexes, and RLS policies.
-- Old rows are not copied anywhere by this file.
--
-- Tables:
--   settings
--   virtual_assistants   (also removes schedule, sop_portfolio, qa_monitoring)
--   performance_records
--   qa_records
--   wbr_records
--   competency_records
--   coaching_records     (also removes evaluation_id)
--   movement_history
--   evaluations          (created by supabase/migrations/20261019_qa_stats.sql)
-- The old schema and that migration did not create any other application tables.
-- Do not run 20261019_qa_stats.sql again after this reset.

begin;

do $$
begin
  if 'NO' <> 'YES' then
    raise exception
      'Backup first (supabase/backup_before_reset.md), then edit the latch in supabase/reset_old_schema.sql from NO to YES and run this script again.';
  end if;
end
$$;

drop table if exists public.performance_records cascade;
drop table if exists public.qa_records cascade;
drop table if exists public.wbr_records cascade;
drop table if exists public.competency_records cascade;
drop table if exists public.coaching_records cascade;
drop table if exists public.movement_history cascade;
drop table if exists public.evaluations cascade;
drop table if exists public.virtual_assistants cascade;
drop table if exists public.settings cascade;

commit;
