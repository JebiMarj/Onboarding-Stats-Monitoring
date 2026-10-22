# Create & Reach VA Services — Onboarding QA

Static site for weekly onboarding QA. There is no build step. Supabase provides Postgres and email/password sign-in. Row Level Security enforces roles.

The screen uses the earlier rose and stone palette, with a top navigation bar across the page. Weekly attendance by minutes, competency comments, coaching actions, the KPI, and endorsement use that layout. The database underneath is the current schema.

The hosted project already has that schema, with one admin profile and no VA rows. Do not run the reset again, and do not import old VA records. This repository does not add a migration. The SQL steps below are only for a brand-new database.

## Files

- `index.html`, `app.css`, `logo.png`, `favicon.svg` — the page
- `config.js` — Supabase project URL and anon key
- `js/` — dates, labels, scoring, permissions, in-memory rules, data access, and the screen
- `supabase/backup_before_reset.md` — export the current data before anything is dropped
- `supabase/reset_old_schema.sql` — drops the old app tables only, after you edit the safety latch
- `supabase/schema.sql` — new tables, triggers, and RLS
- `supabase/grant_first_admin.sql` — appoints the first admin
- `render.yaml` — the existing Render static site (`cnr-va-tracker`)
- `test/` — scoring, flow, contrast, and an optional Postgres check

`cnr-seed-data.json` is not part of this app. It is listed in `.gitignore`. Older commits still contain it.

## 1. Back up, then reset, then install

Run these yourself in the Supabase SQL editor. This repository does not connect to the hosted project.

1. Follow `supabase/backup_before_reset.md` and store the export outside git.
2. Open `supabase/reset_old_schema.sql`. Change the latch from `NO` to `YES`. Run the whole file once. It drops only the old tables (`settings`, `virtual_assistants`, `performance_records`, `qa_records`, `wbr_records`, `competency_records`, `coaching_records`, `movement_history`, `evaluations`). It does not touch `auth.users` or the new table names.
3. Run `supabase/schema.sql` once. If `public.va_profiles` already exists, the file stops. It is not a migration.
4. Authentication → Users → Add user. Turn on Auto Confirm User.
5. Put that exact email into `supabase/grant_first_admin.sql` in place of `replace-with-your-email@example.com`, then run it. The app cannot appoint the first admin, because nobody would be allowed to open the user list yet.
6. Authentication → Sign In / Providers: turn off “Allow new users to sign up”.
7. Do not run `supabase/migrations/20261019_qa_stats.sql`. That file is removed. Do not import `cnr-seed-data.json`.

Later admins are appointed in Settings. The last admin cannot be demoted.

## 2. Config

`config.js` already has the project URL and the anon public key. Leave that key in place. Never put the service-role key in this file, in a commit, or in the Render environment. The anon key is public; RLS is what limits each signed-in person.

Opening the site as `/?mock=1` stores a preview in this browser and does not call Supabase.

## 3. Render

The site is a static site. Publish directory: `.` Build command: empty.

`render.yaml` describes the existing service named `cnr-va-tracker`. If that service is already connected to this repo, do not create a second one. Confirm the publish directory and the empty build command. The hosted project this repo points at already has the current schema. On a brand-new project, deploy only after the SQL in section 1 has been applied.

Pushing `main` redeploys if auto-deploy is on.

## Roles

Anyone who can sign in can read. The database enforces writes. The screen hides buttons the role cannot use, but that is not the control.

| Role | Can change |
| --- | --- |
| Admin | Everything, including settings, roles, and Endorse |
| Onboarder | VA profiles, batches, attendance, WBR, competencies, coaching, and weekly evaluations |
| QA | QA score, evaluation-form link, and call-recording link |
| Viewer | Nothing. This is the default for a new account |

Onboarders can update every VA, not only the ones they onboard. That keeps a one-person team from having to reassign records. QA cannot close a week, and an onboarder cannot edit a QA score.

Endorse is a separate admin action. It is allowed only when the status is Ready for endorsement, and it records who did it and when.

## Weekly flow

Training completed → Add VA (name, onboarding start, onboarder, client, business, SOP or portfolio, status, schedule, batch) → Save. The name opens that person’s monitoring page.

