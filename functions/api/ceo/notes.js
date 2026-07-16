// functions/api/ceo/notes.js  ->  GET/POST /api/ceo/notes
//
// Founder Notes for the Complete Plan viewer (Final Refinement Patch) — one
// freeform note per plan/domain (countries, languages, platforms, funnel,
// physical, tools, roadmap, automation). Reuses knowledge_base exactly as
// designed (generic category/title/content, owner-scoped RLS already in
// place) under a new category value — zero new tables, zero new columns,
// zero migration. GET returns all notes keyed by domain; POST upserts one.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

const CATEGORY = 'founder-note';
const DOMAINS = ['countries', 'languages', 'platforms', 'funnel', 'physical', 'tools', 'roadmap', 'automation'];

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const rows = await db.select('knowledge_base', `select=title,content,updated_at&owner_user_id=eq.${uid}&category=eq.${CATEGORY}`);
    return json({ notes: Object.fromEntries(rows.map((r) => [r.title, { content: r.content, updatedAt: r.updated_at }])) });
  } catch (err) {
    return json({ error: 'notes_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
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
    const domain = String(body.domain || '');
    if (!DOMAINS.includes(domain)) return json({ error: 'invalid_domain' }, 400);
    const content = String(body.content || '').slice(0, 4000);
    const existing = await db.select('knowledge_base', `select=id&owner_user_id=eq.${uid}&category=eq.${CATEGORY}&title=eq.${domain}`);
    if (existing.length > 0) {
      await db.update('knowledge_base', `id=eq.${existing[0].id}`, { content, updated_at: new Date().toISOString() });
    } else {
      await db.insert('knowledge_base', [{ owner_user_id: uid, category: CATEGORY, title: domain, content, source_type: 'experience' }]);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: 'notes_save_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
