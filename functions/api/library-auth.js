// functions/api/library-auth.js
// =============================================================================
// POST /api/library-auth
//
// Secure OTP-based access gate for the Z Trade University Library.
// Queries EA System A (ib_stars_active) READ-ONLY for eligibility checks.
// Issues stateless HMAC-SHA256-signed OTP tokens. Sends OTP via Resend API.
// EA credentials and OTP secrets are NEVER sent to or readable by the client.
//
// Required Cloudflare Pages environment variables:
//   EA_SUPABASE_URL          - EA Supabase project URL (System A, read-only)
//   EA_SUPABASE_SERVICE_KEY  - Service role key (server-side only; bypasses RLS)
//   EA_IB_STARS_TABLE        - IB active members table (default: ib_stars_active)
//                              Required columns: account_number, email, ib_star_status
//                              (active when ib_star_status === 'active', case-insensitive)
//   LIBRARY_OTP_SECRET       - >= 32 char random secret for HMAC token signing
//   RESEND_API_KEY           - Resend.com API key for email delivery
//   EMAIL_FROM               - Sender address e.g. noreply@ztradeuniversity.com
//
// Actions (POST with JSON body):
//   request-otp    { account }        => { ok, token, email_mask }
//                                        { ok:false, reason: 'not_found'|'inactive'|'email_failed' }
//   verify-otp     { token, code }    => { ok, account } | { ok:false, reason, att?, token? }
//   resend-otp     { token }          => { ok, token, email_mask }
//   verify-session { account }        => { ok, valid }
//
// ib_stars_active access logic:
//   account NOT in table                       => reason: 'not_found'  (never an IB member)
//   account in table, ib_star_status != active => reason: 'inactive'   (paused; auto-restores when active)
//   account in table, ib_star_status == active => proceed with OTP to email
//
// Token anatomy (stateless - no DB required for OTP state):
//   base64url(JSON.stringify(payload)) + '.' + HMAC-SHA256(payload_b64, secret)
//   payload = { acct, oh: HMAC(secret,otp), exp, att, rbf, em }
//   oh  = HMAC of OTP (irreversible; OTP only travels via email)
//   exp = expiry Unix-ms
//   att = attempts remaining (decremented server-side on each wrong guess)
//   rbf = resend-blocked-from Unix-ms (60s cooldown enforced in token)
//   em  = masked email for UI display only
// =============================================================================

const OTP_TTL_MS      = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN = 60 * 1000;       // 60 seconds between resends
const MAX_ATTEMPTS    = 3;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequest(ctx) {
  const { request, env } = ctx;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return jsonErr('Method not allowed', 405);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonErr('Invalid JSON body', 400); }

  const { action } = body || {};

  try {
    switch (action) {
      case 'request-otp':    return await handleRequestOtp(body, env);
      case 'verify-otp':     return await handleVerifyOtp(body, env);
      case 'resend-otp':     return await handleResendOtp(body, env);
      case 'verify-session': return await handleVerifySession(body, env);
      default:               return jsonErr('Unknown action', 400);
    }
  } catch (e) {
    console.error('[library-auth] Unhandled error:', e?.message || e);
    return jsonErr('Internal server error', 500);
  }
}

// =============================================================================
// ACTION HANDLERS
// =============================================================================

async function handleRequestOtp({ account }, env) {
  if (!account || typeof account !== 'string' || account.trim().length < 2) {
    return jsonOk({ ok: false, reason: 'invalid_account' });
  }
  const acct = account.trim();

  // 1. Look up account in ib_stars_active (System A, read-only)
  const lookup = await lookupIbStars(acct, env);

  if (!lookup.found) {
    return jsonOk({ ok: false, reason: 'not_found' });
  }
  if (!lookup.active) {
    return jsonOk({ ok: false, reason: 'inactive' });
  }

  // 2. Account is active - generate OTP and sign token
  const otp   = generateOtp();
  const token = await signToken(acct, otp, lookup.email, env);

  // 3. Send OTP to registered email (email address never leaves the server)
  const sent = await sendOtpEmail(lookup.email, otp, acct, env);
  if (!sent) {
    return jsonOk({ ok: false, reason: 'email_failed' });
  }

  return jsonOk({ ok: true, token, email_mask: maskEmail(lookup.email) });
}

