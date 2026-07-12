-- AI CEO OS — Migrations 021-030 verification queries
-- NOT a migration. SQL-Editor-safe (Section A) / authenticated-app-only
-- (Section B) split, same discipline as Wave 2a/2b.

-- ============================================================
-- SECTION A — SQL Editor Verification
-- ============================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'coaching_memory', 'automation_registry', 'automation_run_ledger', 'approval_queue',
    'content_library', 'growth_tasks', 'marketing_campaigns', 'notifications',
    'prompt_archive', 'external_id_map'
  )
order by table_name;
-- Expect all 10 rows.

select typname from pg_type
where typname in ('automation_matrix_class', 'content_status', 'notification_class');
-- Expect 3 rows.

select enumlabel from pg_enum where enumtypid = 'public.automation_matrix_class'::regtype order by enumsortorder;
-- Expect: full, ai_assisted, human_approval, human_only.

select enumlabel from pg_enum where enumtypid = 'public.content_status'::regtype order by enumsortorder;
-- Expect: idea, production, published, evergreen, retired.

select enumlabel from pg_enum where enumtypid = 'public.notification_class'::regtype order by enumsortorder;
-- Expect: info, reminder, warning, critical, approval_required.

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'coaching_memory', 'automation_registry', 'automation_run_ledger', 'approval_queue',
    'content_library', 'growth_tasks', 'marketing_campaigns', 'notifications',
    'prompt_archive', 'external_id_map'
  )
order by tablename;
-- Expect all 10 rows with rowsecurity = true (coaching_memory included —
-- RLS is enabled there too, it just has zero policies).

-- coaching_memory must have ZERO policies of any kind (service-role-only).
select count(*) as should_be_zero
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname = 'coaching_memory';

-- automation_run_ledger and notifications must have no INSERT policy for
-- authenticated roles (service-role-only writes).
select relname, polname, polcmd
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in ('automation_run_ledger', 'notifications') and polcmd = 'a';
-- Expect: zero rows.

select conrelid::regclass as table_name, conname, confrelid::regclass as references_table
from pg_constraint
where contype = 'f'
  and conrelid::regclass::text in (
    'public.automation_run_ledger', 'public.approval_queue', 'public.external_id_map'
  )
order by table_name;

-- Zero DELETE policies across the full batch.
select relname, polname, polcmd
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in (
  'coaching_memory', 'automation_registry', 'automation_run_ledger', 'approval_queue',
  'content_library', 'growth_tasks', 'marketing_campaigns', 'notifications',
  'prompt_archive', 'external_id_map'
) and polcmd = 'd';
-- Expect: zero rows.

-- ============================================================
-- SECTION B — Authenticated Application / RLS Tests
-- DO NOT RUN IN THE SQL EDITOR (runs as `postgres`, bypasses RLS).
-- ============================================================

-- B1. Self-access smoke test (founder's own session).
--   supabase.from('approval_queue').select('*')
--   supabase.from('content_library').select('*')
--   supabase.from('growth_tasks').select('*')

-- B2. coaching_memory must be unreachable even for the founder's own
-- authenticated session (not just other users) — this is the one table
-- where even a self-owned row should NOT come back via the normal client.
--   supabase.from('coaching_memory').select('*')  -- expect: empty, always

-- B3. Cross-user denial (requires a second real test account, per the
-- Wave 2a/2b precedent) — deferred if none exists yet, must close before
-- Production go-live.
