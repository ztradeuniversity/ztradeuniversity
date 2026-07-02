// functions/utils/evolution-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 26 — AI SELF-EVOLUTION ENGINE
// Turns the EXISTING knowledge-gap analytics (kb_missing, logged by Phase 11B.2
// and surfaced today via /api/ai-kb-admin?action=analytics) into a prioritized,
// admin-facing improvement plan: which concepts / articles / missions / practice /
// exams to author next, ranked by how often students actually hit the gap.
//
// It ONLY RECOMMENDS — it never writes production content (STEP 4). It reuses the
// existing analytics source (getMissingKnowledge) and the existing graph/authoring
// pipeline; nothing here is auto-published. Pure logic over the analytics it reads.
// ════════════════════════════════════════════════════════════════════════════

import { getMissingKnowledge, graphActive } from './kb-store.js';

// Build the prioritized evolution report from logged knowledge gaps.
// recommendations are SUGGESTIONS for an admin/author — never executed.
export async function buildEvolutionReport(env, { limit = 100, topN = 8 } = {}) {
  const active = graphActive(env);
  let missing = [];
  try { missing = await getMissingKnowledge(env, { limit }); } catch { missing = []; }

  if (!missing.length) {
    return {
      active, totalGaps: 0, categories: 0,
      recommendations: [],
      summary: 'No knowledge gaps logged yet — nothing to evolve. The mentor logs gaps automatically as students ask unanswered questions.',
    };
  }

  // Cluster gaps by category, summing frequency (STEP 1 + STEP 3 prioritization).
  const byCategory = {};
  const sampleByCat = {};
  for (const m of missing) {
    const c = m.category || 'uncategorized';
    byCategory[c] = (byCategory[c] || 0) + (m.frequency || 1);
    if (!sampleByCat[c]) sampleByCat[c] = [];
    if (sampleByCat[c].length < 3 && m.question) sampleByCat[c].push(m.question);
  }

  const totalFreq = Object.values(byCategory).reduce((s, n) => s + n, 0) || 1;
  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, topN);

  // STEP 2 — one consolidated recommendation per high-frequency gap, spanning every
  // content type (concept → article → mission → practice → exam). All are proposals.
  const recommendations = ranked.map(([category, frequency], i) => ({
    rank: i + 1,
    category,
    frequency,
    priority: frequency >= Math.max(3, totalFreq * 0.15) ? 'high' : frequency >= 2 ? 'medium' : 'low',
    sampleQuestions: sampleByCat[category] || [],
    recommend: {
      concept:  `Author a graph concept covering the most-missed "${category}" questions`,
      article:  `Publish an SEO article on "${category}" (approval auto-creates a graph concept)`,
      mission:  `A mentor mission auto-generates once the "${category}" concept is published`,
      practice: `Practice exercises auto-generate from the new "${category}" concept`,
      exam:     `Exam questions auto-include the new "${category}" concept at its level`,
    },
  }));

  return {
    active,
    totalGaps: missing.length,
    categories: Object.keys(byCategory).length,
    gapsByCategory: byCategory,
    recommendations,
    summary: `${missing.length} gaps across ${Object.keys(byCategory).length} categories. Author for the ${ranked.length} highest-frequency areas first; all content types then generate from the published concept. Recommendations only — nothing is auto-written.`,
    note: 'STEP 4 safety: this engine never auto-writes production content. An admin/author reviews and publishes through the existing KOS pipeline.',
  };
}
