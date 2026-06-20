// functions/api/ai-access.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 9 — AI ACCESS (thin wrapper over the EXISTING Library OTP system).
//
// This endpoint adds NO new OTP/eligibility/email logic. It PROXIES the proven
// /api/library-auth (request-otp / verify-otp / resend-otp / verify-session)
// over same-origin HTTP — the Library file is NEVER modified — and, only after
// a successful Library OTP verification, mints a short-lived AI gating token
// (HMAC with the SAME LIBRARY_OTP_SECRET). ai-chat reads that token for tier.
//
//   POST { action:'request', account, lang }      → proxy request-otp (+localized state msg)
//   POST { action:'verify',  otpToken, code, userId, lang } → proxy verify-otp → mint AI token
//   POST { action:'resend',  otpToken }           → proxy resend-otp
//   POST { action:'session', token, lang }        → validate + periodic EA re-check
//   POST { action:'logout' }                      → stateless (client discards)
//
// Eligibility source & email resolution: 100% the Library/EA system. AI Supabase
// is touched only to (optionally) stamp the device profile for memory linking.
// ════════════════════════════════════════════════════════════════════════════

import { signSession, verifySession } from '../utils/identity-session.js';
import { isConfigured, upsertProfile } from '../utils/ai-supabase.js';
import { joinUrl, accountNotFoundMsg, inactiveMsg, emailMissingMsg, revalidationRemovedMsg } from '../utils/access-copy.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// SINGLE SHARED EXPIRY: matches library.html SESSION_STORE_KEY ('ztu_lib_v3'),
// which is a 15-day hard expiry from login. AI and Library therefore expire
// together — no independent AI session lifetime.
const SESSION_TTL_MS = 15 * 24 * 60 * 60 * 1000;  // 15-day token life (== Library)
const ELIG_TTL_MS    = 24 * 60 * 60 * 1000;        // re-validate eligibility daily

