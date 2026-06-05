// functions/utils/adaptive-response.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.2 — ADAPTIVE RESPONSE. Finally USES the signals cognition already
// detects: emotional tone (calm/supportive lead, no motivational fluff) and
// trader level (advanced → terser). Pure (no I/O), Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// Short, grounded, mentor-like leads. NO hype. Multiple variants per tone so
// consecutive turns don't repeat the same phrase (Phase 11B.2 emotional graph).
const LEAD = {
  frustrated: {
    en:         ["I hear you — losing stretches happen to everyone, and they're fixable.", "Losing runs are part of every trader's story, and they pass. Let's work it through."],
    ur:         ["میں سمجھتا ہوں — ہارنے کا دور سب پر آتا ہے، اور اسے ٹھیک کیا جا سکتا ہے۔"],
    'ur-roman': ["Main samajhta hoon — haarne ka daur sab par aata hai, aur ise theek kiya ja sakta hai."],
    ar:         ["أتفهّم تماماً — فترات الخسارة تحدث للجميع، ويمكن إصلاحها."],
  },
  anxious: {
    en:         ["Take a breath — let's work through this calmly, step by step.", "No rush — we'll think this through calmly together."],
    ur:         ["ایک گہری سانس لیں — آئیے اسے سکون سے، قدم بہ قدم دیکھتے ہیں۔"],
    'ur-roman': ["Ek gehri saans lein — aayiye ise sukoon se, qadam ba qadam dekhte hain."],
    ar:         ["خذ نفساً عميقاً — لنفكّر في الأمر بهدوء، خطوة بخطوة."],
  },
  overwhelmed: {
    en:         ["That's completely normal when you're starting — let's cut it down to one step at a time.", "No need to feel buried — we'll take this one simple piece at a time. You're asking the right questions."],
    ur:         ["یہ شروع میں بالکل فطری ہے — آئیے اسے ایک وقت میں ایک قدم تک محدود کرتے ہیں۔ آپ درست سوال پوچھ رہے ہیں۔"],
    'ur-roman': ["Ye shuru mein bilkul fitri hai — aayiye ise ek waqt mein ek qadam tak mehdood karte hain. Aap durust sawal pooch rahe hain."],
    ar:         ["هذا طبيعي تماماً في البداية — لنبسّطه خطوة واحدة في كل مرة. أنت تطرح الأسئلة الصحيحة."],
  },
};

// Returns a localized lead sentence ('' for neutral/curious/excited). `seed`
// (the user's text) deterministically varies the phrasing to avoid repetition.
export function emotionalLead(cognition, lang = 'en', seed = '') {
  const tone = cognition?.emotionalTone;
  const m = LEAD[tone];
  if (!m) return '';
  const arr = m[lang] || m.en;
  return vary(arr, seed || tone);
}

// Level adaptation: advanced traders get a terser answer (condense) when no
// mode is already set; beginners/intermediate keep the full educational body.
export function levelMode(cognition, currentMode) {
  if (currentMode) return currentMode;
  if (cognition?.userLevel === 'advanced') return 'short';
  return currentMode;
}