async function handleVerifyOtp({ token, code }, env) {
  if (!token || !code) return jsonErr('Missing token or code', 400);

  const codeStr = String(code).trim();
  if (!/^\d{6}$/.test(codeStr)) {
    return jsonOk({ ok: false, reason: 'invalid_format' });
  }

  const payload = await verifyAndDecodeToken(token, env);
  if (!payload)                  return jsonOk({ ok: false, reason: 'invalid_token' });
  if (Date.now() > payload.exp)  return jsonOk({ ok: false, reason: 'expired' });
  if (payload.att <= 0)          return jsonOk({ ok: false, reason: 'no_attempts' });

  // Compare submitted code against the HMAC stored in token (OTP itself never stored client-side)
  const codeHmac = await hmacHex(env.LIBRARY_OTP_SECRET, codeStr);
  if (!timingSafeEqual(codeHmac, payload.oh)) {
    const newAtt   = payload.att - 1;
    const newToken = await signPayload({ ...payload, att: newAtt }, env);
    return jsonOk({ ok: false, reason: 'wrong_code', att: newAtt, token: newToken });
  }

  return jsonOk({ ok: true, account: payload.acct });
}

async function handleResendOtp({ token }, env) {
  if (!token) return jsonErr('Missing token', 400);

  const payload = await verifyAndDecodeToken(token, env);
  if (!payload)                  return jsonOk({ ok: false, reason: 'invalid_token' });
  if (Date.now() > payload.exp)  return jsonOk({ ok: false, reason: 'expired' });

  // Enforce server-side resend cooldown
  if (Date.now() < payload.rbf) {
    return jsonOk({ ok: false, reason: 'cooldown', wait_ms: payload.rbf - Date.now() });
  }

  // Re-verify account is still active (could have been deactivated)
  const lookup = await lookupIbStars(payload.acct, env);
  if (!lookup.found)   return jsonOk({ ok: false, reason: 'not_found' });
  if (!lookup.active)  return jsonOk({ ok: false, reason: 'inactive' });

  const otp      = generateOtp();
  const newToken = await signToken(payload.acct, otp, lookup.email, env);

  const sent = await sendOtpEmail(lookup.email, otp, payload.acct, env);
  if (!sent) return jsonOk({ ok: false, reason: 'email_failed' });

  return jsonOk({ ok: true, token: newToken, email_mask: maskEmail(lookup.email) });
}

// Called on every library page load - re-checks EA DB so revoked/inactive
// accounts lose access immediately without requiring a new OTP.
async function handleVerifySession({ account }, env) {
  if (!account || typeof account !== 'string' || account.trim().length < 1) {
    return jsonOk({ ok: true, valid: false });
  }
  const lookup = await lookupIbStars(account.trim(), env);
  // Session is only valid if the account is BOTH found AND still active
  return jsonOk({ ok: true, valid: lookup.found && lookup.active });
}

