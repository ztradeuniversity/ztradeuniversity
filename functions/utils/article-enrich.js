// functions/utils/article-enrich.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE ENRICHMENT — Content Ecosystem STEP 1. When an admin pastes an article,
// automatically suggest `related` / `nextSteps` graph links (so smart chips and
// University linking are populated immediately on publish) and generate FAQ
// JSON-LD + SEO presentation fields for the page the admin publishes.
//
// Deterministic (no LLM), pure (0 imports). suggestLinks only ever returns ids
// that exist in the supplied `entries` (the live graph) — no orphan edges, no
// invented concepts. buildSeoSuggestion is presentational only: it does NOT
// mutate the KOS object that gets validated/stored (kos-validator's `seo` field
// is untouched), so it can never affect KOS validation or the graph.
// ════════════════════════════════════════════════════════════════════════════

function overlapScore(draft, entry) {
  const a = new Set([...(draft.concepts || []), ...(draft.relevanceTags || [])].map(s => String(s).toLowerCase()));
  const b = new Set((entry.concepts || []).map(s => String(s).toLowerCase()));
  if (!a.size || !b.size) return 0;
  let hits = 0; for (const x of a) if (b.has(x)) hits++;
  let score = hits / a.size;
  if (entry.category && entry.category === draft.category) score += 0.25;
  return score;
}

// Suggest `related` (closest-topic concepts) and `nextSteps` (a natural
// progression — same category, different level when one exists) from the
// EXISTING graph entries. Excludes draft.id. Only returns real ids (no orphans).
//
// PHASE E (dormant prep): optional `embedScores` = { [entryId]: cosineSim(-1..1) },
// precomputed by the caller ONLY when embeddings are configured/enabled. When
// absent (today's default), ranking is the original tag/category overlap —
// IDENTICAL to before. When present, blends overlap with semantic similarity for
// entries that have a score, so suggestions improve automatically once embeddings
// activate — no further code change needed here.
export function suggestLinks(draft = {}, entries = [], { limit = 4, embedScores = null } = {}) {
  const ranked = entries
    .filter(e => e && e.id && e.id !== draft.id)
    .map(e => {
      const overlap = overlapScore(draft, e);
      const sim = embedScores ? embedScores[e.id] : null;
      const score = (typeof sim === 'number') ? overlap * 0.5 + Math.max(0, sim) * 0.5 : overlap;
      return { id: e.id, score, level: e.level, category: e.category };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);

  const related = ranked.slice(0, limit).map(e => e.id);

  const progression = ranked.filter(e => e.category === draft.category && e.level && e.level !== draft.level);
  const nextSteps = (progression.length ? progression : ranked)
    .map(e => e.id)
    .filter(id => !related.includes(id))
    .slice(0, 2);

  return { related, nextSteps };
}

// Deterministic FAQ JSON-LD (schema.org FAQPage) from a concept's question
// patterns + canonical answers. Accepts either KOS shape (canonical.short/deep)
// or the retrieval-entry shape (shortAnswer/deepAnswer). Returns null when there
// isn't enough to build a meaningful FAQ block (never fabricates Q&A).
export function buildFaqSchema(concept = {}) {
  const canon = concept.canonical || {};
  const short = canon.short || concept.shortAnswer || '';
  const deep = canon.deep || concept.deepAnswer || short;
  const patterns = Array.isArray(concept.questionPatterns) ? concept.questionPatterns : [];
  if (!patterns.length || (!short && !deep)) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: patterns.slice(0, 5).map((q, i) => ({
      '@type': 'Question',
      name: String(q).charAt(0).toUpperCase() + String(q).slice(1).replace(/\?+$/, '') + '?',
      acceptedAnswer: { '@type': 'Answer', text: (i === 0 ? short : deep) || short },
    })),
  };
}

// Presentational SEO suggestion for the page the admin will publish from this
// draft — canonical URL, OG tags, keyword CSV, embedded FAQ schema. Read-only;
// the draft's own `seo{}` (persisted to the graph) is left exactly as built by
// buildConceptFromArticle.
export function buildSeoSuggestion(draft = {}, { baseUrl = 'https://ztradeuniversity.com', urlPath = null } = {}) {
  const seo = draft.seo || {};
  const canonicalUrl = urlPath ? `${baseUrl}${urlPath}` : `${baseUrl}/${draft.id}.html`;
  return {
    ...seo,
    slug: draft.id,
    canonicalUrl,
    keywordsCsv: (seo.keywords || []).join(', '),
    ogTitle: seo.title || draft.title || '',
    ogDescription: seo.description || '',
    ogType: 'article',
    ogUrl: canonicalUrl,
    faqSchema: buildFaqSchema(draft),
  };
}
