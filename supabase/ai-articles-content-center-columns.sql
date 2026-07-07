-- Content Intelligence Center — Manual-mode SEO field storage.
-- Adds one additive JSONB column to hold author-entered SEO overrides
-- (seoTitle, h1, metaTitle, metaDescription, canonicalUrl, focusKeyword,
-- secondaryKeywords, ogTitle, ogDescription, twitterCard, externalLinks,
-- schemaOverride). Any field left blank keeps falling back to the existing
-- computed logic in article-enrich.js's buildSeoSuggestion() — this column
-- only stores what an author explicitly typed. Safe to run multiple times.

ALTER TABLE ai_articles
  ADD COLUMN IF NOT EXISTS seo_overrides jsonb DEFAULT '{}'::jsonb;

-- Articles Library independent SEO/Knowledge-Graph/Chatbot status columns (spec
-- Phase 6). Stores the exact verifyPublishPipeline() result from the most recent
-- publish attempt so the Library can show 3 independent status columns without
-- re-running verification (a live retrieval probe) on every list load. Written by
-- the existing `publish` action only — never a new verification path.
ALTER TABLE ai_articles
  ADD COLUMN IF NOT EXISTS last_verification jsonb DEFAULT '{}'::jsonb;
