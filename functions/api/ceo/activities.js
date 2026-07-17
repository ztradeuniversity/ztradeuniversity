// functions/api/ceo/activities.js  ->  POST /api/ceo/activities
//
// Complete, partially-complete, or skip a mission item; record the shutdown
// note. Founder OS Restructure Step 3 adds the 'partial' state + optional
// real_minutes/note on any status change — daily_activities.status is frozen
// to ('pending','completed','skipped') so 'partial' stays DB status='pending'
// with the richer state carried in the exec tag (utils/ceo/db.js), the same
// no-new-column pattern Step 2 established for skip reasons, now unified.
// Returns a coaching line per the seeded mentor rules so the UI responds like
// a mentor, not a form.

import { rest, json, requireFounder, withExecTag } from '../../utils/ceo/db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Settings upsert — same select-then-update-or-insert pattern institutes.js
// established for physical.start_date (settings has no unique key to upsert
// against through PostgREST).
async function upsertSetting(db, key, value) {
  // Raw value — the REST helper serializes once; JSON.stringify here would
  // double-encode into a jsonb string (readers tolerate it, but the Growth
  // page's queue.map crash came from exactly this pattern in institutes.js).
  const existing = await db.select('settings', `select=id&scope=eq.global&key=eq.${key}`);
  if (existing.length > 0) {
    await db.update('settings', `id=eq.${existing[0].id}`, { value, updated_at: new Date().toISOString() });
  } else {
    await db.insert('settings', [{ scope: 'global', key, value }]);
  }
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

const SKIP_COACHING = {
  no_time: 'Theek hai. Agar hafte mein 3 baar "no time" ho to plan waqt se bara hai — Optional tier kaatne ka waqt hoga.',
  blocked: 'Note ho gaya — review mein blocker ke taur par aayega.',
  avoided: 'Imandari ki daad. Jo cheez talti hai, aksar wahi sab se zyada kaam karti hai — kal isko #1 rakhein?',
  not_relevant: 'Samajh gaya — agar yeh bar bar irrelevant ho to template review karenge.',
};

const PARTIAL_COACHING = 'Kuch ho gaya, mukammal nahin — theek hai. Baaqi kal ka pehla item ban sakta hai, ya abhi wapas jaayein.';

// DB-level status for each founder-facing exec state — 'partial' has no DB
// enum member, so it stays 'pending' at the row level (honest: not complete)
// while the tag carries the richer state.
const DB_STATUS = { completed: 'completed', skipped: 'skipped', partial: 'pending' };

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
    // Submit Leave: store the period, close out the plan around it. Two-phase
    // when work is still open before the leave starts: the first call returns
    // needsConfirmation ("Was this activity completed?") and applies nothing;
    // the retry carries prior_complete true (mark them completed — continue
    // fresh after leave) or false (leave them pending — they resurface as the
    // resume point after leave). Pending rows INSIDE the leave window are
    // skipped so a leave day can never sit as overdue, and mission.js skips
    // instantiation on leave days going forward.
    if (body.action === 'submit_leave') {
      const start = String(body.start_date || '');
      const end = String(body.end_date || '');
      if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
        return json({ error: 'invalid_leave_dates' }, 400);
      }
      const reason = String(body.reason || '').slice(0, 200);

      const pendingBefore = await db.select(
        'daily_activities',
        `select=id,activity_date&owner_user_id=eq.${uid}&status=eq.pending&activity_date=lt.${start}&order=activity_date.desc&limit=100`
      );
      if (pendingBefore.length > 0 && typeof body.prior_complete !== 'boolean') {
        return json({
          ok: false,
          needsConfirmation: true,
          pendingCount: pendingBefore.length,
          lastPendingDate: pendingBefore[0].activity_date,
        });
      }
      if (pendingBefore.length > 0 && body.prior_complete === true) {
        await db.update(
          'daily_activities',
          `owner_user_id=eq.${uid}&status=eq.pending&activity_date=lt.${start}`,
          { status: 'completed', completed_at: new Date().toISOString() }
        );
      }
      await db.update(
        'daily_activities',
        `owner_user_id=eq.${uid}&status=eq.pending&activity_date=gte.${start}&activity_date=lte.${end}`,
        { status: 'skipped' }
      );

      const settings = await db.select('settings', `select=key,value&scope=eq.global&key=eq.leave.periods`);
      const periods = asArray(settings[0]?.value);
      periods.push({ start, end, reason });
      await upsertSetting(db, 'leave.periods', periods);

      return json({
        ok: true,
        coaching: `Leave darj — ${start} se ${end} tak koi task schedule nahin hoga; plan khud aage shift ho jayega. Aaram se aayein.`,
      });
    }

    // Reset Plan: today becomes Day 1. The roadmap is generated from
    // plan.start_date (plan-logic.js) and the area cycle from
    // physical.start_date, so resetting both anchors regenerates the entire
    // future with zero row writes; old open items are closed out honestly as
    // skipped (never deleted — no-hard-deletes rule).
    if (body.action === 'reset_plan') {
      const today = new Date().toISOString().slice(0, 10);
      await upsertSetting(db, 'plan.start_date', today);
      await upsertSetting(db, 'physical.start_date', today);
      await db.update(
        'daily_activities',
        `owner_user_id=eq.${uid}&status=eq.pending&activity_date=lt.${today}`,
        { status: 'skipped' }
      );
      return json({ ok: true, coaching: 'Plan reset — aaj Day 1 hai. Purana backlog band, poora roadmap aaj se dobara shuru.' });
    }

    // Shutdown note: its own activity row, completed immediately.
    if (body.action === 'shutdown_note') {
      const note = String(body.note || '').slice(0, 500);
      await db.insert('daily_activities', [{
        owner_user_id: uid,
        activity_date: new Date().toISOString().slice(0, 10),
        activity_type: 'daily.shutdown_note',
        description: note,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }]);
      return json({ ok: true, coaching: 'Shukriya — kal ka plan isi se behtar banta hai. Kal milte hain.' });
    }

    const id = String(body.id || '');
    const execState = ['completed', 'skipped', 'partial'].includes(body.status) ? body.status : 'completed';
    const dbStatus = DB_STATUS[execState];
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'invalid_id' }, 400);

    const rows = await db.select(
      'daily_activities',
      `select=id,description,activity_type&id=eq.${id}&owner_user_id=eq.${uid}`
    );
    if (rows.length === 0) return json({ error: 'not_found' }, 404);

    const realMinutes = Number.isFinite(parseFloat(body.real_minutes)) ? parseFloat(body.real_minutes) : null;
    let note = String(body.note || '').slice(0, 300);
    let reason = null;
    if (execState === 'skipped') {
      reason = ['no_time', 'blocked', 'avoided', 'not_relevant'].includes(body.reason) ? body.reason : 'no_time';
      if (!note) note = reason;
    }

    const patch = { status: dbStatus };
    if (execState === 'completed') patch.completed_at = new Date().toISOString();
    patch.description = withExecTag(rows[0].description, execState, realMinutes, note);
    await db.update('daily_activities', `id=eq.${id}&owner_user_id=eq.${uid}`, patch);

    const coaching =
      execState === 'completed' ? completionLine(rows[0].activity_type)
      : execState === 'partial' ? PARTIAL_COACHING
      : SKIP_COACHING[reason] || SKIP_COACHING.no_time;
    return json({ ok: true, coaching });
  } catch (err) {
    return json({ error: 'activity_update_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}

function completionLine(type) {
  if (type === 'weekly.film_video') return 'Video ho gayi — engine ko khana mil gaya. Agla multiplier: publish chain.';
  if (type === 'weekly.live_class') return 'Class ho gayi — ritual qaim hai. Replay TG par pin karna na bhoolein.';
  if (type === 'daily.community_touch') return 'Community ka haq ada hua. Culture presence se banta hai.';
  if (type === 'daily.core_block') return 'Core block done — spine barqarar.';
  return 'Ho gaya. Agla sab se ooncha item list mein tayyar hai.';
}
