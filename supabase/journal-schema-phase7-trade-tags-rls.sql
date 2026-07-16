-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 7 (SECURITY FIX)
-- Enable RLS on trade_tags + restore own-row policies.
--
-- WHY THIS EXISTS
--   Verified via a live Supabase audit: trade_tags currently has
--   RLS DISABLED and ZERO policies, even though journal-schema.sql always
--   intended it to be owner-scoped via its parent trade's user_id. Any
--   authenticated Supabase user could currently read or write ANY trader's
--   tags. This restores exactly the policies the original schema specified.
--
-- 100% ADDITIVE + IDEMPOTENT — enabling RLS on a table with no policies
-- blocks all access until the policies below are created in the same
-- transaction; nothing here drops or alters existing rows.
-- ════════════════════════════════════════════════════════════════════════

alter table public.trade_tags enable row level security;

drop policy if exists "tags_select_own" on public.trade_tags;
create policy "tags_select_own" on public.trade_tags
  for select using (
    exists (select 1 from public.journal_trades t
            where t.id = trade_tags.trade_id and t.user_id = auth.uid())
  );

drop policy if exists "tags_insert_own" on public.trade_tags;
create policy "tags_insert_own" on public.trade_tags
  for insert with check (
    exists (select 1 from public.journal_trades t
            where t.id = trade_tags.trade_id and t.user_id = auth.uid())
  );

drop policy if exists "tags_delete_own" on public.trade_tags;
create policy "tags_delete_own" on public.trade_tags
  for delete using (
    exists (select 1 from public.journal_trades t
            where t.id = trade_tags.trade_id and t.user_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if needed):
--   drop policy if exists "tags_select_own" on public.trade_tags;
--   drop policy if exists "tags_insert_own" on public.trade_tags;
--   drop policy if exists "tags_delete_own" on public.trade_tags;
--   alter table public.trade_tags disable row level security;
-- ════════════════════════════════════════════════════════════════════════
