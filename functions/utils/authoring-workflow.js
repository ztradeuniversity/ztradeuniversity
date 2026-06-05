// functions/utils/authoring-workflow.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.1 — KNOWLEDGE AUTHORING WORKFLOW (single entry for ALL channels:
// human-authored, AI-drafted, article-derived, imported). Pipeline:
//   KOS validate (no bypass) → dedup-on-ingest → status by decision/origin →
//   submit to review. Publication re-validates in STRICT mode.
// Graceful (writes no-op until provisioned); not on the live chat path.
// ════════════════════════════════════════════════════════════════════════════

import { validateKnowledgeObject } from './kos-validator.js';
import { dedupKnowledge } from './dedup-runtime.js';
import { submitForReview, approveAndPublish } from './review-runtime.js';
import { upsertNode, syncEdges } from './kb-store.js';
import { nodeFromKOS, mergeNodes, STATUS, ORIGIN } from './kb-graph.js';
import { attachEmbedding } from './embedding-provider.js';

// Ingest a candidate knowledge object through the full gate.
export async function authorConcept(env, kos, { origin = ORIGIN.AUTHORED, autoSubmit = true, existing } = {}) {
  // 1) KOS GATE — structural validity required to even enter (no bypass).
  const validation = validateKnowledgeObject(kos, { mode: 'draft' });
  if (!validation.valid) return { ok: false, stage: 'validation', errors: validation.errors, validation };

  // 2) DEDUP-ON-INGEST
  const dedup = await dedupKnowledge(env, kos, { existing });
  const node = nodeFromKOS({ ...kos, origin });

  if (dedup.decision === 'merge' && dedup.match) {
    const merged = mergeNodes(nodeFromKOS({ ...dedup.match, id: dedup.match.id, subcategory: dedup.match.subcategory }), node);
    await upsertNode(env, await attachEmbedding(env, merged.survivor));
    await syncEdges(env, merged.survivor);          // keep relationship graph current
    return { ok: true, action: 'merged', into: dedup.match.id, score: dedup.score, validation, dedup };
  }

  // 3) STATUS by decision + origin
  node.status = dedup.decision === 'review' ? STATUS.IN_REVIEW
    : (origin === ORIGIN.AUTHORED ? STATUS.DRAFT : STATUS.AI_DRAFT);
  await upsertNode(env, await attachEmbedding(env, node));
  if (autoSubmit && node.status !== STATUS.IN_REVIEW) await submitForReview(env, node);

  return { ok: true, action: dedup.decision === 'review' ? 'queued-review' : 'drafted', id: node.id, status: STATUS.IN_REVIEW, score: dedup.score, validation, dedup };
}

// Ingest a wave of concepts (Phase 11C.4 population). Sequential so dedup-on-ingest
// sees siblings already written this run. Returns a per-object summary.
export async function authorBatch(env, objects = [], opts = {}) {
  const results = [];
  for (const kos of (objects || [])) {
    const r = await authorConcept(env, kos, opts);
    results.push({ id: kos?.id, ok: r.ok, action: r.action, stage: r.stage, score: r.score, errors: r.errors });
  }
  const ok = results.filter(r => r.ok).length;
  return { total: results.length, ok, failed: results.length - ok, results };
}

// Publish a reviewed concept — STRICT KOS validation, NO bypass.
export async function publishConcept(env, kos, reviewer = 'admin') {
  const validation = validateKnowledgeObject(kos, { mode: 'publish' });
  if (!validation.valid) return { ok: false, stage: 'publish-validation', errors: validation.errors, validation };
  const node = await attachEmbedding(env, nodeFromKOS(kos));
  await approveAndPublish(env, node, reviewer);
  const edges = await syncEdges(env, node);         // wire engagement / learning-journey graph
  return { ok: true, status: 'published', edges: edges.synced, validation };
}
