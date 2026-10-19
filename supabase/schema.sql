-- Create & Reach VA Services — Onboarding QA schema.
-- Fresh install. Does not migrate old rows and does not delete auth.users.
--
-- Run order (README):
--   1. supabase/backup_before_reset.md
--   2. supabase/reset_old_schema.sql
--   3. this file
--   4. supabase/grant_first_admin.sql after you edit the email
--
-- Stop if this install is already present. Re-running would not be a migration.

do $$
begin
  if to_regclass('public.va_profiles') is not null then
    raise exception 'public.va_profiles already exists. schema.sql is for a fresh install and does not change existing rows.';
  end if;
end
$$;

-- gen_random_uuid() is built into Postgres 13 and later, which is what Supabase runs.
-- This file does not enable extensions, so it does not need extra privileges.

-- ---------------------------------------------------------------------------
-- Profiles. One row per auth user. app_role() is security definer so policies
-- can read it without looping through RLS.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'onboarder', 'qa', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    if (select count(*) from public.profiles where role = 'admin' and id <> new.id) = 0 then
      raise exception 'The last admin cannot be demoted.';
    end if;
  end if;
  return new;
end
$$;

create trigger profiles_protect_last_admin
  before update on public.profiles
  for each row execute function public.protect_last_admin();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Called on sign-in. Creates a viewer profile if the trigger did not, and
-- never changes an existing role.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  em text;
  meta jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;
  select u.email, u.raw_user_meta_data into em, meta
  from auth.users u
  where u.id = auth.uid();
  insert into public.profiles (id, email, full_name, role)
  values (
    auth.uid(),
    em,
    coalesce(meta->>'full_name', split_part(coalesce(em, ''), '@', 1)),
    'viewer'
  )
  on conflict (id) do update
    set email = excluded.email
  returning * into result;
  return result;
end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index batches_name_lower_idx on public.batches (lower(name));

create table public.va_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) > 0),
  onboarding_start date not null,
  onboarder_name text,
  client_name text,
  business_name text,
  sop_or_portfolio text,
  status text not null default 'Onboarding' check (status in (
    'Onboarding',
    'Continue onboarding',
    'Ready for endorsement',
    'Endorsed',
    'Resigned',
    'EOC'
  )),
  schedule text,
  batch_id uuid not null references public.batches (id),
  endorsed_by uuid references public.profiles (id) on delete set null,
  endorsed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index va_profiles_status_idx on public.va_profiles (status);
create index va_profiles_batch_idx on public.va_profiles (batch_id);

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references public.va_profiles (id) on delete cascade,
  work_date date not null,
  absent boolean not null default false,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  downtime_minutes integer not null default 0 check (downtime_minutes >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (va_id, work_date)
);

