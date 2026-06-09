// functions/api/ai-articles.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE KNOWLEDGE API — admin management + AI retrieval.
//
//   GET  ?action=categories
//        ?action=search&q=&category=&tags=
//        ?action=get&id=<id|slug>
//        ?action=related&id=<id>
//        ?action=ai_context&q=&intent=&lang=        (AI knowledge injection)
//        ?action=list&status=published|draft|all    (admin)
//   POST {action:create|update|delete|publish|draft|upload_image|delete_image}
//        (admin — requires header  x-admin-key: <AI_ADMIN_KEY>)
//
// Tables: ai_articles, ai_article_images   ·   Bucket: article-images
// Graceful: returns {configured:false} until ZTU Chatbot creds exist.
// Service key stays server-side (article-store.js). Admin key never shipped to client.
// ════════════════════════════════════════════════════════════════════════════

import {
  isConfigured, listArticles, getArticle, createArticle, updateArticle,
  setArticleStatus, deleteArticle, listImages, insertImage, deleteImage, uploadImage,
} from '../utils/article-store.js';
import { searchArticles, relatedArticles, buildKnowledgeInjection, conceptFromArticle } from '../utils/article-knowledge.js';
import { authorConcept, publishConcept } from '../utils/authoring-workflow.js';
import { ARTICLE_SEED } from '../utils/article-seed.js';
import {
  ARTICLE_CATEGORIES, ARTICLE_LANGUAGES, isValidCategory,
  slugify, estimateReadingTime,
} from '../utils/article-categories.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

function isAdmin(request, env) {
  const provided = request.headers.get('x-admin-key') || '';
  return !!env.AI_ADMIN_KEY && provided === env.AI_ADMIN_KEY;
}

function decodeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const contentType = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { contentType, bytes };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const u = new URL(request.url);
  const cfg = isConfigured(env);

  // ── GET (reads) ────────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const action = u.searchParams.get('action') || 'search';

    if (action === 'categories') {
      return json({ categories: ARTICLE_CATEGORIES, languages: ARTICLE_LANGUAGES });
    }
    if (!cfg) return json({ configured: false, results: [], note: 'AI Supabase (ZTU Chatbot) not connected yet.' });

    if (action === 'list') {
      if (!isAdmin(request, env)) return json({ error: 'admin only' }, 403);
      const status = u.searchParams.get('status') || 'all';
      return json({ configured: true, articles: await listArticles(env, { status, category: u.searchParams.get('category') || undefined }) });
    }
    if (action === 'search') {
      const results = await searchArticles(env, {
        q: u.searchParams.get('q') || '',
        category: u.searchParams.get('category') || undefined,
        tags: (u.searchParams.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
        limit: Math.min(parseInt(u.searchParams.get('limit') || '5', 10), 20),
      });
      return json({ configured: true, results });
    }
    if (action === 'get') {
      const id = u.searchParams.get('id');
      const article = await getArticle(env, id);
      if (!article) return json({ configured: true, article: null }, 404);
      return json({ configured: true, article, images: await listImages(env, article.id) });
    }
    if (action === 'related') {
      return json({ configured: true, ...(await relatedArticles(env, u.searchParams.get('id'))) });
    }
    if (action === 'ai_context') {
      return json({ configured: true, ...(await buildKnowledgeInjection(env, {
        query: u.searchParams.get('q') || '',
        intent: u.searchParams.get('intent') || null,
        lang: u.searchParams.get('lang') || 'en',
      })) });
    }
    return json({ error: `unknown action: ${action}` }, 400);
  }

  // ── POST (admin writes) ──────────────────────────────────────────────────────
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!isAdmin(request, env)) return json({ error: 'admin only — missing/invalid x-admin-key' }, 403);
  if (!cfg) return json({ configured: false, saved: false, note: 'AI Supabase not connected yet.' });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const { action, data } = body;

  if (action === 'create' || action === 'update') {
    const d = data || {};
    if (d.category && !isValidCategory(d.category)) return json({ error: 'invalid category' }, 400);
    const payload = {
      title:      d.title,
      slug:       d.slug || slugify(d.title),
      summary:    d.summary || '',
      content:    d.content || '',
      category:   d.category || null,
      tags:       Array.isArray(d.tags) ? d.tags : [],
      difficulty: d.difficulty || 'beginner',
      language:   d.language || 'en',
      author:     d.author || 'ZTU',
      reading_time: estimateReadingTime(d.content),
      is_active:  d.is_active ?? false,   // default DRAFT
    };
    const result = action === 'create'
      ? await createArticle(env, { ...payload, created_at: new Date().toISOString() })
      : await updateArticle(env, d.id, payload);
    return json({ configured: true, saved: !!result, article: result });
  }

  if (action === 'publish') {
    const article = await setArticleStatus(env, data?.id, true);
    // ARTICLE → GRAPH (best-effort, non-blocking, draft-only). A published article
    // contributes an ai_draft concept to kb_nodes via the EXISTING authoring pipeline
    // (KOS gate → dedup → review). It is NOT auto-published — an operator promotes it
    // in KB Admin — so this can never overwrite the live graph or break article saving.
    if (article) {
      const kos = conceptFromArticle(article);
      if (kos) {
        context.waitUntil(
          authorConcept(env, kos, { origin: 'article', autoSubmit: true }).catch(() => {})
        );
      }
    }
    return json({ configured: true, article, graphDraft: !!article });
  }
  if (action === 'draft')   return json({ configured: true, article: await setArticleStatus(env, data?.id, false) });
  if (action === 'delete')  return json({ configured: true, deleted: await deleteArticle(env, data?.id) });

  if (action === 'upload_image') {
    const { articleId, filename, dataUrl, caption, alt, tags } = data || {};
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return json({ error: 'invalid image dataUrl' }, 400);
    const safe = (filename || 'image.png').replace(/[^a-z0-9._-]/gi, '_').slice(-60);
    const path = `${articleId || 'misc'}/${Date.now()}-${safe}`;
    const publicUrl = await uploadImage(env, path, decoded.bytes, decoded.contentType);
    if (!publicUrl) return json({ error: 'upload failed' }, 502);
    const row = await insertImage(env, {
      url: publicUrl, kind: 'educational-screenshot', caption: caption || '', alt_text: alt || '',
      tags: Array.isArray(tags) ? tags : [], article_id: articleId || null,
    });
    return json({ configured: true, image: row, url: publicUrl });
  }

  if (action === 'delete_image') return json({ configured: true, deleted: await deleteImage(env, data?.id) });

  // ── PHASE 2.2 — BULK SEO ARTICLE IMPORT (admin). Idempotent by slug. Each seed
  // article is published to ai_articles AND pushed into the knowledge graph as a
  // PUBLISHED concept (curated seed = pre-approved), so the chatbot can answer from
  // Articles + Concepts immediately. Re-running updates in place (no duplicates).
  if (action === 'import-articles') {
    const results = [];
    for (const seed of ARTICLE_SEED) {
      try {
        const existing = await getArticle(env, seed.slug);
        const payload = {
          title: seed.title, slug: seed.slug, summary: seed.summary || '', content: seed.content || '',
          category: seed.category || null, tags: Array.isArray(seed.tags) ? seed.tags : [],
          difficulty: seed.difficulty || 'beginner', language: seed.language || 'en',
          author: seed.author || 'ZTU', reading_time: estimateReadingTime(seed.content), is_active: true,
        };
        const article = existing
          ? await updateArticle(env, existing.id, payload)
          : await createArticle(env, { ...payload, created_at: new Date().toISOString() });
        let graphPublished = false;
        if (article) {
          const kos = conceptFromArticle(article);
          if (kos) { const p = await publishConcept(env, kos, 'article-seed').catch(() => null); graphPublished = !!(p && p.ok); }
        }
        results.push({ slug: seed.slug, action: existing ? 'updated' : 'created', saved: !!article, graphPublished });
      } catch (e) {
        results.push({ slug: seed.slug, error: String((e && e.message) || e) });
      }
    }
    const saved = results.filter(r => r.saved).length;
    const graphed = results.filter(r => r.graphPublished).length;
    return json({ configured: true, total: ARTICLE_SEED.length, saved, graphPublished: graphed, results });
  }

  return json({ error: `unknown action: ${action}` }, 400);
}
