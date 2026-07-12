-- 011_trading_rules.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- M2 Trading Discipline's rule set. Unlike `kpi_definitions` (a business-wide
-- catalog), a trading rule belongs to the individual trader who set it — a
-- future second trader on the team would keep their own discipline rules, not
-- share the founder's — so this table carries owner_user_id like the other
-- personal-record tables in this wave, not the admin-catalog pattern.

create table public.trading_rules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text not null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trading_rules enable row level security;

create policy trading_rules_owner_select
  on public.trading_rules for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy trading_rules_owner_insert
  on public.trading_rules for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy trading_rules_owner_update
  on public.trading_rules for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a retired rule is `is_active =
-- false`; `rule_violations` may still reference it historically.
