-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — BIG PHASE 5B: MENTOR ECOSYSTEM
-- Additive migration only. Creates THREE new tables for the mentor ecosystem.
-- It does NOT touch mentor_reviews (frozen), nor any existing table, column,
-- policy, or RLS on the existing tables.
--
-- New tables get the SAME own-row RLS pattern already established for the
-- Journal (trader sees only their own rows; mentor writes go through the
-- service-role admin API which bypasses RLS). This is required so the new
-- tables are not left publicly open (the exact gap closed in Phase 5A.5) —
-- it applies the identical pattern to NEW tables only; nothing existing is
-- modified.
--
-- TARGET: https://pfsgaxqagpbptmjaeblc.supabase.co (ref: pfsgaxqagpbptmjaeblc)
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ──────────────────────────────────────────────────────────────────────
-- 1. trade_grades — mentor grades an individual trade (Phase 5B.2).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.trade_grades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  trade_id    text,                          -- optional ZTU-000123 link
  grade       text not null check (grade in (
                'Excellent Trade','Good Trade','Average Trade','Poor Trade','Rule Violation')),
  score       smallint,                      -- 5..1 / 0 (Rule Violation)
  comment     text,
  mentor_name text not null default 'ZTU Mentor',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_trade_grades_user on public.trade_grades(user_id, created_at desc);

drop trigger if exists trg_trade_grades_updated_at on public.trade_grades;
create trigger trg_trade_grades_updated_at before update on public.trade_grades
  for each row execute function public.set_updated_at();

alter table public.trade_grades enable row level security;
drop policy if exists "trade_grades_select_own" on public.trade_grades;
create policy "trade_grades_select_own" on public.trade_grades
  for select using (auth.uid() = user_id);
-- (no user insert/update/delete — service-role writes only)

-- ──────────────────────────────────────────────────────────────────────
-- 2. mentor_scorecards — one mentor-authored scorecard per trader (5B.3).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.mentor_scorecards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.users(id) on delete cascade,
  discipline_score  smallint,
  risk_score        smallint,
  psychology_score  smallint,
  execution_score   smallint,
  consistency_score smallint,
  overall_score     numeric(5,2),
  strengths         jsonb not null default '[]'::jsonb,
  weaknesses        jsonb not null default '[]'::jsonb,
  areas_to_improve  jsonb not null default '[]'::jsonb,
  mentor_name       text not null default 'ZTU Mentor',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_mentor_scorecards_updated_at on public.mentor_scorecards;
create trigger trg_mentor_scorecards_updated_at before update on public.mentor_scorecards
  for each row execute function public.set_updated_at();

alter table public.mentor_scorecards enable row level security;
drop policy if exists "scorecards_select_own" on public.mentor_scorecards;
create policy "scorecards_select_own" on public.mentor_scorecards
  for select using (auth.uid() = user_id);
-- (no user write — service-role writes only)

-- ──────────────────────────────────────────────────────────────────────
-- 3. mentor_review_acks — trader's read / acknowledged state per review
--    (Phase 5B.4). The TRADER writes these, so they get own-row insert +
--    update policies (auth.uid() = user_id from the Unified Access JWT).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.mentor_review_acks (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null unique references public.mentor_reviews(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  read_at         timestamptz,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_review_acks_user on public.mentor_review_acks(user_id);

drop trigger if exists trg_review_acks_updated_at on public.mentor_review_acks;
create trigger trg_review_acks_updated_at before update on public.mentor_review_acks
  for each row execute function public.set_updated_at();

alter table public.mentor_review_acks enable row level security;
drop policy if exists "review_acks_select_own" on public.mentor_review_acks;
create policy "review_acks_select_own" on public.mentor_review_acks
  for select using (auth.uid() = user_id);
drop policy if exists "review_acks_insert_own" on public.mentor_review_acks;
create policy "review_acks_insert_own" on public.mentor_review_acks
  for insert with check (auth.uid() = user_id);
drop policy if exists "review_acks_update_own" on public.mentor_review_acks;
create policy "review_acks_update_own" on public.mentor_review_acks
  for update using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
-- SELF-CHECK:
--   select relname, relrowsecurity from pg_class
--   where relname in ('trade_grades','mentor_scorecards','mentor_review_acks');  -- all true
--   select tablename, policyname, cmd from pg_policies
--   where tablename in ('trade_grades','mentor_scorecards','mentor_review_acks')
--   order by tablename, cmd;
-- ════════════════════════════════════════════════════════════════════════
