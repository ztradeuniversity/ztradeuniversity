// functions/utils/fetchers.js
// ─────────────────────────────────────────────────────────────────────────────
// Reusable provider fetchers. One function per API source.
//
// Design rules:
//   - Every fetcher takes only the parameters it needs + an apiKey string.
//   - Every fetcher THROWS on failure — callers use try/catch or Promise.allSettled.
//   - No fake data is ever returned. Missing fields are surfaced as null.
//   - All outbound requests have a 5-second hard timeout via AbortController.
//   - One automatic retry on network-level failures before propagating the error.
//   - API keys are never logged or included in error messages.
//
// Provider overview:
//   FRED       → US 10Y nominal yield (DGS10) + real yield / TIPS (DFII10)
//   Finnhub    → VIX quote + economic calendar events + market news (primary)
//   TwelveData → BTC/USD, XAU/USD, DXY — with price, change, high/low
//   GoldAPI    → Fallback spot price for XAU and BTC (no API key required)
//   GNews      → Financial headlines fallback (env.NEWS_API_KEY)
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 5000; // Hard timeout for every upstream API call

// ─── BASE FETCHER ─────────────────────────────────────────────────────────────

/**
 * Fetch JSON from a URL with a hard timeout and one automatic retry.
 * Retries once on network-level failures; does not retry on HTTP 4xx/5xx.
 * API keys embedded in URLs are not included in thrown error messages.
 *
 * @param {string} url
 * @param {number} [timeoutMs]
 * @param {number} [_attempt]  - internal retry counter, do not pass externally
 * @returns {Promise<object>}
 */
async function fetchJSON(url, timeoutMs = FETCH_TIMEOUT_MS, _attempt = 1) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  let hostname;
  try { hostname = new URL(url).hostname; } catch { hostname = 'unknown'; }

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${hostname}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      if (_attempt < 2) return fetchJSON(url, timeoutMs, 2);
      throw new Error(`Timeout (${timeoutMs}ms) fetching ${hostname}`);
    }
    // Retry once on network-level errors only (not HTTP status errors)
    const isHttpError = /^HTTP \d{3}/.test(err.message);
    if (!isHttpError && _attempt < 2) return fetchJSON(url, timeoutMs, 2);
    // Re-throw with host context but strip URL (which may contain API key)
    if (!err.message.includes(hostname)) {
      throw new Error(`${hostname}: ${err.message}`);
    }
    throw err;
  }
}

// ─── FRED ─────────────────────────────────────────────────────────────────────
// Documentation : https://fred.stlouisfed.org/docs/api/fred/series_observations.html
// Update cadence: End-of-day (≈15:30 ET on US business days)
//
// Series used:
//   DGS10  — 10-Year Treasury Constant Maturity Rate (nominal yield, %)
//   DFII10 — 10-Year TIPS yield (real yield, %)
//   Spread — Breakeven inflation = DGS10 − DFII10 (calculated in sentiment.js)

/**
 * Fetch the most recent valid observation for a FRED data series.
 * FRED uses '.' as a sentinel for missing observations; this skips them.
 *
 * @param {string} seriesId - FRED series ID, e.g. 'DGS10', 'DFII10'
 * @param {string} apiKey   - FRED API key (env.FRED_API_KEY)
 * @returns {Promise<{ value: number, date: string }>}
 */
export async function fetchFRED(seriesId, apiKey) {
  const url = [
    'https://api.stlouisfed.org/fred/series/observations',
    `?series_id=${encodeURIComponent(seriesId)}`,
    `&api_key=${encodeURIComponent(apiKey)}`,
    '&limit=5',
    '&sort_order=desc',
    '&file_type=json',
  ].join('');

  const data = await fetchJSON(url);

  if (!Array.isArray(data.observations)) {
    throw new Error(`FRED: missing observations array for series ${seriesId}`);
  }

  // FRED returns '.' for weekends/holidays — find the latest real value
  const obs = data.observations.find(o => o.value && o.value !== '.');
  if (!obs) {
    throw new Error(`FRED: all recent observations are missing for series ${seriesId}`);
  }

  return {
    value: parseFloat(obs.value),
    date:  obs.date,
  };
}

