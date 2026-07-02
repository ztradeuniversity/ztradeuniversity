// functions/api/journal-access.js
// ════════════════════════════════════════════════════════════════════════════
// BIG PHASE 4A — UNIFIED ACCESS for the Trading Journal (Option A: custom JWT).
//
// This endpoint adds NO new OTP/eligibility/email logic. Exactly like
// /api/ai-access, it PROXIES the proven /api/library-auth gate over same-origin
// HTTP (the Library file is NEVER modified) — so the authoritative two-source
// rule (ib_stars_active → special_access) is reused verbatim. The ONLY thing
// this endpoint adds on top is: after a successful Library OTP verification it
// mints a Supabase-compatible JWT whose `sub` is a deterministic UUIDv5 of the
// account. The browser uses that JWT as its Supabase Authorization bearer, so
// the Journal's existing RLS (`auth.uid() = user_id`) keeps working UNCHANGED.
//
//   POST { action:'request', account }            → proxy request-otp
//   POST { action:'verify',  otpToken, code }     → proxy verify-otp → mint Supabase JWT
//   POST { action:'resend',  otpToken }           → proxy resend-otp
//   POST { action:'session', account, sessionStart } → re-validate (EA) → re-mint JWT
//   POST { action:'logout' }                      → stateless (client discards)
//
// Env vars:
//   (eligibility/email/OTP) — all consumed by /api/library-auth, unchanged.
//   JOURNAL_SUPABASE_JWT_SECRET  — JOURNAL project's JWT secret (Settings → API →
//                                  JWT Settings). Used ONLY to SIGN the minted
//                                  JWT. Never used for data access. Server-only.
//   JOURNAL_SUPABASE_URL (opt.)  — used only to set the JWT `iss` claim.
// ════════════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// Lockstep with the Library/AI session lifetime (15-day hard expiry).
const SESSION_TTL_MS = 15 * 24 * 60 * 60 * 1000;

// Fixed namespace for UUIDv5 derivation (any constant 16-byte UUID works; this
// one is dedicated to the ZTU Journal so account→uuid never collides with other
// namespaces). Changing it would re-key every identity, so it is frozen.
const ZTU_JOURNAL_NAMESPACE = 'b6c2f1a4-7e3d-45c8-9a2f-1d4e6f8a0c3b';

const enc = new TextEncoder();

// ── Same-origin proxy to the untouched Library auth endpoint (copied verbatim
//    from ai-access.js so both gates behave identically). ─────────────────────
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

// Mirror of library-auth.normAcct so the same account always yields the same
// uuid regardless of formatting (Excel float artifacts, commas, whitespace).
function normAcct(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  let s = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (/[eE]/.test(s) && /^[0-9.eE+\-]+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.round(n));
  }
  return s.replace(/\.0+$/, '');
}

