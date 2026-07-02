// functions/utils/article-store.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE DATA LAYER — self-contained Supabase REST access for the knowledge
// ingestion system. SERVER-SIDE ONLY (service key never reaches the client).
//
// Tables:  ai_articles · ai_article_images   (canonical — no new tables)
// Bucket:  article-images                    (existing storage bucket)
//
// Independent of ai-supabase.js by design (does NOT modify the protected
// AI Supabase Integration). Every call no-ops gracefully until ZTU Chatbot
// credentials (AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY) are configured.
// ════════════════════════════════════════════════════════════════════════════

export const ARTICLE_BUCKET = 'article-images';

export function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

function hdr(env, extra = {}) {
  const key = env.AI_SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}
function rest(env, table, qs = '') {
  return `${env.AI_SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
}

async function sb(env, method, table, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const headers = hdr(env, prefer ? { Prefer: prefer } : {});
    const res = await fetch(rest(env, table, qs), {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      if (env.DEBUG === 'true') console.error(`[article-store] ${method} ${table} ${res.status}: ${(await res.text().catch(()=>'')) .slice(0,200)}`);
      return null;
    }
    if (method === 'DELETE' || prefer === 'return=minimal') return true;
    return await res.json();
  } catch (e) {
    if (env.DEBUG === 'true') console.error('[article-store] error', e.message);
    return null;
  }
}

// ── ARTICLES ─────────────────────────────────────────────────────────────────
export async function listArticles(env, { status, category, limit = 100 } = {}) {
  let qs = `order=updated_at.desc&limit=${limit}`;
  if (status === 'published') qs += '&is_active=eq.true';
  if (status === 'draft')     qs += '&is_active=eq.false';
  if (category)               qs += `&category=eq.${encodeURIComponent(category)}`;
  const rows = await sb(env, 'GET', 'ai_articles', qs, null, null);
  return Array.isArray(rows) ? rows : [];
}

export async function getArticle(env, idOrSlug) {
  if (!idOrSlug) return null;
  const byId = /^[0-9a-f-]{36}$/i.test(idOrSlug) ? 'id' : 'slug';
  const rows = await sb(env, 'GET', 'ai_articles', `${byId}=eq.${encodeURIComponent(idOrSlug)}&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Candidate fetch for search (filtered set; ranking done in article-knowledge.js)
export async function searchCandidates(env, { category, tags, limit = 40 } = {}) {
  let qs = `is_active=eq.true&order=updated_at.desc&limit=${limit}`;
  if (category)     qs += `&category=eq.${encodeURIComponent(category)}`;
  if (tags?.length) qs += `&tags=ov.{${tags.map(t => encodeURIComponent(t)).join(',')}}`;
  const rows = await sb(env, 'GET', 'ai_articles', qs, null, null);
  return Array.isArray(rows) ? rows : [];
}

export async function createArticle(env, data) {
  const rows = await sb(env, 'POST', 'ai_articles', null,
    { ...data, updated_at: new Date().toISOString() }, 'return=representation');
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

export async function updateArticle(env, id, data) {
  if (!id) return null;
  const rows = await sb(env, 'PATCH', 'ai_articles', `id=eq.${encodeURIComponent(id)}`,
    { ...data, updated_at: new Date().toISOString() }, 'return=representation');
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

export async function setArticleStatus(env, id, isActive) {
  return updateArticle(env, id, { is_active: !!isActive });
}

export async function deleteArticle(env, id) {
  if (!id) return false;
  // remove images first (FK is set-null, but we also clean storage refs)
  await sb(env, 'DELETE', 'ai_article_images', `article_id=eq.${encodeURIComponent(id)}`, null, 'return=minimal');
  return await sb(env, 'DELETE', 'ai_articles', `id=eq.${encodeURIComponent(id)}`, null, 'return=minimal');
}

// ── IMAGES ───────────────────────────────────────────────────────────────────
export async function listImages(env, articleId) {
  if (!articleId) return [];
  const rows = await sb(env, 'GET', 'ai_article_images',
    `article_id=eq.${encodeURIComponent(articleId)}&order=created_at.asc`, null, null);
  return Array.isArray(rows) ? rows : [];
}

export async function insertImage(env, meta) {
  const rows = await sb(env, 'POST', 'ai_article_images', null,
    { created_at: new Date().toISOString(), ...meta }, 'return=representation');
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

export async function deleteImage(env, id) {
  if (!id) return false;
  return await sb(env, 'DELETE', 'ai_article_images', `id=eq.${encodeURIComponent(id)}`, null, 'return=minimal');
}

// ── STORAGE (article-images bucket) ──────────────────────────────────────────
// Uploads raw bytes to the bucket and returns the public URL. Server-side only.
export async function uploadImage(env, path, bytes, contentType = 'image/png') {
  if (!isConfigured(env)) return null;
  try {
    const url = `${env.AI_SUPABASE_URL}/storage/v1/object/${ARTICLE_BUCKET}/${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: env.AI_SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      if (env.DEBUG === 'true') console.error('[article-store] upload failed', res.status);
      return null;
    }
    return `${env.AI_SUPABASE_URL}/storage/v1/object/public/${ARTICLE_BUCKET}/${path}`;
  } catch (e) {
    if (env.DEBUG === 'true') console.error('[article-store] upload error', e.message);
    return null;
  }
}
