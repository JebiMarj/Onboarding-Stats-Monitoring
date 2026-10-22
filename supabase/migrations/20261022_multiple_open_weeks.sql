-- Let a VA have QA (and other section) rows for more than one open week.
-- John applies this after review. Do not run it against the hosted project from the app.
-- The Start weekly evaluation button still refuses a second open week in the app.
-- Adding a QA score or a competency for another week creates that week's evaluation.
-- Closed-week freezes are unchanged.

drop index if exists public.weekly_evaluations_one_open_idx;

drop policy if exists weekly_evaluations_insert on public.weekly_evaluations;
create policy weekly_evaluations_insert on public.weekly_evaluations
  for insert to authenticated
  with check (
    public.app_role() in ('admin', 'onboarder', 'qa')
    and status = 'open'
    and outcome is null
    and score_snapshot is null
  );
