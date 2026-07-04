-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — BIG PHASE 3A: PROFESSIONAL REPORTING
-- Additive migration only. Widens ai_reports.report_type to also accept
-- 'quarterly'. No table is dropped/renamed/replaced. No existing row is
-- touched — this only changes which NEW values are allowed going forward;
-- every already-saved 'weekly'/'monthly' report remains valid and untouched.
--
-- Run in the SAME project as the previous journal-schema*.sql files:
-- https://pfsgaxqagpbptmjaeblc.supabase.co  (SQL Editor → New query → Run)
-- ════════════════════════════════════════════════════════════════════════

-- The original CHECK constraint was declared inline in journal-schema-phase2.sql
-- as `report_type text not null check (report_type in ('weekly','monthly'))`,
-- which Postgres names automatically. Rather than assume that generated name,
-- this block looks up whatever CHECK constraint currently governs
-- ai_reports.report_type and drops only that one — safe regardless of the
-- exact name Postgres picked.
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
      and rel.relname = 'ai_reports'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%report_type%'
  loop
    execute format('alter table public.ai_reports drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.ai_reports
  add constraint ai_reports_report_type_check
  check (report_type in ('weekly','monthly','quarterly'));

-- No RLS changes needed — existing own-row policies on ai_reports already
-- apply regardless of report_type value.

-- ════════════════════════════════════════════════════════════════════════
-- Done. journal.html's AI Coach Engine can now insert report_type =
-- 'quarterly' rows into ai_reports. No new columns were needed: quarterly
-- stats (Total Trades, Win Rate, Loss Rate, Avg RR, Net Profit, Best/Worst
-- Pair/Setup/Session) and the merged Personality Engine output
-- (classifications, strengths, weaknesses, recommendations) are stored in
-- the existing `stats` / `insights` / `recommendations` jsonb columns,
-- which were already schema-flexible.
-- ════════════════════════════════════════════════════════════════════════
