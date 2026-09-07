-- supabase/license-requests-active-duplicate-index.sql
-- ════════════════════════════════════════════════════════════════════════════
-- LICENSE REQUESTS — ATOMIC DUPLICATE GUARD (race-condition fix)
--
-- Project: the AUTOMATION Supabase project that license-request.html and
--          admin/js/admin-dashboard.js both use — ref `yivkkfplrkcncjaqifxb`
--          (https://yivkkfplrkcncjaqifxb.supabase.co). NOT the AI, Library,
--          Journal or CEO projects.
--
-- WHY: license-request.html blocks a repeat submission for the same normalized
-- account_number + email while a prior request is still in an active processing
-- cycle. That check is a SELECT followed by an INSERT, which is not atomic —
-- two submissions arriving in the same instant from two devices both read
-- "no open request" before either row is written, and both insert. This was
-- measured, not assumed: two concurrent submits produced two rows.
--
-- This partial unique index is the only atomic defence. It applies ONLY to
-- rows in an active status, so:
--   · a customer whose request ended `unmatched` can still submit again
--     (the existing, intended retry behaviour is preserved), and
--   · a customer already `emailed` is still handled by the Phase 16.1 guard.
--
-- lower(email) matches the case-insensitive comparison the application guard
-- already performs, so the two layers agree exactly.
--
-- CONFLICT CHECK (run BEFORE creating the index — must return zero rows):
--
--   SELECT account_number, lower(email) AS email_norm, count(*), array_agg(id)
--     FROM license_requests
--    WHERE status IN ('pending','matched','compile_ready','compiled','approved','compiling')
--    GROUP BY account_number, lower(email)
--   HAVING count(*) > 1;
--
-- Verified 2026-09-07 against the live table: 4 rows total, 0 of them in any
-- active status (3 × 'unmatched', 1 × 'emailed'), therefore 0 conflicts and no
-- historical row is touched by this index.
--
-- APPLICATION-SIDE PAIR: license-request.html already handles SQLSTATE 23505 and
-- turns the losing insert into the same friendly "already submitted" message,
-- with no ack email and no engine trigger. That handler is inert until this
-- index exists, so the two can be applied in either order.
-- ════════════════════════════════════════════════════════════════════════════

-- Preferred form — no write lock on the table.
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block. If the
-- Supabase SQL Editor reports "CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block", use the plain form below instead — on this table (4 rows)
-- the brief lock is negligible.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS license_requests_active_dup_idx
  ON license_requests (account_number, lower(email))
  WHERE status IN (
    'pending',
    'matched',
    'compile_ready',
    'compiled',
    'approved',
    'compiling'
  );

-- Fallback form (only if the CONCURRENTLY statement is rejected above):
--
-- CREATE UNIQUE INDEX IF NOT EXISTS license_requests_active_dup_idx
--   ON license_requests (account_number, lower(email))
--   WHERE status IN (
--     'pending',
--     'matched',
--     'compile_ready',
--     'compiled',
--     'approved',
--     'compiling'
--   );

-- Verification after creation (expect one row describing the index):
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'license_requests'
--      AND indexname = 'license_requests_active_dup_idx';

-- Rollback if ever needed (safe — removes only this index):
--   DROP INDEX CONCURRENTLY IF EXISTS license_requests_active_dup_idx;
