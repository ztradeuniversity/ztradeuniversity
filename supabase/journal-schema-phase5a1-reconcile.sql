-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 5A.1 SCHEMA RECONCILIATION
--
-- Brings the LIVE Journal database up to the columns the codebase reads/writes.
-- The live tables were created as minimal stubs with a different naming
-- convention (trade_type/win_loss/full_name) and are missing most columns the
-- code uses (pnl, direction, status, trade_id, and the report columns), which
-- breaks trade saving, analytics, and report persistence.
--
-- 100% ADDITIVE — every statement is one of:
--   • ADD COLUMN IF NOT EXISTS
--   • CREATE [UNIQUE] INDEX IF NOT EXISTS
--   • ALTER COLUMN ... DROP NOT NULL  (constraint relaxation, only where the
--     legacy column exists and would otherwise block code inserts)
--   • CREATE OR REPLACE FUNCTION / DROP+CREATE TRIGGER (idempotent re-bind)
-- NO DROP TABLE, NO DROP COLUMN, NO DELETE, NO RLS rewrite.
-- The legacy columns (trade_type/win_loss/full_name) are LEFT IN PLACE as
-- harmless unused duplicates.
--
-- TARGET PROJECT (the only one): https://pfsgaxqagpbptmjaeblc.supabase.co
--   (ref: pfsgaxqagpbptmjaeblc) — SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- shared updated_at trigger fn (idempotent; reused below)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ──────────────────────────────────────────────────────────────────────
-- 1. users — add display_name (provisionUser() upserts it; without it the
--    upsert fails and no user row is created → trade FK fails).
-- ──────────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists display_name text;

-- Defensive: if the legacy full_name column is NOT NULL with no default, the
-- code's user upsert (which omits it) would fail. Relax it where present.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='users' and column_name='full_name')
  then execute 'alter table public.users alter column full_name drop not null'; end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. journal_trades — add the user-entered + auto-generated columns the code
--    relies on. Order matters: pnl is added BEFORE the generated status.
-- ──────────────────────────────────────────────────────────────────────
alter table public.journal_trades add column if not exists pnl numeric(18,2) not null default 0;
alter table public.journal_trades add column if not exists direction text;
alter table public.journal_trades add column if not exists trade_seq bigint generated always as identity;
alter table public.journal_trades add column if not exists trade_id text;

-- status: generated from pnl (matches the reference schema). Added after pnl.
alter table public.journal_trades
  add column if not exists status text generated always as (
    case when pnl > 0 then 'WIN' when pnl < 0 then 'LOSS' else 'BREAKEVEN' end
  ) stored;

create unique index if not exists idx_journal_trades_trade_id on public.journal_trades(trade_id);

-- trade_id auto-format from the identity (ZTU-000001, …) on insert.
create or replace function public.set_trade_id()
returns trigger language plpgsql as $$
begin
  if new.trade_id is null then
    new.trade_id := 'ZTU-' || lpad(new.trade_seq::text, 6, '0');
  end if;
  return new;
end; $$;

drop trigger if exists trg_journal_trades_trade_id on public.journal_trades;
create trigger trg_journal_trades_trade_id
  before insert on public.journal_trades
  for each row execute function public.set_trade_id();

-- Defensive: relax NOT NULL on the legacy columns the code never writes
-- (trade_type / win_loss), so code inserts that omit them succeed.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='journal_trades' and column_name='trade_type')
  then execute 'alter table public.journal_trades alter column trade_type drop not null'; end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='journal_trades' and column_name='win_loss')
  then execute 'alter table public.journal_trades alter column win_loss drop not null'; end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────
-- 3. journal_settings — add the columns the (trigger-created) settings row
--    and any future read expects.
-- ──────────────────────────────────────────────────────────────────────
alter table public.journal_settings
  add column if not exists starting_balance numeric(18,2) not null default 0,
  add column if not exists account_currency text not null default 'USD',
  add column if not exists default_lot_size  numeric(10,4);

-- ──────────────────────────────────────────────────────────────────────
-- 4. personality_reports — add every column the Personality Engine upsert
--    writes, plus the unique key its onConflict depends on.
-- ──────────────────────────────────────────────────────────────────────
alter table public.personality_reports
  add column if not exists period_start           date,
  add column if not exists period_end             date,
  add column if not exists total_trades           int not null default 0,
  add column if not exists win_rate_by_confidence  jsonb not null default '{}'::jsonb,
  add column if not exists win_rate_by_emotion     jsonb not null default '{}'::jsonb,
  add column if not exists win_rate_by_plan        jsonb not null default '{}'::jsonb,
  add column if not exists dominant_emotion        text,
  add column if not exists plan_adherence_rate     numeric(5,2),
  add column if not exists classifications         jsonb not null default '[]'::jsonb,
  add column if not exists recommendations         jsonb not null default '[]'::jsonb,
  add column if not exists win_rate                numeric(5,2),
  add column if not exists avg_rr                  numeric(10,4),
  add column if not exists session_stats           jsonb not null default '{}'::jsonb,
  add column if not exists setup_stats             jsonb not null default '{}'::jsonb,
  add column if not exists updated_at              timestamptz not null default now();

-- the (user_id, period_start, period_end) unique key required by the
-- syncPersonalitySnapshot upsert's onConflict.
create unique index if not exists uq_personality_user_period
  on public.personality_reports(user_id, period_start, period_end);

drop trigger if exists trg_personality_reports_updated_at on public.personality_reports;
create trigger trg_personality_reports_updated_at
  before update on public.personality_reports
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 5. ai_reports — add the columns the "Generate Report" insert writes.
--    (summary is added nullable to stay additive-safe; the code always
--    supplies it on insert.)
-- ──────────────────────────────────────────────────────────────────────
alter table public.ai_reports
  add column if not exists summary         text,
  add column if not exists period_start    date,
  add column if not exists period_end      date,
  add column if not exists insights        jsonb not null default '[]'::jsonb,
  add column if not exists recommendations jsonb not null default '[]'::jsonb,
  add column if not exists stats           jsonb not null default '{}'::jsonb,
  add column if not exists updated_at      timestamptz not null default now();

drop trigger if exists trg_ai_reports_updated_at on public.ai_reports;
create trigger trg_ai_reports_updated_at
  before update on public.ai_reports
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
-- SELF-CHECK (run after the migration to confirm reconciliation):
--   select table_name, column_name
--   from information_schema.columns
--   where table_schema='public'
--     and (
--       (table_name='users'              and column_name='display_name') or
--       (table_name='journal_trades'     and column_name in ('pnl','direction','status','trade_id','trade_seq')) or
--       (table_name='journal_settings'   and column_name in ('starting_balance','account_currency','default_lot_size')) or
--       (table_name='personality_reports' and column_name in ('period_start','period_end','classifications','win_rate','avg_rr')) or
--       (table_name='ai_reports'         and column_name in ('summary','period_start','period_end','insights','stats'))
--     )
--   order by table_name, column_name;
--   -- expect 18 rows.
--
--   select indexname from pg_indexes
--   where tablename='personality_reports' and indexname='uq_personality_user_period';
--   -- expect 1 row.
-- ════════════════════════════════════════════════════════════════════════
