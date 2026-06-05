// functions/utils/adaptive-response.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.2 — ADAPTIVE RESPONSE. Finally USES the signals cognition already
// detects: emotional tone (calm/supportive lead, no motivational fluff) and
// trader level (advanced → terser). Pure (no I/O), Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

// One short, grounded, mentor-like lead. NO emojis, NO hype. Only for the
// tones that warrant reassurance (frustrated / anxious|confused|fearful).
const LEAD = {
  frustrated: {
    en:         "I hear you — losing stretches happen to everyone, and they're fixable.",
    ur:         "میں سمجھتا ہوں — ہارنے کا دور سب پر آتا ہے، اور اسے ٹھیک کیا جا سکتا ہے۔",
    'ur-roman': "Main samajhta hoon — haarne ka daur sab par aata hai, aur ise theek kiya ja sakta hai.",
    ar:         "أتفهّم تماماً — فترات الخسارة تحدث للجميع، ويمكن إصلاحها.",
  },
  anxious: {
    en:         "Take a breath — let's work through this calmly, step by step.",
    ur:         "ایک گہری سانس لیں — آئیے اسے سکون سے، قدم بہ قدم دیکھتے ہیں۔",
    'ur-roman': "Ek gehri saans lein — aayiye ise sukoon se, qadam ba qadam dekhte hain.",
    ar:         "خذ نفساً عميقاً — لنفكّر في الأمر بهدوء، خطوة بخطوة.",
  },
};

// Returns a localized lead sentence ('' for neutral/curious/excited).
export function emotionalLead(cognition, lang = 'en') {
  const tone = cognition?.emotionalTone;
  const m = LEAD[tone];
  if (!m) return '';
  return m[lang] || m.en;
}

// Level adaptation: advanced traders get a terser answer (condense) when no
// mode is already set; beginners/intermediate keep the full educational body.
export function levelMode(cognition, currentMode) {
  if (currentMode) return currentMode;
  if (cognition?.userLevel === 'advanced') return 'short';
  return currentMode;
}
