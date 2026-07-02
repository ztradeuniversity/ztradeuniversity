// functions/utils/review-runtime.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.1 — REVIEW WORKFLOW + LIFECYCLE. Enforces the knowledge lifecycle
// transitions and records reviewer notes / version snapshots / rollback.
//   draft|ai_draft → in_review → published → deprecated → archived
// Graceful (no-op until graph provisioned). Not on the live chat path.
// ════════════════════════════════════════════════════════════════════════════

import { STATUS } from './kb-graph.js';
import { setStatus, addReview, snapshotVersion, upsertNode, getVersions, getReviewQueue } from './kb-store.js';

const TRANSITIONS = {
  draft:      ['in_review', 'archived'],
  ai_draft:   ['in_review', 'archived'],
  in_review:  ['published', 'draft', 'archived'],
  published:  ['deprecated', 'in_review'],
  deprecated: ['archived', 'published'],
  archived:   [],
};
export function canTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }

export async function submitForReview(env, node) {
  const wrote = await upsertNode(env, { ...node, status: STATUS.IN_REVIEW });
  await addReview(env, node.id, { status: 'pending' });
  return { id: node.id, status: STATUS.IN_REVIEW, wrote: !!wrote };
}

// Approve + publish. KOS publish-validation is enforced by the caller
// (authoring-workflow.publishConcept) — this performs the lifecycle transition.
export async function approveAndPublish(env, node, reviewer = 'admin') {
  await snapshotVersion(env, node, reviewer);
  const wrote = await setStatus(env, node.id, STATUS.PUBLISHED);
  await addReview(env, node.id, { status: 'approved', reviewer });
  return { id: node.id, status: STATUS.PUBLISHED, wrote: !!wrote };
}

export async function rejectToDraft(env, id, reviewer, notes) {
  const wrote = await setStatus(env, id, STATUS.DRAFT);
  await addReview(env, id, { status: 'rejected', reviewer, notes });
  return { id, status: STATUS.DRAFT, wrote: !!wrote };
}

export async function retire(env, id) {
  const wrote = await setStatus(env, id, STATUS.DEPRECATED);
  return { id, status: STATUS.DEPRECATED, wrote: !!wrote };
}

export async function rollback(env, id, version) {
  const versions = await getVersions(env, id);
  const v = (version != null) ? versions.find(x => x.version === version) : versions[0];
  if (!v) return { ok: false, reason: 'no-version' };
  await upsertNode(env, { id, data: v.data, version: (v.version || 1) + 1, status: STATUS.IN_REVIEW });
  return { ok: true, restoredFrom: v.version };
}

export async function reviewQueue(env) {
  const rows = await getReviewQueue(env);
  return rows.map(r => ({ id: r.id, category: r.category, status: r.status, origin: r.origin, updated_at: r.updated_at }));
}
