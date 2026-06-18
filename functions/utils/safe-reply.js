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
  en: "Happy to help — though I'm focused on trading, so I can't cover that one. Where I'm strong: market context for **Gold (XAU/USD)** and **Bitcoin**, trading concepts, **technical analysis**, **risk management**, and trading **psychology**. What I don't do: live buy/sell signals, price predictions, or non-trading topics.",
  ur: "میں مدد کے لیے حاضر ہوں — لیکن میرا فوکس ٹریڈنگ پر ہے، اس لیے یہ موضوع میں کور نہیں کر سکتا۔ میں ان میں مضبوط ہوں: **Gold (XAU/USD)** اور **Bitcoin** کا مارکیٹ کانٹیکسٹ، ٹریڈنگ تصورات، **technical analysis**، **risk management**، اور ٹریڈنگ **psychology**۔ جو میں نہیں کرتا: live buy/sell signals، price predictions، یا غیر ٹریڈنگ موضوعات۔",
  'ur-roman': "Madad ke liye hazir hoon — lekin mera focus trading par hai, is liye ye topic main cover nahi kar sakta. Jahan main strong hoon: **Gold (XAU/USD)** aur **Bitcoin** ka market context, trading concepts, **technical analysis**, **risk management**, aur trading **psychology**. Jo main nahi karta: live buy/sell signals, price predictions, ya non-trading topics.",
  ar: "يسعدني المساعدة — لكن تركيزي على التداول، لذا لا يمكنني تغطية هذا الموضوع. ما أُجيده: سياق السوق لـ **الذهب (XAU/USD)** و**البيتكوين**، مفاهيم التداول، **التحليل الفني**، **إدارة المخاطر**، و**سيكولوجيا التداول**. ما لا أفعله: إشارات بيع/شراء مباشرة، أو توقّعات أسعار، أو مواضيع خارج التداول.",
};

export function buildSafeReply(lang = 'en') {
  return SAFE[lang] || SAFE.en;
}
