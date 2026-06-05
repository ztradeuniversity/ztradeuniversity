// functions/utils/hybrid-scorer.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.3 — HYBRID SCORER. Blends embedding cosine (semantic) with the
// lexical concept score (exact/concept), so retrieval gets paraphrase recall
// AND keyword precision. When a query/entry vector is missing it returns the
// pure lexical score → identical to today (graceful, no migration). Same
// {semanticScore,confidence} contract as scoreEntry → drop-in via setScorer.
// ════════════════════════════════════════════════════════════════════════════

import { scoreEntry } from './semantic-retrieval.js';
import { cosineSim } from './embedding-provider.js';

const W_EMBED = 0.6;   // semantic weight
const W_LEX   = 0.4;   // lexical weight

export function hybridScore(query, entry, queryVec) {
  const lex = scoreEntry(query, entry);                 // { semanticScore, confidence }
  const ev = entry && entry.embedding;
  if (!Array.isArray(queryVec) || !queryVec.length || !Array.isArray(ev) || !ev.length) {
    return lex;                                          // fallback = lexical (parity with today)
  }
  const cos = cosineSim(queryVec, ev);                  // -1..1
  const cosScore = Math.max(0, cos) * 100;
  const blended = Math.round(cosScore * W_EMBED + lex.semanticScore * W_LEX);
  const confidence = blended >= 55 ? 'HIGH' : blended >= 30 ? 'MEDIUM' : 'LOW';
  return { semanticScore: blended, confidence, lexical: lex.semanticScore, cosine: Math.round(cos * 100) };
}

// Returns a scorer(query, entry) bound to a precomputed query vector — drop-in
// for graph-retrieval (matches the scoreEntry signature/contract).
export function makeHybridScorer(queryVec) {
  return (query, entry) => hybridScore(query, entry, queryVec);
}
