// functions/utils/admin-session.js
// ════════════════════════════════════════════════════════════════════════════
// ENTERPRISE ADMIN PORTAL — stateless HMAC-signed per-module session tokens.
// Same design as functions/utils/identity-session.js (signSession/verifySession)
// but signed with its OWN dedicated secret (ADMIN_SESSION_SECRET) so a leak of
// the Library OTP secret can never mint an admin session and vice versa.
//
// A token only ever grants ONE module (payload.module) — this is what makes
// cross-module unlock impossible: kb-admin.html's token has module:'kb' and
// will never verify for a page that requires module:'journal'.
// ════════════════════════════════════════════════════════════════════════════

const enc = new TextEncoder();
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h idle-independent expiry

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToB64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToStr(b64) {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  return decodeURIComponent(escape(atob(pad)));
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return toB64url(new Uint8Array(sig));
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretFor(env) {
  return env?.ADMIN_SESSION_SECRET || 'dev-fallback-MUST-set-ADMIN_SESSION_SECRET';
}

export async function signAdminSession(env, moduleKey) {
  const body = { module: moduleKey, exp: Date.now() + SESSION_TTL_MS };
  const head = strToB64url(JSON.stringify(body));
  const sig = await hmac(secretFor(env), head);
  return `${head}.${sig}`;
}

export async function verifyAdminSession(env, token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const head = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = await hmac(secretFor(env), head);
  if (!timingSafeEqual(sig, expect)) return null;
  let payload;
  try { payload = JSON.parse(b64urlToStr(head)); } catch { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

// Gate helper for admin API endpoints. Accepts either a valid admin session
// token scoped to `moduleKey` (the new, normal path) OR — only when supplied
// by the caller and not disabled — a legacy shared-key header, so nothing that
// currently calls these APIs directly (scripts, curl) silently breaks.
// `allowedModules` may be a single module key or an array (e.g. ai-kb-admin.js
// is called by BOTH the 'kb' and 'governance' front-ends).
export async function requireAdminModule(env, request, allowedModules, legacy) {
  const allowed = Array.isArray(allowedModules) ? allowedModules : [allowedModules];
  const authHeader = request.headers.get('Authorization') || '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const payload = await verifyAdminSession(env, m[1]);
    if (payload && allowed.includes(payload.module)) return true;
  }
  if (legacy && legacy.value && env.AI_ADMIN_KEY_FALLBACK !== 'off') {
    const hv = request.headers.get(legacy.header || 'x-admin-key');
    if (hv && timingSafeEqual(hv, legacy.value)) return true;
  }
  return false;
}
