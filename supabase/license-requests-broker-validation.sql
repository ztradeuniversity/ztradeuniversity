-- supabase/license-requests-broker-validation.sql
-- ════════════════════════════════════════════════════════════════════════════
-- SERVER-SIDE BROKER VALIDATION for new license requests
--
-- Project: the AUTOMATION Supabase project — ref `yivkkfplrkcncjaqifxb`.
-- Run AFTER supabase/brokers-table.sql.
--
-- WHY A DATABASE TRIGGER AND NOT APPLICATION CODE
-- -----------------------------------------------
-- license-request.html inserts into license_requests DIRECTLY from the browser
-- with the public anon key (verified: `supabaseClient.from(TABLE_NAME).insert`
-- in the submit handler — there is no server-side submission endpoint). The
-- client-side check against the active broker list is therefore a UX guard
-- only: anyone can edit the DOM or POST to PostgREST and submit any string.
-- The one place that can actually refuse a tampered broker, without rebuilding
-- the whole submission pipeline (which would touch the duplicate guard, the
-- acknowledgement email and the engine trigger), is Postgres itself.
--
-- SCOPE — deliberately narrow
-- ---------------------------
-- · BEFORE INSERT ONLY. Existing rows are never re-validated, so historical
--   requests keep their broker_name even after that broker is disabled or
--   deleted from the configuration.
-- · UPDATEs are untouched, so the PowerShell engine's status transitions
--   (pending → matched → compile_ready → compiled → emailed) and the not-found
--   sweep continue to work regardless of the current broker list.
-- · NULL broker_name is allowed: license-request.html has a graceful cascade
--   that drops the column if it is missing, and blocking that would break the
--   submission rather than protect it.
-- · Comparison uses lower(btrim(...)), matching the brokers unique index and
--   the application's normalization exactly.
--
-- CONSEQUENCE TO BE AWARE OF
-- --------------------------
-- If NO broker is active, every new license request is rejected. That is the
-- intended reading of "only configured brokers may be selected" — the public
-- form already refuses to submit in that state — but it does mean an empty
-- broker list stops new submissions. Keep at least one broker active.
--
-- ROLLBACK (returns to application-only validation):
--   DROP TRIGGER IF EXISTS license_requests_broker_check ON public.license_requests;
--   DROP FUNCTION IF EXISTS public.assert_broker_is_active();
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assert_broker_is_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nothing to validate when no broker was supplied (legacy/cascade insert).
  IF NEW.broker_name IS NULL OR btrim(NEW.broker_name) = '' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.brokers b
     WHERE b.is_active
       AND lower(btrim(b.name)) = lower(btrim(NEW.broker_name))
  ) THEN
    RAISE EXCEPTION 'broker_not_allowed: %', NEW.broker_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- Store the administrator's canonical spelling, so a tampered casing can
  -- never split one broker across several values in reporting.
  SELECT b.name INTO NEW.broker_name
    FROM public.brokers b
   WHERE b.is_active
     AND lower(btrim(b.name)) = lower(btrim(NEW.broker_name))
   LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS license_requests_broker_check ON public.license_requests;

CREATE TRIGGER license_requests_broker_check
  BEFORE INSERT ON public.license_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_broker_is_active();

-- ── POST-CHECKS ────────────────────────────────────────────────────────────
-- 1. Trigger exists, INSERT-only:
--   SELECT tgname, tgtype FROM pg_trigger
--    WHERE tgrelid = 'public.license_requests'::regclass AND NOT tgisinternal;
--
-- 2. Historical rows are untouched (the trigger never runs on existing data):
--   SELECT id, broker_name, status FROM public.license_requests ORDER BY id;
--
-- 3. A tampered broker is refused (expect: ERROR broker_not_allowed):
--   INSERT INTO public.license_requests (account_number, email, status, broker_name)
--   VALUES ('000000000','probe@example.invalid','pending','NoSuchBroker');
--
-- 4. An active broker is accepted and canonicalized — delete the probe row after:
--   INSERT INTO public.license_requests (account_number, email, status, broker_name)
--   VALUES ('000000000','probe@example.invalid','pending','<lowercase active broker>')
--   RETURNING id, broker_name;
--   DELETE FROM public.license_requests WHERE account_number = '000000000';
