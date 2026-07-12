-- 008_goals.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- Weekly/monthly/quarterly/annual targets (M7). Introduces `cadence_type` —
-- the first of the 12 named enum types from the Supabase Implementation
-- Blueprint to get created, exactly where that doc staged it: alongside the
-- migration that first needs it, not front-loaded (the corrected rule from
-- Wave 2's `001_enums.sql` removal). Deliberately named generically rather
-- than `goal_cadence`, because `010_reviews.sql` needs the identical value set
-- and reuses this same type instead of defining a near-duplicate.

create type public.cadence_type as enum ('daily', 'weekly', 'monthly', 'quarterly', 'annual');

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text,
  cadence public.cadence_type not null,
  kpi_id uuid references public.kpi_definitions (id) on delete set null,
  target_value numeric,
  status text not null default 'active' check (status in ('active', 'achieved', 'missed', 'abandoned')),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: "what's active in the current period" drives the
-- Command Center goal widget.
create index goals_owner_period_idx
  on public.goals (owner_user_id, period_start, period_end);

alter table public.goals enable row level security;

create policy goals_owner_select
  on public.goals for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy goals_owner_insert
  on public.goals for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy goals_owner_update
  on public.goals for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — an abandoned goal is `status =
-- 'abandoned'`, kept for the Founder Behavior/Learning Engine's history.
