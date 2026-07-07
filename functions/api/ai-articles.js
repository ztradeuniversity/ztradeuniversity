// functions/api/ai-articles.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE KNOWLEDGE API — admin management + AI retrieval.
//
//   GET  ?action=categories
//        ?action=search&q=&category=&tags=&limit=&offset=|page=   (paginated browse when q is empty)
//        ?action=get&id=<id|slug>
//        ?action=related&id=<id>
//        ?action=ai_context&q=&intent=&lang=        (AI knowledge injection)
//        ?action=list&status=published|draft|all&page=&pageSize=  (admin — Articles Library, graph-linked status enriched)
//   POST {action:create|update|delete|publish|draft|upload_image|delete_image}
//        {action:ai-brief|ai-generate|repair}         (Content Intelligence Center)
//        (admin — requires header  x-admin-key: <AI_ADMIN_KEY>)
//
// Tables: ai_articles, ai_article_images   ·   Bucket: article-images
// Graceful: returns {configured:false} until ZTU Chatbot creds exist.
// Service key stays server-side (article-store.js). Admin key never shipped to client.
//
// PUBLISH VERIFICATION GATE (Content Intelligence Center): `publish` now runs the
// graph sync BEFORE flipping is_active, and only flips it when verifyPublishPipeline
// says every structural check passed — otherwise the row stays a draft with
// status:'pipeline_failed' and a reason, and never regresses an already-live page
// (failure never calls setArticleStatus(false); it simply doesn't call it at all).
// ════════════════════════════════════════════════════════════════════════════

