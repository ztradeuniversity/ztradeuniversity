// functions/utils/normalizers.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure data-normalisation helpers. No I/O, no side effects.
//
// Every external API returns data in a different shape, with different null
// conventions, precision levels, and timestamp formats. These functions produce
// consistent, frontend-friendly values with explicit nulls for missing data.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely parse any value to a finite float.
 * Returns null for missing, empty, NaN, Infinity, or FRED's '.' sentinel.
 *
 * @param {*} val
 * @returns {number|null}
 */
export function toNum(val) {
  if (val === null || val === undefined || val === '' || val === '.') return null;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Round a number to N decimal places. Returns null if input is not a finite number.
 *
 * @param {*}      val
 * @param {number} [decimals=2]
 * @returns {number|null}
 */
export function round(val, decimals = 2) {
  const n = toNum(val);
  if (n === null) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Normalise a market price to 2 decimal places.
 * Returns null for missing or invalid values.
 *
 * @param {*} val
 * @returns {number|null}
 */
export function toPrice(val) {
  return round(val, 2);
}

/**
 * Normalise a percentage value to 3 decimal places (e.g. 1.234 for 1.234%).
 * Returns null for missing or invalid values.
 *
 * @param {*} val
 * @returns {number|null}
 */
export function toPct(val) {
  return round(val, 3);
}

/**
 * Normalise any timestamp to an ISO-8601 string, or null if invalid.
 *
 * Accepts:
 *   - Date object
 *   - ISO string  ("2025-05-15T14:30:00Z")
 *   - Unix seconds (integer < 1e10)
 *   - Unix milliseconds (integer >= 1e10)
 *
 * @param {Date|string|number|null} val
 * @returns {string|null}
 */
export function toISO(val) {
  if (!val && val !== 0) return null;
  try {
    if (val instanceof Date) {
      return Number.isFinite(val.getTime()) ? val.toISOString() : null;
    }
    if (typeof val === 'number') {
      const ms = val < 1e10 ? val * 1000 : val; // distinguish seconds vs ms
      const d  = new Date(ms);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    if (typeof val === 'string') {
      const d = new Date(val);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Tag a free-text body with asset relevance keywords.
 * Returns an array of asset tags; defaults to ['macro'] if no keywords match.
 *
 * @param {string} body - Lowercase concatenated title + description/summary
 * @returns {string[]}
 */
function tagAssetsFromText(body) {
  const assets = [];
  if (/gold|xau|bullion|precious metal/i.test(body))                                                       assets.push('gold');
  if (/bitcoin|btc|crypto|ethereum|eth|digital asset/i.test(body))                                          assets.push('btc');
  if (/dollar index|dxy|usd strength|greenback/i.test(body))                                                assets.push('dxy');
  if (/federal reserve|fed |fomc|jerome powell|interest rate|rate cut|rate hike/i.test(body))               assets.push('macro');
  if (/cpi|inflation|consumer price|pce|core price/i.test(body))                                            assets.push('inflation');
  if (/vix|volatility index|risk.?off|market fear/i.test(body))                                             assets.push('volatility');
  if (/yield|treasury|10.year|bond/i.test(body))                                                            assets.push('yields');
  return assets.length > 0 ? assets : ['macro'];
}

/**
 * Normalise a GNews article to a frontend-friendly shape.
 * GNews shape: { title, description, content, url, image, publishedAt, source: { name, url } }
 *
 * @param {object} article
 * @returns {{ title, source, publishedAt, url, assets }|null}
 */
export function normalizeGNewsItem(article) {
  if (!article || !article.title) return null;
  const body = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
  return {
    title:       article.title,
    source:      article.source?.name || 'GNews',
    publishedAt: toISO(article.publishedAt),
    url:         article.url || null,
    assets:      tagAssetsFromText(body),
  };
}

/**
 * Normalise a Finnhub news item.
 * Finnhub shape: { category, datetime (unix seconds), headline, id, image, related, source, summary, url }
 *
 * @param {object} article
 * @returns {{ title, source, publishedAt, url, assets }|null}
 */
export function normalizeFinnhubNewsItem(article) {
  if (!article || !article.headline) return null;
  const body = ((article.headline || '') + ' ' + (article.summary || '')).toLowerCase();
  return {
    title:       article.headline,
    source:      article.source || 'Finnhub',
    publishedAt: toISO(article.datetime),
    url:         article.url || null,
    assets:      tagAssetsFromText(body),
  };
}

/**
 * Normalise an FMP news item.
 * FMP shape: { publishedDate, title, image, site, text, url, symbol }
 *
 * @param {object} article
 * @returns {{ title, source, publishedAt, url, assets }|null}
 */
export function normalizeFMPNewsItem(article) {
  if (!article || !article.title) return null;
  const body = ((article.title || '') + ' ' + (article.text || '')).toLowerCase();
  return {
    title:       article.title,
    source:      article.site || 'FMP',
    publishedAt: toISO(article.publishedDate),
    url:         article.url || null,
    assets:      tagAssetsFromText(body),
  };
}

/**
 * Build and validate a sourceStatus map.
 * Accepts an object of { providerKey: status } where status is one of:
 *   'ok' | 'fallback' | 'error' | 'unused'
 * Any other value is coerced to 'error'.
 *
 * @param {Record<string, string>} statusMap
 * @returns {Record<string, string>}
 */
export function buildSourceStatus(statusMap) {
  const valid = new Set(['ok', 'fallback', 'error', 'unused']);
  const out   = {};
  for (const [key, val] of Object.entries(statusMap)) {
    out[key] = valid.has(val) ? val : 'error';
  }
  return out;
}
