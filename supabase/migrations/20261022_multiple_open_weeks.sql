-- Drop the one-open-week index so a VA can have more than one open week.
-- John applied this drop on the live database. The insert policy was not changed.
-- weekly_evaluations_insert stays admin and onboarder only. QA cannot insert a week.
-- Re-running this file is safe: it only drops the index if it is still there.

drop index if exists public.weekly_evaluations_one_open_idx;
