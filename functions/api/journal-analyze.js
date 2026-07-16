// functions/api/journal-analyze.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 6 — TRADE AUDIT ENDPOINT
// PHASE 9 — AI MENTOR MODE (additive)
//
// POST { trade, recentTrades? } → { ok:true, analysis }
//
// A thin wrapper over functions/utils/journal-analysis.js. The audit itself
// holds no secrets and stores nothing directly — the browser posts the trade
// it just saved, gets the audit back, and writes it into that trade's own
// `ai_analysis` column through the existing RLS-protected Supabase client
// (auth.uid() = user_id), so a caller can never write to somebody else's row.
//
// PHASE 9 ADDS ONE THING: if Admin has switched Mentor Mode to "AI" (stored
// in journal_admin_settings, toggled from functions/api/journal-admin.js),
// this endpoint ALSO auto-creates/updates a `mentor_reviews` row for the
// trade — the exact same table the Manual Mentor workflow writes to — so the
// student's Mentor Feedback panel shows a review with zero admin action.
// That write uses the service-role key (mentor_reviews has no browser INSERT
// policy by design), so the caller's identity is verified from the Supabase
// JWT the browser already holds (HMAC-verified against
// JOURNAL_SUPABASE_JWT_SECRET, the SAME secret journal-access.js used to
// mint it) — never trusted from a client-supplied user_id, which would let a
// caller stamp a review onto someone else's account.
// ════════════════════════════════════════════════════════════════════════════

import { analyzeTrade } from '../utils/journal-analysis.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// Only the fields the engine actually reads are accepted, so an oversized or
// hostile body can never reach the rules.
function pickTrade(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    id:               t.id ?? null,
    result:           t.result ?? null,
    result_amount:    t.result_amount ?? null,
    pnl:              t.pnl ?? null,
    rr_ratio:         t.rr_ratio ?? null,
    take_profit:      t.take_profit ?? null,
    entry_type:       t.entry_type === 'ZONE' ? 'ZONE' : 'SINGLE',
    entry_price:      t.entry_price ?? null,
    entry_from:       t.entry_from ?? null,
    entry_to:         t.entry_to ?? null,
    stop_loss:        t.stop_loss ?? null,
    trade_reason:     typeof t.trade_reason === 'string' ? t.trade_reason.slice(0, 1000) : null,
    confidence_level: t.confidence_level ?? null,
    emotion:          t.emotion ?? null,
    followed_plan:    typeof t.followed_plan === 'boolean' ? t.followed_plan : null,
    followed_risk:    typeof t.followed_risk === 'boolean' ? t.followed_risk : null,
    created_at:       t.created_at ?? null,
    trade_id:         typeof t.trade_id === 'string' ? t.trade_id.slice(0, 40) : null,
  };
}