create table public.weekly_evaluations (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references public.va_profiles (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  outcome text,
  gaps text,
  coaching_actions text,
  score_snapshot jsonb,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (va_id, week_start),
  check (
    (status = 'open' and outcome is null)
    or (status = 'closed' and outcome in ('ready_for_endorsement', 'continue_onboarding'))
  )
);

create unique index weekly_evaluations_one_open_idx
  on public.weekly_evaluations (va_id)
  where status = 'open';

create table public.weekly_qa (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique references public.weekly_evaluations (id) on delete cascade,
  score numeric not null check (score >= 0 and score <= 100),
  form_url text,
  recording_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.weekly_wbr (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique references public.weekly_evaluations (id) on delete cascade,
  total_leads numeric check (total_leads is null or total_leads >= 0),
  converted_leads numeric check (converted_leads is null or converted_leads >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.weekly_competencies (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique references public.weekly_evaluations (id) on delete cascade,
  tool_navigation numeric check (tool_navigation is null or (tool_navigation >= 0 and tool_navigation <= 100)),
  tool_navigation_comment text,
  communication numeric check (communication is null or (communication >= 0 and communication <= 100)),
  communication_comment text,
  critical_thinking numeric check (critical_thinking is null or (critical_thinking >= 0 and critical_thinking <= 100)),
  critical_thinking_comment text,
  core_values numeric check (core_values is null or (core_values >= 0 and core_values <= 100)),
  core_values_comment text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references public.va_profiles (id) on delete cascade,
  session_date date not null,
  topic text not null check (char_length(trim(topic)) > 0),
  discussion text not null check (char_length(trim(discussion)) > 0),
  action text not null check (char_length(trim(action)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index coaching_sessions_va_idx on public.coaching_sessions (va_id, session_date);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references public.va_profiles (id) on delete cascade,
  previous_status text,
  new_status text not null,
  note text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index status_history_va_idx on public.status_history (va_id, changed_at);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stamps and status rules
-- ---------------------------------------------------------------------------

create or replace function public.stamp_writer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;

create trigger batches_stamp before insert or update on public.batches
  for each row execute function public.stamp_writer();
create trigger va_profiles_stamp before insert or update on public.va_profiles
  for each row execute function public.stamp_writer();
create trigger attendance_days_stamp before insert or update on public.attendance_days
  for each row execute function public.stamp_writer();
create trigger weekly_evaluations_stamp before insert or update on public.weekly_evaluations
  for each row execute function public.stamp_writer();
create trigger weekly_qa_stamp before insert or update on public.weekly_qa
  for each row execute function public.stamp_writer();
create trigger weekly_wbr_stamp before insert or update on public.weekly_wbr
  for each row execute function public.stamp_writer();
create trigger weekly_competencies_stamp before insert or update on public.weekly_competencies
  for each row execute function public.stamp_writer();
create trigger coaching_sessions_stamp before insert or update on public.coaching_sessions
  for each row execute function public.stamp_writer();

-- Reject endorsement statuses before the row exists. History is written after
-- insert so the status_history foreign key can see the new VA.
create or replace function public.va_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('Endorsed', 'Ready for endorsement') then
    raise exception 'That status is not available when adding a VA.';
  end if;
  return new;
end
$$;

create trigger va_profiles_insert_guard
  before insert on public.va_profiles
  for each row execute function public.va_insert_guard();

create or replace function public.va_added_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.status_history (va_id, previous_status, new_status, note, changed_by)
  values (new.id, null, new.status, 'Added to the monitoring sheet', auth.uid());
  return new;
end
$$;

create trigger va_profiles_added
  after insert on public.va_profiles
  for each row execute function public.va_added_history();

-- Endorsed only from Ready for endorsement, and only by an admin.
-- Ready / Continue onboarding are applied by the close trigger (depth >= 2)
-- or by an admin correcting a record.
create or replace function public.va_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  history_note text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'Endorsed' then
    if public.app_role() is distinct from 'admin' then
      raise exception 'Your role cannot do that.';
    end if;
    if old.status is distinct from 'Ready for endorsement' then
      raise exception 'Only a VA who is ready for endorsement can be endorsed.';
    end if;
    new.endorsed_by := auth.uid();
    new.endorsed_at := now();
  elsif new.status in ('Ready for endorsement', 'Continue onboarding') then
    if pg_trigger_depth() < 2 and public.app_role() is distinct from 'admin' then
      raise exception 'That status is set by closing a weekly evaluation.';
    end if;
    new.endorsed_by := null;
    new.endorsed_at := null;
  else
    new.endorsed_by := null;
    new.endorsed_at := null;
  end if;

  history_note := nullif(current_setting('cnr.status_note', true), '');
  insert into public.status_history (va_id, previous_status, new_status, note, changed_by)
  values (new.id, old.status, new.status, history_note, auth.uid());
  return new;
end
$$;

create trigger va_profiles_status
  before update on public.va_profiles
  for each row execute function public.va_status_guard();

create or replace function public.freeze_closed_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_va uuid;
  target_day date;
begin
  if TG_OP = 'DELETE' then
    target_va := old.va_id;
    target_day := old.work_date;
  else
    target_va := new.va_id;
    target_day := new.work_date;
  end if;
  if TG_OP = 'UPDATE' and old.work_date is distinct from new.work_date then
    if exists (
      select 1 from public.weekly_evaluations e
      where e.va_id = old.va_id
        and e.status = 'closed'
        and old.work_date >= e.week_start
        and old.work_date < e.week_start + 7
    ) then
      raise exception 'That day is in a closed week.';
    end if;
  end if;
  if exists (
    select 1 from public.weekly_evaluations e
    where e.va_id = target_va
      and e.status = 'closed'
      and target_day >= e.week_start
      and target_day < e.week_start + 7
  ) then
    raise exception 'That day is in a closed week.';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger attendance_days_freeze
  before insert or update or delete on public.attendance_days
  for each row execute function public.freeze_closed_attendance();

create or replace function public.freeze_closed_evaluation_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if exists (
      select 1 from public.weekly_evaluations e
      where e.id = old.evaluation_id and e.status = 'closed'
    ) then
      raise exception 'This week is closed and its scores cannot be changed.';
    end if;
    return old;
  end if;
  if TG_OP = 'UPDATE' and exists (
    select 1 from public.weekly_evaluations e
    where e.id in (old.evaluation_id, new.evaluation_id) and e.status = 'closed'
  ) then
    raise exception 'This week is closed and its scores cannot be changed.';
  end if;
  if TG_OP = 'INSERT' and exists (
    select 1 from public.weekly_evaluations e
    where e.id = new.evaluation_id and e.status = 'closed'
  ) then
    raise exception 'This week is closed and its scores cannot be changed.';
  end if;
  return new;
end
$$;

create trigger weekly_qa_freeze
  before insert or update or delete on public.weekly_qa
  for each row execute function public.freeze_closed_evaluation_child();
create trigger weekly_wbr_freeze
  before insert or update or delete on public.weekly_wbr
  for each row execute function public.freeze_closed_evaluation_child();
create trigger weekly_competencies_freeze
  before insert or update or delete on public.weekly_competencies
  for each row execute function public.freeze_closed_evaluation_child();

-- ---------------------------------------------------------------------------
-- KPI. Keep this formula aligned with js/score.js.
-- Empty section (null score): drop its weight and scale the rest to 100%.
-- A stored zero stays in the formula. Total leads 0 or blank => conversion null.
-- ---------------------------------------------------------------------------

create or replace function public.validate_kpi_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  keys text[] := array[
    'attendance', 'conversion', 'qa', 'tool_navigation',
    'communication', 'critical_thinking', 'core_values'
  ];
  section text;
  weight numeric;
  total numeric := 0;
  pass_mark numeric;
begin
  if new.key <> 'kpi' then
    return new;
  end if;
  pass_mark := (new.value->>'passMark')::numeric;
  if pass_mark is null or pass_mark < 0 or pass_mark > 100 then
    raise exception 'Pass mark must be between 0 and 100.';
  end if;
  foreach section in array keys loop
    if (new.value->'weights'->>section) is null then
      raise exception 'Weights must sum to 100.';
    end if;
    weight := (new.value->'weights'->>section)::numeric;
    if weight is null or weight < 0 then
      raise exception 'Weights must sum to 100.';
    end if;
    total := total + weight;
  end loop;
  if abs(total - 100) > 0.001 then
    raise exception 'Weights must sum to 100.';
  end if;
  return new;
end
$$;

create trigger app_settings_validate
  before insert or update on public.app_settings
  for each row execute function public.validate_kpi_settings();

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
    'conversion', 'Sales conversion',
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
  wbr public.weekly_wbr%rowtype;
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

  select * into wbr from public.weekly_wbr where evaluation_id = ev.id;
  if wbr.id is null or wbr.total_leads is null or wbr.total_leads = 0 then
    conversion := null;
  else
    conversion := least(100, coalesce(wbr.converted_leads, 0) / wbr.total_leads * 100);
  end if;

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

create or replace function public.apply_closed_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_status text;
  va_status text;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if new.outcome = 'ready_for_endorsement' then
      new_status := 'Ready for endorsement';
    elsif new.outcome = 'continue_onboarding' then
      new_status := 'Continue onboarding';
    else
      raise exception 'Closed evaluations need an outcome.';
    end if;
    select status into va_status from public.va_profiles where id = new.va_id;
    if va_status in ('Onboarding', 'Continue onboarding', 'Ready for endorsement') then
      perform set_config('cnr.status_applied', 'yes', true);
      if va_status is distinct from new_status then
        perform set_config('cnr.status_note', 'Closed week of ' || new.week_start::text, true);
        update public.va_profiles set status = new_status where id = new.va_id;
        perform set_config('cnr.status_note', '', true);
      end if;
    end if;
  end if;
  return new;
end
$$;

create trigger weekly_evaluations_apply
  after update on public.weekly_evaluations
  for each row execute function public.apply_closed_evaluation();

create or replace function public.close_weekly_evaluation(
  p_evaluation_id uuid,
  p_gaps text,
  p_coaching_actions text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.weekly_evaluations%rowtype;
  snap jsonb;
  did_pass boolean;
  gap_text text := nullif(trim(coalesce(p_gaps, '')), '');
  action_text text := nullif(trim(coalesce(p_coaching_actions, '')), '');
  applied boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;
  if public.app_role() not in ('admin', 'onboarder') then
    raise exception 'Your role cannot do that.';
  end if;

  select * into ev from public.weekly_evaluations where id = p_evaluation_id;
  if ev.id is null then
    raise exception 'Evaluation not found.';
  end if;
  if ev.status = 'closed' then
    raise exception 'This week is already closed.';
  end if;

  snap := public.compute_kpi_snapshot(ev.id);
  if snap->>'overall' is null then
    raise exception 'Enter at least one scored section before closing this week.';
  end if;
  did_pass := (snap->>'passed')::boolean;
  if not did_pass and (gap_text is null or action_text is null) then
    raise exception 'Gaps and coaching actions are required when the score is below the pass mark.';
  end if;

  perform set_config('cnr.status_applied', 'no', true);
  update public.weekly_evaluations
    set status = 'closed',
        outcome = case when did_pass then 'ready_for_endorsement' else 'continue_onboarding' end,
        gaps = gap_text,
        coaching_actions = action_text,
        score_snapshot = snap,
        closed_by = auth.uid(),
        closed_at = now()
    where id = ev.id;

  applied := current_setting('cnr.status_applied', true) = 'yes';
  return snap || jsonb_build_object(
    'statusApplied', applied,
    'vaStatus', (select status from public.va_profiles where id = ev.va_id)
  );
end
$$;

create or replace function public.endorse_va(p_va_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  va_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;
  if public.app_role() is distinct from 'admin' then
    raise exception 'Your role cannot do that.';
  end if;
  select status into va_status from public.va_profiles where id = p_va_id;
  if va_status is null then
    raise exception 'VA not found.';
  end if;
  if va_status is distinct from 'Ready for endorsement' then
    raise exception 'Only a VA who is ready for endorsement can be endorsed.';
  end if;
  perform set_config('cnr.status_note', 'Endorsed', true);
  update public.va_profiles set status = 'Endorsed' where id = p_va_id;
  perform set_config('cnr.status_note', '', true);
end
$$;

insert into public.app_settings (key, value)
values (
  'kpi',
  jsonb_build_object(
    'passMark', 80,
    'weights', jsonb_build_object(
      'attendance', 10,
      'conversion', 30,
      'qa', 20,
      'tool_navigation', 10,
      'communication', 10,
      'critical_thinking', 10,
      'core_values', 10
    )
  )
);

-- ---------------------------------------------------------------------------
-- RLS. Signed-in people can read. Writes follow the role matrix.
-- The SQL editor uses the postgres role and bypasses RLS. The anon key does not.
-- Onboarders may update every VA. That is intentional.
-- There is no client update policy on weekly_evaluations. Closing a week goes
-- through close_weekly_evaluation(), which recomputes the score.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'batches', 'va_profiles', 'attendance_days', 'weekly_evaluations',
    'weekly_qa', 'weekly_wbr', 'weekly_competencies', 'coaching_sessions',
    'status_history', 'app_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    execute format('grant select on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t
    );
  end loop;
end
$$;

grant usage on schema public to authenticated;

grant update on public.profiles to authenticated;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

grant insert, update on public.batches to authenticated;
create policy batches_insert on public.batches
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));
create policy batches_update on public.batches
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));

grant insert, update on public.va_profiles to authenticated;
create policy va_profiles_insert on public.va_profiles
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));
create policy va_profiles_update on public.va_profiles
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));

