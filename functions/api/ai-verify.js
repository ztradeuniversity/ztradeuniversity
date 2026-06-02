// functions/api/ai-verify.js
// ──────────────────────────────────────────────────────────────────────────
// PHASE 9 — IB Verification & Access Control
//
// GET  /api/ai-verify?userId=xxx        → access status (gating on/off, verified, usage)
// POST /api/ai-verify                   → verify a broker account → unlock unlimited
//
// Business goal: convert visitors into broker IB users.
//
// ARCHITECTURE (verification-ready):
//   Actual account matching is done against `ai_ib_accounts`, a table populated
//   LATER from uploaded broker CSV/XLSX reports. Until that table has data — or
//   until the AI Supabase project is configured — gating stays OFF so no live
//   user is ever locked out of a feature that cannot yet be unlocked.
//
//   When AI Supabase IS configured:
//     • gatingEnabled = true
//     • free_messages_used is tracked per user
//     • after the free limit, unverified users must verify to continue
//     • verification looks the account up in ai_ib_accounts (active + under our IB)
//
// Env vars (AI-only Supabase project — separate from main site):
//   AI_SUPABASE_URL, AI_SUPABASE_ANON_KEY, AI_SUPABASE_SERVICE_KEY
//   AI_FREE_MESSAGE_LIMIT  (optional, default 15)
// ──────────────────────────────────────────────────────────────────────────

import {
  isConfigured, getProfile,
  lookupIbAccount, logVerificationRequest, setProfileVerified,
} from '../utils/ai-supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_H });
}

function freeLimit(env) {
  const n = parseInt(env.AI_FREE_MESSAGE_LIMIT ?? '15', 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const gatingEnabled = isConfigured(env);
  const limit         = freeLimit(env);

  // ── GET: access status ────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return json({ error: 'userId required' }, 400);

    // When AI Supabase is not configured, gating is OFF — unlimited access.
    if (!gatingEnabled) {
      return json({
        gatingEnabled: false,
        verified:      true,         // effectively unlimited while gating is off
        freeUsed:      0,
        freeLimit:     limit,
        remaining:     null,
      });
    }

    const profile  = await getProfile(env, userId);
    const verified = !!profile?.is_verified;
    const used     = profile?.free_messages_used ?? 0;

    return json({
      gatingEnabled: true,
      verified,
      freeUsed:      used,
      freeLimit:     limit,
      remaining:     verified ? null : Math.max(0, limit - used),
    });
  }

  // ── POST: verify a broker account ──────────────────────────────────────────
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body;
  try   { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const userId        = typeof body?.userId === 'string' ? body.userId.slice(0, 80) : null;
  const accountNumber = typeof body?.accountNumber === 'string' ? body.accountNumber.trim().slice(0, 64) : '';
  const brokerName    = typeof body?.brokerName === 'string' ? body.brokerName.trim().slice(0, 120) : '';
  const accountType   = typeof body?.accountType === 'string' ? body.accountType.trim().slice(0, 60) : '';

  if (!userId)        return json({ error: 'userId required' }, 400);
  if (!accountNumber) return json({ error: 'accountNumber required', field: 'accountNumber' }, 400);
  if (!brokerName)    return json({ error: 'brokerName required',    field: 'brokerName' }, 400);

  // System not yet configured → cannot verify, but DO NOT block the user.
  if (!gatingEnabled) {
    return json({
      configured: false,
      verified:   true,            // grant access; gating is dormant
      message:    'Verification is being set up. You currently have full access — enjoy the AI Assistant.',
    });
  }

  // Log the attempt regardless of outcome (reconciled against CSV uploads later)
  await logVerificationRequest(env, {
    session_id:     userId,
    account_number: accountNumber,
    broker_name:    brokerName,
    account_type:   accountType,
    result:         'pending',
  }).catch(() => {});

  // Look the account up in the IB accounts table
  const acct = await lookupIbAccount(env, accountNumber, brokerName);

  // Account exists, is active, and is under our IB → VERIFY
  const isActive    = acct && (acct.status === 'active' || acct.is_active === true);
  const isUnderOurIb = acct && (acct.is_under_our_ib === true || acct.is_under_our_ib === undefined);

  if (acct && isActive && isUnderOurIb) {
    await setProfileVerified(env, userId, { accountNumber, brokerName, accountType }).catch(() => {});
    return json({
      configured: true,
      verified:   true,
      message:    '✅ Account verified! You now have unlimited access to the ZTU AI Trading Assistant.',
    });
  }

  // Account found but inactive
  if (acct && !isActive) {
    return json({
      configured: true,
      verified:   false,
      reason:     'inactive',
      message:    'Your account was found but appears inactive. Please ensure your account is funded and active under our IB, then try again.',
    });
  }

  // Not found under our IB
  return json({
    configured: true,
    verified:   false,
    reason:     'not_found',
    message:    'Account not found under our IB. Please open or connect your trading account under our IB to unlock unlimited access.',
  });
}