Start a weekly evaluation on a Monday. The next week is created with Next weekly evaluation after the current week is closed. One week per VA can be open.

Each work day has one attendance row. Eight hours is 480 minutes and scores 100%. A full-day absence is 0%. Otherwise the day is `(480 − late minutes − downtime minutes) / 480 × 100`, and it cannot go below 0. Weekly attendance is the average of the days that were saved. A day with no row is left out of the average.

Weekly QA is a score from 0 to 100 plus an evaluation-form link. The call-recording link is optional. Links must be `http` or `https`.

Weekly WBR stores total leads and converted leads. The conversion rate is `converted / total × 100`, capped at 100. If total leads is blank or 0, the rate is N/A and that section drops out of the score.

Competencies are tool navigation, communication, critical thinking, and core values. Each is 0–100 and has its own comment. An onboarder enters them.

Coaching is a date, topic, discussion, and action. It is history only. It is not in the score, and a closed week does not freeze it.

## KPI formula

Default weights, editable in Settings, must sum to 100:

| Section | Weight |
| --- | --- |
| Attendance | 10% |
| Sales conversion | 30% (the score is the conversion rate itself) |
| QA score | 20% |
| Tool navigation | 10% |
| Communication | 10% |
| Critical thinking | 10% |
| Core values | 10% |

A blank section is left out. The remaining weights are scaled so they sum to 100%. A stored zero stays in the formula. Example: only attendance is entered, at 90%. Its effective weight becomes 100%, and the overall score is 90.

Overall = sum of (section score × effective weight / 100). The monitoring page shows that sentence and the breakdown. Closing a week asks Postgres to compute the same snapshot again, so the saved score is not whatever the browser last displayed. Later edits to Settings do not rewrite a closed week.

The pass mark defaults to 80 and can be changed in Settings. A score of 80 meets it. A score of 79.99 does not.

- At or above the pass mark, closing sets the status to Ready for endorsement. Endorse is the next click, and only an admin can do it.
- Below the pass mark, gaps and coaching actions are required. Closing then sets Continue onboarding.
- Resigned, EOC, and Endorsed are left as they are when a week closes. An admin can correct Onboarding, Continue onboarding, Ready for endorsement, Resigned, and EOC from the monitoring page. Endorsed cannot be typed in. It only comes from Endorse, and only from Ready for endorsement.

## Batches

Each batch has a stable id. Rename it on the Batches page. The new name shows on the VA list and on the monitoring page. The id on each VA does not change.

## Local preview and tests

From this folder:

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/?mock=1`. Preview accounts (this browser only):

- `admin@local.test` / `admin`
- `onboarder@local.test` / `onboarder`
- `qa@local.test` / `qa`
- `viewer@local.test` / `viewer`

Automated checks, no install and no network:

```bash
node --test
```

That covers attendance minute math, a full-day absence, the weekly average, conversion, rescaling, the weight total, and the 80 / 79.99 pass-mark boundary, plus the in-memory weekly flow and the light/dark color pairs.

`test/sql.test.js` loads `supabase/schema.sql` in a local Postgres (via `@electric-sql/pglite`) and checks that the SQL snapshot matches `js/score.js`, including role denials. It skips when that package is not installed. There is no `package.json` on purpose, so Render will not try to build the site. Do not point that test at the hosted project.

## Theme

The page follows the system light or dark setting. Dark mode / Light mode saves the choice in this browser under `cnr_theme` and `cnr-theme`. The navigation bar can collapse to icons. That choice is saved under `cnr-nav`.

## Screens

The top bar holds Onboarding (Board, VA Directory, Batches), Performance (Performance log, Feedback sessions, QA sheet), Training (Results, Reports), and Reports. Search, the theme control, and the account menu sit on the right. Settings and sign out are in the account menu. A narrow window folds the menus into one menu button.

The profile steps are overview, daily attendance, QA, WBR, competencies, feedback sessions, weekly KPI, and movement history.

The board columns are Onboarding, Continue onboarding, Ready for endorsement, and Endorsed. Resigned and EOC sit under the board. A card opens the profile. Status changes that the database reserves — closing a week, and Endorse — stay on those actions. The directory starts empty. Search is the control on the right of the bar, and the `/` key.