// Same-origin proxy to the untouched Library auth endpoint.
async function lib(origin, payload) {
  try {
    const r = await fetch(`${origin}/api/library-auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(12000),
    });
    return await r.json().catch(() => ({ ok: false, reason: 'proxy_parse' }));
  } catch {
    return { ok: false, reason: 'proxy_error' };
  }
}

// sessionStart = the moment the SHARED session began (library.html createdAt).
// The token expires exactly when the Library session does, so the two stay in
// lockstep. Omitted ⇒ a brand-new session starting now (fresh OTP verification).
async function mintToken(env, account, sessionStart) {
  const now   = Date.now();
  const start = (typeof sessionStart === 'number' && sessionStart > 0) ? sessionStart : now;
  return signSession(env, { acct: String(account), tier: 'unlimited', exp: start + SESSION_TTL_MS, elig_exp: now + ELIG_TTL_MS, ss: start });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body?.action;
  const lang   = typeof body?.lang === 'string' ? body.lang : 'en';
  const origin = new URL(request.url).origin;

  // ── REQUEST OTP (Account Number only — email resolved by Library/EA) ─────────
  if (action === 'request') {
    const account = String(body?.account || '').trim().slice(0, 64);
    if (!account) return json({ ok: false, reason: 'invalid_account', message: 'Enter your trading account number.' }, 400);

    const res = await lib(origin, { action: 'request-otp', account });
    if (res.ok) return json({ ok: true, otpToken: res.token, email_mask: res.email_mask });

    // Map Library eligibility reasons → localized account-state messages.
    const out = { ok: false, reason: res.reason, joinUrl: joinUrl(env) };
    if (res.reason === 'not_found')      out.message = accountNotFoundMsg(lang);   // STATE A → Join-IB
    else if (res.reason === 'inactive')  out.message = inactiveMsg(lang);          // STATE C
    else if (res.reason === 'email_missing') out.message = emailMissingMsg(lang);  // STATE B
    else if (res.reason === 'email_failed')  out.message = 'We could not send the code right now. Please try again shortly.';
    else out.message = 'We could not start verification. Please check your account number and try again.';
    return json(out);
  }

  // ── VERIFY OTP → mint AI gating token (STATE D) ──────────────────────────────
  if (action === 'verify') {
    const otpToken = String(body?.otpToken || '');
    const code     = String(body?.code || '').trim().slice(0, 8);
    const userId   = String(body?.userId || '').trim().slice(0, 80);
    if (!otpToken || !code) return json({ ok: false, reason: 'invalid_input', message: 'Enter the 6-digit code.' }, 400);

    const v = await lib(origin, { action: 'verify-otp', token: otpToken, code });
    if (!v.ok) {
      const msg = v.reason === 'wrong_code' ? 'Incorrect code — please try again.'
        : v.reason === 'expired'     ? 'Your code expired. Request a new one.'
        : v.reason === 'no_attempts' ? 'Too many attempts. Request a new code.'
        : 'Incorrect or expired code.';
      // pass through updated OTP token (Library decrements attempts) so the client can retry
      return json({ ok: false, reason: v.reason, att: v.att, otpToken: v.token, message: msg });
    }

    const token = await mintToken(env, v.account);
    if (!token) return json({ ok: false, reason: 'secret_missing', message: 'Access is being set up — please try again later.' });

    // Optional: stamp the device profile so AI memory can link to this identity.
    if (userId && isConfigured(env)) {
      await upsertProfile(env, userId, { access_tier: 'unlimited', account_number: String(v.account), is_verified: true, identity_verified_at: new Date().toISOString() }).catch(() => {});
    }
    return json({ ok: true, token, account: v.account, message: '✅ Verified! Unlimited AI access is now unlocked.' });
  }

  // ── RESEND OTP (proxy; Library enforces the 60s cooldown) ────────────────────
  if (action === 'resend') {
    const otpToken = String(body?.otpToken || '');
    if (!otpToken) return json({ ok: false, reason: 'invalid_token' }, 400);
    const res = await lib(origin, { action: 'resend-otp', token: otpToken });
    if (res.ok) return json({ ok: true, otpToken: res.token, email_mask: res.email_mask });
    return json({ ok: false, reason: res.reason, wait_ms: res.wait_ms,
      message: res.reason === 'cooldown' ? 'Please wait a moment before requesting another code.' : 'Could not resend the code. Please try again.' });
  }

  // ── SESSION (validate + periodic EA re-validation via Library) ───────────────
  if (action === 'session') {
    const p = await verifySession(env, String(body?.token || ''));
    if (!p) return json({ valid: false, tier: 'visitor', joinUrl: joinUrl(env) });

    if (p.elig_exp && Date.now() <= p.elig_exp) {
      return json({ valid: true, tier: p.tier || 'unlimited', joinUrl: joinUrl(env) });
    }
    // Eligibility window lapsed → re-check the SAME EA source via Library.
    const vs = await lib(origin, { action: 'verify-session', account: p.acct });
    if (vs.ok && vs.valid) {
      // Preserve the ORIGINAL session start (p.ss) so re-validation refreshes the
      // eligibility window WITHOUT extending the shared 15-day hard expiry.
      const fresh = await mintToken(env, p.acct, p.ss);
      return json({ valid: true, tier: 'unlimited', token: fresh, joinUrl: joinUrl(env) });
    }
    return json({ valid: false, tier: 'visitor', removed: true, message: revalidationRemovedMsg(lang), joinUrl: joinUrl(env) });
  }

  // ── BRIDGE — LIBRARY → AI single-session sync (NO new OTP, NO new pipeline) ──
  // The AI page calls this when it has a valid shared Library session (ztu_lib_v3)
  // but no AI token yet. It re-validates the account against the SAME EA source via
  // Library verify-session — identical trust to library.html's own hydrateSession —
  // and, only if still eligible, mints the standard AI token tied to the SAME
  // session start so both surfaces expire together. No password/OTP is bypassed:
  // the Library session it mirrors was itself established by an OTP verification.
  if (action === 'bridge') {
    const account = String(body?.account || '').trim().slice(0, 64);
    const ss      = Number(body?.sessionStart) || 0;   // library session createdAt
    if (!account) return json({ valid: false, tier: 'visitor' });
    const vs = await lib(origin, { action: 'verify-session', account });
    if (!(vs.ok && vs.valid)) return json({ valid: false, tier: 'visitor', joinUrl: joinUrl(env) });
    const token = await mintToken(env, account, ss);
    if (!token) return json({ valid: false, tier: 'visitor' });
    return json({ valid: true, tier: 'unlimited', token, account });
  }

  if (action === 'logout') return json({ ok: true });

  return json({ error: `Unknown action: ${action}` }, 400);
}
