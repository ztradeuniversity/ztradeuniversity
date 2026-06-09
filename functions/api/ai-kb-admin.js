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
import { backfillEmbeddings, syncAllEdges, graphActive, getPublishedConcepts } from '../utils/kb-store.js';
import { retrieveBest, nextStepInvite } from '../utils/graph-retrieval.js';
import { classifyIntent } from '../utils/intent-engine.js';
import { relevanceEngine, enforceRelevance } from '../utils/relevance-engine.js';
import { scoreEntry } from '../utils/semantic-retrieval.js';

// Bundle marker — bump when deploying. The deployment-probe echoes this so you can
// confirm production is running THIS build (not a cached/old bundle).
const BUILD_TAG = '2026-06-09-graph-activation+strongdirect+forbidonly';
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
    // DEPLOYMENT PROBE — feature-detects which version of each module is LIVE, so you
    // can prove production is running the latest bundle (no DB writes, no side effects).
    if (action === 'deployment-probe') {
      // v2 graphActive ignores KB_GRAPH_ENABLED (config-only); v1 still gated on the flag.
      const graphV = graphActive({ AI_SUPABASE_URL: 'x', AI_SUPABASE_SERVICE_KEY: 'y', KB_GRAPH_ENABLED: 'false' })
        ? 'config-only(v2)' : 'flag-gated(v1)';
      // v2 scoreEntry promotes a near-exact pattern match to HIGH; v1 caps at MEDIUM.
      const probeEntry = { questionPatterns: ['what is a liquidity sweep'], concepts: ['liquidity sweep'], category: 'liquidity', subcategory: 'Liquidity Sweep' };
      const retrievalV = scoreEntry('what is a liquidity sweep', probeEntry).confidence === 'HIGH'
        ? 'strong-direct-HIGH(v2)' : 'lexical-cap-MEDIUM(v1)';
      // v2 enforceRelevance is forbid-only (keeps off-topic-but-not-forbidden); v1 allow-gate rejects.
      const relevanceV = enforceRelevance({ category: 'liquidity', relevanceTags: ['liquidity', 'sweep'] }, { forbiddenTopics: ['broker'], allowedTopics: ['technical'], confidence: 'HIGH' })
        ? 'forbid-only(v2)' : 'allow-gate-reject(v1)';
      return json({
        buildVersion: BUILD_TAG,
        deploymentSource: 'cloudflare-pages-functions (this Worker is live)',
        graphRuntimeVersion: graphV,
        aiChatVersion: typeof nextStepInvite === 'function' ? 'human-layer(v2)' : 'unknown',
        retrievalVersion: retrievalV,
        relevanceVersion: relevanceV,
        probeVersion: typeof scoreEntry === 'function' ? 'present' : 'missing',
        allLatest: graphV.includes('v2') && retrievalV.includes('v2') && relevanceV.includes('v2'),
      });
    }
    // PROOF probe — what the LIVE chatbot retrieval actually does for a query:
    //   ?action=retrieval-probe&q=what is a liquidity sweep
    // Reveals the runtime source (kb_nodes graph vs KB_SEED) + the top hit/confidence.
    if (action === 'retrieval-probe') {
      const q = new URL(request.url).searchParams.get('q') || 'what is a liquidity sweep';
      const active = graphActive(env);
      const publishedLoaded = active ? (await getPublishedConcepts(env, { lang: 'en' })).length : 0;
      const top = await retrieveBest(env, q, { lang: 'en' });
      // Replicate the EXACT ai-chat acceptance gate (lang en, HIGH confidence, relevance kept).
      const cls = classifyIntent(q);
      const intent = (cls && cls.intent) || 'fallback';
      const rel = relevanceEngine(q, { intent, category: top?.item?.category });
      const kept = top ? enforceRelevance({ category: top.item.category, concepts: top.item.concepts, relevanceTags: top.item.relevanceTags }, rel) : false;
      const used = !!(top && top.confidence === 'HIGH' && kept);
      const rejectionReason = !top ? 'no_match'
        : top.confidence !== 'HIGH' ? `confidence_${top.confidence}_below_HIGH`
        : !kept ? `relevance_reject(intent=${intent}; forbidden=[${rel.forbiddenTopics.join(',')}])`
        : null;
      return json({
        query: q,
        source: active && publishedLoaded > 0 ? 'graph(kb_nodes)' : 'KB_SEED',
        graphActive: active,
        publishedLoaded,
        topConcept: top ? top.item.id : null,
        score: top ? top.semanticScore : null,
        confidence: top ? top.confidence : null,
        relevanceDecision: top ? (kept ? 'keep' : 'reject') : 'n/a',
        rejectionReason,
        usedByChatbot: used,
        intent,
      });
    }
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