grant insert, update, delete on public.attendance_days to authenticated;
create policy attendance_days_insert on public.attendance_days
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));
create policy attendance_days_update on public.attendance_days
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));
create policy attendance_days_delete on public.attendance_days
  for delete to authenticated
  using (public.app_role() in ('admin', 'onboarder'));

grant insert, delete on public.weekly_evaluations to authenticated;
create policy weekly_evaluations_insert on public.weekly_evaluations
  for insert to authenticated
  with check (
    public.app_role() in ('admin', 'onboarder')
    and status = 'open'
    and outcome is null
    and score_snapshot is null
  );
create policy weekly_evaluations_delete on public.weekly_evaluations
  for delete to authenticated
  using (public.app_role() = 'admin' and status = 'open');

grant insert, update, delete on public.weekly_qa to authenticated;
create policy weekly_qa_insert on public.weekly_qa
  for insert to authenticated
  with check (public.app_role() in ('admin', 'qa'));
create policy weekly_qa_update on public.weekly_qa
  for update to authenticated
  using (public.app_role() in ('admin', 'qa'))
  with check (public.app_role() in ('admin', 'qa'));
create policy weekly_qa_delete on public.weekly_qa
  for delete to authenticated
  using (public.app_role() in ('admin', 'qa'));

grant insert, update, delete on public.weekly_wbr to authenticated;
create policy weekly_wbr_insert on public.weekly_wbr
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));
create policy weekly_wbr_update on public.weekly_wbr
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));
create policy weekly_wbr_delete on public.weekly_wbr
  for delete to authenticated
  using (public.app_role() in ('admin', 'onboarder'));

