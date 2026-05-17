// functions/api/news.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/news
//
// Returns recent financial headlines relevant to gold, bitcoin, and macro.
// Finnhub is tried first; GNews is the fallback if Finnhub fails or is empty.
//
// Cache TTL : 420 seconds (7 minutes)
//
// Provider chain (sequential, graceful degradation):
//   1. Finnhub — Primary market news source (general category)
//   2. GNews   — Fallback editorial source (gold, bitcoin, Fed, inflation, DXY)
//
// Finnhub is tried first. If it fails or returns an empty array, GNews is tried.
// Articles are normalised to a common shape, deduplicated by title fingerprint,
// sorted by publishedAt desc, and capped at 12.
//
// If both providers fail, articles is [].
//
// Response shape:
// {
//   "status":       "ok",
//   "updatedAt":    "ISO timestamp",
//   "sourceStatus": { "finnhub": "ok", "gnews": "unused" },
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
  fetchFinnhubNews,
  fetchGNewsHeadlines,
}                              from '../utils/fetchers.js';
import {
  normalizeFinnhubNewsItem,
  normalizeGNewsItem,
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

  // ── Primary: Finnhub ─────────────────────────────────────────────────────
  try {
    const finnhubData = await fetchFinnhubNews(env.FINNHUB_API_KEY);
    if (Array.isArray(finnhubData) && finnhubData.length > 0) {
      aggregated = finnhubData.map(normalizeFinnhubNewsItem).filter(Boolean);
      sourceStatus.finnhub = 'ok';
      sourceStatus.gnews   = 'unused';
    } else {
      throw new Error('empty response');
    }
  } catch (err) {
    console.error('[/api/news] Finnhub primary failed:', err.message);
    sourceStatus.finnhub = 'error';

    // ── Fallback: GNews ────────────────────────────────────────────────────
    try {
      const gnewsData = await fetchGNewsHeadlines(env.NEWS_API_KEY);
      if (Array.isArray(gnewsData) && gnewsData.length > 0) {
        aggregated = gnewsData.map(normalizeGNewsItem).filter(Boolean);
        sourceStatus.gnews = 'ok';
      } else {
        throw new Error('empty response');
      }
    } catch (gnewsErr) {
      console.error('[/api/news] GNews fallback failed:', gnewsErr.message);
      sourceStatus.gnews = 'error';
    }
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
