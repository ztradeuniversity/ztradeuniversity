// functions/utils/slang-normalizer.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 22 — INTENT UNDERSTANDING V2 (slang layer, STEP 3)
// Expands common trading/crypto SLANG into canonical wording so a badly-phrased
// question still classifies + retrieves correctly. Additive, in the same spirit as
// the Phase 14 recovery-engine (typos) and Phase 16 dialogue-understanding
// (indirect questions) — it only NORMALIZES the analysis text; it never rewrites
// the user's words on screen and never invents meaning.
//
// Deliberately conservative: only UNAMBIGUOUS slang is expanded. Real trading terms
// the engine already understands (long, short, pump, dump, scalp, swing) are left
// untouched to avoid any routing regression. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

// [pattern, replacement] — applied case-insensitively, word-boundaried.
const SLANG = [
  [/\bdca(?:'?d|ing|s)?\b/gi,            'dollar cost averaging'],
  [/\bbag\s?hold(?:er|ers|ing)?\b/gi,    'holding a losing position'],
  [/\bbag\s?holders?\b/gi,               'traders stuck in losing positions'],
  [/\brekt\b/gi,                         'badly lost'],
  [/\baped?\s+in\b/gi,                   'entered impulsively'],
  [/\baping\s+in\b/gi,                   'entering impulsively'],
  [/\bto\s+the\s+moon\b/gi,              'rise sharply'],
  [/\bmoon(?:ing|ed|s)?\b/gi,            'rise sharply'],
  [/\bsend\s+it\b/gi,                    'enter aggressively'],
  [/\byolo(?:'?d|ing|s)?\b/gi,           'risk everything on one trade'],
  [/\bhodl(?:ing|ed|er)?\b/gi,           'hold long term'],
  [/\bdiamond\s+hands?\b/gi,             'holding through volatility'],
  [/\bpaper\s+hands?\b/gi,               'selling too early in fear'],
  [/\bblew?\s+(?:my|the)\s+(?:account|acc)\b/gi, 'lost my whole account'],
  [/\bblown\s+(?:account|acc)\b/gi,      'lost whole account'],
  [/\bport(?:folio)?\s+is\s+red\b/gi,    'portfolio is in loss'],
  [/\bgreen\s+candles?\b/gi,             'rising price'],
  [/\bred\s+candles?\b/gi,               'falling price'],
  [/\bgm\b/gi,                           'good morning'],
  // common abbreviations the educational layer benefits from expanding
  [/\bt\/?p\b/gi,                        'take profit'],
  [/\bs\/?l\b/gi,                        'stop loss'],
  [/\br[:\/]r\b/gi,                      'risk reward'],
];

// Returns { text, changed }. `text` is the slang-normalized analysis text.
export function normalizeSlang(text) {
  const raw = String(text || '');
  let out = raw;
  for (const [re, rep] of SLANG) out = out.replace(re, rep);
  // collapse any double spaces introduced by replacement
  out = out.replace(/\s{2,}/g, ' ').trim();
  return { text: out, changed: out.toLowerCase() !== raw.trim().toLowerCase() };
}
