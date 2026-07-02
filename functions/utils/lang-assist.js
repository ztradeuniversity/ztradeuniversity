// functions/utils/lang-assist.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 28 — MULTI-LANGUAGE ASSIST (residual gaps only)
// The Language Lock (intent-engine.detectLanguage), Phase 20 unsupported-language
// handling, and Phase 22 slang-normalizer already cover most multilingual cases.
// This adds ONLY what they don't:
//   • the "BE / B/E" (breakeven) shorthand Phase 22 doesn't expand, and
//   • a small Roman-Urdu trading vocabulary (khareedna→buy, bechna→sell,
//     nuksan→loss, munafa→profit, …) so MIXED / broken-grammar messages still
//     classify to the right intent.
//
// It ONLY normalizes the ANALYSIS text used for classification — never the reply
// language, which stays whatever detectLanguage chose (Language Lock preserved).
// Conservative + word-boundaried to avoid touching real English words. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

// [pattern, replacement] — applied case-insensitively. Deliberately NARROW:
// only tokens that are unambiguous in a trading context.
const MAP = [
  // breakeven shorthand (the slash form is unambiguous; bare "be" is left alone)
  [/\bb\s*\/\s*e\b/gi,                  'breakeven'],
  [/\bb\.e\.?\b/gi,                     'breakeven'],
  [/\bmove(d)?\s+to\s+be\b/gi,          'move to breakeven'],
  [/\bbreak\s?even\b/gi,                'breakeven'],
  // Roman-Urdu trading verbs / terms (not English words → safe to expand)
  [/\bkhar(ee|i)d(un|na|o|en|ein)?\b/gi, 'buy'],
  [/\bkharidna\b/gi,                    'buy'],
  [/\bbech(un|na|o|en|ein|na)?\b/gi,    'sell'],
  [/\bnuksan\b/gi,                      'loss'],
  [/\b(munafa|munaafa|nafa)\b/gi,       'profit'],
  [/\bsauda\b/gi,                       'trade'],
  [/\bkitna\s+(hona|rakhna)\b/gi,       'how much should be'],
];

// Returns { text, changed }. `text` is the normalized ANALYSIS text only.
export function normalizeMultilang(text) {
  const raw = String(text || '');
  let out = raw;
  for (const [re, rep] of MAP) out = out.replace(re, rep);
  out = out.replace(/\s{2,}/g, ' ').trim();
  return { text: out, changed: out.toLowerCase() !== raw.trim().toLowerCase() };
}

// HIGH-CONFIDENCE Roman-Urdu markers — distinctive words that are not English, so a
// SINGLE one is a strong signal (the Language-Lock detector needs ≥2, which misses
// short mixed messages like "gold buy karun?" or "stop loss kitna hona chahiye").
const RU_STRONG = /\b(karun|karoon|karna|kitna|kitni|hona|chahiye|chahye|kaise|kaisa|kaisay|kyun|kyon|mujhe|mujhy|batao|btao|bta|nahi|nahin|khareed\w*|kharid\w*|bech\w*|nuksan|munafa|sauda|abhi|kya|kaisi)\b/i;

// Additive language refinement: when the Language Lock defaulted to English but the
// message clearly carries Roman-Urdu trading phrasing, upgrade to 'ur-roman' so the
// reply matches the user's actual language. Never downgrades a non-English detection.
export function refineLanguage(text, detected) {
  if (detected && detected !== 'en') return detected;     // trust a non-English detection
  return RU_STRONG.test(String(text || '')) ? 'ur-roman' : (detected || 'en');
}
