// functions/utils/ai-supabase.js
// ──────────────────────────────────────────────────────────────────────────
// Supabase REST client for the AI-ONLY Supabase project.
//
// ⚠  COMPLETELY SEPARATE from the main website's Supabase project.
//    Never mix credentials with the existing site Supabase.
//
// Required Cloudflare Pages env vars (AI project only):
//   AI_SUPABASE_URL         → https://[ai-project-ref].supabase.co
//   AI_SUPABASE_ANON_KEY    → anon/public key from the AI Supabase project
//   AI_SUPABASE_SERVICE_KEY → service_role key from the AI Supabase project
//
// All functions return null and fail silently when env vars are absent.
// The AI continues to work in localStorage-only mode without these vars.
// ──────────────────────────────────────────────────────────────────────────

export function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

function svcHeaders(env) {
  const key = env.AI_SUPABASE_SERVICE_KEY;
  return {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
}

function url(env, table, qs = '') {
  return `${env.AI_SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
}

// ── GENERIC HELPERS ────────────────────────────────────────────────────────

async function sbFetch(env, method, table, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = svcHeaders(env);
    if (prefer) headers['Prefer'] = prefer;
    const res = await fetch(url(env, table, qs), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      if (env.DEBUG === 'true') {
        const t = await res.text().catch(() => '');
        console.error(`[ai-supabase] ${method} ${table} failed ${res.status}: ${t.slice(0,200)}`);
      }
      return null;
    }
    const rows = await res.json();
    return rows;
  } catch (err) {
    if (env.DEBUG === 'true') console.error(`[ai-supabase] ${method} ${table} error:`, err.message);
    return null;
  }
}

// ── PROFILE ────────────────────────────────────────────────────────────────

export async function getProfile(env, sessionId) {
  if (!sessionId) return null;
  const rows = await sbFetch(env, 'GET', 'ai_user_profiles',
    `session_id=eq.${encodeURIComponent(sessionId)}&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function upsertProfile(env, sessionId, updates) {
  if (!sessionId || !updates) return null;
  const rows = await sbFetch(env, 'POST', 'ai_user_profiles', null,
    { session_id: sessionId, updated_at: new Date().toISOString(), ...updates },
    'resolution=merge-duplicates,return=representation');
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

// ── CHAT HISTORY ───────────────────────────────────────────────────────────

export async function saveChatMessage(env, sessionId, conversationId, role, content, psychologyFlags = []) {
  if (!sessionId) return null;
  return sbFetch(env, 'POST', 'ai_chat_history', null, {
    session_id:      sessionId,
    conversation_id: conversationId,
    role,
    content:         content.slice(0, 8000),
    psychology_flags: psychologyFlags,
  }, null);
}

export async function getRecentChatContext(env, sessionId, limit = 12) {
  if (!sessionId) return [];
  const rows = await sbFetch(env, 'GET', 'ai_chat_history',
    `session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc&limit=${limit}`, null, null);
  if (!Array.isArray(rows)) return [];
  return rows.reverse();
}

// ── TRADE ASSESSMENTS ──────────────────────────────────────────────────────

export async function saveTradeAssessment(env, sessionId, data) {
  if (!sessionId) return null;
  return sbFetch(env, 'POST', 'ai_trade_assessments', null,
    { session_id: sessionId, assessed_at: new Date().toISOString(), ...data }, null);
}

// ── PSYCHOLOGY FLAGS ────────────────────────────────────────────────────────

const PSYCH_COL_MAP = {
  fomo:        'fomo_score',
  fear:        'fear_score',
  revenge:     'revenge_score',
  hesitation:  'hesitation_score',
  overtrading: 'overtrading_score',
};

export async function bumpPsychologyFlags(env, sessionId, flags) {
  if (!sessionId || !flags?.length) return null;
  const profile = await getProfile(env, sessionId);
  if (!profile) {
    // Profile doesn't exist yet — create it with these initial flags
    const init = {};
    flags.forEach(f => { if (PSYCH_COL_MAP[f]) init[PSYCH_COL_MAP[f]] = 1; });
    return upsertProfile(env, sessionId, init);
  }
  const updates = { updated_at: new Date().toISOString() };
  flags.forEach(f => {
    const col = PSYCH_COL_MAP[f];
    if (col) updates[col] = Math.min((profile[col] ?? 0) + 1, 10);
  });
  return sbFetch(env, 'PATCH', 'ai_user_profiles',
    `session_id=eq.${encodeURIComponent(sessionId)}`, updates,
    'return=representation');
}

// ── KNOWLEDGE BASE ─────────────────────────────────────────────────────────

export async function searchKnowledge(env, tags, limit = 5) {
  if (!isConfigured(env)) return [];
  // Filter by tags using PostgREST array overlap operator
  const tagFilter = tags?.length
    ? `&tags=ov.{${tags.map(t => encodeURIComponent(t)).join(',')}}` : '';
  const rows = await sbFetch(env, 'GET', 'ai_knowledge_base',
    `is_active=eq.true${tagFilter}&limit=${limit}`, null, null);
  return Array.isArray(rows) ? rows : [];
}

// ── PATTERN VAULT (custom/AI-discovered entries) ───────────────────────────

export async function getActivePatterns(env, instrument = 'ALL') {
  if (!isConfigured(env)) return [];
  const rows = await sbFetch(env, 'GET', 'ai_pattern_vault',
    `is_currently_active=eq.true&instrument=in.(${instrument},ALL)&order=win_rate_pct.desc&limit=3`,
    null, null);
  return Array.isArray(rows) ? rows : [];
}

export async function upsertPattern(env, patternData) {
  if (!isConfigured(env)) return null;
  return sbFetch(env, 'POST', 'ai_pattern_vault', null, patternData,
    'resolution=merge-duplicates,return=representation');
}

// ── PHASE 9: IB VERIFICATION & ACCESS CONTROL ──────────────────────────────

// Look up a broker account in the AI-only IB accounts table.
// This table is populated later from uploaded broker CSV/XLSX reports.
export async function lookupIbAccount(env, accountNumber, brokerName) {
  if (!isConfigured(env) || !accountNumber) return null;
  const acct = String(accountNumber).trim();
  // Match by account number (broker is a soft/secondary match — brokers reuse numbers)
  let qs = `account_number=eq.${encodeURIComponent(acct)}&limit=1`;
  const rows = await sbFetch(env, 'GET', 'ai_ib_accounts', qs, null, null);
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
}

// Log every verification attempt (so the team can reconcile against CSV uploads later).
export async function logVerificationRequest(env, data) {
  if (!isConfigured(env)) return null;
  return sbFetch(env, 'POST', 'ai_verification_requests', null, {
    submitted_at: new Date().toISOString(),
    ...data,
  }, null);
}

// Flip a user profile to verified (grants unlimited access).
export async function setProfileVerified(env, sessionId, { accountNumber, brokerName, accountType }) {
  if (!isConfigured(env) || !sessionId) return null;
  return upsertProfile(env, sessionId, {
    is_verified:             true,
    verified_account_number: accountNumber ? String(accountNumber).slice(0, 64) : null,
    verified_broker:         brokerName ? String(brokerName).slice(0, 120) : null,
    verified_account_type:   accountType ? String(accountType).slice(0, 60) : null,
    verified_at:             new Date().toISOString(),
  });
}

// Increment the free-message counter on a profile (used for soft access gating).
export async function incrementFreeMessages(env, sessionId) {
  if (!isConfigured(env) || !sessionId) return null;
  const profile = await getProfile(env, sessionId);
  const current = profile?.free_messages_used ?? 0;
  return sbFetch(env, 'PATCH', 'ai_user_profiles',
    `session_id=eq.${encodeURIComponent(sessionId)}`,
    { free_messages_used: current + 1, updated_at: new Date().toISOString() },
    'return=representation');
}
