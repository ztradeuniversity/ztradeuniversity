-- 012_trading_records.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- The OS's own trading journal (M2) — system-of-record going forward, per the
-- Integration Blueprint's decision (Prompt 1, Step 5): the existing ZTU
-- journal is a one-time historical import only, never a live sync, so two
-- systems never both claim to be the source of truth. `source` distinguishes
-- an imported historical row from one the founder logs directly here.

create table public.trading_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  instrument text not null,
  direction text not null check (direction in ('long', 'short')),
  entry_price numeric,
  exit_price numeric,
  position_size numeric,
  opened_at timestamptz,
  closed_at timestamptz,
  outcome text check (outcome in ('win', 'loss', 'breakeven', 'open')),
  pnl numeric,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'ztu_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Trading Journal view is always "most recent
-- trades first."
create index trading_records_owner_opened_idx
  on public.trading_records (owner_user_id, opened_at desc);

alter table public.trading_records enable row level security;

create policy trading_records_owner_select
  on public.trading_records for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy trading_records_owner_insert
  on public.trading_records for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy trading_records_owner_update
  on public.trading_records for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — `rule_violations` may reference
-- any row here, and the journal's integrity depends on nothing disappearing.
