// functions/api/journal-analyze.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 6 — TRADE AUDIT ENDPOINT
//
// POST { trade, recentTrades? } → { ok:true, analysis }
//
// A thin, stateless wrapper over functions/utils/journal-analysis.js. It holds
// no secrets, touches no database and stores nothing: the browser posts the
// trade it just saved, gets the audit back, and writes it into that trade's
// own `ai_analysis` column through the existing RLS-protected Supabase client
// (auth.uid() = user_id), so a caller can never write to somebody else's row.
//
// It exists purely so the user-facing verdict and the admin-side distributions
// in journal-admin.js are produced by the SAME engine and can never drift.
// ════════════════════════════════════════════════════════════════════════════

import { analyzeTrade } from '../utils/journal-analysis.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// Only the fields the engine actually reads are accepted, so an oversized or
// hostile body can never reach the rules.
function pickTrade(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    id:               t.id ?? null,
    result:           t.result ?? null,
    result_amount:    t.result_amount ?? null,
    pnl:              t.pnl ?? null,
    rr_ratio:         t.rr_ratio ?? null,
    take_profit:      t.take_profit ?? null,
    trade_reason:     typeof t.trade_reason === 'string' ? t.trade_reason.slice(0, 1000) : null,
    confidence_level: t.confidence_level ?? null,
    emotion:          t.emotion ?? null,
    followed_plan:    typeof t.followed_plan === 'boolean' ? t.followed_plan : null,
    followed_risk:    typeof t.followed_risk === 'boolean' ? t.followed_risk : null,
    created_at:       t.created_at ?? null,
  };
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const trade = pickTrade(body?.trade);
  if (!trade) return json({ ok: false, error: 'trade_required' }, 400);

  // Context for the overtrading / revenge-window rules AND the recurring-
  // mistake detector (ai_primary_code — the PRIMARY weakness this same engine
  // already stored on each past trade, so no extra scoring pass over history
  // is needed). Capped: these rules only look at same-day / a 60-min window /
  // the last 10 trades, so 200 rows is ample.
  const recentTrades = Array.isArray(body?.recentTrades)
    ? body.recentTrades.slice(0, 200).map((r) => ({
        id:              r?.id ?? null,
        result:          r?.result ?? null,
        pnl:             r?.pnl ?? null,
        created_at:      r?.created_at ?? null,
        ai_primary_code: typeof r?.ai_primary_code === 'string' ? r.ai_primary_code : null,
      }))
    : [];

  try {
    return json({ ok: true, analysis: analyzeTrade(trade, { recentTrades }) });
  } catch {
    // The audit must never be able to block a trade from being saved.
    return json({ ok: false, error: 'analysis_failed' }, 500);
  }
}
