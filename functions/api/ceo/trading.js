// functions/api/ceo/trading.js  ->  GET/POST /api/ceo/trading
//
// M2 wiring: GET returns rules + recent journal records (+ violation counts);
// POST logs a journal entry. Violations beyond manual logging are a later
// automation (registry: retention.at_risk_flags handles the client side; the
// founder-side violation detector is deliberately not faked here).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { detectRecurringWeakness } from '../../utils/ceo/psychology-logic.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHECKIN_LOOKBACK_DAYS = 14;

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  const reqUrl = new URL(request.url);
  const date = DATE_RE.test(reqUrl.searchParams.get('date') || '')
    ? reqUrl.searchParams.get('date')
    : new Date().toISOString().slice(0, 10);
  const lookbackStart = new Date(Date.now() - CHECKIN_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  try {
    const [rules, records, violations, checkinRows, recentCheckins] = await Promise.all([
      db.select('trading_rules', `select=id,title,description,category,is_active&owner_user_id=eq.${uid}&order=created_at.asc`),
      db.select('trading_records', `select=id,instrument,direction,entry_price,exit_price,outcome,pnl,notes,opened_at,source&owner_user_id=eq.${uid}&order=opened_at.desc.nullslast&limit=50`),
      db.select('rule_violations', `select=id,trading_rule_id,severity,notes,created_at&owner_user_id=eq.${uid}&order=created_at.desc&limit=50`),
      db.select('trading_checkin', `select=*&owner_user_id=eq.${uid}&checkin_date=eq.${date}`),
      db.select('trading_checkin', `select=weakness,checkin_date&owner_user_id=eq.${uid}&checkin_date=gte.${lookbackStart}`),
    ]);
    const todayCheckin = checkinRows[0] || null;
    const recurringWeakness = todayCheckin?.weakness
      ? detectRecurringWeakness(recentCheckins, todayCheckin.weakness)
      : null;
    return json({ rules, records, violations, checkin: { ...todayCheckin, date, recurringWeakness } });
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
    if (body.action === 'checkin') {
      // Personal Trading's 5-question daily check-in — one row per
      // (owner, date), upserted manually (select-then-update-or-insert)
      // since db.js has no native upsert helper.
      const date = DATE_RE.test(String(body.date || '')) ? body.date : new Date().toISOString().slice(0, 10);
      const boolOrNull = (v) => (v === true || v === false ? v : null);
      const patch = {
        analyzed_chart: boolOrNull(body.analyzed_chart),
        took_trade: boolOrNull(body.took_trade),
        followed_rules: boolOrNull(body.followed_rules),
        weakness: String(body.weakness || '').slice(0, 500),
        avoided_repeat: boolOrNull(body.avoided_repeat),
        updated_at: new Date().toISOString(),
      };
      const existing = await db.select('trading_checkin', `select=id&owner_user_id=eq.${uid}&checkin_date=eq.${date}`);
      let row;
      if (existing.length > 0) {
        const rows = await db.update('trading_checkin', `id=eq.${existing[0].id}`, patch);
        row = rows[0];
      } else {
        const rows = await db.insert('trading_checkin', [{ owner_user_id: uid, checkin_date: date, ...patch }]);
        row = rows[0];
      }
      return json({ ok: true, checkin: row });
    }

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
