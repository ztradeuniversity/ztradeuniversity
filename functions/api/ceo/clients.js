// functions/api/ceo/clients.js  ->  GET/POST /api/ceo/clients
//
// M3 wiring. GET: directory (clients + last touch merged) and stage counts.
// POST actions: add client (writes the initial lead_pipeline transition too),
// log touch, change stage (updates ib_clients AND appends the lead_pipeline
// history row — the two-table contract from 015's design).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

const STAGES = ['lead', 'qualified', 'onboarding', 'activated', 'engaged', 'at_risk', 'retained'];
const TOUCH_TYPES = ['call', 'message', 'meeting', 'email', 'note'];

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [clients, touches] = await Promise.all([
      db.select('ib_clients', `select=id,full_name,contact_email,contact_phone,broker,stage,equity_band,referral_source,notes,created_at&owner_user_id=eq.${uid}&order=created_at.desc&limit=200`),
      db.select('client_touches', `select=ib_client_id,touch_type,summary,occurred_at&owner_user_id=eq.${uid}&order=occurred_at.desc&limit=1000`),
    ]);
    const lastTouch = {};
    for (const t of touches) if (!lastTouch[t.ib_client_id]) lastTouch[t.ib_client_id] = t;
    const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const c of clients) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    return json({
      clients: clients.map((c) => ({ ...c, last_touch: lastTouch[c.id] || null })),
      stageCounts,
    });
  } catch (err) {
    return json({ error: 'clients_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
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
    if (body.action === 'touch') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.client_id || ''))) return json({ error: 'invalid_client_id' }, 400);
      const rows = await db.insert('client_touches', [{
        owner_user_id: uid,
        ib_client_id: body.client_id,
        touch_type: TOUCH_TYPES.includes(body.touch_type) ? body.touch_type : 'note',
        summary: String(body.summary || '').slice(0, 500),
        occurred_at: new Date().toISOString(),
      }]);
      return json({ ok: true, touch: rows[0] });
    }

    if (body.action === 'stage') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.client_id || ''))) return json({ error: 'invalid_client_id' }, 400);
      if (!STAGES.includes(body.stage)) return json({ error: 'invalid_stage' }, 400);
      const current = await db.select('ib_clients', `select=stage&id=eq.${body.client_id}&owner_user_id=eq.${uid}`);
      if (current.length === 0) return json({ error: 'not_found' }, 404);
      if (current[0].stage === body.stage) return json({ ok: true, unchanged: true });
      await db.update('ib_clients', `id=eq.${body.client_id}&owner_user_id=eq.${uid}`, {
        stage: body.stage,
        updated_at: new Date().toISOString(),
      });
      await db.insert('lead_pipeline', [{
        owner_user_id: uid,
        ib_client_id: body.client_id,
        from_stage: current[0].stage,
        to_stage: body.stage,
        notes: String(body.notes || '').slice(0, 300),
      }]);
      return json({ ok: true, from: current[0].stage, to: body.stage });
    }

    // Default action: add client.
    const name = String(body.full_name || '').trim().slice(0, 120);
    if (!name) return json({ error: 'name_required' }, 400);
    const stage = STAGES.includes(body.stage) ? body.stage : 'lead';
    const rows = await db.insert('ib_clients', [{
      owner_user_id: uid,
      full_name: name,
      contact_email: String(body.contact_email || '').slice(0, 200) || null,
      contact_phone: String(body.contact_phone || '').slice(0, 40) || null,
      broker: String(body.broker || 'Exness').slice(0, 40),
      stage,
      equity_band: String(body.equity_band || '').slice(0, 30) || null,
      referral_source: String(body.referral_source || '').slice(0, 120) || null,
      notes: String(body.notes || '').slice(0, 1000) || null,
    }]);
    await db.insert('lead_pipeline', [{
      owner_user_id: uid,
      ib_client_id: rows[0].id,
      from_stage: null,
      to_stage: stage,
      notes: 'initial entry',
    }]);
    return json({ ok: true, client: rows[0] });
  } catch (err) {
    return json({ error: 'clients_write_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
