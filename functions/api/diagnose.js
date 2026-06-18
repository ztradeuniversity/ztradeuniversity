// functions/api/diagnose.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/diagnose
//
// Production-safe diagnostic probe for all upstream API providers.
// Makes a minimal real request to each provider and returns structured results:
//   { service, endpoint, keyPresent, keyLength, httpStatus, ok,
//     errorCategory, rootCause, recommendedFix, responseSnippet, ms, timestamp }
//
// API key VALUES are never included in the response.
// keyLength confirms the key is stored without truncation (FRED needs 32 chars).
// Not cached — always fresh.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyApiError } from '../utils/api-error.js';

const CORS_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const TIMEOUT_MS = 8000;

// ─── RAW PROBE (no retry — we want the real first-attempt status) ─────────────
async function probeUrl(url) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0         = Date.now();
  try {
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const ms   = Date.now() - t0;
    let body   = '';
    try { body = await res.text(); } catch {}
    return { ok: res.ok, status: res.status, ms, body: body.slice(0, 400), error: null };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: null, ms: Date.now() - t0, body: '', error: err };
  }
}

function keyMeta(apiKey) {
  const k = String(apiKey || '').trim();
  return { keyPresent: k.length > 0, keyLength: k.length, key: k };
}

// ─── FRED ─────────────────────────────────────────────────────────────────────
async function probeFRED(apiKey) {
  const { keyPresent, keyLength, key } = keyMeta(apiKey);
  const endpoint = 'series/observations?series_id=DGS10&limit=1';

  if (!keyPresent) {
    return {
      service: 'FRED', endpoint, keyPresent, keyLength,
      httpStatus: null, ok: false,
      errorCategory:  'Missing API key',
      rootCause:      'env.FRED_API_KEY is not set or empty in Cloudflare Pages environment variables.',
      recommendedFix: 'Add FRED_API_KEY to Cloudflare Pages → Settings → Environment Variables, then redeploy.',
      responseSnippet: '(not attempted — key missing)',
      ms: 0, timestamp: new Date().toISOString(),
    };
  }

  const url  = [
    'https://api.stlouisfed.org/fred/series/observations',
    '?series_id=DGS10',
    `&api_key=${encodeURIComponent(key)}`,
    '&limit=1&sort_order=desc&file_type=json',
  ].join('');
  const probe = await probeUrl(url);
  const err   = probe.error || (probe.ok ? null : new Error(`HTTP ${probe.status} from api.stlouisfed.org`));
  const cls   = classifyApiError('FRED', err, probe.status);

  let rootCause = cls.category;
  if (probe.status === 400) rootCause = 'Invalid or missing API key — FRED returned HTTP 400 (Bad Request). Key length=' + keyLength + ' (expected 32).';
  if (probe.status === 403) rootCause = 'FRED access forbidden — check API key permissions.';
  if (keyLength !== 32 && keyLength > 0) rootCause += ' WARNING: FRED keys should be exactly 32 characters; stored key has ' + keyLength + '.';

  return {
    service:   'FRED', endpoint, keyPresent, keyLength,
    httpStatus: probe.status,
    ok:         probe.ok,
    errorCategory:   probe.ok ? null : cls.category,
    rootCause:       probe.ok ? 'None — API responding correctly' : rootCause,
    recommendedFix:  probe.ok ? '' : cls.recommended_fix,
    responseSnippet: probe.ok ? '(success — observations returned)' : probe.body.slice(0, 200) || cls.error,
    ms:        probe.ms,
    timestamp: new Date().toISOString(),
  };
}

