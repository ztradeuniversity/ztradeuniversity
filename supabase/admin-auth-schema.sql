-- supabase/admin-auth-schema.sql
-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE ADMIN PORTAL — per-module password store.
-- One row per admin module (kb / signals / governance / articles / feedback /
-- dashboard / architecture / journal / library). Lives in the existing AI
-- Supabase project (AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY) — no new
-- Supabase project required. Read/written only by functions/api/admin-auth.js
-- and functions/utils/admin-store.js.
--
-- A row is created lazily on a module's first successful login (falling back
-- to the day-1 master password, ZTU-Admin-2026 — see admin-store.js
-- MASTER_PASSWORD) — running this migration is all that's required; no manual
-- seed rows are needed.
--
-- reset_email: the module's recovery email. Until a row/value exists, the
-- Master Recovery Email (admin-store.js MASTER_RECOVERY_EMAIL, seeded as
-- sirmzubair@gmail.com, overridable via ADMIN_RECOVERY_EMAIL) is used — that
-- default is NOT the permanent store; the first time a module's recovery
-- email is set or changed, this column takes over for that module.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists admin_modules (
  module_key             text primary key,
  password_hash          text not null,
  salt                    text not null,
  iterations              integer not null default 100000,
  reset_email             text,
  reset_email_verified    boolean not null default false,
  reset_email_verified_at timestamptz,
  reset_email_updated_at  timestamptz,
  reset_otp_hash          text,
  reset_otp_exp           bigint,
  failed_attempts         integer not null default 0,
  locked_until            bigint,
  updated_at              timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

comment on table admin_modules is 'Enterprise Admin Portal: one independent password per admin module. Never shared across modules.';
