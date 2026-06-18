// functions/utils/safe-reply.js
// ════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL SAFE REPLY — used only for a genuine unknown/off-topic turn (when
// no Database/Graph/Live/OpenAI answer was produced). Friendly + professional:
// states what the assistant CAN help with and what it CAN'T, without sounding
// broken or like an error. It does NOT add a "try asking" list — the existing
// graph-derived suggestion chips (suggestQuestions) append that below. Pure (no I/O).
// Localized for the Language-Lock languages; English default.
// ════════════════════════════════════════════════════════════════════════════

const SAFE = {
  en: "I don't have a precise answer for that one — I'm focused on trading. Where I'm strong: market context for **Gold (XAU/USD)** and **Bitcoin**, trading concepts, **technical analysis**, **risk management**, and trading **psychology**. What I don't do: live buy/sell signals, price predictions, or non-trading topics.",
  ur: "اس کا درست جواب میرے پاس نہیں — میرا فوکس ٹریڈنگ پر ہے۔ میں ان میں مضبوط ہوں: **Gold (XAU/USD)** اور **Bitcoin** کا مارکیٹ کانٹیکسٹ، ٹریڈنگ تصورات، **technical analysis**، **risk management**، اور ٹریڈنگ **psychology**۔ جو میں نہیں کرتا: live buy/sell signals، price predictions، یا غیر ٹریڈنگ موضوعات۔",
  'ur-roman': "Is ka durust jawab mere paas nahi — mera focus trading par hai. Jahan main strong hoon: **Gold (XAU/USD)** aur **Bitcoin** ka market context, trading concepts, **technical analysis**, **risk management**, aur trading **psychology**. Jo main nahi karta: live buy/sell signals, price predictions, ya non-trading topics.",
  ar: "ليس لديّ إجابة دقيقة عن ذلك — تركيزي على التداول. ما أُجيده: سياق السوق لـ **الذهب (XAU/USD)** و**البيتكوين**، مفاهيم التداول، **التحليل الفني**، **إدارة المخاطر**، و**سيكولوجيا التداول**. ما لا أفعله: إشارات بيع/شراء مباشرة، أو توقّعات أسعار، أو مواضيع خارج التداول.",
};

// Brief, warm small-talk reply — answers the human question, then opens the door
// WITHOUT a forced market pivot or any invented prices. (Fixes "how are you" → forced
// Gold/BTC monologue with stale levels.)
const SMALLTALK = {
  en: "Doing well, thanks for asking! 🙂 I'm here whenever you want to dig into Gold, Bitcoin, or any trading topic — what's on your mind?",
  ur: "میں ٹھیک ہوں، پوچھنے کا شکریہ! 🙂 جب بھی آپ Gold، Bitcoin یا کسی ٹریڈنگ موضوع پر بات کرنا چاہیں، میں حاضر ہوں — کیا جاننا چاہیں گے؟",
  'ur-roman': "Main theek hoon, poochhne ka shukriya! 🙂 Jab bhi aap Gold, Bitcoin ya kisi trading topic par baat karna chahein, main hazir hoon — kya jaanna chahenge?",
  ar: "بخير، شكراً لسؤالك! 🙂 أنا هنا متى أردت التحدث عن الذهب أو البيتكوين أو أي موضوع تداول — بِمَ يمكنني مساعدتك؟",
};

export function buildSafeReply(lang = 'en') {
  return SAFE[lang] || SAFE.en;
}

export function buildSmallTalkReply(lang = 'en') {
  return SMALLTALK[lang] || SMALLTALK.en;
}
