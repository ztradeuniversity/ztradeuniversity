// functions/api/signals.js
// ════════════════════════════════════════════════════════════════════════════
// SIGNAL HISTORY API — public reads + admin management.
//
//   GET  ?action=list                      → published signals + computed stats
//        ?action=list&all=1   (admin)      → includes unpublished drafts
//   POST {action:create|update|delete}     (admin — header x-admin-key: AI_ADMIN_KEY)
//
// Table: signal_history   (signal-store.js · AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY)
// Graceful: returns {configured:false, signals:[]} until AI Supabase creds exist,
// so the public page shows an honest empty state instead of an error.
//
// Additive only — does NOT touch Journal/AI/Library/Mentor/OTP/RLS/Auth.
// ════════════════════════════════════════════════════════════════════════════

import {
  isConfigured, listSignals, createSignal, updateSignal, deleteSignal, computeStats,
} from '../utils/signal-store.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

function isAdmin(request, env) {
  const provided = request.headers.get('x-admin-key') || '';
  return !!env.AI_ADMIN_KEY && provided === env.AI_ADMIN_KEY;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const u = new URL(request.url);
  const cfg = isConfigured(env);

  // ── GET — public reads ──────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const action = u.searchParams.get('action') || 'list';
    if (action !== 'list') return json({ error: `unknown action: ${action}` }, 400);

    if (!cfg) {
      return json({ configured: false, signals: [], stats: computeStats([]), note: 'Signal store not connected yet.' });
    }
    // Drafts are admin-only even on GET.
    const wantAll = u.searchParams.get('all') === '1' && isAdmin(request, env);
    const signals = await listSignals(env, { all: wantAll });
    // Stats are computed over PUBLISHED signals only (what the public sees).
    const publicSet = wantAll ? signals.filter((s) => s.is_published) : signals;
    return json({ configured: true, signals, stats: computeStats(publicSet) });
  }

  // ── POST — admin writes ─────────────────────────────────────────────────────
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!isAdmin(request, env)) return json({ error: 'admin only — missing/invalid x-admin-key' }, 403);
  if (!cfg) return json({ configured: false, saved: false, note: 'Signal store not connected yet.' });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const { action, data } = body || {};

  if (action === 'create') {
    const result = await createSignal(env, data || {});
    if (result && result.error) return json({ error: result.error }, 400);
    return json({ configured: true, saved: !!result, signal: result });
  }
  if (action === 'update') {
    const result = await updateSignal(env, data?.id, data || {});
    if (result && result.error) return json({ error: result.error }, 400);
    return json({ configured: true, saved: !!result, signal: result });
  }
  if (action === 'delete') {
    const deleted = await deleteSignal(env, data?.id);
    return json({ configured: true, deleted: !!deleted });
  }

  return json({ error: `unknown action: ${action}` }, 400);
}
