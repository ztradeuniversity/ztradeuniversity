// functions/api/market-history.js
// ════════════════════════════════════════════════════════════════════════════
// HISTORICAL / OHLC MARKET CONTEXT  —  GET /api/market-history
//
// The gap this closes: /api/market returns a live quote only (price, session
// high/low, change). Every structural question ZTU Rescue wants to answer —
// trend, support, resistance, volatility, what the market looked like on the day
// a layer was opened — needs candles, and the project had no source for them.
// So Rescue has been reporting those layers "not independently verified".
//
// CREDENTIAL: none new. This uses the EXISTING TWELVEDATA_API_KEY, the same
// account whose /quote endpoint is verified working in production
// (sourceStatus.twelvedata === "ok"). /time_series is that account's own
// endpoint. If the configured plan refuses the request, this returns
// status:"unavailable" with the provider's reason — it never estimates.
//
//   GET /api/market-history?symbol=XAU/USD&interval=1day&outputsize=60
//   GET /api/market-history?symbol=XAU/USD&dates=2026-09-05,2026-09-06
//
// `dates` returns the daily candle covering each requested date, which is what
// gives an entry timestamp verifiable market context. A date with no candle
// (weekend, holiday, outside plan depth) comes back explicitly unmatched.
// ════════════════════════════════════════════════════════════════════════════
import { fetchTwelveDataSeries } from '../utils/fetchers.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });

// Only instruments the live feed also covers. Claiming history for a symbol we
// cannot price live would produce a report that is half-verified and half not.
const SUPPORTED = { 'XAU/USD': 'XAU/USD', 'BTC/USD': 'BTC/USD' };
const INTERVALS = ['1day', '4h', '1h', '30min', '15min'];

// Population standard deviation of daily returns, annualised by √252. Reported
// only when there are enough candles for the number to mean anything.
function realisedVolatility(candles) {
  if (!Array.isArray(candles) || candles.length < 20) return null;
  const rets = [];
  for (let i = 1; i < candles.length; i++) {
    const a = candles[i - 1].close, b = candles[i].close;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 19) return null;
  const mean = rets.reduce((x, y) => x + y, 0) / rets.length;
  const varr = rets.reduce((x, r) => x + (r - mean) ** 2, 0) / rets.length;
  const daily = Math.sqrt(varr);
  return {
    dailyPct: Math.round(daily * 100 * 100) / 100,
    annualisedPct: Math.round(daily * Math.sqrt(252) * 100 * 100) / 100,
    samples: rets.length,
    method: 'population stdev of log returns over the returned candles, annualised by √252',
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  const url = new URL(request.url);
  const symbol = SUPPORTED[String(url.searchParams.get('symbol') || 'XAU/USD').toUpperCase()];
  const interval = INTERVALS.includes(url.searchParams.get('interval')) ? url.searchParams.get('interval') : '1day';
  const outputsize = Math.min(Math.max(parseInt(url.searchParams.get('outputsize') || '60', 10) || 60, 5), 500);
  const dates = String(url.searchParams.get('dates') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);

  const base = {
    status: 'unavailable', updatedAt: new Date().toISOString(),
    symbol: symbol || null, interval, source: 'TwelveData /time_series',
    candles: [], volatility: null, dateContext: [], note: null,
  };

  if (!symbol) {
    return json({ ...base, note: 'Unsupported symbol. Historical context is offered only for instruments the live feed also covers (XAU/USD, BTC/USD).' });
  }
  if (!env.TWELVEDATA_API_KEY) {
    // Named, never valued.
    return json({ ...base, note: 'TWELVEDATA_API_KEY is not configured in this environment, so historical market data could not be retrieved.' });
  }

  let series;
  try {
    series = await fetchTwelveDataSeries(symbol, interval, outputsize, env.TWELVEDATA_API_KEY);
  } catch (e) {
    // The provider's own reason, with nothing added and nothing guessed.
    return json({ ...base, note: `Historical market data could not be independently verified: ${String(e.message || e).slice(0, 180)}` });
  }

  const candles = series.candles;
  const out = {
    ...base,
    status: 'verified',
    retrievedAt: new Date().toISOString(),
    count: candles.length,
    firstAt: candles[0]?.datetime || null,
    lastAt: candles[candles.length - 1]?.datetime || null,
    candles,
    volatility: realisedVolatility(candles),
  };

  // Market context on the days the trader opened each layer.
  if (dates.length) {
    out.dateContext = dates.map((d) => {
      const day = d.slice(0, 10);
      const hit = candles.find(c => String(c.datetime).slice(0, 10) === day);
      return hit
        ? { date: day, matched: true, open: hit.open, high: hit.high, low: hit.low, close: hit.close,
            candle: hit.datetime, source: 'TwelveData /time_series' }
        : { date: day, matched: false,
            reason: 'No candle covers this date in the returned range — it may be a non-trading day, or outside the depth this plan returns.' };
    });
  }

  return json(out);
}
