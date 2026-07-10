-- ═══════════════════════════════════════════════════════════════════════════
-- CONTENT INTELLIGENCE CENTER — THE ONE FINAL MIGRATION
-- Run this AFTER reviewing the output of schema-audit-readonly.sql. Everything
-- below is additive (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS) —
-- safe to run even if some pieces are already applied; idempotent either way.
-- Project: the AI/Library Supabase project (AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY).
--
-- NOT included below, and why: kb_nodes/kb_edges (Knowledge Graph — proven
-- already working, 477 real concepts exist), kb_missing/kb_system_log/
-- ai_response_logs (proven working — Missing Topics and prior Error Center
-- entries already read/write them live), admin_modules (proven working —
-- you're already logged into Content Center). None of these need any SQL.
-- kb_versions/kb_reviews/kb_sources are non-blocking audit-trail tables (see
-- authoring-workflow.js → review-runtime.js) — publish succeeds without them
-- even if absent, so they're intentionally not created here either; add them
-- later only if you specifically want that audit trail.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Manual-mode SEO override storage (ai_articles).
--    Why: article-store.js/ai-articles.js write this on every create/update.
--    Safe: additive jsonb column, constant default, no table rewrite.
ALTER TABLE ai_articles
  ADD COLUMN IF NOT EXISTS seo_overrides jsonb DEFAULT '{}'::jsonb;

-- 2. Publish-verification snapshot storage (ai_articles).
--    Why: ai-articles.js's publish/repair actions write this so the Library's
--    independent SEO/Graph/Chatbot status columns and Error Center don't need
--    a live re-check on every page load. THIS IS THE COLUMN CONFIRMED MISSING
--    by the live "PATCH ai_articles failed (HTTP 400)" error your Error Center
--    caught — very likely the actual cause of "Save Failed" / stuck-on-Draft.
--    Safe: additive jsonb column, constant default, no table rewrite.
ALTER TABLE ai_articles
  ADD COLUMN IF NOT EXISTS last_verification jsonb DEFAULT '{}'::jsonb;

-- 3. Generic settings store — currently used for the Production Routing config
--    (Chatbot Checker). New table, touches nothing existing.
--    Why: ai-chat.js reads this on every real chat request; ai-kb-admin.js
--    writes it when an admin toggles a source on/off for all visitors.
--    Safe: brand-new table, zero interaction with any existing table/row.
CREATE TABLE IF NOT EXISTS site_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. Force PostgREST to pick up the schema change immediately, rather than
--    waiting for its own cache-refresh cycle (a known Supabase/PostgREST
--    gotcha — the columns can exist in Postgres and still 400 at the API
--    layer until this fires, or the API is manually restarted).
--    Safe: no data change, purely a cache-invalidation signal.
NOTIFY pgrst, 'reload schema';
