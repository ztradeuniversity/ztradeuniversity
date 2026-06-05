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
