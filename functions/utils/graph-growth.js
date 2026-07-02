// functions/utils/graph-growth.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE D — GRAPH AUTO GROWTH. Extends the existing Article → Graph pipeline.
//
// publishConcept already calls syncEdges→deriveEdgesFromKOS (UNCHANGED), which
// derives RELATED_TO/NEXT_BEST_ACTION/RECOMMENDS_ARTICLE edges FROM the new node
// TO its related/nextSteps/recommendedArticles — already active once Phase A
// populates those fields. The missing direction: EXISTING concepts published
// before this node existed don't yet point FORWARD to it, so it's invisible in
// their neighbor lists / recommended journeys.
//
// strengthenGraphConnections adds those reciprocal edges via the EXISTING
// insertEdge primitive (same kb_edges table — no new storage, no schema change,
// no scorer change). Idempotent: insertEdge POSTs with merge-duplicates semantics
// upstream (kb-store sb()), so re-running on republish is safe.
// ════════════════════════════════════════════════════════════════════════════

import { insertEdge } from './kb-store.js';
import { EDGE_TYPES } from './kb-graph.js';

// Add reverse edges from each related/next-step concept BACK to this newly
// published node, so existing concepts' neighbor graphs (and therefore the
// learning paths / journeys / recommendations built from them) grow to include
// the new article. No-op (added:0) if the node has no related/nextSteps.
export async function strengthenGraphConnections(env, kos) {
  if (!kos || !kos.id) return { added: 0, targets: [] };
  const targets = new Set([...(kos.related || []), ...(kos.nextSteps || [])]);
  targets.delete(kos.id);
  let added = 0;
  for (const src of targets) {
    if (await insertEdge(env, src, kos.id, EDGE_TYPES.RELATED_TO, 0.5, { derived: true, reciprocal: true })) added++;
  }
  return { added, targets: [...targets] };
}
