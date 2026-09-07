// functions/api/brokers.js
// ════════════════════════════════════════════════════════════════════════════
// "YOUR BROKERS" API — public read, admin-only write.
//
//   GET  /api/brokers            → public: ACTIVE broker names for the License
//                                  Request selector
//   GET  /api/brokers?all=1      → admin:  every broker incl. disabled ones
//   POST {action:'add',        name}          → admin: add / re-enable
//   POST {action:'set-active', id, active}    → admin: enable / disable
//
// WHY THIS ENDPOINT EXISTS
// ------------------------
// The broker list has to be readable by every anonymous visitor but writable
// only by an administrator. Doing it straight from the browser would have
// required anon INSERT/UPDATE policies on `brokers`, which would let anyone
// holding the public anon key (it is committed in license-request.html by
// design) rewrite the broker configuration. Instead the table gets NO anon
// policies at all: every read and write goes through this Function using the
// server-side service key, and writes are gated by the SAME
// requireAdminModule() check every other admin endpoint already uses.
// This mirrors functions/api/signals.js (public list + admin-gated writes)
// rather than introducing a new pattern.
//
// CREDENTIALS — verified, not assumed:
//   EA_SUPABASE_URL / EA_SUPABASE_SERVICE_KEY are the SAME project that holds
//   license_requests and broker_accounts. Proof: library-auth.js's email
//   resolver queries 'broker_accounts' AND 'license_requests' through those two
//   env vars (see fetchEmailByAccount calls), and library-debug.js reads the
//   same three tables from the same project. Both tables are confirmed present
//   in the project the admin dashboard writes to. A live probe of
//   POST /api/library-auth {action:'verify-session'} with a nonexistent account
//   returned {ok:true, valid:false} — a demo-mode (unconfigured) deployment
//   would have returned valid:true — so these credentials are live in
//   production. No new environment variable is introduced by this file.
//
// Graceful: returns {configured:false, brokers:[]} when EA credentials are
// absent, so the public form falls back to its built-in list instead of
// breaking. Writes against an unconfigured store fail LOUDLY (503) — a write
// that silently no-ops is how a broker looks "saved" but never appears.
// Touches NOTHING else: no license_requests, no email_outbox, no OTP, no
// Library/Journal/AI tables.
// ════════════════════════════════════════════════════════════════════════════

import { requireAdminModule } from '../utils/admin-session.js';

const TABLE = 'brokers';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
};
// no-store: a broker added in the dashboard must appear on the public form on
// the very next load. Same reasoning as signals.js — the payload is tiny.
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

function isConfigured(env) {
  return !!(env?.EA_SUPABASE_URL && env?.EA_SUPABASE_SERVICE_KEY);
}

// The dashboard authenticates as module 'dashboard'; the legacy shared-key
// header is accepted for parity with every other admin endpoint.
function isAdmin(request, env) {
  return requireAdminModule(env, request, 'dashboard', { header: 'x-admin-key', value: env.AI_ADMIN_KEY });
}

