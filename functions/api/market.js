// functions/api/market.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/market
//
// Fast market data endpoint. Returns current prices, daily changes, and
// yield data for Gold, BTC, DXY, VIX, and US Treasury yields.
//
// Designed for frequent polling (live price updates in the frontend).
//
// Cache TTL : 45 seconds
//   Rationale: Short enough to feel live; long enough to protect API quotas.
//   TwelveData and Finnhub handle intraday data well at this frequency.
//
// Primary sources:
//   Gold    → TwelveData (XAU/USD) │ Fallback: FMP (XAUUSD)
//   BTC     → TwelveData (BTC/USD) │ Fallback: FMP (BTCUSD)
//   DXY     → TwelveData (DXY)     │ Fallback: null (DXY basket is complex to reconstruct)
//   VIX     → Finnhub   (^VIX)     │ Fallback: FMP (^VIX)
//   Yields  → FRED      (DGS10, DFII10) — end-of-day, no intraday fallback
//
// Response shape:
// {
//   "status":    "ok",
//   "updatedAt": "ISO timestamp",
//   "sourceStatus": { "fred": "ok", "twelvedata": "ok", "finnhub": "ok", "fmp": "unused" },
//   "gold":   { "price": 3250.12, "change": 12.30, "changePct": 0.379, "high": 3268.00, "low": 3241.50 },
//   "btc":    { "price": 68400,   "change": 1200,  "changePct": 1.784, "high": 69100,   "low": 67800   },
//   "dxy":    { "value": 104.20,  "change": -0.31, "changePct": -0.297 },
//   "vix":    { "value": 15.80,   "change": -0.40, "changePct": -2.47  },
//   "yields": { "us10y": 4.320, "real10y": 1.850, "us10y_date": "2025-05-14", "real10y_date": "2025-05-14" }
// }
//
// If a value is unavailable, the relevant field is null — never faked.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cachePut }                      from '../utils/cache.js';
import { fetchFRED, fetchTwelveDataQuote,
         fetchFinnhubQuote, fetchFMPQuote }         from '../utils/fetchers.js';
import { toPrice, toPct, round, buildSourceStatus } from '../utils/normalizers.js';

const CACHE_TTL_SECONDS = 45;

