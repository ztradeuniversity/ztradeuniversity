// functions/utils/pattern-stats.js
// ════════════════════════════════════════════════════════════════════════════
// HISTORICAL PATTERN STATISTICS (Module 3) + PATTERN VAULT RETRIEVAL (Module 2)
// + PATTERN LEARNING / AGGREGATION (Module 5).
//
//   ai_chart_analyses  ──aggregate──▶  ai_pattern_vault  ──read──▶  explanation
//
// Self-contained Supabase REST (server-side, service key) — does NOT modify the
// protected AI Supabase Integration. Educational only; never a signal. No
// schema redesign — reads/writes existing canonical tables.
// ════════════════════════════════════════════════════════════════════════════

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
    const res = await fetch(rest(env, table, qs), { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(6000) });
    if (!res.ok) { if (env.DEBUG === 'true') console.error(`[pattern-stats] ${method} ${table} ${res.status}`); return null; }
    if (method === 'DELETE' || prefer === 'return=minimal') return true;
    return await res.json();
  } catch (e) { if (env.DEBUG === 'true') console.error('[pattern-stats]', e.message); return null; }
}

// ── MODULE 2 — read pattern stats from ai_pattern_vault ──────────────────────
export async function getPatternStats(env, patternKey, instrument = 'ALL') {
  if (!isConfigured(env) || !patternKey) return null;
  const rows = await sb(env, 'GET', 'ai_pattern_vault',
    `pattern_key=eq.${encodeURIComponent(patternKey)}&instrument=in.(${instrument},ALL)&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// ── MODULE 3 — format historical statistics (uncertainty-framed, no certainty) ─
export function formatHistoricalStats(stats, label) {
  if (!stats || (stats.occurrences == null && stats.sample_size == null)) return '';
  const occ = stats.occurrences ?? stats.sample_size ?? 0;
  if (occ < 5) {
    return `\n**📊 Historical record (${label || stats.pattern_key}):** only ${occ} sample(s) so far — too few to read into. The dataset grows as more charts are analysed.`;
  }
  const win = stats.win_rate != null ? `${Math.round(stats.win_rate)}%` : '—';
  const loss = stats.loss_rate != null ? `${Math.round(stats.loss_rate)}%` : '—';
  const move = stats.avg_move != null ? `${Number(stats.avg_move).toFixed(1)}%` : '—';
  return `\n**📊 Historical record (${label || stats.pattern_key}):**\n` +
    `- Occurrences observed: **${occ}**\n` +
    `- Continuation/"played-out" rate: **${win}**${stats.loss_rate != null ? ` · failed: ${loss}` : ''}\n` +
    `- Average subsequent move: **${move}**\n` +
    `_These are historical frequencies from our dataset — **not a prediction or guarantee** of what this chart will do._`;
}

// ── MODULE 5 — live contribution: every analysis bumps the pattern's count ────
export async function contributePattern(env, patternKey, { instrument = 'ALL' } = {}) {
  if (!isConfigured(env) || !patternKey) return null;
  const existing = await getPatternStats(env, patternKey, instrument);
  if (existing) {
    return sb(env, 'PATCH', 'ai_pattern_vault', `pattern_key=eq.${encodeURIComponent(patternKey)}`,
      { occurrences: (existing.occurrences ?? 0) + 1, sample_size: (existing.sample_size ?? 0) + 1, last_seen: new Date().toISOString() },
      'return=minimal');
  }
  return sb(env, 'POST', 'ai_pattern_vault', null,
    { pattern_key: patternKey, instrument, occurrences: 1, sample_size: 1, last_seen: new Date().toISOString() },
    'resolution=merge-duplicates,return=minimal');
}

// ── MODULE 5 — aggregation layer: ai_chart_analyses → ai_pattern_vault ───────
// Recomputes occurrences + win/loss/avg_move from analyses that have an outcome.
// Outcomes are tagged later (operator/price-check); rows without outcome only
// contribute to occurrences. Intended to run via an admin/cron trigger.
const SUCCESS = new Set(['continued', 'played-out', 'played_out', 'target-hit', 'target_hit', 'success']);
const FAILURE = new Set(['failed', 'reversed', 'fakeout', 'invalidated', 'fail']);

export async function aggregateFromAnalyses(env, { sinceDays = 120, limit = 2000 } = {}) {
  if (!isConfigured(env)) return { configured: false, updated: 0 };
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const rows = await sb(env, 'GET', 'ai_chart_analyses',
    `created_at=gte.${since}&order=created_at.desc&limit=${limit}`, null, null);
  if (!Array.isArray(rows)) return { configured: true, updated: 0 };

  const acc = {}; // key → { occ, win, loss, moveSum, moveN }
  for (const r of rows) {
    const pats = Array.isArray(r.patterns) ? r.patterns : [];
    const outcome = (r.outcome || '').toLowerCase();
    const move = typeof r.move_pct === 'number' ? r.move_pct : null;
    for (const p of pats) {
      const k = p.key || p.type; if (!k) continue;
      const a = acc[k] || (acc[k] = { occ: 0, win: 0, loss: 0, moveSum: 0, moveN: 0 });
      a.occ++;
      if (SUCCESS.has(outcome)) a.win++;
      else if (FAILURE.has(outcome)) a.loss++;
      if (move != null) { a.moveSum += Math.abs(move); a.moveN++; }
    }
  }

  let updated = 0;
  for (const [k, a] of Object.entries(acc)) {
    const decided = a.win + a.loss;
    const payload = {
      pattern_key: k, instrument: 'ALL',
      occurrences: a.occ, sample_size: a.occ,
      win_rate:  decided ? Math.round((a.win / decided) * 100) : null,
      loss_rate: decided ? Math.round((a.loss / decided) * 100) : null,
      avg_move:  a.moveN ? +(a.moveSum / a.moveN).toFixed(2) : null,
      last_seen: new Date().toISOString(),
    };
    const res = await sb(env, 'POST', 'ai_pattern_vault', null, payload, 'resolution=merge-duplicates,return=minimal');
    if (res) updated++;
  }
  return { configured: true, updated, patterns: Object.keys(acc).length, scanned: rows.length };
}
