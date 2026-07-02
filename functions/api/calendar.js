// functions/api/calendar.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/calendar
//
// Upcoming US economic events from Finnhub (free tier).
// Cache TTL: 60 minutes (events do not change frequently)
//
// Source: Finnhub /calendar/economic
// Filter: US-only, macro events (CPI, PPI, PCE, FOMC, NFP, GDP, retail, etc.)
// Window: today → today + 21 days
//
// Response shape:
// {
//   "status":       "ok" | "error",
//   "updatedAt":    "ISO timestamp",
//   "sourceStatus": { "finnhub": "ok" | "error" },
//   "events": [
//     {
//       "event":    "CPI YoY",
//       "country":  "US",
//       "time":     "2026-06-11T12:30:00Z",
//       "impact":   "high",
//       "actual":   null,
//       "estimate": "3.1",
//       "prev":     "3.4",
//       "unit":     "%",
//       "category": "inflation"
//     }
//   ]
// }
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cachePut }   from '../utils/cache.js';
import { classifyApiError }     from '../utils/api-error.js';

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

const CORS_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const KEEP_KEYWORDS = [
  'cpi', 'ppi', 'pce', 'fomc', 'fed',
  'nonfarm', 'unemployment', 'jobless',
  'gdp', 'retail sales', 'ism',
  'consumer confidence', 'powell', 'jackson hole',
  'durable goods', 'industrial production',
];

function shouldKeep(ev) {
  if (!ev || typeof ev.event !== 'string') return false;
  if ((ev.country || '').toUpperCase() !== 'US') return false;
  const t = ev.event.toLowerCase();
  return KEEP_KEYWORDS.some(k => t.includes(k));
}

function categorize(name) {
  const t = (name || '').toLowerCase();
  if (t.includes('cpi') || t.includes('inflation')) return 'inflation';
  if (t.includes('ppi'))                            return 'inflation';
  if (t.includes('pce'))                            return 'inflation';
  if (t.includes('fomc') || t.includes('fed') ||
      t.includes('powell'))                         return 'policy';
  if (t.includes('nonfarm') ||
      t.includes('unemployment') ||
      t.includes('jobless'))                        return 'employment';
  if (t.includes('gdp'))                            return 'growth';
  if (t.includes('retail'))                         return 'consumer';
  if (t.includes('ism') ||
      t.includes('industrial') ||
      t.includes('durable'))                        return 'manufacturing';
  return 'other';
}

function toNumOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const cached = await cacheGet(request);
  if (cached) return cached;

  const now    = new Date();
  const future = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  let events        = [];
  let status        = 'error';
  let _finnhubDiag  = undefined;

  try {
    if (!env.FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY missing');

    const url =
      'https://finnhub.io/api/v1/calendar/economic' +
      '?from=' + fmtDate(now) +
      '&to='   + fmtDate(future) +
      '&token=' + env.FINNHUB_API_KEY;

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const raw = Array.isArray(data && data.economicCalendar)
      ? data.economicCalendar
      : [];

    events = raw
      .filter(shouldKeep)
      .map(ev => ({
        event:    ev.event,
        country:  ev.country,
        time:     ev.time,
        impact:   ev.impact || 'low',
        actual:   toNumOrNull(ev.actual),
        estimate: toNumOrNull(ev.estimate),
        prev:     toNumOrNull(ev.prev),
        unit:     ev.unit || '',
        category: categorize(ev.event),
      }))
      .sort((a, b) => {
        const ta = new Date(a.time).getTime() || 0;
        const tb = new Date(b.time).getTime() || 0;
        return ta - tb;
      })
      .slice(0, 24);

    status = 'ok';
  } catch (err) {
    if (env.DEBUG === 'true') {
      console.error('[/api/calendar] Finnhub failed:', err.message);
    }
    // ── FINNHUB DIAGNOSTIC — exposed in response when finnhub:'error' ────────
    // Captures HTTP status, category, and fix for the calendar endpoint.
    // Remove this block once Finnhub root cause is confirmed and fixed.
    const classified = classifyApiError('Finnhub/calendar', err);
    const keyPresent = !!(env.FINNHUB_API_KEY && String(env.FINNHUB_API_KEY).trim().length > 0);
    const httpMatch  = err.message.match(/HTTP (\d+)/);
    const httpStatus = httpMatch ? Number(httpMatch[1]) : null;
    let planNote     = '';
    if (httpStatus === 403) {
      planNote = 'Finnhub /calendar/economic requires a paid plan. Free tier returns HTTP 403. Upgrade at finnhub.io or replace with an alternative data source.';
    }
    _finnhubDiag = {
      endpoint:       'calendar/economic',
      keyPresent,
      keyLength:      String(env.FINNHUB_API_KEY || '').trim().length,
      httpStatus,
      errorCategory:  keyPresent ? classified.category : 'Missing API key',
      rootCause:      !keyPresent
        ? 'env.FINNHUB_API_KEY is not set in Cloudflare Pages environment variables.'
        : httpStatus === 403
          ? 'Plan restriction — /calendar/economic is not available on the Finnhub free plan.'
          : httpStatus === 401
            ? 'Invalid or revoked API key.'
            : classified.category,
      planNote:       planNote || undefined,
      recommendedFix: planNote || classified.recommended_fix,
      rawError:       err.message.slice(0, 200),
      timestamp:      new Date().toISOString(),
    };
    // ── END FINNHUB DIAGNOSTIC ───────────────────────────────────────────────
  }

  const result = {
    status,
    updatedAt:    new Date().toISOString(),
    sourceStatus: { finnhub: status },
    events,
    _finnhubDiag,
  };

  await cachePut(request, result, CACHE_TTL_SECONDS);

  return new Response(JSON.stringify(result), {
    status:  200,
    headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
  });
}
