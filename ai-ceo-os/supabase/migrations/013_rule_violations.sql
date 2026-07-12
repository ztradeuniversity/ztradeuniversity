-- 013_rule_violations.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- Closes the M2 Trading Discipline loop: links a logged trade to a broken
-- rule. `trading_record_id` is nullable — a discipline violation (e.g.
-- over-trading, revenge-trading) can be logged as a standalone event without
-- being tied to one specific trade; `trading_rule_id` is required, since a
-- violation only means something in reference to a stated rule.

create table public.rule_violations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  trading_record_id uuid references public.trading_records (id) on delete cascade,
  trading_rule_id uuid not null references public.trading_rules (id) on delete cascade,
  severity text not null default 'minor' check (severity in ('minor', 'major', 'critical')),
  notes text,
  created_at timestamptz not null default now()
);

-- Certain access pattern: violations are always read in the context of a
-- specific trade or the owner's full discipline history.
create index rule_violations_owner_record_idx
  on public.rule_violations (owner_user_id, trading_record_id);

alter table public.rule_violations enable row level security;

create policy rule_violations_owner_select
  on public.rule_violations for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy rule_violations_owner_insert
  on public.rule_violations for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

-- UPDATE allowed for note/severity correction (same reasoning as
-- kpi_history's UPDATE policy); no DELETE (no-hard-deletes rule) — the
-- Founder Behavior/Learning Engine's pattern detection needs the full history,
-- including violations the founder would rather forget.
create policy rule_violations_owner_update
  on public.rule_violations for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());
