-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — BIG PHASE 2: PERSONALITY ENGINE
-- Additive migration only. Extends the existing personality_reports table
-- (created in journal-schema-phase2.sql) with classification + analysis
-- columns. No tables are dropped, renamed, or replaced; no existing column
-- is altered or removed.
--
-- Run in the SAME project as journal-schema.sql / journal-schema-phase2.sql:
-- https://pfsgaxqagpbptmjaeblc.supabase.co  (SQL Editor → New query → Run)
-- ════════════════════════════════════════════════════════════════════════

alter table public.personality_reports
  add column if not exists classifications  jsonb not null default '[]'::jsonb,
  add column if not exists strengths        jsonb not null default '[]'::jsonb,
  add column if not exists weaknesses       jsonb not null default '[]'::jsonb,
  add column if not exists recommendations  jsonb not null default '[]'::jsonb,
  add column if not exists win_rate         numeric(5,2),
  add column if not exists avg_rr           numeric(10,4),
  add column if not exists session_stats    jsonb not null default '{}'::jsonb,
  add column if not exists setup_stats      jsonb not null default '{}'::jsonb;

-- No RLS changes needed — personality_reports already has full own-row
-- select/insert/update/delete policies from journal-schema-phase2.sql,
-- and policies apply per-row regardless of which columns are touched.

-- ════════════════════════════════════════════════════════════════════════
-- Done. journal.html's Personality Engine now upserts one row per
-- calendar month per user into these columns (best-effort, never blocks
-- the UI) and reads them back to render the monthly trend timeline.
-- ════════════════════════════════════════════════════════════════════════