grant insert, update, delete on public.weekly_competencies to authenticated;
create policy weekly_competencies_insert on public.weekly_competencies
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));
create policy weekly_competencies_update on public.weekly_competencies
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));
create policy weekly_competencies_delete on public.weekly_competencies
  for delete to authenticated
  using (public.app_role() in ('admin', 'onboarder'));

grant insert, update, delete on public.coaching_sessions to authenticated;
create policy coaching_sessions_insert on public.coaching_sessions
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));
create policy coaching_sessions_update on public.coaching_sessions
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));
create policy coaching_sessions_delete on public.coaching_sessions
  for delete to authenticated
  using (public.app_role() in ('admin', 'onboarder'));

grant insert, update on public.app_settings to authenticated;
create policy app_settings_insert on public.app_settings
  for insert to authenticated
  with check (public.app_role() = 'admin');
create policy app_settings_update on public.app_settings
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- Functions: PUBLIC can execute new functions unless we revoke it.
revoke all on function public.app_role() from public;
revoke all on function public.ensure_profile() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.protect_last_admin() from public;
revoke all on function public.validate_kpi_settings() from public;
revoke all on function public.stamp_writer() from public;
revoke all on function public.va_insert_guard() from public;
revoke all on function public.va_added_history() from public;
revoke all on function public.va_status_guard() from public;
revoke all on function public.freeze_closed_attendance() from public;
revoke all on function public.freeze_closed_evaluation_child() from public;
revoke all on function public.apply_closed_evaluation() from public;
revoke all on function public.compute_kpi_snapshot(uuid) from public;
revoke all on function public.close_weekly_evaluation(uuid, text, text) from public;
revoke all on function public.endorse_va(uuid) from public;

grant execute on function public.app_role() to authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.compute_kpi_snapshot(uuid) to authenticated;
grant execute on function public.close_weekly_evaluation(uuid, text, text) to authenticated;
grant execute on function public.endorse_va(uuid) to authenticated;

comment on table public.profiles is
  'Role per auth user. admin: everything. onboarder: profiles, attendance, WBR, competencies, coaching, evaluations, all VAs. qa: QA score and links. viewer: read only.';
comment on table public.app_settings is
  'key kpi: {passMark, weights}. Weights must sum to 100. Empty KPI sections are rescaled in compute_kpi_snapshot.';
comment on column public.attendance_days.absent is
  'Full-day absence. Daily percent is 0. Otherwise (480 - late_minutes - downtime_minutes) / 480, floored at 0.';
