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
//   FRED         → US 10Y nominal yield (DGS10) + TIPS/real yield (DFII10)
//   Alpha Vantage → XAU/USD realtime spot (confirmation layer against TwelveData)
//   TwelveData   → BTC/USD, XAU/USD, DXY — price + change + daily range
//   Finnhub      → VIX quote + economic calendar (next 7 days, high/medium impact)
//   FMP          → Fallback pricing for Gold, BTC, VIX when primaries fail
//   NewsAPI      → Financial headlines (gold, bitcoin, Fed, inflation)
//
// Fallback chain:
//   Gold  : TwelveData → Alpha Vantage → FMP → null
//   BTC   : TwelveData → FMP → null
//   DXY   : TwelveData → null (basket reconstruction is unreliable)
//   VIX   : Finnhub    → FMP → null
//   Yields: FRED → null (no intraday fallback; FRED is end-of-day only)
//
// Response shape:
// {
//   "status":         "ok",
//   "updatedAt":      "ISO timestamp",
//   "sourceStatus":   { "fred": "ok", "alphavantage": "ok", ... },
//   "marketRegime":   { "label": "Risk-On", "dxy_trend": "falling", ... },
//   "dxy":            { "value": 104.20, "change": -0.31, "changePct": -0.297 },
//   "gold":           { "price": 3250.12, "avSpot": 3249.80, "change": 12.30, ... },
//   "btc":            { "price": 68400, "change": 1200, "changePct": 1.784, ... },
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
  fetchAlphaVantageRate,
  fetchTwelveDataQuote,
  fetchFinnhubQuote,
  fetchFinnhubCalendar,
  fetchFMPQuote,
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
  let fmpStatus      = 'unused'; // FMP is fallback-only; track separately

  // ── Parallel fetch — all six providers simultaneously ─────────────────────
  // Promise.allSettled ensures one failed provider never blocks others.
  // Sequential fallbacks for failed providers run after this block.
  const [
    fredUS10Y,
    fredRealYield,
    avGold,       // Alpha Vantage: XAU/USD spot (realtime confirmation)
    tdGold,       // TwelveData: XAU/USD (change + range data)
    tdBTC,        // TwelveData: BTC/USD
    tdDXY,        // TwelveData: DXY index
    fhVIX,        // Finnhub: ^VIX
    fhCalendar,   // Finnhub: economic calendar
    rawNews,      // NewsAPI: financial headlines
  ] = await Promise.allSettled([
    fetchFRED('DGS10',  env.FRED),
    fetchFRED('DFII10', env.FRED),
    fetchAlphaVantageRate('XAU', 'USD', env['ALFA VANTAGE key']),
    fetchTwelveDataQuote('XAU/USD', env.TWELVEDATA_API_KEY),
    fetchTwelveDataQuote('BTC/USD', env.TWELVEDATA_API_KEY),
    fetchTwelveDataQuote('DXY',     env.TWELVEDATA_API_KEY),
    fetchFinnhubQuote('^VIX',       env.FINNHUB_API_KEY),
    fetchFinnhubCalendar(env.FINNHUB_API_KEY),
    fetchGNewsHeadlines(env.GNEWS_API_KEY),
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

  // ── Gold: TwelveData primary → Alpha Vantage → FMP ───────────────────────
  let gold = { price: null, avSpot: null, change: null, changePct: null,
               high: null, low: null };

  // Primary: TwelveData (has change + range data)
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
  }

  // Alpha Vantage: realtime spot confirmation (runs regardless of TwelveData result)
  if (avGold.status === 'fulfilled' && avGold.value) {
    gold.avSpot = toPrice(avGold.value.rate);
    // Use AV spot as primary price if TwelveData failed
    if (gold.price === null) {
      gold.price = gold.avSpot;
      if (sourceStatus.twelvedata === 'error') sourceStatus.twelvedata = 'fallback';
    }
    sourceStatus.alphavantage = 'ok';
  } else {
    console.error('[/api/sentiment] Alpha Vantage XAU/USD failed:', avGold.reason?.message);
    sourceStatus.alphavantage = 'error';
  }

  // FMP fallback: only if both TwelveData and Alpha Vantage failed for price
  if (gold.price === null) {
    try {
      const fmpG     = await fetchFMPQuote('XAUUSD', env.FMP_API_KEY);
      gold.price     = toPrice(fmpG.price);
      gold.change    = toPrice(fmpG.change);
      gold.changePct = toPct(fmpG.changePct);
      gold.high      = toPrice(fmpG.dayHigh);
      gold.low       = toPrice(fmpG.dayLow);
      sourceStatus.twelvedata = 'fallback';
      fmpStatus = 'ok';
    } catch (err) {
      console.error('[/api/sentiment] FMP XAUUSD fallback failed:', err.message);
      fmpStatus = 'error';
    }
  }

  // ── BTC: TwelveData primary → FMP ────────────────────────────────────────
  let btc = { price: null, change: null, changePct: null, high: null, low: null };

  if (tdBTC.status === 'fulfilled' && tdBTC.value) {
    const b        = tdBTC.value;
    btc.price      = toPrice(b.price);
    btc.change     = toPrice(b.change);
    btc.changePct  = toPct(b.changePct);
    btc.high       = toPrice(b.high);
    btc.low        = toPrice(b.low);
    // Don't override twelvedata status if already set to 'ok'; keep best status
  } else {
    console.error('[/api/sentiment] TwelveData BTC/USD failed:', tdBTC.reason?.message);
    // Fallback: FMP BTCUSD
    try {
      const fmpB    = await fetchFMPQuote('BTCUSD', env.FMP_API_KEY);
      btc.price     = toPrice(fmpB.price);
      btc.change    = toPrice(fmpB.change);
      btc.changePct = toPct(fmpB.changePct);
      btc.high      = toPrice(fmpB.dayHigh);
      btc.low       = toPrice(fmpB.dayLow);
      if (fmpStatus !== 'ok') fmpStatus = 'ok';
      // Mark twelvedata as partial fallback if gold was ok but BTC wasn't
      if (sourceStatus.twelvedata === 'ok') sourceStatus.twelvedata = 'fallback';
    } catch (err) {
      console.error('[/api/sentiment] FMP BTCUSD fallback failed:', err.message);
      if (fmpStatus === 'unused') fmpStatus = 'error';
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

  // ── VIX: Finnhub primary → FMP ────────────────────────────────────────────
  let vix = { value: null, change: null, changePct: null };

  if (fhVIX.status === 'fulfilled' && fhVIX.value) {
    vix.value     = toPrice(fhVIX.value.current);
    vix.change    = toPrice(fhVIX.value.change);
    vix.changePct = toPct(fhVIX.value.changePct);
    sourceStatus.finnhub = 'ok';
  } else {
    console.error('[/api/sentiment] Finnhub ^VIX failed:', fhVIX.reason?.message);
    sourceStatus.finnhub = 'error';
    // Fallback: FMP ^VIX
    try {
      const fmpVIX  = await fetchFMPQuote('^VIX', env.FMP_API_KEY);
      vix.value     = toPrice(fmpVIX.price);
      vix.change    = toPrice(fmpVIX.change);
      vix.changePct = toPct(fmpVIX.changePct);
      sourceStatus.finnhub = 'fallback';
      if (fmpStatus !== 'ok') fmpStatus = 'ok';
    } catch (err) {
      console.error('[/api/sentiment] FMP ^VIX fallback failed:', err.message);
      if (fmpStatus === 'unused') fmpStatus = 'error';
    }
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

  // ── FMP consolidated status ───────────────────────────────────────────────
  sourceStatus.fmp = fmpStatus;

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
