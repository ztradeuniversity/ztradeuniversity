// functions/api/calendar.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/calendar
//
// Upcoming US economic events. PRIMARY: Finnhub /calendar/economic (requires
// a paid Finnhub plan — the free tier returns HTTP 403; see `_finnhubDiag`
// below, unchanged from before). BACKUP: FRED's own release calendar
// (fred/releases/dates), which needs no new credential — it reuses the SAME
// FRED_API_KEY market.js/sentiment.js already authenticate with. FRED does
// NOT provide a forecast/consensus figure or an importance rating the way
// Finnhub does, so FRED-sourced events carry `estimate: null`, `prev: null`
// and `impact: null` rather than a guessed value — never invented.
// Cache TTL: 60 minutes (events do not change frequently)
//
// Window: today → today + 21 days
//
// Response shape:
// {
//   "status":       "ok" | "error",
//   "updatedAt":    "ISO timestamp",
//   "sourceStatus": { "finnhub": "ok" | "error" | "unused", "fred": "ok" | "error" | "unused" },
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
//       "category": "inflation",
//       "source":   "finnhub" | "fred"
//     }
//   ]
// }
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cachePut }      from '../utils/cache.js';
import { classifyApiError }        from '../utils/api-error.js';
import { fetchFREDReleaseDates }   from '../utils/fetchers.js';

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

// FRED's release calendar uses spelled-out official names, not Finnhub's
// abbreviations (e.g. FRED says "Employment Situation", never "nonfarm" or
// "NFP") — matching KEEP_KEYWORDS against them would silently drop almost
// everything. This is the same short major-macro allow-list, expressed in
// FRED's own real, documented release names instead.
const FRED_KEEP_KEYWORDS = [
  'consumer price index', 'producer price index', 'personal income and outlays',
  'employment situation', 'gross domestic product', 'retail sales', 'retail trade',
  'industrial production', 'advance durable goods',
];

function shouldKeep(ev) {
  if (!ev || typeof ev.event !== 'string') return false;
  if ((ev.country || '').toUpperCase() !== 'US') return false;
  const t = ev.event.toLowerCase();
  return KEEP_KEYWORDS.some(k => t.includes(k));
}

function categorize(name) {
  const t = (name || '').toLowerCase();
  if (t.includes('cpi') || t.includes('inflation') ||
      t.includes('consumer price index'))           return 'inflation';
  if (t.includes('ppi') || t.includes('producer price index')) return 'inflation';
  if (t.includes('pce') || t.includes('personal income and outlays')) return 'inflation';
  if (t.includes('fomc') || t.includes('fed') ||
      t.includes('powell'))                         return 'policy';
  if (t.includes('nonfarm') ||
      t.includes('unemployment') ||
      t.includes('jobless') ||
      t.includes('employment situation'))            return 'employment';
  if (t.includes('gdp') || t.includes('gross domestic product')) return 'growth';
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
  let _fredDiag     = undefined;
  const sourceStatus = { finnhub: 'error', fred: 'unused' };

  // ── PRIMARY: Finnhub /calendar/economic. Retries ONCE on a transient
  // failure (5xx / network error) — the same rule used everywhere else in
  // this project (evidence.js, rescue-assess.js): a definitive 4xx (the
  // known free-plan 403) is never retried, since retrying cannot change it.
  try {
    if (!env.FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY missing');

    const url =
      'https://finnhub.io/api/v1/calendar/economic' +
      '?from=' + fmtDate(now) +
      '&to='   + fmtDate(future) +
      '&token=' + env.FINNHUB_API_KEY;

    const attempt = async () => {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    };
    let data;
    try {
      data = await attempt();
    } catch (e) {
      if (e.status == null || e.status >= 500) data = await attempt();
      else throw e;
    }

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
        source:   'finnhub',
      }))
      .sort((a, b) => {
        const ta = new Date(a.time).getTime() || 0;
        const tb = new Date(b.time).getTime() || 0;
        return ta - tb;
      })
      .slice(0, 24);

    status = 'ok';
    sourceStatus.finnhub = 'ok';
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

    // ── BACKUP: FRED's own release calendar — a REAL, already-authenticated
    // source (same FRED_API_KEY market.js/sentiment.js already use), only
    // reached because Finnhub's calendar genuinely failed. FRED gives no
    // forecast/consensus/importance, so those fields stay null — never
    // guessed. fetchFREDReleaseDates() already retries once internally on a
    // transient failure (fetchers.js's shared fetchJSON()).
    sourceStatus.fred = 'error';
    try {
      if (!env.FRED_API_KEY) throw new Error('FRED_API_KEY missing');
      const releases = await fetchFREDReleaseDates(env.FRED_API_KEY, fmtDate(now), fmtDate(future));
      events = releases
        .filter(r => r && typeof r.release_name === 'string' && FRED_KEEP_KEYWORDS.some(k => r.release_name.toLowerCase().includes(k)))
        .map(r => ({
          event: r.release_name, country: 'US', time: r.date,
          impact: null, actual: null, estimate: null, prev: null, unit: '',
          category: categorize(r.release_name), source: 'fred',
        }))
        .sort((a, b) => (new Date(a.time).getTime() || 0) - (new Date(b.time).getTime() || 0))
        .slice(0, 24);
      status = 'ok';
      sourceStatus.fred = 'ok';
    } catch (fredErr) {
      if (env.DEBUG === 'true') console.error('[/api/calendar] FRED backup failed:', fredErr.message);
      _fredDiag = {
        endpoint: 'fred/releases/dates',
        keyPresent: !!(env.FRED_API_KEY && String(env.FRED_API_KEY).trim().length > 0),
        rawError: fredErr.message.slice(0, 200),
        timestamp: new Date().toISOString(),
      };
    }
  }

  const result = {
    status,
    updatedAt:    new Date().toISOString(),
    sourceStatus,
    events,
    _finnhubDiag,
    _fredDiag,
  };

  await cachePut(request, result, CACHE_TTL_SECONDS);

  return new Response(JSON.stringify(result), {
    status:  200,
    headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
  });
}