// ─── FINNHUB ──────────────────────────────────────────────────────────────────
// Documentation : https://finnhub.io/docs/api
// Used for      : VIX real-time quote + upcoming economic calendar events.
// VIX symbol    : '^VIX' (CBOE Volatility Index). Available on Finnhub paid plans.
// Note          : Finnhub returns all-zero fields for unsupported/unknown symbols.
//                 fetchFinnhubQuote detects this and throws rather than returning zero data.

/**
 * Fetch a real-time stock or index quote from Finnhub.
 *
 * @param {string} symbol - e.g. '^VIX', 'AAPL'
 * @param {string} apiKey - Finnhub API key (env.FINNHUB_API_KEY)
 * @returns {Promise<{ current: number, high: number, low: number, prevClose: number, change: number|null, changePct: number|null, timestamp: string|null }>}
 */
export async function fetchFinnhubQuote(symbol, apiKey) {
  const url = [
    'https://finnhub.io/api/v1/quote',
    `?symbol=${encodeURIComponent(symbol)}`,
    `&token=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);

  // Finnhub returns { c:0, h:0, l:0, o:0, pc:0, d:0, dp:0, t:0 } for unknown symbols
  if (!data.c || (data.c === 0 && data.h === 0 && data.l === 0)) {
    throw new Error(`Finnhub: empty or zero quote for symbol "${symbol}" — check symbol and plan permissions`);
  }

  return {
    current:   data.c,
    high:      data.h,
    low:       data.l,
    prevClose: data.pc,
    change:    data.d  ?? null,
    changePct: data.dp ?? null,
    timestamp: data.t  ? new Date(data.t * 1000).toISOString() : null,
  };
}

/**
 * Fetch upcoming economic calendar events from Finnhub (next 7 days).
 * Returns only high- and medium-impact events, capped at 20.
 *
 * @param {string} apiKey - Finnhub API key (env.FINNHUB_API_KEY)
 * @returns {Promise<Array<{ event, date, country, impact, actual, estimate }>>}
 */
export async function fetchFinnhubCalendar(apiKey) {
  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const url  = [
    'https://finnhub.io/api/v1/calendar/economic',
    `?from=${from}`,
    `&to=${to}`,
    `&token=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);

  if (!Array.isArray(data.economicCalendar)) {
    throw new Error('Finnhub: economic calendar response missing or malformed');
  }

  return data.economicCalendar
    .filter(e => e.impact === 'high' || e.impact === 'medium')
    .slice(0, 20)
    .map(e => ({
      event:    e.event    || null,
      date:     e.time     || e.date || null,
      country:  e.country  || null,
      impact:   e.impact   || null,
      actual:   e.actual   ?? null,
      estimate: e.estimate ?? null,
    }));
}

// ─── TWELVEDATA ───────────────────────────────────────────────────────────────
// Documentation : https://twelvedata.com/docs
// Used for      : BTC/USD, XAU/USD, DXY — realtime quote with change and daily range.
// Symbols       : 'BTC/USD', 'XAU/USD', 'DXY', forex pairs, equities
// Note          : TwelveData returns { status: 'error', message: '...' } for bad symbols.
//                 This is detected and thrown as a descriptive error.

/**
 * Fetch a real-time quote from TwelveData.
 *
 * @param {string} symbol - e.g. 'BTC/USD', 'XAU/USD', 'DXY', 'EUR/USD'
 * @param {string} apiKey - TwelveData API key (env.TWELVEDATA_API_KEY)
 * @returns {Promise<{ price: number, change: number, changePct: number, high: number, low: number, open: number, timestamp: string|null, exchange: string|null }>}
 */
