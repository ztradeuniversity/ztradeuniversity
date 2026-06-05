// functions/utils/confidence-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 10.5 — CONFIDENCE SYSTEM. The AI must not fake certainty. Decision/advice
// questions ("should I buy Gold?") missing timeframe/entry/risk → low confidence
// → ONE short clarification question (no long answer). Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

// NOTE: price-prediction phrasing ("will Gold rise?") is intentionally NOT here —
// that's handled as LOW knowledge-confidence (no certainty), not a clarification.
const DECISION = /\b(should i (buy|sell|enter|trade|hold|exit|go (long|short))|is it (a )?good time to (buy|sell|enter)|worth (buying|selling))\b/;
// Specifics that make the question answerable (so we DON'T over-clarify).
const HAS_SPECIFIC = /\b(\d{2,}|timeframe|m1|m5|m15|m30|h1|h4|daily|weekly|entry|stop|sl|tp|take profit|risk|scalp|swing|intraday|position size|lot)\b/;

const CLARIFY = {
  direction: {
    en:         "Quick one first — are you trading this short-term (scalp/intraday) or as a longer swing? That changes what actually matters here.",
    ur:         "پہلے ایک چھوٹا سوال — آپ یہ short-term (scalp/intraday) کر رہے ہیں یا longer swing؟ اسی سے طے ہوتا ہے کہ کیا اہم ہے۔",
    'ur-roman': "Pehle ek chhota sawal — aap ye short-term (scalp/intraday) kar rahe hain ya longer swing? Isi se tay hota hai ke kya ahem hai.",
    ar:         "سؤال سريع أولاً — هل تتداول هذا على المدى القصير (scalp/intraday) أم كـ swing أطول؟ هذا يغيّر ما يهم فعلاً.",
  },
  ambiguous: {
    en:         "Just so I point you the right way — what would you like to focus on: **Gold**, **BTC**, a **trade setup**, or **trading psychology**?",
    ur:         "تاکہ میں درست رہنمائی دوں — آپ کس پر فوکس کرنا چاہیں گے: **Gold**، **BTC**، ایک **trade setup**، یا **trading psychology**؟",
    'ur-roman': "Taake main durust rahnumai doon — aap kis par focus karna chahenge: **Gold**, **BTC**, ek **trade setup**, ya **trading psychology**?",
    ar:         "حتى أوجّهك بشكل صحيح — على ماذا تريد التركيز: **Gold**، **BTC**، **إعداد صفقة**، أو **سيكولوجيا التداول**؟",
  },
};
const pick = (m, lang) => m[lang] || m.en;

export function assessConfidence(text, cognition, lang = 'en') {
  const s = String(text || '').toLowerCase();
  const qaa = cognition?._qa || {};
  let confidence = cognition.confidence || 'high';
  let requiresClarification = false;
  let clarificationQuestion = '';

  // A multi-question that includes a real status ask ("Gold price AND should I…")
  // is handled by the multi-question planner (status line + guardrail), not by a
  // clarification prompt.
  const multiStatus = !!(qaa.multi && qaa.statusInstrument);

  // "how should I trade…" is a METHOD question, not a buy/sell decision — don't clarify those.
  const isMethodQuestion = /\bhow\b/.test(s);
  if (DECISION.test(s) && !isMethodQuestion && !HAS_SPECIFIC.test(s) && !multiStatus) {
    confidence = 'low';
    requiresClarification = true;
    clarificationQuestion = pick(CLARIFY.direction, lang);
  } else if (cognition.ambiguity === 'high') {
    confidence = 'low';
    requiresClarification = true;
    clarificationQuestion = pick(CLARIFY.ambiguous, lang);
  }

  return { confidence, requiresClarification, clarificationQuestion };
}
