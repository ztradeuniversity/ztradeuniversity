// functions/utils/answer-depth.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 10.5 — ANSWER DEPTH CONTROLLER. Picks MICRO / SHORT / STANDARD / DEEP
// from the question + cognition, and maps depth → engine transform mode. Pure.
//
//   "Gold price?"            → MICRO
//   "How do I trade Gold?"   → SHORT
//   "Teach me Gold trading." → DEEP
// ════════════════════════════════════════════════════════════════════════════

const DEEP_RE  = /\b(teach me|explain everything|deep dive|full guide|comprehensive|step by step|step-by-step|roadmap|master|in depth|walk me through|complete guide)\b/;
const SHORT_RE = /\b(how do i|how can i|how to|quick|briefly|in short|tldr|short answer|simply)\b/;
const MICRO_RE = /\b(price|rate|level|quote|how much)\b/;

export function decideDepth(text, cognition) {
  const s = String(text || '').toLowerCase();
  const a = cognition._qa || {};
  const words = s.split(/\s+/).filter(Boolean).length;

  // MICRO — a single live fact (price/level), explicitly a status ask, very short.
  if (a.marketDumpAllowed && a.depth === 'short' && MICRO_RE.test(s) && words <= 7) return 'MICRO';
  // DEEP — teach / explain-everything / long.
  if (DEEP_RE.test(s) || words > 18) return 'DEEP';
  // SHORT — how-to / brief / Phase-10 short.
  if (SHORT_RE.test(s) || a.depth === 'short') return 'SHORT';
  return 'STANDARD';
}

// Map depth to the existing engine mode. DEEP/STANDARD use the builder's full
// answer (already detailed); MICRO/SHORT condense.
export function depthToMode(depth) {
  return (depth === 'MICRO' || depth === 'SHORT') ? 'short' : null;
}
