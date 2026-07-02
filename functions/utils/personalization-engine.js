// functions/utils/personalization-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PERSONALIZED RESPONSE ENGINE (Module 7) + MEMORY INTEGRATION MAP (Module 8)
// ARCHITECTURE / FOUNDATION ONLY — nothing existing is modified or connected.
//
// M7: turns a trader profile (experience / style / weaknesses / strengths /
//     psychology) into RESPONSE DIRECTIVES (depth, tone, what to emphasise/avoid)
//     that a FUTURE wiring step can hand to the existing decorators
//     (response-engine.levelNote / buildCoachIntro) — without changing them now.
//
// M8: maps every Phase Next+3 module to the EXISTING canonical AI tables only.
//     No new tables. No Supabase connection. AI_SUPABASE_* env names unchanged.
// ════════════════════════════════════════════════════════════════════════════

// ── MODULE 7 — RESPONSE DIRECTIVES ───────────────────────────────────────────
// Pure: given a trader profile, return how the AI should shape its reply.
export function personalizationDirectives(profile = {}, intel = {}) {
  const exp = profile.experience || 'beginner';

  const depthByExp = {
    beginner:     { depth: 'simple',       jargon: 'avoid', examples: 'everyday analogies', length: 'short-medium' },
    intermediate: { depth: 'balanced',     jargon: 'some',  examples: 'concrete chart terms', length: 'medium' },
    advanced:     { depth: 'professional', jargon: 'full',  examples: 'precise structure + macro confluence', length: 'concise-dense' },
  };
  const base = depthByExp[exp] || depthByExp.beginner;

  // Tone shaped by detected behaviour/psychology
  let tone = 'mentor';
  const beh = profile.behavioral || [];
  if (beh.includes('emotional-trader')) tone = 'calm, psychology-first';
  else if (beh.includes('overtrader'))  tone = 'firm, discipline-first';
  else if (profile.style === 'funded-candidate') tone = 'rules-first, drawdown-aware';

  const emphasise = [];
  const avoid = [];
  if (intel.topWeaknessKey) emphasise.push(`address weakness: ${intel.topWeaknessKey}`);
  if (beh.includes('emotional-trader')) { emphasise.push('risk control & mindset before setups'); }
  if (beh.includes('overtrader')) { emphasise.push('fewer, higher-quality setups'); avoid.push('encouraging more frequent trading'); }
  if (exp === 'beginner') { avoid.push('heavy jargon', 'over-detailed macro'); }
  avoid.push('any buy/sell signal or guaranteed direction'); // permanent guardrail

  return {
    experience: exp,
    style: profile.style || null,
    depth: base.depth,
    jargon: base.jargon,
    exampleStyle: base.examples,
    length: base.length,
    tone,
    emphasise,
    avoid,
    // How a future wiring step applies this without touching existing engines:
    applyVia: ['response-engine.levelNote', 'psychology-engine.buildCoachIntro', 'TYPE_LINE'],
  };
}

// Convenience: example contrast (documentation of the intended effect).
export const PERSONALIZATION_EXAMPLES = {
  beginner: 'simple, jargon-free, one clear takeaway + a protective-risk reminder',
  advanced: 'professional, dense, assumes structure/macro literacy, skips basics',
};

// ── MODULE 8 — MEMORY INTEGRATION MAP (existing canonical tables ONLY) ───────
export const TRADER_INTEL_TABLE_MAP = {
  'M1 Profiling':       { reads: ['ai_chat_memory', 'ai_user_profiles'], writes: ['ai_user_profiles'], fields: ['trader_level', 'trader_type', 'trading_style'] },
  'M2 Weakness':        { reads: ['ai_chat_memory'],                     writes: ['ai_user_profiles'], fields: ['weaknesses[]'] },
  'M3 Strength':        { reads: ['ai_chat_memory', 'ai_user_profiles'], writes: ['ai_user_profiles'], fields: ['strengths[]'] },
  'M4 Psychology':      { reads: ['ai_chat_memory'],                     writes: ['ai_user_profiles', 'ai_chat_memory'], fields: ['psychology_score', 'category=psychology'] },
  'M5 Evolution':       { reads: ['ai_user_profiles'],                   writes: [], fields: ['discipline/patience/confidence/risk/psychology scores over time'] },
  'M6 Learning Path':   { reads: ['ai_user_profiles'],                   writes: [], also: ['ai_articles via retrieval-engine for recommended reading'] },
  'M7 Personalization': { reads: ['ai_user_profiles'],                   writes: [], note: 'directives only — applied via existing decorators' },
};

// No new tables are introduced. All persistence (future) is gated by the
// shared guard and uses the dedicated ZTU Chatbot env vars.
export const PERSISTENCE_RULE = {
  newTables: 'NONE — uses only the 7 canonical tables',
  connected: false,
  env: ['AI_SUPABASE_URL', 'AI_SUPABASE_ANON_KEY', 'AI_SUPABASE_SERVICE_KEY'],
  project: 'ZTU Chatbot',
};
