// functions/api/market.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/market
//
// Returns Gold, BTC prices, VIX, and US Treasury yields.
// Cache TTL: 45 seconds
//
// Sources:
//   Gold, BTC → TwelveData (XAU/USD, BTC/USD) | Fallback: gold-api.com (keyless)
//   VIX       → FRED VIXCLS (daily close)
//   Yields    → FRED DGS10 (nominal 10Y), DFII10 (real 10Y)
//
// Response shape:
// {
//   "status":       "ok",
//   "updatedAt":    "ISO timestamp",
//   "sourceStatus": { "fred": "ok", "twelvedata": "ok" },
//   "gold":   { "price": 3250.12, "change": 12.30, "changePct": 0.379, "high": 3268.00, "low": 3241.50 },
//   "btc":    { "price": 68400,   "change": 1200,  "changePct": 1.784, "high": 69100,   "low": 67800   },
//   "vix":    { "value": 15.80,   "change": null,   "changePct": null   },
//   "yields": { "us10y": 4.320, "real10y": 1.850, "us10y_date": "2025-05-14", "real10y_date": "2025-05-14" }
// }
//
// Unavailable fields are explicitly null — never faked.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cachePut }                      from '../utils/cache.js';
import { fetchFRED, fetchTwelveDataQuote,
         fetchGoldAPIPrice }                        from '../utils/fetchers.js';
import { toPrice, toPct, round, buildSourceStatus } from '../utils/normalizers.js';

const CACHE_TTL_SECONDS = 45;

const CORS_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const cached = await cacheGet(request);
  if (cached) return cached;

  const sourceStatus = {};

  const [
    fredUS10Y,
    fredRealYield,
    fredVIX,
    tdGold,
    tdBTC,
  ] = await Promise.allSettled([
    fetchFRED('DGS10',  env.FRED_API_KEY),
    fetchFRED('DFII10', env.FRED_API_KEY),
    fetchFRED('VIXCLS', env.FRED_API_KEY),
    fetchTwelveDataQuote('XAU/USD', env.TWELVEDATA_API_KEY),
    fetchTwelveDataQuote('BTC/USD', env.TWELVEDATA_API_KEY),
  ]);

  // ── FRED: Yields + VIX ────────────────────────────────────────────────────
  let yields  = { us10y: null, real10y: null, us10y_date: null, real10y_date: null };
  let vix     = { value: null, change: null, changePct: null };
  let fredAny = false;

  if (fredUS10Y.status === 'fulfilled' && fredUS10Y.value) {
    yields.us10y      = round(fredUS10Y.value.value, 3);
    yields.us10y_date = fredUS10Y.value.date;
    fredAny = true;
  } else {
    if (env.DEBUG === 'true') { console.error('[/api/market] FRED DGS10 failed:', fredUS10Y.reason?.message); }
  }

  if (fredRealYield.status === 'fulfilled' && fredRealYield.value) {
    yields.real10y      = round(fredRealYield.value.value, 3);
    yields.real10y_date = fredRealYield.value.date;
    fredAny = true;
  } else {
    if (env.DEBUG === 'true') { console.error('[/api/market] FRED DFII10 failed:', fredRealYield.reason?.message); }
  }

  if (fredVIX.status === 'fulfilled' && fredVIX.value) {
    vix.value = round(fredVIX.value.value, 2);
    fredAny   = true;
  } else {
    if (env.DEBUG === 'true') { console.error('[/api/market] FRED VIXCLS failed:', fredVIX.reason?.message); }
  }

  sourceStatus.fred = fredAny ? 'ok' : 'error';

  // ── TwelveData: Gold ──────────────────────────────────────────────────────
  let gold = { price: null, change: null, changePct: null, high: null, low: null };

  if (tdGold.status === 'fulfilled' && tdGold.value) {
    const g        = tdGold.value;
    gold.price     = toPrice(g.price);
    gold.change    = toPrice(g.change);
    gold.changePct = toPct(g.changePct);
    gold.high      = toPrice(g.high);
    gold.low       = toPrice(g.low);
    sourceStatus.twelvedata_gold = 'ok';
  } else {
    if (env.DEBUG === 'true') { console.error('[/api/market] TwelveData XAU/USD failed:', tdGold.reason?.message); }
    sourceStatus.twelvedata_gold = 'error';
    try {
      const ga       = await fetchGoldAPIPrice('XAU');
      gold.price     = toPrice(ga.price);
      gold.change    = toPrice(ga.change);
      gold.changePct = toPct(ga.changePct);
      sourceStatus.twelvedata_gold = 'fallback';
    } catch (err) {
      if (env.DEBUG === 'true') { console.error('[/api/market] gold-api.com XAU failed:', err.message); }
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
    if (env.DEBUG === 'true') { console.error('[/api/market] TwelveData BTC/USD failed:', tdBTC.reason?.message); }
    sourceStatus.twelvedata_btc = 'error';
    try {
      const ga       = await fetchGoldAPIPrice('BTC');
      btc.price      = toPrice(ga.price);
      btc.change     = toPrice(ga.change);
      btc.changePct  = toPct(ga.changePct);
      sourceStatus.twelvedata_btc = 'fallback';
    } catch (err) {
      if (env.DEBUG === 'true') { console.error('[/api/market] gold-api.com BTC failed:', err.message); }
    }
  }

  // Consolidate TwelveData status
  const tdStatuses = [sourceStatus.twelvedata_gold, sourceStatus.twelvedata_btc];
  if (tdStatuses.every(s => s === 'ok'))                          sourceStatus.twelvedata = 'ok';
  else if (tdStatuses.some(s => s === 'ok' || s === 'fallback')) sourceStatus.twelvedata = 'fallback';
  else                                                            sourceStatus.twelvedata = 'error';
  delete sourceStatus.twelvedata_gold;
  delete sourceStatus.twelvedata_btc;

  // ── Assemble response ─────────────────────────────────────────────────────
  const result = {
    status:       'ok',
    updatedAt:    new Date().toISOString(),
    sourceStatus: buildSourceStatus(sourceStatus),
    gold,
    btc,
    vix,
    yields,
  };

  await cachePut(request, result, CACHE_TTL_SECONDS);

  return new Response(JSON.stringify(result), {
    status:  200,
    headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
  });
}
