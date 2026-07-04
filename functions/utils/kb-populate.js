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
import { getNode } from './kb-store.js';

// Stable content hash of a concept (djb2 over the fields that define the answer +
// graph shape). Persisted to node.data.hash so a 2nd run skips unchanged concepts.
function conceptHash(kos) {
  const c = kos.canonical || { short: kos.shortAnswer, deep: kos.deepAnswer };
  const sig = JSON.stringify([
    c && c.short, c && c.deep, kos.title, kos.level, kos.category, kos.status, kos.confidence, kos.lang,
    kos.questionPatterns, kos.related, kos.prerequisites, kos.nextSteps, kos.followups,
    kos.commonMistakes, kos.misconceptions, kos.riskNote, kos.marketContext, kos.relevanceTags,
    kos.responseObjective, kos.desiredOutcome,
  ]);
  let h = 5381; for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}

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

// Author + publish the anchor batch in CHUNKS (admin-run). Each concept makes
// ~7+edges Supabase subrequests; Cloudflare caps subrequests per request (~50 on
// the bundled plan), so the batch is processed `limit` concepts at a time and the
// caller pages with `nextOffset` (the admin page auto-loops). Per-concept try/catch
// isolates failures so one bad concept can't abort the rest. Idempotent (upsert by id).
export async function populateAnchors(env, { offset = 0, limit = 1, publish = true, force = false } = {}) {
  const total = ANCHOR_CONCEPTS.length;
  const start = Math.max(0, offset | 0);
  const slice = ANCHOR_CONCEPTS.slice(start, start + Math.max(1, limit | 0));
  const results = [];
  for (const kos of slice) {
    try {
      // DELTA / RESUME (idempotent optimization): unless force=true, skip a concept that
      // is already published AND unchanged (stored data.hash === current content hash).
      // A 2nd run then processes ONLY new/edited concepts — never rebuilds the whole graph.
      const h = conceptHash(kos);
      if (!force) {
        const existing = await getNode(env, kos.id).catch(() => null);
        if (existing && existing.status === 'published' && existing.data && existing.data.hash === h) {
          results.push({ id: kos.id, category: kos.category, skipped: 'unchanged', published: true, edges: null });
          continue;
        }
      }
      kos.hash = h;   // persisted into node.data.hash via nodeFromKOS on write
      // skipDedup: anchors are canonical — never let dedup fold one into a legacy seed
      // (e.g. becoming-profitable ↔ dev-001), which would skip publish and drop the node.
      const authored = await authorConcept(env, kos, { origin: 'authored', autoSubmit: false, skipDedup: true });
      let published = null;
      if (publish && authored.ok && authored.action !== 'merged') {
        published = await publishConcept(env, kos, 'anchor-batch-1');
      }
      // Capture full error detail so the admin page can identify exactly which concept
      // failed and at which stage — never suppress stage/error fields.
      results.push({
        id: kos.id, category: kos.category,
        authored: authored.ok ? (authored.action || 'drafted') : ('FAILED:' + (authored.stage || 'unknown')),
        authorErrors: authored.ok ? null : (authored.errors || null),
        published: published ? !!published.ok : null,
        publishStage: (published && !published.ok) ? (published.stage || null) : null,
        publishError: (published && !published.ok) ? (published.error || null) : null,
        edges: published?.edges ?? null,
      });
    } catch (e) {
      // Unhandled throw from any step — concept id + message always surfaced.
      results.push({ id: kos.id, category: kos.category, error: String((e && e.message) || e) });
    }
  }
  const nextOffset = (start + slice.length) < total ? (start + slice.length) : null;
  const skipped = results.filter(r => r.skipped === 'unchanged').length;
  const authoredOk = results.filter(r => !r.error && !r.skipped && !String(r.authored).startsWith('FAILED')).length;
  const publishedOk = results.filter(r => r.published === true).length;
  return { total, offset: start, processed: slice.length, nextOffset, skipped, authored: authoredOk, published: publishedOk, results };
}
