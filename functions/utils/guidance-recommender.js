// functions/utils/guidance-recommender.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11B.4 — GUIDANCE RECOMMENDER + COMPLIMENT (Part 6.5 / Part 8).
//
// Core distinction the assistant must make:
//   • TRADE PROBLEM  ("was my stop right on this trade?")  → Trade Assessment
//   • TRADER PROBLEM ("I keep losing / can't follow rules / emotional / blow
//                      accounts / know strategy but still fail") → Trader Self-
//                      Assessment (trader-assessment.html) — the habits behind
//                      the results, not the setup.
//
// Recommendations are natural sentences (never "click here"/"use this tool").
// The why-losing/self-assess builders already link the tool, so we only ADD a
// recommendation for trader-problem intents whose body does NOT already point
// there (psychology / stuck). Pure (no I/O), Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

// Trader-problem intents whose builder does not already offer self-assessment.
const OFFER_SELF_ASSESS = new Set(['psychology', 'stuck']);

const SELF_ASSESS_OFFER = {
  en:         "\n\nIt's also worth looking at the habits behind the results — often it's the execution process, not the setup. If you'd like, I can help you spot what's holding back your consistency.",
  ur:         "\n\nنتائج کے پیچھے کی عادات پر بھی نظر ڈالنا مفید ہے — اکثر مسئلہ setup نہیں بلکہ execution ہوتا ہے۔ اگر چاہیں تو میں آپ کی consistency روکنے والی چیزیں پہچاننے میں مدد کر سکتا ہوں۔",
  'ur-roman': "\n\nNataij ke peeche ki aadaat par bhi nazar daalna mufeed hai — aksar masla setup nahi balki execution hota hai. Agar chahein to main aap ki consistency rokne wali cheezein pehchanne mein madad kar sakta hoon.",
  ar:         "\n\nمن المفيد أيضاً النظر إلى العادات وراء النتائج — غالباً المشكلة في التنفيذ لا في الإعداد. إن أردت، أساعدك على تحديد ما يعيق ثباتك.",
};

// Returns a natural self-assessment recommendation, or null (use normal engagement).
export function recommendGuidance({ intent, lang = 'en' } = {}) {
  if (OFFER_SELF_ASSESS.has(intent)) return SELF_ASSESS_OFFER[lang] || SELF_ASSESS_OFFER.en;
  return null;
}

// ── COMPLIMENT ENGINE (Part 8) — tightly gated; no spam, no fake positivity.
// Only a respectful dua for Muslim users asking Islamic-finance questions.
const DUA = {
  en:         "May Allah make your trading journey easy and grant you success. 🤲",
  ur:         "اللہ آپ کے ٹریڈنگ سفر کو آسان کرے اور کامیابی عطا فرمائے۔ 🤲",
  'ur-roman': "Allah aap ke trading safar ko aasaan kare aur kaamyabi ata farmaye. 🤲",
  ar:         "جعل الله رحلتك في التداول يسيرة ووفّقك للنجاح. 🤲",
};
export function complimentLine(intent, lang = 'en') {
  if (intent === 'islamic') return DUA[lang] || DUA.en;
  return '';
}
