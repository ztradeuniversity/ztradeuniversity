// functions/utils/explanation-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 24 — HUMAN EXPLANATION ENGINE
// Explains a concept the way a human teacher would, by honouring an EXPLICIT
// request for a style — "explain like I'm 5", "give me an example", "step by
// step", "tell it like a story", "use an analogy" — and choosing the right depth
// for the learner's level. It REUSES the graph concept's own bodies/fields and
// never invents examples (STEP 6): the example comes from the concept's market
// context or common-mistake data, or it is simply not offered.
//
// Complements Phase 16 teaching-style (which frames) and Phase 18 learning-style
// (which adapts to how the student learns). This adds the explicit-request layer
// + the "very simple" (ELI5) and "story" tiers those don't cover. Pure (no I/O).
// Language-Lock safe (en / ur / ur-roman / ar).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// Detect an explicit explanation-style request in the user's message.
const REQ = [
  ['very-simple',  /\b(explain like i'?m (5|five|a child)|eli5|in the simplest way|super simple|like i'?m new|really simply|dumb it down)\b/i],
  ['story',        /\b(tell (me )?a story|story mode|as a story|like a story|narrate)\b/i],
  ['analogy',      /\b(use an analogy|give (me )?an analogy|is it like|compare it to|like a real life)\b/i],
  ['example',      /\b(give (me )?an example|show (me )?an example|for example|a real example|with an example)\b/i],
  ['step-by-step', /\b(step by step|step.?by.?step|walk me through|one step at a time|break it down)\b/i],
];
export function detectExplanationRequest(text) {
  const s = String(text || '');
  for (const [style, re] of REQ) if (re.test(s)) return style;
  return null;
}

// Choose the explanation depth tier from the learner level (+ explicit request).
export function selectExplanationLevel(level = 'beginner', requested = null) {
  if (requested === 'very-simple') return 'very-simple';
  if (level === 'advanced')        return 'advanced';
  if (level === 'intermediate')    return 'intermediate';
  return 'beginner';
}

// A short framing lead for the tiers Phase 16 doesn't already cover (very-simple,
// story, analogy). Rare/varied; '' otherwise so it never stacks or feels scripted.
const LEAD = {
  'very-simple': {
    en: ["Let me put this as simply as I possibly can —", "Stripping it right down to the basics —"],
    ur: ["میں اسے بالکل آسان ترین انداز میں بتاتا ہوں —"],
    'ur-roman': ["Main ise bilkul aasaan tareen andaaz mein batata hoon —"],
    ar: ["دعني أبسّطها قدر الإمكان —"],
  },
  story: {
    en: ["Let me tell it as a quick story —", "Picture this as a short scenario —"],
    ur: ["آئیے اسے ایک مختصر کہانی کے طور پر دیکھیں —"],
    'ur-roman': ["Aayiye ise ek mukhtasar kahani ke tor par dekhein —"],
    ar: ["دعني أرويها كقصة قصيرة —"],
  },
  analogy: {
    en: ["Here's an analogy that usually makes it click —"],
    ur: ["ایک مثال جو عموماً بات سمجھا دیتی ہے —"],
    'ur-roman': ["Ek misaal jo umooman baat samjha deti hai —"],
    ar: ["إليك تشبيهاً يوضّح الفكرة عادةً —"],
  },
};
export function explanationLead(style, { lang = 'en', seed = '' } = {}) {
  const m = LEAD[style];
  if (!m) return '';                                  // example/step-by-step handled elsewhere
  const arr = m[lang] || m.en;
  return vary(arr, seed || style);
}

// Pull a GRAPH-SOURCED example for "show me an example" — never invented. Uses the
// concept's market context first, then its first common mistake framed as a case.
// Returns '' when the concept carries no example material.
export function graphExample(conceptItem = {}, { lang = 'en' } = {}) {
  const ctx = conceptItem.marketContext || '';
  if (ctx) {
    const lbl = { en: '💡 **Example:**', ur: '💡 **مثال:**', 'ur-roman': '💡 **Misaal:**', ar: '💡 **مثال:**' };
    return `\n\n${lbl[lang] || lbl.en} ${ctx}`;
  }
  const mis = (conceptItem.commonMistakes && conceptItem.commonMistakes[0]) || '';
  if (mis) {
    const lbl = { en: '💡 **For instance, a common case:**', ur: '💡 **مثال کے طور پر، ایک عام صورت:**', 'ur-roman': '💡 **Misaal ke tor par, ek aam soorat:**', ar: '💡 **على سبيل المثال، حالة شائعة:**' };
    return `\n\n${lbl[lang] || lbl.en} ${mis}`;
  }
  return '';
}
