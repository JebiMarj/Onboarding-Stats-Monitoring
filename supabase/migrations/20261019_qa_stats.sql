-- QA Stats Monitoring. Additive only.
-- Apply once in the Supabase SQL editor after supabase/schema.sql.
-- Do not run this from the app. It does not update existing rows, and it
-- does not drop or replace policies on tables that already exist.
--
-- Weekly weights, the pass mark, the missing-section rule, and batch display
-- names are stored in the existing public.settings table (jsonb values):
--   weights      {"attendance":10,"conversion":30,"qa":20,"tool":10,"communication":10,"thinking":10,"core":10}
--   kpiPass      80
--   missingRule  "rescale"
--   batchNames   {"2026-01":"January intake"}
-- Batch ids stay on virtual_assistants.batch. batchNames only changes the label.

alter table public.virtual_assistants
  add column if not exists schedule text,
  add column if not exists sop_portfolio text,
  add column if not exists qa_monitoring boolean;

comment on column public.virtual_assistants.qa_monitoring is
  'True once training is complete and the VA is on the QA sheet. Null leaves existing rows off the sheet.';

alter table public.coaching_records
  add column if not exists evaluation_id text;

create table if not exists public.evaluations (
  id text primary key,
  va_id text not null references public.virtual_assistants(id),
  week_start date not null,
  scheduled_hours numeric,
  absence_days numeric,
  late_minutes numeric,
  downtime_minutes numeric,
  qa_score numeric,
  eval_form_url text,
  call_recording_url text,
  total_leads numeric,
  converted_leads numeric,
  tool_navigation numeric,
  communication numeric,
  critical_thinking numeric,
  core_values numeric,
  competency_comment text,
  overall_score numeric,
  outcome text,
  gaps text,
  coaching_actions text,
  closed boolean not null default false,
  archived boolean not null default false,
  created_by text,
  created_at timestamptz default now(),
  updated_by text,
  updated_at timestamptz
);

create index if not exists eval_va_week_idx on public.evaluations(va_id, week_start);

-- New table only. Existing policies are left as they are.
alter table public.evaluations enable row level security;
drop policy if exists "signed-in users full access" on public.evaluations;
create policy "signed-in users full access"
  on public.evaluations
  for all
  to authenticated
  using (true)
  with check (true);
