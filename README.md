# Create & Reach VA Performance Tracker

Static web app (no build step) + Supabase (database and login) hosted on Render.

## Files
- `index.html`  the whole app
- `config.js`  your Supabase URL and anon key
- `supabase/schema.sql`  tables and security rules
- `render.yaml`  Render static-site settings
- `private/cnr-seed-data.json`  your workbook data, ready to import. Not committed (see `.gitignore`).

## 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor, New query, paste `supabase/schema.sql`, Run.
3. Authentication, Users, Add user: Marj's email and a strong password, with Auto Confirm User ticked.
4. Authentication, Sign In / Providers: turn OFF "Allow new users to sign up" so nobody else can create an account.
5. Project Settings, API: copy the Project URL and the `anon` public key into `config.js`.
   Never use the `service_role` key in this app.

## 2. GitHub
Create a PRIVATE repo and push this folder. `private/` is ignored, so employee data is not uploaded.

## 3. Render
New, Static Site, pick the repo. Build command: leave empty. Publish directory: `.`
Every push to the main branch redeploys.

## 4. First run
Open the Render URL, sign in with Marj's email and password, then Settings, Import data file, and choose
`private/cnr-seed-data.json`. After that, every edit saves to Supabase automatically (top bar shows Saved).

## Good to know
- The "View as" role selector only changes what the screen allows. It is not server-side security. Every signed-in user can read and write everything, so keep to one account until roles are added in Supabase.
- Edits are last-write-wins. Fine for one user; for several people editing at once, add per-row version checks.
- Records are archived, never deleted. Back up from Supabase (Database, Backups) or with Settings, Export data.
- Supabase free projects pause after about a week of no use. Open the dashboard to wake it.
