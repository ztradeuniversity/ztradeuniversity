// functions/utils/ai-supabase.js
// ──────────────────────────────────────────────────────────────────────────
// Supabase REST client for the DEDICATED AI project: "ZTU Chatbot".
//
// ⚠  SERVER-SIDE ONLY. The SERVICE key never leaves this layer / the frontend.
// ⚠  COMPLETELY SEPARATE from Library Supabase and Automation Supabase.
//
// Cloudflare Pages env vars (AI / ZTU Chatbot only — names are FIXED):
//   AI_SUPABASE_URL          → https://<ztu-chatbot-ref>.supabase.co
//   AI_SUPABASE_ANON_KEY     → anon/public key (not used server-side; reserved)
//   AI_SUPABASE_SERVICE_KEY  → service_role key (server-side ONLY)
//
// Canonical tables (no new tables, no redesign):
//   ai_user_profiles (PK device_id) · ai_chat_memory · ai_articles
//   ai_article_images · ai_chart_analyses · ai_pattern_vault · ai_brokers
//
// Every function no-ops (returns null/[] ) when not configured, so the AI keeps
// working in localStorage-only mode until ZTU Chatbot credentials are provided.
// ──────────────────────────────────────────────────────────────────────────

export function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

function svcHeaders(env) {
  const key = env.AI_SUPABASE_SERVICE_KEY;   // service_role — server-side only
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

async function sbFetch(env, method, table, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = svcHeaders(env);
    if (prefer) headers['Prefer'] = prefer;
    const res = await fetch(url(env, table, qs), {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      if (env.DEBUG === 'true') {
        const t = await res.text().catch(() => '');
        console.error(`[ai-supabase] ${method} ${table} ${res.status}: ${t.slice(0,200)}`);
      }
      return null;
    }
    return await res.json();
  } catch (err) {
    if (env.DEBUG === 'true') console.error(`[ai-supabase] ${method} ${table} error:`, err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ai_user_profiles  (PK: device_id)
// ════════════════════════════════════════════════════════════════════════════
export async function getProfile(env, deviceId) {
  if (!deviceId) return null;
  const rows = await sbFetch(env, 'GET', 'ai_user_profiles',
    `device_id=eq.${encodeURIComponent(deviceId)}&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function upsertProfile(env, deviceId, updates) {
  if (!deviceId || !updates) return null;
  const rows = await sbFetch(env, 'POST', 'ai_user_profiles', null,
    { device_id: deviceId, last_seen_at: new Date().toISOString(), ...updates },
    'resolution=merge-duplicates,return=representation');
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

// Module 4 — persist the five behaviour scores (+ optional rolled-up memory).
const SCORE_KEYS = ['discipline_score', 'patience_score', 'confidence_score', 'risk_score', 'psychology_score'];
export async function updateScores(env, deviceId, scores = {}, extra = {}) {
  if (!isConfigured(env) || !deviceId) return null;
  const updates = { ...extra };
  for (const k of SCORE_KEYS) if (scores[k] != null) updates[k] = Math.max(0, Math.min(10, Math.round(scores[k])));
  if (!Object.keys(updates).length) return null;
  return upsertProfile(env, deviceId, updates);
}

// ════════════════════════════════════════════════════════════════════════════
// ai_chat_memory  (categorised memory log)
// ════════════════════════════════════════════════════════════════════════════
// Canonical insert. `opts` = { role, content, intent, category, psychologyFlags, weight, pinned }
export async function insertChatMemory(env, deviceId, opts = {}) {
  if (!isConfigured(env) || !deviceId || !opts.content) return null;
  return sbFetch(env, 'POST', 'ai_chat_memory', null, {
    device_id:        deviceId,
    role:             opts.role || 'user',
    content:          String(opts.content).slice(0, 8000),
    intent:           opts.intent || null,
    category:         opts.category || 'question',
    psychology_flags: opts.psychologyFlags || [],
    weight:           opts.weight ?? 3,
    pinned:           !!opts.pinned,
    created_at:       new Date().toISOString(),
  }, null);
}

export async function getChatMemory(env, deviceId, { category, limit = 12 } = {}) {
  if (!isConfigured(env) || !deviceId) return [];
  const cat = category ? `&category=eq.${encodeURIComponent(category)}` : '';
  const rows = await sbFetch(env, 'GET', 'ai_chat_memory',
    `device_id=eq.${encodeURIComponent(deviceId)}${cat}&order=created_at.desc&limit=${limit}`, null, null);
  return Array.isArray(rows) ? rows : [];
}

// Module 7 — retention: drop low-weight, old, non-pinned noise.
export async function pruneChatMemory(env, deviceId, { maxAgeDays = 30, maxWeight = 2 } = {}) {
  if (!isConfigured(env) || !deviceId) return null;
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
  return sbFetch(env, 'DELETE', 'ai_chat_memory',
    `device_id=eq.${encodeURIComponent(deviceId)}&pinned=is.false&weight=lte.${maxWeight}&created_at=lt.${cutoff}`,
    null, 'return=minimal');
}

// ── Compatibility wrappers (existing callers keep working) ───────────────────
export async function saveChatMessage(env, deviceId, conversationId, role, content, psychologyFlags = [], opts = {}) {
  return insertChatMemory(env, deviceId, {
    role, content, psychologyFlags,
    intent:   opts.intent   || null,
    category: opts.category || (role === 'assistant' ? 'question' : 'question'),
    weight:   opts.weight,
    pinned:   opts.pinned,
  });
}
export async function getRecentChatContext(env, deviceId, limit = 12) {
  const rows = await getChatMemory(env, deviceId, { limit });
  return rows.reverse();
}
// Trade assessments now live as a categorised memory entry (no separate table).
export async function saveTradeAssessment(env, deviceId, data = {}) {
  return insertChatMemory(env, deviceId, {
    role: 'assistant', category: 'risk-behavior', intent: 'assess',
    content: JSON.stringify(data).slice(0, 8000), weight: 5,
  });
}
// Deprecated (psychology now stored as ai_chat_memory.psychology_flags). No-op.
export async function bumpPsychologyFlags(/* env, deviceId, flags */) { return null; }

export async function incrementFreeMessages(env, deviceId) {
  if (!isConfigured(env) || !deviceId) return null;
  const profile = await getProfile(env, deviceId);
  const current = profile?.free_messages_used ?? 0;
  return sbFetch(env, 'PATCH', 'ai_user_profiles',
    `device_id=eq.${encodeURIComponent(deviceId)}`,
    { free_messages_used: current + 1, last_seen_at: new Date().toISOString() },
    'return=representation');
}

// ════════════════════════════════════════════════════════════════════════════
// ai_articles + ai_article_images  (Module 5)
// ════════════════════════════════════════════════════════════════════════════
export async function queryArticles(env, { query, tags, limit = 3 } = {}) {
  if (!isConfigured(env)) return [];
  let qs = `is_active=eq.true&limit=${limit}`;
  if (tags?.length) qs += `&tags=ov.{${tags.map(t => encodeURIComponent(t)).join(',')}}`;
  else if (query)   qs += `&or=(title.ilike.*${encodeURIComponent(query)}*,summary.ilike.*${encodeURIComponent(query)}*)`;
  const rows = await sbFetch(env, 'GET', 'ai_articles', qs, null, null);
  return Array.isArray(rows) ? rows : [];
}

export async function queryArticleImages(env, { articleId, patternKey, limit = 3 } = {}) {
  if (!isConfigured(env)) return [];
  let qs = `limit=${limit}`;
  if (articleId)       qs += `&article_id=eq.${encodeURIComponent(articleId)}`;
  else if (patternKey) qs += `&tags=ov.{${encodeURIComponent(patternKey)}}`;
  const rows = await sbFetch(env, 'GET', 'ai_article_images', qs, null, null);
  return Array.isArray(rows) ? rows : [];
}

// ════════════════════════════════════════════════════════════════════════════
// ai_pattern_vault  (Module 6 — pattern statistics)
// ════════════════════════════════════════════════════════════════════════════
export async function getPatternStats(env, patternKey, instrument = 'ALL') {
  if (!isConfigured(env) || !patternKey) return null;
  const rows = await sbFetch(env, 'GET', 'ai_pattern_vault',
    `pattern_key=eq.${encodeURIComponent(patternKey)}&instrument=in.(${instrument},ALL)&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// ════════════════════════════════════════════════════════════════════════════
// ai_chart_analyses  (chart upload history → future pattern stats)
// ════════════════════════════════════════════════════════════════════════════
export async function saveChartAnalysis(env, deviceId, data = {}) {
  if (!isConfigured(env) || !deviceId) return null;
  return sbFetch(env, 'POST', 'ai_chart_analyses', null, {
    device_id: deviceId, created_at: new Date().toISOString(),
    instrument: data.instrument || null, timeframe: data.timeframe || null,
    trend: data.trend || null, patterns: data.patterns || [], levels: data.levels || [],
    image_ref: data.imageRef || null,
  }, null);
}

// ════════════════════════════════════════════════════════════════════════════
// LEGACY (unchanged) — used by ai-knowledge.js, ai-patterns.js, ai-verify.js.
// These target their own existing tables and degrade gracefully.
// ════════════════════════════════════════════════════════════════════════════
export async function searchKnowledge(env, tags, limit = 5) {
  if (!isConfigured(env)) return [];
  const tagFilter = tags?.length ? `&tags=ov.{${tags.map(t => encodeURIComponent(t)).join(',')}}` : '';
  const rows = await sbFetch(env, 'GET', 'ai_knowledge_base', `is_active=eq.true${tagFilter}&limit=${limit}`, null, null);
  return Array.isArray(rows) ? rows : [];
}
export async function getActivePatterns(env, instrument = 'ALL') {
  if (!isConfigured(env)) return [];
  const rows = await sbFetch(env, 'GET', 'ai_pattern_vault',
    `instrument=in.(${instrument},ALL)&order=win_rate.desc.nullslast&limit=3`, null, null);
  return Array.isArray(rows) ? rows : [];
}
export async function upsertPattern(env, patternData) {
  if (!isConfigured(env)) return null;
  return sbFetch(env, 'POST', 'ai_pattern_vault', null, patternData, 'resolution=merge-duplicates,return=representation');
}
export async function lookupIbAccount(env, accountNumber /* , brokerName */) {
  if (!isConfigured(env) || !accountNumber) return null;
  const acct = String(accountNumber).trim();
  const rows = await sbFetch(env, 'GET', 'ai_ib_accounts', `account_number=eq.${encodeURIComponent(acct)}&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
export async function logVerificationRequest(env, data) {
  if (!isConfigured(env)) return null;
  return sbFetch(env, 'POST', 'ai_verification_requests', null, { submitted_at: new Date().toISOString(), ...data }, null);
}
export async function setProfileVerified(env, deviceId, { accountNumber, brokerName, accountType }) {
  if (!isConfigured(env) || !deviceId) return null;
  return upsertProfile(env, deviceId, {
    is_verified:             true,
    verified_account_number: accountNumber ? String(accountNumber).slice(0, 64) : null,
    verified_broker:         brokerName ? String(brokerName).slice(0, 120) : null,
    verified_account_type:   accountType ? String(accountType).slice(0, 60) : null,
    verified_at:             new Date().toISOString(),
  });
}
