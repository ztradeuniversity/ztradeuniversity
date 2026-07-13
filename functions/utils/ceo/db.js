// functions/utils/ceo/db.js
//
// Thin Supabase REST helper for AI CEO OS Functions. Data operations run with
// the USER's own bearer token (+ anon apikey) so RLS is enforced exactly as
// designed — the service_role key is never used for module data (it exists
// only inside verify-session.js's allowlist check). Every module Function
// imports this instead of hand-rolling fetch calls.

export function rest(env, userToken) {
  const base = `${env.CEO_SUPABASE_URL}/rest/v1`;
  const headers = {
    Authorization: `Bearer ${userToken}`,
    apikey: env.CEO_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  async function run(method, path, body, extraHeaders) {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: { ...headers, ...(extraHeaders || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`supabase_${method.toLowerCase()}_failed:${res.status}:${detail.slice(0, 300)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    // query: a PostgREST query string, e.g. "select=*&owner_user_id=eq.X&order=created_at.desc"
    select: (table, query) => run('GET', `${table}?${query}`),
    insert: (table, rows) => run('POST', `${table}`, rows, { Prefer: 'return=representation' }),
    update: (table, query, patch) =>
      run('PATCH', `${table}?${query}`, patch, { Prefer: 'return=representation' }),
  };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Standard guard for every module Function: verifies session + allowlist,
// returns { user, token } or a ready-to-return 401/403 Response.
import { verifySession } from './verify-session.js';

export async function requireFounder(request, env) {
  const result = await verifySession(request, env);
  if (!result.authorized) {
    const status = result.reason === 'not_allowlisted' ? 403 : 401;
    return { response: json({ error: result.reason }, status) };
  }
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return { user: result.user, token };
}

// --- Execution-state tag ---------------------------------------------
//
// daily_activities.status is frozen to ('pending','completed','skipped') —
// there is no 'partial' value and no real_minutes/notes columns (Founder OS
// Restructure Step 3 forbids new migrations). This generalizes the pattern
// Step 2 already used for skip reasons (appending "| skipped:<reason>" to
// description) into one parse-safe tag covering all four founder-facing
// states. DB status stays a valid enum member; the tag carries the richer
// UI state on top of it:
//   not_started -> DB status 'pending', no tag
//   partial     -> DB status stays 'pending', tag records real minutes + note
//   completed   -> DB status 'completed', tag optionally records real minutes + note
//   skipped     -> DB status 'skipped', tag records the reason as note
//
// Old Step-2 rows using the bare "| skipped:<reason>" convention are still
// read correctly (see parseExecTag's fallback) — no historical data is lost.
const EXEC_TAG_RE = / ?#EXEC#(.*?)#$/;
const LEGACY_SKIP_RE = / ?\| skipped:(.*)$/;

export function stripExecTag(description) {
  return String(description || '').replace(EXEC_TAG_RE, '').replace(LEGACY_SKIP_RE, '');
}

export function parseExecTag(description) {
  const raw = String(description || '');
  const tagged = EXEC_TAG_RE.exec(raw);
  if (tagged) {
    const fields = Object.fromEntries(
      tagged[1].split(';').map((kv) => {
        const i = kv.indexOf('=');
        return i === -1 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)];
      })
    );
    return {
      state: fields.state || 'not_started',
      realMinutes: fields.real ? Number(fields.real) : null,
      note: fields.note ? decodeURIComponent(fields.note) : '',
    };
  }
  const legacy = LEGACY_SKIP_RE.exec(raw);
  if (legacy) return { state: 'skipped', realMinutes: null, note: legacy[1] || '' };
  return { state: 'not_started', realMinutes: null, note: '' };
}

export function buildExecTag(state, realMinutes, note) {
  const real = Number.isFinite(realMinutes) ? realMinutes : '';
  const noteEnc = note ? encodeURIComponent(String(note).slice(0, 300)) : '';
  return ` #EXEC#state=${state};real=${real};note=${noteEnc}#`;
}

// Applies a new exec state to a description, replacing any prior tag
// (old or new format) rather than stacking — every update is idempotent.
export function withExecTag(description, state, realMinutes, note) {
  return stripExecTag(description) + buildExecTag(state, realMinutes, note);
}
