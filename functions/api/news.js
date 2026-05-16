// functions/api/news.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/news
//
// Returns recent financial headlines relevant to gold, bitcoin, and macro,
// aggregated from three independent providers with cross-source dedup.
//
// Cache TTL : 420 seconds (7 minutes)
//
// Provider chain (parallel fetch, graceful degradation):
//   1. GNews   — Primary editorial source (gold, bitcoin, Fed, inflation, DXY)
//   2. Finnhub — General market news
//   3. FMP     — General financial news
//
// All three are normalised to a common shape, deduplicated by title fingerprint,
// sorted by publishedAt desc, and capped at 12 articles.
//
// If a provider fails, its sourceStatus is marked 'error' and the endpoint
// continues with whatever providers succeeded. If ALL fail, articles is [].
//
// Response shape:
// {
//   "status":       "ok",
//   "updatedAt":    "ISO timestamp",
//   "sourceStatus": { "gnews": "ok", "finnhub": "ok", "fmp": "ok" },
//   "count":        12,
//   "articles": [
//     {
//       "title":       "...",
//       "source":      "Reuters",
//       "publishedAt": "ISO timestamp",
//       "url":         "https://...",
//       "assets":      ["gold", "macro"]
//     }
//   ]
// }
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cachePut } from '../utils/cache.js';
import {
  fetchGNewsHeadlines,
  fetchFinnhubNews,
  fetchFMPNews,
}                              from '../utils/fetchers.js';
import {
  normalizeGNewsItem,
  normalizeFinnhubNewsItem,
  normalizeFMPNewsItem,
  buildSourceStatus,
}                              from '../utils/normalizers.js';

const CACHE_TTL_SECONDS = 420; // 7 minutes
const MAX_ARTICLES      = 12;

const CORS_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/**
 * Deduplicate an article list by lowercase title fingerprint.
 * Preserves first occurrence, drops later duplicates.
 */
function dedupeArticles(articles) {
  const seen = new Set();
  const out  = [];
  for (const a of articles) {
    if (!a || !a.title) continue;
    const key = a.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * Sort articles by publishedAt descending (newest first).
 * Articles with null publishedAt sink to the bottom.
 */
function sortByRecency(articles) {
  return articles.slice().sort((a, b) => {
    if (!a.publishedAt) return  1;
    if (!b.publishedAt) return -1;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });
}

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
  let aggregated     = [];

  // ── Parallel fetch from all three providers ──────────────────────────────
  const [gnewsRes, finnhubRes, fmpRes] = await Promise.allSettled([
    fetchGNewsHeadlines(env.GNEWS_API_KEY),
    fetchFinnhubNews(env.FINNHUB_API_KEY),
    fetchFMPNews(env.FMP_API_KEY),
  ]);

  // ── GNews (primary) ───────────────────────────────────────────────────────
  if (gnewsRes.status === 'fulfilled' && Array.isArray(gnewsRes.value)) {
    aggregated = aggregated.concat(
      gnewsRes.value.map(normalizeGNewsItem).filter(Boolean),
    );
    sourceStatus.gnews = 'ok';
  } else {
    sourceStatus.gnews = 'error';
    console.error('[/api/news] GNews failed:', gnewsRes.reason?.message);
  }

  // ── Finnhub (secondary) ──────────────────────────────────────────────────
  if (finnhubRes.status === 'fulfilled' && Array.isArray(finnhubRes.value)) {
    aggregated = aggregated.concat(
      finnhubRes.value.map(normalizeFinnhubNewsItem).filter(Boolean),
    );
    sourceStatus.finnhub = 'ok';
  } else {
    sourceStatus.finnhub = 'error';
    console.error('[/api/news] Finnhub news failed:', finnhubRes.reason?.message);
  }

  // ── FMP (tertiary) ───────────────────────────────────────────────────────
  if (fmpRes.status === 'fulfilled' && Array.isArray(fmpRes.value)) {
    aggregated = aggregated.concat(
      fmpRes.value.map(normalizeFMPNewsItem).filter(Boolean),
    );
    sourceStatus.fmp = 'ok';
  } else {
    sourceStatus.fmp = 'error';
    console.error('[/api/news] FMP news failed:', fmpRes.reason?.message);
  }

  // ── Dedupe + sort + cap ──────────────────────────────────────────────────
  const articles = sortByRecency(dedupeArticles(aggregated)).slice(0, MAX_ARTICLES);

  // ── Assemble response ─────────────────────────────────────────────────────
  const result = {
    status:       'ok',
    updatedAt:    new Date().toISOString(),
    sourceStatus: buildSourceStatus(sourceStatus),
    count:        articles.length,
    articles,
  };

  await cachePut(request, result, CACHE_TTL_SECONDS);

  return new Response(JSON.stringify(result), {
    status:  200,
    headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
  });
}
