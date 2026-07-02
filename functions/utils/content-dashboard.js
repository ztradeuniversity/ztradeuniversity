// functions/utils/content-dashboard.js
// ════════════════════════════════════════════════════════════════════════════
// CONTENT INTELLIGENCE DASHBOARD — Content Ecosystem STEP 5. Composes EXISTING
// analytics (graph size via anchor-entries, real demand via kb_missing, article
// inventory via ai_articles, write-next via the evolution engine) into one view:
// most-searched topics, missing topics, article coverage, graph growth, and what
// to write next. No new storage, no new queries beyond a read of ai_articles —
// pure composition over data that already exists. Every piece degrades to an
// empty/zero value when its source isn't configured (never throws).
// ════════════════════════════════════════════════════════════════════════════

import { getAnchorEntries } from './anchor-entries.js';
import { getMissingKnowledge, graphActive, countConcepts } from './kb-store.js';
import { buildEvolutionReport } from './evolution-engine.js';
import { queryArticles } from './ai-supabase.js';

function byCategoryCount(items, getCat) {
  const out = {};
  for (const it of items) {
    const c = getCat(it) || 'uncategorized';
    out[c] = (out[c] || 0) + 1;
  }
  return out;
}

export async function buildContentDashboard(env, { limit = 50 } = {}) {
  const entries = getAnchorEntries();
  const graphByCategory = byCategoryCount(entries, e => e.category);
  const published = graphActive(env) ? await countConcepts(env).catch(() => null) : null;

  const missing = await getMissingKnowledge(env, { limit }).catch(() => []);
  const demandByCategory = {};
  for (const m of missing) {
    const c = m.category || 'uncategorized';
    demandByCategory[c] = (demandByCategory[c] || 0) + (m.frequency || 1);
  }

  const articles = await queryArticles(env, { limit: 500 }).catch(() => []);
  const articlesByCategory = byCategoryCount(articles, a => a.category);

  const graphCategories = Object.keys(graphByCategory);
  const categoriesNeedingArticles = graphCategories
    .filter(c => !articlesByCategory[c])
    .sort((a, b) => (graphByCategory[b] || 0) - (graphByCategory[a] || 0));

  const evo = await buildEvolutionReport(env, { limit, topN: 5 }).catch(() => ({ recommendations: [] }));

  return {
    graphGrowth: {
      totalConcepts: entries.length,
      publishedInGraphDb: published,
      categories: graphCategories.length,
      byCategory: graphByCategory,
    },
    articleCoverage: {
      totalArticles: articles.length,
      byCategory: articlesByCategory,
      categoriesNeedingArticles,
    },
    demand: {
      totalGaps: missing.length,
      byCategory: demandByCategory,
      topMissingQuestions: missing.slice(0, 15).map(m => ({ question: m.question, category: m.category, frequency: m.frequency || 1 })),
    },
    writeNext: evo.recommendations || [],
    note: 'Combines graph size, article coverage, and real demand (kb_missing) to surface what to write next. Reuses existing analytics — no new storage.',
  };
}

// PHASE B — CONTENT DEMAND ENGINE: a ranked "what should I write next" view for the
// Author Assistant. Reuses the same sources as buildContentDashboard (kb_missing,
// getAnchorEntries, ai_articles) — no new storage, no new queries. "Most searched" /
// "repeated questions" are proxied honestly from kb_missing (the only query-demand
// signal that exists); beginner/advanced demand is inferred from the level mix of
// each category's existing graph concepts.
export async function buildAuthorRecommendations(env, { limit = 50 } = {}) {
  const entries = getAnchorEntries();
  const graphByCategory = byCategoryCount(entries, e => e.category);

  const levelByCategory = {};
  for (const e of entries) {
    const c = e.category || 'uncategorized';
    levelByCategory[c] = levelByCategory[c] || { beginner: 0, total: 0 };
    levelByCategory[c].total++;
    if (e.level === 'beginner') levelByCategory[c].beginner++;
  }

  const missing = await getMissingKnowledge(env, { limit }).catch(() => []);
  const articles = await queryArticles(env, { limit: 500 }).catch(() => []);
  const articlesByCategory = byCategoryCount(articles, a => a.category);

  const byCategory = {};
  for (const m of missing) {
    const c = m.category || 'uncategorized';
    byCategory[c] = byCategory[c] || { frequency: 0, questions: [] };
    byCategory[c].frequency += (m.frequency || 1);
    byCategory[c].questions.push({ question: m.question, frequency: m.frequency || 1 });
  }

  const repeatedQuestions = missing
    .filter(m => (m.frequency || 1) > 1)
    .map(m => ({ question: m.question, category: m.category, frequency: m.frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);

  const rankedTopics = Object.entries(byCategory).map(([category, data]) => {
    const coverageGap = !articlesByCategory[category];
    const lvl = levelByCategory[category] || { beginner: 0, total: 0 };
    const audience = (lvl.total ? lvl.beginner / lvl.total : 0) >= 0.5 ? 'beginner' : 'advanced';
    return {
      category, audience,
      frequency: data.frequency,
      priority: data.frequency + (coverageGap ? 5 : 0),
      coverageGap, graphConcepts: graphByCategory[category] || 0,
      topQuestions: data.questions.sort((a, b) => b.frequency - a.frequency).slice(0, 3),
      suggestion: `Write a${coverageGap ? 'n introductory' : ' follow-up'} ${audience} article for "${category}" — ${data.frequency} unanswered question${data.frequency === 1 ? '' : 's'} logged${coverageGap ? ', and 0 articles exist yet' : ''}.`,
    };
  }).sort((a, b) => b.priority - a.priority);

  return {
    rankedTopics: rankedTopics.slice(0, 10),
    repeatedQuestions,
    beginnerDemand: rankedTopics.filter(r => r.audience === 'beginner').reduce((s, r) => s + r.frequency, 0),
    advancedDemand: rankedTopics.filter(r => r.audience === 'advanced').reduce((s, r) => s + r.frequency, 0),
    lowCoverageTopics: rankedTopics.filter(r => r.coverageGap).map(r => r.category),
    note: '"Most searched"/"repeated questions" are proxied from kb_missing (logged unanswered queries) — the only demand signal available without new analytics. Beginner/advanced split is inferred from each category\'s existing concept levels.',
  };
}
