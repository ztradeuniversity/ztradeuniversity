// functions/api/signals.js
// ════════════════════════════════════════════════════════════════════════════
// SIGNAL HISTORY API — public reads + admin management.
//
//   GET  ?action=list                      → published signals + computed stats
//                                            (numeric TP/SL stripped — see below)
//        ?action=list&all=1   (admin)      → raw rows, incl. unpublished drafts
//   POST {action:create|update|delete}     (admin — header x-admin-key: AI_ADMIN_KEY)
//
// PUBLIC CONTRACT: a public `list` never carries stop_loss / take_profit /
// entry_price. Exits are published as "TP: ZTU Bot / SL: ZTU Bot", and entry is
// published as a ZONE (entry_zone_start/end). The numbers are removed here,
// server-side, so they are absent from the JSON itself rather than merely
// hidden by the page. Per-signal results are published as signed `result_pips`,
// and stats add winningPips / losingPips / netPips (the Overall Outcome).
//
// Table: signal_history   (signal-store.js · AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY)
// Graceful on READ: returns {configured:false, signals:[]} until AI Supabase
// creds exist, so the public page shows an honest empty state instead of an
// error. WRITES do the opposite and fail loudly (503) — a write that silently
// no-ops is how a signal ends up "saved" but never visible.
//
// Additive only — does NOT touch Journal/AI/Library/Mentor/OTP/RLS/Auth.
// ════════════════════════════════════════════════════════════════════════════

import {
  isConfigured, listSignals, createSignal, updateSignal, deleteSignal, computeStats, toPublicSignal,
} from '../utils/signal-store.js';
import { requireAdminModule } from '../utils/admin-session.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
};
// no-store: a signal published from the admin must appear on the public page on
// the very next load. This response is per-request and tiny; edge-caching it is
// what makes a fresh signal look like it "did not save".
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

function isAdmin(request, env) {
  return requireAdminModule(env, request, 'signals', { header: 'x-admin-key', value: env.AI_ADMIN_KEY });
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
    const wantAll = u.searchParams.get('all') === '1' && await isAdmin(request, env);
    const signals = await listSignals(env, { all: wantAll });
    // Stats are computed over PUBLISHED signals only (what the public sees),
    // and BEFORE the public projection — avgRR needs the raw TP/SL that the
    // public rows deliberately do not carry.
    const publicSet = wantAll ? signals.filter((s) => s.is_published) : signals;
    const stats = computeStats(publicSet);
    // Admins get the raw rows (the editor needs TP/SL to load them back);
    // everyone else gets rows with numeric TP/SL stripped out entirely.
    const out = wantAll ? signals : signals.map(toPublicSignal);
    return json({ configured: true, signals: out, stats });
  }

  // ── POST — admin writes ─────────────────────────────────────────────────────
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await isAdmin(request, env))) return json({ error: 'admin only — missing/invalid x-admin-key' }, 403);
  // A write against an unconfigured store MUST fail loudly. This previously
  // returned 200 {configured:false, saved:false} with no `error`, so the admin
  // UI reported "Signal created" while nothing was ever written — the signal
  // then never appeared on the public page.
  if (!cfg) {
    return json({
      configured: false, saved: false,
      error: 'Signal store not connected — AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY are not configured. Nothing was saved.',
    }, 503);
  }

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
