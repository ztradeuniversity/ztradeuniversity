-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — BIG PHASE 4A: UNIFIED ACCESS
-- Custom-JWT identity binding (Option A).
--
-- The Journal no longer uses Supabase Auth (email/password). Instead, after
-- the SHARED library-auth OTP gate approves an account, /api/journal-access
-- mints a Supabase-compatible JWT whose `sub` is a deterministic UUIDv5
-- derived from the account number. RLS is UNCHANGED — `auth.uid() = user_id`
-- still works, it just now resolves from our minted JWT instead of GoTrue.
--
-- This migration makes exactly three additive/structural changes, none of
-- which rewrite an existing RLS policy or drop any data:
--   1. Remove the public.users.id -> auth.users(id) foreign key, so a profile
--      row can exist for a JWT-minted identity that has no GoTrue user.
--   2. Add account_number / access_source / tier columns to public.users.
--   3. Add a users_insert_own RLS policy so a JWT-authenticated client can
--      create its OWN profile row (auth.uid() = id) — previously profile rows
--      were created by the GoTrue signup trigger, which no longer fires.
--
-- Run in the JOURNAL Supabase project (same one as all prior journal-schema*):
-- https://pfsgaxqagpbptmjaeblc.supabase.co  (SQL Editor → New query → Run)
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 1. Drop the FK public.users.id -> auth.users(id).
--    Looked up dynamically so we don't depend on Postgres's auto-generated
--    constraint name. Idempotent: the loop simply finds nothing on re-run.
--    Non-destructive: existing rows keep their uuids; only the constraint
--    is removed. After this, public.users is the standalone identity table.
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
      and rel.relname = 'users'
      and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%auth.users%'
  loop
    execute format('alter table public.users drop constraint %I', c.conname);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Additive identity columns (nullable; existing rows unaffected).
-- ──────────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists account_number text,
  add column if not exists access_source  text,   -- 'ib_stars' | 'special'
  add column if not exists tier            text;   -- 'unlimited' (ZTU Premium)

create index if not exists idx_users_account_number on public.users(account_number);

-- ──────────────────────────────────────────────────────────────────────
-- 3. Allow a JWT-authenticated client to create its OWN profile row.
--    (Previously handled by the GoTrue on_auth_user_created trigger, which
--    no longer fires now that signup is bypassed.) The existing
--    on_public_user_created trigger still fires on this insert and
--    auto-creates the journal_settings row, so nothing downstream changes.
--    All other users policies (select/update own) are LEFT UNCHANGED.
-- ──────────────────────────────────────────────────────────────────────
drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

-- ════════════════════════════════════════════════════════════════════════
-- Notes:
--   • The old on_auth_user_created trigger on auth.users is now vestigial
--     (harmless) and is intentionally NOT removed — nothing is torn down
--     until the unified flow is proven in production (see migration plan).
--   • RLS on journal_trades / trade_tags / journal_settings /
--     personality_reports / ai_reports is completely untouched.
--   • New server-side env var required (JOURNAL project JWT secret, used
--     ONLY to sign the minted JWT, never for data access):
--         JOURNAL_SUPABASE_JWT_SECRET
--     Found in Supabase → Project Settings → API → JWT Settings → JWT Secret.
-- ════════════════════════════════════════════════════════════════════════
