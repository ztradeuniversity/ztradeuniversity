// functions/utils/teaching-style.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 16 — HUMAN TEACHING STYLE (STEP 2 / 5 / 6)
// A real mentor doesn't explain everything the same way. This picks a teaching
// MODE per turn (simple · analogy · step-by-step · socratic · challenge) from the
// student's level + the question's cognition, then offers a small, VARIED, often-
// silent decoration (a framing lead or a think-prompt tail). It NEVER rewrites the
// grounded answer — it only frames it more like a human would.
//
// One consistent mentor: the level only shifts EMPHASIS (beginner = protective &
// simple, advanced = challenge & depth) — never a character switch.
// Pure (no I/O). Language-Lock safe (en / ur / ur-roman / ar).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// Intents where teaching framing is inappropriate (data, operational, conversational).
const NO_TEACH = new Set([
  'gold', 'btc', 'macro', 'brief', 'mood', 'events', 'session',
  'signal', 'chart', 'setcountry', 'lotsize', 'smalltalk', 'greeting', 'offtopic', 'aboutme', 'profileinfo',
]);

// Per-level style palettes (STEP 6). Rotated by seed so it's never fixed/robotic.
const PALETTE = {
  beginner:     ['simple', 'analogy', 'step-by-step', 'none', 'none'],
  intermediate: ['step-by-step', 'analytical', 'socratic', 'none', 'none'],
  advanced:     ['challenge', 'socratic', 'analytical', 'none'],
};

function seedHash(seed) {
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Pick ONE teaching style for this turn (or 'none').
export function selectTeachingStyle({ level = 'beginner', intent = '', cognition = {}, depth = 'STANDARD', seed = '' } = {}) {
  if (NO_TEACH.has(intent)) return 'none';
  // A frustrated/anxious student needs steady simplicity, not a challenge.
  const tone = cognition?.emotionalTone;
  if (tone === 'frustrated' || tone === 'anxious' || tone === 'overwhelmed') {
    return (level === 'advanced') ? 'analytical' : 'simple';
  }
  const palette = PALETTE[level] || PALETTE.beginner;
  // MICRO/SHORT answers stay tight — only allow a light socratic/challenge tail.
  if (depth === 'MICRO' || depth === 'SHORT') {
    return (level === 'advanced') ? 'challenge' : 'none';
  }
  return palette[seedHash(seed) % palette.length] || 'none';
}

// ── FRAMING LEAD (rare) — only analogy / step-by-step / simple offer a lead, and
// only when the upstream phases didn't already set one. Often '' so it stays human.
const LEAD = {
  analogy: {
    en: [
      "Think of it like this —",
      "Here's a simple way to picture it:",
    ],
    ur: ["اسے یوں سمجھیں —", "اسے آسان مثال سے دیکھیں:"],
    'ur-roman': ["Ise yun samjhein —", "Ise aasaan misaal se dekhein:"],
    ar: ["فكّر في الأمر هكذا —", "إليك طريقة بسيطة لتتخيّلها:"],
  },
  'step-by-step': {
    en: ["Let's take this one step at a time —", "We'll build this up piece by piece:"],
    ur: ["آئیے اسے قدم بہ قدم لیتے ہیں —"],
    'ur-roman': ["Aayiye ise qadam ba qadam lete hain —"],
    ar: ["لنأخذ هذا خطوة بخطوة —"],
  },
  simple: {
    en: ["Keeping it simple —", "In plain terms —"],
    ur: ["سادہ الفاظ میں —"],
    'ur-roman': ["Saada alfaaz mein —"],
    ar: ["ببساطة —"],
  },
};

export function teachingLead(style, { lang = 'en', seed = '' } = {}) {
  const m = LEAD[style];
  if (!m) return '';
  // ~1-in-3 turns actually leads, so it never feels formulaic.
  if (seedHash(seed + style) % 3 !== 0) return '';
  const arr = m[lang] || m.en;
  return vary(arr, seed || style);
}

// ── THINK-PROMPT TAIL (rare) — socratic / challenge / analytical invite the
// student to reason. Mentor warmth, not a quiz. Often '' so it isn't repetitive.
const TAIL = {
  socratic: {
    en: [
      "\n\nBefore I say more — what's your read on it so far?",
      "\n\nWhat do you think the market is trying to do here?",
    ],
    ur: ["\n\nآگے بڑھنے سے پہلے — آپ کی اپنی رائے کیا ہے؟"],
    'ur-roman': ["\n\nAage badhne se pehle — aap ki apni raaye kya hai?"],
    ar: ["\n\nقبل أن أكمل — ما قراءتك حتى الآن؟"],
  },
  challenge: {
    en: [
      "\n\nHere's the harder question worth sitting with: what would invalidate this idea?",
      "\n\nPush yourself on this — where could you be wrong, and how would you know?",
    ],
    ur: ["\n\nاصل سوال یہ ہے: اس خیال کو کیا چیز غلط ثابت کرے گی؟"],
    'ur-roman': ["\n\nAsal sawal ye hai: is khayaal ko kya cheez ghalat sabit karegi?"],
    ar: ["\n\nالسؤال الأصعب: ما الذي يُبطل هذه الفكرة؟"],
  },
  analytical: {
    en: ["\n\nWorth checking against your own data — does this match what your last trades actually showed?"],
    ur: ["\n\nاپنے ڈیٹا سے ملا کر دیکھیں — کیا یہ آپ کی پچھلی trades سے میل کھاتا ہے؟"],
    'ur-roman': ["\n\nApne data se mila kar dekhein — kya ye aap ki pichli trades se mail khaata hai?"],
    ar: ["\n\nقارن هذا ببياناتك — هل يتطابق مع ما أظهرته صفقاتك الأخيرة؟"],
  },
};

export function teachingTail(style, { lang = 'en', seed = '' } = {}) {
  const m = TAIL[style];
  if (!m) return '';
  // ~1-in-2 turns adds a tail, varied; the rest stay quiet.
  if (seedHash(seed + 't' + style) % 2 !== 0) return '';
  const arr = m[lang] || m.en;
  return vary(arr, seed || style);
}