// ── UUIDv5 (RFC 4122, SHA-1 namespaced) ──────────────────────────────────────
function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToUuid(b) {
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
async function uuidv5(name, namespace = ZTU_JOURNAL_NAMESPACE) {
  const nsBytes   = uuidToBytes(namespace);
  const nameBytes = enc.encode(name);
  const data = new Uint8Array(nsBytes.length + nameBytes.length);
  data.set(nsBytes, 0);
  data.set(nameBytes, nsBytes.length);
  const hashBuf = await crypto.subtle.digest('SHA-1', data);
  const h = new Uint8Array(hashBuf).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  return bytesToUuid(h);
}

// ── Supabase-compatible JWT (HS256) ──────────────────────────────────────────
function b64url(bytesOrStr) {
  let bin;
  if (typeof bytesOrStr === 'string') {
    bin = unescape(encodeURIComponent(bytesOrStr));
  } else {
    bin = '';
    for (let i = 0; i < bytesOrStr.length; i++) bin += String.fromCharCode(bytesOrStr[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmacSha256(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return new Uint8Array(sig);
}
async function mintSupabaseJwt(env, sub, account, sessionStart) {
  const secret = env.JOURNAL_SUPABASE_JWT_SECRET;
  if (!secret) return null;
  const now   = Math.floor(Date.now() / 1000);
  const start = (typeof sessionStart === 'number' && sessionStart > 0) ? Math.floor(sessionStart / 1000) : now;
  const exp   = start + Math.floor(SESSION_TTL_MS / 1000);
  if (exp <= now) return null; // session already past its 15-day hard expiry

  const header  = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub,
    role: 'authenticated',
    aud:  'authenticated',
    iat:  now,
    exp,
    email: `${normAcct(account)}@journal.ztu`, // synthetic claim; not a real inbox
    app_metadata:  { provider: 'ztu_unified', access_via: 'library-auth' },
    user_metadata: { account_number: String(account) },
  };
  if (env.JOURNAL_SUPABASE_URL) payload.iss = `${env.JOURNAL_SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;

  const head = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig  = b64url(await hmacSha256(secret, head));
  return { jwt: `${head}.${sig}`, exp_ms: exp * 1000 };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body?.action;
  const origin = new URL(request.url).origin;

  // ── REQUEST OTP (account number OR special code — Library resolves both) ─────
  if (action === 'request') {
    const account = String(body?.account || '').trim().slice(0, 64);
    if (!account) return json({ ok: false, reason: 'invalid_account', message: 'Enter your trading account number.' }, 400);

    const res = await lib(origin, { action: 'request-otp', account });
    if (res.ok) return json({ ok: true, otpToken: res.token, email_mask: res.email_mask });

    const out = { ok: false, reason: res.reason };
    if (res.reason === 'not_found')          out.message = 'This account was not found under our IB or special access list.';
    else if (res.reason === 'inactive')      out.message = 'This account is not currently active. Trade under our IB to reactivate.';
    else if (res.reason === 'email_missing') out.message = 'No verification email is on file for this account. Please contact support.';
    else if (res.reason === 'email_failed')  out.message = 'We could not send the code right now. Please try again shortly.';
    else out.message = 'We could not start verification. Please check your account number and try again.';
    return json(out);
  }

  // ── VERIFY OTP → mint Supabase JWT (the unified grant) ───────────────────────
  if (action === 'verify') {
    const otpToken = String(body?.otpToken || '');
    const code     = String(body?.code || '').trim().slice(0, 8);
    if (!otpToken || !code) return json({ ok: false, reason: 'invalid_input', message: 'Enter the 6-digit code.' }, 400);

    const v = await lib(origin, { action: 'verify-otp', token: otpToken, code });
    if (!v.ok) {
      const msg = v.reason === 'wrong_code' ? 'Incorrect code — please try again.'
        : v.reason === 'expired'     ? 'Your code expired. Request a new one.'
        : v.reason === 'no_attempts' ? 'Too many attempts. Request a new code.'
        : 'Incorrect or expired code.';
      return json({ ok: false, reason: v.reason, att: v.att, otpToken: v.token, message: msg });
    }

    const uuid   = await uuidv5(normAcct(v.account) || String(v.account));
    const minted = await mintSupabaseJwt(env, uuid, v.account);
    if (!minted) return json({ ok: false, reason: 'jwt_unavailable', message: 'Access is being set up — please try again later.' });

    return json({
      ok: true,
      account: v.account,
      uuid,
      jwt: minted.jwt,
      expiresAt: minted.exp_ms,
      grants: { journal_access: true, library_access: true, ai_unlimited_access: true },
      tier: 'unlimited',
      message: '✅ Verified! Your ZTU unified access is now unlocked.',
    });
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

  // ── SESSION re-validation → re-mint JWT (preserves 15-day hard expiry) ────────
  //    Called on Journal page load when a stored session exists. Re-checks the
  //    SAME EA source via Library verify-session so a revoked account loses
  //    access without needing a new OTP, exactly like library.html/ai-access.
  if (action === 'session') {
    const account = String(body?.account || '').trim().slice(0, 64);
    const ss      = Number(body?.sessionStart) || 0;
    if (!account) return json({ valid: false });
    const vs = await lib(origin, { action: 'verify-session', account });
    if (!(vs.ok && vs.valid)) return json({ valid: false });
    const uuid   = await uuidv5(normAcct(account) || account);
    const minted = await mintSupabaseJwt(env, uuid, account, ss);
    if (!minted) return json({ valid: false });
    return json({
      valid: true, account, uuid, jwt: minted.jwt, expiresAt: minted.exp_ms,
      grants: { journal_access: true, library_access: true, ai_unlimited_access: true }, tier: 'unlimited',
    });
  }

  if (action === 'logout') return json({ ok: true });

  return json({ error: `Unknown action: ${action}` }, 400);
}
