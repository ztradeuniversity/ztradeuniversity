// functions/utils/article-seo.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE SEO + GROWTH — Content Ecosystem PHASE C (+ remainder of PHASE A).
// Extends article-enrich.js with: related-ARTICLE suggestions, internal-link /
// recommendation-widget blocks, smart-chip question suggestions, and a per-article
// sitemap-entry SUGGESTION (architecture prep only — nothing writes to sitemap.xml).
//
// Pure (0 imports), deterministic. Every function takes already-resolved arrays
// (concept entries / article rows) so this stays a leaf module — composition
// happens in the admin handler, same pattern as article-enrich.js.
// ════════════════════════════════════════════════════════════════════════════

// Suggest related EXISTING articles (ai_articles rows) by tag/category overlap
// with the draft. Only returns articles that exist in the supplied list.
//
// PHASE E (dormant prep): optional `embedScores` = { [articleId]: cosineSim(-1..1) },
// same convention as article-enrich.suggestLinks — absent today (identical to
// before); when present, blends overlap with semantic similarity.
export function suggestRelatedArticles(draft = {}, articles = [], { limit = 3, embedScores = null } = {}) {
  const draftTags = new Set([...(draft.concepts || []), ...(draft.relevanceTags || [])].map(s => String(s).toLowerCase()));
  const ranked = articles
    .filter(a => a && a.id && a.id !== draft.id)
    .map(a => {
      const tags = new Set((a.tags || []).map(s => String(s).toLowerCase()));
      let hits = 0; for (const t of draftTags) if (tags.has(t)) hits++;
      let overlap = draftTags.size ? hits / draftTags.size : 0;
      if (a.category && a.category === draft.category) overlap += 0.25;
      const sim = embedScores ? embedScores[a.id] : null;
      const score = (typeof sim === 'number') ? overlap * 0.5 + Math.max(0, sim) * 0.5 : overlap;
      return { id: a.id, title: a.title, slug: a.slug || a.id, category: a.category, score };
    })
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked.map(({ score, ...rest }) => rest);
}

// Internal-link suggestions for the draft: related/next-step graph concepts +
// related articles, as {title, url, type, id}. URLs follow the same
// `${baseUrl}/${id}.html` convention as buildSeoSuggestion.canonicalUrl —
// suggestions for the admin/future page-builder, no live links are injected.
export function buildInternalLinks(draft = {}, { conceptEntries = [], relatedArticles = [], baseUrl = 'https://ztradeuniversity.com' } = {}) {
  const concepts = conceptEntries.map(e => ({ id: e.id, title: e.title || e.topic || e.id, url: `${baseUrl}/${e.id}.html`, type: 'concept' }));
  const articles = relatedArticles.map(a => ({ id: a.id, title: a.title, url: `${baseUrl}/articles/${a.slug || a.id}`, type: 'article' }));
  return [...concepts, ...articles];
}

// Smart-chip question suggestions for this draft: its own question patterns, one
// question per related/next-step concept, and one per related article — for the
// chip row shown after publish. PHASE D: as the graph grows (more related concepts
// + related articles get found), this list automatically gets richer.
export function suggestSmartChips(draft = {}, { conceptEntries = [], relatedArticles = [], limit = 6 } = {}) {
  const own = (draft.questionPatterns || []).slice(0, 3);
  const fromConcepts = conceptEntries
    .map(e => (Array.isArray(e.questionPatterns) && e.questionPatterns[0]) || (e.title ? `What is ${e.title}?` : null))
    .filter(Boolean);
  const fromArticles = relatedArticles
    .map(a => (a.title ? `What is ${a.title}?` : null))
    .filter(Boolean);
  return Array.from(new Set([...own, ...fromConcepts, ...fromArticles])).slice(0, limit);
}

// "Continue learning" recommendation widget — same link set as buildInternalLinks,
// shaped for a UI component. Returns null when there's nothing to recommend.
export function buildRecommendationWidget(draft = {}, links = []) {
  if (!links.length) return null;
  return { title: 'Continue Learning', articleId: draft.id, items: links };
}

// Per-article sitemap-entry. `urlPath` (e.g. "/articles/<slug>") is supplied once
// a real page route exists for this draft; readyForSitemap then reflects whether
// that page is actually live (status === 'published'). Without `urlPath` (concept
// pages, which have no route yet) this stays exactly as before: the `.html`
// convention URL and readyForSitemap: false.
export function buildSitemapEntry(draft = {}, { baseUrl = 'https://ztradeuniversity.com', urlPath = null } = {}) {
  return {
    url: urlPath ? `${baseUrl}${urlPath}` : `${baseUrl}/${draft.id}.html`,
    lastmod: (draft.updatedAt ? String(draft.updatedAt) : new Date().toISOString()).slice(0, 10),
    changefreq: 'weekly',
    priority: draft.level === 'beginner' ? 0.8 : 0.6,
    status: draft.status || 'draft',
    readyForSitemap: !!urlPath && draft.status === 'published',
  };
}
