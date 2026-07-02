// functions/utils/market-coverage.js
// ════════════════════════════════════════════════════════════════════════════
// LIVE MARKET COVERAGE EXPANSION — extend educational market analysis beyond Gold
// and BTC to the major FX pairs, indices, oil, and silver. Reuses the frozen
// market-context engine for the live-feed instruments (Gold/BTC come from the
// already-fetched /api/sentiment marketData) and provides instrument-specific,
// driver-based educational analysis for the rest — WITHOUT inventing a price
// (those have no live feed yet, so it says so honestly). Never a signal.
//
// Registry-driven: each instrument carries its real fundamental DRIVERS, which is
// the genuine value for "what is driving USDJPY / why is NASDAQ falling / why is
// oil rising". A `liveFeed` flag marks Gold/BTC as live today; extending
// /api/sentiment with more symbols later flips the others on (dormant-ready).
// Pure (no I/O). Language-Lock safe (en / ur / ur-roman / ar).
// ════════════════════════════════════════════════════════════════════════════

import { buildMarketContext } from './market-context.js';

// id · label · matcher · category · provider ticker (for future live extension) ·
// liveFeed (true = served from /api/sentiment today) · drivers (educational).
export const SYMBOLS = [
  { id: 'gold',   label: 'Gold (XAU/USD)', re: /\b(gold|xau\/?usd|xauusd)\b/i, category: 'metal',     ticker: 'XAU/USD', liveFeed: true,  drivers: 'the US dollar (inverse), real yields, and safe-haven demand' },
  { id: 'btc',    label: 'Bitcoin (BTC/USD)', re: /\b(btc|bitcoin|btc\/?usd)\b/i, category: 'crypto', ticker: 'BTC/USD', liveFeed: true,  drivers: 'risk appetite, dollar liquidity, and crypto-specific flows' },
  { id: 'eurusd', label: 'EUR/USD', re: /\b(eur\/?usd|euro ?dollar|fiber)\b/i,  category: 'forex', ticker: 'EUR/USD', liveFeed: false, drivers: 'the ECB-vs-Fed interest-rate gap, Eurozone vs US data, and the dollar (DXY)' },
  { id: 'gbpusd', label: 'GBP/USD', re: /\b(gbp\/?usd|cable|pound ?dollar)\b/i,  category: 'forex', ticker: 'GBP/USD', liveFeed: false, drivers: 'the BoE-vs-Fed policy gap, UK inflation/data, and overall risk sentiment' },
  { id: 'usdjpy', label: 'USD/JPY', re: /\b(usd\/?jpy|dollar ?yen|usdjpy)\b/i,   category: 'forex', ticker: 'USD/JPY', liveFeed: false, drivers: 'the BoJ-vs-Fed policy divergence, US 10-year yields (the carry trade), and risk-on/off (the yen is a safe haven)' },
  { id: 'audusd', label: 'AUD/USD', re: /\b(aud\/?usd|aussie|aussie ?dollar)\b/i, category: 'forex', ticker: 'AUD/USD', liveFeed: false, drivers: 'global risk sentiment, commodity and China demand, and the RBA-vs-Fed gap' },
  { id: 'usdcad', label: 'USD/CAD', re: /\b(usd\/?cad|loonie|dollar ?cad)\b/i,   category: 'forex', ticker: 'USD/CAD', liveFeed: false, drivers: 'oil prices (CAD is a commodity currency, so it often moves inverse to oil) and the BoC-vs-Fed gap' },
  { id: 'nas100', label: 'NASDAQ (NAS100)', re: /\b(nas ?100|nasdaq|nas ?daq|us ?tech ?100|ustec)\b/i, category: 'index', ticker: 'IXIC', liveFeed: false, drivers: 'interest-rate expectations (tech is rate-sensitive), big-tech earnings, and risk appetite' },
  { id: 'us30',   label: 'Dow Jones (US30)', re: /\b(us ?30|dow ?jones|dow|djia)\b/i, category: 'index', ticker: 'DJI', liveFeed: false, drivers: 'Fed policy, large-cap earnings, and broad economic sentiment' },
  { id: 'sp500',  label: 'S&P 500', re: /\b(s ?&? ?p ?500|spx|us ?500|standard and poor)\b/i, category: 'index', ticker: 'SPX', liveFeed: false, drivers: 'Fed policy and rates, corporate earnings, and overall risk sentiment' },
  { id: 'dax',    label: 'DAX (GER40)', re: /\b(dax|ger ?40|german ?index|dax ?40)\b/i, category: 'index', ticker: 'DAX', liveFeed: false, drivers: 'ECB policy, German/Eurozone data, energy prices, and global risk sentiment' },
  { id: 'ftse',   label: 'FTSE 100 (UK100)', re: /\b(ftse|uk ?100|footsie)\b/i, category: 'index', ticker: 'UKX', liveFeed: false, drivers: 'BoE policy, its heavy energy/commodity and bank weighting, the pound, and global risk' },
  { id: 'wti',    label: 'WTI Crude Oil', re: /\b(wti|us ?oil|wti ?oil)\b/i, category: 'commodity', ticker: 'WTI', liveFeed: false, drivers: 'OPEC+ supply decisions, global demand, US inventories, geopolitics, and the dollar' },
  { id: 'brent',  label: 'Brent Crude Oil', re: /\b(brent|uk ?oil|brent ?oil)\b/i, category: 'commodity', ticker: 'BRENT', liveFeed: false, drivers: 'OPEC+ supply, global (especially European/Asian) demand, geopolitics, and the dollar' },
  { id: 'silver', label: 'Silver (XAG/USD)', re: /\b(silver|xag\/?usd|xagusd)\b/i, category: 'metal', ticker: 'XAG/USD', liveFeed: false, drivers: 'the same forces as Gold (the dollar, real yields, safe-haven demand) PLUS industrial demand, which makes it more volatile' },
];

