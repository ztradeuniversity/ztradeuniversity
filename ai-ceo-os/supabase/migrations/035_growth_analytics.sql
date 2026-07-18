-- 035_growth_analytics.sql
-- AI CEO OS — Growth Analytics Dashboard (the intelligence layer).
--
-- IMPACT REVIEW (failed — hence two new tables): the daily lightweight
-- metric capture, the founder's free-text observations, and the founder's
-- accept/reject/remind-later decisions on AI recommendations have no home in
-- the existing schema. daily_activities is the task checklist; kpi_history is
-- weekly per-KPI catalog values; content_library / ib_clients / institutes
-- hold entities, not a daily journal or a decision log. So two minimal,
-- owner-scoped tables — no existing analytics is duplicated (funnel / Pareto /
-- dimensions stay computed live by intelligence.js and are only READ here).

-- 1) Daily capture: one row per (owner, date). metrics is jsonb so a new
--    metric can be added later with zero schema churn.
create table public.growth_daily (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  entry_date date not null,
  metrics jsonb not null default '{}'::jsonb,
  wins text,
  problems text,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, entry_date)
);

create index growth_daily_owner_date_idx
  on public.growth_daily (owner_user_id, entry_date desc);

alter table public.growth_daily enable row level security;

create policy growth_daily_owner_select on public.growth_daily
  for select using (owner_user_id = auth.uid() or public.is_admin());
create policy growth_daily_owner_insert on public.growth_daily
  for insert with check (owner_user_id = auth.uid() or public.is_admin());
create policy growth_daily_owner_update on public.growth_daily
  for update using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- 2) Recommendation decisions: one row per (owner, rec_key). Recommendations
--    themselves are generated deterministically on load; this table only
--    records the founder's Accept / Reject / Remind-Later so a decision is
--    respected and nothing ever changes without approval.
create table public.growth_signal (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  rec_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'remind_later')),
  remind_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, rec_key)
);

create index growth_signal_owner_idx
  on public.growth_signal (owner_user_id, status);

alter table public.growth_signal enable row level security;

create policy growth_signal_owner_select on public.growth_signal
  for select using (owner_user_id = auth.uid() or public.is_admin());
create policy growth_signal_owner_insert on public.growth_signal
  for insert with check (owner_user_id = auth.uid() or public.is_admin());
create policy growth_signal_owner_update on public.growth_signal
  for update using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy on either table (no-hard-deletes rule) — a day's journal
-- and a founder's past decision stay on record so the learning engine has
-- real history.
