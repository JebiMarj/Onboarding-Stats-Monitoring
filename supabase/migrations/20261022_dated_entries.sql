-- Dated QA ranges and more than one competency score per person.
-- Do not apply this until it is approved. The app keeps working without it:
-- saving a QA range says the database update is required, and the competency
-- list does the same. Existing QA rows, weekly scores, and coaching are unchanged.
-- Re-running this file is safe.

alter table public.weekly_qa add column if not exists period_start date;
alter table public.weekly_qa add column if not exists period_end date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weekly_qa_period_order'
      and conrelid = 'public.weekly_qa'::regclass
  ) then
    alter table public.weekly_qa
      add constraint weekly_qa_period_order
      check (period_end is null or period_start is null or period_end >= period_start);
  end if;
end
$$;

create table if not exists public.competency_entries (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references public.va_profiles (id) on delete cascade,
  competency text not null check (competency in (
    'tool_navigation', 'critical_thinking', 'communication', 'core_values'
  )),
  entry_date date not null,
  score numeric not null check (score >= 0 and score <= 100),
  comment text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists competency_entries_va_idx
  on public.competency_entries (va_id, competency, entry_date);

drop trigger if exists competency_entries_stamp on public.competency_entries;
create trigger competency_entries_stamp
  before insert or update on public.competency_entries
  for each row execute function public.stamp_writer();

create or replace function public.freeze_closed_competency_entry()
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
    target_day := old.entry_date;
  else
    target_va := new.va_id;
    target_day := new.entry_date;
  end if;
  if TG_OP = 'UPDATE' and old.entry_date is distinct from new.entry_date then
    if exists (
      select 1 from public.weekly_evaluations e
      where e.va_id = old.va_id
        and e.status = 'closed'
        and old.entry_date >= e.week_start
        and old.entry_date < e.week_start + 7
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

drop trigger if exists competency_entries_freeze on public.competency_entries;
create trigger competency_entries_freeze
  before insert or update or delete on public.competency_entries
  for each row execute function public.freeze_closed_competency_entry();

alter table public.competency_entries enable row level security;
revoke all on table public.competency_entries from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.competency_entries from anon';
  end if;
end
$$;
grant select, insert, update, delete on table public.competency_entries to authenticated;

drop policy if exists competency_entries_select on public.competency_entries;
create policy competency_entries_select on public.competency_entries
  for select to authenticated
  using (true);

drop policy if exists competency_entries_insert on public.competency_entries;
create policy competency_entries_insert on public.competency_entries
  for insert to authenticated
  with check (public.app_role() in ('admin', 'onboarder'));

drop policy if exists competency_entries_update on public.competency_entries;
create policy competency_entries_update on public.competency_entries
  for update to authenticated
  using (public.app_role() in ('admin', 'onboarder'))
  with check (public.app_role() in ('admin', 'onboarder'));

drop policy if exists competency_entries_delete on public.competency_entries;
create policy competency_entries_delete on public.competency_entries
  for delete to authenticated
  using (public.app_role() in ('admin', 'onboarder'));

revoke all on function public.freeze_closed_competency_entry() from public;
