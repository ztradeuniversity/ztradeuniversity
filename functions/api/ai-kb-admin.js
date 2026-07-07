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
import { backfillEmbeddings, syncAllEdges, graphActive, getPublishedConcepts, getMissingKnowledge, getNode } from '../utils/kb-store.js';
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
import { buildEvolutionReport } from '../utils/evolution-engine.js';
import { buildConceptFromArticle, INGEST_NOTES } from '../utils/article-ingest.js';
import { suggestLinks, buildFaqSchema, buildSeoSuggestion } from '../utils/article-enrich.js';
import { suggestRelatedArticles, buildInternalLinks, suggestSmartChips, buildRecommendationWidget, buildSitemapEntry } from '../utils/article-seo.js';
import { buildContentDashboard, buildAuthorRecommendations, buildCoverageDashboard, buildExploreTitles } from '../utils/content-dashboard.js';
import { getAnchorEntries } from '../utils/anchor-entries.js';
import { queryArticles } from '../utils/ai-supabase.js';
import { strengthenGraphConnections } from '../utils/graph-growth.js';
import { embedText, embeddingText, cosineSim, isEmbeddingConfigured } from '../utils/embedding-provider.js';
import { buildIntelligenceReport } from '../utils/intelligence-dashboard.js';
import { buildFeedbackRecommendations } from '../utils/feedback-loop.js';
import { buildHealthReport } from '../utils/health-report.js';
import { systemLogSummary, logSystemEvent } from '../utils/system-log.js';
import { requireAdminModule } from '../utils/admin-session.js';
import { diagnoseChatbotAnswer, getTestableSources } from '../utils/chatbot-diagnostics.js';
import { runHealthProbes } from '../utils/health-probes.js';
import { buildErrorCenter } from '../utils/error-center.js';

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

  // Admin gate — never expose provisioning to the public. Accepts a signed
  // admin-portal session (module 'kb', 'governance', or 'articles' — 'articles'
  // added so the unified Content Intelligence Center, which authenticates once as
  // 'articles', can also call this file's health/content-dashboard/author-assistant
  // etc. in the same session; mirrors ai-articles.js's symmetric widening to accept
  // 'kb') or, as a back-compat fallback, the legacy shared AI_ADMIN_KEY header.
  const authorized = await requireAdminModule(env, request, ['kb', 'governance', 'articles'], { header: 'x-admin-key', value: env.AI_ADMIN_KEY });
  if (!authorized) {
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
    // PHASE 26 — AI SELF-EVOLUTION: prioritized improvement plan from logged gaps.
    // Recommendations only (concepts/articles/missions/practice/exams) — never auto-written.
    if (action === 'evolution') {
      return json(await buildEvolutionReport(env, { limit: 100, topN: 8 }));
    }
    // PRODUCTION UPGRADE — SYSTEM LOG: admin-visible embedding/graph-sync/article-
    // ingestion/LLM-fallback failure trail (Part A.6). Graceful: empty until the
    // AI Supabase + kb_system_log table exist.
    if (action === 'system-log') {
      const u = new URL(request.url);
      return json(await systemLogSummary(env, { limit: parseInt(u.searchParams.get('limit') || '200', 10) || 200 }));
    }
    // PART 5 — AUTHOR ASSISTANT / CONTENT DEMAND ENGINE: tells the admin exactly what
    // to write next, from real demand (logged gaps + missed retrievals). Reuses the
    // evolution report — no duplicate analytics. Populates once gaps are logged.
    if (action === 'author-assistant') {
      const ev = await buildEvolutionReport(env, { limit: 150, topN: 12 });
      const missing = await getMissingKnowledge(env, { limit: 50 }).catch(() => []);
      // PHASE B — CONTENT DEMAND ENGINE: ranked topics (most-searched/missing,
      // beginner vs advanced demand, low-coverage topics, repeated questions).
      const rankedRecommendations = await buildAuthorRecommendations(env).catch(() => null);
      return json({
        headline: 'People are asking about:',
        topMissingQuestions: missing.map(m => ({ question: m.question, frequency: m.frequency || 1, category: m.category })).slice(0, 15),
        writeNext: ev.recommendations,   // ranked by frequency, with priority + sample questions
        totalGaps: ev.totalGaps,
        rankedRecommendations,
        note: ev.totalGaps ? 'Write articles for the highest-priority categories first; each one auto-generates missions/practice/exams once published.' : 'No demand logged yet — gaps appear here as users ask unanswered questions (requires the AI Supabase configured).',
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
    // CONTENT ECOSYSTEM STEP 1 — FAQ SCHEMA: ?action=faq-schema&id=<conceptId> → schema.org
    // FAQPage JSON-LD built from the concept's question patterns + canonical answers.
    // Works for any published concept (graph or anchor/KB_SEED) — for the admin to embed
    // on the matching SEO page. Read-only, reuses existing concept data.
    if (action === 'faq-schema') {
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return json({ error: 'id required' }, 400);
      let concept = getAnchorEntries().find(e => e.id === id) || null;
      if (!concept && graphActive(env)) concept = await getNode(env, id).catch(() => null);
      if (!concept) return json({ error: 'concept not found' }, 404);
      const faqSchema = buildFaqSchema(concept);
      return json({ id, faqSchema, note: faqSchema ? null : 'Not enough question patterns / canonical answers to build a FAQ block.' });
    }
    // CONTENT ECOSYSTEM STEP 5 — CONTENT DASHBOARD: most-searched topics, missing topics,
    // article coverage, graph growth, and what to write next. Composes existing analytics
    // (anchor entries, kb_missing, ai_articles, evolution report) + pending article
    // concepts awaiting an SEO page (review queue, origin 'article').
    if (action === 'content-dashboard') {
      const dashboard = await buildContentDashboard(env);
      const queue = await reviewQueue(env).catch(() => []);
      dashboard.pendingArticles = queue
        .filter(n => n.origin === 'article')
        .map(n => ({ id: n.id, title: n.topic || n.title || n.id, status: n.status }));
      return json(dashboard);
    }
    // PHASE F — REAL USER INTELLIGENCE: live operational view of what users are
    // asking, which questions are increasing, weak concepts, article/path graph
    // activity, and beginner topics to expand. Composes existing analytics only.
    if (action === 'intelligence') {
      return json(await buildIntelligenceReport(env, { limit: 100 }));
    }
    // PHASE G — CONTENT FEEDBACK LOOP: recommendations only (article updates, graph
    // improvements, FAQ expansion, smart-chip improvements, learning-path
    // improvements) derived from Phase F. Never auto-applies.
    if (action === 'feedback') {
      return json(await buildFeedbackRecommendations(env, { limit: 100 }));
    }
    // PHASE H — SELF MONITORING: AI health report (retrieval quality, unknown-
    // question signal, graph growth, article coverage, language/market/memory
    // structural checks) + a single production score. Monitoring only.
    if (action === 'health') {
      return json(await buildHealthReport(env));
    }
    // CONTENT COVERAGE DASHBOARD (spec Phase 2-3) — real articles÷graph-concepts
    // ratio per category, categories discovered dynamically (no invented totals).
    // Pure reshape of buildContentDashboard's existing byCategory maps.
    if (action === 'coverage-dashboard') {
      return json(await buildCoverageDashboard(env));
    }
    // MISSING TOPIC ENGINE (spec Phase 4) — every category with real demand/gap
    // signal (not just the top-8 shown in "Write This Next"), each tagged with
    // which opportunity type(s) it represents. Reuses buildAuthorRecommendations'
    // exact ranking — this is the same engine, just the full list instead of the
    // top slice, with explicit opportunity flags for the 3-action UI.
    if (action === 'missing-topics') {
      const recs = await buildAuthorRecommendations(env, { limit: 200, topN: 100 }).catch(() => ({ rankedTopics: [] }));
      const topics = (recs.rankedTopics || []).map(t => ({
        ...t,
        seoOpportunity: t.coverageGap,
        graphOpportunity: t.graphConcepts === 0,
        chatbotOpportunity: t.frequency > 0,
      }));
      return json({ topics, repeatedQuestions: recs.repeatedQuestions || [], note: recs.note });
    }
    // WEBSITE HEALTH CENTER — API STATUS (spec Phase 9). Fans out the new OpenAI/
    // Supabase/Cloudflare probes (health-probes.js) alongside the EXISTING FRED/
    // Finnhub/TwelveData probes (reused via an internal fetch to /api/diagnose —
    // not reimplemented) into one Online/Offline/Warning table. Every probe result
    // is logged via the existing logSystemEvent() so "Last Successful Check" /
    // "Last Failure" are derivable from kb_system_log history with no new table.
    if (action === 'health-live') {
      const [marketDiag, extraProbes] = await Promise.all([
        fetch(new URL('/api/diagnose', request.url).toString()).then(r => r.json()).catch(() => ({ providers: [] })),
        runHealthProbes(env),
      ]);
      const providers = [...(marketDiag.providers || []), ...extraProbes];
      await Promise.all(providers.map(p => logSystemEvent(env, {
        kind: 'health-probe', level: p.ok ? 'info' : 'error',
        message: `${p.service}: ${p.ok ? 'OK' : (p.rootCause || 'failed')}`,
        meta: { service: p.service, ok: p.ok, ms: p.ms, httpStatus: p.httpStatus },
      }).catch(() => {})));
      const workingApis = providers.filter(p => p.ok).length;
      const overallHealthPct = providers.length ? Math.round((workingApis / providers.length) * 100) : 0;
      return json({
        providers, workingApis, failedApis: providers.length - workingApis, overallHealthPct,
        // AUTOMATION STATUS — honest by design (spec Phase 9 decision #3): all real
        // automation is offline PowerShell under /automation, run on an operator
        // machine — a Cloudflare Worker has zero process visibility into it. Porting
        // governance-admin.html's exact disclosure rather than fabricating a status.
        automation: {
          status: 'Not Connected', reason: 'no runtime automation API exists',
          note: 'The automation in this repo is PowerShell scripts under /automation (master_engine.ps1, compile_queue_engine.ps1, send_delivery_email.ps1) run on an operator machine — there is no runtime jobs API exposing their state to the browser. "Not Connected" is correct by design, not a failure.',
        },
        checkedAt: new Date().toISOString(),
      });
    }
    // ERROR CENTER (spec Phase 9) — see error-center.js for the aggregation.
    if (action === 'error-center') {
      return json(await buildErrorCenter(env));
    }
    // CHATBOT CHECKER — automatic source detection (never hardcoded — derived
    // from answer-source.js's SOURCE_STAGES, the same list the real chatbot uses).
    if (action === 'chatbot-sources') {
      return json({ sources: getTestableSources() });
    }
    // EXPLORE — MISSING TOPICS (spec Phase 4/production addendum) — many concrete
    // suggested article titles, never empty when real gap data exists (graph
    // concepts without an article, or logged chatbot questions).
    if (action === 'explore-topics') {
      const category = new URL(request.url).searchParams.get('category') || null;
      return json(await buildExploreTitles(env, { limit: 80, category }));
    }
    return json({ error: 'unknown action' }, 400);
  }

  if (request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
    const a = body?.action;
    if (a === 'migrate-seed') return json(await provisionSeed(env));
    if (a === 'backfill-embeddings') return json(await backfillEmbeddings(env, { limit: body.limit || 200, offset: body.offset || 0, force: !!body.force }));
    if (a === 'sync-edges')   return json(await syncAllEdges(env, { limit: body.limit || 200, offset: body.offset || 0, rebuild: !!body.rebuild }));
    if (a === 'validate')     return json(validateKnowledgeObject(body.object, { mode: body.mode || 'publish' }));
    if (a === 'author')       return json(await authorConcept(env, body.object, { origin: body.origin }));
    if (a === 'author-batch') return json(await authorBatch(env, body.objects, { origin: body.origin }));
    if (a === 'populate-anchors') return json(await populateAnchors(env, { offset: body.offset || 0, limit: body.limit || 1, publish: body.publish !== false, force: !!body.force }));
    // PART 4 — ARTICLE INGESTION: paste {title, body} → scaffold a KOS draft concept →
    // run it through the existing authoring pipeline (validate → dedup → review queue).
    // Then approve via the existing 'publish' action to add it to the graph.
    if (a === 'ingest-article') {
      if (!body.article || !body.article.title || !body.article.body) return json({ error: 'article {title, body} required' }, 400);
      const kos = buildConceptFromArticle(body.article);
      const entries = getAnchorEntries();
      const articles = await queryArticles(env, { limit: 200 }).catch(() => []);

      // PHASE E (dormant prep): only computed when embeddings are configured AND
      // KB_EMBEDDINGS_ENABLED==='true' (same gate used elsewhere) — reuses the
      // EXISTING embedding-provider exports, no new infra/env. Today this stays
      // null and every ranking below is IDENTICAL to before.
      let embedScores = null;
      if (env.KB_EMBEDDINGS_ENABLED === 'true' && isEmbeddingConfigured(env)) {
        const draftVec = await embedText(env, embeddingText({ data: kos, ...kos })).catch(() => null);
        if (draftVec) {
          embedScores = {};
          for (const e of [...entries, ...articles]) {
            const vec = e.embedding || (e.data && e.data.embedding);
            if (vec) embedScores[e.id] = cosineSim(draftVec, vec);
          }
        }
      }

      // CONTENT ECOSYSTEM STEP 1 — auto-link this draft into the existing graph (no
      // orphan ids: suggestLinks only returns ids that exist in getAnchorEntries()).
      const links = suggestLinks(kos, entries, { embedScores });
      kos.related = links.related;
      kos.nextSteps = links.nextSteps;
      // PHASE D — improve article relationships: recommendedArticles feeds the
      // EXISTING deriveEdgesFromKOS (via publishConcept→syncEdges, unchanged) to
      // create RECOMMENDS_ARTICLE edges automatically on publish.
      const relatedArticles = suggestRelatedArticles(kos, articles, { embedScores });
      kos.recommendedArticles = relatedArticles.map(a => a.id);

      const result = await authorConcept(env, kos, { origin: 'article' });
      // STEP 1/3 — FAQ schema + SEO suggestion for the page the admin publishes.
      const seoSuggestion = buildSeoSuggestion(kos);
      // PHASE A/C/D — internal links, smart chips, recommendation widget, sitemap
      // suggestion. All derived from the same graph/article data already fetched.
      const linkedEntries = [...links.related, ...links.nextSteps]
        .map(id => entries.find(e => e.id === id))
        .filter(Boolean);
      const internalLinks = buildInternalLinks(kos, { conceptEntries: linkedEntries, relatedArticles });
      const smartChips = suggestSmartChips(kos, { conceptEntries: linkedEntries, relatedArticles });
      const recommendationWidget = buildRecommendationWidget(kos, internalLinks);
      const sitemapEntry = buildSitemapEntry(kos);
      return json({
        ...result, concept: kos, seoSuggestion, faqSchema: seoSuggestion.faqSchema,
        relatedArticles, internalLinks, smartChips, recommendationWidget, sitemapEntry,
        notes: INGEST_NOTES, nextStep: result.ok ? "Review, then POST { action:'publish', object } to add it to the graph." : null,
      });
    }
    if (a === 'publish') {
      const result = await publishConcept(env, body.object, body.reviewer || 'admin');
      // PHASE D — graph auto growth: add reciprocal edges from this concept's
      // related/nextSteps targets BACK to it, so existing concepts' neighbor
      // graphs (recommended journeys, smart chips) grow to include the new one.
      const growth = result.ok ? await strengthenGraphConnections(env, body.object) : { added: 0, targets: [] };
      return json({ ...result, graphGrowth: growth });
    }
    // CHATBOT CHECKER (spec Phase 8) — diagnoses the most recent chat answer to
    // `question`, reusing the exact retrieval chain + ai_response_logs row the
    // live chat call already produced. See chatbot-diagnostics.js.
    if (a === 'chatbot-check') {
      if (!body.question) return json({ error: 'question required' }, 400);
      return json(await diagnoseChatbotAnswer(env, { question: body.question, sourceLayer: body.sourceLayer }));
    }
    if (a === 'reject')       return json(await rejectToDraft(env, body.id, body.reviewer || 'admin', body.notes));
    if (a === 'retire')       return json(await retire(env, body.id));
    if (a === 'rollback')     return json(await rollback(env, body.id, body.version));
    return json({ error: 'unknown action' }, 400);
  }
  return json({ error: 'method not allowed' }, 405);
}
