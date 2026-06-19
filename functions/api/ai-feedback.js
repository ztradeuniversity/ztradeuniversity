// functions/api/ai-feedback.js
// ════════════════════════════════════════════════════════════════════════════
// ANSWER RATING SYSTEM (Production Upgrade — Part B). Thumbs up/down on AI chat
// answers, persisted to the AI Supabase project (same project as kb_*/ai_*
// tables — no new infra). Public POST (rate an answer you just received);
// admin-only GET (x-admin-key === AI_ADMIN_KEY, same gate as ai-kb-admin.js)
// for analytics — most liked/disliked, like/dislike counts, approval %.
//
// Table: ai_chat_feedback (see SQL in the production report). Graceful: every
// call no-ops to {ok:false, configured:false} until AI_SUPABASE_URL/
// AI_SUPABASE_SERVICE_KEY are set and the table exists — never breaks chat.
// ════════════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: JSON_H }); }

function isConfigured(env) { return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY); }

async function sb(env, method, table, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = {
      apikey: env.AI_SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    };
    const res = await fetch(`${env.AI_SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    if (prefer === 'return=minimal' || method === 'DELETE') return true;
    return res.json().catch(() => null);
  } catch { return null; }
}

function normRating(r) {
  const s = String(r || '').toLowerCase();
  if (s === 'like' || s === 'up' || s === 'thumbs_up' || s === 'good') return 'like';
  if (s === 'dislike' || s === 'down' || s === 'thumbs_down' || s === 'bad') return 'dislike';
  return null;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_H });

  // ── POST — record a like/dislike for one answer ──────────────────────────
  if (request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
    const rating = normRating(body?.rating);
    const answer = String(body?.answer || '').trim();
    if (!rating || !answer) return json({ error: 'rating ("like"|"dislike") and answer are required' }, 400);
    if (!isConfigured(env)) return json({ ok: false, configured: false, note: 'AI Supabase not configured — feedback not persisted' });

    const row = {
      question: String(body?.question || '').slice(0, 1000),
      answer: answer.slice(0, 4000),
      rating,
      lang: String(body?.lang || 'en').slice(0, 10),
      user_id: body?.userId ? String(body.userId).slice(0, 200) : null,
      topic: body?.topic ? String(body.topic).slice(0, 200) : null,
      created_at: new Date().toISOString(),
    };
    const ok = await sb(env, 'POST', 'ai_chat_feedback', null, row, 'return=minimal');
    return json({ ok: !!ok, configured: true });
  }

  // ── GET — admin analytics (most liked/disliked, counts, approval %) ──────
  if (request.method === 'GET') {
    if (!env.AI_ADMIN_KEY || request.headers.get('x-admin-key') !== env.AI_ADMIN_KEY) {
      return json({ error: 'unauthorized' }, 401);
    }
    if (!isConfigured(env)) return json({ configured: false, items: [], totals: { likes: 0, dislikes: 0, approval: null } });

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 2000);
    const rows = await sb(env, 'GET', 'ai_chat_feedback', `order=created_at.desc&limit=${limit}`, null, null) || [];

    // Group by answer text (so repeated identical answers aggregate like/dislike counts).
    const byAnswer = new Map();
    let likes = 0, dislikes = 0;
    for (const r of rows) {
      if (r.rating === 'like') likes++; else if (r.rating === 'dislike') dislikes++;
      const key = r.answer;
      if (!byAnswer.has(key)) byAnswer.set(key, { answer: r.answer, question: r.question, topic: r.topic, lang: r.lang, likes: 0, dislikes: 0 });
      const g = byAnswer.get(key);
      if (r.rating === 'like') g.likes++; else if (r.rating === 'dislike') g.dislikes++;
    }
    const items = [...byAnswer.values()].map(g => ({
      ...g,
      total: g.likes + g.dislikes,
      approval: (g.likes + g.dislikes) ? Math.round((g.likes / (g.likes + g.dislikes)) * 100) : null,
    }));

    const mostLiked = [...items].sort((a, b) => b.likes - a.likes).slice(0, 10);
    const mostDisliked = [...items].filter(i => i.dislikes > 0).sort((a, b) => b.dislikes - a.dislikes).slice(0, 10);

    // Improvement insights: which TOPIC/LANGUAGE combos are failing most (disliked answers).
    const byTopicLang = new Map();
    for (const r of rows) {
      if (r.rating !== 'dislike') continue;
      const key = `${r.topic || 'uncategorized'}::${r.lang || 'en'}`;
      byTopicLang.set(key, (byTopicLang.get(key) || 0) + 1);
    }
    const failingTopics = [...byTopicLang.entries()]
      .map(([key, count]) => { const [topic, lang] = key.split('::'); return { topic, lang, dislikes: count }; })
      .sort((a, b) => b.dislikes - a.dislikes).slice(0, 10);

    return json({
      configured: true,
      scanned: rows.length,
      totals: { likes, dislikes, approval: (likes + dislikes) ? Math.round((likes / (likes + dislikes)) * 100) : null },
      mostLiked, mostDisliked, failingTopics,
    });
  }

  return json({ error: 'method not allowed' }, 405);
}
