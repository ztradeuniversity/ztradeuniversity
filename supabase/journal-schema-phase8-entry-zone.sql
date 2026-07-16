-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 8 (ADDITIVE MIGRATION)
-- Entry Type: Single Entry vs Entry Zone
--
-- `entry_price` remains the canonical, NOT NULL price every existing query,
-- the generated `rr_ratio`, and the AI engine already depend on — for a
-- Single Entry it's the exact price; for an Entry Zone it's the CLIENT-
-- COMPUTED midpoint of entry_from/entry_to. This file only adds the detail
-- columns; nothing about entry_price's role changes.
--
-- 100% ADDITIVE + IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════════════

alter table public.journal_trades
  add column if not exists entry_type text
    check (entry_type is null or entry_type in ('SINGLE','ZONE')),
  add column if not exists entry_from numeric(18,6) check (entry_from is null or entry_from > 0),
  add column if not exists entry_to   numeric(18,6) check (entry_to   is null or entry_to   > 0);

-- Backfill existing rows as Single Entry (their entry_price was always exact).
update public.journal_trades set entry_type = 'SINGLE' where entry_type is null;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if needed):
--   alter table public.journal_trades
--     drop column if exists entry_type,
--     drop column if exists entry_from,
--     drop column if exists entry_to;
-- ════════════════════════════════════════════════════════════════════════
