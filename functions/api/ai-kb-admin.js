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
import { backfillEmbeddings, syncAllEdges, graphActive, getPublishedConcepts, getMissingKnowledge } from '../utils/kb-store.js';
import { retrieveBest, nextStepInvite, buildLearningPath, buildStudyPlan, buildPractice, buildScenario, scenarioKeys, buildCourse, courseKeys, buildMissions, buildExam, buildLab, labTypes, buildCaseStudy, buildCertification, certificationKeys, buildChecklist, checklistKeys, buildPlaybook, buildAchievements, buildDashboard } from '../utils/graph-retrieval.js';
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
    // LEARNING PATH — ?action=learning-path&start=<conceptId> → ordered graph journey.
    if (action === 'learning-path') {
      const start = new URL(request.url).searchParams.get('start') || 'beginner-roadmap';
      return json(await buildLearningPath(env, start, { maxSteps: 6 }));
    }
    // ROADMAP / STUDY PLAN — ?action=study-plan&level=quickstart|beginner|intermediate|advanced.
    if (action === 'study-plan') {
      const lvl = new URL(request.url).searchParams.get('level') || 'beginner';
      // 15-day quick start / 30-day beginner / 60-day intermediate / 90-day advanced.
      const map = { quickstart: 8, beginner: 12, intermediate: 20, advanced: 30 };
      const planLevel = lvl === 'quickstart' ? 'beginner' : lvl;
      return json({ requested: lvl, ...(await buildStudyPlan(env, { level: planLevel, count: map[lvl] || 12 })) });
    }
    // AI PRACTICE MODE — ?action=practice&level=beginner|intermediate|advanced → exercises.
    if (action === 'practice') {
      const lvl = new URL(request.url).searchParams.get('level') || 'beginner';
      return json(await buildPractice(env, { level: lvl, count: 3 }));
    }
    // MARKET SCENARIO ENGINE — ?action=scenario&key=bullish-gold|bearish-gold|high-inflation|...
    if (action === 'scenario') {
      const key = new URL(request.url).searchParams.get('key');
      if (!key) return json({ scenarios: scenarioKeys() });
      return json(await buildScenario(env, key));
    }
    // AI TRADING UNIVERSITY — ?action=course&key=beginner|...|gold-specialist|risk-specialist
    if (action === 'course') {
      const key = new URL(request.url).searchParams.get('key');
      if (!key) return json({ courses: courseKeys() });
      return json(await buildCourse(env, key));
    }
    // AI MENTOR MISSIONS — ?action=missions&level=beginner|intermediate|advanced
    if (action === 'missions') {
      const lvl = new URL(request.url).searchParams.get('level') || null;
      return json(await buildMissions(env, { level: lvl, count: 5 }));
    }
    // AI EXAMINATION — ?action=exam&level=beginner|intermediate|advanced
    if (action === 'exam') {
      const lvl = new URL(request.url).searchParams.get('level') || 'beginner';
      return json(await buildExam(env, { level: lvl, count: 10 }));
    }
    // AI TRADING LAB — ?action=lab&type=chart|decision|risk|psychology&level=...
    if (action === 'lab') {
      const u = new URL(request.url);
      const type = u.searchParams.get('type');
      if (!type) return json({ labTypes: labTypes() });
      return json(await buildLab(env, { type, level: u.searchParams.get('level') || null, count: 5 }));
    }
    // AI CASE STUDY — ?action=case-study&id=<conceptId> (e.g. liquidity-sweep, nfp, revenge-trading)
    if (action === 'case-study') {
      const id = new URL(request.url).searchParams.get('id');
      return json(await buildCaseStudy(env, id));
    }
    // AI CERTIFICATION — ?action=certification&key=beginner-trader|gold-specialist|...
    if (action === 'certification') {
      const key = new URL(request.url).searchParams.get('key');
      if (!key) return json({ certifications: certificationKeys() });
      return json(await buildCertification(env, key));
    }
    // AI TRADING DESK — ?action=checklist&key=pre-market|london|new-york|news-event|post-trade|weekly-review
    if (action === 'checklist') {
      const key = new URL(request.url).searchParams.get('key');
      if (!key) return json({ checklists: checklistKeys() });
      return json(await buildChecklist(env, key));
    }
    // AI PLAYBOOK — ?action=playbook&id=<conceptId> (e.g. gold-breakout-failure, liquidity-sweep, nfp)
    if (action === 'playbook') {
      const id = new URL(request.url).searchParams.get('id');
      return json(await buildPlaybook(env, id));
    }
    // AI ACHIEVEMENTS — graph-anchored achievements with completion requirements.
    if (action === 'achievements') return json(buildAchievements());
    // AI TRADING DASHBOARD — ?action=dashboard&level=beginner|intermediate|advanced
    // Unifies roadmap, missions, practice, recommendations, weak areas, certifications.
    if (action === 'dashboard') {
      const lvl = new URL(request.url).searchParams.get('level') || 'beginner';
      return json(await buildDashboard(env, { level: lvl }));
    }
    // KNOWLEDGE ANALYTICS — most-missed topics → admin recommendations (anonymous).
    if (action === 'analytics') {
      const missing = await getMissingKnowledge(env, { limit: 50 });
      const byCategory = {};
      for (const m of missing) { const c = m.category || 'uncategorized'; byCategory[c] = (byCategory[c] || 0) + (m.frequency || 1); }
      // PHASE 13 — Self-Improvement V2: turn the top gaps into concrete authoring
      // recommendations across every content type (no duplicate authoring — these are
      // gaps the graph does NOT yet cover).
      const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const recommendedNext = top.map(([category, frequency]) => ({
        category, frequency,
        nextConcept: `Author a concept covering the most-missed "${category}" question`,
        nextArticle: `Publish an SEO article for "${category}" (auto-creates a graph concept on approval)`,
        nextPlaybook: `Add a playbook once a "${category}" concept exists`,
        nextPractice: `Practice/exam items generate automatically once the concept is published`,
        nextMission: `Mission auto-generates from the new "${category}" concept`,
        nextCertification: `Fold into the matching specialist certification`,
      }));
      return json({
        graphActive: graphActive(env),
        missingTopics: missing.map(m => ({ question: m.question, intent: m.intent, category: m.category, frequency: m.frequency || 1 })),
        gapsByCategory: byCategory,
        recommendedNext,
        recommendation: missing.length ? 'Author concepts/articles for the highest-frequency gaps above.' : 'No knowledge gaps logged yet.',
      });
    }
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
