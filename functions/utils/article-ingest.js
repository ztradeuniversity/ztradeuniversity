// functions/utils/article-ingest.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE → GRAPH INGESTION (scaffold). When an admin pastes an article, this
// turns {title, body} into a KOS DRAFT concept — slug, SEO, question patterns,
// concept tags, beginner/deep bodies, provenance — which then flows through the
// EXISTING authoring pipeline (authorConcept → KOS validate → dedup → review
// queue → publishConcept → graph). Once published, the concept auto-integrates
// with retrieval, smart chips, missions, practice, exams, dashboard and analytics
// — no duplicate logic anywhere.
//
// Deterministic (no LLM): the scaffold is solid but basic; a Workers AI pass would
// produce richer SEO/FAQ/question-patterns (see ingestion notes). Pure (no I/O);
// the admin endpoint performs the actual authoring. Origin 'article' carries
// sources[].id for provenance (KOS requirement).
// ════════════════════════════════════════════════════════════════════════════

const STOP = new Set(['the','a','an','to','of','in','is','for','and','or','how','what','why','with','your','you','this','that','it','on','do','does','can','best','guide','explained','trading','trade']);

export function slugify(title) {
  return String(title || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled-concept';
}

function sentences(body, n) {
  const parts = String(body || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/);
  return parts.slice(0, n).join(' ').trim();
}

function keywords(title, body, max = 6) {
  const counts = {};
  for (const w of (`${title} ${title} ${body}`.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [])) {
    if (STOP.has(w)) continue; counts[w] = (counts[w] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

// Returns a KOS draft concept (origin 'article'). category defaults to 'markets'.
export function buildConceptFromArticle({ title = '', body = '', category = 'markets', level = 'beginner' } = {}) {
  const t = String(title).trim();
  const id = slugify(t);
  const short = sentences(body, 2) || t;
  const deep = sentences(body, 5) || short;
  const kws = keywords(t, body);
  const lowerT = t.toLowerCase();
  return {
    id, category, topic: t, title: t, level,
    concepts: kws.slice(0, 4),
    questionPatterns: Array.from(new Set([
      lowerT,
      `what is ${lowerT.replace(/^(what is|how to|the)\s+/, '')}`,
      `how does ${lowerT.replace(/^(what is|how to|the)\s+/, '')} work`,
      `explain ${lowerT.replace(/^(what is|how to|the)\s+/, '')}`,
    ].filter(Boolean))).slice(0, 5),
    canonical: { short: short.slice(0, 600), deep: deep.slice(0, 1200) },
    responseObjective: 'educate',
    desiredOutcome: `understand ${t}`,
    relevanceTags: kws.slice(0, 3),
    commonMistakes: [], misconceptions: [],
    prerequisites: [], nextSteps: [], related: [],
    riskNote: 'Educational only — verify on your own platform and risk 1–2% per trade.',
    seo: {
      title: t.length > 60 ? t.slice(0, 57) + '…' : t,
      description: short.slice(0, 155),
      keywords: kws,
    },
    origin: 'article',
    sources: [{ id, title: t, type: 'article' }],
    status: 'draft', confidence: 'HIGH', lang: 'en',
  };
}

// What a Workers AI pass would improve (returned to the admin for transparency).
export const INGEST_NOTES = [
  'Question patterns are derived from the title — an LLM would add paraphrases.',
  'SEO description is the first sentences — an LLM would write a tuned meta description + FAQ schema.',
  'commonMistakes / misconceptions / related concepts are left blank for the admin (or a future LLM) to enrich.',
];
