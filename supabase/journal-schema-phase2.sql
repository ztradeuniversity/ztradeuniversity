-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 2 (ADDITIVE MIGRATION)
-- Trader Psychology System + AI Coach Engine
--
-- 100% ADDITIVE. Every statement is idempotent:
--   - ADD COLUMN IF NOT EXISTS  → no-op if the column already exists
--   - CREATE TABLE IF NOT EXISTS → no-op if the table already exists
-- Nothing here drops, renames, replaces, or resets existing data.
--
-- Run in the SAME project as journal-schema.sql:
-- https://pfsgaxqagpbptmjaeblc.supabase.co  (SQL Editor → New query → Run)
-- ════════════════════════════════════════════════════════════════════════

-- Defensive: ensure the shared updated_at trigger fn exists (harmless if it
-- already does — CREATE OR REPLACE keeps the same body, no data is touched).
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
-- 1. journal_trades — add psychology columns (additive only)
-- ──────────────────────────────────────────────────────────────────────
alter table public.journal_trades
  add column if not exists confidence_level smallint check (confidence_level between 1 and 10),
  add column if not exists emotion          text check (emotion in ('Calm','Fear','Greed','FOMO','Revenge')),
  add column if not exists followed_plan    boolean,
  add column if not exists session_name     text,
  add column if not exists setup_type       text;

create index if not exists idx_journal_trades_setup   on public.journal_trades(user_id, setup_type);
create index if not exists idx_journal_trades_session  on public.journal_trades(user_id, session_name);

-- ──────────────────────────────────────────────────────────────────────
-- 2. personality_reports — periodic psychology snapshot per user
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.personality_reports (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  period_start           date not null,
  period_end             date not null,
  total_trades           int not null default 0,
  win_rate_by_confidence jsonb not null default '{}'::jsonb,
  win_rate_by_emotion    jsonb not null default '{}'::jsonb,
  win_rate_by_plan       jsonb not null default '{}'::jsonb,
  dominant_emotion       text,
  plan_adherence_rate    numeric(5,2),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, period_start, period_end)
);

drop trigger if exists trg_personality_reports_updated_at on public.personality_reports;
create trigger trg_personality_reports_updated_at
  before update on public.personality_reports
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 3. ai_reports — Weekly / Monthly Coach Reports (read-only analysis output)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.ai_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  report_type     text not null check (report_type in ('weekly','monthly')),
  period_start    date not null,
  period_end      date not null,
  summary         text not null,
  insights        jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  stats           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ai_reports_user on public.ai_reports(user_id, created_at desc);

drop trigger if exists trg_ai_reports_updated_at on public.ai_reports;
create trigger trg_ai_reports_updated_at
  before update on public.ai_reports
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 4. RLS — own-row only, same pattern as Phase 1
-- ──────────────────────────────────────────────────────────────────────
alter table public.personality_reports enable row level security;
alter table public.ai_reports          enable row level security;

drop policy if exists "personality_select_own" on public.personality_reports;
create policy "personality_select_own" on public.personality_reports
  for select using (auth.uid() = user_id);
drop policy if exists "personality_insert_own" on public.personality_reports;
create policy "personality_insert_own" on public.personality_reports
  for insert with check (auth.uid() = user_id);
drop policy if exists "personality_update_own" on public.personality_reports;
create policy "personality_update_own" on public.personality_reports
  for update using (auth.uid() = user_id);
drop policy if exists "personality_delete_own" on public.personality_reports;
create policy "personality_delete_own" on public.personality_reports
  for delete using (auth.uid() = user_id);

drop policy if exists "ai_reports_select_own" on public.ai_reports;
create policy "ai_reports_select_own" on public.ai_reports
  for select using (auth.uid() = user_id);
drop policy if exists "ai_reports_insert_own" on public.ai_reports;
create policy "ai_reports_insert_own" on public.ai_reports
  for insert with check (auth.uid() = user_id);
drop policy if exists "ai_reports_delete_own" on public.ai_reports;
create policy "ai_reports_delete_own" on public.ai_reports
  for delete using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
-- Done. journal.html (Phase 2) reads/writes these columns/tables directly
-- via the Supabase JS client — no Cloudflare Functions required.
-- ════════════════════════════════════════════════════════════════════════
