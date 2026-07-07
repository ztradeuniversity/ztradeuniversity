// functions/api/admin-auth.js
// ════════════════════════════════════════════════════════════════════════════
// ENTERPRISE ADMIN PORTAL — one shared login/session/recovery endpoint for all
// 9 admin modules (dashboard/kb/signals/governance/articles/feedback/
// architecture/journal/library). Authentication is a single path: the
// Universal Admin Password (admin-store.js's legacySecretFor) always works for
// every module; a module may ALSO set its own custom password (admin_modules
// table) as an additional option, but that never disables the universal one.
// This endpoint never grants access to a module other than the one requested.
// See supabase/admin-auth-schema.sql, functions/utils/admin-store.js,
// functions/utils/admin-session.js.
//
// Journal and Library's own DATA APIs (journal-admin.js / library-storage.js)
// are untouched — they still check JOURNAL_ADMIN_PASSWORD / LIBRARY_ADMIN_PASSCODE
// directly. This endpoint only fronts the LOGIN/SESSION/CHANGE-PASSWORD/
// FORGOT-PASSWORD UX for every module's gate page, and (for the 4 KB-cluster
// backend files) issues the session token those APIs now also accept.
//
// POST { action:'login',              module, password }        => { ok, token } | { ok:false, reason }
// POST { action:'change-password',    module, current, next }    => { ok } | { ok:false, reason }
// POST { action:'forgot-password',    module }                   => { ok, email_mask } | { ok:false, reason }
// POST { action:'reset-password',     module, code, next }       => { ok } | { ok:false, reason }
// POST { action:'recovery-status',    module }                   => { ok, email_mask, verified, updated_at }
// POST { action:'request-email-change', module, password }       => { ok, email_mask } | { ok:false, reason }
//   (verifies the CURRENT admin password, then sends an OTP to the module's
//   CURRENT recovery email — proving control before allowing a change)
// POST { action:'verify-email-change', module, code, newEmail }  => { ok } | { ok:false, reason }
//
// Env vars used:
//   AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY   (existing — admin_modules table)
//   ADMIN_SESSION_SECRET                        (NEW — HMAC session signing secret)
//   RESEND_API_KEY / EMAIL_FROM                 (existing — same as library-auth.js)
//   ADMIN_RECOVERY_EMAIL                        (NEW — overrides the Master Recovery
//                                                 Email default; a module overrides
//                                                 both via its own reset_email row)
//   AI_ADMIN_KEY / JOURNAL_ADMIN_PASSWORD / LIBRARY_ADMIN_PASSCODE  (existing —
//                                                 day-1 fallback secrets only)
// ════════════════════════════════════════════════════════════════════════════

import { MODULES, legacySecretFor, recoveryEmailFor, getModuleRow, upsertModuleRow, hashPassword, verifyPassword, generateOtp, hmacHex } from '../utils/admin-store.js';
import { signAdminSession, timingSafeEqual } from '../utils/admin-session.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

const MAX_ATTEMPTS   = 3;
const LOCK_MS        = 60 * 1000;
const OTP_TTL_MS      = 10 * 60 * 1000;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const { action, module } = body || {};
  if (!MODULES.includes(module)) return json({ ok: false, reason: 'unknown_module' }, 400);

  if (action === 'login')                return json(await handleLogin(env, module, body.password || ''));
  if (action === 'change-password')      return json(await handleChangePassword(env, module, body.current || '', body.next || ''));
  if (action === 'forgot-password')      return json(await handleForgotPassword(env, module));
  if (action === 'reset-password')       return json(await handleResetPassword(env, module, body.code || '', body.next || ''));
  if (action === 'recovery-status')      return json(await handleRecoveryStatus(env, module));
  if (action === 'request-email-change') return json(await handleRequestEmailChange(env, module, body.password || ''));
  if (action === 'verify-email-change')  return json(await handleVerifyEmailChange(env, module, body.code || '', body.newEmail || ''));
  return json({ ok: false, reason: 'unknown_action' }, 400);
}

// Shared by change-password and request-email-change: verify the module's
// CURRENT admin password. The Universal Admin Password (see legacySecretFor)
// always counts as valid, in addition to the module's own custom password if
// it has one — so an admin who set a custom password but remembers the
// universal one can still use Change Password / verified-email-change instead
// of being forced through the Forgot-Password OTP flow.
async function verifyCurrentPassword(env, moduleKey, password) {
  if (!password) return { valid: false, row: null };
  const universal = legacySecretFor(env, moduleKey);
  if (universal && timingSafeEqual(password, universal)) {
    return { valid: true, row: await getModuleRow(env, moduleKey) };
  }
  const row = await getModuleRow(env, moduleKey);
  if (row) {
    const valid = await verifyPassword(password, row.password_hash, row.salt, row.iterations);
    return { valid, row };
  }
  return { valid: false, row: null };
}

