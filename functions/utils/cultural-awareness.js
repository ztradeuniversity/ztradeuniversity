// functions/utils/cultural-awareness.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.5 — CULTURAL & RELIGIOUS AWARENESS. The ZTU audience is heavily
// Muslim (PK/ID/MY/AE/SA/BD/EG). Islamic-finance questions (halal? riba?
// swap-free?) are common and must be answered respectfully and EDUCATIONALLY —
// never as a religious ruling (fatwa). Pure detector (no I/O).
// ════════════════════════════════════════════════════════════════════════════

// High-precision: avoids "interest rate" (macro) by requiring "interest-free".
const ISLAMIC = /\b(halal|haram|riba|usury|shariah|sharia|islamic (accounts?|trading|finance|forex)|swap[- ]?free|interest[- ]?free|is (forex|trading|gold|crypto|bitcoin|it) halal)\b/i;
const SWAPFREE = /\b(swap[- ]?free|islamic accounts?|interest[- ]?free)\b/i;
const RIBA     = /\b(riba|usury)\b/i;

export function detectCulturalContext(text) {
  const s = String(text || '');
  if (!ISLAMIC.test(s)) return { found: false };
  const subtype = SWAPFREE.test(s) ? 'swap-free' : RIBA.test(s) ? 'riba' : 'permissibility';
  return { found: true, topic: 'islamic-finance', subtype };
}
