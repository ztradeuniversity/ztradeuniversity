-- Generic key/value config store (AI Supabase project) — introduced for the
-- Chatbot Checker's "Production Routing" control (functions/utils/site-settings.js).
-- Generic on purpose so future admin-configurable settings reuse this table
-- instead of a new one-off table per setting.

CREATE TABLE IF NOT EXISTS site_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