// ── Verify the browser's Journal Supabase JWT (HS256) — same secret/shape
//    journal-access.js used to mint it. Returns the trusted user_id (sub),
//    or null if missing/invalid/expired. Never trust a client-supplied id. ──
const enc = new TextEncoder();
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}
function b64url(bytes) {
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmacSha256(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
async function verifyJournalJwt(env, token) {
  if (!token || !env.JOURNAL_SUPABASE_JWT_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, payload, sig] = parts;
  const expected = b64url(await hmacSha256(env.JOURNAL_SUPABASE_JWT_SECRET, `${head}.${payload}`));
  if (expected !== sig) return null;
  try {
    const claims = JSON.parse(b64urlDecode(payload));
    if (!claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims.sub;
  } catch { return null; }
}

// ── Minimal service-role REST helpers (mirrors functions/api/journal-admin.js) ──
function sbHeaders(env) {
  const key = env.JOURNAL_SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
async function sbGet(env, path) {
  const r = await fetch(`${env.JOURNAL_SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
  if (!r.ok) throw new Error(`supabase GET ${r.status}`);
  return r.json();
}
async function sbInsert(env, table, row) {
  const r = await fetch(`${env.JOURNAL_SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sbHeaders(env), Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase POST ${table} ${r.status}`);
}
async function sbPatch(env, table, match, row) {
  const r = await fetch(`${env.JOURNAL_SUPABASE_URL}/rest/v1/${table}?${match}`, {
    method: 'PATCH', headers: { ...sbHeaders(env), Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase PATCH ${table} ${r.status}`);
}

// One valid mentor_reviews.category per primary weakness code (Task 4).
const CATEGORY_BY_CODE = {
  'risk-management-weak':      'Risk Management Issue',
  'psychology-weak':           'Psychology Issue',
  'emotional-trading':         'Psychology Issue',
  'fomo':                      'Psychology Issue',
  'revenge-trading':           'Rule Violation',
  'discipline-weak':           'Needs Improvement',
  'overtrading':                'Rule Violation',
  'technical-analysis-weak':   'Setup Issue',
  'poor-entry':                'Bad Entry',
  'poor-exit':                 'Execution Issue',
  'fundamental-analysis-weak': 'Setup Issue',
  'wide-entry-zone':           'Setup Issue',
};
function categoryFor(analysis) {
  if (analysis.primary_code) return CATEGORY_BY_CODE[analysis.primary_code] || 'Custom Review';
  return analysis.result === 'PROFIT' ? 'Approved Trade' : 'Needs Improvement';
}

// Best-effort, NEVER allowed to fail the request: if Admin has Mentor Mode
// set to AI, auto-create (or refresh) this trade's mentor_reviews row using
// the same coach narrative the student already sees on the trade itself.
async function maybeAutoMentorReview(env, request, trade, analysis) {
  if (!env.JOURNAL_SUPABASE_URL || !env.JOURNAL_SUPABASE_SERVICE_ROLE_KEY) return;
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const userId = await verifyJournalJwt(env, token);
  if (!userId) return; // no verified identity → never write on someone's behalf

  const settings = await sbGet(env, 'journal_admin_settings?select=mentor_mode&id=eq.1').catch(() => []);
  const mode = settings?.[0]?.mentor_mode || 'MANUAL';
  if (mode !== 'AI') return;

  const row = {
    user_id: userId,
    category: categoryFor(analysis),
    comment: analysis.coachNote || analysis.summary || 'AI review generated.',
    mentor_name: 'AI Mentor',
    trade_id: trade.trade_id || null,
  };

  if (trade.trade_id) {
    const existing = await sbGet(env,
      `mentor_reviews?select=id&trade_id=eq.${encodeURIComponent(trade.trade_id)}&mentor_name=eq.AI%20Mentor&limit=1`
    ).catch(() => []);
    if (existing?.[0]?.id) {
      await sbPatch(env, 'mentor_reviews', `id=eq.${existing[0].id}`, { category: row.category, comment: row.comment });
      return;
    }
  }
  await sbInsert(env, 'mentor_reviews', row);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const trade = pickTrade(body?.trade);
  if (!trade) return json({ ok: false, error: 'trade_required' }, 400);

  // Context for the overtrading / revenge-window rules AND the recurring-
  // mistake detector (ai_primary_code — the PRIMARY weakness this same engine
  // already stored on each past trade, so no extra scoring pass over history
  // is needed). Capped: these rules only look at same-day / a 60-min window /
  // the last 10 trades, so 200 rows is ample.
  const recentTrades = Array.isArray(body?.recentTrades)
    ? body.recentTrades.slice(0, 200).map((r) => ({
        id:              r?.id ?? null,
        result:          r?.result ?? null,
        pnl:             r?.pnl ?? null,
        created_at:      r?.created_at ?? null,
        ai_primary_code: typeof r?.ai_primary_code === 'string' ? r.ai_primary_code : null,
      }))
    : [];

  let analysis;
  try {
    analysis = analyzeTrade(trade, { recentTrades });
  } catch {
    // The audit must never be able to block a trade from being saved.
    return json({ ok: false, error: 'analysis_failed' }, 500);
  }

  // Task 4 — AI Mentor Mode: best-effort, isolated from the response above so
  // a settings/DB hiccup here can never turn a successful audit into an error.
  try { await maybeAutoMentorReview(env, request, trade, analysis); } catch {}

  return json({ ok: true, analysis });
}
