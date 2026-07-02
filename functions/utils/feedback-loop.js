// functions/utils/feedback-loop.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE G — CONTENT FEEDBACK LOOP. Extends the existing ecosystem: when the
// intelligence layer (Phase F) shows users repeatedly asking about something,
// turn that into concrete, human-reviewable suggestions — article updates, graph
// improvements, FAQ expansion, smart-chip improvements, learning-path
// improvements. RECOMMENDATIONS ONLY: nothing here writes to kb_nodes, kb_edges,
// ai_articles, or any other table. Same "suggest, never auto-publish" contract as
// evolution-engine.js / content-dashboard.js.
// ════════════════════════════════════════════════════════════════════════════

import { buildIntelligenceReport } from './intelligence-dashboard.js';
import { getAnchorEntries } from './anchor-entries.js';
import { queryArticles } from './ai-supabase.js';
import { buildFaqSchema } from './article-enrich.js';

export async function buildFeedbackRecommendations(env, { limit = 100 } = {}) {
  const intel = await buildIntelligenceReport(env, { limit });
  const entries = getAnchorEntries();
  const articles = await queryArticles(env, { limit: 500 }).catch(() => []);

  // 1) ARTICLE UPDATES — a repeated/increasing question whose category already
  // has a published article: recommend expanding that article to cover it.
  const articleUpdates = [];
  const seenArticles = new Set();
  for (const q of intel.increasingQuestions) {
    const cat = q.category || 'uncategorized';
    const existing = articles.find(a => a.category === cat);
    if (existing && !seenArticles.has(existing.id)) {
      seenArticles.add(existing.id);
      articleUpdates.push({
        articleId: existing.id, title: existing.title, category: cat,
        recommendation: `"${q.question}" has been asked ${q.frequency}x and is still active — consider expanding "${existing.title}" to answer it directly.`,
      });
    }
  }

  // 2) GRAPH IMPROVEMENTS — weak intents (Phase F) mapped to an existing concept
  // (add related/nextSteps/questionPatterns) or flagged as uncovered (author new).
  const graphImprovements = intel.weakConcepts.slice(0, 8).map(w => {
    const match = entries.find(e => e.id === w.intent || (e.concepts || []).includes(w.intent));
    return match
      ? { intent: w.intent, frequency: w.frequency, conceptId: match.id,
          recommendation: `Concept "${match.id}" maps to ${w.frequency} unanswered "${w.intent}" question(s) — add more related/nextSteps/questionPatterns covering this intent.` }
      : { intent: w.intent, frequency: w.frequency, conceptId: null,
          recommendation: `No concept currently covers intent "${w.intent}" (${w.frequency} unanswered question(s)) — author a new concept or add "${w.intent}" to an existing concept's concepts[]/questionPatterns.` };
  });

  // 3) FAQ EXPANSION — concepts in categories with active demand today that
  // don't yet have enough question patterns / canonical answers for a FAQ block.
  const faqExpansions = [];
  const seenFaq = new Set();
  const demandCategories = new Set(intel.askedToday.map(m => m.category || 'uncategorized'));
  for (const cat of demandCategories) {
    for (const e of entries.filter(e => e.category === cat)) {
      if (!seenFaq.has(e.id) && !buildFaqSchema(e)) {
        seenFaq.add(e.id);
        faqExpansions.push({ conceptId: e.id, category: cat,
          recommendation: `"${e.id}" has no FAQ block yet (missing questionPatterns/canonical answers) while "${cat}" has active demand today — add a questionPatterns[] and canonical.short/deep.` });
      }
    }
  }

  // 4) SMART CHIP IMPROVEMENTS — categories with active demand but thin
  // questionPatterns coverage across their concepts (chips are sourced from
  // questionPatterns + related concepts/articles, Phase D).
  const byCategoryDemand = {};
  for (const m of intel.askedToday) byCategoryDemand[m.category || 'uncategorized'] = (byCategoryDemand[m.category || 'uncategorized'] || 0) + (m.frequency || 1);
  const chipImprovements = [];
  for (const [cat, freq] of Object.entries(byCategoryDemand)) {
    const conceptsInCat = entries.filter(e => e.category === cat);
    if (!conceptsInCat.length) continue;
    const totalPatterns = conceptsInCat.reduce((s, e) => s + (e.questionPatterns || []).length, 0);
    if (totalPatterns < conceptsInCat.length * 2) {
      chipImprovements.push({ category: cat, frequency: freq, conceptCount: conceptsInCat.length, totalQuestionPatterns: totalPatterns,
        recommendation: `"${cat}" has ${freq} active question(s) today but only ${totalPatterns} questionPattern(s) across ${conceptsInCat.length} concept(s) — add more questionPatterns so smart chips surface this topic more often.` });
    }
  }

  // 5) LEARNING PATH IMPROVEMENTS — beginner topics flagged for expansion
  // (Phase F/B), with an extra nudge when the category has no entry point yet.
  const learningPathImprovements = intel.beginnerExpansionTargets.map(t => ({
    category: t.category, priority: t.priority, coverageGap: t.coverageGap,
    recommendation: t.suggestion + (t.coverageGap ? ' No journey/article entry point exists yet — add journeyStages linking into this category.' : ''),
  }));

  return {
    articleUpdates: articleUpdates.slice(0, 10),
    graphImprovements,
    faqExpansions: faqExpansions.slice(0, 10),
    chipImprovements: chipImprovements.slice(0, 10),
    learningPathImprovements: learningPathImprovements.slice(0, 10),
    note: 'Recommendations only — derived from Phase F (real user intelligence). Nothing here writes to kb_nodes, kb_edges, or ai_articles; an admin/author reviews and applies through the existing authoring pipeline.',
  };
}
