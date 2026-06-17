// functions/api/sentiment.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sentiment
//
// Macro-sentiment aggregation endpoint.
// Cache TTL: 90 seconds
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
//   "marketRegime": { "label": "Risk-On", "vix_level": 14.5, "breakeven_inflation": 2.470 },
//   "gold":   { "price": 3250.12, "change": 12.30, "changePct": 0.379, "high": 3268.00, "low": 3241.50 },
//   "btc":    { "price": 68400,   "change": 1200,  "changePct": 1.784, "high": 69100,   "low": 67800   },
//   "vix":    { "value": 15.80,   "change": null,   "changePct": null   },
//   "yields": { "us10y": 4.320, "real10y": 1.850, "breakeven": 2.470, "us10y_date": "...", "real10y_date": "..." }
// }
//
// Unavailable fields are explicitly null — never faked.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cachePut }                      from '../utils/cache.js';
import { fetchFRED, fetchTwelveDataQuote,
         fetchGoldAPIPrice }                        from '../utils/fetchers.js';
import { toPrice, toPct, round, buildSourceStatus } from '../utils/normalizers.js';

const CACHE_TTL_SECONDS = 90;

const CORS_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// ─── MARKET REGIME CLASSIFIER ─────────────────────────────────────────────────
// VIX-based risk label + breakeven inflation derived from yield spread.

