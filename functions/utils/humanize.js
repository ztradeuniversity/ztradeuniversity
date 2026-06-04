// functions/utils/humanize.js
// ════════════════════════════════════════════════════════════════════════════
// HUMANIZED RESPONSE LAYER (Phase 8E) — small, deterministic phrasing variation
// so conversational replies (profile acknowledgements, fallback, redirects)
// don't read identically every time. Pure + tiny; no LLM, no I/O.
//
// Deterministic per message (seeded by the user's text) so a single render is
// stable and testable — not random.
// ════════════════════════════════════════════════════════════════════════════

export function vary(options, seed = '') {
  if (!Array.isArray(options) || !options.length) return '';
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

// English conversational openers (used by the new 8E builders).
export const ACK_OPENERS = ['Got it', 'Noted', 'Perfect', 'Good to know', 'Thanks for telling me'];
export const FB_OPENERS  = ['I want to make sure I answer the right thing', "Let's aim this the right way", 'Happy to help — let me point you right'];
