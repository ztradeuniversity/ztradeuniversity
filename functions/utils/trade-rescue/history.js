// functions/utils/trade-rescue/history.js
// ── HISTORICAL / OHLC ────────────────────────────────────────────────────────
// Extracted VERBATIM from functions/api/rescue-assess.js so the AI CEO OS
// Today Update (functions/api/ceo/today-update.js) reuses Rescue's exact
// history fetch — same endpoint, same retry rule, same notes — instead of a
// second copy. rescue-assess.js imports it from here; its behaviour is
// unchanged.
//
// Its own endpoint so a plan restriction there degrades this one section rather
// than the whole assessment.
import { INSTRUMENTS } from './case.js';

export async function collectHistory(origin, instrument, dates) {
  const out = { status: 'unavailable', note: null, candles: [], closes: [], volatility: null, dateContext: [] };
  const ins = INSTRUMENTS.find(i => i.id === instrument);
  if (!ins || !ins.live) { out.note = 'Historical context is offered only for instruments the live feed also covers.'; return out; }
  try {
    const qs = new URLSearchParams({ symbol: instrument, interval: '1day', outputsize: '60' });
    if (dates.length) qs.set('dates', dates.join(','));
    const url = `${origin}/api/market-history?${qs}`;
    // Same retry-once-on-transient-failure rule as collectEvidence()'s
    // getJson(): a 5xx or network/timeout error gets one retry; a definitive
    // 4xx (plan restriction, bad request) does not, since retrying it cannot
    // succeed differently.
    const attempt = () => fetch(url, { signal: AbortSignal.timeout(9000) }).catch(() => null);
    let r = await attempt();
    if (!r || (!r.ok && r.status >= 500)) r = await attempt();
    if (!r) { out.note = 'Historical market data could not be independently verified: the market-history endpoint did not respond.'; return out; }
    if (!r.ok) { out.note = `Historical market data could not be independently verified (HTTP ${r.status}).`; return out; }
    const d = await r.json();
    if (d.status !== 'verified') { out.note = d.note || 'Historical market data could not be independently verified.'; return out; }
    out.status = 'verified';
    out.candles = d.candles || [];
    out.closes = out.candles.map(c => c.close);
    out.volatility = d.volatility || null;
    out.dateContext = d.dateContext || [];
    out.source = d.source; out.retrievedAt = d.retrievedAt;
    out.firstAt = d.firstAt; out.lastAt = d.lastAt;
  } catch (e) {
    out.note = `Historical market data could not be independently verified: ${String(e.message || e).slice(0, 140)}`;
  }
  return out;
}
