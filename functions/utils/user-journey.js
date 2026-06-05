// functions/utils/user-journey.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11B.2 — USER JOURNEY GRAPH. Infers where a trader sits on the path:
//   greeting → beginner → learning → strategy → execution → assessment →
//   consistency → profitability
// so the engagement graph / Composer can pick a natural next-best-action that
// fits the person (not a generic menu). Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

export const JOURNEY_STAGES = Object.freeze([
  'greeting', 'beginner', 'learning', 'strategy', 'execution', 'assessment', 'consistency', 'profitability',
]);

export function inferJourneyStage(profile = {}, traderContext = {}) {
  const level = profile.trader_level || traderContext.level || null;
  const convs = profile.conversation_count ?? traderContext.conversations ?? 0;
  const verified = profile.access_tier === 'unlimited' || profile.is_verified;

  if (!level && convs <= 1) return 'greeting';
  if (level === 'advanced') return verified ? 'profitability' : 'consistency';
  if (level === 'intermediate') return convs >= 6 ? 'assessment' : 'strategy';
  // beginner / unknown: progress by engagement depth
  if (convs >= 8) return 'execution';
  if (convs >= 3) return 'learning';
  return 'beginner';
}

// The concept/topic focus that most helps someone at a given stage (used by the
// engagement graph + Composer to choose a guidance direction).
const STAGE_FOCUS = {
  greeting:      'getting-started',
  beginner:      'beginner-learning',
  learning:      'risk-management',
  strategy:      'strategy-selection',
  execution:     'entry-confirmation',
  assessment:    'trade-assessment',
  consistency:   'trading-psychology',
  profitability: 'performance-review',
};
export function stageFocus(stage) { return STAGE_FOCUS[stage] || 'beginner-learning'; }
