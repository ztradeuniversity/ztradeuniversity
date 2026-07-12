-- AI CEO OS — Wave 2b (Relationship & Memory) verification queries
-- NOT a migration. Do not place this in migrations/ or run it as one.
--
-- Split into two sections from the start (lesson carried over from Wave 2a's
-- correction): the Supabase SQL Editor runs as `postgres`, which bypasses
-- Row Level Security entirely — Section A's metadata queries are safe there;
-- Section B's behavioral RLS checks are NOT and must run through the app or
-- an authenticated Supabase client, never pasted into the SQL Editor.

-- ============================================================
-- SECTION A — SQL Editor Verification (safe, read-only, metadata only)
-- ============================================================

-- A1. Table + type existence (run after all of 014-020 applied)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'ib_clients', 'lead_pipeline', 'client_touches', 'decision_log',
    'research_library', 'knowledge_base', 'risk_register'
  )
order by table_name;
-- Expect all 7 rows.

select typname from pg_type where typname in ('client_lifecycle_stage', 'verdict_type');
-- Expect exactly 2 rows.

-- A2. client_lifecycle_stage enum values match the Wave 4 UI's kanban
-- columns exactly.
select enumlabel from pg_enum
where enumtypid = 'public.client_lifecycle_stage'::regtype
order by enumsortorder;
-- Expect: lead, qualified, onboarding, activated, engaged, at_risk, retained.

-- A3. Full RLS coverage check.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'ib_clients', 'lead_pipeline', 'client_touches', 'decision_log',
    'research_library', 'knowledge_base', 'risk_register'
  )
order by tablename;
-- Expect all 7 rows with rowsecurity = true.

-- A4. Foreign key sanity check.
select conrelid::regclass as table_name, conname, confrelid::regclass as references_table
from pg_constraint
where contype = 'f'
  and conrelid::regclass::text in (
    'public.ib_clients', 'public.lead_pipeline', 'public.client_touches',
    'public.knowledge_base'
  )
order by table_name;
-- Expect: ib_clients -> users; lead_pipeline -> users, ib_clients;
-- client_touches -> users, ib_clients; knowledge_base -> users, research_library.

-- A5. Policy inventory — read the using/with_check expressions directly
-- rather than trying to trigger them (see Wave 2a's correction note for why).
select
  c.relname as table_name,
  p.polname as policy_name,
  p.polcmd as command,   -- r=select, a=insert, w=update, d=delete
  pg_get_expr(p.polqual, p.polrelid) as using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname in (
  'ib_clients', 'lead_pipeline', 'client_touches', 'decision_log',
  'research_library', 'knowledge_base', 'risk_register'
)
order by table_name, command;

-- A6. Zero DELETE policies anywhere in this wave (no-hard-deletes rule).
select relname, polname, polcmd
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in (
  'ib_clients', 'lead_pipeline', 'client_touches', 'decision_log',
  'research_library', 'knowledge_base', 'risk_register'
) and polcmd = 'd';
-- Expect: zero rows.

-- ============================================================
-- SECTION B — Authenticated Application / RLS Tests
-- DO NOT RUN THESE IN THE SQL EDITOR — see A above. Run only via the
-- deployed app once logged in, or a Supabase client using the anon key,
-- signed in as a real user.
-- ============================================================

-- B1. Self-access smoke test (founder's own session).
-- Expect: own rows returned normally.
--   supabase.from('ib_clients').select('*')
--   supabase.from('decision_log').select('*')
--   supabase.from('risk_register').select('*')

-- B2. Cross-user denial test — requires a SECOND real Supabase Auth user
-- (not a synthetic UUID — see the Wave 2a correction for why a fake ID
-- fails on a foreign key before RLS is ever evaluated).
-- Logged in as that second user:
--   supabase.from('ib_clients').select('*')        -- expect: empty
--   supabase.from('research_library').select('*')  -- expect: empty
--   supabase.from('lead_pipeline').insert({...})    -- with the founder's
--     -- own ib_client_id/owner_user_id — expect: denied by RLS, not by FK
--     -- (the referenced ib_client and user both exist for real here).

-- Deferred note: as with Wave 2a, full denial-path confirmation needs a
-- second real test account. If none exists yet, confirm via A5's policy
-- expressions in the meantime and close this out before Production go-live.
