// functions/utils/identity-session.js
// ════════════════════════════════════════════════════════════════════════════
// AI GATING TOKEN (Phase 9) — stateless, HMAC-signed access token.
//
// Minted by /api/ai-access ONLY after the proven Library OTP flow
// (/api/library-auth verify-otp) succeeds. Carries no PII — { acct, tier, exp,
// elig_exp }. Signed with LIBRARY_OTP_SECRET (the SAME secret the Library OTP
// system already uses) so we add NO new secret and the server trusts the tier
// without a DB hit per chat. `elig_exp` forces periodic EA re-validation.
// ════════════════════════════════════════════════════════════════════════════

const enc = new TextEncoder();

function b64urlFromBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromStr(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strFromB64url(b64) {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  return decodeURIComponent(escape(atob(pad)));
}

async function hmacB64(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return b64urlFromBytes(new Uint8Array(sig));
}

function timingSafeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(env, payload) {
  if (!env?.LIBRARY_OTP_SECRET) return null;
  const body = { ...payload, iat: Date.now() };
  const head = b64urlFromStr(JSON.stringify(body));
  const sig  = await hmacB64(env.LIBRARY_OTP_SECRET, head);
  return `${head}.${sig}`;
}

export async function verifySession(env, token) {
  if (!token || !env?.LIBRARY_OTP_SECRET || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const head = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  const expect = await hmacB64(env.LIBRARY_OTP_SECRET, head);
  if (!timingSafeEq(sig, expect)) return null;
  let payload;
  try { payload = JSON.parse(strFromB64url(head)); } catch { return null; }
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

// Resolve the access tier from a token. `stale=true` means the eligibility
// window lapsed → caller should re-validate against EA (and downgrade if gone).
export async function resolveTier(env, token) {
  const p = await verifySession(env, token);
  if (!p) return { tier: 'visitor', identity: null, stale: false };
  const stale = !!(p.elig_exp && Date.now() > p.elig_exp);
  return { tier: stale ? 'visitor' : (p.tier || 'visitor'), identity: p, stale };
}

// ════════════════════════════════════════════════════════════════════════════
// GUEST MESSAGE COUNTER (stateless, signed cookie) — NO database, NO AI profile.
// The count of free messages a not-yet-verified visitor has used is held entirely
// in an HMAC-signed cookie (same LIBRARY_OTP_SECRET, no new secret, no second
// membership system). The signature makes the count tamper-evident: editing the
// cookie invalidates it and resets the visitor to 0 — never grants extra messages.
// Verified users never reach this path (their signed identity token = unlimited).
// ════════════════════════════════════════════════════════════════════════════
const GUEST_COOKIE   = 'ztu_ai_guest';
const GUEST_MAX_AGE  = 60 * 60 * 24 * 30;   // 30 days

// Read the current guest count from the request's Cookie header. Returns 0 when
// absent, malformed, tampered (bad signature), or expired — i.e. fail-safe to a
// fresh visitor, never to "already over the limit" and never to "unlimited".
export async function readGuestCount(env, request) {
  try {
    const raw = request.headers.get('Cookie') || '';
    const m = raw.match(/(?:^|;\s*)ztu_ai_guest=([^;]+)/);
    if (!m) return 0;
    const payload = await verifySession(env, decodeURIComponent(m[1]));
    if (!payload || typeof payload.gc !== 'number' || payload.gc < 0) return 0;
    return Math.floor(payload.gc);
  } catch { return 0; }
}

// Build a Set-Cookie header string carrying the new signed guest count.
// Returns null if signing is unavailable (no secret) — caller then fails open.
export async function buildGuestCookie(env, count) {
  const token = await signSession(env, { gc: Math.max(0, Math.floor(count)), exp: Date.now() + GUEST_MAX_AGE * 1000 });
  if (!token) return null;
  return `${GUEST_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${GUEST_MAX_AGE}; SameSite=Lax; Secure; HttpOnly`;
}