// =============================================================================
// IB STARS LOOKUP  (System A - ib_stars_active, read-only)
// =============================================================================
// Returns: { found: false }
//          { found: true, active: false }
//          { found: true, active: true, email: string }
async function lookupIbStars(acct, env) {
  const supabaseUrl = env.EA_SUPABASE_URL;
  const serviceKey  = env.EA_SUPABASE_SERVICE_KEY;
  const table       = env.EA_IB_STARS_TABLE || 'ib_stars_active';

  // DEMO MODE - env vars not yet configured
  if (!supabaseUrl || !serviceKey) {
    console.warn('[library-auth] EA env vars not set - running in DEMO MODE');
    // In demo mode any non-empty account number is treated as active
    return { found: true, active: true, email: `demo.${acct.replace(/\s/g, '')}@demo.ztu.com` };
  }

  const acctEncoded = encodeURIComponent(acct);
  // Live ib_stars_active schema: account_number, email, ib_star_status
  const qs = `account_number=eq.${acctEncoded}&select=email,ib_star_status&limit=1`;

  let res;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/${table}?${qs}`, {
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Accept':        'application/json'
      }
    });
  } catch (e) {
    console.error('[library-auth] EA DB fetch exception:', e?.message);
    return { found: false };
  }

  if (!res.ok) {
    console.error('[library-auth] EA DB query failed:', res.status, await res.text().catch(() => ''));
    return { found: false };
  }

  let rows;
  try { rows = await res.json(); }
  catch { return { found: false }; }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { found: false };
  }

  const row = rows[0];
  // Active when ib_star_status === 'active' (case-insensitive)
  const status   = typeof row.ib_star_status === 'string' ? row.ib_star_status.trim().toLowerCase() : '';
  const isActive = status === 'active';

  if (!isActive) {
    return { found: true, active: false };
  }

  if (!row.email) {
    console.warn('[library-auth] Account found but email is null for:', acct);
    return { found: true, active: false }; // Can't send OTP without email
  }

  return { found: true, active: true, email: row.email };
}

// =============================================================================
// OTP GENERATION
// =============================================================================
function generateOtp() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

// =============================================================================
// TOKEN SIGNING  (stateless HMAC-SHA256)
// =============================================================================
async function signToken(acct, otp, email, env) {
  const now = Date.now();
  const payload = {
    acct,
    oh:  await hmacHex(env.LIBRARY_OTP_SECRET, otp),
    exp: now + OTP_TTL_MS,
    att: MAX_ATTEMPTS,
    rbf: now + RESEND_COOLDOWN,
    em:  maskEmail(email)
  };
  return signPayload(payload, env);
}

async function signPayload(payload, env) {
  const data = b64url(JSON.stringify(payload));
  const sig  = await hmacHex(env.LIBRARY_OTP_SECRET, data);
  return `${data}.${sig}`;
}

async function verifyAndDecodeToken(token, env) {
  if (!token || typeof token !== 'string') return null;
  const dot  = token.lastIndexOf('.');
  if (dot === -1) return null;
  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  const expected = await hmacHex(env.LIBRARY_OTP_SECRET, data);
  if (!timingSafeEqual(expected, sig)) return null;
  try {
    const json = decodeURIComponent(escape(atob(
      data.replace(/-/g, '+').replace(/_/g, '/')
    )));
    return JSON.parse(json);
  } catch { return null; }
}

// =============================================================================
// CRYPTO HELPERS
// =============================================================================
async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'dev-fallback-MUST-set-LIBRARY_OTP_SECRET'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const raw = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(raw))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time comparison - prevents timing attacks
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64url(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16)))
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// =============================================================================
// EMAIL MASKING
// =============================================================================
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***.***';
  /* Show first 4 chars so user can identify which inbox to check,
     e.g. zuba****@gmail.com  (spec: "zuba****@gmail.com")         */
  const visible = local.slice(0, Math.min(4, local.length));
  const stars   = '*'.repeat(Math.max(3, local.length - visible.length));
  return `${visible}${stars}@${domain}`;
}

// =============================================================================
// EMAIL DELIVERY  (Resend API)
// =============================================================================
async function sendOtpEmail(to, otp, account, env) {
  const apiKey = env.RESEND_API_KEY;
  const from   = env.EMAIL_FROM || 'Z Trade University <noreply@ztradeuniversity.com>';

  if (!apiKey) {
    console.log(`[library-auth] DEV MODE - OTP for "${account}": ${otp} (no RESEND_API_KEY set)`);
    return true;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from,
        to:      [to],
        subject: `${otp} - Your Z Trade University Library Code`,
        html:    buildEmailHtml(otp, account)
      })
    });

    if (!res.ok) {
      console.error('[library-auth] Resend error:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[library-auth] Email exception:', e?.message);
    return false;
  }
}

// =============================================================================
// EMAIL TEMPLATE
// =============================================================================
function buildEmailHtml(otp, account) {
  const safe = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#eef0f8;font-family:Inter,Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#060a14,#0b1120 40%,#1a0b44);border-radius:20px 20px 0 0;padding:32px 36px;text-align:center;">
    <div style="font-size:10px;letter-spacing:3.5px;text-transform:uppercase;color:rgba(172,212,0,0.75);margin-bottom:9px;font-weight:800;">Z TRADE UNIVERSITY</div>
    <div style="font-size:21px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Library Access Code</div>
  </div>
  <div style="background:#fff;padding:36px;border-left:1px solid rgba(0,0,0,0.07);border-right:1px solid rgba(0,0,0,0.07);">
    <p style="font-size:15px;color:#5a6580;margin:0 0 24px;line-height:1.65;">Hello,<br>Your one-time code for the <strong style="color:#0d1526;">Z Trade University Library</strong> is below. Expires in <strong>10 minutes</strong>.</p>
    <div style="background:linear-gradient(135deg,#f5f6fc,#eef0f8);border:2px solid rgba(91,26,200,0.12);border-radius:16px;padding:28px 20px;text-align:center;margin-bottom:26px;">
      <div style="font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;color:#9aa3b5;margin-bottom:12px;font-weight:800;">Verification Code</div>
      <div style="font-size:46px;font-weight:900;letter-spacing:14px;color:#0d1526;font-family:'Courier New',monospace;padding-left:14px;">${otp}</div>
    </div>
    <p style="font-size:13px;color:#5a6580;margin:0 0 8px;">Account: <strong style="color:#0d1526;">${safe(account)}</strong></p>
    <p style="font-size:12px;color:#9aa3b5;line-height:1.65;margin:0;">Didn't request this? You can safely ignore this email.</p>
  </div>
  <div style="background:#f8f9fc;border:1px solid rgba(0,0,0,0.07);border-top:none;border-radius:0 0 20px 20px;padding:20px 36px;text-align:center;">
    <p style="font-size:11px;color:#9aa3b5;margin:0;line-height:1.7;">&copy; 2024 Z Trade University &mdash; Trading Education<br>Automated message. Do not reply.</p>
  </div>
</div>
</body></html>`;
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================
function jsonOk(data)       { return new Response(JSON.stringify(data), { status: 200, headers: CORS }); }
function jsonErr(msg, code) { return new Response(JSON.stringify({ ok: false, error: msg }), { status: code || 400, headers: CORS }); }