import {
  isConfigured, listArticles, getArticle, createArticle, updateArticle,
  setArticleStatus, deleteArticle, listImages, insertImage, deleteImage, uploadImage,
  countArticles,
} from '../utils/article-store.js';
import { searchArticles, relatedArticles, buildKnowledgeInjection, conceptFromArticle } from '../utils/article-knowledge.js';
import { authorConcept, publishConcept } from '../utils/authoring-workflow.js';
import { strengthenGraphConnections } from '../utils/graph-growth.js';
import { getAnchorEntries } from '../utils/anchor-entries.js';
import { suggestLinks, buildSeoSuggestion } from '../utils/article-enrich.js';
import {
  suggestRelatedArticles, buildInternalLinks, suggestSmartChips,
  buildRecommendationWidget, buildSitemapEntry,
} from '../utils/article-seo.js';
import { isEmbeddingConfigured, embedText, embeddingText, cosineSim } from '../utils/embedding-provider.js';
import { ARTICLE_SEED } from '../utils/article-seed.js';
import {
  ARTICLE_CATEGORIES, ARTICLE_LANGUAGES, isValidCategory,
  slugify, estimateReadingTime,
} from '../utils/article-categories.js';
import { generateArticleMeta } from '../utils/article-autometa.js';
import { generateArticleBrief, generateArticleDraft } from '../utils/composer-llm.js';
import { syncArticleToGraph, retireArticleConcepts, verifyPublishPipeline } from '../utils/article-graph-sync.js';
import { getNodesByIds, getNode, getNeighbors, getNodesByIdPrefix } from '../utils/kb-store.js';
import { requireAdminModule } from '../utils/admin-session.js';
import { logSystemEvent } from '../utils/system-log.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// Accepts an 'articles' OR 'kb' session (mirrors the multi-module allow-list
// ai-kb-admin.js already uses for ['kb','governance']) — the unified Content
// Intelligence Center authenticates once (as 'articles') and needs to call BOTH
// this file and ai-kb-admin.js in the same session; widened symmetrically on
// both sides rather than requiring two separate logins for one page.
function isAdmin(request, env) {
  return requireAdminModule(env, request, ['articles', 'kb'], { header: 'x-admin-key', value: env.AI_ADMIN_KEY });
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
      // ARTICLES LIBRARY (admin) — single place to verify every published article.
      // Paginated; each row is enriched with a real graph-linked signal (one batched
      // kb_nodes lookup, not N round trips) so pipelineStatus reflects requirement 3's
      // published/draft/pipeline_failed distinction honestly rather than guessing from
      // is_active alone.
      if (!(await isAdmin(request, env))) return json({ error: 'admin only' }, 403);
      const status = u.searchParams.get('status') || 'all';
      const category = u.searchParams.get('category') || undefined;
      const page = Math.max(1, parseInt(u.searchParams.get('page') || '1', 10));
      const pageSize = Math.min(parseInt(u.searchParams.get('pageSize') || '100', 10), 200);
      const [articles, total] = await Promise.all([
        listArticles(env, { status, category, limit: pageSize, offset: (page - 1) * pageSize }),
        countArticles(env, { status, category }),
      ]);
      const ids = articles.map(a => `article-${a.id}`);
      const nodes = ids.length ? await getNodesByIds(env, ids) : [];
      const nodeById = new Map(nodes.map(n => [n.id, n]));
      const enriched = articles.map(a => {
        const node = nodeById.get(`article-${a.id}`);
        const graphLinked = !!(node && node.status === 'published');
        // Independent SEO/Knowledge-Graph/Chatbot status (spec Phase 6) — read from
        // the verification snapshot stored at the last publish/repair attempt when
        // available; falls back to the single graphLinked signal for older rows
        // published before last_verification existed (never blank/undefined).
        const lv = a.last_verification && typeof a.last_verification === 'object' ? a.last_verification : null;
        const seoStatus = lv ? !!lv.publicWebsite?.ok : graphLinked;
        const kgStatus = lv ? !!lv.knowledgeGraph?.conceptPublished : graphLinked;
        const chatbotStatus = lv ? !!lv.knowledgeGraph?.chatbotAnswersContextually : graphLinked;
        return {
          ...a, graphLinked, seoStatus, kgStatus, chatbotStatus,
          pipelineStatus: a.is_active ? (graphLinked ? 'published' : 'pipeline_failed') : 'draft',
        };
      });
      return json({ configured: true, articles: enriched, total, page, pageSize });
    }
    if (action === 'search') {
      // q empty → browse mode (Articles Library, public + admin): stable pagination.
      // q present → ranked search (unchanged behavior; offset ignored, as before).
      const page = parseInt(u.searchParams.get('page') || '', 10);
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '5', 10), 100);
      const offset = Number.isFinite(page) && page > 1 ? (page - 1) * limit : (parseInt(u.searchParams.get('offset') || '0', 10) || 0);
      const q = u.searchParams.get('q') || '';
      const category = u.searchParams.get('category') || undefined;
      const results = await searchArticles(env, {
        q, category,
        tags: (u.searchParams.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
        limit, offset,
      });
      const total = !q ? await countArticles(env, { status: 'published', category }) : null;
      return json({ configured: true, results, total, page: Number.isFinite(page) ? page : 1, pageSize: limit });
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
    // ARTICLE STATUS DETAILS (spec) — real stored data only, no new verification
    // run: SEO overrides + the exact computed fallback (same buildSeoSuggestion
    // the publish pipeline uses); Graph node existence/embedding/relationships
    // via kb-store's real getNode/getNeighbors; Chatbot preview from the
    // last_verification snapshot already stored at the last publish/repair
    // (labeled "as of" so it's never mistaken for a live re-check).
    if (action === 'article-detail') {
      if (!(await isAdmin(request, env))) return json({ error: 'admin only' }, 403);
      const id = u.searchParams.get('id');
      const article = await getArticle(env, id);
      if (!article) return json({ error: 'article not found' }, 404);
      const mainNodeId = `article-${article.id}`;
      const mainNode = await getNode(env, mainNodeId).catch(() => null);
      const neighbors = mainNode ? await getNeighbors(env, mainNodeId, [], 8).catch(() => []) : [];
      const chunkNodes = await getNodesByIdPrefix(env, `article-chunk-${article.id}-`).catch(() => []);
      const seoComputed = buildSeoSuggestion(
        { ...(conceptFromArticle(article) || {}), id: article.slug, title: article.title, seo: { description: article.summary || '', keywords: article.tags || [] } },
        { urlPath: article.slug ? `/articles/${article.slug}` : null, overrides: article.seo_overrides || {} }
      );
      return json({
        configured: true,
        seo: { overrides: article.seo_overrides || {}, computed: seoComputed },
        graph: {
          nodeExists: !!mainNode,
          nodeId: mainNode?.id || null,
          status: mainNode?.status || null,
          hasEmbedding: !!(mainNode && mainNode.embedding),
          relatedConcepts: (mainNode && mainNode.related) || [],
          nextSteps: (mainNode && mainNode.nextSteps) || [],
          neighbors: neighbors.map(n => ({ edgeType: n.edgeType, weight: n.weight, id: n.node?.id, title: n.node?.title || n.node?.topic })),
          chunks: { total: chunkNodes.length, published: chunkNodes.filter(c => c.status === 'published').length },
        },
        chatbot: article.last_verification && article.last_verification.knowledgeGraph
          ? {
              probe: article.last_verification.knowledgeGraph.probe || null,
              conceptPublished: article.last_verification.knowledgeGraph.conceptPublished,
              asOf: article.updated_at,
              note: 'From the last publish/repair verification — click Publish or Improve & Republish to refresh.',
            }
          : { note: 'No verification recorded yet — publish or repair this article to generate one.' },
      });
    }
    return json({ error: `unknown action: ${action}` }, 400);
  }

  // ── POST (admin writes) ──────────────────────────────────────────────────────
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await isAdmin(request, env))) return json({ error: 'admin only — missing/invalid x-admin-key' }, 403);
  if (!cfg) return json({ configured: false, saved: false, note: 'AI Supabase not connected yet.' });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const { action, data } = body;

  // ── AUTO MODE (additive) — generate article metadata from pasted content. Returns
  // the suggested fields ONLY; it does NOT persist. The client fills the existing form,
  // then the unchanged create/publish path saves it. Workers AI when bound, deterministic
  // fallback otherwise — so it works even with no AI binding. Manual mode is unaffected.
  if (action === 'auto-meta') {
    const meta = await generateArticleMeta(env, {
      content: (data && data.content) || '',
      overrides: (data && data.overrides) || {},
    });
    return json({ configured: true, meta });
  }

  if (action === 'create' || action === 'update') {
    const d = data || {};
    if (d.category && !isValidCategory(d.category)) return json({ error: 'invalid category' }, 400);

    // Slug uniqueness — reuse getArticle's slug lookup. Append -2, -3, ... until
    // the slug doesn't collide with a DIFFERENT article (a row keeping its own
    // slug on update is not a collision).
    const baseSlug = d.slug || slugify(d.title);
    let slug = baseSlug;
    let suffix = 1;
    while (true) {
      const existing = await getArticle(env, slug);
      if (!existing || existing.id === d.id) break;
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const payload = {
      title:      d.title,
      slug,
      summary:    d.summary || '',
      content:    d.content || '',
      category:   d.category || null,
      tags:       Array.isArray(d.tags) ? d.tags : [],
      difficulty: d.difficulty || 'beginner',
      language:   d.language || 'en',
      author:     d.author || 'ZTU',
      reading_time: estimateReadingTime(d.content),
      is_active:  d.is_active ?? false,   // default DRAFT
      // Manual-mode SEO overrides (seoTitle/h1/metaTitle/metaDescription/canonicalUrl/
      // focusKeyword/secondaryKeywords/ogTitle/ogDescription/twitterCard/externalLinks/
      // schemaOverride) — see supabase/ai-articles-content-center-columns.sql. Blank
      // fields fall back to article-enrich.js's computed defaults (buildSeoSuggestion),
      // never stored twice. Only persisted when the object has keys, so articles saved
      // before this column existed round-trip unchanged.
      seo_overrides: (d.seo_overrides && typeof d.seo_overrides === 'object') ? d.seo_overrides : {},
    };
    const result = action === 'create'
      ? await createArticle(env, { ...payload, created_at: new Date().toISOString() })
      : await updateArticle(env, d.id, payload);
    // article-store.js's sb() already logs the REAL PostgREST error to
    // kb_system_log (Error Center) on failure — this just gives the client a
    // pointer to it instead of a bare "saved:false" with no explanation.
    return json({
      configured: true, saved: !!result, article: result,
      reason: result ? undefined : 'Save failed — the database rejected the write. Check Content Center → Error Center for the exact reason (often a missing column from a pending migration — see supabase/ai-articles-content-center-columns.sql).',
    });
  }

  if (action === 'publish') {
    // VERIFY-THEN-GATE (non-negotiable requirement 3): the graph sync now runs
    // FIRST, while the row is still whatever it was before (draft, or already
    // published if this is a re-publish/repair). Reuses the SAME single-source
    // pipeline as before (syncArticleToGraph → ai-kb-admin's ingest-article
    // builders) — no duplicate logic, just reordered.
    const article = await getArticle(env, data?.id);
    if (!article) return json({ error: 'article not found' }, 404);

    let { graph, ecosystem } = await syncArticleToGraph(env, article);
    let verification = await verifyPublishPipeline(env, { article, graph, ecosystem });

    // RELIABILITY (requirement 4) — one automatic retry on a failed/incomplete
    // graph write before giving up, mirroring the retry-once-on-transient-failure
    // pattern already used for the OpenAI call in composer-llm.js. Resolves the
    // common transient case (a momentary Supabase timeout) with no admin action.
    if (!verification.knowledgeGraph.conceptPublished) {
      ({ graph, ecosystem } = await syncArticleToGraph(env, article));
      verification = await verifyPublishPipeline(env, { article, graph, ecosystem });
    }

    if (verification.ok) {
      const updated = await updateArticle(env, article.id, { is_active: true, last_verification: verification });
      // BUGFIX (found via live testing — "Published" toast but the Library kept
      // showing Draft): this used to report status:'published' unconditionally
      // whenever verification passed, even if the actual database write that
      // flips is_active failed (e.g. PostgREST rejects the whole PATCH with an
      // unknown-column error when a pending migration — like
      // supabase/ai-articles-content-center-columns.sql — hasn't been run yet).
      // The verification result and the database write are two different facts;
      // "published" must only be reported when BOTH are true.
      if (!updated) {
        await logSystemEvent(env, {
          kind: 'publish-write', level: 'error',
          message: `Publish verification passed but the database write (is_active/last_verification) failed for article ${article.id}.`,
          meta: { articleId: article.id, title: article.title },
        }).catch(() => {});
        return json({
          configured: true, status: 'pipeline_failed', article, graph, ecosystem, verification,
          reason: 'Verification passed, but saving the published status to the database failed — the article was NOT published. Check Content Center → Error Center for the exact database error (often a missing column from a pending migration — see supabase/ai-articles-content-center-columns.sql). Safe to retry once fixed.',
        }, 200);
      }
      return json({ configured: true, status: 'published', article: updated, graph, ecosystem, verification });
    }

    // Never touch is_active on failure — a failed re-publish/repair must not take
    // down an already-live page; a brand-new draft simply stays a draft. Still
    // persist last_verification (best-effort) so the Library's status columns and
    // the Error Center can show WHY it failed without re-running the probe.
    try { await updateArticle(env, article.id, { last_verification: verification }); } catch { /* non-fatal */ }
    const reason = !verification.knowledgeGraph.conceptPublished
      ? 'Knowledge graph write did not complete (see graph.authored/graph.published for the exact stage/error).'
      : 'SEO/canonical/sitemap fields incomplete — see verification.publicWebsite for the specific check that failed.';
    return json({
      configured: true, status: 'pipeline_failed', article, graph, ecosystem, verification,
      reason: `Pipeline verification failed: ${reason} Fix the underlying issue and click Publish again — this action is safe to retry.`,
    }, 200);
  }
  if (action === 'draft') {
    const article = await setArticleStatus(env, data?.id, false);
    // Best-effort, non-fatal — retracting the graph concept must never block the
    // unpublish itself (closes the "graph not retracted on unpublish" audit bug).
    if (data?.id) { try { await retireArticleConcepts(env, data.id); } catch { /* logged inside retireArticleConcepts's own try/catch */ } }
    return json({ configured: true, article });
  }
  if (action === 'delete') {
    if (data?.id) { try { await retireArticleConcepts(env, data.id); } catch { /* non-fatal, see above */ } }
    return json({ configured: true, deleted: await deleteArticle(env, data?.id) });
  }

  // ── AI-ASSISTED AUTHORING (Content Intelligence Center, additive) ───────────
  // Step 2 of the 3-step workflow: a bare topic → full metadata/outline/FAQ/
  // image-prompt/internal-link brief, BEFORE any content is written. Reuses the
  // exact same link/FAQ/SEO builders as the publish pipeline (article-enrich.js /
  // article-seo.js), fed by the CURRENT published graph/articles — the same
  // "draft-like object" technique functions/articles/[slug].js already uses for
  // an existing article, just applied one step earlier.
  if (action === 'ai-brief') {
    const topic = ((data && data.topic) || '').trim();
    if (!topic) return json({ error: 'topic required' }, 400);
    const brief = await generateArticleBrief(env, topic, (data && data.overrides) || {});
    const entries = getAnchorEntries();
    const articles = await listArticles(env, { status: 'published', limit: 200 }).catch(() => []);
    const draftLike = { id: brief.slug, category: brief.category, concepts: brief.tags, relevanceTags: brief.tags, level: brief.difficulty };
    const links = suggestLinks(draftLike, entries);
    const relatedArticlesList = suggestRelatedArticles(draftLike, articles);
    const linkedEntries = [...links.related, ...links.nextSteps].map(id => entries.find(e => e.id === id)).filter(Boolean);
    const internalLinks = buildInternalLinks(draftLike, { conceptEntries: linkedEntries, relatedArticles: relatedArticlesList });
    // AUTO KNOWLEDGE CAPTURE — auto-publish policy (spec item 5, explicitly
    // conditional: "if auto-publish policy allows"). Default OFF, same gating
    // pattern as AI_LEARN_ENABLED elsewhere in this codebase — auto-publishing
    // AI-generated content without human review is a real content-quality/
    // liability decision the site owner must explicitly opt into; the existing
    // architecture's review-queue/approval workflow is never bypassed unless
    // this is deliberately turned on.
    const autoPublishAllowed = String(env.AI_AUTO_PUBLISH_CAPTURED_KNOWLEDGE).toLowerCase() === 'true';
    return json({ configured: true, brief, internalLinks, relatedArticles: relatedArticlesList, autoPublishAllowed });
  }

  // Step 2, Option B ("Generate with AI"): brief → full Markdown body via the SAME
  // Workers-AI→OpenAI engine already wired for chat answers (composer-llm.js) —
  // not a second AI system. Never persists; the admin reviews before publishing.
  if (action === 'ai-generate') {
    const brief = (data && data.brief) || {};
    // WORD COUNT SELECTOR (spec Phase 1) — real range, clamped to sane bounds;
    // falls back to the original 700-1100 default when the client sends nothing.
    const wordCountMin = Math.max(50, Math.min(10000, parseInt(data?.wordCountMin, 10) || 700));
    const wordCountMax = Math.max(wordCountMin, Math.min(10000, parseInt(data?.wordCountMax, 10) || 1100));
    const { content, meta } = await generateArticleDraft(env, brief, { wordCountMin, wordCountMax });
    if (!content) return json({ configured: true, generated: false, note: 'AI writing is not configured, or the model call failed — write manually, or try again.', usage: meta });
    // AUDIT DATA (spec: "do not estimate, use real API response usage") — model/
    // generation-time/provider are always real (measured or echoed from the API
    // response). Cost is computed ONLY when both a real token count exists
    // (OpenAI's response includes usage; Workers AI's does not for this model —
    // reported honestly as unavailable, never guessed) AND the admin has
    // configured real per-1K-token pricing via env vars — never a hardcoded/
    // guessed rate, since published prices change over time.
    const usage = { ...meta, costUsd: null, costNote: null };
    if (meta.usage && meta.usage.prompt_tokens != null && env.OPENAI_PRICE_PER_1K_INPUT_USD && env.OPENAI_PRICE_PER_1K_OUTPUT_USD) {
      const inRate = parseFloat(env.OPENAI_PRICE_PER_1K_INPUT_USD);
      const outRate = parseFloat(env.OPENAI_PRICE_PER_1K_OUTPUT_USD);
      if (Number.isFinite(inRate) && Number.isFinite(outRate)) {
        usage.costUsd = ((meta.usage.prompt_tokens / 1000) * inRate) + ((meta.usage.completion_tokens / 1000) * outRate);
      }
    } else if (!meta.usage) {
      usage.costNote = meta.provider === 'workers-ai'
        ? 'Workers AI did not return token usage for this call — cost cannot be computed (never estimated).'
        : 'No token usage available from this provider response.';
    } else {
      usage.costNote = 'Set OPENAI_PRICE_PER_1K_INPUT_USD and OPENAI_PRICE_PER_1K_OUTPUT_USD to compute real cost from the actual token counts above.';
    }
    return json({ configured: true, generated: true, content, usage });
  }

  // AUTOMATIC QUALITY IMPROVEMENT (requirement 4) — one click regenerates weak
  // metadata (thin tags / missing summary) for an EXISTING article via the same
  // brief generator, then re-runs the (now-gated) publish path to resync graph/
  // links/sitemap from current state. No new verification logic beyond §publish.
  if (action === 'repair') {
    const article = await getArticle(env, data?.id);
    if (!article) return json({ error: 'article not found' }, 404);
    const brief = await generateArticleBrief(env, article.title, { category: article.category, difficulty: article.difficulty });
    const patch = {};
    if (!Array.isArray(article.tags) || article.tags.length < 3) patch.tags = brief.tags;
    if (!article.summary || article.summary.length < 40) patch.summary = brief.metaDescription;
    let current = article;
    if (Object.keys(patch).length) current = (await updateArticle(env, article.id, patch)) || article;

    let { graph, ecosystem } = await syncArticleToGraph(env, current);
    let verification = await verifyPublishPipeline(env, { article: current, graph, ecosystem });
    let dbWriteFailed = false;
    if (verification.ok) {
      const updated = await updateArticle(env, current.id, { is_active: true, last_verification: verification });
      // BUGFIX (same class as the publish handler): don't silently fall back to
      // the pre-update `current` and still report verification.ok===true when
      // the actual is_active write failed — the client renders its toast from
      // verification.ok, so this used to say "Improved & republished" even when
      // nothing was actually published.
      if (updated) current = updated; else dbWriteFailed = true;
    } else {
      try { await updateArticle(env, current.id, { last_verification: verification }); } catch { /* non-fatal */ }
    }
    if (dbWriteFailed) {
      await logSystemEvent(env, {
        kind: 'publish-write', level: 'error',
        message: `Repair verification passed but the database write failed for article ${current.id}.`,
        meta: { articleId: current.id, title: current.title },
      }).catch(() => {});
      verification = { ...verification, ok: false };
    }

    return json({
      configured: true, article: current, improved: Object.keys(patch), graph, ecosystem, verification,
      reason: dbWriteFailed ? 'Verification passed, but saving the published status failed — check Error Center for the database error.' : undefined,
    });
  }

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
