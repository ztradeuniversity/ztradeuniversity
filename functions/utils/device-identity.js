// functions/utils/device-identity.js
// ════════════════════════════════════════════════════════════════════════════
// DEVICE IDENTITY ENGINE (Module 1) — ARCHITECTURE / FOUNDATION ONLY
//
// Persistent, anonymous trader identity. NO login, NO email, NO password.
//
// STRATEGY (already partly live on the client):
//   • The client generates a stable `device_id` once and stores it in
//     localStorage under the existing key `ztu_ai_uid`
//     (format: "u_" + base36(time) + base36(random)).
//   • It is already sent to /api/ai-chat as `userId` in the request body.
//   • The SAME device is recognised on every later visit (localStorage persists).
//   • FUTURE: this device_id becomes the primary key linking a visitor to
//     ai_user_profiles.device_id and all ai_chat_memory rows — no account needed.
//
// We do NOT rebuild the existing client generator; we MAP to it. This module is
// the server-side contract + validation helpers, ready for the future
// AI Supabase (ZTU Chatbot) integration. Nothing is connected here.
// ════════════════════════════════════════════════════════════════════════════

// The localStorage key the client already uses (single source of truth).
export const DEVICE_ID_CLIENT_KEY = 'ztu_ai_uid';

// Canonical device_id format documentation.
export const DEVICE_ID_STRATEGY = {
  generatedBy:  'client (ai-trade-assistant.html → getOrCreateUserId)',
  storedAt:     `localStorage["${DEVICE_ID_CLIENT_KEY}"]`,
  format:       'u_<base36 timestamp><base36 random>  (e.g. u_lz9k2af3qx)',
  transport:    'sent as `userId` in POST /api/ai-chat body (already wired)',
  login:        'none — anonymous & persistent per device',
  futureKey:    'ai_user_profiles.device_id  (1:1)',
  privacy:      'opaque random id; no PII, no email, no password ever',
};

// Validate/normalise an incoming device id (defensive — used at integration time).
export function isValidDeviceId(id) {
  return typeof id === 'string' && /^[a-z0-9_\-]{6,80}$/i.test(id);
}

export function normalizeDeviceId(id) {
  if (!isValidDeviceId(id)) return null;
  return id.trim().slice(0, 80);
}

// FUTURE: resolve (or lazily create) the profile row for a device.
// Stub — returns configured:false until AI_SUPABASE_* (ZTU Chatbot) is provided.
export async function resolveDeviceProfile(/* env, deviceId */) {
  return { configured: false, deviceId: null, profile: null, table: 'ai_user_profiles' };
}
