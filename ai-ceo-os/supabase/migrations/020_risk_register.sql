-- 020_risk_register.sql
-- AI CEO OS — Wave 2b, Relationship & Memory
--
-- The living risk register (M5), reviewed quarterly per the Infrastructure &
-- Operations Blueprint. `impact` and `likelihood` reuse the same
-- high/medium/low scale already used for `confidence` throughout this
-- project (Wave 2a's design docs, decision_log, research_library) rather
-- than inventing a new risk-specific scale — one universal 3-tier vocabulary
-- for "how much/how sure" across the whole system.

create table public.risk_register (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text,
  category text,
  impact text not null check (impact in ('high', 'medium', 'low')),
  likelihood text not null check (likelihood in ('high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'mitigated', 'accepted', 'closed')),
  mitigation_plan text,
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Risk Center's default view is "open risks."
create index risk_register_owner_status_idx
  on public.risk_register (owner_user_id, status);

alter table public.risk_register enable row level security;

create policy risk_register_owner_select
  on public.risk_register for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy risk_register_owner_insert
  on public.risk_register for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy risk_register_owner_update
  on public.risk_register for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a resolved risk is `status =
-- 'closed'`, kept for quarterly review history, never removed.
