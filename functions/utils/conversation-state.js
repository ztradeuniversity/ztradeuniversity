// functions/utils/conversation-state.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.1 — CONVERSATION INTELLIGENCE. Derives the active thread from the
// message history (server-side, no DB) and resolves pronouns / vague references
// to the most recent valid context so "how should I trade it?" knows "it"=Gold.
// Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

const INSTR = [
  [/\b(gold|xau|xauusd)\b/i, 'Gold'],
  [/\b(btc|bitcoin|bit ?coin)\b/i, 'BTC'],
];
const PRONOUN = /\b(it|that|this|these|those|them)\b/i;
const VAGUE   = /\b(improve|get better|do better|fix this|what should i do|how do i get better|help me improve|be better|become better)\b/i;

function instrumentIn(t) {
  for (const [re, v] of INSTR) if (re.test(t || '')) return v;
  return null;
}

// Walk the prior turns (newest first) to find the active instrument/topic.
export function buildConversationState(messages = []) {
  const prior = Array.isArray(messages) ? messages.slice(0, -1) : [];
  let activeInstrument = null;
  for (let i = prior.length - 1; i >= 0; i--) {
    const inst = instrumentIn(prior[i]?.content || '');
    if (inst) { activeInstrument = inst; break; }
  }
  return { activeInstrument };
}

// If the current message uses a pronoun / vague "improve" with NO explicit
// instrument, attach the carried instrument so downstream classification sees it.
// Returns { text, changed, instrument, carried }.
export function resolveReferences(text, state = {}, profile = null) {
  const t = String(text || '');
  if (instrumentIn(t)) return { text: t, changed: false, instrument: instrumentIn(t), carried: false };

  if (PRONOUN.test(t) || VAGUE.test(t)) {
    const inst = state.activeInstrument || profile?.favorite_instrument || null;
    if (inst) return { text: `${t} (about ${inst})`, changed: true, instrument: inst, carried: true };
  }
  return { text: t, changed: false, instrument: null, carried: false };
}
