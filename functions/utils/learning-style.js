// functions/utils/learning-style.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 18 — HUMAN PERSONALITY & LEARNING-STYLE LAYER
// Infers HOW a student learns (not just what they ask) so the mentor can adapt the
// way it explains. It reads accumulated EDUCATIONAL signals across the conversation
// window + cross-session recap (Phase 15 recentRecap) — never asks, never stores,
// no sensitive profiling. It feeds the EXISTING Phase 16 teaching pipeline by
// choosing a learning-style-aware lead; Phase 16's level/seed pick stays the
// fallback. One stable mentor — only the teaching STYLE shifts (STEP 4).
//
// Learning styles : simple · step-by-step · examples · analogy · practical · analytical
// Personalities   : cautious · aggressive · over-thinker · impatient · disciplined · research-oriented
// Pure (no I/O). Language-Lock safe (en / ur / ur-roman / ar).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// ── STYLE SIGNALS (STEP 1) — how the student likes to receive explanations. ──
const STYLE_SIGNALS = [
  ['simple',       /\b(keep it simple|simply|in simple|plain (english|terms)|dumb it down|explain like|eli5|too complicated|make it (easy|simple)|basic terms|in short|tldr)\b/i],
  ['step-by-step', /\b(step.?by.?step|walk me through|one step at a time|in order|what'?s the (first|next) step|break it down|sequence|process|then what)\b/i],
  ['examples',     /\b(example|for instance|show me a case|real example|give me an example|sample|like a real|e\.?g\.?)\b/i],
  ['analogy',      /\b(analogy|compare it to|is it like|like what|metaphor|in real life|think of it as)\b/i],
  ['practical',    /\b(practice|exercise|drill|hands.?on|let me try|how do i actually|show me how to|practical|do it myself|apply this)\b/i],
  ['analytical',   /\b(in depth|deep dive|the logic|why does|the math|technically|expectancy|probabilit|statistic|the data|prove|evidence|under the hood|mechanics|theory|the reason)\b/i],
];

// ── PERSONALITY SIGNALS (STEP 2) — educational behaviour only. ──
const PERSONALITY_SIGNALS = [
  ['cautious',          /\b(is it safe|too risky|scared to lose|protect (my|the)|careful|conservative|low.?risk|worried about losing|play it safe|preserve)\b/i],
  ['aggressive',        /\b(all.?in|big lot|max(imum)? leverage|go big|double down|high.?risk|aggressive|huge position|yolo|biggest size)\b/i],
  ['over-thinker',      /\b(but what if|on the other hand|i keep thinking|overthink|over.?analyz|confused between|too many (options|indicators)|analysis paralysis|second.?guess|which one (is best|should i))\b/i],
  ['impatient',         /\b(quick(ly|est)?|fast|hurry|asap|right now|how long until|when will i|in a rush|no time|speed)\b/i],
  ['disciplined',       /\b(my (trading )?plan|i journal|i always (set|use|wait)|stuck to (my )?(plan|rules|stop)|followed my rules|my checklist|risk management|i wait for)\b/i],
  ['research-oriented', /\b(i read|i studied|researched|the data shows|statistics|that article|that book|a study|i analyzed|i backtested|the numbers)\b/i],
];

// Collect user text from the window + cross-session recap (gradual learning).
function gatherText(messages = [], recentRecap = []) {
  const fromMsgs = (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.role === 'user').slice(-12).map(m => String(m.content || ''));
  const fromRecap = (Array.isArray(recentRecap) ? recentRecap : []).map(r => String(r || ''));
  return fromMsgs.concat(fromRecap);
}

function topByCount(signals, texts) {
  const counts = {};
  for (const t of texts) for (const [key, re] of signals) if (re.test(t)) counts[key] = (counts[key] || 0) + 1;
  let best = null, bestN = 0;
  for (const [k, n] of Object.entries(counts)) if (n > bestN) { best = k; bestN = n; }
  return { key: best, count: bestN };
}

// Returns { style, personality, confidence } — confidence 'high' (≥2 hits or an
// explicit current-turn cue) / 'low' (1) / 'none'.
export function detectLearningStyle({ messages = [], profile = {}, recentRecap = [] } = {}) {
  const texts = gatherText(messages, recentRecap);
  const styleHit = topByCount(STYLE_SIGNALS, texts);
  const persHit  = topByCount(PERSONALITY_SIGNALS, texts);

  let style = styleHit.key;
  let confidence = styleHit.count >= 2 ? 'high' : styleHit.count === 1 ? 'low' : 'none';

  // Personality can imply a style when none was stated explicitly (STEP 3).
  const personality = persHit.key || null;
  if (!style && personality) {
    if (personality === 'over-thinker' || personality === 'impatient' || personality === 'cautious') style = 'simple';
    else if (personality === 'research-oriented' || personality === 'disciplined') style = 'analytical';
    else if (personality === 'aggressive') style = 'analytical';
    if (style) confidence = persHit.count >= 2 ? 'high' : 'low';
  }

  return { style: style || null, personality, confidence };
}

// ── LEARNING-STYLE LEAD (STEP 3) ──────────────────────────────────────────────
// A short, distinct framing that signals we're matching the student's style. Keyed
// to learning style (not level/seed like Phase 16), so it complements — not
// duplicates — the teaching layer. Varied + gated so it's never scripted (STEP 6/7).
const NOTE = {
  simple: {
    en: ["I'll keep this clean and simple —", "No jargon — here's the plain version:"],
    ur: ["میں اسے سادہ اور صاف رکھوں گا —", "بغیر پیچیدگی کے، سادہ بات:"],
    'ur-roman': ["Main ise saada aur saaf rakhoon ga —", "Baghair pechidgi ke, saada baat:"],
    ar: ["سأبقيها بسيطة وواضحة —", "بدون تعقيد — إليك النسخة المبسّطة:"],
  },
  'step-by-step': {
    en: ["Step by step, then —", "Let's lay it out in order —"],
    ur: ["تو پھر، قدم بہ قدم —", "آئیے ترتیب سے رکھتے ہیں —"],
    'ur-roman': ["To phir, qadam ba qadam —", "Aayiye tarteeb se rakhte hain —"],
    ar: ["إذن، خطوة بخطوة —", "لنرتّبها بالتسلسل —"],
  },
  examples: {
    en: ["Here's a concrete example to anchor it —", "Let me ground this in a real example —"],
    ur: ["اسے سمجھانے کے لیے ایک ٹھوس مثال —", "ایک حقیقی مثال سے واضح کرتا ہوں —"],
    'ur-roman': ["Ise samjhane ke liye ek thos misaal —", "Ek haqeeqi misaal se waazeh karta hoon —"],
    ar: ["إليك مثالاً ملموساً لترسيخها —", "دعني أوضّحها بمثال واقعي —"],
  },
  analogy: {
    en: ["Here's an analogy that usually clicks —", "Picture it this way —"],
    ur: ["ایک مثال جو عموماً سمجھ آ جاتی ہے —", "اسے یوں تصور کریں —"],
    'ur-roman': ["Ek misaal jo umooman samajh aa jaati hai —", "Ise yun tasawwur karein —"],
    ar: ["إليك تشبيهاً يوضّح الفكرة عادةً —", "تخيّلها هكذا —"],
  },
  practical: {
    en: ["Let's make this practical —", "Here's how to actually put it to work —"],
    ur: ["آئیے اسے عملی بناتے ہیں —", "اسے عملی طور پر استعمال کرنے کا طریقہ —"],
    'ur-roman': ["Aayiye ise amali banate hain —", "Ise amali tor par istemaal karne ka tareeqa —"],
    ar: ["لنجعل هذا عملياً —", "إليك كيف تطبّقها فعلاً —"],
  },
  analytical: {
    en: ["Let's go a level deeper on the logic —", "Here's the mechanism underneath —"],
    ur: ["آئیے منطق میں ایک قدم گہرائی میں جاتے ہیں —", "اس کے پیچھے کا اصول یہ ہے —"],
    'ur-roman': ["Aayiye mantiq mein ek qadam gehrai mein jaate hain —", "Is ke peeche ka usool ye hai —"],
    ar: ["لنتعمّق خطوة في المنطق —", "إليك الآلية الكامنة وراءها —"],
  },
};

// Intents where a teaching framing is inappropriate (mirrors Phase 16 intent gate).
const NO_STYLE = new Set([
  'gold', 'btc', 'macro', 'brief', 'mood', 'events', 'session',
  'signal', 'chart', 'setcountry', 'lotsize', 'smalltalk', 'greeting', 'offtopic', 'aboutme', 'profileinfo',
]);

function seedHash(seed) {
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Returns ONE localized learning-style lead, or '' (no confident style, gated quiet,
// or non-educational intent). `level` keeps beginners on gentle styles (STEP 3/4).
export function learningStyleNote(ls, { lang = 'en', seed = '', level = 'beginner', intent = '' } = {}) {
  if (!ls || !ls.style || ls.confidence === 'none') return '';
  if (intent && NO_STYLE.has(intent)) return '';
  let style = ls.style;
  // Beginners stay protected: deep analytical framing softens to simple/step.
  if (level === 'beginner' && style === 'analytical') style = 'step-by-step';
  const m = NOTE[style];
  if (!m) return '';
  // Low confidence speaks less often; high confidence speaks ~2-in-3.
  const gate = ls.confidence === 'high' ? 3 : 2;
  if (seedHash(seed + style) % gate === 0) return '';
  const arr = m[lang] || m.en;
  return vary(arr, seed || style);
}
