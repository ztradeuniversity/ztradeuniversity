// functions/utils/market-context.js
// ════════════════════════════════════════════════════════════════════════════
// LIVE MARKET INTELLIGENCE — structured educational analysis over the EXISTING
// live data (ai-chat already fetches /api/sentiment → marketData: gold/btc/vix/
// yields/marketRegime, and /api/calendar → events). This formats it into the
// four clearly-separated views the phase asks for — Technical · Fundamental ·
// Educational · Risk — always framed as PROBABILITY, never certainty, never a
// signal. When live data is missing it says so honestly (never invents a price).
//
// Reuses the data the pipeline already has; adds no new fetch, no new API. The
// engine still handles plain "gold price" status; this adds the educational
// "should I buy / what's the context" breakdown for Gold/BTC. Pure (no I/O).
// Language-Lock safe (en / ur / ur-roman / ar). Gold/BTC = the live-covered set.
// ════════════════════════════════════════════════════════════════════════════

// Detect a buy/sell DECISION question on a live-covered instrument. Tight on
// purpose: a HOW-TO ("how do I buy gold") is NOT a decision and must not trigger this.
const DECISION = /\b(should i (buy|sell|long|short|trade|enter)|is it (a )?good time to (buy|sell|enter)|worth (buying|selling)|is (gold|btc|bitcoin|xau|it) (a |going )?(buy|sell|up|down)|buy or sell|long or short|good (buy|sell)( right)?( now)?)\b/i;
export function marketDecisionInstrument(text) {
  const s = String(text || '').toLowerCase();
  if (!DECISION.test(s)) return null;
  if (/\b(gold|xau)\b/.test(s)) return 'Gold';
  if (/\b(btc|bitcoin)\b/.test(s)) return 'BTC';
  return null;
}

