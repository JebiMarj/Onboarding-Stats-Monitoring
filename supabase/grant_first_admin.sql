-- Give the first signed-in person the Admin role.
--
-- Run this AFTER supabase/schema.sql.
-- 1. Authentication → Users → Add user. Turn on Auto Confirm User.
-- 2. Replace the email below with that exact address.
-- 3. Run this file once in the SQL editor.
--
-- The app cannot appoint the first admin on its own: nobody would be allowed
-- to open the user list yet. Later admins are appointed in Settings.

do $$
declare
  admin_email text := 'replace-with-your-email@example.com';
  appointed int;
begin
  if admin_email like 'replace-with-%' then
    raise exception 'Edit the email in supabase/grant_first_admin.sql before running it.';
  end if;

  insert into public.profiles (id, email, full_name, role)
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
    'admin'
  from auth.users u
  where lower(u.email) = lower(admin_email)
  on conflict (id) do update
    set role = 'admin',
        email = excluded.email;

  get diagnostics appointed = row_count;
  if appointed = 0 then
    raise exception 'No Authentication user found for %. Create that user first, then run this again.', admin_email;
  end if;
end
$$;
