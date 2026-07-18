// functions/api/ceo/growth.js  ->  GET/POST/PATCH-via-POST /api/ceo/growth
//
// M4 wiring: content kanban (content_library), campaigns table. Publishing to
// the live ZTU site remains a founder action through the warehouse workflow —
// this endpoint only tracks status (the locked Integration Blueprint boundary).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { CONTENT_IDEA_BANK } from '../../utils/ceo/content-ideas.js';

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
    // Load the 300+ curated idea bank into the pipeline (Task 1). Inserts
    // ONLY titles not already present (case-insensitive) so it coexists with
    // founder ideas and never duplicates — safe to run more than once.
    if (body.action === 'seed_ideas') {
      const existing = await db.select('content_library', `select=title&owner_user_id=eq.${uid}&limit=2000`);
      const have = new Set(existing.map((c) => String(c.title || '').trim().toLowerCase()));
      const toAdd = CONTENT_IDEA_BANK.filter((i) => !have.has(i.title.toLowerCase()));
      if (toAdd.length === 0) return json({ ok: true, added: 0, total: existing.length, message: 'Idea bank already loaded — no duplicates added.' });
      // Insert in chunks to keep each request small.
      let added = 0;
      for (let i = 0; i < toAdd.length; i += 100) {
        const chunk = toAdd.slice(i, i + 100).map((idea) => ({
          owner_user_id: uid,
          title: idea.title.slice(0, 200),
          pillar: idea.pillar,
          content_type: 'video+article',
          status: 'idea',
          notes: '#BANK#',
        }));
        const rows = await db.insert('content_library', chunk);
        added += rows.length;
      }
      return json({ ok: true, added });
    }

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

    // Edit a content idea (title / pillar / type / audience / notes). notes
    // carries the meta tag the frontend builds (language, country, platform,
    // hook, CTA, and manual priority via `prio`), so priority and all other
    // fields round-trip through this one field without a schema change.
    if (body.action === 'edit') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ''))) return json({ error: 'invalid_id' }, 400);
      const patch = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) {
        const t = String(body.title || '').trim().slice(0, 200);
        if (!t) return json({ error: 'title_required' }, 400);
        patch.title = t;
      }
      if (body.pillar !== undefined) patch.pillar = String(body.pillar || '').slice(0, 40);
      if (body.content_type !== undefined) patch.content_type = String(body.content_type || '').slice(0, 40);
      if (body.target_audience !== undefined) patch.target_audience = String(body.target_audience || '').slice(0, 60) || null;
      if (body.notes !== undefined) patch.notes = String(body.notes || '').slice(0, 500) || null;
      const rows = await db.update('content_library', `id=eq.${body.id}&owner_user_id=eq.${uid}`, patch);
      if (!rows || rows.length === 0) return json({ error: 'not_found' }, 404);
      return json({ ok: true, item: rows[0] });
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
