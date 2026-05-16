// functions/utils/cache.js
// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Cache API wrapper for Pages Functions.
//
// Uses caches.default — the Cloudflare CDN edge cache. No KV binding required.
// Each cache hit eliminates all upstream API calls within the TTL window,
// protecting provider rate limits and reducing latency.
//
// Key design:
//   - Cache key  = the original Request object (URL = the Pages Function endpoint)
//   - Stored     = a complete Response with Content-Type + Cache-Control + CORS headers
//   - On HIT     = return cached Response directly (X-Cache: HIT header set at write time)
//   - On failure = non-fatal; endpoint falls through to live fetch
//
// TTL windows (set by caller):
//   /api/market    → 45 s
//   /api/sentiment → 90 s
//   /api/news      → 420 s (7 min)
//
// Note: In local development with `wrangler pages dev`, caches.default is
// available but may behave as a no-op. All endpoints degrade gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/**
 * Attempt to serve a cached Response for the given request.
 *
 * @param {Request} request - The incoming Pages Function request.
 * @returns {Promise<Response|null>} Cached Response with all headers, or null on miss.
 */
export async function cacheGet(request) {
  try {
    const cache  = caches.default;
    const cached = await cache.match(request);
    return cached || null;
  } catch {
    // Cache API unavailable — caller falls through to live fetch.
    return null;
  }
}

/**
 * Store a data object in the edge cache under the given request URL.
 * The stored Response already includes Content-Type, Cache-Control, CORS,
 * and X-Cache: HIT so callers can return it directly on the next request.
 *
 * @param {Request} request     - The incoming Pages Function request (used as key).
 * @param {object}  data        - JSON-serialisable data payload.
 * @param {number}  ttlSeconds  - Cache lifetime in seconds.
 */
export async function cachePut(request, data, ttlSeconds) {
  try {
    const cache    = caches.default;
    const response = new Response(JSON.stringify(data), {
      status:  200,
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
        'X-Cache':       'HIT',
        ...CORS_HEADERS,
      },
    });
    await cache.put(request, response);
  } catch {
    // Cache write failure is non-fatal — endpoint response is still returned.
  }
}
