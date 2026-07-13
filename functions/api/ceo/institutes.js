// functions/api/ceo/institutes.js  ->  GET/POST /api/ceo/institutes
//
// Institute CRM + 15-day area cycle (Physical IB Expansion patch). GET
// returns the cycle state (computed by utils/ceo/physical-logic.js from
// the physical.* settings) plus the institute pipeline with today's due
// follow-ups first. POST actions: start_cycle (writes physical.start_date —
// global settings are admin-writable and the founder is admin), add an
// institute, advance its stage, set follow-up/batch dates. Stage values
// mirror migration 032's CHECK constraint exactly.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { currentAreaAssignment } from '../../utils/ceo/physical-logic.js';
import { instituteNextStep, pipelineSummary } from '../../utils/ceo/coach-logic.js';

const STAGES = [
  'cold_contact', 'proposal_sent', 'meeting', 'negotiation',
  'accepted', 'rejected', 'classes_running', 'batch_complete', 'follow_up_later',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

async function readCycle(db) {
  const settings = await db.select('settings', `select=key,value&scope=eq.global&key=in.(physical.city,physical.cycle_days,physical.area_queue,physical.start_date)`);
  const get = (k) => settings.find((s) => s.key === k)?.value;
  const queue = get('physical.area_queue') || [];
  const cycleDays = Number(get('physical.cycle_days') || 15);
  const startDate = get('physical.start_date') ? String(get('physical.start_date')).replace(/"/g, '') : null;
  const city = String(get('physical.city') || '"Lahore"').replace(/"/g, '');
  return { city, cycleDays, queue, startDate, assignment: currentAreaAssignment(queue, startDate, cycleDays) };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [cycle, institutes, salesRows] = await Promise.all([
      readCycle(db),
      db.select('institutes', `select=id,name,institute_type,city,area,contact_name,contact_phone,stage,next_follow_up,batch_end_date,students_registered,notes,updated_at&owner_user_id=eq.${uid}&order=updated_at.desc&limit=300`),
      db.select('knowledge_base', `select=title,content&owner_user_id=eq.${uid}&category=eq.sales-template`),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const followUpsDue = institutes.filter((i) => i.next_follow_up && i.next_follow_up <= today && i.stage !== 'rejected');

    // Coaching layer (Business Execution patch): per-institute next action +
    // the current-area pipeline summary. All derived from real stage rows;
    // the full negotiation text is the seeded sales-template, returned as
    // salesGuidance so the UI never carries a second copy.
    const withCoaching = institutes.map((i) => ({ ...i, nextStep: instituteNextStep(i.stage) }));
    const summary = pipelineSummary(institutes, cycle?.assignment?.current || null);
    const salesGuidance = Object.fromEntries(salesRows.map((r) => [r.title, r.content]));

    return json({ cycle, institutes: withCoaching, followUpsDue, summary, salesGuidance });
  } catch (err) {
    return json({ error: 'institutes_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
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
    if (body.action === 'start_cycle') {
      // Anchor the rotation to today (or a provided date). Upsert into the
      // one designed config home; date math does the rest forever.
      const start = DATE_RE.test(String(body.start_date || '')) ? body.start_date : new Date().toISOString().slice(0, 10);
      const existing = await db.select('settings', `select=id&scope=eq.global&key=eq.physical.start_date`);
      if (existing.length > 0) {
        await db.update('settings', `id=eq.${existing[0].id}`, { value: JSON.stringify(start), updated_at: new Date().toISOString() });
      } else {
        await db.insert('settings', [{ scope: 'global', key: 'physical.start_date', value: JSON.stringify(start) }]);
      }
      const cycle = await readCycle(db);
      return json({ ok: true, cycle });
    }

    if (body.action === 'update') {
      if (!UUID_RE.test(String(body.id || ''))) return json({ error: 'invalid_id' }, 400);
      const patch = { updated_at: new Date().toISOString() };
      if (body.stage !== undefined) {
        if (!STAGES.includes(body.stage)) return json({ error: 'invalid_stage' }, 400);
        patch.stage = body.stage;
      }
      if (body.next_follow_up !== undefined) {
        patch.next_follow_up = DATE_RE.test(String(body.next_follow_up || '')) ? body.next_follow_up : null;
      }
      if (body.batch_end_date !== undefined) {
        patch.batch_end_date = DATE_RE.test(String(body.batch_end_date || '')) ? body.batch_end_date : null;
      }
      if (body.students_registered !== undefined) {
        const n = parseInt(body.students_registered, 10);
        patch.students_registered = Number.isFinite(n) && n >= 0 ? n : null;
      }
      if (body.notes !== undefined) patch.notes = String(body.notes || '').slice(0, 1000);
      const rows = await db.update('institutes', `id=eq.${body.id}&owner_user_id=eq.${uid}`, patch);
      if (rows.length === 0) return json({ error: 'not_found' }, 404);
      return json({ ok: true, institute: rows[0] });
    }

    // Default action: add institute.
    const name = String(body.name || '').trim().slice(0, 160);
    if (!name) return json({ error: 'name_required' }, 400);
    const cycle = await readCycle(db);
    const rows = await db.insert('institutes', [{
      owner_user_id: uid,
      name,
      institute_type: String(body.institute_type || '').slice(0, 60) || null,
      city: String(body.city || cycle.city).slice(0, 60),
      area: String(body.area || cycle.assignment.current || '').slice(0, 80),
      contact_name: String(body.contact_name || '').slice(0, 120) || null,
      contact_phone: String(body.contact_phone || '').slice(0, 40) || null,
      stage: STAGES.includes(body.stage) ? body.stage : 'cold_contact',
      next_follow_up: DATE_RE.test(String(body.next_follow_up || '')) ? body.next_follow_up : null,
      notes: String(body.notes || '').slice(0, 1000) || null,
    }]);
    return json({ ok: true, institute: rows[0] });
  } catch (err) {
    return json({ error: 'institutes_write_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
