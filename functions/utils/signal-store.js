// functions/utils/signal-store.js
// ════════════════════════════════════════════════════════════════════════════
// SIGNAL HISTORY DATA LAYER — self-contained Supabase REST access for the
// public signal transparency tracker. SERVER-SIDE ONLY (service key never
// reaches the client).
//
// Table:  signal_history   (see supabase/signal-history-schema.sql)
// Project: AI / "ZTU Chatbot" Supabase  (AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY)
//
// Independent of every other system by design — it adds NOTHING to the
// Journal/AI/Library/Mentor stores. Every call no-ops gracefully (returns
// [] / null) until the AI Supabase credentials are configured, so the public
// page renders an honest empty state instead of erroring.
// ════════════════════════════════════════════════════════════════════════════

const TABLE = 'signal_history';

export function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

function hdr(env, extra = {}) {
  const key = env.AI_SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}
function rest(env, qs = '') {
  return `${env.AI_SUPABASE_URL}/rest/v1/${TABLE}${qs ? '?' + qs : ''}`;
}

async function sb(env, method, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = hdr(env, prefer ? { Prefer: prefer } : {});
    const res = await fetch(rest(env, qs), {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      if (env.DEBUG === 'true') console.error(`[signal-store] ${method} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return null;
    }
    if (method === 'DELETE' || prefer === 'return=minimal') return true;
    return await res.json();
  } catch (e) {
    if (env.DEBUG === 'true') console.error('[signal-store] error', e.message);
    return null;
  }
}

const VALID_STATUS = ['Win', 'Loss', 'Breakeven', 'Running'];
const VALID_TYPE = ['BUY', 'SELL'];

// ── READS ─────────────────────────────────────────────────────────────────────
// List signals (newest first). `all=true` (admin) returns drafts too.
export async function listSignals(env, { all = false, limit = 500 } = {}) {
  let qs = `order=signal_date.desc,created_at.desc&limit=${limit}`;
  if (!all) qs += '&is_published=eq.true';
  const rows = await sb(env, 'GET', qs, null, null);
  return Array.isArray(rows) ? rows : [];
}

// ── WRITES (admin only — caller must already be authenticated) ─────────────────
function sanitize(d = {}) {
  const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const out = {};
  if (d.signal_date !== undefined)    out.signal_date    = String(d.signal_date).slice(0, 10) || null;
  if (d.market !== undefined)         out.market          = String(d.market || '').trim().slice(0, 32).toUpperCase() || null;
  if (d.signal_type !== undefined)    out.signal_type     = VALID_TYPE.includes(String(d.signal_type).toUpperCase()) ? String(d.signal_type).toUpperCase() : null;
  if (d.entry_price !== undefined)    out.entry_price     = num(d.entry_price);
  if (d.stop_loss !== undefined)      out.stop_loss       = num(d.stop_loss);
  if (d.take_profit !== undefined)    out.take_profit     = num(d.take_profit);
  if (d.status !== undefined)         out.status          = VALID_STATUS.includes(d.status) ? d.status : 'Running';
  if (d.result_summary !== undefined) out.result_summary  = d.result_summary ? String(d.result_summary).slice(0, 2000) : null;
  if (d.mentor_notes !== undefined)   out.mentor_notes    = d.mentor_notes ? String(d.mentor_notes).slice(0, 2000) : null;
  if (d.is_published !== undefined)   out.is_published    = !!d.is_published;
  return out;
}

export async function createSignal(env, data) {
  const row = sanitize(data);
  if (!row.signal_date || !row.market || !row.signal_type) {
    return { error: 'signal_date, market and signal_type are required' };
  }
  if (row.status === undefined) row.status = 'Running';
  if (row.is_published === undefined) row.is_published = true;
  const out = await sb(env, 'POST', '', row, 'return=representation');
  return Array.isArray(out) && out.length ? out[0] : (out || { error: 'insert failed' });
}

export async function updateSignal(env, id, data) {
  if (!id) return { error: 'id required' };
  const row = sanitize(data);
  if (!Object.keys(row).length) return { error: 'no fields to update' };
  const out = await sb(env, 'PATCH', `id=eq.${encodeURIComponent(id)}`, row, 'return=representation');
  return Array.isArray(out) && out.length ? out[0] : (out || { error: 'update failed' });
}

export async function deleteSignal(env, id) {
  if (!id) return false;
  return await sb(env, 'DELETE', `id=eq.${encodeURIComponent(id)}`, null, null);
}

// ── STATS (pure computation over a set of signal rows) ─────────────────────────
// Risk:Reward per closed/decided directional signal = |TP-entry| / |entry-SL|.
export function signalRR(s) {
  const e = Number(s.entry_price), sl = Number(s.stop_loss), tp = Number(s.take_profit);
  if (![e, sl, tp].every(Number.isFinite)) return null;
  const risk = Math.abs(e - sl);
  if (risk === 0) return null;
  return Math.abs(tp - e) / risk;
}

export function computeStats(signals) {
  const total = signals.length;
  const wins = signals.filter((s) => s.status === 'Win').length;
  const losses = signals.filter((s) => s.status === 'Loss').length;
  const breakeven = signals.filter((s) => s.status === 'Breakeven').length;
  const running = signals.filter((s) => s.status === 'Running').length;
  // Win rate is over DECIDED signals only (exclude still-running) for honesty.
  const decided = wins + losses + breakeven;
  const winRate = decided ? Math.round((wins / decided) * 1000) / 10 : null;
  const rrs = signals.map(signalRR).filter((v) => v != null);
  const avgRR = rrs.length ? Math.round((rrs.reduce((a, b) => a + b, 0) / rrs.length) * 100) / 100 : null;
  return { total, wins, losses, breakeven, running, decided, winRate, avgRR };
}
