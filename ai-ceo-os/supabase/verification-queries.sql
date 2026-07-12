-- AI CEO OS — Wave 2 verification queries
-- NOT a migration. Do not place this in migrations/ or run it as one — Supabase
-- migration tooling should only ever see numbered files in that folder.
--
-- Run each block after its corresponding migration applies. All of these are
-- read-only (SELECT) except the two explicitly marked cross-user RLS tests,
-- which attempt a write specifically to prove it's denied.

-- ============================================================
-- After 001_users.sql
-- ============================================================
-- Confirm the table and trigger exist.
select count(*) as user_table_exists
from information_schema.tables
where table_schema = 'public' and table_name = 'users';

select count(*) as trigger_exists
from information_schema.triggers
where trigger_name = 'on_auth_user_created';

-- ============================================================
-- After 002_roles.sql
-- ============================================================
-- Confirm the 'admin' role was seeded.
select * from public.roles where name = 'admin';

-- Confirm is_admin() exists and returns false for a random/no-session context
-- (run this as the anon/service role in the SQL editor, not as a logged-in user).
select public.is_admin('00000000-0000-0000-0000-000000000000'::uuid) as should_be_false;

-- ============================================================
-- After 003_admin_allowlist.sql
-- ============================================================
select count(*) as allowlist_table_exists
from information_schema.tables
where table_schema = 'public' and table_name = 'admin_allowlist';

-- Confirm it's genuinely empty until the founder inserts their own row manually
-- (see the Wave 2 checklist's Founder Actions section).
select count(*) as should_be_zero_until_founder_adds_self from public.admin_allowlist;

-- ============================================================
-- After 004_settings.sql
-- ============================================================
-- Confirm all 15 feature flags seeded, every one FALSE.
select key, value from public.settings where scope = 'global' order by key;
-- Expect 15 rows, every `value` = false.

select count(*) as flag_count from public.settings where scope = 'global';
-- Expect 15.

-- ============================================================
-- After 005_audit_log.sql
-- ============================================================
select count(*) as audit_log_table_exists
from information_schema.tables
where table_schema = 'public' and table_name = 'audit_log';

select count(*) as index_exists
from pg_indexes
where indexname = 'audit_log_created_at_idx';

-- ============================================================
-- RLS cross-user tests — run these using the Supabase client with the ANON
-- key and an authenticated (but non-allowlisted) session, never as service_role.
-- Every one of these must fail/return zero rows. If any succeeds, STOP —
-- that is a Critical finding per the Risk Matrix (Implementation Execution Plan §8).
-- ============================================================

-- (a) An authenticated non-admin user must not see admin_allowlist.
select * from public.admin_allowlist; -- expect: empty result, not an error with data

-- (b) An authenticated non-admin user must not see roles or other users' user_roles rows.
select * from public.roles; -- expect: empty
select * from public.user_roles where user_id <> auth.uid(); -- expect: empty

-- (c) An authenticated non-admin user must not see audit_log.
select * from public.audit_log; -- expect: empty

-- (d) An authenticated non-admin user must not be able to write a global setting.
update public.settings set value = 'true' where scope = 'global' and key = 'm1.kpi-center';
-- expect: 0 rows affected (RLS silently filters, does not error)

-- (e) An authenticated non-admin user CAN read global settings (this one should succeed).
select key, value from public.settings where scope = 'global';
-- expect: all 15 rows returned — settings_select intentionally allows this

-- ============================================================
-- Full RLS coverage check — every table created in Wave 2 must appear here
-- with rowsecurity = true. If any row shows false, that table shipped without
-- RLS and must not be considered done.
-- ============================================================
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
-- Expect: users, roles, user_roles, admin_allowlist, settings, audit_log —
-- all with rowsecurity = true.
