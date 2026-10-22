-- Not applied. The live database and supabase/schema.sql still reject this.
-- Today va_status_guard lets an admin set Endorsed only when the current
-- status is Ready for endorsement. An onboarder cannot set Endorsed at all.
-- Resigned and EOC are already allowed for an admin or an onboarder.
--
-- Apply this only if Endorsed should be set from the Status menu in one step,
-- from any current status, by an admin or an onboarder. It stamps endorsed_by
-- and endorsed_at. Other status rules stay as they are.

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
    if public.app_role() not in ('admin', 'onboarder') then
      raise exception 'Your role cannot do that.';
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
