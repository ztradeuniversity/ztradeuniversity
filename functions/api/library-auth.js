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
//   EA_IB_STARS_TABLE        - IB active members table (default: broker_accounts)
//                              Required columns: account_number, email, ib_star_status
//                              (active when ib_star_status === 'active', case-insensitive)
//                              Phase 16.9 — default changed from 'ib_stars_active' to
//                              'broker_accounts' so the Library OTP gate reads from the
//                              SAME table the admin dashboard writes via _persistBrokerAccounts.
//                              No data sync between two tables is required.
//   LIBRARY_OTP_SECRET       - >= 32 char random secret for HMAC token signing
//   RESEND_API_KEY           - Resend.com API key for email delivery
//   EMAIL_FROM               - Sender address e.g. noreply@ztradeuniversity.com
//
// Actions (POST with JSON body):
//   request-otp    { account }        => { ok, token, email_mask }
//                                        { ok:false, reason: 'not_found'|'inactive'|'email_missing'|'email_failed' }
//   verify-otp     { token, code }    => { ok, account } | { ok:false, reason, att?, token? }
//   resend-otp     { token }          => { ok, token, email_mask }
//   verify-session { account }        => { ok, valid }
//
// Access logic (3 conditions):
//   account NOT found / not active in 30 days  => reason: 'not_found' | 'inactive'  (Condition 2)
//   account active but email missing/null      => reason: 'email_missing'           (Condition 3)
//   account active + email present             => generate + send OTP               (Condition 1)
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
  if (!lookup.email) {
    // CONDITION 3 — eligible & active, but no email registered for verification
    return jsonOk({ ok: false, reason: 'email_missing' });
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
  if (!lookup.email)   return jsonOk({ ok: false, reason: 'email_missing' });

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
  // Phase 16.9 — default points at broker_accounts (the table the admin
  // dashboard writes via _persistBrokerAccounts).  Override with
  // EA_IB_STARS_TABLE env var if you keep a separate view/table.
  const table       = env.EA_IB_STARS_TABLE || 'broker_accounts';

  // DEMO MODE - env vars not yet configured
  if (!supabaseUrl || !serviceKey) {
    console.warn('[library-auth] EA env vars not set - running in DEMO MODE');
    // In demo mode any non-empty account number is treated as active
    return { found: true, active: true, email: `demo.${acct.replace(/\s/g, '')}@demo.ztu.com` };
  }

  const acctEncoded = encodeURIComponent(acct);
  // Select ALL columns: the email / last-trade / status column NAMES differ
  // between the broker_accounts table and the ib_stars_active view, so we resolve
  // them in code rather than hard-coding names (which silently returned null).
  const qs = `account_number=eq.${acctEncoded}&select=*&limit=1`;

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
    const override = await checkAccessOverride(supabaseUrl, serviceKey, acct);
    if (override) return { found: true, active: true, email: override.email || null };
    return { found: false };
  }

  const row = rows[0];

  // Active = traded within the last 30 days (matches the admin "IB Stars Active"
  // view). Resolve the trade-date column under any of its known names.
  const lastTrade = row.last_trade_date || row.client_account_last_trade ||
                    row.last_trade || row.last_traded_at || null;
  let isActive = false;
  if (lastTrade) {
    const days = (Date.now() - new Date(lastTrade).getTime()) / 86400000;
    if (days <= 30) isActive = true;
  }
  // Secondary signal: an explicit status column equal to 'active'.
  const statusVal = row.ib_star_status || row.status || '';
  if (!isActive && typeof statusVal === 'string') {
    isActive = statusVal.trim().toLowerCase() === 'active';
  }

  if (!isActive) {
    // Admin-only manual override (admin-dashboard.html "Grant Access Override" on a
    // license_requests row). Single source of truth stays this function — Library
    // and AI both call it — this is just an additional fallback condition, never a
    // parallel verification path. Graceful no-op if the override column isn't
    // provisioned yet (see _setAccessOverride() in admin-dashboard.js for the SQL).
    const override = await checkAccessOverride(supabaseUrl, serviceKey, acct);
    if (override) return { found: true, active: true, email: override.email || null };
    return { found: true, active: false };
  }

  // Resolve the email. The IB-Stars view itself usually carries no email column,
  // so we read it from the AUTHORITATIVE broker_accounts table — exactly what the
  // admin "IB Stars Active" list displays (account_number + email). license_requests
  // is a secondary source. Both keyed by account_number, null emails skipped.
  let email = resolveEmail(row);
  if (!email) email = await fetchEmailByAccount(supabaseUrl, serviceKey, 'broker_accounts',   acct);
  if (!email) email = await fetchEmailByAccount(supabaseUrl, serviceKey, 'license_requests',  acct);

  // Proof trace (visible in Cloudflare → Functions → Real-time logs)
  console.log(`[library-auth] lookup acct="${decodeURIComponent(acctEncoded)}" found=true active=true email=${email ? maskEmail(email) : 'NONE'}`);

  return { found: true, active: true, email: email || null };
}

