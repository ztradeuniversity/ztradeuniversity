-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 6 (ADDITIVE MIGRATION)
-- Explicit Trade Result (Profit/Loss) + Psychological Audit + AI Analysis
--
-- WHY THIS EXISTS
--   Until now a closed trade stored only `pnl` (a signed number), and
--   `status` was GENERATED from its sign. There was no explicit, mandatory
--   user statement of "this was a Profit" vs "this was a Loss", no currency,
--   no points/pips, no risk-rule answer, and no AI weakness audit.
--
-- DESIGN — `pnl` REMAINS THE CANONICAL SIGNED VALUE.
--   The user now picks result (PROFIT/LOSS/BREAKEVEN) and types a POSITIVE
--   magnitude (result_amount). A BEFORE trigger derives `pnl` from those two.
--   This is deliberate: `status` (generated from pnl), every analytics query
--   in journal.html, functions/api/journal-admin.js, personality_reports and
--   ai_reports all read pnl/status. Deriving instead of replacing keeps all
--   of them working with ZERO changes and keeps old rows valid.
--
-- 100% ADDITIVE + IDEMPOTENT. Nothing is dropped, renamed or reset except the
-- UNNAMED emotion CHECK, which is rebuilt as a NAMED, WIDER constraint (it
-- only ever gains allowed values — no existing row can become invalid).
--
-- Run in the SAME project as journal-schema.sql:
-- https://pfsgaxqagpbptmjaeblc.supabase.co  (SQL Editor → New query → Run)
--
-- MIGRATION ORDER (run only if not already applied):
--   1. journal-schema.sql
--   2. journal-schema-phase2.sql
--   3. journal-schema-phase2c-personality.sql
--   4. journal-schema-phase3a-reports.sql
--   5. journal-schema-phase4a-unified-access.sql
--   6. journal-schema-phase5a-mentor.sql
--   7. journal-schema-phase5a1-reconcile.sql
--   8. journal-schema-phase5a2-rls.sql
--   9. journal-schema-phase5b.sql
--  10. journal-schema-phase6-result-analysis.sql   ← THIS FILE (run last)
-- ════════════════════════════════════════════════════════════════════════

-- Defensive: ensure the shared updated_at trigger fn exists.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 1. journal_trades — explicit result + audit columns (additive only)
-- ──────────────────────────────────────────────────────────────────────
alter table public.journal_trades
  -- explicit, user-chosen trade result (mandatory in the UI; nullable here so
  -- pre-Phase-6 rows stay valid until the backfill in step 4 populates them)
  add column if not exists result        text
    check (result is null or result in ('PROFIT','LOSS','BREAKEVEN')),
  -- POSITIVE magnitude only. Sign lives in `result`; pnl is derived from both.
  add column if not exists result_amount numeric(18,2)
    check (result_amount is null or result_amount >= 0),
  add column if not exists currency      text not null default 'USD',
  add column if not exists points_pips   numeric(12,2),
  -- Psychological audit Q3 (Q1 = trade_reason, Q2 = followed_plan,
  -- Q4 = emotion — all three already exist from Phase 2).
  add column if not exists followed_risk boolean,
  -- AI weakness audit written back by the client after analysis.
  -- Shape: { summary, primary, secondary, weaknesses:[{code,label,severity,why}],
  --          recommendation, scores:{risk,psychology,discipline}, engine, at }
  add column if not exists ai_analysis   jsonb not null default '{}'::jsonb;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Widen the `emotion` CHECK (Phase 2 shipped it unnamed and narrow).
