// functions/utils/market-explain.js
// ════════════════════════════════════════════════════════════════════════════
// MARKET EXPLAIN — the "why" + broad-instrument layer on top of the frozen
// market-context engine. Handles two cases the Gold/BTC decision/price path
// doesn't:
//   • "why is gold moving / why is the dollar strong / why did the market fall"
//     → an educational explanation of the DRIVERS (reuses buildMarketContext for
//       Gold/BTC; explains the dollar/market from the live regime + macro).
//   • a buy/sell/hold DECISION on an instrument with NO live feed (EUR/USD,
//     indices, oil) → a conceptual Technical · Fundamental · Risk · Confirmation ·
//     Conclusion analysis WITHOUT inventing a price (STEP 8 honesty), never a signal.
//
// Reuses the frozen market-context.js; adds no fetch/API. Pure (no I/O).
// Language-Lock safe (en / ur / ur-roman / ar). Probability framing, never certainty.
// ════════════════════════════════════════════════════════════════════════════

import { buildMarketContext, priceUnavailable } from './market-context.js';

// ── "WHY is X moving" detector ────────────────────────────────────────────────
const MOVE = /(up|down|moving|rising|falling|drop|dropping|dump|pump|higher|lower|strong|weak|fall|fell|crash|rally|red|green|tank)/;
export function detectMarketWhy(text) {
  const s = String(text || '').toLowerCase();
  const why = /\bwhy\b|what (happened|moved|caused)|what'?s (going on|happening)/.test(s);
  if (!why && !/what happened (today|in the market)/.test(s)) return { topic: null };
  if (/\b(gold|xau)\b/.test(s) && MOVE.test(s)) return { topic: 'gold' };
  if (/\b(btc|bitcoin)\b/.test(s) && MOVE.test(s)) return { topic: 'btc' };
  if (/\b(dollar|dxy|usd|greenback)\b/.test(s)) return { topic: 'dollar' };
  if (/\b(the )?market(s)?\b/.test(s) || /what happened (today|in the market)/.test(s)) return { topic: 'market' };
  return { topic: null };
}

function regimeBits(marketData) {
  const r = marketData?.marketRegime?.label, vix = marketData?.vix?.value, y = marketData?.yields?.us10y;
  const b = [];
  if (r) b.push(`risk mood **${r}**`);
  if (vix != null) b.push(`VIX ~${vix}`);
  if (y != null) b.push(`US 10Y ~${y}%`);
  return b.join(' · ');
}

const DOLLAR = {
  en: reg => `🌍 **Why the dollar moves**\nThe US dollar (DXY) strengthens when the Fed is **hawkish**, when **yields rise**, or in **risk-off** demand for safety; it weakens on dovish policy, falling yields, or risk-on flows.${reg ? `\nRight now: ${reg}.` : ''}\n\n_⚠️ This is the educational mechanism, not a live call — and a strong dollar usually pressures Gold. Markets move on probabilities, never certainty._`,
  ur: reg => `🌍 **ڈالر کیوں حرکت کرتا ہے**\nڈالر (DXY) اس وقت مضبوط ہوتا ہے جب Fed سخت ہو، yields بڑھیں، یا risk-off ہو۔${reg ? `\nابھی: ${reg}.` : ''}\n\n_⚠️ یہ تعلیمی وضاحت ہے، live رائے نہیں۔ مضبوط ڈالر عموماً Gold پر دباؤ ڈالتا ہے۔_`,
  'ur-roman': reg => `🌍 **Dollar kyun harkat karta hai**\nDollar (DXY) tab mazboot hota hai jab Fed sakht ho, yields barhein, ya risk-off ho.${reg ? `\nAbhi: ${reg}.` : ''}\n\n_⚠️ Ye taleemi wazahat hai, live raaye nahi. Mazboot dollar aksar Gold par dabao daalta hai._`,
  ar: reg => `🌍 **لماذا يتحرّك الدولار**\nيقوى الدولار (DXY) عند تشدّد الفيدرالي، أو ارتفاع العوائد، أو الطلب على الأمان (risk-off).${reg ? `\nالآن: ${reg}.` : ''}\n\n_⚠️ هذه آلية تعليمية لا توصية حية. والدولار القوي عادةً يضغط على الذهب._`,
};
const MARKET = {
  en: reg => `🌍 **Why markets move**\nMarkets move on **interest rates**, **economic data** (CPI/NFP/FOMC), **central-bank tone**, and overall **risk sentiment**. A risk-off day pressures stocks and lifts safe-havens; rising yields/strong dollar pressure Gold.${reg ? `\nRight now: ${reg}.` : ''}\n\n_⚠️ I can't attribute a specific move without confirmed data — this is the educational framework. Probabilities, never certainty._`,
  ur: reg => `🌍 **مارکیٹ کیوں حرکت کرتی ہے**\nمارکیٹ interest rates، economic data (CPI/NFP/FOMC)، اور risk sentiment پر چلتی ہے۔${reg ? `\nابھی: ${reg}.` : ''}\n\n_⚠️ تصدیق شدہ ڈیٹا کے بغیر میں مخصوص وجہ نہیں بتا سکتا — یہ تعلیمی فریم ورک ہے۔_`,
  'ur-roman': reg => `🌍 **Market kyun harkat karti hai**\nMarket interest rates, economic data (CPI/NFP/FOMC), aur risk sentiment par chalti hai.${reg ? `\nAbhi: ${reg}.` : ''}\n\n_⚠️ Tasdeeq-shuda data ke baghair main makhsoos wajah nahi bata sakta — ye taleemi framework hai._`,
  ar: reg => `🌍 **لماذا تتحرّك الأسواق**\nتتحرّك الأسواق على أسعار الفائدة والبيانات الاقتصادية (CPI/NFP/FOMC) ومزاج المخاطرة.${reg ? `\nالآن: ${reg}.` : ''}\n\n_⚠️ لا أستطيع عزو حركة محددة دون بيانات مؤكدة — هذا إطار تعليمي._`,
};

