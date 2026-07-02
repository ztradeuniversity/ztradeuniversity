// functions/utils/intelligence-dashboard.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE F — REAL USER INTELLIGENCE. A live operational layer composed entirely
// from EXISTING analytics: kb_missing (logged unanswered questions), kb_edges
// (graph relationships), getAnchorEntries (graph concepts), ai_articles, and
// buildAuthorRecommendations (Phase B demand engine). No new storage, no new
// tables — every query reuses an existing read path. Graceful: every section
// degrades to [] / 0 / honest "not tracked" when its source is empty/unconfigured.
// ════════════════════════════════════════════════════════════════════════════

import { getMissingKnowledge, getEdgesByType, graphActive } from './kb-store.js';
import { getAnchorEntries } from './anchor-entries.js';
import { queryArticles } from './ai-supabase.js';
import { buildAuthorRecommendations } from './content-dashboard.js';
import { EDGE_TYPES } from './kb-graph.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildIntelligenceReport(env, { limit = 100 } = {}) {
  const active = graphActive(env);
  const sinceToday = new Date(Date.now() - DAY_MS).toISOString();

  const missing = await getMissingKnowledge(env, { limit }).catch(() => []);
  const askedToday = missing.filter(m => m.last_seen && m.last_seen >= sinceToday);

  // "Increasing" proxy: recurring gaps (frequency > 1) that are still being hit
  // today — kb_missing has no per-day time series, so this is the honest signal
  // the existing schema supports (same proxy style as buildAuthorRecommendations).
  const increasingQuestions = missing
    .filter(m => (m.frequency || 1) > 1 && m.last_seen && m.last_seen >= sinceToday)
    .sort((a, b) => (b.frequency || 1) - (a.frequency || 1))
    .slice(0, 10)
    .map(m => ({ question: m.question, category: m.category, intent: m.intent, frequency: m.frequency || 1 }));

  // Weak concepts: gap frequency grouped by intent (finer-grained than category —
  // intent usually maps to a specific concept family in classifyIntent).
  const byIntent = {};
  for (const m of missing) {
    const k = m.intent || 'unclassified';
    byIntent[k] = (byIntent[k] || 0) + (m.frequency || 1);
  }
  const weakConcepts = Object.entries(byIntent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([intent, frequency]) => ({ intent, frequency }));

  // Article graph activity: RECOMMENDS_ARTICLE edges (dst = "article:<id>",
  // derived from kos.recommendedArticles via the existing deriveEdgesFromKOS)
  // counted per article, joined against ai_articles for titles.
  const recEdges = await getEdgesByType(env, EDGE_TYPES.RECOMMENDS_ARTICLE, 1000).catch(() => []);
  const activityByArticle = {};
  for (const e of recEdges) {
    const m = /^article:(.+)$/.exec(e.dst || '');
    if (!m) continue;
    activityByArticle[m[1]] = (activityByArticle[m[1]] || 0) + 1;
  }
  const articles = await queryArticles(env, { limit: 500 }).catch(() => []);
  const articlesById = new Map(articles.map(a => [a.id, a]));
  const topArticlesByActivity = Object.entries(activityByArticle)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, edgeCount]) => ({ id, title: articlesById.get(id)?.title || id, category: articlesById.get(id)?.category || null, edgeCount }));

  // Most-used learning paths: proxy from LEADS_TO (journeyStages) + NEXT_BEST_ACTION
  // edges, counted per source concept — the concepts most often positioned as a
  // "next step" / journey stage are the ones most learning paths route through.
  const [leadsTo, nextAction] = await Promise.all([
    getEdgesByType(env, EDGE_TYPES.LEADS_TO, 1000).catch(() => []),
    getEdgesByType(env, EDGE_TYPES.NEXT_BEST_ACTION, 1000).catch(() => []),
  ]);
  const pathHits = {};
  for (const e of [...leadsTo, ...nextAction]) pathHits[e.src] = (pathHits[e.src] || 0) + 1;
  const entries = getAnchorEntries();
  const entriesById = new Map(entries.map(e => [e.id, e]));
  const topLearningPathSources = Object.entries(pathHits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, edgeCount]) => ({ id, title: entriesById.get(id)?.subcategory || entriesById.get(id)?.title || id, category: entriesById.get(id)?.category || null, edgeCount }));

  // Beginner topics to expand: reuse the existing Phase B demand engine.
  const authorRecs = await buildAuthorRecommendations(env, { limit }).catch(() => ({ rankedTopics: [] }));
  const beginnerExpansionTargets = (authorRecs.rankedTopics || [])
    .filter(t => t.audience === 'beginner')
    .slice(0, 10);

  return {
    active,
    generatedAt: new Date().toISOString(),
    askedToday: askedToday.map(m => ({ question: m.question, category: m.category, intent: m.intent, frequency: m.frequency || 1, lastSeen: m.last_seen })),
    increasingQuestions,
    weakConcepts,
    topArticlesByActivity,
    topLearningPathSources,
    beginnerExpansionTargets,
    chipClicks: { tracked: false, note: 'No chip-click telemetry exists yet — chips re-submit as ordinary chat messages, which are only logged when they miss (kb_missing). Would need a dedicated click-log table; not added per "no duplicate databases".' },
    note: 'Composed entirely from existing analytics: kb_missing (demand/weak-areas), kb_edges (graph + path activity), ai_articles, and the Phase B author-recommendations engine. No new storage.',
  };
}
