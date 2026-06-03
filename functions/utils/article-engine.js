// functions/utils/article-engine.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE KNOWLEDGE ENGINE (Module 2) — ARCHITECTURE / FOUNDATION ONLY
//
// The site has many educational articles (text + screenshots + chart examples).
// This module defines the future contract for searching, citing, and
// recommending that content. Nothing is wired to a datastore yet — every
// function is a safe stub returning `configured:false` so callers degrade
// gracefully until a future phase populates `ai_articles` (see Supabase plan).
//
//   FUTURE FLOW:
//     query → searchArticles() → rank (tags + keyword + future embeddings)
//           → cite/recommend → response-engine renders a "Related article" block
// ════════════════════════════════════════════════════════════════════════════

// Canonical article shape (what an ingested article will look like).
export const ARTICLE_SCHEMA = {
  id:          'uuid',
  slug:        'string (url path)',
  title:       'string',
  content:     'markdown/plain text',
  summary:     'short string',
  tags:        ['string'],
  difficulty:  'beginner | intermediate | advanced',
  images:      ['ARTICLE_IMAGE_SCHEMA (see image-engine.js)'],
  embedding:   'vector(1536) — future pgvector semantic search',
  isActive:    'boolean',
  updatedAt:   'timestamp',
};

// Whether a live article store is connected (always false until a future phase).
export function isArticleStoreConfigured(/* env */) { return false; }

// FUTURE: keyword/tag/semantic search over articles.
export async function searchArticles(/* { query, tags, limit } */) {
  return { configured: false, results: [] };
}

// FUTURE: pick the single most relevant article for an intent/topic.
export async function recommendArticle(/* { intent, topic, tags } */) {
  return { configured: false, article: null };
}

// FUTURE: fetch one article (with its images) by slug/id.
export async function getArticle(/* idOrSlug */) {
  return { configured: false, article: null };
}

// Renders a "Related article" citation block once articles exist (pure helper,
// safe to call now — returns '' when nothing is provided).
export function renderArticleCitation(article) {
  if (!article || !article.title) return '';
  const link = article.slug ? `[${article.title}](${article.slug})` : `**${article.title}**`;
  return `\n\n📖 **Related reading:** ${link}${article.summary ? ` — ${article.summary}` : ''}`;
}
