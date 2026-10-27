-- Admin-only delete for one VA.
-- John applies this after review. Do not run it against the hosted project from the app.
--
-- What this changes
-- * authenticated may DELETE public.va_profiles only when app_role() is admin
--   (policy va_profiles_delete). Onboarder, QA, and viewer deletes match no rows.
-- * public.delete_va(uuid) is the supported delete. It checks the admin role again,
--   then deletes that one VA. Foreign keys cascade, so this VA's attendance, WBR,
--   weekly evaluations, QA, weekly competencies, coaching, movement history, and
--   (when the table is still present) legacy weekly_wbr rows go with it.
--   competency_entries go too when that table exists, because it references va_profiles.
-- * User triggers on those child tables are disabled only for this delete, then
--   enabled again. That is what lets a closed week or finalized attendance leave
--   with the VA. Ordinary edits still hit those triggers. Other VAs are not in
--   the DELETE, so their rows stay. Batches stay.
-- * A before-delete trigger rejects a direct delete unless the caller is an admin,
--   and sets cnr.deleting_va so child delete policies can see which VA is leaving.
-- * status_history gains an admin delete policy that matches only while that
--   setting is the same VA. weekly_evaluations_delete still allows an admin to
--   delete an open week, and also a closed week while that VA is being deleted.
--
-- This file does not replace freeze_closed_attendance(). A direct DELETE FROM
-- va_profiles on a database that still has the old freeze functions can still
-- fail for a closed week or finalized attendance. The app calls delete_va().
-- Safe to run before or after the other 20261022 migrations: it does not read
-- attendance_finalized_at and it does not create competency_entries or wbr_days.

grant delete on table public.va_profiles to authenticated;

drop policy if exists va_profiles_delete on public.va_profiles;
create policy va_profiles_delete on public.va_profiles
  for delete to authenticated
  using (public.app_role() = 'admin');

drop policy if exists weekly_evaluations_delete on public.weekly_evaluations;
create policy weekly_evaluations_delete on public.weekly_evaluations
  for delete to authenticated
  using (
    public.app_role() = 'admin'
    and (
      status = 'open'
      or va_id::text = nullif(current_setting('cnr.deleting_va', true), '')
    )
  );

grant delete on table public.status_history to authenticated;

drop policy if exists status_history_delete on public.status_history;
create policy status_history_delete on public.status_history
  for delete to authenticated
  using (
    public.app_role() = 'admin'
    and va_id::text = nullif(current_setting('cnr.deleting_va', true), '')
  );

create or replace function public.delete_va(p_va_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  touched text[] := array[]::text[];
  qual text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;
  if public.app_role() is distinct from 'admin' then
    raise exception 'Your role cannot do that.';
  end if;
  if not exists (select 1 from public.va_profiles where id = p_va_id) then
    raise exception 'VA not found.';
  end if;

  perform set_config('cnr.deleting_va', p_va_id::text, true);

  for rec in
    select distinct n.nspname as nsp, c.relname as rel
    from pg_constraint fk
    join pg_class c on c.oid = fk.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class parent on parent.oid = fk.confrelid
    join pg_namespace pn on pn.oid = parent.relnamespace
    where fk.contype = 'f'
      and n.nspname = 'public'
      and pn.nspname = 'public'
      and parent.relname in ('va_profiles', 'weekly_evaluations')
  loop
    qual := format('%I.%I', rec.nsp, rec.rel);
    execute format('alter table %s disable trigger user', qual);
    touched := array_append(touched, qual);
  end loop;

  begin
    delete from public.va_profiles where id = p_va_id;
  exception
    when others then
      foreach qual in array touched loop
        execute format('alter table %s enable trigger user', qual);
      end loop;
      perform set_config('cnr.deleting_va', '', true);
      raise;
  end;

  foreach qual in array touched loop
    execute format('alter table %s enable trigger user', qual);
  end loop;
  perform set_config('cnr.deleting_va', '', true);
end
$$;

create or replace function public.va_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Your role cannot do that.';
  end if;
  perform set_config('cnr.deleting_va', old.id::text, true);
  return old;
end
$$;

drop trigger if exists va_profiles_delete_guard on public.va_profiles;
create trigger va_profiles_delete_guard
  before delete on public.va_profiles
  for each row execute function public.va_delete_guard();

revoke all on function public.delete_va(uuid) from public;
revoke all on function public.va_delete_guard() from public;
grant execute on function public.delete_va(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.delete_va(uuid) from anon';
    execute 'revoke all on function public.va_delete_guard() from anon';
  end if;
end
$$;

comment on function public.delete_va(uuid) is
  'Admin only. Permanently deletes one VA and rows that belong to that VA (attendance, WBR, QA, competencies, evaluations, coaching, movement history, and legacy weekly_wbr when that table is still present). Other VAs and batches stay.';
