// functions/api/sentiment.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sentiment
//
// Full macro-sentiment aggregation endpoint. Combines data from all six
// providers into one structured payload consumed by live-sentiment.html
// (Phase 2B wiring).
//
// Cache TTL : 90 seconds
//   Rationale: Balances freshness with API quota protection across six providers.
//   The sentiment model does not need sub-minute updates — macro regime shifts
//   develop over hours, not seconds.
//
// Provider responsibilities:
//   FRED       → US 10Y nominal yield (DGS10) + TIPS/real yield (DFII10)
//   TwelveData → BTC/USD, XAU/USD, DXY — price + change + daily range
//   Finnhub    → VIX quote + economic calendar (next 7 days, high/medium impact)
//   GNews      → Financial headlines (gold, bitcoin, Fed, inflation)
//
// Fallback chain:
//   Gold  : TwelveData → gold-api.com (no key) → null
//   BTC   : TwelveData → gold-api.com (no key) → null
//   DXY   : TwelveData → null (basket reconstruction is unreliable)
//   VIX   : Finnhub → null
//   Yields: FRED → null (no intraday fallback; FRED is end-of-day only)
//
// Response shape:
// {
//   "status":         "ok",
//   "updatedAt":      "ISO timestamp",
//   "sourceStatus":   { "fred": "ok", "twelvedata": "ok", "finnhub": "ok", "news": "ok" },
//   "marketRegime":   { "label": "Risk-On", "dxy_trend": "falling", ... },
//   "dxy":            { "value": 104.20, "change": -0.31, "changePct": -0.297 },
//   "gold":           { "price": 3250.12, "change": 12.30, "changePct": 0.379, "high": 3268.00, "low": 3241.50 },
//   "btc":            { "price": 68400, "change": 1200, "changePct": 1.784, "high": 69100, "low": 67800 },
//   "vix":            { "value": 15.80, "change": -0.40, "changePct": -2.47 },
//   "yields":         { "us10y": 4.320, "real10y": 1.850, "breakeven": 2.470, ... },
//   "economicEvents": [ { "event": "CPI", "date": "...", "impact": "high" }, ... ],
//   "news":           [ { "title": "...", "source": "...", "assets": ["gold"] }, ... ]
// }
//
// All unavailable fields are explicitly null. No fake data is ever returned.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cachePut }                           from '../utils/cache.js';
import {
  fetchFRED,
  fetchTwelveDataQuote,
  fetchGoldAPIPrice,
  fetchFinnhubQuote,
  fetchFinnhubCalendar,
  fetchGNewsHeadlines,
}                                                        from '../utils/fetchers.js';
import {
  toPrice,
  toPct,
  round,
  normalizeGNewsItem,
  buildSourceStatus,
}                                                        from '../utils/normalizers.js';

const CACHE_TTL_SECONDS = 90;

const CORS_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// ─── MARKET REGIME CLASSIFIER ─────────────────────────────────────────────────
// Rule-based regime from VIX level + DXY trend + yield spread.
//
// Phase 2B upgrade: replace with the weighted multi-factor composite scoring
// engine from SENTIMENT_DATA (gold/btc factor tables → composite score →
// regime label). The function signature and return shape are preserved for
// that wiring. All fields that can't yet be computed are explicitly null.

/**
 * Determine a macro market regime from available data points.
 *
 * @param {{ vix: object, dxy: object, yields: object }} inputs
 * @returns {{ label, dxy_trend, yield_trend, vix_level, breakeven_inflation, note }}
 */
