-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 5A.2 RLS ISOLATION FIX
--
-- Closes the verified security gap (Phase 5A.4): the live base tables had
-- Row Level Security OFF, so the PUBLIC anon key (embedded in journal.html)
-- could read / insert / update / delete any user's rows. Proven live: an anon
-- INSERT and DELETE on public.users both succeeded.
--
-- This migration ENABLES RLS and adds own-row policies keyed to auth.uid().
--
-- WHY THIS IS SAFE FOR THE EXISTING ARCHITECTURE:
--   • Unified Access JWT: the minted JWT carries role=authenticated and
--     sub=<users.id>. Postgres auth.uid() resolves to that sub, so
--     `auth.uid() = user_id` returns each trader ONLY their own rows. The JWT
--     flow is unchanged — these policies simply consume it.
--   • journal-admin: it talks to Supabase with the SERVICE-ROLE key, whose
--     role has BYPASSRLS — it automatically ignores every policy below and
--     keeps reading/writing across all traders. No change needed there.
--   • mentor_reviews: already correct (RLS enabled + select-own from the
--     Phase 5A migration) → intentionally LEFT UNTOUCHED here.
--   • anon key (no JWT): auth.uid() is null → every policy evaluates false →
--     the public key can no longer read or write these tables. Gap closed.
--
-- 100% ADDITIVE: ENABLE RLS + CREATE POLICY only.
-- NO DROP TABLE, NO DROP COLUMN, NO DELETE/UPDATE of data, NO TRUNCATE.
-- (`drop policy if exists` only re-binds a policy to an identical definition;
--  it never touches data.)
--
-- TARGET PROJECT (the only one): https://pfsgaxqagpbptmjaeblc.supabase.co
--   (ref: pfsgaxqagpbptmjaeblc) — SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 1. users — read / create / update own profile row only.
--    (provisionUser() upserts id = JWT sub, so insert+update both pass.)
-- ──────────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- ──────────────────────────────────────────────────────────────────────
-- 2. journal_trades — full CRUD on own rows only.
-- ──────────────────────────────────────────────────────────────────────
alter table public.journal_trades enable row level security;

drop policy if exists "trades_select_own" on public.journal_trades;
create policy "trades_select_own" on public.journal_trades
  for select using (auth.uid() = user_id);

drop policy if exists "trades_insert_own" on public.journal_trades;
create policy "trades_insert_own" on public.journal_trades
  for insert with check (auth.uid() = user_id);

drop policy if exists "trades_update_own" on public.journal_trades;
create policy "trades_update_own" on public.journal_trades
  for update using (auth.uid() = user_id);

drop policy if exists "trades_delete_own" on public.journal_trades;
create policy "trades_delete_own" on public.journal_trades
  for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- 3. journal_settings — own settings row only.
-- ──────────────────────────────────────────────────────────────────────
alter table public.journal_settings enable row level security;

drop policy if exists "settings_select_own" on public.journal_settings;
create policy "settings_select_own" on public.journal_settings
  for select using (auth.uid() = user_id);

drop policy if exists "settings_upsert_own" on public.journal_settings;
create policy "settings_upsert_own" on public.journal_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "settings_update_own" on public.journal_settings;
create policy "settings_update_own" on public.journal_settings
  for update using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- 4. personality_reports — own rows (the engine does an insert-or-update
--    upsert, so both insert + update policies are required).
-- ──────────────────────────────────────────────────────────────────────
alter table public.personality_reports enable row level security;

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

-- ──────────────────────────────────────────────────────────────────────
-- 5. ai_reports — own rows.
-- ──────────────────────────────────────────────────────────────────────
alter table public.ai_reports enable row level security;

drop policy if exists "ai_reports_select_own" on public.ai_reports;
create policy "ai_reports_select_own" on public.ai_reports
  for select using (auth.uid() = user_id);

drop policy if exists "ai_reports_insert_own" on public.ai_reports;
create policy "ai_reports_insert_own" on public.ai_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_reports_delete_own" on public.ai_reports;
create policy "ai_reports_delete_own" on public.ai_reports
  for delete using (auth.uid() = user_id);

-- mentor_reviews: intentionally NOT touched (already correct).

-- ════════════════════════════════════════════════════════════════════════
-- SELF-CHECK (run after the migration):
--
--   -- (a) RLS now enabled on all 5 base tables + mentor_reviews → all true:
--   select relname, relrowsecurity
--   from pg_class
--   where relname in ('users','journal_trades','journal_settings',
--                     'personality_reports','ai_reports','mentor_reviews')
--   order by relname;
--
--   -- (b) Own-row policies present (expect ~16 across the 5 base tables):
--   select tablename, policyname, cmd
--   from pg_policies
--   where tablename in ('users','journal_trades','journal_settings',
--                       'personality_reports','ai_reports')
--   order by tablename, cmd;
--
--   -- (c) mentor_reviews policy unchanged (still 1 select-own policy):
--   select policyname, cmd from pg_policies where tablename='mentor_reviews';
--
--   -- (d) Re-run the anon probe from Phase 5A.4 — anon INSERT into users must
--   --     now FAIL with 42501 (RLS), and anon SELECT returns only [] without a
--   --     JWT. (Do this from the browser with the anon key, as before.)
-- ════════════════════════════════════════════════════════════════════════
