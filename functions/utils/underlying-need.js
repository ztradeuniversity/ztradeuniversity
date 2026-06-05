// functions/utils/underlying-need.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.3 (Part 2) — HUMAN MENTOR REASONING. Looks past the surface words to
// the real need. "I lost my account" isn't a data question — it's psychology +
// recovery + risk. Maps the underlying need to the most helpful intent. Pure.
// ════════════════════════════════════════════════════════════════════════════

const NEEDS = [
  [/\b(lost|blew|blown|blow|blowing|wiped|wiped out|destroyed|drained|gone) (my |the |all my )?(account|capital|money|funds|savings|deposit|balance)\b/i, { need: 'recovery',   intent: 'whylosing' }],
  [/\b(keep losing|always lose|always losing|can'?t win|not profitable|losing money|losing trades|lose every|down bad)\b/i,                      { need: 'why-losing', intent: 'whylosing' }],
  [/\b(scared|afraid|terrified|nervous|anxious|can'?t pull the trigger|hesitat|freeze up)\b/i,                                                    { need: 'psychology', intent: 'psychology' }],
  [/\b(revenge|angry|tilt|emotional|fomo|greedy|over ?trad|chasing)\b/i,                                                                          { need: 'psychology', intent: 'psychology' }],
  [/\b(no discipline|undisciplined|break my rules|keep breaking|can'?t stick to)\b/i,                                                             { need: 'discipline', intent: 'psychology' }],
  [/\b(how much (can|do) i (make|earn)|get rich|become (rich|a millionaire|wealthy)|financial freedom|quit my job|live off trading)\b/i,          { need: 'wealth',     intent: 'career' }],
];

export function detectUnderlyingNeed(text) {
  const s = String(text || '');
  for (const [re, out] of NEEDS) {
    if (re.test(s)) return { found: true, surface: s.slice(0, 80), ...out };
  }
  return { found: false };
}