// Generic oil/crude with no WTI/Brent qualifier → default to WTI.
export function resolveMarketSymbol(text) {
  const s = String(text || '');
  for (const sym of SYMBOLS) if (sym.re.test(s)) return sym;
  if (/\b(oil|crude)\b/i.test(s)) return SYMBOLS.find(x => x.id === 'wti');
  return null;
}

const DECISION = /\b(should i (buy|sell|hold|long|short)|is it (a )?good time to (buy|sell)|worth (buying|selling|holding)|buy or sell|long or short|is .* a (buy|sell))\b/i;
const WHY = /\bwhy\b|what (happened|is driving|moves|drives|caused)|what'?s (going on|happening|moving)/i;
const DOING = /\b(what (is|'?s) .* doing|how (is|'?s) .* (doing|performing|looking)|price|trading at|quote|rate|what'?s .* (at|now))\b/i;

// Returns { symbol, kind } or null. kind: 'decision' | 'why' | 'doing'.
export function detectInstrumentQuery(text) {
  const symbol = resolveMarketSymbol(text);
  if (!symbol) return null;
  const s = String(text || '');
  if (DECISION.test(s)) return { symbol, kind: 'decision' };
  if (WHY.test(s))      return { symbol, kind: 'why' };
  if (DOING.test(s))    return { symbol, kind: 'doing' };
  return null;
}

// ── Educational analysis (no price invented; never a signal) ──────────────────
const L = {
  en: {
    noLive: s => `I can't verify the current live price for **${s}** right now, so I won't guess one.`,
    tech: s => `📊 **Technical view** — on your chart: is ${s} trending or ranging, and where are the nearest support/resistance levels? Trade with the higher-timeframe trend.`,
    fund: (s, d) => `🌍 **Fundamental view** — ${s} is mainly driven by ${d}. Check the economic calendar for high-impact news on it.`,
    risk: `⚠️ **Risk & reality** — this is **education, not a signal or prediction**. Markets move on *probabilities, never certainty*. Risk only 1–2% and wait for your own confirmation. For live setups our team shares them on **[Telegram](https://t.me/ztradeuniversity)**.`,
    why: (s, d) => `🌍 **What drives ${s}** — it mainly moves on ${d}. Without confirmed live data I can't attribute today's specific move, but those are the forces to watch.`,
  },
  ur: {
    noLive: s => `میں ابھی **${s}** کی live قیمت تصدیق نہیں کر سکتا، اندازہ نہیں لگاؤں گا۔`,
    tech: s => `📊 **تکنیکی** — اپنے chart پر ${s} کا trend اور قریبی support/resistance دیکھیں۔`,
    fund: (s, d) => `🌍 **بنیادی** — ${s} بنیادی طور پر ${d} سے چلتا ہے۔`,
    risk: `⚠️ یہ **تعلیم ہے، signal نہیں** — مارکیٹ امکانات پر چلتی ہے۔ صرف 1–2% رسک کریں۔`,
    why: (s, d) => `🌍 **${s} کو کیا چلاتا ہے** — یہ بنیادی طور پر ${d} سے حرکت کرتا ہے۔`,
  },
  'ur-roman': {
    noLive: s => `Main abhi **${s}** ki live price tasdeeq nahi kar sakta, andaza nahi lagaoon ga.`,
    tech: s => `📊 **Technical** — apne chart par ${s} ka trend aur qareebi support/resistance dekhein.`,
    fund: (s, d) => `🌍 **Bunyadi** — ${s} bunyadi tor par ${d} se chalta hai.`,
    risk: `⚠️ Ye **taleem hai, signal nahi** — market imkanaat par chalti hai. Sirf 1–2% risk karein.`,
    why: (s, d) => `🌍 **${s} ko kya chalata hai** — ye bunyadi tor par ${d} se harkat karta hai.`,
  },
  ar: {
    noLive: s => `لا أستطيع التحقق من السعر الحي لـ **${s}** الآن، ولن أخمّن.`,
    tech: s => `📊 **النظرة الفنية** — على شارتك: هل ${s} في اتجاه أم نطاق، وأين الدعم/المقاومة؟`,
    fund: (s, d) => `🌍 **النظرة الأساسية** — يتحرّك ${s} أساساً بفعل ${d}.`,
    risk: `⚠️ هذا **تعليم وليس إشارة** — الأسواق تتحرك على الاحتمالات. خاطر بـ 1–2% فقط.`,
    why: (s, d) => `🌍 **ما الذي يحرّك ${s}** — يتحرّك أساساً بفعل ${d}.`,
  },
};

// symbol = a SYMBOLS entry. Live-feed instruments delegate to the frozen
// market-context engine; the rest get driver-based educational analysis.
export function buildInstrumentAnalysis({ symbol, marketData, calendarData, lang = 'en', kind = 'doing' } = {}) {
  if (!symbol) return '';
  if (symbol.liveFeed) {
    return buildMarketContext({ marketData, calendarData, instrument: symbol.id === 'btc' ? 'BTC' : 'Gold', lang });
  }
  const t = L[lang] || L.en;
  const name = symbol.label;
  if (kind === 'why') {
    return [t.why(name, symbol.drivers), t.tech(name), t.risk].join('\n\n');
  }
  // decision / doing → full honest educational analysis, no price, no signal
  const head = (kind === 'decision')
    ? ((lang === 'en') ? `I won't tell you to buy or sell **${name}** — ${t.noLive(name).replace(/^I /, 'and I ')}` : t.noLive(name))
    : t.noLive(name);
  return [head, t.tech(name), t.fund(name, symbol.drivers), t.risk].join('\n\n');
}

// Future-ready live price hook: today only Gold/BTC have a feed (from marketData);
// others return null → the honest educational path. Extending /api/sentiment with
// more symbols (or wiring a provider via env) flips liveFeed on — dormant-ready.
export function getLivePrice(marketData, symbol) {
  if (!symbol || !symbol.liveFeed || marketData?.status !== 'ok') return null;
  const d = marketData[symbol.id];
  return (d && d.price != null) ? d : null;
}