// ── LOGIN ────────────────────────────────────────────────────────────────────
// UNIVERSAL ADMIN PASSWORD (see admin-store.js's legacySecretFor) is checked
// FIRST and always works, for every module, with no expiry — this replaces
// the previous "day-1 only" design, which silently stopped accepting the
// shared password for a module the instant that module's password was ever
// changed (Change Password, or a completed Forgot-Password reset). That was
// the exact cause of the Content Intelligence Center (module 'articles',
// carried over from the retired ai-articles.html, which had already been
// migrated off the day-1 password at some point) rejecting the same password
// every still-unmigrated module accepted. There is now exactly one universal
// credential that always works everywhere; a module's own custom password (if
// it has one) remains valid too, so nothing that currently works stops working.
async function handleLogin(env, moduleKey, password) {
  if (!password) return { ok: false, reason: 'invalid' };

  const universal = legacySecretFor(env, moduleKey);
  if (universal && timingSafeEqual(password, universal)) {
    return { ok: true, token: await signAdminSession(env, moduleKey) };
  }

  const row = await getModuleRow(env, moduleKey);
  if (row) {
    if (row.locked_until && Date.now() < row.locked_until) return { ok: false, reason: 'locked' };
    const valid = await verifyPassword(password, row.password_hash, row.salt, row.iterations);
    if (!valid) {
      const attempts = (row.failed_attempts || 0) + 1;
      const lockFields = attempts >= MAX_ATTEMPTS ? { failed_attempts: 0, locked_until: Date.now() + LOCK_MS } : { failed_attempts: attempts };
      await upsertModuleRow(env, moduleKey, lockFields);
      return { ok: false, reason: 'invalid' };
    }
    await upsertModuleRow(env, moduleKey, { failed_attempts: 0, locked_until: null });
    return { ok: true, token: await signAdminSession(env, moduleKey) };
  }

  // No row yet and the entered password wasn't the universal one — nothing
  // else can authenticate this module.
  return { ok: false, reason: 'invalid' };
}

// ── CHANGE PASSWORD ──────────────────────────────────────────────────────────
async function handleChangePassword(env, moduleKey, current, next) {
  if (!current || !next || next.length < 8) return { ok: false, reason: 'invalid' };
  const { valid } = await verifyCurrentPassword(env, moduleKey, current);
  if (!valid) return { ok: false, reason: 'wrong_current' };

  const { hash, salt, iterations } = await hashPassword(next);
  await upsertModuleRow(env, moduleKey, { password_hash: hash, salt, iterations, failed_attempts: 0, locked_until: null });
  return { ok: true };
}

// ── FORGOT PASSWORD (OTP via Resend — same pattern as library-auth.js) ──────
async function handleForgotPassword(env, moduleKey) {
  const row = await getModuleRow(env, moduleKey);
  const email = recoveryEmailFor(env, row); // module's own reset_email, else the Master Recovery Email

  const otp = await generateOtp();
  const otpHash = await hmacHex(secretOr(env), otp);
  await upsertModuleRow(env, moduleKey, {
    reset_otp_hash: otpHash,
    reset_otp_exp: Date.now() + OTP_TTL_MS,
    reset_email: email,
  });

  const sent = await sendOtpEmail(email, otp, moduleKey, env);
  if (!sent) return { ok: false, reason: 'email_failed' };
  return { ok: true, email_mask: maskEmail(email) };
}

// ── RESET PASSWORD (after OTP) ───────────────────────────────────────────────
async function handleResetPassword(env, moduleKey, code, next) {
  if (!code || !next || next.length < 8) return { ok: false, reason: 'invalid' };
  const row = await getModuleRow(env, moduleKey);
  if (!row || !row.reset_otp_hash || !row.reset_otp_exp) return { ok: false, reason: 'no_pending_reset' };
  if (Date.now() > row.reset_otp_exp) return { ok: false, reason: 'expired' };

  const codeHash = await hmacHex(secretOr(env), code);
  if (!timingSafeEqual(codeHash, row.reset_otp_hash)) return { ok: false, reason: 'invalid_code' };

  const { hash, salt, iterations } = await hashPassword(next);
  await upsertModuleRow(env, moduleKey, {
    password_hash: hash, salt, iterations,
    reset_otp_hash: null, reset_otp_exp: null,
    // A successfully-verified OTP proves this recovery email is real and reachable.
    reset_email_verified: true, reset_email_verified_at: new Date().toISOString(),
    failed_attempts: 0, locked_until: null,
  });
  return { ok: true };
}