function determineMarketRegime({ vix, dxy, yields }) {
  const vixVal    = vix?.value         ?? null;
  const dxyChPct  = dxy?.changePct     ?? null;
  const us10y     = yields?.us10y      ?? null;
  const real10y   = yields?.real10y    ?? null;

  // ── VIX-based risk label ────────────────────────────────────────────────
  let label = 'Neutral';
  if (vixVal !== null) {
    if      (vixVal < 15)  label = 'Risk-On';
    else if (vixVal >= 25) label = 'Risk-Off';
    else if (vixVal >= 20) label = 'Elevated Caution';
    // 15–20: Neutral (default)
  }

  // ── DXY trend ─────────────────────────────────────────────────────────
  let dxy_trend = null;
  if (dxyChPct !== null) {
    if      (dxyChPct >  0.10) dxy_trend = 'rising';
    else if (dxyChPct < -0.10) dxy_trend = 'falling';
    else                        dxy_trend = 'flat';
  }

  // ── Breakeven inflation (nominal − real yield spread) ─────────────────
  // A rising breakeven → inflation expectations increasing → typically
  // bullish Gold, mixed for BTC, bearish for Treasuries.
  let breakeven_inflation = null;
  if (us10y !== null && real10y !== null) {
    breakeven_inflation = round(us10y - real10y, 3);
  }

  return {
    label,
    dxy_trend,
    yield_trend:          null, // Phase 2B: derive from rolling FRED DGS10 delta
    vix_level:            vixVal,
    breakeven_inflation,
    // Phase 2B: replace this note with confidence score from composite engine
    note: 'Phase 1 regime: VIX + DXY signal only. Phase 2B wires multi-factor composite scoring.',
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;

  // ── CORS preflight ────────────────────────────────────────────────────────
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── Cache check ───────────────────────────────────────────────────────────
  const cached = await cacheGet(request);
  if (cached) return cached;

  const sourceStatus = {};

  // ── Parallel fetch — all providers simultaneously ─────────────────────────
  // Promise.allSettled ensures one failed provider never blocks others.
  // Sequential fallbacks for failed providers run after this block.
  const [
    fredUS10Y,
    fredRealYield,
    tdGold,       // TwelveData: XAU/USD (change + range data)
    tdBTC,        // TwelveData: BTC/USD
    tdDXY,        // TwelveData: DXY index
    fhVIX,        // Finnhub: ^VIX
    fhCalendar,   // Finnhub: economic calendar
    rawNews,      // GNews: financial headlines
  ] = await Promise.allSettled([
    fetchFRED('DGS10',  env.FRED_API_KEY),
    fetchFRED('DFII10', env.FRED_API_KEY),
    fetchTwelveDataQuote('XAU/USD', env.TWELVEDATA_API_KEY),
    fetchTwelveDataQuote('BTC/USD', env.TWELVEDATA_API_KEY),
    fetchTwelveDataQuote('DXY',     env.TWELVEDATA_API_KEY),
    fetchFinnhubQuote('^VIX',       env.FINNHUB_API_KEY),
    fetchFinnhubCalendar(env.FINNHUB_API_KEY),
    fetchGNewsHeadlines(env.NEWS_API_KEY),
  ]);

  // ── FRED: Yields ──────────────────────────────────────────────────────────
  let yields  = { us10y: null, real10y: null, breakeven: null,
                  us10y_date: null, real10y_date: null };
  let fredAny = false;

  if (fredUS10Y.status === 'fulfilled' && fredUS10Y.value) {
    yields.us10y      = round(fredUS10Y.value.value, 3);
    yields.us10y_date = fredUS10Y.value.date;
    fredAny = true;
  } else {
    console.error('[/api/sentiment] FRED DGS10 failed:', fredUS10Y.reason?.message);
  }

  if (fredRealYield.status === 'fulfilled' && fredRealYield.value) {
    yields.real10y      = round(fredRealYield.value.value, 3);
    yields.real10y_date = fredRealYield.value.date;
    fredAny = true;
  } else {
    console.error('[/api/sentiment] FRED DFII10 failed:', fredRealYield.reason?.message);
  }

  if (yields.us10y !== null && yields.real10y !== null) {
    yields.breakeven = round(yields.us10y - yields.real10y, 3);
  }
  sourceStatus.fred = fredAny ? 'ok' : 'error';

  // ── Gold: TwelveData primary → gold-api.com ──────────────────────────────
  let gold = { price: null, change: null, changePct: null, high: null, low: null };

  if (tdGold.status === 'fulfilled' && tdGold.value) {
    const g        = tdGold.value;
    gold.price     = toPrice(g.price);
    gold.change    = toPrice(g.change);
    gold.changePct = toPct(g.changePct);
    gold.high      = toPrice(g.high);
    gold.low       = toPrice(g.low);
    sourceStatus.twelvedata = 'ok';
  } else {
    console.error('[/api/sentiment] TwelveData XAU/USD failed:', tdGold.reason?.message);
    sourceStatus.twelvedata = 'error';
    // Fallback: gold-api.com (no API key required)
    try {
      const gaG      = await fetchGoldAPIPrice('XAU');
      gold.price     = toPrice(gaG.price);
      gold.change    = toPrice(gaG.change);
      gold.changePct = toPct(gaG.changePct);
      sourceStatus.twelvedata = 'fallback';
    } catch (err) {
      console.error('[/api/sentiment] gold-api.com XAU fallback failed:', err.message);
    }
  }

  // ── BTC: TwelveData primary → gold-api.com ───────────────────────────────
  let btc = { price: null, change: null, changePct: null, high: null, low: null };

  if (tdBTC.status === 'fulfilled' && tdBTC.value) {
    const b        = tdBTC.value;
    btc.price      = toPrice(b.price);
    btc.change     = toPrice(b.change);
    btc.changePct  = toPct(b.changePct);
    btc.high       = toPrice(b.high);
    btc.low        = toPrice(b.low);
    // Twelvedata status already tracked from gold; degrade to 'fallback' if gold was ok but BTC wasn't
  } else {
    console.error('[/api/sentiment] TwelveData BTC/USD failed:', tdBTC.reason?.message);
    if (sourceStatus.twelvedata === 'ok') sourceStatus.twelvedata = 'fallback';
    // Fallback: gold-api.com (no API key required)
    try {
      const gaB      = await fetchGoldAPIPrice('BTC');
      btc.price      = toPrice(gaB.price);
      btc.change     = toPrice(gaB.change);
      btc.changePct  = toPct(gaB.changePct);
    } catch (err) {
      console.error('[/api/sentiment] gold-api.com BTC fallback failed:', err.message);
    }
  }

  // ── DXY: TwelveData only ──────────────────────────────────────────────────
  let dxy = { value: null, change: null, changePct: null };

  if (tdDXY.status === 'fulfilled' && tdDXY.value) {
    dxy.value     = toPrice(tdDXY.value.price);
    dxy.change    = toPrice(tdDXY.value.change);
    dxy.changePct = toPct(tdDXY.value.changePct);
    // Doesn't change twelvedata status (already tracked from gold/btc)
  } else {
    console.error('[/api/sentiment] TwelveData DXY failed:', tdDXY.reason?.message);
    // DXY basket is EUR 57.6%, JPY 13.6%, GBP 11.9%, CAD 9.1%, SEK 4.2%, CHF 3.6%.
    // Reconstructing without precise weights is unreliable — leave null.
  }

  // ── VIX: Finnhub ─────────────────────────────────────────────────────────
  let vix = { value: null, change: null, changePct: null };

  if (fhVIX.status === 'fulfilled' && fhVIX.value) {
    vix.value     = typeof fhVIX.value.current === 'number' ? toPrice(fhVIX.value.current) : null;
    vix.change    = toPrice(fhVIX.value.change);
    vix.changePct = toPct(fhVIX.value.changePct);
    sourceStatus.finnhub = 'ok';
  } else {
    console.error('[/api/sentiment] Finnhub ^VIX failed:', fhVIX.reason?.message);
    sourceStatus.finnhub = 'error';
  }

  // ── Economic Calendar ─────────────────────────────────────────────────────
  let economicEvents = [];

  if (fhCalendar.status === 'fulfilled' && Array.isArray(fhCalendar.value)) {
    economicEvents = fhCalendar.value;
    // Calendar status folds into finnhub — already set above
  } else {
    console.error('[/api/sentiment] Finnhub calendar failed:', fhCalendar.reason?.message);
    // Calendar failure doesn't override VIX status — both come from Finnhub
    // but are independent calls. If calendar fails, we still have VIX data.
  }

  // ── News ──────────────────────────────────────────────────────────────────
  let news = [];

  if (rawNews.status === 'fulfilled' && Array.isArray(rawNews.value)) {
    news = rawNews.value.map(normalizeGNewsItem).filter(Boolean).slice(0, 8);
    sourceStatus.news = 'ok';
  } else {
    console.error('[/api/sentiment] GNews failed:', rawNews.reason?.message);
    sourceStatus.news = 'error';
  }

  // ── Market Regime ─────────────────────────────────────────────────────────
  const marketRegime = determineMarketRegime({ vix, dxy, yields });

  // ── Assemble final response ───────────────────────────────────────────────
  const result = {
    status:         'ok',
    updatedAt:      new Date().toISOString(), // real assembly time — never faked
    sourceStatus:   buildSourceStatus(sourceStatus),
    marketRegime,
    dxy,
    gold,
    btc,
    vix,
    yields,
    economicEvents,
    news,
  };

  await cachePut(request, result, CACHE_TTL_SECONDS);

  return new Response(JSON.stringify(result), {
    status:  200,
    headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
  });
}
