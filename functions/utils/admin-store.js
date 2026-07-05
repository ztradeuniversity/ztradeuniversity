// functions/utils/admin-store.js
// ════════════════════════════════════════════════════════════════════════════
// ENTERPRISE ADMIN PORTAL — per-module password storage + PBKDF2 hashing.
// Reads/writes the `admin_modules` table (supabase/admin-auth-schema.sql) in
// the existing AI Supabase project (AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY —
// the same project kb-store.js/signal-store.js/system-log.js already use).
// Graceful: every call returns null/false when AI Supabase isn't configured,
// matching the rest of the codebase's zero-regression pattern.
//
// DAY-1 MIGRATION — MASTER PASSWORD (mandatory, overrides all prior per-module
// legacy-secret behavior). Every protected module (present AND future — this
// is a flat constant, not a per-module switch, so a new module automatically
// inherits it) accepts ONE shared password, ZTU-Admin-2026, for its very
// first login ONLY. The instant that module's password is ever changed
// (Change Password or a completed Forgot-Password reset), its admin_modules
// row holds a hash of the NEW password and this constant stops working for
// THAT module — it is never consulted again once a row exists. Modules not
// yet migrated keep accepting it indefinitely. Overridable via
// ADMIN_MASTER_PASSWORD for deployments that want a different master value;
// defaults to the literal required password otherwise.
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

// Day-1 fallback secret — used ONLY while no admin_modules row exists yet for
// a given module. Once that module logs in (or changes/resets its password)
// successfully once, its own hashed row takes over and this is never
// consulted again for it.
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
