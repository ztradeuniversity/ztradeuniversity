// functions/api/ceo/kpis.js  ->  GET/POST /api/ceo/kpis
//
// M1 wiring: GET returns definitions with their latest two values (trend);
// POST records a manual value for a KPI for a date (upsert-style: one manual
// value per kpi/date enforced by the 007 unique constraint — a re-entry for
// the same day is treated as a correction via update).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [defs, hist] = await Promise.all([
      db.select('kpi_definitions', 'select=id,key,label,category,unit,target_direction,description&is_active=eq.true&order=category.asc,key.asc'),
      db.select('kpi_history', `select=kpi_id,value,recorded_for,source&owner_user_id=eq.${uid}&order=recorded_for.desc&limit=500`),
    ]);
    const byKpi = {};
    for (const h of hist) (byKpi[h.kpi_id] ||= []).push(h);
    const kpis = defs.map((d) => ({
      ...d,
      latest: byKpi[d.id]?.[0] ?? null,
      previous: byKpi[d.id]?.[1] ?? null,
    }));
    return json({ kpis });
  } catch (err) {
    return json({ error: 'kpis_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
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
    if (!/^[0-9a-f-]{36}$/i.test(String(body.kpi_id || ''))) return json({ error: 'invalid_kpi_id' }, 400);
    const value = parseFloat(body.value);
    if (!Number.isFinite(value)) return json({ error: 'invalid_value' }, 400);
    const recordedFor = /^\d{4}-\d{2}-\d{2}$/.test(String(body.recorded_for || ''))
      ? body.recorded_for
      : new Date().toISOString().slice(0, 10);

    // Correction semantics: same kpi+date+manual -> update, else insert (007's
    // UPDATE-allowed / no-DELETE design).
    const existing = await db.select(
      'kpi_history',
      `select=id&owner_user_id=eq.${uid}&kpi_id=eq.${body.kpi_id}&recorded_for=eq.${recordedFor}&source=eq.manual`
    );
    if (existing.length > 0) {
      await db.update('kpi_history', `id=eq.${existing[0].id}`, { value, notes: String(body.notes || '').slice(0, 300) || null });
      return json({ ok: true, corrected: true });
    }
    await db.insert('kpi_history', [{
      owner_user_id: uid,
      kpi_id: body.kpi_id,
      recorded_for: recordedFor,
      value,
      source: 'manual',
      notes: String(body.notes || '').slice(0, 300) || null,
    }]);
    return json({ ok: true });
  } catch (err) {
    return json({ error: 'kpis_write_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
