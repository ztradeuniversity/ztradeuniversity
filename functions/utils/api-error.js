// functions/utils/api-error.js
// ════════════════════════════════════════════════════════════════════════════
// STANDARDIZED API-FAILURE VISIBILITY — turn any upstream failure into a single
// structured object so a failure is NEVER logged as just "error". Reusable for
// every provider (FRED, TwelveData, Finnhub, OpenAI/Workers AI, Supabase, …).
//
//   classifyApiError(provider, err, status?) → {
//     provider, status, error, phase, category, recommended_fix
//   }
//
// phase     : 'before-request' | 'during-request' | 'after-response'
// category  : Missing API key | Invalid/expired/revoked key | Rate limit/quota |
//             Timeout | Network error | Cloudflare edge/egress | Provider outage | Unknown
// Pure (no I/O). Errors thrown by fetchers.js carry "HTTP <status> …" / "Timeout (…)".
// ════════════════════════════════════════════════════════════════════════════

export function classifyApiError(provider, err, status = null) {
  const msg = String((err && err.message) || err || '').trim();
  // Recover an HTTP status from the thrown message ("HTTP 429 …") when not passed.
  const m = msg.match(/\bHTTP (\d{3})\b/);
  const s = status != null ? status : (m ? Number(m[1]) : null);

  let category = 'Unknown', phase = 'during-request', recommended_fix = '';

  if (/api_key is not set|missing .*key|no .*key/i.test(msg)) {
    category = 'Missing API key'; phase = 'before-request';
    recommended_fix = `Set the ${provider} API key in Cloudflare → Pages → Environment variables, then redeploy.`;
  } else if (/not a 32 character|is not registered|invalid .*key|unauthor/i.test(msg) || s === 401 || s === 403) {
    category = 'Invalid / expired / revoked key'; phase = 'after-response';
    recommended_fix = `Verify or rotate the ${provider} API key (no spaces/newline); update the secret and redeploy.`;
  } else if (s === 429 || /quota|rate.?limit|exceeded|too many requests/i.test(msg)) {
    category = 'Rate limit / quota exceeded'; phase = 'after-response';
    recommended_fix = `Lower request rate or fix ${provider} plan/billing; values resume when the limit clears.`;
  } else if (/Timeout \(/i.test(msg) || s === 524) {
    category = 'Timeout'; phase = 'during-request';
    recommended_fix = `${provider} responded too slowly; check provider latency (raising the timeout only helps if it eventually returns valid data).`;
  } else if (s != null && s >= 520 && s <= 526) {
    category = 'Cloudflare edge / egress issue'; phase = 'after-response';
    recommended_fix = `Cloudflare↔${provider} edge rejection (commonly a CDN/WAF blocking Cloudflare Workers egress). NOT fixable by repo code — check Cloudflare Smart Placement and/or request ${provider} to allowlist Cloudflare egress.`;
  } else if (s != null && s >= 500) {
    category = 'Provider-side outage'; phase = 'after-response';
    recommended_fix = `${provider} returned ${s} (transient upstream outage); it should recover on its own.`;
  } else if (/network|fetch failed|connection|ENOTFOUND|getaddrinfo|ECONN|dns/i.test(msg)) {
    category = 'Network error'; phase = 'during-request';
    recommended_fix = `Network/DNS to ${provider} failed from the Worker; verify the host is reachable.`;
  } else if (s != null && s >= 400) {
    category = 'Invalid / expired / revoked key'; phase = 'after-response';
    recommended_fix = `${provider} rejected the request (${s}); check the request parameters and key.`;
  }

  return { provider, status: s, error: msg.slice(0, 200), phase, category, recommended_fix };
}
