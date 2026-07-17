-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — SIGNAL MODULE: ENTRY ZONE + PIPS RESULT + TP/SL MODE
-- Additive migration only. Extends the EXISTING public.signal_history table
-- created by supabase/signal-history-schema.sql. It does NOT drop, rename or
-- retype any existing column, and does NOT touch RLS, policies, auth, or any
-- other table. (Journal / AI / Library / Mentor / CEO OS are untouched.)
--
-- Runs in the AI / "ZTU Chatbot" Supabase project — the SAME project that
-- already holds signal_history + ai_articles
-- (env: AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY).
--
-- Safe to run more than once (every statement is idempotent).
--
-- WHY each column:
--   entry_zone_start / entry_zone_end
--       A signal is now published as an acceptable entry RANGE instead of a
--       single price. entry_price is KEPT (not dropped) and is mirrored with
--       the zone midpoint by the API, so existing R:R stats and the homepage
--       teaser keep working unchanged.
--   result_pips
--       ONE signed column, not two: winning pips are stored positive, losing
--       pips negative, breakeven 0, still-running NULL. Two nullable columns
--       ("winning_pips" AND "losing_pips") would allow a contradictory row
--       where both are filled; a single signed number cannot contradict
--       itself. The API normalizes the sign from `status`, and the public
--       stats split it back out into Overall Winning Pips / Overall Losing
--       Pips / Overall Outcome.
--   tp_sl_mode
--       'ztu_bot' (default) => the public page shows "TP: ZTU Bot / SL: ZTU
--       Bot". 'manual' => stop_loss/take_profit are recorded for the ADMIN's
--       internal record only. Numeric TP/SL are never sent to the public API
--       response in either mode.
-- ════════════════════════════════════════════════════════════════════════

alter table public.signal_history
  add column if not exists entry_zone_start numeric,
  add column if not exists entry_zone_end   numeric,
  add column if not exists result_pips      numeric,
  add column if not exists tp_sl_mode       text not null default 'ztu_bot';

-- Constrain tp_sl_mode without assuming the constraint does not already exist.
alter table public.signal_history
  drop constraint if exists signal_history_tp_sl_mode_check;
alter table public.signal_history
  add constraint signal_history_tp_sl_mode_check
  check (tp_sl_mode in ('manual', 'ztu_bot'));

-- ──────────────────────────────────────────────────────────────────────
-- BACKFILL — legacy rows carry a single entry_price and no zone. Give them
-- a zero-width zone (start = end = entry_price) so historical signals keep
-- rendering an Entry Zone on the public page instead of an em-dash.
-- Only touches rows where the zone is still NULL, so re-running is a no-op.
-- ──────────────────────────────────────────────────────────────────────
update public.signal_history
   set entry_zone_start = entry_price,
       entry_zone_end   = entry_price
 where entry_price is not null
   and entry_zone_start is null
   and entry_zone_end is null;

-- ════════════════════════════════════════════════════════════════════════
-- SELF-CHECK:
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_name = 'signal_history'
--      and column_name in ('entry_zone_start','entry_zone_end','result_pips','tp_sl_mode');
--   -- 4 rows expected.
--
--   select id, signal_date, market, entry_zone_start, entry_zone_end,
--          result_pips, tp_sl_mode, status
--     from public.signal_history order by signal_date desc limit 20;
--
-- RLS is inherited from signal-history-schema.sql and is intentionally
-- unchanged: published rows readable, no public writes.
-- ════════════════════════════════════════════════════════════════════════
