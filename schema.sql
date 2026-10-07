-- Create & Reach VA Performance Tracker: Supabase schema
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

create table if not exists public.virtual_assistants (
  id          text primary key,
  name        text not null,
  status      text not null default 'Onboarding',
  client      text,
  business    text,
  trainer     text,
  role        text,                       -- onboarding stage: Shadowing / Backup VA / Main VA
  ob_date     date,                       -- onboarding start
  end_date    date,                       -- endorsement date
  batch       text,                       -- YYYY-MM intake
  endorsement jsonb not null default '{"stage":"Not Yet Ready"}',
  training    jsonb,                      -- {review, final}
  updated_by  text,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);
create index if not exists va_status_idx on public.virtual_assistants(status);
create index if not exists va_batch_idx  on public.virtual_assistants(batch);

create table if not exists public.performance_records (
  id         text primary key,
  va_id      text not null references public.virtual_assistants(id),
  date       date not null,
  att        text,                        -- Present / Absent / Late / Leave / Rest Day / Holiday / Resigned / Other
  att_raw    text,                        -- original spreadsheet value
  down       numeric,                     -- downtime, minutes
  down_note  text,
  eod        text,
  remarks    text,
  qa_note    text,
  archived   boolean not null default false,
  created_by text, created_at timestamptz default now(),
  updated_by text, updated_at timestamptz
);
create index if not exists perf_va_date_idx on public.performance_records(va_id, date);

create table if not exists public.qa_records (
  id text primary key,
  va_id text not null references public.virtual_assistants(id),
  date date not null,
  score numeric not null check (score between 0 and 100),
  note text,
  archived boolean not null default false,
  created_by text, created_at timestamptz default now(),
  updated_by text, updated_at timestamptz
);
create index if not exists qa_va_date_idx on public.qa_records(va_id, date);

create table if not exists public.wbr_records (
  id text primary key,
  va_id text not null references public.virtual_assistants(id),
  date date not null,
  total_leads numeric,                    -- null = N/A
  converted_leads numeric,
  remarks text,
  archived boolean not null default false,
  created_by text, created_at timestamptz default now(),
  updated_by text, updated_at timestamptz
);
create index if not exists wbr_va_date_idx on public.wbr_records(va_id, date);

create table if not exists public.competency_records (
  id text primary key,
  va_id text not null references public.virtual_assistants(id),
  date date not null,
  tool_navigation numeric, critical_thinking numeric, communication numeric, core_values numeric, eod numeric,
  archived boolean not null default false,
  created_by text, created_at timestamptz default now(),
  updated_by text, updated_at timestamptz
);
create index if not exists comp_va_date_idx on public.competency_records(va_id, date);

create table if not exists public.coaching_records (
  id text primary key,
  va_id text not null references public.virtual_assistants(id),
  date date,
  topic text,                             -- imported feedback-session notes
  challenge text, goal text, action_plan text, commitment text,
  target_date date, followup_date date,
  coach text,
  status text not null default 'Open',    -- Open / In Progress / For Follow-up / Completed
  archived boolean not null default false,
  created_by text, created_at timestamptz default now(),
  updated_by text, updated_at timestamptz
);
create index if not exists coach_va_idx on public.coaching_records(va_id, date);

create table if not exists public.movement_history (
  id text primary key,
  va_id text not null references public.virtual_assistants(id),
  previous_status text,
  new_status text not null,
  effective_date date,
  client text, business text, remarks text,
  updated_by text,
  created_at timestamptz default now()
);
create index if not exists mv_va_idx on public.movement_history(va_id, effective_date);

-- Row Level Security: only signed-in users can read or write. Anonymous visitors get nothing.
do $$
declare t text;
begin
  foreach t in array array['settings','virtual_assistants','performance_records','qa_records','wbr_records','competency_records','coaching_records','movement_history']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "signed-in users full access" on public.%I', t);
    execute format('create policy "signed-in users full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
