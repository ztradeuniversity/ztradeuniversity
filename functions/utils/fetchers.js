// functions/utils/fetchers.js
// ─────────────────────────────────────────────────────────────────────────────
// Reusable provider fetchers. One function per API source.
//
// Design rules:
//   - Every fetcher takes only the parameters it needs + an apiKey string.
//   - Every fetcher THROWS on failure — callers use try/catch or Promise.allSettled.
//   - No fake data is ever returned. Missing fields are surfaced as null.
//   - All outbound requests have an 8-second hard timeout via AbortController.
//   - API keys are never logged or included in error messages.
//
// Provider overview:
//   FRED         → US 10Y nominal yield (DGS10) + real yield / TIPS (DFII10)
//   Alpha Vantage → Realtime XAU/USD spot rate (confirmation layer)
//   Finnhub      → VIX quote + economic calendar events
//   TwelveData   → BTC/USD, XAU/USD, DXY — with price, change, high/low
//   FMP          → Fallback pricing for Gold, BTC, VIX
//   NewsAPI      → Financial headlines (gold, bitcoin, Fed, inflation)
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000; // Hard timeout for every upstream API call

// ─── BASE FETCHER ─────────────────────────────────────────────────────────────

/**
 * Fetch JSON from a URL with a hard timeout.
 * Throws a descriptive error on timeout, non-2xx HTTP status, or JSON parse failure.
 * API keys embedded in URLs are not included in thrown error messages.
 *
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<object>}
 */
async function fetchJSON(url, timeoutMs = FETCH_TIMEOUT_MS) {
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
      throw new Error(`Timeout (${timeoutMs}ms) fetching ${hostname}`);
    }
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
 * @param {string} apiKey   - FRED API key (env.FRED)
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

// ─── ALPHA VANTAGE ────────────────────────────────────────────────────────────
// Documentation : https://www.alphavantage.co/documentation/
// Rate limits   : Free tier: 25 req/day, 5 req/min. Premium: higher.
// Used for      : Realtime XAU/USD spot rate as a confirmation layer against TwelveData.
//
// IMPORTANT: Alpha Vantage has strict rate limits. Results are cached at the
// endpoint level (90s for /api/sentiment). If rate-limit errors occur, check
// that caching is working and consider upgrading the Alpha Vantage plan.

/**
 * Fetch a realtime currency exchange rate from Alpha Vantage.
 *
 * Examples:
 *   fetchAlphaVantageRate('XAU', 'USD', key)  → Gold spot in USD
 *   fetchAlphaVantageRate('EUR', 'USD', key)  → EUR/USD rate
 *
 * @param {string} fromCurrency - 3-letter code, e.g. 'XAU', 'EUR', 'USD'
 * @param {string} toCurrency   - 3-letter code, e.g. 'USD'
 * @param {string} apiKey       - Alpha Vantage key (env['ALFA VANTAGE key'])
 * @returns {Promise<{ rate: number, bidPrice: number, askPrice: number, timestamp: string }>}
 */
export async function fetchAlphaVantageRate(fromCurrency, toCurrency, apiKey) {
  const url = [
    'https://www.alphavantage.co/query',
    '?function=CURRENCY_EXCHANGE_RATE',
    `&from_currency=${encodeURIComponent(fromCurrency)}`,
    `&to_currency=${encodeURIComponent(toCurrency)}`,
    `&apikey=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);
  const rate = data['Realtime Currency Exchange Rate'];

  if (!rate) {
    // Alpha Vantage returns { Information: "..." } or { Note: "..." } on rate-limit
    const msg = data['Information'] || data['Note'] || 'no exchange rate data returned';
    throw new Error(`Alpha Vantage: ${msg}`);
  }

  return {
    rate:      parseFloat(rate['5. Exchange Rate']),
    bidPrice:  parseFloat(rate['8. Bid Price']),
    askPrice:  parseFloat(rate['9. Ask Price']),
    timestamp: rate['6. Last Refreshed'] || null,
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

// ─── FMP (Financial Modeling Prep) ────────────────────────────────────────────
// Documentation : https://financialmodelingprep.com/developer/docs
// Used as       : Fallback provider for Gold, BTC, and VIX when primary sources fail.
// Symbols       : 'XAUUSD' (Gold), 'BTCUSD' (Bitcoin), '^VIX' (Volatility Index)
// Note          : FMP returns an array. An empty array or non-array is an error.
//                 Timestamps in FMP are Unix seconds — converted to ISO by normalizers.

/**
 * Fetch a quote from FMP for a given symbol.
 *
 * @param {string} symbol - e.g. 'XAUUSD', 'BTCUSD', '^VIX'
 * @param {string} apiKey - FMP API key (env.FMP_API_KEY)
 * @returns {Promise<{ price: number, change: number, changePct: number, dayHigh: number, dayLow: number, timestamp: string|null }>}
 */
export async function fetchFMPQuote(symbol, apiKey) {
  const url = [
    'https://financialmodelingprep.com/api/v3/quote/',
    encodeURIComponent(symbol),
    `?apikey=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);

  if (!Array.isArray(data) || !data[0]) {
    throw new Error(`FMP: no quote returned for symbol "${symbol}"`);
  }

  const q = data[0];
  return {
    price:     q.price,
    change:    q.change,
    changePct: q.changesPercentage,
    dayHigh:   q.dayHigh,
    dayLow:    q.dayLow,
    timestamp: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : null,
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
 * @param {string} apiKey  - GNews API key (env.GNEWS_API_KEY)
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

// ─── FMP NEWS ────────────────────────────────────────────────────────────────
// Documentation : https://site.financialmodelingprep.com/developer/docs#General-News
// Used as       : Fallback / supplementary news source.

/**
 * Fetch general financial news from FMP.
 *
 * @param {string} apiKey   - FMP API key (env.FMP_API_KEY)
 * @param {number} [limit]  - Max articles to return
 * @returns {Promise<Array<object>>} Raw FMP news objects
 */
export async function fetchFMPNews(apiKey, limit = 20) {
  const url = [
    'https://financialmodelingprep.com/api/v4/general_news',
    '?page=0',
    `&apikey=${encodeURIComponent(apiKey)}`,
  ].join('');

  const data = await fetchJSON(url);

  if (!Array.isArray(data)) {
    throw new Error('FMP news: response is not an array');
  }

  return data.slice(0, limit);
}
