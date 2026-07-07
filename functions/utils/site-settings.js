// functions/utils/site-settings.js
// ════════════════════════════════════════════════════════════════════════════
// GENERIC KEY/VALUE CONFIG STORE (site_settings table, AI Supabase project) —
// same self-contained REST-client pattern as system-log.js/article-store.js
// (zero import coupling, graceful no-op until configured). Introduced for the
// Production Routing control (Chatbot Checker), but intentionally generic
// (key/value, not "routing_config" specific) so future admin-configurable
// settings reuse this instead of adding another one-off table.
// ════════════════════════════════════════════════════════════════════════════

function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

async function sb(env, method, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = {
      apikey: env.AI_SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    };
    const res = await fetch(`${env.AI_SUPABASE_URL}/rest/v1/site_settings${qs ? '?' + qs : ''}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    if (prefer === 'return=minimal') return true;
    return res.json().catch(() => null);
  } catch { return null; }
}

// Returns `fallback` (never throws, never blocks the caller) when unconfigured,
// the row doesn't exist yet, or the request fails/times out — callers (like
// ai-chat.js's per-request routing lookup) must degrade to a safe default, not
// break the chat reply.
export async function getSetting(env, key, fallback = null) {
  const rows = await sb(env, 'GET', `key=eq.${encodeURIComponent(key)}&select=value&limit=1`, null, null);
  if (!Array.isArray(rows) || !rows.length) return fallback;
  return rows[0].value ?? fallback;
}

export async function setSetting(env, key, value) {
  return sb(env, 'POST', 'on_conflict=key', { key, value, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
}
