-- AI CEO OS — Wave 2a (Accountability Spine) verification queries
-- NOT a migration. Do not place this in migrations/ or run it as one.
--
-- CORRECTED (Prompt 4, Step 1 follow-up): the original version of this file
-- mixed two fundamentally different kinds of check in one list. That caused a
-- real failure when tested for real — the Supabase SQL Editor runs as the
-- `postgres` role, which BYPASSES Row Level Security entirely by default.
-- That means:
--   - Every SELECT in the SQL Editor returns ALL rows regardless of policy —
--     it can never prove a policy denies access, only that the policy EXISTS.
--   - The synthetic-UUID INSERT test failed on the owner_user_id foreign key
--     (23503) before RLS was ever evaluated — a real user row for that UUID
--     doesn't exist, so the FK check runs first and rejects it regardless of
--     what RLS would have done.
-- Section A below is everything that's safe and meaningful to run as
-- `postgres` in the SQL Editor: catalog/metadata checks. Section B is
-- everything that actually exercises RLS behavior, which is only a valid
-- test when run as a real authenticated (non-postgres) session — the app
-- itself, or a Supabase client using the anon key plus a real user's JWT.
-- Never paste Section B's queries into the SQL Editor and treat a result as
-- meaningful — it will "pass" even if the policy is wrong.

-- ============================================================
-- SECTION A — SQL Editor Verification (safe, read-only, metadata only)
-- Run these exactly as before, in the Supabase SQL Editor. They inspect the
-- schema itself, not row-level behavior, so running as `postgres` is correct
-- here — this is what these queries are for.
-- ============================================================

-- A1. Table + type existence (run after all of 006-013 applied)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'kpi_definitions', 'kpi_history', 'goals', 'daily_activities',
    'reviews', 'trading_rules', 'trading_records', 'rule_violations'
  )
order by table_name;
-- Expect all 8 rows.

select typname from pg_type where typname = 'cadence_type';
-- Expect exactly 1 row.

-- A2. Full RLS coverage check — every table in this wave must show
-- rowsecurity = true. Any `false` means that table shipped without RLS.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'kpi_definitions', 'kpi_history', 'goals', 'daily_activities',
    'reviews', 'trading_rules', 'trading_records', 'rule_violations'
  )
order by tablename;
-- Expect all 8 rows with rowsecurity = true.

-- A3. Foreign key sanity check
select conrelid::regclass as table_name, conname, confrelid::regclass as references_table
from pg_constraint
where contype = 'f'
  and conrelid::regclass::text in (
    'public.kpi_history', 'public.goals', 'public.trading_records', 'public.rule_violations'
  )
order by table_name;
-- Expect: kpi_history -> users, kpi_definitions; goals -> users, kpi_definitions;
-- trading_records -> users; rule_violations -> users, trading_records, trading_rules.

-- A4. Policy inventory — confirms which operations each table actually has a
-- policy for, and lets you read the using/with_check expression directly
-- instead of trying to trigger it. This is the safe way to confirm
-- "owner_user_id = auth.uid() OR is_admin()" is really what's there.
select
  c.relname as table_name,
  p.polname as policy_name,
  p.polcmd as command,   -- r=select, a=insert, w=update, d=delete
  pg_get_expr(p.polqual, p.polrelid) as using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname in (
  'kpi_definitions', 'kpi_history', 'goals', 'daily_activities',
  'reviews', 'trading_rules', 'trading_records', 'rule_violations'
)
order by table_name, command;

-- A5. Zero DELETE policies anywhere in this wave (no-hard-deletes rule).
select relname, polname, polcmd
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in (
  'kpi_definitions', 'kpi_history', 'goals', 'daily_activities',
  'reviews', 'trading_rules', 'trading_records', 'rule_violations'
) and polcmd = 'd';
-- Expect: zero rows. Any row here is a violation of the no-hard-deletes rule.

-- ============================================================
-- SECTION B — Authenticated Application / RLS Tests
-- DO NOT RUN THESE IN THE SQL EDITOR. The SQL Editor executes as `postgres`,
-- which bypasses RLS entirely — any query here will silently "succeed" or
-- "return rows" regardless of what the policy actually does, proving nothing.
--
-- Run these only from a real authenticated session: either the deployed app
-- itself (once logged in), or a Supabase client (`@supabase/supabase-js`)
-- initialized with the **anon key**, after signing in as a real user via
-- `supabase.auth.signInWithPassword(...)`. The client's queries then run
-- under that user's JWT, which is what RLS actually evaluates against.
-- ============================================================

-- B1. Self-access smoke test (founder's own session, logged in as themselves).
-- Expect: your own rows come back normally — proves owner-scoped SELECT works
-- end to end, not just that a policy exists.
--   supabase.from('goals').select('*')
--   supabase.from('trading_records').select('*')
--   supabase.from('reviews').select('*')

-- B2. Cross-user denial test — requires a SECOND Supabase Auth user (a real
-- account, not a synthetic UUID — this is what caused the original 23503
-- error: there was no matching row in `public.users` for the fake ID).
-- Create one temporary non-admin test account for this purpose if none
-- exists yet; delete/deactivate it afterward.
-- Logged in as that second user, attempt:
--   supabase.from('goals').select('*')            -- expect: empty, not the founder's rows
--   supabase.from('trading_records').select('*')  -- expect: empty
--   supabase.from('reviews').select('*')           -- expect: empty
--   supabase.from('daily_activities').insert({
--     owner_user_id: '<the founder's real user id, not a random UUID>',
--     activity_date: new Date().toISOString().slice(0,10),
--     activity_type: 'test'
--   })
--   -- expect: insert rejected by RLS (owner_user_id must equal the second
--   -- user's own auth.uid()), not a foreign-key error — the FK will now
--   -- pass since the referenced user is real, so this correctly isolates
--   -- the RLS check instead of masking it.

-- B3. Admin-only catalog write test — as a non-admin authenticated user
-- (the founder's own account works for this, since kpi_definitions is
-- gated on is_admin(), not ownership):
--   supabase.from('kpi_definitions').insert({
--     key: 'test.metric', label: 'Test', category: 'test',
--     unit: 'count', target_direction: 'higher_is_better'
--   })
--   -- expect: succeeds only if the session's role is 'admin' in user_roles;
--   -- fails for any authenticated user without that role.

-- Deferred note: until a second real test account exists, B2/B3's DENIAL
-- direction can only be confirmed by reading the policy expressions in A4
-- (owner_user_id = auth.uid() or public.is_admin()) rather than by executing
-- them. Full behavioral confirmation of the denial path should happen before
-- Production go-live, once a second account is available to test with.
