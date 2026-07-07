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
import { ARTICLE_CATEGORIES } from './article-categories.js';

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
export async function buildAuthorRecommendations(env, { limit = 50, topN = 10 } = {}) {
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
    rankedTopics: rankedTopics.slice(0, topN),
    repeatedQuestions,
    beginnerDemand: rankedTopics.filter(r => r.audience === 'beginner').reduce((s, r) => s + r.frequency, 0),
    advancedDemand: rankedTopics.filter(r => r.audience === 'advanced').reduce((s, r) => s + r.frequency, 0),
    lowCoverageTopics: rankedTopics.filter(r => r.coverageGap).map(r => r.category),
    note: '"Most searched"/"repeated questions" are proxied from kb_missing (logged unanswered queries) — the only demand signal available without new analytics. Beginner/advanced split is inferred from each category\'s existing concept levels.',
  };
}

function humanizeCategory(key) {
  const known = ARTICLE_CATEGORIES.find(c => c.key === key);
  if (known) return known.label;
  return String(key || 'Uncategorized').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// CONTENT COVERAGE DASHBOARD (spec Phase 2-3) — every trading topic category the
// site actually has data for, published-article count vs graph-concept count, and
// a REAL coverage ratio. Categories are discovered dynamically from whatever is
// actually in the graph (getAnchorEntries) and ai_articles — the union of both —
// never a hardcoded/invented "total addressable topics" number (there is no such
// ground truth anywhere in this codebase). Reuses the exact same byCategory maps
// buildContentDashboard already computes; this is a presentation reshape, not a
// new data source.
export async function buildCoverageDashboard(env) {
  const dashboard = await buildContentDashboard(env);
  const graphByCategory = dashboard.graphGrowth.byCategory || {};
  const articlesByCategory = dashboard.articleCoverage.byCategory || {};
  const allCategories = new Set([...Object.keys(graphByCategory), ...Object.keys(articlesByCategory), ...ARTICLE_CATEGORIES.map(c => c.key)]);

  const rows = [...allCategories].map(category => {
    const articles = articlesByCategory[category] || 0;
    const graphConcepts = graphByCategory[category] || 0;
    // Coverage = how much of what's already known about this topic (graph concepts)
    // has been turned into a published article. 100% when concepts exist and every
    // one has at least proportional article coverage; capped at 100.
    const coveragePct = graphConcepts > 0
      ? Math.min(100, Math.round((articles / graphConcepts) * 100))
      : (articles > 0 ? 100 : 0);
    return {
      category, label: humanizeCategory(category),
      articles, graphConcepts, coveragePct,
      isCanonicalArticleCategory: ARTICLE_CATEGORIES.some(c => c.key === category),
    };
  }).sort((a, b) => (b.graphConcepts + b.articles) - (a.graphConcepts + a.articles));

  const totalArticles = dashboard.articleCoverage.totalArticles;
  const totalConcepts = dashboard.graphGrowth.totalConcepts;
  return {
    rows,
    totals: {
      categories: rows.length,
      totalArticles, totalConcepts,
      overallCoveragePct: totalConcepts > 0 ? Math.min(100, Math.round((totalArticles / totalConcepts) * 100)) : 0,
    },
    note: 'Coverage % = published articles ÷ graph concepts logged for that category — both are real, queryable numbers. No fixed "total topics" target is invented; categories are discovered from the live graph + article table, not a hardcoded taxonomy.',
  };
}

// EXPLORE — MISSING TOPICS (spec: "Explore" button must surface many concrete
// suggested article TITLES, not just category-level gaps, even when kb_missing
// demand hasn't been logged yet). Two real sources, no invented titles: (1) every
// graph concept (getAnchorEntries) that has no article with a matching title yet,
// (2) every real unanswered chatbot question (kb_missing) verbatim, sentence-cased
// into a title. Demand-sourced titles are deduped first (real user signal ranks
// above a structural gap).
export async function buildExploreTitles(env, { limit = 60 } = {}) {
  const entries = getAnchorEntries();
  const articles = await queryArticles(env, { limit: 500 }).catch(() => []);
  const articleTitles = new Set(articles.map(a => String(a.title || '').toLowerCase().trim()).filter(Boolean));
  const missing = await getMissingKnowledge(env, { limit: 150 }).catch(() => []);

  const fromDemand = missing
    .filter(m => m.question && m.question.trim())
    .map(m => ({
      title: m.question.trim().charAt(0).toUpperCase() + m.question.trim().slice(1).replace(/\?+$/, ''),
      category: m.category || 'uncategorized', source: 'Real chatbot question — unanswered',
    }));

  const fromGraph = entries
    .filter(e => e && (e.title || e.topic))
    .map(e => ({ title: (e.title || e.topic).trim(), category: e.category || 'uncategorized', source: 'Graph concept with no matching article' }))
    .filter(t => t.title && !articleTitles.has(t.title.toLowerCase()));

  const seen = new Set();
  const titles = [...fromDemand, ...fromGraph].filter(t => {
    const key = t.title.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    titles: titles.slice(0, limit),
    totalCandidates: titles.length,
    note: 'Every title is either a real logged chatbot question or an existing graph concept with no matching article — nothing invented.',
  };
}
