-- =============================================================================
-- PREMIUM COURSE ENROLLMENTS — intake for "Premium Course + Live Mentorship"
-- Project: EA / System A Supabase (the project EA_SUPABASE_URL points at —
--          the same one that holds license_requests / broker_accounts)
-- =============================================================================
--
-- STATUS OF THIS FILE
--   This is the CURRENT, corrected schema. An earlier draft of this file
--   (payment-screenshot version) was written in this repository but, per this
--   conversation's own instructions, NEVER executed — no SQL from either
--   version has been run against production. There is no data to migrate and
--   no bucket to remove; this file simply replaces the earlier draft.
--   See "PRODUCTION ROW CHECK" in the accompanying report for exactly how
--   this was established.
--
-- REASON
--   The premium course ($150, Batch 30 onward) is a PAID enrolment, separate
--   from IB membership. A learner fills premium-course-enrollment.html and
--   submits structured PAYMENT DETAILS (sender name, date, method, bank if
--   relevant, transaction id, amount) — no file upload of any kind. Payment
--   proof (the screenshot) is verified separately, over WhatsApp, outside
--   this table entirely. One small dedicated table is still the minimum
--   honest change: reusing license_requests would corrupt the meaning of its
--   statuses and the automation engine that drains it.
--
-- SECURITY MODEL
--   · NO anon access. RLS is ON with NO policies, so the public anon key can
--     neither read nor write this table. All access goes through the
--     server-side Worker /api/course-enrollment, which uses the service-role
--     key (never exposed to the browser).
--   · No email/phone is required by the form; `contact` exists because an
--     operator usually needs one way to reach the learner. Optional, capped.
--   · No file/image column exists in this table at all — there is nothing
--     here that needs bucket-level protection.
--
-- SAFETY
--   Purely additive relative to nothing (fresh table). No existing table,
--   column, policy or row anywhere in the project is touched.
--
-- DO NOT AUTO-EXECUTE — run manually in the System A Supabase SQL editor after
-- review/approval.
-- =============================================================================

-- ── TABLE ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- learner
  full_name        text NOT NULL,
  father_name      text NOT NULL,
  contact          text,                       -- optional: how to reach them

  -- what the operator actually needs in order to place the learner
  background       text,                       -- what have you studied before
  goals            text,                       -- what do you want to learn
  expectations     text,                       -- course expectations
  referral_source  text,                       -- how did you hear about this

  -- offer snapshot (recorded at submit time, so a later price/batch change
  -- never rewrites history)
  batch            text NOT NULL DEFAULT 'Batch 30',
  amount_usd       numeric(10,2) NOT NULL DEFAULT 150,

  -- ── structured payment details (replaces the earlier screenshot-upload
  --    design entirely — no proof file, no bucket, no signed URL) ──
  payment_sender_name text NOT NULL,
  payment_date         date NOT NULL,
  payment_method        text NOT NULL CHECK (payment_method IN ('Bank Transfer','Cash','Other')),
  bank_name             text,                  -- required only when payment_method = 'Bank Transfer' (app-enforced)
  transaction_id        text,                  -- required unless payment_method = 'Cash' (app-enforced)
  amount_paid            numeric(10,2) NOT NULL CHECK (amount_paid > 0),

  -- review workflow — payment_review now means "admin checked these details
  -- AND the screenshot the learner sent separately over WhatsApp"
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','payment_review','approved','rejected')),
  admin_note       text,

  submitted_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_status_submitted
  ON public.course_enrollments (status, submitted_at DESC);

-- ── RLS: locked shut. Only the service-role Worker may touch this table. ─────
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
-- (Deliberately NO policies. service_role bypasses RLS; anon/authenticated
--  therefore have no read and no write path at all.)


-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Run ONLY to fully undo the migration above.
--
-- DROP INDEX IF EXISTS public.idx_course_enrollments_status_submitted;
-- DROP TABLE IF EXISTS public.course_enrollments;


-- =============================================================================
-- IF THE EARLIER (screenshot-upload) VERSION OF THIS TABLE WAS SOMEHOW ALREADY
-- CREATED — i.e. you ran the previous draft of this file independently of
-- this conversation — use THIS additive migration instead of the CREATE TABLE
-- above. It adds the new payment columns and safely stops requiring the old
-- proof_path column, without dropping it or any data.
--
-- Before running this block, first check whether any rows exist and whether
-- `proof_path` is populated:
--
--   SELECT count(*) FROM public.course_enrollments;
--   SELECT count(*) FROM public.course_enrollments WHERE proof_path IS NOT NULL;
--
-- If both are 0, it is safe to also run the optional DROP COLUMN at the very
-- end. If either is > 0, leave proof_path in place (deprecated but harmless)
-- rather than destroying historical data.
-- =============================================================================

-- ALTER TABLE public.course_enrollments
--   ADD COLUMN IF NOT EXISTS payment_sender_name text,
--   ADD COLUMN IF NOT EXISTS payment_date         date,
--   ADD COLUMN IF NOT EXISTS payment_method        text,
--   ADD COLUMN IF NOT EXISTS bank_name             text,
--   ADD COLUMN IF NOT EXISTS transaction_id        text,
--   ADD COLUMN IF NOT EXISTS amount_paid            numeric(10,2);
--
-- ALTER TABLE public.course_enrollments
--   ALTER COLUMN proof_path DROP NOT NULL;               -- stop requiring the old field
--
-- ALTER TABLE public.course_enrollments
--   ADD CONSTRAINT course_enrollments_payment_method_check
--     CHECK (payment_method IN ('Bank Transfer','Cash','Other')) NOT VALID;
-- ALTER TABLE public.course_enrollments
--   VALIDATE CONSTRAINT course_enrollments_payment_method_check;
--
-- -- OPTIONAL, ONLY once you've confirmed zero rows reference it (see the two
-- -- SELECT checks above) and you no longer want the column at all:
-- -- ALTER TABLE public.course_enrollments DROP COLUMN IF EXISTS proof_path;
