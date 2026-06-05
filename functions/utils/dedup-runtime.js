// functions/utils/dedup-runtime.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.1 — DEDUP-ON-INGEST. Prevents concept sprawl: a paraphrase folds
// into an existing concept as a new QuestionPattern; a genuinely new idea
// becomes a new concept; the ambiguous middle is flagged for a human.
//   dedupKnowledge(env, candidate, {existing?}) →
//     { decision:'merge'|'review'|'new', match, score, mergeKeyHit }
// Pure logic (existing pool injectable for tests); fetches published concepts
// when not supplied. Graceful: empty graph → 'new'. Lexical now; the same
// interface upgrades to embeddings (11C.3) without caller changes.
// ════════════════════════════════════════════════════════════════════════════

import { mergeKey, nodeFromKOS, rowToEntry } from './kb-graph.js';
import { scoreEntry } from './semantic-retrieval.js';
import { getPublishedConcepts } from './kb-store.js';
import { isEmbeddingConfigured, embedText } from './embedding-provider.js';
import { hybridScore } from './hybrid-scorer.js';

const MERGE_AT  = 90;   // ≥ → fold as question pattern (duplicate)
const REVIEW_AT = 75;   // ≥ → human "merge vs child" decision

// Normalize any candidate (KOS object or node) to the retrieval "entry" shape.
function toEntry(c) {
  if (c && c.data) return rowToEntry(c);                 // already a node row
  if (c && (c.canonical || c.shortAnswer || c.deepAnswer)) return rowToEntry(nodeFromKOS(c)); // KOS object
  return c;                                              // already an entry
}

function bestMatch(candidate, pool, queryVec) {
  const q = (candidate.questionPatterns || [])[0] || candidate.subcategory || candidate.id || '';
  let best = { score: 0, item: null };
  for (const e of pool) {
    // Hybrid when a query vector + entry vectors exist; pure lexical otherwise.
    const s = (queryVec ? hybridScore(q, e, queryVec) : scoreEntry(q, e)).semanticScore;
    if (s > best.score) best = { score: s, item: e };
  }
  return best;
}

export async function dedupKnowledge(env, candidateRaw, { existing } = {}) {
  const candidate = toEntry(candidateRaw);
  const pool = existing ? existing.map(toEntry) : await getPublishedConcepts(env, { lang: candidate.lang || 'en', limit: 1000 });
  if (!pool.length) return { decision: 'new', match: null, score: 0, mergeKeyHit: false, reason: 'empty-graph' };

  const ck = mergeKey({ topic: candidate.subcategory, concepts: candidate.concepts });
  const keyHit = pool.find(e => e.id !== candidate.id && mergeKey({ topic: e.subcategory, concepts: e.concepts }) === ck) || null;

  // PHASE 11C.3 — embed the candidate once for semantic dedup when enabled; null → lexical.
  let queryVec = null;
  if (env?.KB_EMBEDDINGS_ENABLED === 'true' && isEmbeddingConfigured(env)) {
    const q = (candidate.questionPatterns || [])[0] || candidate.subcategory || candidate.id || '';
    queryVec = await embedText(env, q).catch(() => null);
  }
  const bm = bestMatch(candidate, pool.filter(e => e.id !== candidate.id), queryVec);
  const score = Math.max(bm.score, keyHit ? 90 : 0);
  const match = keyHit || bm.item;

  let decision = 'new';
  if (score >= MERGE_AT) decision = 'merge';
  else if (score >= REVIEW_AT) decision = 'review';

  return { decision, match: decision === 'new' ? null : match, score, mergeKeyHit: !!keyHit };
}