const CORS_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

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

  // ── Parallel fetch — all primary providers at once ────────────────────────
  // Promise.allSettled ensures one slow/failed provider never blocks the rest.
  const [
    fredUS10Y,
    fredRealYield,
    tdGold,
    tdBTC,
    tdDXY,
    fhVIX,
  ] = await Promise.allSettled([
    fetchFRED('DGS10',  env.FRED),
    fetchFRED('DFII10', env.FRED),
    fetchTwelveDataQuote('XAU/USD', env.TWELVEDATA_API_KEY),
    fetchTwelveDataQuote('BTC/USD', env.TWELVEDATA_API_KEY),
    fetchTwelveDataQuote('DXY',     env.TWELVEDATA_API_KEY),
    fetchFinnhubQuote('^VIX',       env.FINNHUB_API_KEY),
  ]);

  // ── FRED: Yields ──────────────────────────────────────────────────────────
  let yields  = { us10y: null, real10y: null, us10y_date: null, real10y_date: null };
  let fredAny = false;

  if (fredUS10Y.status === 'fulfilled' && fredUS10Y.value) {
    yields.us10y      = round(fredUS10Y.value.value, 3);
    yields.us10y_date = fredUS10Y.value.date;
    fredAny = true;
  } else if (fredUS10Y.status === 'rejected') {
    console.error('[/api/market] FRED DGS10 failed:', fredUS10Y.reason?.message);
  }

  if (fredRealYield.status === 'fulfilled' && fredRealYield.value) {
    yields.real10y      = round(fredRealYield.value.value, 3);
    yields.real10y_date = fredRealYield.value.date;
    fredAny = true;
  } else if (fredRealYield.status === 'rejected') {
    console.error('[/api/market] FRED DFII10 failed:', fredRealYield.reason?.message);
  }

  sourceStatus.fred = fredAny ? 'ok' : 'error';

  // ── TwelveData: Gold ──────────────────────────────────────────────────────
  let gold         = { price: null, change: null, changePct: null, high: null, low: null };
  let fmpStatus    = 'unused';

  if (tdGold.status === 'fulfilled' && tdGold.value) {
    const g       = tdGold.value;
    gold.price     = toPrice(g.price);
    gold.change    = toPrice(g.change);
    gold.changePct = toPct(g.changePct);
    gold.high      = toPrice(g.high);
    gold.low       = toPrice(g.low);
    sourceStatus.twelvedata_gold = 'ok';
  } else {
    console.error('[/api/market] TwelveData XAU/USD failed:', tdGold.reason?.message);
    sourceStatus.twelvedata_gold = 'error';
    // Fallback: FMP XAUUSD
    try {
      const fmpG     = await fetchFMPQuote('XAUUSD', env.FMP_API_KEY);
      gold.price     = toPrice(fmpG.price);
      gold.change    = toPrice(fmpG.change);
      gold.changePct = toPct(fmpG.changePct);
      gold.high      = toPrice(fmpG.dayHigh);
      gold.low       = toPrice(fmpG.dayLow);
      sourceStatus.twelvedata_gold = 'fallback';
      fmpStatus = 'ok';
    } catch (err) {
      console.error('[/api/market] FMP XAUUSD fallback failed:', err.message);
      fmpStatus = 'error';
    }
  }

  // ── TwelveData: BTC ───────────────────────────────────────────────────────
  let btc = { price: null, change: null, changePct: null, high: null, low: null };

  if (tdBTC.status === 'fulfilled' && tdBTC.value) {
    const b        = tdBTC.value;
    btc.price      = toPrice(b.price);
    btc.change     = toPrice(b.change);
    btc.changePct  = toPct(b.changePct);
    btc.high       = toPrice(b.high);
    btc.low        = toPrice(b.low);
    sourceStatus.twelvedata_btc = 'ok';
  } else {
    console.error('[/api/market] TwelveData BTC/USD failed:', tdBTC.reason?.message);
    sourceStatus.twelvedata_btc = 'error';
    // Fallback: FMP BTCUSD
    try {
      const fmpB    = await fetchFMPQuote('BTCUSD', env.FMP_API_KEY);
      btc.price     = toPrice(fmpB.price);
      btc.change    = toPrice(fmpB.change);
      btc.changePct = toPct(fmpB.changePct);
      btc.high      = toPrice(fmpB.dayHigh);
      btc.low       = toPrice(fmpB.dayLow);
      sourceStatus.twelvedata_btc = 'fallback';
      if (fmpStatus !== 'ok') fmpStatus = 'ok'; // any FMP success = ok
    } catch (err) {
      console.error('[/api/market] FMP BTCUSD fallback failed:', err.message);
      if (fmpStatus === 'unused') fmpStatus = 'error';
    }
  }

  // ── TwelveData: DXY ───────────────────────────────────────────────────────
  let dxy = { value: null, change: null, changePct: null };

  if (tdDXY.status === 'fulfilled' && tdDXY.value) {
    dxy.value     = toPrice(tdDXY.value.price);
    dxy.change    = toPrice(tdDXY.value.change);
    dxy.changePct = toPct(tdDXY.value.changePct);
    sourceStatus.twelvedata_dxy = 'ok';
  } else {
    console.error('[/api/market] TwelveData DXY failed:', tdDXY.reason?.message);
    sourceStatus.twelvedata_dxy = 'error';
    // Note: DXY is a currency basket (EUR 57.6%, JPY 13.6%, GBP 11.9%, etc.).
    // Reconstructing it from individual pairs is unreliable without precise weights.
    // dxy fields remain null until a DXY-specific source is available.
  }

  // Consolidate twelvedata status
  const tdStatuses = [
    sourceStatus.twelvedata_gold,
    sourceStatus.twelvedata_btc,
    sourceStatus.twelvedata_dxy,
  ];
  if (tdStatuses.every(s => s === 'ok'))       sourceStatus.twelvedata = 'ok';
  else if (tdStatuses.some(s => s === 'ok'))   sourceStatus.twelvedata = 'fallback';
  else if (tdStatuses.some(s => s === 'fallback')) sourceStatus.twelvedata = 'fallback';
  else                                          sourceStatus.twelvedata = 'error';

  // Remove granular sub-keys (keep top-level clean)
  delete sourceStatus.twelvedata_gold;
  delete sourceStatus.twelvedata_btc;
  delete sourceStatus.twelvedata_dxy;

  // ── Finnhub: VIX ─────────────────────────────────────────────────────────
  let vix = { value: null, change: null, changePct: null };

  if (fhVIX.status === 'fulfilled' && fhVIX.value) {
    vix.value     = toPrice(fhVIX.value.current);
    vix.change    = toPrice(fhVIX.value.change);
    vix.changePct = toPct(fhVIX.value.changePct);
    sourceStatus.finnhub = 'ok';
  } else {
    console.error('[/api/market] Finnhub ^VIX failed:', fhVIX.reason?.message);
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
      console.error('[/api/market] FMP ^VIX fallback failed:', err.message);
      if (fmpStatus === 'unused') fmpStatus = 'error';
    }
  }

  sourceStatus.fmp = fmpStatus;

  // ── Assemble response ─────────────────────────────────────────────────────
  const result = {
    status:       'ok',
    updatedAt:    new Date().toISOString(),
    sourceStatus: buildSourceStatus(sourceStatus),
    gold,
    btc,
    dxy,
    vix,
    yields,
  };

  await cachePut(request, result, CACHE_TTL_SECONDS);

  return new Response(JSON.stringify(result), {
    status:  200,
    headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
  });
}