// ─── FINNHUB NEWS ─────────────────────────────────────────────────────────────
// /news is available on all Finnhub plans including free.
async function probeFinnhubNews(apiKey) {
  const { keyPresent, keyLength, key } = keyMeta(apiKey);
  const endpoint = 'news?category=general';

  if (!keyPresent) {
    return {
      service: 'Finnhub (news)', endpoint, keyPresent, keyLength,
      httpStatus: null, ok: false,
      errorCategory:  'Missing API key',
      rootCause:      'env.FINNHUB_API_KEY is not set or empty in Cloudflare Pages environment variables.',
      recommendedFix: 'Add FINNHUB_API_KEY to Cloudflare Pages → Settings → Environment Variables, then redeploy.',
      responseSnippet: '(not attempted — key missing)',
      ms: 0, timestamp: new Date().toISOString(),
    };
  }

  const url  = `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(key)}`;
  const probe = await probeUrl(url);
  const err   = probe.error || (probe.ok ? null : new Error(`HTTP ${probe.status} from finnhub.io`));
  const cls   = classifyApiError('Finnhub', err, probe.status);

  let rootCause = probe.ok ? 'None — API responding correctly' : cls.category;
  if (probe.status === 401) rootCause = 'Invalid API key — Finnhub returned 401 Unauthorized. Key may be wrong or revoked.';
  if (probe.status === 403) rootCause = 'Forbidden — Finnhub returned 403. Key may be valid but insufficient plan for this endpoint.';
  if (probe.status === 429) rootCause = 'Rate limit exceeded — too many requests to Finnhub in a short window.';

  return {
    service:   'Finnhub (news)', endpoint, keyPresent, keyLength,
    httpStatus: probe.status,
    ok:         probe.ok,
    errorCategory:   probe.ok ? null : cls.category,
    rootCause,
    recommendedFix:  probe.ok ? '' : cls.recommended_fix,
    responseSnippet: probe.ok ? '(success — articles returned)' : probe.body.slice(0, 200) || cls.error,
    ms:        probe.ms,
    timestamp: new Date().toISOString(),
  };
}

