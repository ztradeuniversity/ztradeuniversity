// functions/utils/kb-populate.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.4 — ANCHOR POPULATION. Drives the category-based knowledge store
// (functions/knowledge) through the EXISTING authoring pipeline:
//   author (KOS gate → dedup → embed) → publish (strict KOS → embed → edge-sync).
// Graceful: validateAnchors() is pure (no DB) and safe anytime; populateAnchors()
// requires the graph configured + enabled. No new pipeline — reuses 11C.1–11C.3.
// ════════════════════════════════════════════════════════════════════════════

import { ANCHOR_CONCEPTS, CATEGORIES, CATEGORY_MODULES } from '../knowledge/index.js';
import { authorConcept, publishConcept } from './authoring-workflow.js';
import { validateBatch } from './kos-validator.js';

// Pure pre-flight: every anchor must pass STRICT (publish-mode) KOS validation.
export function validateAnchors() {
  const batch = validateBatch(ANCHOR_CONCEPTS, { mode: 'publish' });
  return {
    total: batch.total, valid: batch.valid, invalid: batch.invalid, avgScore: batch.avgScore,
    categories: CATEGORIES.length,
    byCategory: Object.fromEntries(CATEGORIES.map(c => [c, CATEGORY_MODULES[c].length])),
    failures: batch.results.filter(r => !r.valid).map(r => ({ id: r.id, errors: r.errors })),
  };
}

// Author + publish the full anchor batch (admin-run). Idempotent: re-running
// re-authors (upsert by id) and re-syncs edges. Returns a per-concept summary.
export async function populateAnchors(env, { publish = true } = {}) {
  const results = [];
  for (const kos of ANCHOR_CONCEPTS) {
    const authored = await authorConcept(env, kos, { origin: 'authored', autoSubmit: false });
    let published = null;
    if (publish && authored.ok && authored.action !== 'merged') {
      published = await publishConcept(env, kos, 'anchor-batch-1');
    }
    results.push({
      id: kos.id, category: kos.category,
      authored: authored.ok ? (authored.action || 'drafted') : ('FAILED:' + (authored.stage || 'unknown')),
      published: published ? !!published.ok : null,
      edges: published?.edges ?? null,
    });
  }
  const authoredOk = results.filter(r => !String(r.authored).startsWith('FAILED')).length;
  const publishedOk = results.filter(r => r.published === true).length;
  return { total: results.length, authored: authoredOk, published: publishedOk, results };
}
