-- Finalize attendance for one VA.
-- John applies this after review. Do not run it against the hosted project from the app.
-- While attendance_finalized_at is set, that VA's attendance rows cannot be added, edited, or deleted.
-- An admin or onboarder can set the lock. Only an admin can clear it.
-- freeze_closed_attendance() also runs for wbr_days. The finalized check applies only when
-- TG_TABLE_NAME = 'attendance_days'. Closed-week checks still apply to both tables.
-- A closed week still blocks its own days after the lock is cleared.

alter table public.va_profiles
  add column if not exists attendance_finalized_at timestamptz,
  add column if not exists attendance_finalized_by uuid references public.profiles (id) on delete set null;

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
  if new.attendance_finalized_at is not null or new.attendance_finalized_by is not null then
    raise exception 'Finalize attendance after the VA exists.';
  end if;
  return new;
end
$$;

create or replace function public.guard_attendance_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attendance_finalized_at is not distinct from old.attendance_finalized_at
     and new.attendance_finalized_by is not distinct from old.attendance_finalized_by then
    return new;
  end if;
  if old.attendance_finalized_at is null and new.attendance_finalized_at is not null then
    if public.app_role() not in ('admin', 'onboarder') then
      raise exception 'You cannot finalize attendance.';
    end if;
    new.attendance_finalized_at := now();
    new.attendance_finalized_by := auth.uid();
    return new;
  end if;
  if old.attendance_finalized_at is not null and new.attendance_finalized_at is null then
    if public.app_role() is distinct from 'admin' then
      raise exception 'Only an admin can undo finalized attendance.';
    end if;
    new.attendance_finalized_by := null;
    return new;
  end if;
  raise exception 'Attendance finalization can only be set or cleared.';
end
$$;

drop trigger if exists va_profiles_attendance_finalize on public.va_profiles;
create trigger va_profiles_attendance_finalize
  before update on public.va_profiles
  for each row execute function public.guard_attendance_finalize();

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
  if TG_TABLE_NAME = 'attendance_days' and exists (
    select 1 from public.va_profiles v
    where v.id = target_va
      and v.attendance_finalized_at is not null
  ) then
    raise exception 'Attendance is finalized.';
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

revoke all on function public.guard_attendance_finalize() from public;

comment on column public.va_profiles.attendance_finalized_at is
  'When set, attendance rows for this VA cannot be inserted, updated, or deleted. Only an admin can clear it.';
comment on column public.va_profiles.attendance_finalized_by is
  'Profile that finalized attendance. Stamped by guard_attendance_finalize.';
