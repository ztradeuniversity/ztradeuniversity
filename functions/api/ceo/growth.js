// functions/api/ceo/growth.js  ->  GET/POST/PATCH-via-POST /api/ceo/growth
//
// M4 wiring: content kanban (content_library), campaigns table. Publishing to
// the live ZTU site remains a founder action through the warehouse workflow —
// this endpoint only tracks status (the locked Integration Blueprint boundary).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

const STATUSES = ['idea', 'production', 'published', 'evergreen', 'retired'];

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [content, campaigns, tasks] = await Promise.all([
      db.select('content_library', `select=id,title,pillar,content_type,status,target_audience,published_url,notes&owner_user_id=eq.${uid}&order=created_at.asc&limit=300`),
      db.select('marketing_campaigns', `select=id,name,channel,status,budget,start_date&owner_user_id=eq.${uid}&order=created_at.desc&limit=50`),
      db.select('growth_tasks', `select=id,title,status,due_date&owner_user_id=eq.${uid}&status=neq.done&order=due_date.asc.nullslast&limit=50`),
    ]);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, []]));
    for (const c of content) (byStatus[c.status] || byStatus.idea).push(c);
    return json({ content: byStatus, campaigns, tasks });
  } catch (err) {
    return json({ error: 'growth_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
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
    if (body.action === 'move') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ''))) return json({ error: 'invalid_id' }, 400);
      if (!STATUSES.includes(body.status)) return json({ error: 'invalid_status' }, 400);
      const patch = { status: body.status, updated_at: new Date().toISOString() };
      if (body.status === 'published' && body.published_url) {
        patch.published_url = String(body.published_url).slice(0, 300);
      }
      const rows = await db.update('content_library', `id=eq.${body.id}&owner_user_id=eq.${uid}`, patch);
      return json({ ok: true, item: rows[0] || null });
    }

    // Default: new idea.
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return json({ error: 'title_required' }, 400);
    const rows = await db.insert('content_library', [{
      owner_user_id: uid,
      title,
      pillar: String(body.pillar || 'fundamentals').slice(0, 40),
      content_type: String(body.content_type || 'video+article').slice(0, 40),
      status: 'idea',
      target_audience: String(body.target_audience || '').slice(0, 60) || null,
      notes: String(body.notes || '').slice(0, 500) || null,
    }]);
    return json({ ok: true, item: rows[0] });
  } catch (err) {
    return json({ error: 'growth_write_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
