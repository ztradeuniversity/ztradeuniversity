// functions/utils/dialogue-understanding.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 16 — DEEP QUESTION UNDERSTANDING (STEP 1 / STEP 4)
// Catches the indirect / hypothetical / conditional follow-ups that the earlier
// layers don't:
//   • Phase 11A.1 conversation-state → pronoun / "improve" → instrument
//   • Phase 14 recovery-engine       → typos / sentence fragments
// This adds the human cases between them:
//   "and if gold goes up?"  ·  "what would you do?"  ·  "is that good or bad?"
// It ENRICHES the analysis text (so classification carries the active topic +
// scenario) — it never rewrites the user's words and never fabricates a topic.
// When there's genuinely no context to anchor to, it flags 'needs-context' so the
// mentor can ask naturally instead of guessing (STEP 4). Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// Indirect / hypothetical / opinion-seeking follow-up shapes.
const HYPOTHETICAL = /\b(what|how)\s+(if|about|would|happens? if)\b/i;
const CONDITIONAL  = /\b(if|when|suppose|what if)\b.*\b(goes?|moves?|rises?|drops?|falls?|breaks?|pumps?|crashes?|up|down|higher|lower|reverses?)\b/i;
const OPINION_ASK  = /\b(what would you do|what do you think|would you|your opinion|your take|good or bad|right or wrong|is that (ok|okay|safe|fine|good|bad)|does that make sense|am i (right|wrong))\b/i;
const SHORT_FOLLOW = /^(and|so|but|ok(ay)?|then|also|what about|how about)\b/i;

// Scenario hint extracted from a conditional (kept tiny + whitelisted = Lang-Lock safe).
function scenarioHint(s) {
  if (/\b(up|higher|rises?|pumps?|breaks? (out|up)|goes? up)\b/i.test(s)) return 'a move higher';
  if (/\b(down|lower|drops?|falls?|crashes?|breaks? down|goes? down)\b/i.test(s)) return 'a move lower';
  if (/\b(reverses?|reversal|turns?)\b/i.test(s)) return 'a reversal';
  return '';
}

const INSTR = [
  [/\b(gold|xau)\b/i, 'Gold'],
  [/\b(btc|bitcoin|bit ?coin)\b/i, 'BTC'],
];
function instrumentIn(t) { for (const [re, v] of INSTR) if (re.test(t || '')) return v; return null; }

// Find the active topic to anchor an indirect follow-up: the current text first,
// then the last assistant turn, then the most recent prior user/assistant turn.
function resolveActiveTopic({ text, lastAssistant, messages, activeInstrument }) {
  let t = instrumentIn(text);
  if (t) return t;
  if (activeInstrument) return activeInstrument;
  t = instrumentIn(lastAssistant);
  if (t) return t;
  const arr = Array.isArray(messages) ? messages : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const inst = instrumentIn(arr[i]?.content || '');
    if (inst) return inst;
  }
  return null;
}

// Returns { enrichedText, changed, kind }
//   kind: 'indirect' (enriched), 'needs-context' (matched but nothing to anchor), '' (no match)
export function interpretIndirect({ text, lastAssistant = '', messages = [], activeInstrument = null } = {}) {
  const raw = String(text || '');
  const s = raw.toLowerCase();

  const looksIndirect =
    OPINION_ASK.test(s) ||
    (HYPOTHETICAL.test(s) && raw.split(/\s+/).filter(Boolean).length <= 9) ||
    CONDITIONAL.test(s) ||
    (SHORT_FOLLOW.test(s) && raw.split(/\s+/).filter(Boolean).length <= 8);

  if (!looksIndirect) return { enrichedText: raw, changed: false, kind: '' };

  // If the message already names an instrument explicitly, classification is fine.
  const alreadyExplicit = !!instrumentIn(raw);

  const topic = resolveActiveTopic({ text: raw, lastAssistant, messages, activeInstrument });
  if (!topic) {
    // Indirect but unanchored → let the mentor ask for context (STEP 4), don't guess.
    return { enrichedText: raw, changed: false, kind: 'needs-context' };
  }

  const scen = scenarioHint(s);
  // When the instrument is already named AND there's no scenario/opinion angle,
  // classification is already correct — don't add a redundant "(about X)" tag.
  if (alreadyExplicit && !OPINION_ASK.test(s) && !scen) {
    return { enrichedText: raw, changed: false, kind: '' };
  }

  // Explicit instrument + a conditional ("if gold goes up?") → keep the scenario,
  // skip the redundant topic tag. Otherwise anchor the topic (+ scenario if any).
  const suffix = alreadyExplicit
    ? ` (scenario: ${scen})`
    : (scen ? ` (follow-up about ${topic} — scenario: ${scen})` : ` (follow-up about ${topic})`);
  return { enrichedText: raw + suffix, changed: true, kind: 'indirect' };
}

// ── STEP 4 — natural "give me a little more context" (never hallucinate) ──────
const NEED_CONTEXT = {
  en: [
    "I want to point you the right way — could you give me a little more context on what you mean?",
    "I'd rather not guess here. A bit more detail and I can guide you properly — what are you looking at?",
    "Tell me a little more so I can be useful — are you asking about a specific instrument or setup?",
  ],
  ur: [
    "میں درست رہنمائی دینا چاہتا ہوں — تھوڑا مزید بتائیں آپ کا مطلب کیا ہے؟",
    "میں اندازہ نہیں لگانا چاہتا۔ تھوڑی تفصیل دیں تو بہتر رہنمائی کر سکوں — آپ کیا دیکھ رہے ہیں؟",
  ],
  'ur-roman': [
    "Main durust rahnumai dena chahta hoon — thoda mazeed bataein aap ka matlab kya hai?",
    "Main andaza nahi lagana chahta. Thodi tafseel dein to behtar rahnumai kar sakoon — aap kya dekh rahe hain?",
  ],
  ar: [
    "أريد أن أوجّهك بشكل صحيح — هل يمكنك إعطائي مزيداً من السياق حول ما تقصده؟",
    "أفضّل ألا أخمّن هنا. تفاصيل أكثر قليلاً وسأرشدك جيداً — ما الذي تنظر إليه؟",
  ],
};

export function needContextLine(lang = 'en', seed = '') {
  const arr = NEED_CONTEXT[lang] || NEED_CONTEXT.en;
  return vary(arr, seed || 'ctx');
}
