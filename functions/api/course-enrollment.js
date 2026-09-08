// functions/api/course-enrollment.js
// =============================================================================
// POST /api/course-enrollment
//
// Premium Course + Live Mentorship enrolment intake (Batch 30 onward).
//
// PAYMENT VERIFICATION MODEL (no screenshot upload)
//   The learner pays, fills in structured payment details (sender name, date,
//   method, bank if relevant, transaction id, amount), and separately sends
//   their payment screenshot to the team's WhatsApp number. This Worker never
//   receives or stores any image/file — there is no upload flow, no signed
//   upload URL, no storage bucket dependency of any kind.
//
// Required Cloudflare Pages environment variables (all server-side only):
//   EA_SUPABASE_URL           - System A Supabase project URL (course_enrollments table)
//   EA_SUPABASE_SERVICE_KEY   - System A service_role key (bypasses RLS)
//   ADMIN_SESSION_SECRET      - already used by the admin portal (admin-session.js)
//   AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY
//                              - already-configured AI Supabase project. Reused
//                                (via functions/utils/site-settings.js's generic
//                                site_settings key/value table) ONLY to store the
//                                admin-configured payment WhatsApp number — no
//                                new table, no new project.
//
// Schema prerequisite (created manually — see supabase/course-enrollments-schema.sql):
//   · table  public.course_enrollments
//
// Actions (POST JSON):
//   { action:'submit', enrollment:{…} }                     => { ok, id, reference }   (public)
//   { action:'get-whatsapp' }                                => { ok, whatsapp:string|null } (public — read-only, no secrets)
//   { action:'list', status?, limit? }                       (ADMIN session, module 'dashboard')
//        => { ok, rows:[…] }
//   { action:'set-status', id, status }                      (ADMIN)
//        => { ok }
//   { action:'set-whatsapp', number }                        (ADMIN)
//        => { ok, whatsapp }
//
// SECURE BY DEFAULT: an action that needs EA Supabase answers
// { ok:false, error:'enrollment_not_configured' } and writes nothing when the
// EA env vars are absent. It never degrades to an insecure path.
// =============================================================================

import { requireAdminModule } from '../utils/admin-session.js';
import { getSetting, setSetting } from '../utils/site-settings.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const TABLE = 'course_enrollments';

const STATUSES        = ['pending', 'payment_review', 'approved', 'rejected'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Other'];
const WHATSAPP_KEY    = 'payment_whatsapp';   // site_settings row key (AI Supabase project)

/** Field caps — long enough for a real answer, short enough to bound abuse. */
const LIMITS = {
  full_name: 120, father_name: 120, contact: 160,
  background: 1500, goals: 1500, expectations: 1500, referral_source: 300,
  payment_sender_name: 120, payment_method: 20, bank_name: 120, transaction_id: 120,
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CORS });

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ ok: false, error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  // 'get-whatsapp' / 'set-whatsapp' only need the AI Supabase project (already
  // configured for other features) — never EA — so they're dispatched before
  // the EA credential gate below.
  try {
    if (body.action === 'get-whatsapp') return await getWhatsapp(env);
    if (body.action === 'set-whatsapp') return await adminSetWhatsapp(body, env, request);
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: String(e && e.message || e) }, 500);
  }

  const url = env.EA_SUPABASE_URL;
  const key = env.EA_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    // Secure by default: no credentials → no writes, no fallback.
    return json({
      ok: false, error: 'enrollment_not_configured',
      hint: 'Set EA_SUPABASE_URL and EA_SUPABASE_SERVICE_KEY in Cloudflare Pages, then run supabase/course-enrollments-schema.sql.',
    });
  }

  const sb = { url: String(url).replace(/\/+$/, ''), key };

  try {
    switch (body.action) {
      case 'submit':      return await submit(sb, body, request);
      case 'list':        return await adminList(sb, body, env, request);
      case 'set-status':  return await adminSetStatus(sb, body, env, request);
      default:            return json({ ok: false, error: 'unknown_action' }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: String(e && e.message || e) }, 500);
  }
}

