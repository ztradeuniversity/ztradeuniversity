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
  [/\b(no discipline|undisciplined|break my rules|keep breaking|can'?t stick to|can'?t follow my (rules|plan|system)|don'?t follow my (rules|plan)|cannot follow my)\b/i,           { need: 'discipline', intent: 'psychology' }],
  // Trader-problem (process) signals — the issue is execution, not the setup.
  [/\b(strategy but (i )?(still )?(lose|fail|losing|failing)|know.{0,15}strategy.{0,15}(but|yet).{0,15}(lose|fail|losing|failing)|fail despite|keep failing|inconsistent|not consistent|lack of consistency|no consistency)\b/i, { need: 'why-losing', intent: 'whylosing' }],
  [/\b(don'?t journal|no journal(ing)?|not journaling|never journal|stopped journaling)\b/i,                                                       { need: 'discipline', intent: 'psychology' }],
  [/\b(i am emotional|i'?m emotional|i get emotional|emotional (while|when) trading|trade emotionally|let emotions)\b/i,                            { need: 'psychology', intent: 'psychology' }],
  [/\b(how much (can|do) i (make|earn)|get rich|become (rich|a millionaire|wealthy)|financial freedom|quit my job|live off trading)\b/i,          { need: 'wealth',     intent: 'career' }],
];

export function detectUnderlyingNeed(text) {
  const s = String(text || '');
  for (const [re, out] of NEEDS) {
    if (re.test(s)) return { found: true, surface: s.slice(0, 80), ...out };
  }
  return { found: false };
}
