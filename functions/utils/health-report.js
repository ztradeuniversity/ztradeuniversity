// functions/utils/health-report.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE H — SELF MONITORING. A read-only AI health report composed from existing
// systems: content-dashboard (graph growth, article coverage, demand),
// intelligence-dashboard (Phase F — unknown-question signal, chip usage), and
// structural presence checks on the frozen language/market/memory layers (import
// + typeof only — never calls/executes them, never modifies them). Returns a
// single production score. MONITORING ONLY — no automatic repairs, no writes.
// ════════════════════════════════════════════════════════════════════════════

import { graphActive } from './kb-store.js';
import { isConfigured as aiSupabaseConfigured } from './ai-supabase.js';
import { buildContentDashboard } from './content-dashboard.js';
import { buildIntelligenceReport } from './intelligence-dashboard.js';
import { refineLanguage, normalizeMultilang } from './lang-assist.js';
import { marketDecisionInstrument, buildMarketContext } from './market-context.js';
import { detectMarketWhy, buildWhyExplanation } from './market-explain.js';

export async function buildHealthReport(env) {
  const active = graphActive(env);
  const dashboard = await buildContentDashboard(env).catch(() => null);
  const intel = await buildIntelligenceReport(env, { limit: 100 }).catch(() => null);

  const graphGrowth = dashboard?.graphGrowth ?? { totalConcepts: 0, publishedInGraphDb: null, categories: 0, byCategory: {} };
  const articleCoverage = dashboard?.articleCoverage ?? { totalArticles: 0, byCategory: {}, categoriesNeedingArticles: [] };

  const retrievalQuality = {
    graphActive: active,
    publishedConcepts: graphGrowth.publishedInGraphDb,
    totalConcepts: graphGrowth.totalConcepts,
    categories: graphGrowth.categories,
  };

  const unknownQuestionRate = {
    totalGapsLogged: dashboard?.demand?.totalGaps ?? 0,
    askedTodayCount: intel?.askedToday?.length ?? 0,
    increasingCount: intel?.increasingQuestions?.length ?? 0,
    note: 'Absolute counts, not a true rate — total question volume isn\'t logged anywhere, only unanswered ones (kb_missing).',
  };

  // Structural presence checks ONLY (import + typeof) — the frozen Language Lock
  // and Market Engine modules are never invoked or modified here.
  const languageRouting = {
    active: typeof refineLanguage === 'function' && typeof normalizeMultilang === 'function',
    note: 'Structural check — confirms lang-assist.js (Phase 28 naturalness layer) is present with its language-refinement exports.',
  };

  const smartChipUsage = intel?.chipClicks ?? { tracked: false, note: 'not available' };

  const mentorContinuity = {
    memoryConfigured: aiSupabaseConfigured(env),
    note: 'Structural check — confirms the AI Supabase backing ai_chat_memory/ai_user_profiles (Memory/Mentor Brain, frozen) is configured.',
  };

  const marketQuestionHandling = {
    active: typeof marketDecisionInstrument === 'function' && typeof buildMarketContext === 'function'
      && typeof detectMarketWhy === 'function' && typeof buildWhyExplanation === 'function',
    note: 'Structural check — confirms market-context.js + market-explain.js (Live Price/Market Engine, frozen) are present with their educational-analysis exports.',
  };

  // Production score (0-100): weighted across activation + coverage + structural checks.
  const catCoverage = graphGrowth.categories
    ? Object.keys(articleCoverage.byCategory).length / graphGrowth.categories
    : 0;
  const productionScore =
    (active ? 20 : 0) +
    (graphGrowth.totalConcepts > 0 ? 15 : 0) +
    Math.round(Math.min(1, catCoverage) * 15) +
    (languageRouting.active ? 15 : 0) +
    (mentorContinuity.memoryConfigured ? 15 : 0) +
    (marketQuestionHandling.active ? 15 : 0) +
    (smartChipUsage.tracked ? 5 : 0);

  return {
    generatedAt: new Date().toISOString(),
    retrievalQuality,
    unknownQuestionRate,
    graphGrowth,
    articleCoverage,
    languageRouting,
    smartChipUsage,
    mentorContinuity,
    marketQuestionHandling,
    productionScore,
    note: 'Monitoring only — composes existing analytics (content-dashboard, intelligence-dashboard) plus structural presence checks on frozen systems. No automatic repairs.',
  };
}