--    Adds Confidence / Patience / Discipline. Existing values are all kept,
--    so no current row can be invalidated by this.
--    (Same dynamic-drop pattern used by phase3a-reports.sql.)
-- ──────────────────────────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'journal_trades'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%emotion%'
  loop
    execute format('alter table public.journal_trades drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.journal_trades
  add constraint journal_trades_emotion_check
  check (emotion is null or emotion in (
    'Calm','Fear','Greed','FOMO','Revenge',       -- Phase 2 originals (kept)
    'Confidence','Patience','Discipline'          -- Phase 6 additions
  ));

-- ──────────────────────────────────────────────────────────────────────
-- 3. Keep `pnl` and `result`/`result_amount` in permanent lockstep.
--
--    Direction of truth:
--      • result + result_amount given  → pnl  := signed(result, result_amount)
--      • only pnl given (legacy client) → result/result_amount := from pnl sign
--
--    Runs BEFORE INSERT/UPDATE, so the GENERATED `status` column (computed
--    after BEFORE triggers) still resolves correctly from the derived pnl.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.sync_trade_result()
returns trigger
language plpgsql
as $$
begin
  if new.result is not null and new.result_amount is not null then
    -- Explicit path (Phase 6 client): result decides the sign, always.
    new.pnl := case new.result
                 when 'PROFIT' then abs(new.result_amount)
                 when 'LOSS'   then -abs(new.result_amount)
                 else 0
               end;

  elsif new.result is null and new.pnl is not null then
    -- Legacy path: infer the explicit fields from the signed pnl so old
    -- clients / imports still produce complete Phase 6 rows.
    new.result        := case when new.pnl > 0 then 'PROFIT'
                              when new.pnl < 0 then 'LOSS'
                              else 'BREAKEVEN' end;
    new.result_amount := abs(new.pnl);

  elsif new.result is not null and new.result_amount is null then
    -- Result chosen but no magnitude: treat the existing pnl as the source.
    new.result_amount := abs(coalesce(new.pnl, 0));
    new.pnl := case new.result
                 when 'PROFIT' then abs(new.result_amount)
                 when 'LOSS'   then -abs(new.result_amount)
                 else 0
               end;
  end if;

  -- BREAKEVEN is always exactly zero, whatever was typed.
  if new.result = 'BREAKEVEN' then
    new.pnl := 0;
    new.result_amount := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_journal_trades_sync_result on public.journal_trades;
create trigger trg_journal_trades_sync_result
  before insert or update on public.journal_trades
  for each row execute function public.sync_trade_result();

-- ──────────────────────────────────────────────────────────────────────
-- 4. BACKFILL existing rows (safe + idempotent — only touches NULL results)
-- ──────────────────────────────────────────────────────────────────────
update public.journal_trades
set result = case when pnl > 0 then 'PROFIT'
                  when pnl < 0 then 'LOSS'
                  else 'BREAKEVEN' end,
    result_amount = abs(pnl)
where result is null;

-- Adopt each user's configured account currency for their historical rows.
update public.journal_trades t
set currency = s.account_currency
from public.journal_settings s
where s.user_id = t.user_id
  and t.currency = 'USD'
  and s.account_currency is not null
  and s.account_currency <> 'USD';

-- ──────────────────────────────────────────────────────────────────────
-- 5. INDEXES — support the new dashboard/admin aggregates
-- ──────────────────────────────────────────────────────────────────────
-- Win/loss splits, totals and averages are always scoped per user.
create index if not exists idx_journal_trades_user_result
  on public.journal_trades(user_id, result);

-- Admin "most common mistakes" / weakness distribution scans ai_analysis.
create index if not exists idx_journal_trades_ai_analysis
  on public.journal_trades using gin (ai_analysis jsonb_path_ops);

-- ──────────────────────────────────────────────────────────────────────
-- 6. RLS — no changes required.
--    Every column added here lives on journal_trades, which already has
--    own-row SELECT/INSERT/UPDATE/DELETE policies (auth.uid() = user_id).
--    New columns inherit them automatically.
-- ──────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste separately ONLY if Phase 6 must be reverted).
-- Restores the pre-Phase-6 shape. `pnl` keeps its values, so `status` and
-- every existing analytic keeps working after rollback.
--
--   drop trigger if exists trg_journal_trades_sync_result on public.journal_trades;
--   drop function if exists public.sync_trade_result();
--
--   drop index if exists public.idx_journal_trades_user_result;
--   drop index if exists public.idx_journal_trades_ai_analysis;
--
--   alter table public.journal_trades
--     drop constraint if exists journal_trades_emotion_check;
--   -- restore the Phase 2 narrow emotion check (only safe once any
--   -- Confidence/Patience/Discipline rows are re-mapped or deleted):
--   -- update public.journal_trades set emotion = 'Calm'
--   --   where emotion in ('Confidence','Patience','Discipline');
--   -- alter table public.journal_trades add constraint journal_trades_emotion_check
--   --   check (emotion is null or emotion in ('Calm','Fear','Greed','FOMO','Revenge'));
--
--   alter table public.journal_trades
--     drop column if exists result,
--     drop column if exists result_amount,
--     drop column if exists currency,
--     drop column if exists points_pips,
--     drop column if exists followed_risk,
--     drop column if exists ai_analysis;
-- ════════════════════════════════════════════════════════════════════════
