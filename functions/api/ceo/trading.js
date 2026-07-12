// functions/api/ceo/trading.js  ->  GET/POST /api/ceo/trading
//
// M2 wiring: GET returns rules + recent journal records (+ violation counts);
// POST logs a journal entry. Violations beyond manual logging are a later
// automation (registry: retention.at_risk_flags handles the client side; the
// founder-side violation detector is deliberately not faked here).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [rules, records, violations] = await Promise.all([
      db.select('trading_rules', `select=id,title,description,category,is_active&owner_user_id=eq.${uid}&order=created_at.asc`),
      db.select('trading_records', `select=id,instrument,direction,entry_price,exit_price,outcome,pnl,notes,opened_at,source&owner_user_id=eq.${uid}&order=opened_at.desc.nullslast&limit=50`),
      db.select('rule_violations', `select=id,trading_rule_id,severity,notes,created_at&owner_user_id=eq.${uid}&order=created_at.desc&limit=50`),
    ]);
    return json({ rules, records, violations });
  } catch (err) {
    return json({ error: 'trading_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  try {
    if (body.action === 'violation') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.trading_rule_id || ''))) return json({ error: 'invalid_rule_id' }, 400);
      const rows = await db.insert('rule_violations', [{
        owner_user_id: uid,
        trading_rule_id: body.trading_rule_id,
        trading_record_id: /^[0-9a-f-]{36}$/i.test(String(body.trading_record_id || '')) ? body.trading_record_id : null,
        severity: ['minor', 'major', 'critical'].includes(body.severity) ? body.severity : 'minor',
        notes: String(body.notes || '').slice(0, 500),
      }]);
      return json({ ok: true, violation: rows[0] });
    }

    // Default action: journal entry.
    const instrument = String(body.instrument || '').trim().slice(0, 30);
    const direction = body.direction === 'short' ? 'short' : 'long';
    if (!instrument) return json({ error: 'instrument_required' }, 400);
    const outcome = ['win', 'loss', 'breakeven', 'open'].includes(body.outcome) ? body.outcome : 'open';
    const rows = await db.insert('trading_records', [{
      owner_user_id: uid,
      instrument,
      direction,
      entry_price: numOrNull(body.entry_price),
      exit_price: numOrNull(body.exit_price),
      position_size: numOrNull(body.position_size),
      opened_at: body.opened_at || new Date().toISOString(),
      closed_at: outcome === 'open' ? null : body.closed_at || new Date().toISOString(),
      outcome,
      pnl: numOrNull(body.pnl),
      notes: String(body.notes || '').slice(0, 1000),
      source: 'manual',
    }]);
    return json({ ok: true, record: rows[0] });
  } catch (err) {
    return json({ error: 'trading_write_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}

function numOrNull(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
