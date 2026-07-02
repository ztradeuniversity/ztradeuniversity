// functions/utils/chart-store.js
// ════════════════════════════════════════════════════════════════════════════
// CHART STORAGE (Module 1 + 8) — self-contained Supabase REST + Storage for the
// chart pipeline. SERVER-SIDE ONLY (service key never reaches the client).
//
// Bucket: chart-uploads   (PRIVATE — signed URLs only, never public)
// Table:  ai_chart_analyses  (canonical — no redesign; additive columns only)
//
// Independent of ai-supabase.js (does NOT modify the protected AI Supabase
// Integration). No-ops gracefully until ZTU Chatbot credentials exist.
// ════════════════════════════════════════════════════════════════════════════

export const CHART_BUCKET = 'chart-uploads';   // PRIVATE bucket
const SIGN_TTL = 3600;                          // 1h signed-URL preview

export function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}
function key(env) { return env.AI_SUPABASE_SERVICE_KEY; }
function rest(env, table, qs = '') { return `${env.AI_SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`; }

async function sb(env, method, table, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = { apikey: key(env), Authorization: `Bearer ${key(env)}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(rest(env, table, qs), { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
    if (!res.ok) { if (env.DEBUG === 'true') console.error(`[chart-store] ${method} ${table} ${res.status}`); return null; }
    if (method === 'DELETE' || prefer === 'return=minimal') return true;
    return await res.json();
  } catch (e) { if (env.DEBUG === 'true') console.error('[chart-store]', e.message); return null; }
}

// ── STORAGE: upload to PRIVATE bucket, return a signed preview URL ────────────
export async function uploadChart(env, path, bytes, contentType = 'image/png') {
  if (!isConfigured(env)) return null;
  try {
    const up = await fetch(`${env.AI_SUPABASE_URL}/storage/v1/object/${CHART_BUCKET}/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { apikey: key(env), Authorization: `Bearer ${key(env)}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: bytes, signal: AbortSignal.timeout(15000),
    });
    if (!up.ok) { if (env.DEBUG === 'true') console.error('[chart-store] upload', up.status); return null; }
    const signed = await signedUrl(env, path);
    return { path, signedUrl: signed };
  } catch (e) { if (env.DEBUG === 'true') console.error('[chart-store] upload', e.message); return null; }
}

export async function signedUrl(env, path, ttl = SIGN_TTL) {
  if (!isConfigured(env)) return null;
  try {
    const res = await fetch(`${env.AI_SUPABASE_URL}/storage/v1/object/sign/${CHART_BUCKET}/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { apikey: key(env), Authorization: `Bearer ${key(env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttl }), signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.signedURL ? `${env.AI_SUPABASE_URL}/storage/v1${d.signedURL}` : null;
  } catch { return null; }
}

// ── ai_chart_analyses ────────────────────────────────────────────────────────
// Create an analysis session (Module 1) — partial row, returns id.
export async function createSession(env, deviceId, { instrument, timeframe, chartType, imageRef } = {}) {
  if (!isConfigured(env)) return null;
  const rows = await sb(env, 'POST', 'ai_chart_analyses', null, {
    device_id: deviceId || null, created_at: new Date().toISOString(),
    instrument: instrument || null, timeframe: timeframe || null,
    chart_type: chartType || null, image_ref: imageRef || null,
  }, 'return=representation');
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

// Save detection results (Module 8) — update by id (or insert if no id).
export async function saveAnalysis(env, id, data = {}) {
  if (!isConfigured(env)) return null;
  const payload = {
    trend:        data.trend || null,
    patterns:     data.patterns || [],      // jsonb
    levels:       data.levels || [],        // jsonb
    structure:    data.structure || [],     // jsonb (BOS/CHOCH)
    annotations:  data.annotations || [],   // jsonb (full annotation set)
    annotated_ref:data.annotatedRef || null,
  };
  if (id) {
    const rows = await sb(env, 'PATCH', 'ai_chart_analyses', `id=eq.${encodeURIComponent(id)}`, payload, 'return=representation');
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  }
  const rows = await sb(env, 'POST', 'ai_chart_analyses', null,
    { device_id: data.deviceId || null, created_at: new Date().toISOString(), image_ref: data.imageRef || null, ...payload },
    'return=representation');
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

export async function getAnalysis(env, id) {
  if (!isConfigured(env) || !id) return null;
  const rows = await sb(env, 'GET', 'ai_chart_analyses', `id=eq.${encodeURIComponent(id)}&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
