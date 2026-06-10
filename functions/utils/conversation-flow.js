// functions/utils/conversation-flow.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 27 — DEEP CONVERSATION FLOW (long-conversation humanity)
// Reads the conversational MOVE behind a short reply — repair ("no, not that",
// "you misunderstood"), rejection ("I tried that"), affirmation ("that's exactly
// my problem"), caveat ("yes but not always"), or continuation ("but I failed",
// "and then?") — and opens with a natural mentor acknowledgment so the thread is
// REPAIRED/continued, never restarted.
//
// It does NOT resolve references or re-route intent — that's already handled by
// Phase 16 dialogue-understanding (indirect/"what about gold"), Phase 11
// conversation-state (pronouns), and Phase 14 recovery (typos/fragments). This
// only adds the human acknowledgment those layers don't produce. Fills an empty
// lead only; stays silent most of the time (STEP 6). Pure (no I/O). Lang-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// Order matters: repair/rejection are checked before softer moves.
const MOVES = [
  ['repair',       /^(no\b|nope\b|not that|that'?s not (it|what i mean(t)?)|you (mis)?understood|i did ?n'?t mean|i meant|that'?s wrong|wrong\b|different question|not what i (asked|meant)|that'?s not my question)/i],
  ['rejection',    /\b(i (already )?tried that|tried that( already)?|that did ?n'?t work|already did that|that does ?n'?t help|been there( done that)?|does ?n'?t work for me)\b/i],
  ['affirmation',  /\b(that'?s exactly( my problem)?|exactly my problem|yes,? exactly|that'?s it exactly|you nailed it|that'?s the (issue|problem)|spot on)\b/i],
  ['caveat',       /(^(yes|yeah|ok|sure|true)[, ]+but\b)|(\bbut not always\b)|(\bnot always\b)|(^well,? but\b)/i],
  ['continuation', /(^(and|so|then)\b)|(^but i (failed|lost|couldn'?t|can'?t|didn'?t))|(what about .+ then)|(\band if that happens\b)|(\band then\b)/i],
];

// Returns one of the move keys, or null. `text` is the user's latest message.
export function detectConversationMove(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const words = s.split(/\s+/).filter(Boolean).length;
  // Only short, reactive turns are conversational moves; long messages are real
  // questions handled by the normal pipeline (avoids false positives).
  if (words > 12) return null;
  for (const [move, re] of MOVES) if (re.test(s)) return move;
  return null;
}

// Localized, varied mentor acknowledgments. Repair/rejection always speak (a
// misunderstanding must be acknowledged); the softer moves speak ~half the time.
const LEAD = {
  repair: {
    en: ["Got it — let me take another angle.", "Ah, I misread that — let me try again properly.", "Understood, that's not what you meant. Let's reset on the right thing:"],
    ur: ["سمجھ گیا — میں دوسرے انداز سے بتاتا ہوں۔", "اوہ، میں نے غلط سمجھا — درست طریقے سے دوبارہ:"],
    'ur-roman': ["Samajh gaya — main doosre andaaz se batata hoon.", "Oh, main ne ghalat samjha — durust tareeqe se dobara:"],
    ar: ["فهمت — دعني أتناولها من زاوية أخرى.", "آه، أسأت الفهم — لنبدأ من جديد بالشكل الصحيح:"],
  },
  rejection: {
    en: ["Fair — if that didn't work for you, let's adjust the approach.", "Okay, so that one didn't land. Let's try it differently:"],
    ur: ["ٹھیک ہے — اگر وہ کارگر نہیں رہا تو طریقہ بدلتے ہیں۔"],
    'ur-roman': ["Theek hai — agar wo kaargar nahi raha to tareeqa badalte hain."],
    ar: ["حسناً — إن لم ينفع ذلك معك، فلنغيّر الأسلوب."],
  },
  affirmation: {
    en: ["Right — that's exactly the crux of it. Let's dig in:", "Good, we're on the same page. Here's what matters:"],
    ur: ["بالکل — یہی اصل بات ہے۔ آئیے گہرائی میں جائیں:"],
    'ur-roman': ["Bilkul — yahi asal baat hai. Aayiye gehrai mein jayein:"],
    ar: ["تماماً — هذا هو جوهر الأمر بالضبط. لنتعمّق:"],
  },
  caveat: {
    en: ["Good nuance — you're right that it isn't absolute.", "Fair point — it's not always the case, and that matters here:"],
    ur: ["اچھی بات — آپ درست ہیں کہ یہ ہمیشہ نہیں ہوتا۔"],
    'ur-roman': ["Achhi baat — aap durust hain ke ye hamesha nahi hota."],
    ar: ["ملاحظة دقيقة — أنت محق أنه ليس مطلقاً."],
  },
  continuation: {
    en: ["Let's think about that —", "There's an important detail here —", "This is where most beginners slip —"],
    ur: ["آئیے اس پر غور کرتے ہیں —", "یہاں ایک اہم بات ہے —"],
    'ur-roman': ["Aayiye is par ghaur karte hain —", "Yahan ek ahem baat hai —"],
    ar: ["لنفكّر في ذلك —", "هناك تفصيل مهم هنا —"],
  },
};

const ALWAYS_SPEAK = new Set(['repair', 'rejection']);

function seedHash(seed) {
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Returns a natural acknowledgment lead for the move, or '' (silence — STEP 6).
export function conversationLead(move, { lang = 'en', seed = '' } = {}) {
  const m = LEAD[move];
  if (!m) return '';
  // Softer moves stay quiet ~half the time so it never feels scripted.
  if (!ALWAYS_SPEAK.has(move) && seedHash(seed + move) % 2 !== 0) return '';
  const arr = m[lang] || m.en;
  return vary(arr, seed || move);
}