// Detect a LIVE-PRICE ask + whether we actually have a feed for it.
const PRICE_ASK = /\b(price|trading at|quote|rate|how much is|what'?s .* (at|now)|level right now|worth right now)\b/i;
const INSTRUMENTS = [
  [/\b(gold|xau)\b/i, 'Gold', true],
  [/\b(btc|bitcoin)\b/i, 'Bitcoin', true],
  [/\b(eur ?usd|euro dollar)\b/i, 'EUR/USD', false],
  [/\b(gbp ?usd|cable|pound dollar)\b/i, 'GBP/USD', false],
  [/\b(usd ?jpy|dollar yen)\b/i, 'USD/JPY', false],
  [/\b(nas ?100|nasdaq|us ?tech)\b/i, 'NAS100', false],
  [/\b(s&?p ?500|spx|us ?500)\b/i, 'S&P 500', false],
  [/\b(dow|us ?30)\b/i, 'US30', false],
  [/\b(oil|wti|crude|brent)\b/i, 'Oil', false],
];
export function livePriceInstrument(text) {
  const s = String(text || '');
  if (!PRICE_ASK.test(s)) return null;
  for (const [re, label, supported] of INSTRUMENTS) if (re.test(s)) return { label, supported };
  return null;
}

// ── STEP 9 — honest "can't verify" (never invent a price/event) ────────────────
const NO_PRICE = {
  en: l => `I can't verify the current live price for **${l}** right now, so I won't guess. I *can* explain how ${l} works, what moves it, or how to read its chart — or check your trading platform for the live quote.`,
  ur: l => `میں اس وقت **${l}** کی live قیمت تصدیق نہیں کر سکتا، اس لیے اندازہ نہیں لگاؤں گا۔ میں ${l} کیسے کام کرتا ہے یا اسے کیا حرکت دیتا ہے، یہ سمجھا سکتا ہوں — live قیمت اپنے platform پر دیکھیں۔`,
  'ur-roman': l => `Main is waqt **${l}** ki live price tasdeeq nahi kar sakta, is liye andaza nahi lagaoon ga. Main ${l} kaise kaam karta hai ya ise kya harkat deta hai, samjha sakta hoon — live price apne platform par dekhein.`,
  ar: l => `لا أستطيع التحقق من السعر الحي لـ **${l}** الآن، لذا لن أخمّن. يمكنني شرح كيف يعمل ${l} وما الذي يحرّكه — وللسعر الحي راجع منصّتك.`,
};
export function priceUnavailable(label = 'this instrument', lang = 'en') {
  return (NO_PRICE[lang] || NO_PRICE.en)(label);
}

// ── Build the 4-part educational market context (Gold/BTC) ─────────────────────
const LBL = {
  en: { tech: '📊 **Technical view**', fund: '🌍 **Fundamental view**', edu: '🎓 **Educational view**', risk: '⚠️ **Risk & reality**', noLive: "I can't verify the live price right now, so I'll keep this conceptual." },
  ur: { tech: '📊 **تکنیکی پہلو**', fund: '🌍 **بنیادی پہلو**', edu: '🎓 **تعلیمی پہلو**', risk: '⚠️ **رسک اور حقیقت**', noLive: 'میں ابھی live قیمت تصدیق نہیں کر سکتا، اس لیے بات تصوراتی رکھتا ہوں۔' },
  'ur-roman': { tech: '📊 **Technical pehlu**', fund: '🌍 **Bunyadi pehlu**', edu: '🎓 **Taleemi pehlu**', risk: '⚠️ **Risk aur haqeeqat**', noLive: 'Main abhi live price tasdeeq nahi kar sakta, is liye baat tasawwurati rakhta hoon.' },
  ar: { tech: '📊 **النظرة الفنية**', fund: '🌍 **النظرة الأساسية**', edu: '🎓 **النظرة التعليمية**', risk: '⚠️ **المخاطر والواقع**', noLive: 'لا أستطيع التحقق من السعر الحي الآن، لذا سأبقيها مفاهيمية.' },
};
const RISK_LINE = {
  en: 'This is **education, not a signal or prediction** — markets move on *probabilities, never certainty*. Whatever the setup looks like, risk only 1–2% and wait for your own confirmation. For live setups our team shares them on **[Telegram](https://t.me/ztradeuniversity)** / **[WhatsApp](https://wa.me/17189730347)**.',
  ur: 'یہ **تعلیم ہے، کوئی signal یا پیش گوئی نہیں** — مارکیٹ *امکانات* پر چلتی ہے، یقین پر نہیں۔ صرف 1–2% رسک کریں اور اپنی تصدیق کا انتظار کریں۔',
  'ur-roman': 'Ye **taleem hai, koi signal ya peshgoi nahi** — market *imkanaat* par chalti hai, yaqeen par nahi. Sirf 1–2% risk karein aur apni tasdeeq ka intezar karein.',
  ar: 'هذا **تعليم وليس إشارة أو تنبؤاً** — الأسواق تتحرك على *الاحتمالات لا اليقين*. خاطر بـ 1–2% فقط وانتظر تأكيدك الخاص.',
};

function regimeNote(marketData, lang) {
  const r = marketData?.marketRegime?.label;
  const vix = marketData?.vix?.value;
  const y = marketData?.yields?.us10y;
  const bits = [];
  if (r) bits.push(`risk mood is **${r}**`);
  if (vix != null) bits.push(`VIX ~${vix}`);
  if (y != null) bits.push(`US 10Y ~${y}%`);
  return bits.join(' · ');
}

// instrument: 'Gold' | 'BTC'. Uses live data when present; honest + conceptual when not.
export function buildMarketContext({ marketData, calendarData, instrument = 'Gold', lang = 'en' } = {}) {
  const L = LBL[lang] || LBL.en;
  const key = instrument === 'BTC' ? 'btc' : 'gold';
  const d = marketData?.[key];
  const hasLive = marketData?.status === 'ok' && d && d.price != null;
  const nm = instrument === 'BTC' ? 'Bitcoin' : 'Gold';

  // Technical
  let tech;
  if (hasLive) {
    const dir = (d.changePct ?? 0) > 0 ? '▲ up' : (d.changePct ?? 0) < 0 ? '▼ down' : '→ flat';
    const pct = d.changePct != null ? ` ${d.changePct > 0 ? '+' : ''}${Number(d.changePct).toFixed(2)}% today` : '';
    const range = (d.low && d.high) ? ` Today's range $${Number(d.low).toLocaleString()}–$${Number(d.high).toLocaleString()} is the battleground; the edges *may* act as support/resistance — a probability, not a line that must hold.` : '';
    tech = `${nm} is trading near **$${Number(d.price).toLocaleString()}** (${dir}${pct}). _(live, time-sensitive)_${range}`;
  } else {
    tech = L.noLive + ` Read structure on your chart: trend (higher highs/lows?), and the nearest support/resistance.`;
  }

  // Fundamental
  const reg = regimeNote(marketData, lang);
  const evt = (calendarData?.events && calendarData.events[0] && (calendarData.events[0].title || calendarData.events[0].event))
    ? `the market is watching **${calendarData.events[0].title || calendarData.events[0].event}**`
    : `watch the calendar for high-impact news (CPI / NFP / FOMC) — those drive ${nm}`;
  const fund = instrument === 'BTC'
    ? `${reg ? reg + '. ' : ''}BTC tends to follow risk appetite and dollar liquidity; ${evt}.`
    : `${reg ? reg + '. ' : ''}Gold moves inverse to the US dollar and real yields, and rises on safe-haven demand; ${evt}.`;

  // Educational (balanced — never a recommendation)
  const edu = instrument === 'BTC'
    ? `**Bullish factors:** risk-on mood, rising liquidity, strong structure (higher highs/lows). **Bearish factors:** risk-off, strong dollar, broken structure. Neither is destiny — they shift the *odds*.`
    : `**Bullish factors:** weaker dollar, falling real yields, risk-off/safe-haven demand, price holding support. **Bearish factors:** stronger dollar, rising yields, risk-on, price rejecting resistance. They tilt *probabilities*, not guarantees.`;

  return [
    `${L.tech}\n${tech}`,
    `${L.fund}\n${fund}`,
    `${L.edu}\n${edu}`,
    `${L.risk}\n${(RISK_LINE[lang] || RISK_LINE.en)}`,
  ].join('\n\n');
}
