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
const VALID_TP_SL_MODE = ['manual', 'ztu_bot'];

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
  if (d.entry_zone_start !== undefined) out.entry_zone_start = num(d.entry_zone_start);
  if (d.entry_zone_end !== undefined)   out.entry_zone_end   = num(d.entry_zone_end);
  if (d.stop_loss !== undefined)      out.stop_loss       = num(d.stop_loss);
  if (d.take_profit !== undefined)    out.take_profit     = num(d.take_profit);
  if (d.tp_sl_mode !== undefined)     out.tp_sl_mode      = VALID_TP_SL_MODE.includes(String(d.tp_sl_mode)) ? String(d.tp_sl_mode) : 'ztu_bot';
  if (d.status !== undefined)         out.status          = VALID_STATUS.includes(d.status) ? d.status : 'Running';
  if (d.result_pips !== undefined)    out.result_pips     = num(d.result_pips);
  if (d.result_summary !== undefined) out.result_summary  = d.result_summary ? String(d.result_summary).slice(0, 2000) : null;
  if (d.mentor_notes !== undefined)   out.mentor_notes    = d.mentor_notes ? String(d.mentor_notes).slice(0, 2000) : null;
  if (d.is_published !== undefined)   out.is_published    = !!d.is_published;

  // ── Entry zone → entry_price mirror ──
  // entry_price is retained for backward compatibility (R:R math + the
  // homepage teaser's Avg R:R). When a zone is supplied it becomes the zone
  // midpoint, so nothing that already reads entry_price starts returning null.
  const zs = out.entry_zone_start, ze = out.entry_zone_end;
  if (zs != null || ze != null) {
    out.entry_price = (zs != null && ze != null) ? (zs + ze) / 2 : (zs != null ? zs : ze);
  }

  // ── Pips sign is derived from status, never trusted from the client ──
  // Win → positive, Loss → negative, Breakeven → 0, Running → no result yet.
  // Only applied when the caller supplied `status`, so a partial update that
  // omits status cannot silently flip the sign of an existing result.
  if (out.status !== undefined && out.result_pips !== undefined) {
    const mag = out.result_pips == null ? null : Math.abs(out.result_pips);
    if (out.status === 'Win')            out.result_pips = mag;
    else if (out.status === 'Loss')      out.result_pips = mag == null ? null : -mag;
    else if (out.status === 'Breakeven') out.result_pips = 0;
    else                                 out.result_pips = null; // Running
  }
  return out;
}

// ── PUBLIC PROJECTION ─────────────────────────────────────────────────────────
// The public contract deliberately NEVER carries numeric TP/SL — they are
// stripped here, server-side, rather than merely hidden in the page. Hiding
// them in the UI would still ship them in the JSON response, where anyone
// could read them from the network tab.
// Legacy rows (created before the entry-zone migration) carry only
// entry_price; they are surfaced as a zero-width zone so their Entry Zone
// cell renders a real price instead of an em-dash.
export function toPublicSignal(s = {}) {
  const { stop_loss, take_profit, entry_price, ...rest } = s;
  const zs = s.entry_zone_start != null ? s.entry_zone_start : entry_price;
  const ze = s.entry_zone_end   != null ? s.entry_zone_end   : entry_price;
  return { ...rest, entry_zone_start: zs ?? null, entry_zone_end: ze ?? null };
}

export async function createSignal(env, data) {
  const row = sanitize(data);
  if (!row.signal_date || !row.market || !row.signal_type) {
    return { error: 'signal_date, market and signal_type are required' };
  }
  if (row.status === undefined) row.status = 'Running';
  if (row.is_published === undefined) row.is_published = true;
  if (row.tp_sl_mode === undefined) row.tp_sl_mode = 'ztu_bot';
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

  // ── Pips ledger (result_pips is signed: + = won, − = lost) ──
  // winningPips / losingPips are both reported as POSITIVE magnitudes, which
  // is how the page labels them ("Overall Winning Pips" / "Overall Losing
  // Pips"); netPips is the signed bottom line ("Overall Outcome").
  const r1 = (n) => Math.round(n * 10) / 10;
  const pips = signals.map((s) => Number(s.result_pips)).filter(Number.isFinite);
  const winningPips = r1(pips.filter((p) => p > 0).reduce((a, b) => a + b, 0));
  const losingPips  = r1(Math.abs(pips.filter((p) => p < 0).reduce((a, b) => a + b, 0)));
  const netPips     = r1(winningPips - losingPips);

  return {
    total, wins, losses, breakeven, running, decided, winRate, avgRR,
    winningPips, losingPips, netPips,
    pipsRecorded: pips.length,
  };
}
