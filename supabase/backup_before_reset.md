# Back up the current Supabase data before the reset

The rebuilt app does not migrate old rows. `supabase/reset_old_schema.sql` **deletes** the old tracker tables. `auth.users` is not deleted, but everything in the tables below is.

Do this in the Supabase dashboard yourself. Do not commit the export. Employee data does not belong in git.

## Tables to export

These are the only application tables the old app created:

- `public.settings`
- `public.virtual_assistants` (including `schedule`, `sop_portfolio`, and `qa_monitoring` if the later migration was applied)
- `public.performance_records`
- `public.qa_records`
- `public.wbr_records`
- `public.competency_records`
- `public.coaching_records` (including `evaluation_id` if the later migration was applied)
- `public.movement_history`
- `public.evaluations` (only if `supabase/migrations/20261019_qa_stats.sql` was applied)

You do **not** need to export `auth.users`. The reset does not remove accounts. A screenshot of Authentication → Users (email and id) is still a useful record.

## 1. Project backup

1. Open [supabase.com](https://supabase.com) and select this project.
2. Go to **Database → Backups**.
3. If the plan offers a backup you can restore or download, note the newest successful time, or start one now and wait until it finishes.
4. Free projects often cannot download a full backup. If that is the case, the CSV export below is the copy that matters. Do not skip it.

## 2. Export each table

1. Open **SQL Editor → New query**.
2. For every table in the list, run:

```sql
select * from public.settings;
```

Replace `settings` with the next table name. If a query says the relation does not exist, that table was never created. Skip it and move on.

3. Download the result (the SQL editor result pane has a download / CSV action). Name the file after the table, for example `settings.csv`.
4. Repeat until every table that exists has its own file.
5. Put the files somewhere you control that is **not** this git repository: a private drive folder is enough. Do not attach them to the repo, a pull request, or chat.

## 3. Confirm before you reset

- You can open each CSV and see the header row.
- The row counts look like the Table Editor counts.
- The files are stored outside the repo.

Then follow the run order in the README. The reset script will not drop anything until you edit its safety latch from `NO` to `YES`.
