-- Daily WBR and attendance remarks.
-- John applies this after review. Do not run it against the hosted project from the app.
-- public.weekly_wbr is left in place. The app and compute_kpi_snapshot no longer read it.

alter table public.attendance_days
  add column if not exists remarks text;

create table if not exists public.wbr_days (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references public.va_profiles (id) on delete cascade,
  work_date date not null,
  total_leads numeric check (total_leads is null or total_leads >= 0),
  converted_leads numeric check (converted_leads is null or converted_leads >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (va_id, work_date)
);

drop trigger if exists wbr_days_stamp on public.wbr_days;
create trigger wbr_days_stamp before insert or update on public.wbr_days
  for each row execute function public.stamp_writer();

drop trigger if exists wbr_days_freeze on public.wbr_days;
create trigger wbr_days_freeze
  before insert or update or delete on public.wbr_days
  for each row execute function public.freeze_closed_attendance();

alter table public.wbr_days enable row level security;
revoke all on table public.wbr_days from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.wbr_days from anon';
  end if;
end
$$;
grant select, insert, update, delete on table public.wbr_days to authenticated;

drop policy if exists wbr_days_select on public.wbr_days;
create policy wbr_days_select on public.wbr_days
  for select to authenticated
  using (true);

drop policy if exists wbr_days_insert on public.wbr_days;
create policy wbr_days_insert on public.wbr_days
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));

drop policy if exists wbr_days_update on public.wbr_days;
create policy wbr_days_update on public.wbr_days
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));

drop policy if exists wbr_days_delete on public.wbr_days;
create policy wbr_days_delete on public.wbr_days
  for delete to authenticated
  using (public.app_role() in ('admin', 'onboarder'));

comment on column public.attendance_days.remarks is
  'Reason for a late arrival, downtime, or a full-day absence.';
comment on table public.wbr_days is
  'One WBR row per VA per work day. Weekly conversion is sum(converted) / sum(total) over days in the week whose total leads are greater than zero.';

create or replace function public.compute_kpi_snapshot(p_evaluation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ev public.weekly_evaluations%rowtype;
  settings jsonb;
  pass_mark numeric;
  weights jsonb;
  keys text[] := array[
    'attendance', 'conversion', 'qa', 'tool_navigation',
    'communication', 'critical_thinking', 'core_values'
  ];
  labels jsonb := jsonb_build_object(
    'attendance', 'Attendance',
    'conversion', 'WBR',
    'qa', 'QA score',
    'tool_navigation', 'Tool navigation',
    'communication', 'Communication',
    'critical_thinking', 'Critical thinking',
    'core_values', 'Core values'
  );
  scores jsonb := '{}'::jsonb;
  attendance_avg numeric;
  conversion numeric;
  qa_score numeric;
  comp public.weekly_competencies%rowtype;
  section text;
  configured numeric;
  included_sum numeric := 0;
  section_score numeric;
  breakdown jsonb := '[]'::jsonb;
  effective numeric;
  contribution numeric;
  overall numeric := 0;
  any_included boolean := false;
  rescaled boolean := false;
begin
  select * into ev from public.weekly_evaluations where id = p_evaluation_id;
  if ev.id is null then
    raise exception 'Evaluation not found.';
  end if;

  select value into settings from public.app_settings where key = 'kpi';
  pass_mark := coalesce((settings->>'passMark')::numeric, 80);
  weights := coalesce(settings->'weights', '{}'::jsonb);

  select avg(
    case
      when a.absent then 0
      else greatest(0, (480 - a.late_minutes - a.downtime_minutes)::numeric / 480 * 100)
    end
  )
  into attendance_avg
  from public.attendance_days a
  where a.va_id = ev.va_id
    and a.work_date >= ev.week_start
    and a.work_date < ev.week_start + 7;

  select case
    when coalesce(sum(d.total_leads) filter (where d.total_leads > 0), 0) = 0 then null
    else least(
      100,
      coalesce(sum(d.converted_leads) filter (where d.total_leads > 0), 0)
        / sum(d.total_leads) filter (where d.total_leads > 0)
        * 100
    )
  end
  into conversion
  from public.wbr_days d
  where d.va_id = ev.va_id
    and d.work_date >= ev.week_start
    and d.work_date < ev.week_start + 7;

  select q.score into qa_score from public.weekly_qa q where q.evaluation_id = ev.id;
  select * into comp from public.weekly_competencies where evaluation_id = ev.id;

  scores := jsonb_build_object(
    'attendance', to_jsonb(attendance_avg),
    'conversion', to_jsonb(conversion),
    'qa', to_jsonb(qa_score),
    'tool_navigation', case when comp.id is null then 'null'::jsonb else to_jsonb(comp.tool_navigation) end,
    'communication', case when comp.id is null then 'null'::jsonb else to_jsonb(comp.communication) end,
    'critical_thinking', case when comp.id is null then 'null'::jsonb else to_jsonb(comp.critical_thinking) end,
    'core_values', case when comp.id is null then 'null'::jsonb else to_jsonb(comp.core_values) end
  );

  foreach section in array keys loop
    configured := coalesce((weights->>section)::numeric, 0);
    section_score := (scores->>section)::numeric;
    if section_score is not null and configured > 0 then
      included_sum := included_sum + configured;
    end if;
  end loop;

  foreach section in array keys loop
    configured := coalesce((weights->>section)::numeric, 0);
    section_score := (scores->>section)::numeric;
    if section_score is not null and configured > 0 and included_sum > 0 then
      effective := configured / included_sum * 100;
      contribution := section_score * effective / 100;
      overall := overall + contribution;
      any_included := true;
      breakdown := breakdown || jsonb_build_array(jsonb_build_object(
        'key', section,
        'label', labels->>section,
        'score', section_score,
        'configuredWeight', configured,
        'effectiveWeight', effective,
        'contribution', contribution,
        'included', true
      ));
    else
      if section_score is null and configured > 0 then
        rescaled := true;
      end if;
      breakdown := breakdown || jsonb_build_array(jsonb_build_object(
        'key', section,
        'label', labels->>section,
        'score', scores->section,
        'configuredWeight', configured,
        'effectiveWeight', 0,
        'contribution', 0,
        'included', false
      ));
    end if;
  end loop;

  if not any_included then
    return jsonb_build_object(
      'overall', null,
      'passed', null,
      'passMark', pass_mark,
      'rescaled', false,
      'breakdown', breakdown
    );
  end if;

  return jsonb_build_object(
    'overall', overall,
    'passed', overall >= pass_mark,
    'passMark', pass_mark,
    'rescaled', rescaled,
    'breakdown', breakdown
  );
end
$$;
