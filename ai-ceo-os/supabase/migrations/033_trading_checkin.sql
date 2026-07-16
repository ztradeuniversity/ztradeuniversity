-- 033_trading_checkin.sql
-- AI CEO OS — Personal Trading daily check-in (Home dashboard simplification)
--
-- IMPACT REVIEW (failed — hence this table): trading_rules is a standing
-- rule set (no date column); rule_violations logs a violation event, not a
-- daily yes/no/free-text answer set; trading_records is a per-trade journal
-- row, not a per-day reflection. None has a clean "answered on day X" shape
-- for the Home dashboard's fixed 5-question daily check-in, so this is one
-- new table, following the same one-table-per-genuinely-new-concept pattern
-- as 032_institutes.sql.

create table public.trading_checkin (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  checkin_date date not null,
  analyzed_chart boolean,
  took_trade boolean,
  followed_rules boolean,
  weakness text,
  avoided_repeat boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, checkin_date)
);

-- Certain access pattern: "today's (or the picked date's) check-in" and
-- "the last 14 days of check-ins" (recurring-weakness detection) are the
-- only two ways this table is read.
create index trading_checkin_owner_date_idx
  on public.trading_checkin (owner_user_id, checkin_date desc);

alter table public.trading_checkin enable row level security;

create policy trading_checkin_owner_select
  on public.trading_checkin for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy trading_checkin_owner_insert
  on public.trading_checkin for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy trading_checkin_owner_update
  on public.trading_checkin for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a day's honest check-in answer,
-- including a named weakness, stays on record so the recurring-weakness
-- coach has real history to learn from.