export function buildWhyExplanation({ marketData, calendarData, topic, lang = 'en' } = {}) {
  if (topic === 'gold') return buildMarketContext({ marketData, calendarData, instrument: 'Gold', lang });
  if (topic === 'btc')  return buildMarketContext({ marketData, calendarData, instrument: 'BTC', lang });
  const reg = regimeBits(marketData);
  if (topic === 'dollar') return (DOLLAR[lang] || DOLLAR.en)(reg);
  if (topic === 'market') return (MARKET[lang] || MARKET.en)(reg);
  return '';
}

// ── DECISION on a no-live-feed instrument → conceptual educational analysis ────
const BROAD_DECISION = /\b(should i (buy|sell|hold|long|short)|is it (a )?good time to (buy|sell)|worth (buying|selling|holding))\b/i;
const BROAD_INSTR = [
  [/\b(eur ?usd|euro dollar)\b/i, 'EUR/USD'],
  [/\b(gbp ?usd|cable|pound dollar)\b/i, 'GBP/USD'],
  [/\b(usd ?jpy|dollar yen)\b/i, 'USD/JPY'],
  [/\b(nas ?100|nasdaq)\b/i, 'NAS100'],
  [/\b(s&?p ?500|spx|us ?500)\b/i, 'S&P 500'],
  [/\b(dow|us ?30)\b/i, 'US30'],
  [/\b(oil|wti|crude|brent)\b/i, 'Oil'],
];
export function detectBroadDecision(text) {
  const s = String(text || '').toLowerCase();
  if (!BROAD_DECISION.test(s)) return null;
  for (const [re, label] of BROAD_INSTR) if (re.test(s)) return { label };
  return null;
}

const GENERIC = {
  en: l => `I won't tell you to buy or sell **${l}** — and I can't verify its live price right now. But here's how to think about it educationally:\n\n📊 **Technical view** — on your chart: is ${l} trending or ranging? Where are the nearest support/resistance levels? Trade with the higher-timeframe trend.\n🌍 **Fundamental view** — what's driving it (rate differentials / central-bank tone / risk sentiment)? Any high-impact news due?\n⚠️ **Market risks** — surprises around news, a strong counter-move, your own oversizing.\n✅ **Professional confirmation** — most traders wait for a close beyond a level + a retest, not the first spike.\n🎓 **Conclusion** — it's a **probability, not a certainty**. Decide from your own plan, risk only 1–2%, and for live setups our team shares them on **[Telegram](https://t.me/ztradeuniversity)**.`,
  ur: l => `میں آپ کو **${l}** خریدنے یا بیچنے کا نہیں کہوں گا — اور اس کی live قیمت بھی تصدیق نہیں کر سکتا۔ مگر تعلیمی طور پر: 📊 technical (trend + levels)، 🌍 fundamental (کیا چلا رہا ہے)، ⚠️ risks، ✅ confirmation (close + retest کا انتظار)، 🎓 نتیجہ: یہ **امکان ہے، یقین نہیں** — صرف 1–2% رسک کریں۔`,
  'ur-roman': l => `Main aap ko **${l}** kharidne ya bechne ka nahi kahoon ga — aur is ki live price bhi tasdeeq nahi kar sakta. Magar taleemi tor par: 📊 technical (trend + levels), 🌍 fundamental (kya chala raha hai), ⚠️ risks, ✅ confirmation (close + retest ka intezar), 🎓 nateeja: ye **imkan hai, yaqeen nahi** — sirf 1–2% risk karein.`,
  ar: l => `لن أطلب منك شراء أو بيع **${l}** — ولا أستطيع التحقق من سعره الحي الآن. لكن تعليمياً: 📊 فني (الاتجاه + المستويات)، 🌍 أساسي (ما الذي يحرّكه)، ⚠️ مخاطر، ✅ تأكيد (إغلاق + إعادة اختبار)، 🎓 الخلاصة: **احتمال لا يقين** — خاطر بـ 1–2% فقط.`,
};
export function genericDecisionAnalysis(label = 'this instrument', lang = 'en') {
  return (GENERIC[lang] || GENERIC.en)(label);
}