export async function fetchTwelveDataQuote(symbol, apiKey) {
  const url = [
    'https://api.twelvedata.com/quote',
    `?symbol=${encodeURIComponent(symbol)}`,
    `&apikey=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);

  if (data.status === 'error') {
    throw new Error(`TwelveData: ${data.message || 'error'} for symbol "${symbol}"`);
  }
  if (!data.close) {
    throw new Error(`TwelveData: no price data returned for symbol "${symbol}"`);
  }

  return {
    price:     parseFloat(data.close),
    change:    parseFloat(data.change),
    changePct: parseFloat(data.percent_change),
    high:      parseFloat(data.high),
    low:       parseFloat(data.low),
    open:      parseFloat(data.open),
    timestamp: data.datetime || null,
    exchange:  data.exchange  || null,
  };
}

// ─── GOLD-API.COM ─────────────────────────────────────────────────────────────
// Documentation : https://www.gold-api.com
// Used as       : Fallback spot price for XAU (Gold) and BTC (Bitcoin).
// No API key required. Free public endpoint.
// Symbols       : 'XAU' for gold, 'BTC' for bitcoin.
// Response      : { price, prev_close_price, ch (change), chp (change %) }

/**
 * Fetch the current spot price for XAU or BTC from gold-api.com.
 * No API key required.
 *
 * @param {string} symbol - 'XAU' for gold, 'BTC' for bitcoin
 * @returns {Promise<{ price: number, change: number|null, changePct: number|null, high: null, low: null }>}
 */
export async function fetchGoldAPIPrice(symbol) {
  const url  = `https://api.gold-api.com/price/${encodeURIComponent(symbol)}`;
  const data = await fetchJSON(url);

  const price = parseFloat(data.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`GoldAPI: invalid or missing price for symbol "${symbol}"`);
  }

  const change    = parseFloat(data.ch);
  const changePct = parseFloat(data.chp);

  return {
    price,
    change:    Number.isFinite(change)    ? change    : null,
    changePct: Number.isFinite(changePct) ? changePct : null,
    high:      null, // gold-api.com does not provide intraday high/low
    low:       null,
  };
}

// ─── GNEWS ────────────────────────────────────────────────────────────────────
// Documentation : https://gnews.io/docs/v4
// Used for      : Primary news source — financial headlines via keyword search.
// Plan note     : Free tier: 100 req/day, 10 articles per call. Production-friendly.
// Query         : Targets gold, bitcoin, Fed, inflation, DXY.

/**
 * Fetch financial headlines from GNews (search endpoint).
 *
 * @param {string} apiKey  - GNews API key (env.NEWS_API_KEY)
 * @param {string} [query] - Search query string
 * @param {number} [max]   - Max articles (1-100; free tier capped at 10)
 * @returns {Promise<Array<object>>} Raw GNews article objects
 */
export async function fetchGNewsHeadlines(
  apiKey,
  query = 'gold OR bitcoin OR "federal reserve" OR inflation OR "dollar index"',
  max   = 10,
) {
  const url = [
    'https://gnews.io/api/v4/search',
    `?q=${encodeURIComponent(query)}`,
    '&lang=en',
    `&max=${max}`,
    `&apikey=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);

  if (data.errors) {
    throw new Error(`GNews: ${JSON.stringify(data.errors)}`);
  }
  if (!Array.isArray(data.articles)) {
    throw new Error('GNews: response missing articles array');
  }

  return data.articles;
}

// ─── FINNHUB NEWS ─────────────────────────────────────────────────────────────
// Documentation : https://finnhub.io/docs/api/market-news
// Used as       : Fallback / supplementary news source.
// Categories    : 'general', 'forex', 'crypto', 'merger'

/**
 * Fetch market news articles from Finnhub.
 *
 * @param {string} apiKey     - Finnhub API key (env.FINNHUB_API_KEY)
 * @param {string} [category] - News category
 * @returns {Promise<Array<object>>} Raw Finnhub news objects
 */
export async function fetchFinnhubNews(apiKey, category = 'general') {
  const url = [
    'https://finnhub.io/api/v1/news',
    `?category=${encodeURIComponent(category)}`,
    `&token=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);

  if (!Array.isArray(data)) {
    throw new Error('Finnhub news: response is not an array');
  }

  return data.slice(0, 20);
}