// Admin-only manual access override (license_requests.access_override = true,
// set exclusively via the "Grant Access Override" button in admin-dashboard.html
// after an admin personally reviews a license request). Returns null on any
// failure or when the override column doesn't exist yet — graceful no-op.
async function checkAccessOverride(supabaseUrl, serviceKey, acctRaw) {
  const norm = normAcct(acctRaw);
  if (!norm) return null;
  try {
    const forms = [...new Set([String(acctRaw).trim(), norm, `${norm}.0`, `${norm}.00`])].filter(Boolean);
    const orEq  = forms.map(v => `account_number.eq.${encodeURIComponent(v)}`).join(',');
    const res = await fetch(
      `${supabaseUrl}/rest/v1/license_requests?or=(${orEq})&access_override=eq.true&select=account_number,email&limit=5`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' } }
    );
    if (!res.ok) return null;   // e.g. column missing — not provisioned yet
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows.find(r => normAcct(r.account_number) === norm) || rows[0];
    console.log(`[library-auth] manual access override active for acct="${norm}"`);
    return { email: row.email || null };
  } catch (e) {
    console.error('[library-auth] checkAccessOverride exception:', e?.message);
    return null;
  }
}

// Fetch an email for an account from a given table.
// EA tables can store account_number in non-canonical raw forms (Excel float
// artifacts like "171929726.0", scientific notation, commas, whitespace). The
// admin dashboard normalises before matching (normalizeAccountId); we mirror that:
//   Pass 1 — fast indexed eq on the common raw forms.
//   Pass 2 — tolerant ilike, then confirm via in-code normalisation.
async function fetchEmailByAccount(supabaseUrl, serviceKey, table, acctRaw) {
  const headers = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Accept': 'application/json' };
  const norm    = normAcct(acctRaw);
  if (!norm) return null;

  // Pass 1 — exact-match the likely stored forms (indexed, fast).
  const forms  = [...new Set([String(acctRaw).trim(), norm, `${norm}.0`, `${norm}.00`])].filter(Boolean);
  const orEq   = forms.map(v => `account_number.eq.${encodeURIComponent(v)}`).join(',');
  let email = await _queryEmail(`${supabaseUrl}/rest/v1/${table}?or=(${orEq})&select=*&limit=25`, headers, norm, table);
  if (email) return email;

  // Pass 2 — tolerant substring match (whitespace / suffix / float artifacts).
  email = await _queryEmail(`${supabaseUrl}/rest/v1/${table}?account_number=ilike.*${encodeURIComponent(norm)}*&select=*&limit=50`, headers, norm, table);
  return email;
}

async function _queryEmail(url, headers, norm, table) {
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) {
      console.error(`[library-auth] ${table} HTTP ${r.status}:`, await r.text().catch(() => ''));
      return null;
    }
    const rows = await r.json();
    console.log(`[library-auth] ${table}: ${Array.isArray(rows) ? rows.length : 0} candidate row(s)`);
    if (Array.isArray(rows)) {
      // Prefer the row whose NORMALISED account matches exactly.
      for (const row of rows) {
        if (normAcct(row.account_number) === norm) { const e = resolveEmail(row); if (e) return e; }
      }
      // Otherwise any candidate row that carries an email.
      for (const row of rows) { const e = resolveEmail(row); if (e) return e; }
    }
  } catch (e) {
    console.error(`[library-auth] ${table} email lookup failed:`, e?.message);
  }
  return null;
}

// Mirror of the admin dashboard's normalizeAccountId (admin-dashboard.js:1506).
function normAcct(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  let s = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (/[eE]/.test(s) && /^[0-9.eE+\-]+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.round(n));
  }
  return s.replace(/\.0+$/, '');
}

// Resolve an email address from a row regardless of the exact column name.
function resolveEmail(row) {
  const keys = ['email', 'client_email', 'linked_email', 'email_address',
                'client_email_address', 'user_email', 'contact_email'];
  for (const k of keys) {
    if (row[k] && String(row[k]).includes('@')) return String(row[k]).trim();
  }
  // Last resort: scan all string values for an email-looking token.
  for (const v of Object.values(row)) {
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) {
      return v.trim();
    }
  }
  return null;
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
  /* Show first 2 + last 2 of the local part, e.g.
     oldguest80@gmail.com -> ol******80@gmail.com  (spec format)   */
  let masked;
  if (local.length <= 4) {
    masked = local.slice(0, 1) + '*'.repeat(Math.max(3, local.length - 1));
  } else {
    masked = local.slice(0, 2) + '*'.repeat(local.length - 4) + local.slice(-2);
  }
  return `${masked}@${domain}`;
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