// ── PUBLIC: store one enrolment ─────────────────────────────────────────────
async function submit(sb, body, request) {
  const e = body.enrollment || {};
  const clean = (v, cap) => String(v == null ? '' : v).trim().slice(0, cap);

  const paymentMethod = clean(e.payment_method, LIMITS.payment_method);
  const isBank = paymentMethod === 'Bank Transfer';
  const isCash = paymentMethod === 'Cash';

  const amount = Number(e.amount_paid);

  const row = {
    full_name:       clean(e.full_name, LIMITS.full_name),
    father_name:     clean(e.father_name, LIMITS.father_name),
    contact:         clean(e.contact, LIMITS.contact),
    background:      clean(e.background, LIMITS.background),
    goals:           clean(e.goals, LIMITS.goals),
    expectations:    clean(e.expectations, LIMITS.expectations),
    referral_source: clean(e.referral_source, LIMITS.referral_source),
    batch:           'Batch 30',
    amount_usd:      150,

    // ── structured payment details (replaces payment-proof upload) ──
    payment_sender_name: clean(e.payment_sender_name, LIMITS.payment_sender_name),
    payment_date:        clean(e.payment_date, 32),          // 'YYYY-MM-DD' from <input type=date>
    payment_method:      paymentMethod,
    bank_name:           isBank ? clean(e.bank_name, LIMITS.bank_name) : null,
    transaction_id:      clean(e.transaction_id, LIMITS.transaction_id) || null,
    amount_paid:         Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,

    status:       'pending',
    submitted_at: new Date().toISOString(),
  };

  if (!row.full_name || !row.father_name)               return json({ ok: false, error: 'missing_required' }, 400);
  if (!row.payment_sender_name)                          return json({ ok: false, error: 'missing_sender_name' }, 400);
  if (!row.payment_date)                                 return json({ ok: false, error: 'missing_payment_date' }, 400);
  if (!PAYMENT_METHODS.includes(row.payment_method))     return json({ ok: false, error: 'missing_payment_method' }, 400);
  if (isBank && !row.bank_name)                          return json({ ok: false, error: 'missing_bank_name' }, 400);
  if (!isCash && !row.transaction_id)                    return json({ ok: false, error: 'missing_transaction_id' }, 400);
  if (row.amount_paid == null || row.amount_paid <= 0)   return json({ ok: false, error: 'invalid_amount' }, 400);

  const r = await fetch(`${sb.url}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: sb.key, Authorization: `Bearer ${sb.key}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify([row]),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    return json({ ok: false, error: 'insert_failed', status: r.status,
      hint: 'Run the updated supabase/course-enrollments-schema.sql migration in the System A Supabase project.',
      detail: out && (out.message || out.hint) }, 200);
  }

  const saved = Array.isArray(out) ? out[0] : out;
  return json({ ok: true, id: saved && saved.id, reference: String(saved && saved.id || '').slice(0, 8).toUpperCase() });
}

// ── PUBLIC: the admin-configured payment-verification WhatsApp number ───────
// Read-only, no secret involved — safe to expose. Backed by the EXISTING
// generic site_settings table (AI Supabase project), not a new table.
async function getWhatsapp(env) {
  const saved = await getSetting(env, WHATSAPP_KEY, null);
  const number = saved && typeof saved.number === 'string' ? saved.number : null;
  return json({ ok: true, whatsapp: number });
}

/** Keeps only a leading '+' and digits; rejects anything that isn't a
 *  plausible phone number, so a malformed/unsafe value can never reach the
 *  stored setting (and therefore never reach the public wa.me link). */
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/[^\d+]/g, '');
  const m = digits.match(/^\+?(\d{8,15})$/);
  return m ? m[1] : null;
}

// ── ADMIN ───────────────────────────────────────────────────────────────────
async function requireAdmin(env, request) {
  // 'dashboard' is the ONLY registered module this feature has any business
  // authenticating against (see functions/utils/admin-store.js MODULES) — the
  // Executive Dashboard is where enrollments and the WhatsApp number are
  // managed, via the same admin session every other dashboard card uses.
  return requireAdminModule(env, request, ['dashboard'], { header: 'x-admin-key', value: env.AI_ADMIN_KEY });
}

async function adminSetWhatsapp(body, env, request) {
  if (!(await requireAdmin(env, request))) return json({ ok: false, error: 'unauthorized' }, 401);
  const normalized = normalizePhone(body.number);
  if (!normalized) return json({ ok: false, error: 'invalid_number' }, 400);
  const saved = await setSetting(env, WHATSAPP_KEY, { number: normalized, updatedAt: new Date().toISOString() });
  if (!saved) return json({ ok: false, error: 'save_failed' }, 200);
  return json({ ok: true, whatsapp: normalized });
}

async function adminList(sb, body, env, request) {
  if (!(await requireAdmin(env, request))) return json({ ok: false, error: 'unauthorized' }, 401);
  const limit  = Math.min(Math.max(parseInt(body.limit, 10) || 100, 1), 500);
  const status = STATUSES.includes(body.status) ? `&status=eq.${body.status}` : '';
  const r = await fetch(`${sb.url}/rest/v1/${TABLE}?select=*&order=submitted_at.desc&limit=${limit}${status}`, {
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` },
  });
  const rows = await r.json().catch(() => []);
  if (!r.ok) return json({ ok: false, error: 'list_failed', status: r.status }, 200);
  return json({ ok: true, rows });
}

async function adminSetStatus(sb, body, env, request) {
  if (!(await requireAdmin(env, request))) return json({ ok: false, error: 'unauthorized' }, 401);
  const id = String(body.id || '');
  if (!id || !STATUSES.includes(body.status)) return json({ ok: false, error: 'bad_request' }, 400);
  const r = await fetch(`${sb.url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: body.status, reviewed_at: new Date().toISOString() }),
  });
  if (!r.ok) return json({ ok: false, error: 'update_failed', status: r.status }, 200);
  return json({ ok: true });
}
