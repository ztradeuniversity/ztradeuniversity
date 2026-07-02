// functions/utils/human-response.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 10.5 — HUMAN RESPONSE PLANNER. Turns cognition + confidence + depth into
// a final plan: answer only what was asked, never a capability menu, at most ONE
// natural follow-up phrased like a person ("If you'd like the trend too, I can
// show that"). Pure (no I/O). Preserves the Language Lock (localized lines).
// ════════════════════════════════════════════════════════════════════════════

import { depthToMode } from './answer-depth.js';

// Category → the single most relevant follow-up "type".
const CAT_FOLLOWUP = {
  Gold: 'trend', BTC: 'trend', Forex: 'trend', 'Market Analysis': 'trend', 'Macro News': 'trend',
  Psychology: 'drill', 'Risk Management': 'size', 'Trading Career': 'roadmap', 'Beginner Learning': 'roadmap',
  Strategy: 'style', 'Smart Money': 'chart', 'Prop Firms': 'risk', Brokers: 'deeper', 'General Trading': 'deeper',
};

const LINES = {
  trend:   { en: "If you'd like the trend too, just say the word.", ur: "اگر trend بھی چاہیں تو بتا دیں۔", 'ur-roman': "Agar trend bhi chahein to bata dein.", ar: "إن أردت الاتجاه أيضاً، فقط أخبرني." },
  drill:   { en: "Want a simple drill to work on that?", ur: "کیا اس پر کام کرنے کے لیے ایک آسان مشق دوں؟", 'ur-roman': "Kya is par kaam karne ke liye ek aasaan drill doon?", ar: "هل تريد تمريناً بسيطاً للعمل على ذلك؟" },
  size:    { en: "Want me to size a specific trade for you?", ur: "کیا میں کسی مخصوص trade کا size نکال دوں؟", 'ur-roman': "Kya main kisi makhsoos trade ka size nikaal doon?", ar: "هل تريد أن أحسب حجم صفقة محددة لك؟" },
  roadmap: { en: "Want a simple beginner roadmap to start?", ur: "کیا شروع کرنے کے لیے ایک آسان beginner roadmap دوں؟", 'ur-roman': "Kya shuru karne ke liye ek aasaan beginner roadmap doon?", ar: "هل تريد خارطة بسيطة للمبتدئين للبدء؟" },
  style:   { en: "Want help matching a strategy to your style?", ur: "کیا آپ کے انداز کے مطابق strategy منتخب کرنے میں مدد دوں؟", 'ur-roman': "Kya aap ke andaaz ke mutabiq strategy chunne mein madad doon?", ar: "هل تريد المساعدة في مطابقة استراتيجية لأسلوبك؟" },
  chart:   { en: "Upload a chart and I'll read the structure.", ur: "ایک chart upload کریں، میں structure پڑھ دوں گا۔", 'ur-roman': "Ek chart upload karein, main structure parh doon ga.", ar: "ارفع شارت وسأقرأ البنية." },
  risk:    { en: "Want the key risk rules for that?", ur: "کیا اس کے اہم risk اصول بتاؤں؟", 'ur-roman': "Kya is ke ahem risk usool bataoon?", ar: "هل تريد قواعد المخاطر الأساسية لذلك؟" },
  deeper:  { en: "Happy to go deeper if you'd like.", ur: "اگر چاہیں تو مزید تفصیل دے سکتا ہوں۔", 'ur-roman': "Agar chahein to mazeed tafseel de sakta hoon.", ar: "يسعدني التعمّق أكثر إن أردت." },
};

// Exactly ONE natural follow-up (never a bulleted menu). '' when not wanted.
export function singleFollowup(cognition, lang = 'en') {
  const cat = cognition?._qa?.category || 'General Trading';
  const key = CAT_FOLLOWUP[cat] || 'deeper';
  const line = (LINES[key] || LINES.deeper)[lang] || (LINES[key] || LINES.deeper).en;
  return `\n\n${line}`;
}

// Final plan consumed by ai-chat.
export function buildPlan(cognition, confidence, depth) {
  return {
    requiresClarification: !!confidence.requiresClarification,
    clarificationQuestion: confidence.clarificationQuestion || '',
    depth,
    mode: depthToMode(depth),
    allowMarketDump: !!cognition?._qa?.marketDumpAllowed,
    // MICRO/SHORT answers must stay tight: no article/knowledge appends.
    allowKnowledgeAppend: depth === 'STANDARD' || depth === 'DEEP',
  };
}
