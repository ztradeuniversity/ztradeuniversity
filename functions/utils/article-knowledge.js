// functions/utils/article-knowledge.js
// ════════════════════════════════════════════════════════════════════════════
// AI KNOWLEDGE RETRIEVAL — Search (M4), AI injection (M5), Related (M6),
// Knowledge Safety priority (M9). Built on article-store (no protected file
// touched). Education-only; never emits a signal.
//
// M9 SAFETY PRIORITY (internal knowledge overrides hallucination):
//   1) Internal Articles (ai_articles)
//   2) Internal Broker Database (broker-data.js / ai_brokers)
//   3) Internal Pattern Database (pattern-engine / ai_pattern_vault)
//   4) Trusted external sources (reference links only)
// This module surfaces #1 (articles). Existing engines already own #2–#4; the
// KNOWLEDGE_PRIORITY constant documents the canonical ordering for the router.
// ════════════════════════════════════════════════════════════════════════════

import { isConfigured, searchCandidates, getArticle, listImages } from './article-store.js';
import { rankArticles, inferCategory } from './article-categories.js';

export const KNOWLEDGE_PRIORITY = [
  'internal-articles',     // ai_articles  (this module)
  'internal-broker-db',    // broker-data.js / ai_brokers
  'internal-pattern-db',   // pattern-engine / ai_pattern_vault
  'trusted-sources',       // reference links only
];

// ── MODULE 4 — SEARCH ────────────────────────────────────────────────────────
// Fetch a candidate set (filtered) then fuzzy-rank in JS.
export async function searchArticles(env, { q, category, tags, limit = 5 } = {}) {
  if (!isConfigured(env)) return [];
  const cat = category || (q ? inferCategory(q) : null);
  // Pull a generous candidate pool by category/tags, then rank by the full query.
  let candidates = await searchCandidates(env, { category: cat || undefined, tags, limit: 40 });
  // If category filter returned nothing, retry without it (broaden).
  if (!candidates.length && cat) candidates = await searchCandidates(env, { tags, limit: 40 });
  if (!q) return candidates.slice(0, limit);
  return rankArticles(q, candidates, limit);
}

// ── MODULE 5 — AI KNOWLEDGE INJECTION (articles-first) ───────────────────────
// Returns a ready-to-prepend context block + sources, or {found:false}.
export async function buildKnowledgeInjection(env, { query, intent, lang, limit = 2 } = {}) {
  if (!isConfigured(env)) return { found: false, configured: false, priority: KNOWLEDGE_PRIORITY };
  const hits = await searchArticles(env, { q: query, limit });
  if (!hits.length) return { found: false, configured: true, priority: KNOWLEDGE_PRIORITY };

  const blocks = hits.map(a => {
    const body = (a.summary && a.summary.length > 40) ? a.summary : (a.content || '').slice(0, 600);
    return `### ${a.title}\n${body}`;
  });

  // The AI should PREFER this internal knowledge over its own generation (M9).
  const context =
    `\n\n---\n## 📚 INTERNAL KNOWLEDGE (authoritative — prefer this over general reasoning)\n` +
    blocks.join('\n\n') +
    `\n---`;

  const sources = hits.map(a => ({ id: a.id, title: a.title, slug: a.slug, category: a.category }));
  return {
    found: true,
    configured: true,
    context,
    sources,
    citation: hits[0]?.slug
      ? `\n\n📖 **Source:** [${hits[0].title}](${hits[0].slug})`
      : (hits[0] ? `\n\n📖 **Source:** ${hits[0].title}` : ''),
    priority: KNOWLEDGE_PRIORITY,
  };
}

// ── ARTICLE → KOS CONCEPT (graph contribution) ───────────────────────────────
// Pure mapper: turn a published article into a Knowledge Object so it can enter
// the SAME authoring pipeline as anchor concepts (authorConcept, origin:'article').
// The concept lands as an ai_draft for human review — it is NOT auto-published, so
// article edits can never silently overwrite the live graph. Reuses existing
// architecture (no new tables, no new pipeline). Returns null when the article is
// too thin to make a useful concept.
export function conceptFromArticle(article) {
  if (!article || !article.id || !article.title) return null;
  const title = String(article.title).trim();
  const summary = (article.summary || '').trim();
  const content = (article.content || '').trim();
  const short = summary.length > 40 ? summary : content.slice(0, 400);
  if (!short) return null;                                   // nothing renderable
  const tags = Array.isArray(article.tags) ? article.tags.filter(Boolean) : [];
  const lowerTitle = title.toLowerCase();
  // At least one question pattern is required by the KOS contract — derive from the
  // title and tags (the retriever matches on these later).
  const questionPatterns = [
    lowerTitle,
    ...tags.slice(0, 4).map(t => `${String(t).toLowerCase()} ${lowerTitle}`),
  ].filter(Boolean);
  return {
    id: `article-${article.id}`,                            // namespaced — no clash with anchors
    category: article.category || 'articles',
    topic: title,
    title,
    level: article.difficulty || 'beginner',
    lang: article.language || 'en',
    concepts: tags.length ? tags : [lowerTitle],
    questionPatterns,
    canonical: {
      short,
      deep: content.slice(0, 1200) || short,
    },
    relevanceTags: tags,
    responseObjective: 'educate',
    desiredOutcome: 'answer grounded in published ZTU article content',
    origin: 'article',
    sources: [{ id: String(article.id), title, slug: article.slug || null }],
    status: 'ai_draft',
    confidence: 'MEDIUM',
  };
}

// ── MODULE 6 — RELATED ARTICLES + IMAGES + NEXT READING ──────────────────────
export async function relatedArticles(env, articleId, limit = 4) {
  if (!isConfigured(env) || !articleId) return { related: [], images: [], next: null };
  const base = await getArticle(env, articleId);
  if (!base) return { related: [], images: [], next: null };

  const pool = await searchCandidates(env, { category: base.category, tags: base.tags, limit: 20 });
  const related = pool
    .filter(a => a.id !== base.id)
    .map(a => {
      const sharedTags = (a.tags || []).filter(t => (base.tags || []).includes(t)).length;
      return { a, score: (a.category === base.category ? 3 : 0) + sharedTags };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(x => ({ id: x.a.id, title: x.a.title, slug: x.a.slug, category: x.a.category }));

  const images = await listImages(env, articleId);
  return {
    related,
    images: images.map(i => ({ url: i.url, caption: i.caption, alt: i.alt_text })),
    next: related[0] || null,   // recommended next reading
  };
}
