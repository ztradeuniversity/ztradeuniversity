// functions/utils/graph-retrieval.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11B.1 — GRAPH RETRIEVAL FOUNDATION (abstraction layer).
//
// Single retrieval contract the rest of the system depends on:
//   retrieveBest(env, query, ctx) → { item, semanticScore, confidence } | null
//   retrieve(env, query, ctx)     → [ ...ranked, each with related[]/followups[] ]
//
// Backends are pluggable WITHOUT changing callers:
//   • scorer  — default = lexical scoreEntry (11A.4); swap to pgvector/Workers AI later.
//   • source  — KB graph store when KB_GRAPH_ENABLED + provisioned; else the KB_SEED
//               fallback (identical to today's behavior → zero regression).
//
// `item` is always the retrieval "entry" shape (shortAnswer/deepAnswer/concepts/
// questionPatterns/levels) so ai-chat and the future Composer (11B.3) are stable.
// ════════════════════════════════════════════════════════════════════════════

import { semanticMatch, scoreEntry } from './semantic-retrieval.js';
import { KB_SEED } from './kb-schema.js';
import { getPublishedConcepts, isConfigured, getNeighbors } from './kb-store.js';
import { ENGAGEMENT_EDGES } from './kb-graph.js';
import { isEmbeddingConfigured, embedText } from './embedding-provider.js';
import { makeHybridScorer } from './hybrid-scorer.js';

// Pluggable scorer (default lexical). Future: pgvector / Workers AI embeddings.
let _scorer = scoreEntry;
export function setScorer(fn) { if (typeof fn === 'function') _scorer = fn; }
export function getScorer() { return _scorer; }

function rank(query, entries) {
  // semanticMatch uses the module scorer internally; for an injected scorer we
  // re-rank explicitly so the abstraction stays swap-safe.
  if (_scorer === scoreEntry) return semanticMatch(query, entries);
  return (entries || [])
    .map(item => ({ item, ..._scorer(query, item) }))
    .sort((a, b) => b.semanticScore - a.semanticScore);
}

// Choose the knowledge source: graph store (when enabled + populated) else seed.
// Phase 11C.4 — at scale (KB_RETRIEVAL_NARROW='true') the candidate set is
// category-scoped before scoring, so 1k+ concepts don't all load per turn. The
// flag defaults OFF → loads everything exactly as today (zero regression); when
// a narrowed query returns nothing it falls back to the full set (correctness).
async function loadEntries(env, ctx) {
  const useGraph = env?.KB_GRAPH_ENABLED === 'true' && isConfigured(env);
  if (useGraph) {
    const lang = ctx?.lang || 'en';
    const narrow = env?.KB_RETRIEVAL_NARROW === 'true' && ctx?.category;
    if (narrow) {
      const scoped = await getPublishedConcepts(env, { lang, category: ctx.category });
      if (scoped && scoped.length) return scoped;  // category-scoped candidates
    }
    const rows = await getPublishedConcepts(env, { lang });
    if (rows && rows.length) return rows;          // graph-backed (full)
  }
  return KB_SEED;                                   // graceful fallback — current behavior
}

export async function retrieve(env, query, ctx = {}) {
  const entries = await loadEntries(env, ctx);
  // PHASE 11C.3 — HYBRID: embed the query once and blend semantic + lexical when
  // enabled + configured + entries carry vectors; otherwise pure lexical (today).
  let scorer = null;
  if (env?.KB_EMBEDDINGS_ENABLED === 'true' && isEmbeddingConfigured(env)) {
    const qv = await embedText(env, query).catch(() => null);
    if (qv) scorer = makeHybridScorer(qv);
  }
  const ranked = scorer
    ? entries.map(item => ({ item, ...scorer(query, item) })).sort((a, b) => b.semanticScore - a.semanticScore)
    : rank(query, entries);
  // attach graph context placeholders (filled by graph traversal once embeddings/
  // edges retrieval land; Composer 11B.3 consumes related/followups).
  return ranked.map(r => ({ ...r, related: r.item.related || [], followups: [] }));
}

export async function retrieveBest(env, query, ctx = {}) {
  const ranked = await retrieve(env, query, ctx);
  const top = ranked[0] || null;
  // Phase 11B.2: attach engagement neighbors (natural follow-ups / next-best-action)
  // when the graph is live. The Composer (11B.3) renders these as human sentences;
  // the current pipeline keeps using its own single follow-up, so this is inert today.
  if (top && env?.KB_GRAPH_ENABLED === 'true' && isConfigured(env)) {
    const nb = await getNeighbors(env, top.item.id, ENGAGEMENT_EDGES, 2);
    top.followups = nb.map(x => ({ id: x.node.id, topic: x.node.subcategory || x.node.id, edgeType: x.edgeType }));
  }
  return top;
}
