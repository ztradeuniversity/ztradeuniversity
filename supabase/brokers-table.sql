-- supabase/brokers-table.sql
-- ════════════════════════════════════════════════════════════════════════════
-- "YOUR BROKERS" — admin-managed broker list for the License Request flow
--
-- Project: the AUTOMATION Supabase project used by license-request.html and
--          admin/js/admin-dashboard.js — ref `yivkkfplrkcncjaqifxb`.
--          NOT the AI, Library, Journal or CEO projects.
--
-- WHY A DEDICATED TABLE
-- --------------------
-- The broker list was hardcoded in two places (license-request.html's <select>
-- + its ALLOWED_BROKERS array, and admin-dashboard.html's createLicenseBroker
-- <select>). Making it admin-managed needs one authoritative persistent home.
-- The automation project was probed for an existing generic configuration
-- mechanism and has NONE — every one of these returned HTTP 404:
--   brokers · broker_options · broker_list · site_settings · settings ·
--   config · app_config · admin_settings
-- (`site_settings` DOES exist, but only in the separate AI/Chatbot project,
-- which the public License Request form does not talk to and must not be
-- coupled to.) A small dedicated table is therefore the cleanest and safest
-- option, and it keeps broker configuration isolated from every other system.
--
-- HISTORICAL DATA IS NOT AFFECTED
-- -------------------------------
-- Each license_requests row stores its own broker in `broker_name` (TEXT).
-- Verified on the live table: ids 37-40 all carry broker_name='Exness'. This
-- table is ONLY the list of choices offered for NEW submissions. Disabling a
-- broker sets is_active=false, which removes it from future selectors and
-- changes NO historical row. Nothing reconstructs a past request's broker from
-- this table.
--
-- NORMALIZATION
-- -------------
-- `name` keeps the exact display spelling the administrator typed. The unique
-- index is on lower(btrim(name)), so "Exness", "exness", " EXNESS " are one
-- broker and cannot be added twice. Re-adding a disabled broker re-activates
-- the existing row rather than creating a duplicate.
--
-- ACCESS MODEL — NO ANON POLICIES AT ALL
-- --------------------------------------
-- RLS is enabled and this table has ZERO policies, so the public anon key
-- (which is committed in license-request.html by design) can neither read nor
-- write it directly. Every access goes through functions/api/brokers.js using
-- EA_SUPABASE_SERVICE_KEY, which bypasses RLS:
--     public  GET  /api/brokers          → ACTIVE broker names only
--     admin   GET  /api/brokers?all=1    → all brokers  (requireAdminModule)
--     admin   POST /api/brokers          → add / enable / disable (requireAdminModule)
--
-- Those credentials are VERIFIED, not assumed: library-auth.js resolves emails
-- by querying 'broker_accounts' AND 'license_requests' through
-- EA_SUPABASE_URL / EA_SUPABASE_SERVICE_KEY, and library-debug.js reads the
-- same tables from the same project — so that key is a service-role key for
-- THIS project. A live probe (POST /api/library-auth {action:'verify-session'}
-- with a nonexistent account) returned {ok:true, valid:false}; an unconfigured
-- deployment would have returned valid:true from demo mode.
--
-- There is deliberately no DELETE path anywhere: a broker is disabled, never
-- destroyed, so the audit trail of what was once offered stays intact.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brokers (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,                 -- display name, as typed by the admin
  is_active   BOOLEAN     NOT NULL DEFAULT true,    -- false = hidden from NEW submissions only
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case/whitespace-insensitive uniqueness: "Exness" / "exness" / " EXNESS " are
-- the same broker. Applies to active AND inactive rows, so re-adding a disabled
-- broker updates the existing row instead of creating a second one.
CREATE UNIQUE INDEX IF NOT EXISTS brokers_name_norm_idx
  ON public.brokers (lower(btrim(name)));

-- Fast path for the public form's "active brokers, in order" query.
CREATE INDEX IF NOT EXISTS brokers_active_idx
  ON public.brokers (is_active, sort_order, name);

-- RLS ON, NO POLICIES. With RLS enabled and no policy defined, PostgREST's
-- anon/authenticated roles are denied every operation — SELECT included. The
-- service_role key used by functions/api/brokers.js bypasses RLS, so the
-- Function remains the one and only way in. Do NOT add an anon policy here:
-- that is precisely the hole this design closes.
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

-- Idempotent: strip any anon policies from an earlier draft of this migration.
DROP POLICY IF EXISTS brokers_anon_read   ON public.brokers;
DROP POLICY IF EXISTS brokers_anon_insert ON public.brokers;
DROP POLICY IF EXISTS brokers_anon_update ON public.brokers;

-- ── NO SEED DATA — DELIBERATE ──────────────────────────────────────────────
-- An earlier version of this file seeded five broker names ('Exness', 'HFM',
-- 'Pepperstone', 'IC Markets', 'Other') to preserve day-one behaviour. That
-- was a mistake: it pre-populated the administrator's list with brokers they
-- had never chosen, and because the public selector correctly renders whatever
-- is active, "IC Markets" and "Other" appeared on the public form and looked
-- exactly like a surviving hardcoded list. There is no implicit "Other".
--
-- The table now starts EMPTY. The administrator adds their own brokers in
-- Admin Dashboard → Your Brokers, and until at least one exists the public
-- form says broker selection is unavailable rather than inventing options.
--
-- IF YOU ALREADY RAN THE SEEDED VERSION of this file: the five rows are still
-- there. Remove the ones you did not want with the Delete button in Your
-- Brokers (no SQL needed) — deleting a broker configuration row never touches
-- license_requests.broker_name on historical requests.

-- ── POST-CHECKS ────────────────────────────────────────────────────────────
-- 1. The table (empty on a fresh install — brokers are added from the UI):
--   SELECT id, name, is_active, sort_order FROM public.brokers ORDER BY sort_order, name;
--
-- 2. RLS is on and NO policy exists (this is the security guarantee):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.brokers'::regclass;   -- expect: true
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='brokers';  -- expect: 0
--
-- 3. Confirm the anon role is locked out (expect 0 rows / permission denied):
--   SET LOCAL ROLE anon;  SELECT count(*) FROM public.brokers;  RESET ROLE;
