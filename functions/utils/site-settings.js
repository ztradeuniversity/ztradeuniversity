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

// ERROR HANDLING task — root cause of the admin panel's "Failed to save — check
// Error Center" with nothing in the Error Center: every failure mode here
// (unconfigured project, missing site_settings table, RLS rejection, timeout)
// collapsed into a bare `null`, so the caller could only report a generic
// failure and had no reason to log. `_lastError` records the real reason for
// the most recent call so setSetting can return it. Read-path behaviour is
// unchanged — getSetting still degrades silently to its fallback, because a
// routing lookup must never break a live chat reply.
let _lastError = null;
export function lastSettingsError() { return _lastError; }

async function sb(env, method, qs, body, prefer) {
  _lastError = null;
  if (!isConfigured(env)) {
    _lastError = 'AI Supabase is not configured (AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY missing).';
    return null;
  }
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
    if (!res.ok) {
      // Report the REAL reason PostgREST gave, mapped to plain language for the
      // admin panel. The raw detail is appended so nothing is hidden.
      const detail = await res.text().catch(() => '');
      const d = detail.toLowerCase();
      _lastError =
        res.status === 404 || d.includes('does not exist') || d.includes('pgrst205')
          ? 'site_settings table missing — run the site_settings migration in the AI Supabase project.'
        : res.status === 401 || res.status === 403 || d.includes('row-level security') || d.includes('rls')
          ? (d.includes('row-level security') || d.includes('rls')
              ? 'RLS policy blocked the request — the service key is not permitted to write site_settings.'
              : 'Permission denied — check AI_SUPABASE_SERVICE_KEY.')
        : `Supabase returned HTTP ${res.status}${detail ? ' — ' + detail.slice(0, 200) : ''}`;
      return null;
    }
    // ROOT CAUSE OF THE FALSE "Could not persist the routing config." —
    // setSetting calls this with prefer = 'resolution=merge-duplicates,return=minimal',
    // so the old strict `prefer === 'return=minimal'` comparison was FALSE and
    // execution fell through to res.json(). Supabase honours return=minimal by
    // replying 201 with an EMPTY body, so res.json() threw, `.catch(() => null)`
    // returned null, and the caller reported a failure — even though the row had
    // been written successfully. `_lastError` stayed null (res.ok was true),
    // which is why the message was the generic fallback with no real reason.
    // A substring test matches every Prefer combination that suppresses the body.
    if (prefer && prefer.includes('return=minimal')) return true;
    return res.json().catch(() => null);
  } catch (e) {
    _lastError = (e && (e.name === 'TimeoutError' || e.name === 'AbortError'))
      ? 'Network error — the Supabase request timed out after 4s.'
      : `Network error — ${(e && e.message) || 'the Supabase request failed'}.`;
    return null;
  }
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
