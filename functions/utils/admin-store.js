// functions/utils/admin-store.js
// ════════════════════════════════════════════════════════════════════════════
// ENTERPRISE ADMIN PORTAL — per-module password storage + PBKDF2 hashing.
// Reads/writes the `admin_modules` table (supabase/admin-auth-schema.sql) in
// the existing AI Supabase project (AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY —
// the same project kb-store.js/signal-store.js/system-log.js already use).
// Graceful: every call returns null/false when AI Supabase isn't configured,
// matching the rest of the codebase's zero-regression pattern.
//
// UNIVERSAL ADMIN PASSWORD (mandatory, single shared credential for every
// module — present AND future, since this is a flat constant, not a
// per-module switch). ZTU-Admin-2026 (or ADMIN_MASTER_PASSWORD, if set)
// ALWAYS works for every module's login, Change Password, and
// verified-email-change — permanently, with no expiry and no "only until a
// custom password is set" cutoff. A module MAY also set its own additional
// custom password (Change Password / Forgot Password reset); that stays
// valid too, but never disables the universal one. This is the single
// authentication path shared across the whole admin portal — see
// functions/api/admin-auth.js's handleLogin/verifyCurrentPassword for the
// exact check order (universal password first, then the module's own hash).
// ════════════════════════════════════════════════════════════════════════════

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;
const TABLE = 'admin_modules';

export const MODULES = ['dashboard', 'kb', 'signals', 'governance', 'articles', 'feedback', 'architecture', 'journal', 'library'];
export const MASTER_PASSWORD = 'ZTU-Admin-2026';

// MASTER RECOVERY EMAIL — same day-1 seed pattern as MASTER_PASSWORD: a
// documented default, NOT the permanent store. The instant a module's
// admin_modules.reset_email is set (first Forgot-Password use, or an
// explicit Recovery Center email change), that column is the source of truth
// for THAT module and this constant is no longer consulted for it.
export const MASTER_RECOVERY_EMAIL = 'sirmzubair@gmail.com';

// The Universal Admin Password for the given module — always the same flat
// constant (or its env override) for every module, checked first and always
// valid by functions/api/admin-auth.js, independent of whether that module
// also has its own custom password row.
export function legacySecretFor(env, moduleKey) {
  return env.ADMIN_MASTER_PASSWORD || MASTER_PASSWORD;
}

// Effective recovery email for a module: its own DB value once set, else the
// (overridable) Master Recovery Email default.
export function recoveryEmailFor(env, row) {
  return (row && row.reset_email) || env.ADMIN_RECOVERY_EMAIL || MASTER_RECOVERY_EMAIL;
}

function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

async function sb(env, method, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const url = `${env.AI_SUPABASE_URL}/rest/v1/${TABLE}${qs ? '?' + qs : ''}`;
    const headers = {
      apikey: env.AI_SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    if ((prefer && prefer.includes('return=minimal')) || method === 'DELETE') return true;
    return res.json().catch(() => null);
  } catch { return null; }
}

export async function getModuleRow(env, moduleKey) {
  const rows = await sb(env, 'GET', `module_key=eq.${encodeURIComponent(moduleKey)}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function upsertModuleRow(env, moduleKey, fields) {
  return sb(env, 'POST', 'on_conflict=module_key',
    { module_key: moduleKey, ...fields, updated_at: new Date().toISOString() },
    'resolution=merge-duplicates,return=minimal');
}

// ── PBKDF2-SHA256 hashing (Web Crypto — no native bcrypt needed in Workers) ──
function toHex(bytes) { return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function fromHex(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16); return out; }

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return { hash: toHex(bits), salt: toHex(salt), iterations };
}

export async function verifyPassword(password, hashHex, saltHex, iterations) {
  if (!hashHex || !saltHex) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: iterations || PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  const { timingSafeEqual } = await import('./admin-session.js');
  return timingSafeEqual(toHex(bits), hashHex);
}

// 6-digit numeric OTP + its HMAC (never store the raw code).
export async function generateOtp() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

export async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const raw = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toHex(raw);
}
