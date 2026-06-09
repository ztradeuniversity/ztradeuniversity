// functions/api/ai-kb-admin.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.0C — KNOWLEDGE GRAPH ADMIN (provisioning + parity + rollback).
// Admin-only (x-admin-key === AI_ADMIN_KEY). Read-mostly; the only write is the
// idempotent seed migration. Never touches the live chat path, EA, Library,
// article, or memory systems.
//
//   GET  ?action=status            → provisionStatus
//   GET  ?action=parity            → validateParity
//   GET  ?action=rollback-check    → rollbackCheck
//   POST { action:'migrate-seed' } → provisionSeed (migrate + parity)
// ════════════════════════════════════════════════════════════════════════════

import { provisionStatus, validateParity, rollbackCheck, provisionSeed } from '../utils/kb-provision.js';
import { backfillEmbeddings, syncAllEdges } from '../utils/kb-store.js';
import { authorConcept, publishConcept, authorBatch } from '../utils/authoring-workflow.js';
import { validateAnchors, populateAnchors } from '../utils/kb-populate.js';
import { reviewQueue, rejectToDraft, retire, rollback } from '../utils/review-runtime.js';
import { validateKnowledgeObject } from '../utils/kos-validator.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // Admin gate — never expose provisioning to the public.
  if (!env.AI_ADMIN_KEY || request.headers.get('x-admin-key') !== env.AI_ADMIN_KEY) {
    return json({ error: 'admin only' }, 403);
  }

  if (request.method === 'GET') {
    const action = new URL(request.url).searchParams.get('action') || 'status';
    if (action === 'status')         return json(await provisionStatus(env));
    if (action === 'parity')         return json(await validateParity(env));
    if (action === 'rollback-check') return json(rollbackCheck(env));
    if (action === 'review-queue')   return json({ queue: await reviewQueue(env) });
    if (action === 'validate-anchors') return json(validateAnchors());   // pure, no DB
    return json({ error: 'unknown action' }, 400);
  }

  if (request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
    const a = body?.action;
    if (a === 'migrate-seed') return json(await provisionSeed(env));
    if (a === 'backfill-embeddings') return json(await backfillEmbeddings(env, { limit: body.limit || 200, offset: body.offset || 0, force: !!body.force }));
    if (a === 'sync-edges')   return json(await syncAllEdges(env, { limit: body.limit || 200, offset: body.offset || 0 }));
    if (a === 'validate')     return json(validateKnowledgeObject(body.object, { mode: body.mode || 'publish' }));
    if (a === 'author')       return json(await authorConcept(env, body.object, { origin: body.origin }));
    if (a === 'author-batch') return json(await authorBatch(env, body.objects, { origin: body.origin }));
    if (a === 'populate-anchors') return json(await populateAnchors(env, { offset: body.offset || 0, limit: body.limit || 1, publish: body.publish !== false }));
    if (a === 'publish')      return json(await publishConcept(env, body.object, body.reviewer || 'admin'));
    if (a === 'reject')       return json(await rejectToDraft(env, body.id, body.reviewer || 'admin', body.notes));
    if (a === 'retire')       return json(await retire(env, body.id));
    if (a === 'rollback')     return json(await rollback(env, body.id, body.version));
    return json({ error: 'unknown action' }, 400);
  }
  return json({ error: 'method not allowed' }, 405);
}
