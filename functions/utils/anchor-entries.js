// functions/utils/anchor-entries.js
// ════════════════════════════════════════════════════════════════════════════
// ACTIVATION — serve the AUTHORED concept library through the EXISTING retrieval
// pipeline even before the graph DB is provisioned. The 349 KOS concepts in
// functions/knowledge/ were authored + validated but only reachable once kb_nodes
// is populated; until then retrieval fell back to the 3-concept KB_SEED. This
// adapter maps every ANCHOR concept (KOS shape) into the retrieval ENTRY shape
// (shortAnswer/deepAnswer/concepts/questionPatterns/…) so semantic-retrieval can
// score them today — with zero new infrastructure.
//
// Additive + graceful: when the graph DB IS live, graph-retrieval still serves
// from kb_nodes (unchanged); this is only the richer offline fallback. The legacy
// KB_SEED entries are kept so nothing regresses. Pure (no I/O), memoized.
// ════════════════════════════════════════════════════════════════════════════

import { ANCHOR_CONCEPTS } from '../knowledge/index.js';
import { KB_SEED } from './kb-schema.js';

// KOS concept → retrieval entry (the shape semantic-retrieval.scoreEntry + ai-chat
// coach/chips consume). Falls back gracefully across both shapes.
function adaptConcept(c) {
  const canon = c.canonical || {};
  return {
    id: c.id,
    category: c.category,
    subcategory: c.topic || c.title || c.id,
    topic: c.topic || c.title || c.id,
    title: c.title || c.topic || c.id,
    level: c.level || 'beginner',
    concepts: Array.isArray(c.concepts) ? c.concepts : [],
    questionPatterns: Array.isArray(c.questionPatterns) ? c.questionPatterns : [],
    shortAnswer: canon.short || c.shortAnswer || '',
    deepAnswer: canon.deep || c.deepAnswer || '',
    related: Array.isArray(c.related) ? c.related : [],
    nextSteps: Array.isArray(c.nextSteps) ? c.nextSteps : [],
    commonMistakes: Array.isArray(c.commonMistakes) ? c.commonMistakes : [],
    misconceptions: Array.isArray(c.misconceptions) ? c.misconceptions : [],
    riskNote: c.riskNote || null,
    marketContext: c.marketContext || null,
    relevanceTags: Array.isArray(c.relevanceTags) ? c.relevanceTags : [],
  };
}

let _cache = null;

// All retrievable entries when the graph DB isn't live: legacy KB_SEED + the full
// authored concept library, de-duped by id. Memoized (built once per worker).
export function getAnchorEntries() {
  if (_cache) return _cache;
  const out = [];
  const seen = new Set();
  for (const e of KB_SEED) { if (e && e.id && !seen.has(e.id)) { seen.add(e.id); out.push(e); } }
  for (const c of (ANCHOR_CONCEPTS || [])) {
    if (!c || !c.id || seen.has(c.id)) continue;
    const e = adaptConcept(c);
    if (e.shortAnswer || e.deepAnswer) { seen.add(c.id); out.push(e); }   // must be answerable
  }
  _cache = out;
  return out;
}

export function anchorEntryCount() { return getAnchorEntries().length; }
