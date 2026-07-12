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