function determineMarketRegime({ vix, yields }) {
  const vixVal  = vix?.value      ?? null;
  const us10y   = yields?.us10y   ?? null;
  const real10y = yields?.real10y ?? null;

  let label = 'Neutral';
  if (vixVal !== null) {
    if      (vixVal < 15)  label = 'Risk-On';
    else if (vixVal >= 25) label = 'Risk-Off';
    else if (vixVal >= 20) label = 'Elevated Caution';
    // 15–20: Neutral (default)
  }

  let breakeven_inflation = null;
  if (us10y !== null && real10y !== null) {
    breakeven_inflation = round(us10y - real10y, 3);
  }

  return {
    label,
    vix_level:           vixVal,
    breakeven_inflation,
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── TEMP-DIAG (remove after FRED root-cause) — GET /api/sentiment?diag=fred
  // Performs the REAL FRED calls with the production env.FRED_API_KEY and returns the
  // raw HTTP status + FRED error_message per series (which the normal path discards),
  // plus a masked key fingerprint so we can confirm the running deployment reads the
  // NEW key. Not cached. Exposes only masked key info (never the secret).
  try {
    const _u = new URL(request.url);
    if (_u.searchParams.get('diag') === 'fred') {
      const _k = env.FRED_API_KEY;
      const _present = typeof _k === 'string' && _k.length > 0;
      const _kt = _present ? _k.trim() : '';
      const _mask = _present ? `${_k.slice(0, 2)}…${_k.slice(-2)} (len ${_k.length})` : '(missing/empty)';
      // Probe one series with a given key; capture status + FRED error_message OR raw body.
      const probe = async (sid, key) => {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${sid}&api_key=${encodeURIComponent(key)}&limit=1&sort_order=desc&file_type=json`;
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const txt = await r.text().catch(() => '');
          let error_message = null, sampleValue = null;
          try { const j = JSON.parse(txt); if (r.ok) sampleValue = j?.observations?.[0]?.value ?? null; else error_message = j?.error_message || null; }
          catch { error_message = txt ? txt.slice(0, 200) : `HTTP ${r.status}`; }
          return { status: r.status, ok: r.ok, error_message, sampleValue };
        } catch (e) { return { status: null, ok: false, error_message: String((e && e.message) || e), sampleValue: null }; }
      };
      const results = [];
      for (const sid of ['DGS10', 'DFII10', 'VIXCLS']) {
        results.push({ series_id: sid, raw: await probe(sid, _k ?? ''), trimmed: await probe(sid, _kt) });
      }
      return new Response(JSON.stringify({
        diag: 'fred',
        keyPresent: _present,
        keyFingerprint: _mask,
        keyLenRaw: _present ? _k.length : 0,
        keyLenTrimmed: _kt.length,
        trimChangesValue: _present ? (_k !== _kt) : false,
        trailingCharCodes: _present ? [..._k.slice(-3)].map(c => c.charCodeAt(0)) : [],   // e.g. [...,50,10] → trailing \n
        results,
        fredAnyRaw: results.some(r => r.raw.ok),
        fredAnyTrimmed: results.some(r => r.trimmed.ok),
        sourceStatus: { fred: results.some(r => r.trimmed.ok) ? 'ok(after-trim)' : 'error' },
      }, null, 2), { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ diag: 'fred', fatal: String((e && e.message) || e) }), { headers: CORS_HEADERS });
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
  let yields  = { us10y: null, real10y: null, breakeven: null, us10y_date: null, real10y_date: null };
  let vix     = { value: null, change: null, changePct: null };
  let fredAny = false;

  if (fredUS10Y.status === 'fulfilled' && fredUS10Y.value) {
    yields.us10y      = round(fredUS10Y.value.value, 3);
    yields.us10y_date = fredUS10Y.value.date;
    fredAny = true;
  } else {
    if (env.DEBUG === 'true') { console.error('[/api/sentiment] FRED DGS10 failed:', fredUS10Y.reason?.message); }
  }

  if (fredRealYield.status === 'fulfilled' && fredRealYield.value) {
    yields.real10y      = round(fredRealYield.value.value, 3);
    yields.real10y_date = fredRealYield.value.date;
    fredAny = true;
  } else {
    if (env.DEBUG === 'true') { console.error('[/api/sentiment] FRED DFII10 failed:', fredRealYield.reason?.message); }
  }

  if (fredVIX.status === 'fulfilled' && fredVIX.value) {
    vix.value = round(fredVIX.value.value, 2);
    fredAny   = true;
  } else {
    if (env.DEBUG === 'true') { console.error('[/api/sentiment] FRED VIXCLS failed:', fredVIX.reason?.message); }
  }

  if (yields.us10y !== null && yields.real10y !== null) {
    yields.breakeven = round(yields.us10y - yields.real10y, 3);
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
    if (env.DEBUG === 'true') { console.error('[/api/sentiment] TwelveData XAU/USD failed:', tdGold.reason?.message); }
    sourceStatus.twelvedata_gold = 'error';
    try {
      const ga       = await fetchGoldAPIPrice('XAU');
      gold.price     = toPrice(ga.price);
      gold.change    = toPrice(ga.change);
      gold.changePct = toPct(ga.changePct);
      sourceStatus.twelvedata_gold = 'fallback';
    } catch (err) {
      if (env.DEBUG === 'true') { console.error('[/api/sentiment] gold-api.com XAU failed:', err.message); }
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
    if (env.DEBUG === 'true') { console.error('[/api/sentiment] TwelveData BTC/USD failed:', tdBTC.reason?.message); }
    sourceStatus.twelvedata_btc = 'error';
    try {
      const ga       = await fetchGoldAPIPrice('BTC');
      btc.price      = toPrice(ga.price);
      btc.change     = toPrice(ga.change);
      btc.changePct  = toPct(ga.changePct);
      sourceStatus.twelvedata_btc = 'fallback';
    } catch (err) {
      if (env.DEBUG === 'true') { console.error('[/api/sentiment] gold-api.com BTC failed:', err.message); }
    }
  }

  // Consolidate TwelveData status
  const tdStatuses = [sourceStatus.twelvedata_gold, sourceStatus.twelvedata_btc];
  if (tdStatuses.every(s => s === 'ok'))                          sourceStatus.twelvedata = 'ok';
  else if (tdStatuses.some(s => s === 'ok' || s === 'fallback')) sourceStatus.twelvedata = 'fallback';
  else                                                            sourceStatus.twelvedata = 'error';
  delete sourceStatus.twelvedata_gold;
  delete sourceStatus.twelvedata_btc;

  // ── Market Regime ─────────────────────────────────────────────────────────
  const marketRegime = determineMarketRegime({ vix, yields });

  // ── Assemble response ─────────────────────────────────────────────────────
  const result = {
    status:       'ok',
    updatedAt:    new Date().toISOString(),
    sourceStatus: buildSourceStatus(sourceStatus),
    marketRegime,
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