// ── RECOVERY CENTER ──────────────────────────────────────────────────────────
async function handleRecoveryStatus(env, moduleKey) {
  const row = await getModuleRow(env, moduleKey);
  const email = recoveryEmailFor(env, row);
  return {
    ok: true,
    email_mask: maskEmail(email),
    verified: !!(row && row.reset_email_verified),
    updated_at: (row && row.reset_email_updated_at) || null,
    is_default: !(row && row.reset_email), // true while still on the Master Recovery Email
  };
}

// Step 1 of changing a module's recovery email: prove control via the
// CURRENT admin password, then OTP the CURRENT recovery email (not the new
// one) — so nobody can redirect recovery to an email they don't own without
// already holding both the password and the existing inbox.
async function handleRequestEmailChange(env, moduleKey, password) {
  const { valid, row } = await verifyCurrentPassword(env, moduleKey, password);
  if (!valid) return { ok: false, reason: 'wrong_password' };

  const currentEmail = recoveryEmailFor(env, row);
  const otp = await generateOtp();
  const otpHash = await hmacHex(secretOr(env), otp);
  await upsertModuleRow(env, moduleKey, { reset_otp_hash: otpHash, reset_otp_exp: Date.now() + OTP_TTL_MS });

  const sent = await sendOtpEmail(currentEmail, otp, moduleKey, env, 'email-change');
  if (!sent) return { ok: false, reason: 'email_failed' };
  return { ok: true, email_mask: maskEmail(currentEmail) };
}

// Step 2: verify that OTP, then save the NEW email. The new address itself
// is trusted admin input at this point (not yet OTP-proven) — its
// `reset_email_verified` starts false again until it's actually used (a
// forgot-password reset, or another email-change request, succeeds with it).
async function handleVerifyEmailChange(env, moduleKey, code, newEmail) {
  const email = String(newEmail || '').trim();
  if (!code || !email || !email.includes('@')) return { ok: false, reason: 'invalid' };
  const row = await getModuleRow(env, moduleKey);
  if (!row || !row.reset_otp_hash || !row.reset_otp_exp) return { ok: false, reason: 'no_pending_reset' };
  if (Date.now() > row.reset_otp_exp) return { ok: false, reason: 'expired' };

  const codeHash = await hmacHex(secretOr(env), code);
  if (!timingSafeEqual(codeHash, row.reset_otp_hash)) return { ok: false, reason: 'invalid_code' };

  await upsertModuleRow(env, moduleKey, {
    reset_email: email,
    reset_email_verified: false,
    reset_email_updated_at: new Date().toISOString(),
    reset_otp_hash: null, reset_otp_exp: null,
  });
  return { ok: true };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function secretOr(env) { return env.ADMIN_SESSION_SECRET || 'dev-fallback-MUST-set-ADMIN_SESSION_SECRET'; }

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***.***';
  const masked = local.length <= 4
    ? local.slice(0, 1) + '*'.repeat(Math.max(3, local.length - 1))
    : local.slice(0, 2) + '*'.repeat(local.length - 4) + local.slice(-2);
  return `${masked}@${domain}`;
}

async function sendOtpEmail(to, otp, moduleKey, env, purpose) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM || 'Z Trade University <noreply@ztradeuniversity.com>';
  const label = purpose === 'email-change' ? 'Recovery Email Change' : 'Admin Password Reset';
  if (!apiKey) {
    console.log(`[admin-auth] DEV MODE - ${label} OTP for "${moduleKey}": ${otp} (no RESEND_API_KEY set)`);
    return true;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${otp} — ZTU Admin ${label} (${moduleKey})`,
        html: buildEmailHtml(otp, moduleKey, label),
      }),
    });
    if (!res.ok) { console.error('[admin-auth] Resend error:', res.status, await res.text().catch(() => '')); return false; }
    return true;
  } catch (e) { console.error('[admin-auth] Email exception:', e?.message); return false; }
}

function buildEmailHtml(otp, moduleKey, label) {
  const safe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><body style="margin:0;padding:40px 20px;background:#0f0d09;font-family:Inter,Helvetica,Arial,sans-serif;color:#eee;">
  <div style="max-width:480px;margin:0 auto;background:#1a1610;border-radius:16px;padding:32px;border:1px solid #3a2c08;">
    <h2 style="color:#f2c744;margin:0 0 8px;">${safe(label || 'Admin Password Reset')}</h2>
    <p style="color:#c9c2b3;">Module: <strong>${safe(moduleKey)}</strong></p>
    <p style="font-size:32px;letter-spacing:6px;font-weight:900;color:#fff;margin:24px 0;">${safe(otp)}</p>
    <p style="color:#8a8272;font-size:13px;">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
  </div></body></html>`;
}
