// functions/api/ceo/institutes.js  ->  GET/POST /api/ceo/institutes
//
// Institute CRM + 15-day area cycle (Physical IB Expansion patch). GET
// returns the cycle state (computed by utils/ceo/physical-logic.js from
// the physical.* settings) plus the institute pipeline with today's due
// follow-ups first. POST actions: start_cycle (writes physical.start_date),
// reorder_queue (Refinement Patch 4 — founder-set execution order, same-set
// permutation only, never regenerated), add an institute, advance its
// stage, set follow-up/batch dates. Global settings are admin-writable and
// the founder is admin. Stage values mirror migration 032's CHECK exactly.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { currentAreaAssignment, regionSummary } from '../../utils/ceo/physical-logic.js';
import { instituteNextStep, pipelineSummary } from '../../utils/ceo/coach-logic.js';

const STAGES = [
  'cold_contact', 'proposal_sent', 'meeting', 'negotiation',
  'accepted', 'rejected', 'classes_running', 'batch_complete', 'follow_up_later',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
// Soft-delete marker (see the 'archive' action) — archived institutes keep
// their row but drop out of the working pipeline.
const ARCHIVE_TAG = '#ARCHIVED#';

// settings.value is jsonb; rows written before the double-encoding fix below
// may hold a JSON-encoded STRING instead of a real array — normalize both so
// every consumer (this endpoint, growth-page.js, plan.js) always gets an
// array and never crashes on queue.map.
function asQueueArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

async function readCycle(db) {
  const settings = await db.select('settings', `select=key,value&scope=eq.global&key=in.(physical.city,physical.cycle_days,physical.area_queue,physical.start_date)`);
  const get = (k) => settings.find((s) => s.key === k)?.value;
  const queue = asQueueArray(get('physical.area_queue') || []);
  const cycleDays = Number(get('physical.cycle_days') || 15);
  const startDate = get('physical.start_date') ? String(get('physical.start_date')).replace(/"/g, '') : null;
  const city = String(get('physical.city') || '"Lahore"').replace(/"/g, '');
  const assignment = currentAreaAssignment(queue, startDate, cycleDays);
  return { city, cycleDays, queue, startDate, assignment, region: regionSummary(queue, assignment, cycleDays) };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [cycle, allInstitutes, salesRows] = await Promise.all([
      readCycle(db),
      db.select('institutes', `select=id,name,institute_type,city,area,contact_name,contact_phone,stage,next_follow_up,batch_end_date,students_registered,notes,updated_at&owner_user_id=eq.${uid}&order=updated_at.desc&limit=300`),
      db.select('knowledge_base', `select=title,content&owner_user_id=eq.${uid}&category=eq.sales-template`),
    ]);
    // Archived (soft-deleted) institutes stay in the DB but never appear in
    // the working pipeline, counts, or follow-up list.
    const institutes = allInstitutes.filter((i) => !String(i.notes || '').startsWith(ARCHIVE_TAG));
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
      // Raw value, not JSON.stringify — the REST helper already serializes
      // the body once; stringifying here double-encodes and stores a jsonb
      // STRING (the bug that broke queue.map on the Growth page).
      const existing = await db.select('settings', `select=id&scope=eq.global&key=eq.physical.start_date`);
      if (existing.length > 0) {
        await db.update('settings', `id=eq.${existing[0].id}`, { value: start, updated_at: new Date().toISOString() });
      } else {
        await db.insert('settings', [{ scope: 'global', key: 'physical.start_date', value: start }]);
      }
      const cycle = await readCycle(db);
      return json({ ok: true, cycle });
    }

    if (body.action === 'reorder_queue') {
      // Founder-set execution order (Refinement Patch 4) — accepted ONLY as
      // a permutation of the CURRENT queue. The sequence is never
      // regenerated: adding/removing/renaming an entry through this action
      // is rejected, so a typo can't silently drop a city from the plan.
      const newOrder = Array.isArray(body.order) ? body.order.map(String) : null;
      if (!newOrder || newOrder.length === 0) return json({ error: 'invalid_order' }, 400);
      const current = await readCycle(db);
      const sameSet = newOrder.length === current.queue.length
        && [...newOrder].sort().join('') === [...current.queue].sort().join('');
      if (!sameSet) return json({ error: 'order_must_be_a_permutation_of_the_current_queue' }, 400);
      const existing = await db.select('settings', `select=id&scope=eq.global&key=eq.physical.area_queue`);
      if (existing.length === 0) return json({ error: 'queue_not_seeded' }, 404);
      await db.update('settings', `id=eq.${existing[0].id}`, { value: newOrder, updated_at: new Date().toISOString() });
      const cycle = await readCycle(db);
      return json({ ok: true, cycle });
    }

    if (body.action === 'edit_queue') {
      // Live, freeform plan editing (Final Refinement Patch) — the
      // founder's document editor: add/remove/rename/reorder in one save,
      // no SQL, no restart. Unlike reorder_queue this is NOT restricted to
      // a same-set permutation (a founder-typed area like "Cantt" is a
      // legitimate real neighborhood the founder is adding themselves, not
      // an invented institute — that restriction is about institute NAMES,
      // never about the founder's own area list). Every module that reads
      // physical.area_queue fetches it fresh per-request, so this is live
      // immediately on the next call — no cache to invalidate.
      const raw = Array.isArray(body.areas) ? body.areas : null;
      if (!raw) return json({ error: 'invalid_areas' }, 400);
      const cleaned = [...new Set(raw.map((s) => String(s || '').trim()).filter(Boolean))].map((s) => s.slice(0, 80));
      if (cleaned.length === 0) return json({ error: 'areas_cannot_be_empty' }, 400);
      const existing = await db.select('settings', `select=id&scope=eq.global&key=eq.physical.area_queue`);
      if (existing.length > 0) {
        await db.update('settings', `id=eq.${existing[0].id}`, { value: cleaned, updated_at: new Date().toISOString() });
      } else {
        await db.insert('settings', [{ scope: 'global', key: 'physical.area_queue', value: cleaned }]);
      }
      const cycle = await readCycle(db);
      return json({ ok: true, cycle });
    }

    if (body.action === 'update') {
      if (!UUID_RE.test(String(body.id || ''))) return json({ error: 'invalid_id' }, 400);
      const patch = { updated_at: new Date().toISOString() };
      // Editable identity + contact fields (full CRUD). Rename/area/type/
      // contact were previously insert-only; now patchable so the founder can
      // fix a typo or update a phone number without re-adding the institute.
      if (body.name !== undefined) {
        const nm = String(body.name || '').trim().slice(0, 160);
        if (!nm) return json({ error: 'name_required' }, 400);
        patch.name = nm;
      }
      if (body.institute_type !== undefined) patch.institute_type = String(body.institute_type || '').slice(0, 60) || null;
      if (body.area !== undefined) patch.area = String(body.area || '').slice(0, 80);
      if (body.city !== undefined) patch.city = String(body.city || '').slice(0, 60);
      if (body.contact_name !== undefined) patch.contact_name = String(body.contact_name || '').slice(0, 120) || null;
      if (body.contact_phone !== undefined) patch.contact_phone = String(body.contact_phone || '').slice(0, 40) || null;
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

    // Delete an institute — implemented as a SOFT delete (archive) because
    // migration 032 has no DELETE policy by the project's no-hard-deletes
    // rule. The record is kept (so "never repeat an area unless scheduled"
    // stays queryable) but tagged with ARCHIVE_TAG in notes, which the GET
    // filters out of the working pipeline. Zero SQL, no schema change.
    if (body.action === 'archive') {
      if (!UUID_RE.test(String(body.id || ''))) return json({ error: 'invalid_id' }, 400);
      const existing = await db.select('institutes', `select=notes&id=eq.${body.id}&owner_user_id=eq.${uid}`);
      if (existing.length === 0) return json({ error: 'not_found' }, 404);
      const prior = String(existing[0].notes || '');
      const notes = prior.startsWith(ARCHIVE_TAG) ? prior : `${ARCHIVE_TAG} ${prior}`.slice(0, 1000);
      const rows = await db.update('institutes', `id=eq.${body.id}&owner_user_id=eq.${uid}`, { notes, updated_at: new Date().toISOString() });
      if (rows.length === 0) return json({ error: 'not_found' }, 404);
      return json({ ok: true, archived: true });
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
