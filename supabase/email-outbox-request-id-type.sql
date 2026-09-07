-- supabase/email-outbox-request-id-type.sql
-- ════════════════════════════════════════════════════════════════════════════
-- EMAIL/WA OUTBOX — realign request_id with its documented type
--
-- Project: the AUTOMATION Supabase project used by license-request.html and
--          admin/js/admin-dashboard.js — ref `yivkkfplrkcncjaqifxb`.
--          NOT the AI, Library, Journal or CEO projects.
--
-- WHY THIS IS A SCHEMA DEFECT, NOT AN APPLICATION DEFECT
-- ------------------------------------------------------
-- 1. `request_id` exists to hold a license_requests.id. The PowerShell engine
--    reads it (master_engine.ps1, Phase 18.4): after a 'waiting' (ack) email is
--    sent it calls Set-EmailMarker -Id $row.request_id to stamp
--    ack_email_sent_at on license_requests.id = request_id.
-- 2. license_requests.id is BIGINT — verified against the live database:
--       GET /license_requests?id=eq.00000000-0000-0000-0000-000000000000
--       -> {"code":"22P02","message":"invalid input syntax for type bigint"}
-- 3. The live email_outbox.request_id (and wa_outbox.request_id) is UUID —
--    verified the same way:
--       GET /email_outbox?request_id=eq.47
--       -> {"code":"22P02","message":"invalid input syntax for type uuid: \"47\""}
-- 4. A UUID column therefore CANNOT EVER hold a valid reference to its own
--    target table's primary key. The relationship is unsatisfiable as deployed.
-- 5. The project's own documented migration (admin/js/admin-dashboard.js,
--    "REQUIRED SUPABASE MIGRATION — run once in SQL editor") specifies:
--       request_id  TEXT,  -- license_requests.id as text (UUID or numeric — works either way)
--    So production diverges from the design that is checked into this repo.
--
-- This migration brings production back in line with the documented design.
--
-- SAFETY
-- ------
-- · uuid -> text is a WIDENING cast: every existing value remains valid and is
--   preserved verbatim. Nothing is deleted and no row is rewritten.
-- · Verified on the live table 2026-09-07: all existing email_outbox rows have
--   request_id IS NULL, so there is no data to convert at all.
-- · No RLS policy, index, trigger or downstream reader depends on the uuid type
--   (PostgREST filters and the PowerShell engine both treat it as a string).
-- · The application does NOT require this migration to function: both writers
--   now retry without the link on a type error, so the acknowledgement email is
--   queued either way. This migration only RESTORES the id linkage that lets
--   the engine stamp ack_email_sent_at automatically.
--
-- PRE-CHECK (expect: data_type = 'uuid' for both rows)
--   SELECT table_name, column_name, data_type
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('email_outbox','wa_outbox')
--      AND column_name = 'request_id';
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.email_outbox
  ALTER COLUMN request_id TYPE text USING request_id::text;

ALTER TABLE public.wa_outbox
  ALTER COLUMN request_id TYPE text USING request_id::text;

-- POST-CHECK (expect: data_type = 'text' for both rows)
--   SELECT table_name, column_name, data_type
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('email_outbox','wa_outbox')
--      AND column_name = 'request_id';

-- ROLLBACK — only safe while every request_id is NULL or a valid uuid.
-- After this migration real numeric ids will be stored, and reverting would
-- fail on them; clear them first if you ever genuinely need to revert.
--   ALTER TABLE public.email_outbox
--     ALTER COLUMN request_id TYPE uuid USING request_id::uuid;
--   ALTER TABLE public.wa_outbox
--     ALTER COLUMN request_id TYPE uuid USING request_id::uuid;
