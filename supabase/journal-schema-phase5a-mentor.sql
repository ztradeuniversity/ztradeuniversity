-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 5A: MENTOR REVIEW SYSTEM
-- Additive migration only. Creates ONE new table (mentor_reviews) for human
-- mentor feedback. No existing Journal table is modified, dropped, or
-- re-keyed; all existing RLS is preserved untouched.
--
-- AI feedback (ai_reports / personality_reports) and Mentor feedback
-- (mentor_reviews) are kept in SEPARATE tables so the user always sees them
-- as independent sections — they are never merged.
--
-- Run in the EXISTING Journal Supabase project (same as journal.html):
-- https://pfsgaxqagpbptmjaeblc.supabase.co  (SQL Editor → New query → Run)
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────
-- mentor_reviews — one row per human review left by a mentor for a trader.
--   user_id        → which trader the review is about (FK to public.users)
--   account_number → denormalized copy for easy admin search/display
--   category       → structured review category (see CHECK list)
--   comment        → free-text mentor comment
--   mentor_name    → who left it
--   trade_id       → optional: review tied to a specific trade (text ZTU-id)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.mentor_reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  account_number text,
  category       text not null check (category in (
                   'Approved Trade','Good Entry','Bad Entry','Risk Management Issue',
                   'Psychology Issue','Setup Issue','Execution Issue','Rule Violation',
                   'Excellent Discipline','Needs Improvement','Custom Review')),
  comment        text not null,
  mentor_name    text not null default 'ZTU Mentor',
  trade_id       text,                         -- optional ZTU-000123 reference
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_mentor_reviews_user    on public.mentor_reviews(user_id, created_at desc);
create index if not exists idx_mentor_reviews_account on public.mentor_reviews(account_number);

-- reuse the shared updated_at trigger fn (created in earlier migrations).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_mentor_reviews_updated_at on public.mentor_reviews;
create trigger trg_mentor_reviews_updated_at
  before update on public.mentor_reviews
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- RLS — a trader may READ the reviews written about them (own rows only).
--   Mentor WRITES (insert) and cross-trader READS are performed server-side
--   by /api/journal-admin using the service-role key, which bypasses RLS.
--   No anon/user INSERT policy is granted, so a trader can never forge a
--   mentor review for themselves or anyone else.
-- ──────────────────────────────────────────────────────────────────────
alter table public.mentor_reviews enable row level security;

drop policy if exists "mentor_reviews_select_own" on public.mentor_reviews;
create policy "mentor_reviews_select_own" on public.mentor_reviews
  for select using (auth.uid() = user_id);

-- (intentionally NO insert/update/delete policy for anon/authenticated —
--  only the service-role key, used server-side, may write.)

-- ════════════════════════════════════════════════════════════════════════
-- Verify after running (optional):
--   select table_name from information_schema.tables
--   where table_schema='public' and table_name='mentor_reviews';
--   select policyname from pg_policies where tablename='mentor_reviews';
--
-- New server-side env vars required by /api/journal-admin (NOT in the browser):
--   JOURNAL_SUPABASE_SERVICE_ROLE_KEY  — Journal project service_role key
--   JOURNAL_ADMIN_PASSWORD             — gate the admin API (e.g. the existing
--                                        admin gate password)
-- ════════════════════════════════════════════════════════════════════════
