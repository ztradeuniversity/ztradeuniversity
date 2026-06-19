// functions/utils/system-log.js
// ════════════════════════════════════════════════════════════════════════════
// SYSTEM EVENT LOG — production upgrade. Audit finding: embedding generation,
// graph-sync, and article-ingestion failures were swallowed by silent
// try/catch → null fallbacks (correct for chat-path safety, but invisible to
// admins). This module gives those failures a durable, admin-visible trail
// without touching any existing error-handling behavior — every call site
// still degrades exactly as before; this only ADDS a best-effort log write.
//
// Table: kb_system_log (new, AI Supabase). Self-contained REST client (mirrors
// article-store.js) so this has ZERO import coupling with kb-store.js/
// embedding-provider.js — avoids any circular-import risk since both of those
// are call sites. Every call is graceful: no-op until configured/table exists.
// ════════════════════════════════════════════════════════════════════════════

function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

async function sb(env, method, table, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = {
      apikey: env.AI_SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    };
    const res = await fetch(`${env.AI_SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    if (prefer === 'return=minimal' || method === 'DELETE') return true;
    return res.json().catch(() => null);
  } catch { return null; }
}

// kind: 'embedding' | 'graph-sync' | 'article-ingestion' | 'chunking'
// level: 'error' | 'warn' | 'info'
export async function logSystemEvent(env, { kind, level = 'error', message, meta = null } = {}) {
  if (!isConfigured(env) || !kind || !message) return null;
  // Best-effort: never throw, never block the caller's real work.
  return sb(env, 'POST', 'kb_system_log', null, {
    kind, level, message: String(message).slice(0, 500),
    meta: meta ? JSON.stringify(meta).slice(0, 2000) : null,
    created_at: new Date().toISOString(),
  }, 'return=minimal');
}

// Admin-facing read: recent events, optionally filtered by kind/level.
export async function getSystemLog(env, { kind, level, limit = 100 } = {}) {
  if (!isConfigured(env)) return [];
  let qs = `order=created_at.desc&limit=${limit}`;
  if (kind) qs += `&kind=eq.${encodeURIComponent(kind)}`;
  if (level) qs += `&level=eq.${encodeURIComponent(level)}`;
  const rows = await sb(env, 'GET', 'kb_system_log', qs, null, null);
  return Array.isArray(rows) ? rows : [];
}

// Admin-facing summary: counts by kind/level over the returned window, so the
// admin dashboard can show "3 embedding failures in the last 100 events" at a glance.
export async function systemLogSummary(env, { limit = 200 } = {}) {
  const rows = await getSystemLog(env, { limit });
  const summary = {};
  for (const r of rows) {
    const k = r.kind || 'unknown';
    summary[k] = summary[k] || { error: 0, warn: 0, info: 0, total: 0 };
    summary[k][r.level || 'info'] = (summary[k][r.level || 'info'] || 0) + 1;
    summary[k].total++;
  }
  return { configured: isConfigured(env), scanned: rows.length, byKind: summary, recent: rows.slice(0, 20) };
}
