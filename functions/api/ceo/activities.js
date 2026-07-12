// functions/api/ceo/activities.js  ->  POST /api/ceo/activities
//
// Complete or skip a mission item; record the shutdown note. Skip reasons are
// appended to the row's description (schema frozen — no dedicated column; the
// coaching engine parses "| skipped:<reason>" back out). Returns a coaching
// line per the seeded mentor rules so the UI can respond like a mentor, not a
// form.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

const SKIP_COACHING = {
  no_time: 'Theek hai. Agar hafte mein 3 baar "no time" ho to plan waqt se bara hai — Optional tier kaatne ka waqt hoga.',
  blocked: 'Note ho gaya — review mein blocker ke taur par aayega.',
  avoided: 'Imandari ki daad. Jo cheez talti hai, aksar wahi sab se zyada kaam karti hai — kal isko #1 rakhein?',
  not_relevant: 'Samajh gaya — agar yeh bar bar irrelevant ho to template review karenge.',
};

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
    const status = body.status === 'skipped' ? 'skipped' : 'completed';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'invalid_id' }, 400);

    const rows = await db.select(
      'daily_activities',
      `select=id,description,activity_type&id=eq.${id}&owner_user_id=eq.${uid}`
    );
    if (rows.length === 0) return json({ error: 'not_found' }, 404);

    const patch = { status };
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    if (status === 'skipped') {
      const reason = ['no_time', 'blocked', 'avoided', 'not_relevant'].includes(body.reason)
        ? body.reason
        : 'no_time';
      patch.description = `${rows[0].description || ''} | skipped:${reason}`;
    }
    await db.update('daily_activities', `id=eq.${id}&owner_user_id=eq.${uid}`, patch);

    const coaching =
      status === 'completed'
        ? completionLine(rows[0].activity_type)
        : SKIP_COACHING[body.reason] || SKIP_COACHING.no_time;
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
