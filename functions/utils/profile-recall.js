// functions/utils/profile-recall.js
// ════════════════════════════════════════════════════════════════════════════
// PROFILE RECALL (Phase 8C) — normalize what we KNOW about a trader from the
// device profile (ai_user_profiles) + live traderContext + recent chat recap,
// into one shape the response builders (English + localized) render from.
// Pure (no I/O). Never exposes raw score numbers to the user — only labels.
// ════════════════════════════════════════════════════════════════════════════

const PSYCH = [
  ['fomo_score', 'FOMO'],
  ['fear_score', 'Fear'],
  ['revenge_score', 'Revenge trading'],
  ['hesitation_score', 'Hesitation'],
  ['overtrading_score', 'Overtrading'],
];

export function readProfileFacts(ctx = {}) {
  const p  = ctx.memoryData?.profile || {};
  const tc = ctx.traderContext || {};

  const psych = [];
  for (const [k, label] of PSYCH) if ((p[k] ?? 0) > 2) psych.push(label);

  const strengths  = ((p.strengths && p.strengths.length)  ? p.strengths  : (tc.strengths  || [])).slice(0, 4);
  const weaknesses = ((p.weaknesses && p.weaknesses.length) ? p.weaknesses : (tc.weaknesses || [])).slice(0, 4);

  const facts = {
    level:        p.trader_level        || tc.level || null,
    style:        p.trading_style       || tc.type  || null,
    instrument:   p.favorite_instrument || null,
    convs:        p.conversation_count ?? tc.conversations ?? null,
    psych,
    strengths,
    weaknesses,
    recentTopics: Array.isArray(ctx.recentRecap) ? ctx.recentRecap.filter(Boolean).slice(0, 4) : [],
  };

  facts.hasData = !!(
    facts.level || facts.style || facts.instrument ||
    psych.length || strengths.length || weaknesses.length ||
    (facts.convs && facts.convs > 0) || facts.recentTopics.length
  );
  return facts;
}