// ─── FINNHUB CALENDAR ─────────────────────────────────────────────────────────
// /calendar/economic requires Finnhub paid plan. Free tier returns HTTP 403.
async function probeFinnhubCalendar(apiKey) {
  const { keyPresent, keyLength, key } = keyMeta(apiKey);
  const endpoint = 'calendar/economic';

  if (!keyPresent) {
    return {
      service: 'Finnhub (calendar)', endpoint, keyPresent, keyLength,
      httpStatus: null, ok: false,
      errorCategory:  'Missing API key',
      rootCause:      'env.FINNHUB_API_KEY is not set or empty in Cloudflare Pages environment variables.',
      recommendedFix: 'Add FINNHUB_API_KEY to Cloudflare Pages → Settings → Environment Variables, then redeploy.',
      responseSnippet: '(not attempted — key missing)',
      ms: 0, timestamp: new Date().toISOString(),
    };
  }

  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const url  = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${encodeURIComponent(key)}`;
  const probe = await probeUrl(url);
  const err   = probe.error || (probe.ok ? null : new Error(`HTTP ${probe.status} from finnhub.io`));
  const cls   = classifyApiError('Finnhub', err, probe.status);

  let rootCause = probe.ok ? 'None — API responding correctly' : cls.category;
  let planNote  = '';
  if (probe.status === 403) {
    rootCause = 'Plan restriction — Finnhub /calendar/economic requires a paid plan (Starter or above). Free plan returns HTTP 403.';
    planNote  = 'Upgrade Finnhub plan at finnhub.io, or replace calendar data source with an alternative (e.g. Trading Economics, Alpha Vantage).';
  } else if (probe.status === 401) {
    rootCause = 'Invalid API key — Finnhub returned 401 Unauthorized.';
  }

  return {
    service:   'Finnhub (calendar)', endpoint, keyPresent, keyLength,
    httpStatus: probe.status,
    ok:         probe.ok,
    errorCategory:   probe.ok ? null : cls.category,
    rootCause,
    planNote:        planNote || undefined,
    recommendedFix:  probe.ok ? '' : (planNote || cls.recommended_fix),
    responseSnippet: probe.ok ? '(success — calendar returned)' : probe.body.slice(0, 200) || cls.error,
    ms:        probe.ms,
    timestamp: new Date().toISOString(),
  };
}

// ─── TWELVEDATA ───────────────────────────────────────────────────────────────
async function probeTwelveData(apiKey) {
  const { keyPresent, keyLength, key } = keyMeta(apiKey);
  const endpoint = 'quote?symbol=XAU/USD';

  if (!keyPresent) {
    return {
      service: 'TwelveData', endpoint, keyPresent, keyLength,
      httpStatus: null, ok: false,
      errorCategory:  'Missing API key',
      rootCause:      'env.TWELVEDATA_API_KEY is not set or empty in Cloudflare Pages environment variables.',
      recommendedFix: 'Add TWELVEDATA_API_KEY to Cloudflare Pages → Settings → Environment Variables, then redeploy.',
      responseSnippet: '(not attempted — key missing)',
      ms: 0, timestamp: new Date().toISOString(),
    };
  }

  const url   = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent('XAU/USD')}&apikey=${encodeURIComponent(key)}`;
  const probe = await probeUrl(url);
  const err   = probe.error || (probe.ok ? null : new Error(`HTTP ${probe.status} from api.twelvedata.com`));
  const cls   = classifyApiError('TwelveData', err, probe.status);

  let rootCause = probe.ok ? 'None — API responding correctly' : cls.category;
  // TwelveData returns 200 even on error, embedding status:'error' in JSON body
  if (probe.ok && probe.body.includes('"status":"error"')) {
    rootCause = 'TwelveData returned HTTP 200 but body contains status:error — likely invalid API key or symbol.';
  }

  return {
    service:   'TwelveData', endpoint, keyPresent, keyLength,
    httpStatus: probe.status,
    ok:         probe.ok && !probe.body.includes('"status":"error"'),
    errorCategory:   (probe.ok && !probe.body.includes('"status":"error"')) ? null : cls.category,
    rootCause,
    recommendedFix:  (probe.ok && !probe.body.includes('"status":"error"')) ? '' : cls.recommended_fix,
    responseSnippet: (probe.ok && !probe.body.includes('"status":"error"')) ? '(success — price data returned)' : probe.body.slice(0, 200) || cls.error,
    ms:        probe.ms,
    timestamp: new Date().toISOString(),
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const [fred, finnhubNews, finnhubCal, twelvedata] = await Promise.allSettled([
    probeFRED(env.FRED_API_KEY),
    probeFinnhubNews(env.FINNHUB_API_KEY),
    probeFinnhubCalendar(env.FINNHUB_API_KEY),
    probeTwelveData(env.TWELVEDATA_API_KEY),
  ]);

  const providers = [
    fred.status       === 'fulfilled' ? fred.value       : { service: 'FRED',              rootCause: fred.reason?.message },
    finnhubNews.status === 'fulfilled' ? finnhubNews.value : { service: 'Finnhub (news)',    rootCause: finnhubNews.reason?.message },
    finnhubCal.status  === 'fulfilled' ? finnhubCal.value  : { service: 'Finnhub (calendar)',rootCause: finnhubCal.reason?.message },
    twelvedata.status  === 'fulfilled' ? twelvedata.value  : { service: 'TwelveData',        rootCause: twelvedata.reason?.message },
  ];

  const result = {
    status:    'ok',
    diagAt:    new Date().toISOString(),
    summary: {
      FRED:               fred.status       === 'fulfilled' && fred.value.ok       ? 'OK' : 'FAIL',
      'Finnhub (news)':   finnhubNews.status === 'fulfilled' && finnhubNews.value.ok ? 'OK' : 'FAIL',
      'Finnhub (calendar)': finnhubCal.status === 'fulfilled' && finnhubCal.value.ok ? 'OK' : 'FAIL',
      TwelveData:         twelvedata.status  === 'fulfilled' && twelvedata.value.ok  ? 'OK' : 'FAIL',
    },
    providers,
    securityNote: 'API key values are never included in this response. keyLength shows character count of the stored key.',
  };

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}