async function sb(env, method, qs, body, prefer) {
  const url = `${env.EA_SUPABASE_URL}/rest/v1/${TABLE}${qs ? '?' + qs : ''}`;
  const headers = {
    apikey: env.EA_SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.EA_SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
  const res = await fetch(url, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(6000),
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, raw: text };
}

// Same normalization the shared client module and the table's unique index use:
// trim, collapse internal whitespace; compare case-insensitively.
function normalizeName(n) { return String(n == null ? '' : n).trim().replace(/\s+/g, ' '); }
function nameKey(n) { return normalizeName(n).toLowerCase(); }

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const u = new URL(request.url);

  // ── GET — public reads (active only); admins may ask for everything ────────
  if (request.method === 'GET') {
    if (!isConfigured(env)) {
      return json({ configured: false, brokers: [], note: 'Broker store not connected yet.' });
    }
    const wantAll = u.searchParams.get('all') === '1' && await isAdmin(request, env);
    const qs = (wantAll ? '' : 'is_active=eq.true&') +
      'select=id,name,is_active,sort_order,created_at&order=sort_order.asc&order=name.asc';
    const r = await sb(env, 'GET', qs);
    if (!r.ok) {
      // Missing table (pre-migration) is reported honestly, not as an empty
      // list, so the admin panel can tell the operator to run the migration.
      return json({ configured: true, brokers: [], error: 'read_failed', detail: r.raw.slice(0, 300) }, 200);
    }
    const rows = Array.isArray(r.data) ? r.data : [];
    return json({
      configured: true,
      brokers: wantAll ? rows : rows.map(x => normalizeName(x.name)).filter(Boolean),
      rows: wantAll ? rows : undefined,
    });
  }

  // ── POST — admin writes ───────────────────────────────────────────────────
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await isAdmin(request, env))) {
    return json({ ok: false, error: 'admin only' }, 403);
  }
  if (!isConfigured(env)) {
    return json({ ok: false, error: 'not_configured',
      detail: 'EA_SUPABASE_URL / EA_SUPABASE_SERVICE_KEY are not set for this deployment.' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
  const action = body?.action;

  // ── ADD (or re-enable an existing, disabled broker) ───────────────────────
  if (action === 'add') {
    const name = normalizeName(body.name);
    if (!name)            return json({ ok: false, error: 'invalid_name', message: 'Enter a broker name.' }, 400);
    if (name.length > 60) return json({ ok: false, error: 'invalid_name', message: 'Broker name is too long (max 60 characters).' }, 400);

    const existing = await sb(env, 'GET', 'select=id,name,is_active');
    if (!existing.ok) {
      return json({ ok: false, error: 'read_failed', detail: existing.raw.slice(0, 300) }, 200);
    }
    const key = nameKey(name);
    const match = (Array.isArray(existing.data) ? existing.data : []).find(r => nameKey(r.name) === key);

    if (match) {
      if (match.is_active) {
        return json({ ok: false, error: 'duplicate', message: `“${match.name}” is already in your active broker list.` });
      }
      // Re-enable ONLY — deliberately does not overwrite `name`, so typing "xm"
      // to bring back "XM" never silently renames the administrator's spelling.
      const up = await sb(env, 'PATCH', `id=eq.${encodeURIComponent(match.id)}`,
        { is_active: true, updated_at: new Date().toISOString() }, 'return=representation');
      if (!up.ok) return json({ ok: false, error: 'write_failed', detail: up.raw.slice(0, 300) }, 200);
      return json({ ok: true, reactivated: true, name: match.name, message: `“${match.name}” re-enabled.` });
    }

    const ins = await sb(env, 'POST', null, [{ name, is_active: true, sort_order: 100 }], 'return=representation');
    if (!ins.ok) {
      // The unique index is the atomic backstop when two admins add at once.
      if (ins.status === 409 || /23505|duplicate key|unique constraint/i.test(ins.raw)) {
        return json({ ok: false, error: 'duplicate', message: `“${name}” already exists in your broker list.` });
      }
      return json({ ok: false, error: 'write_failed', detail: ins.raw.slice(0, 300) }, 200);
    }
    return json({ ok: true, added: true, name, message: `“${name}” added — it now appears on the public License Request form.` });
  }

  // ── ENABLE / DISABLE ──────────────────────────────────────────────────────
  // Disabling only hides a broker from NEW submissions. It never touches
  // license_requests, so every historical request keeps its own broker_name.
  if (action === 'set-active') {
    const id = String(body.id ?? '').trim();
    if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
    const active = body.active === true || body.active === 'true' || body.active === 1;
    const up = await sb(env, 'PATCH', `id=eq.${encodeURIComponent(id)}`,
      { is_active: active, updated_at: new Date().toISOString() }, 'return=representation');
    if (!up.ok) return json({ ok: false, error: 'write_failed', detail: up.raw.slice(0, 300) }, 200);
    const row = Array.isArray(up.data) && up.data.length ? up.data[0] : null;
    return json({ ok: true, id, active, name: row ? row.name : null });
  }

  return json({ ok: false, error: 'unknown_action' }, 400);
}
