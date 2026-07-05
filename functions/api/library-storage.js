// functions/api/library-storage.js
// =============================================================================
// POST /api/library-storage
//
// Privileged Library (System B) storage operations, executed SERVER-SIDE so the
// Library service-role key never reaches the browser. Replaces the old flow
// where the admin had to paste the service key into sessionStorage every session.
//
// Required Cloudflare Pages environment variables:
//   LIBRARY_SUPABASE_URL          - Library Supabase project URL (System B)
//   LIBRARY_SUPABASE_SERVICE_KEY  - Library service_role key (server-side only)
//   LIBRARY_ADMIN_PASSCODE        - must match the admin dashboard passcode
//
// Actions (POST JSON):
//   { action:'status',  passcode }                 => { ok, buckets:{name:bool} }
//   { action:'init',    passcode }                 => { ok, results:[{id,created|exists|error}] }
//   { action:'sign-upload', passcode, bucket, path } => { ok, signedUrl, publicUrl }
//
// Security:
//   - The service key is read from env and NEVER returned to the client.
//   - Every action requires the admin passcode (constant-time compared).
//   - File bytes do NOT pass through this Worker: 'sign-upload' returns a
//     short-lived Supabase signed URL the browser PUTs directly to.
// =============================================================================

import { requireAdminModule, timingSafeEqual } from '../utils/admin-session.js';

const BUCKET_DEFS = [
  { id: 'library-covers', name: 'library-covers', public: true,  fileSizeLimit: 5242880   },
  { id: 'library-books',  name: 'library-books',  public: false, fileSizeLimit: 52428800  },
  { id: 'library-audio',  name: 'library-audio',  public: false, fileSizeLimit: 104857600 },
  { id: 'library-videos', name: 'library-videos', public: false, fileSizeLimit: 524288000 }
];

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequest(ctx) {
  const { request, env } = ctx;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const url        = env.LIBRARY_SUPABASE_URL;
  const serviceKey = env.LIBRARY_SUPABASE_SERVICE_KEY;
  const passcode   = env.LIBRARY_ADMIN_PASSCODE;

  // Secure by default: if not configured, the endpoint stays closed.
  if (!url || !serviceKey) {
    return json({ ok: false, error: 'storage_not_configured',
      hint: 'Set LIBRARY_SUPABASE_URL and LIBRARY_SUPABASE_SERVICE_KEY in Cloudflare Pages.' }, 200);
  }

  // Admin gate — accepts the enterprise admin-portal session (Authorization:
  // Bearer, module 'library') or, as a day-1 fallback, the legacy passcode
  // sent in the request body (LIBRARY_ADMIN_PASSCODE).
  const sessionOk = await requireAdminModule(env, request, 'library');
  const legacyOk  = !!(passcode && body.passcode && timingSafeEqual(String(body.passcode), String(passcode)));
  if (!sessionOk && !legacyOk) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const headers = {
    'apikey':        serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type':  'application/json'
  };

  try {
    switch (body.action) {
      case 'status':      return await doStatus(url, headers);
      case 'init':        return await doInit(url, headers);
      case 'sign-upload': return await doSignUpload(url, headers, body);
      default:            return json({ ok: false, error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('[library-storage] error:', e?.message || e);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
}

// ── STATUS: which of the 4 buckets exist ────────────────────────────────────
async function doStatus(url, headers) {
  const buckets = {};
  for (const def of BUCKET_DEFS) {
    try {
      const r = await fetch(`${url}/storage/v1/bucket/${def.id}`, { headers });
      buckets[def.id] = r.ok;
    } catch {
      buckets[def.id] = false;
    }
  }
  return json({ ok: true, buckets });
}

// ── INIT: create any missing buckets ────────────────────────────────────────
async function doInit(url, headers) {
  const results = [];
  for (const def of BUCKET_DEFS) {
    try {
      const r = await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST', headers, body: JSON.stringify(def)
      });
      if (r.ok) {
        results.push({ id: def.id, status: 'created' });
      } else {
        const b   = await r.json().catch(() => ({}));
        const msg = String(b.message || b.error || r.status).toLowerCase();
        results.push({
          id: def.id,
          status: (msg.includes('already exists') || msg.includes('duplicate')) ? 'exists' : 'error',
          detail: b.message || b.error || `HTTP ${r.status}`
        });
      }
    } catch (e) {
      results.push({ id: def.id, status: 'error', detail: e?.message });
    }
  }
  return json({ ok: true, results });
}

// ── SIGN-UPLOAD: short-lived signed URL the browser PUTs the file to ─────────
async function doSignUpload(url, headers, body) {
  const allowed = BUCKET_DEFS.some(d => d.id === body.bucket);
  if (!allowed || !body.path || /\.\./.test(body.path)) {
    return json({ ok: false, error: 'invalid_target' }, 400);
  }

  const r = await fetch(
    `${url}/storage/v1/object/upload/sign/${body.bucket}/${encodeURI(body.path)}`,
    { method: 'POST', headers, body: JSON.stringify({}) }
  );
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error('[library-storage] sign failed:', r.status, detail);
    return json({ ok: false, error: 'sign_failed', detail }, 200);
  }
  const data = await r.json(); // { url: '/object/upload/sign/<bucket>/<path>?token=...', token }
  return json({
    ok: true,
    signedUrl: `${url}/storage/v1${data.url}`,
    publicUrl: `${url}/storage/v1/object/public/${body.bucket}/${body.path}`
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: CORS });
}
