-- ═══════════════════════════════════════════════════════════════════════════
-- CONTENT INTELLIGENCE CENTER — READ-ONLY SCHEMA AUDIT
-- Changes NOTHING. Run in the Supabase SQL Editor for the AI/Library project
-- (the one your Cloudflare env var AI_SUPABASE_URL points to — confirm the
-- exact project name/URL yourself in Cloudflare → Pages → Environment
-- Variables; I have no credentials to read that value myself).
--
-- Every table/column checked below was derived by reading the actual code
-- that executes when you Save/Publish an article — not assumed. See the
-- accompanying deployment report for the file:line trail for each one.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. ai_articles — every column article-store.js/ai-articles.js write.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'ai_articles'
order by ordinal_position;
-- Expected: id, title, slug, summary, content, category, tags, difficulty,
-- language, author, reading_time, is_active, created_at, updated_at,
-- seo_overrides (jsonb), last_verification (jsonb).
-- Missing seo_overrides/last_verification = confirmed cause of the live
-- "PATCH ai_articles failed (HTTP 400)" error already caught in Error Center.

-- 2. Every table Content Center's code path touches, confirmed present.
--    (kb_nodes/kb_edges are proven already working — 477 real graph concepts
--    already exist per your Executive Overview — included here only as a
--    sanity check, not because I expect them missing.)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'ai_articles', 'ai_article_images',      -- articles + images (article-store.js)
    'kb_nodes', 'kb_edges',                   -- Knowledge Graph — LOAD-BEARING for Publish
                                               -- (authoring-workflow.js publishConcept's
                                               -- actual success gate is the kb_nodes write)
    'kb_missing',                             -- chatbot demand log (kb-store.js)
    'kb_system_log',                          -- Error Center (system-log.js)
    'ai_response_logs',                       -- Chatbot Checker diagnostics (ai-supabase.js)
    'admin_modules',                          -- admin login (admin-store.js) — should already
                                               -- exist since you're already logged into
                                               -- Content Center in your screenshots
    'site_settings'                           -- Production Routing (new)
  )
order by table_name;

-- 3. Non-blocking audit-trail tables (kb_versions/kb_reviews/kb_sources) —
--    traced through authoring-workflow.js → review-runtime.js: these are
--    written best-effort AFTER the real kb_nodes write already succeeded, and
--    their failure does NOT fail a publish (confirmed by reading the code —
--    approveAndPublish's return value isn't even checked by its caller).
--    Listed for completeness only; NOT required for Publish to work.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('kb_versions', 'kb_reviews', 'kb_sources', 'kb_question_patterns')
order by table_name;

-- 4. Triggers on ai_articles — the code sets updated_at itself on every write
--    (application-side, not DB-side), so none are expected/required. This
--    just rules out an old manual trigger unexpectedly intercepting writes.
select trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public' and event_object_table = 'ai_articles';

-- 5. RLS on ai_articles. NOTE: every write goes through AI_SUPABASE_SERVICE_KEY
--    (service_role) — which bypasses RLS entirely by Postgres/Supabase design,
--    regardless of what policies exist. RLS structurally CANNOT be the cause
--    of the 400 errors as long as that env var is genuinely the service_role
--    key (verify that in Cloudflare — I cannot read env var values myself).
--    Run anyway to remove all doubt.
select relrowsecurity, relforcerowsecurity
from pg_class
where relname = 'ai_articles' and relnamespace = 'public'::regnamespace;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'ai_articles';

-- 6. Indexes on ai_articles — a missing index affects query speed, never
--    produces a 400/401/403/500, so not required for the current bug. Listed
--    for completeness. (Slug uniqueness is enforced APPLICATION-side in
--    ai-articles.js, not via a DB unique index — intentionally not adding one
--    now, since retrofitting a unique constraint onto existing data could
--    itself fail if any duplicate slugs already slipped through.)
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'ai_articles';

-- 7. Postgres functions / RPCs — grepped the entire codebase for `/rpc/` and
--    `.rpc(` calls: zero matches. No Postgres function is required by any
--    Content Center code path. This query just confirms nothing unexpected
--    exists that the code might be assuming.
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public';

-- 8. PostgREST schema-cache staleness check. If seo_overrides/last_verification
--    show up in query #1 above (i.e. they genuinely exist in Postgres) but
--    Publish still 400s, PostgREST's cache may not have refreshed. Compare
--    query #1's result against a live GET to:
--      https://<your-project-ref>.supabase.co/rest/v1/
--    (the PostgREST-visible schema). If they disagree, run this (safe, no
--    data change):
--      NOTIFY pgrst, 'reload schema';
select current_setting('server_version') as postgres_version;
