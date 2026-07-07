// functions/utils/article-graph-sync.js
// ════════════════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH for "published article → knowledge graph + SEO ecosystem".
//
// This is the EXACT logic that previously lived inline in the /api/ai-articles
// `publish` action, extracted verbatim so it can be reused — NOT re-implemented —
// by both (a) the operator publish action and (b) auto-promotion of learned drafts.
// There is no parallel graph path: everything funnels through conceptFromArticle →
// authorConcept → publishConcept → strengthenGraphConnections (kb_nodes/edges), with
// embeddings attached by authoring-workflow when KB_EMBEDDINGS_ENABLED. Best-effort:
// the article is already live via is_active before this runs, so any failure here is
// non-fatal. Returns { graph, ecosystem } (both null when no concept could be built).
// ════════════════════════════════════════════════════════════════════════════

import { conceptFromArticle } from './article-knowledge.js';
import { getAnchorEntries } from './anchor-entries.js';
import { listArticles } from './article-store.js';
import { isEmbeddingConfigured, embedText, embeddingText, cosineSim } from './embedding-provider.js';
import { suggestLinks, buildSeoSuggestion } from './article-enrich.js';
import {
  suggestRelatedArticles, buildInternalLinks, suggestSmartChips,
  buildRecommendationWidget, buildSitemapEntry,
} from './article-seo.js';
import { authorConcept, publishConcept } from './authoring-workflow.js';
import { strengthenGraphConnections } from './graph-growth.js';
import { chunkConceptsFromArticle } from './article-chunker.js';
import { logSystemEvent } from './system-log.js';
import { retire } from './review-runtime.js';
import { getNodesByIdPrefix } from './kb-store.js';
import { retrieveBest } from './graph-retrieval.js';
import { classifyIntent } from './intent-engine.js';
import { relevanceEngine, enforceRelevance } from './relevance-engine.js';

export async function syncArticleToGraph(env, article) {
  let graph = null, ecosystem = null;
  if (!article) return { graph, ecosystem };
  const kos = conceptFromArticle(article);
  if (!kos) return { graph, ecosystem };
  try {
    const entries = getAnchorEntries();
    const articles = await listArticles(env, { status: 'published', limit: 200 }).catch(() => []);

    // PHASE E reuse (dormant unless KB_EMBEDDINGS_ENABLED + configured).
    let embedScores = null;
    if (env.KB_EMBEDDINGS_ENABLED === 'true' && isEmbeddingConfigured(env)) {
      const draftVec = await embedText(env, embeddingText({ data: kos, ...kos })).catch(() => null);
      if (draftVec) {
        embedScores = {};
        for (const e of [...entries, ...articles]) {
          const vec = e.embedding || (e.data && e.data.embedding);
          if (vec) embedScores[e.id] = cosineSim(draftVec, vec);
        }
      }
    }

    // STAGE 1 — auto-link into the existing graph (related/nextSteps/recommendedArticles).
    const links = suggestLinks(kos, entries, { embedScores });
    kos.related = links.related;
    kos.nextSteps = links.nextSteps;
    const relatedArticles = suggestRelatedArticles(kos, articles, { embedScores });
    kos.recommendedArticles = relatedArticles.map(a => a.id);

    // STAGE 2/3 — author (KOS gate + dedup, unchanged), then publish straight to
    // the live graph (STRICT re-validation + syncEdges, unchanged). A 'merged'
    // decision already upserted+synced the survivor — nothing further to publish.
    const authored = await authorConcept(env, kos, { origin: 'article', autoSubmit: false });
    let published = null, strengthen = null;
    if (authored.ok && authored.action !== 'merged') {
      published = await publishConcept(env, kos, 'article-publish');
      // STAGE 4 — reciprocal edges so existing concepts point forward to this article.
      if (published.ok) strengthen = await strengthenGraphConnections(env, kos);
    }
    graph = { authored, published, strengthen };
    // conceptFromArticle hardcodes status:'ai_draft' (correct pre-publish); reflect
    // reality here so downstream builders (buildSitemapEntry's readyForSitemap, which
    // gates on status==='published') see the true post-publish state instead of a
    // permanently-stale draft flag. Merged content counts too — the survivor concept
    // it was folded into is itself published.
    if (published?.ok || authored.action === 'merged') kos.status = 'published';

    // STAGE 1 (cont.) — SEO/FAQ/smart chips/internal links/recommendation widget/
    // sitemap entry, same builders + shapes as ai-kb-admin's ingest-article.
    const linkedEntries = [...links.related, ...links.nextSteps]
      .map(id => entries.find(e => e.id === id)).filter(Boolean);
    const urlPath = article.slug ? `/articles/${article.slug}` : null;
    // Inject the article's own summary/tags as `.seo`, exactly matching the enrichment
    // functions/articles/[slug].js already applies at request time — conceptFromArticle
    // never populates `.seo` itself, so without this, ogDescription/keywordsCsv here
    // would always compute empty even though the live page renders real values from
    // article.summary/article.tags. One source of truth for what "SEO fields" means.
    const seoSuggestion = buildSeoSuggestion({ ...kos, seo: { description: article.summary || '', keywords: article.tags || [] } }, { urlPath });
    const internalLinks = buildInternalLinks(kos, { conceptEntries: linkedEntries, relatedArticles });
    const smartChips = suggestSmartChips(kos, { conceptEntries: linkedEntries, relatedArticles });
    const recommendationWidget = buildRecommendationWidget(kos, internalLinks);
    const sitemapEntry = buildSitemapEntry(kos, { urlPath });
    ecosystem = { seoSuggestion, faqSchema: seoSuggestion.faqSchema, relatedArticles, internalLinks, smartChips, recommendationWidget, sitemapEntry };
  } catch (e) {
    /* article page/sitemap/citation are already live via is_active */
    logSystemEvent(env, { kind: 'graph-sync', level: 'error', message: 'syncArticleToGraph failed', meta: { articleId: article?.id, error: String(e?.message || e) } }).catch(() => {});
  }

  // PRODUCTION UPGRADE — ARTICLE CHUNKING: publish the FULL article body as
  // additional retrievable chunk concepts (not just the first ~1200 chars used
  // by the main concept's canonical.deep). Best-effort, non-fatal — the main
  // concept above is already published; a chunking failure never blocks that.
  if (graph?.published?.ok) {
    try {
      const chunkKos = chunkConceptsFromArticle(article, kos);
      const chunkResults = [];
      for (const ck of chunkKos) {
        const authoredChunk = await authorConcept(env, ck, { origin: 'article', autoSubmit: false });
        let publishedChunk = null;
        if (authoredChunk.ok && authoredChunk.action !== 'merged') {
          publishedChunk = await publishConcept(env, ck, 'article-publish-chunk');
        }
        chunkResults.push({ id: ck.id, authored: authoredChunk.ok, published: !!publishedChunk?.ok });
      }
      graph.chunks = { total: chunkKos.length, results: chunkResults };
    } catch (e) {
      logSystemEvent(env, { kind: 'chunking', level: 'error', message: 'article chunking failed', meta: { articleId: article?.id, error: String(e?.message || e) } }).catch(() => {});
    }
  }
  return { graph, ecosystem };
}

// INVERSE of syncArticleToGraph — retires the main concept + every chunk when an
// article is unpublished or deleted, so the chatbot stops answering from content
// the admin took down (the graph-drift bug found in audit). Best-effort/non-fatal,
// same resilience posture as publish: draft/delete must never be blocked by a
// graph-side failure. Reuses retire() (review-runtime.js) — no new lifecycle logic.
export async function retireArticleConcepts(env, articleId) {
  if (!articleId) return { ok: false, reason: 'no-id' };
  const mainId = `article-${articleId}`;
  const result = { main: null, chunks: [] };
  try {
    result.main = await retire(env, mainId);
    const chunkNodes = await getNodesByIdPrefix(env, `article-chunk-${articleId}-`);
    for (const n of chunkNodes) result.chunks.push(await retire(env, n.id));
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e), partial: result };
  }
}

// PUBLISH VERIFICATION GATE — an article counts as "Published" only when the
// graph write and its SEO/sitemap by-products actually succeeded, not merely
// attempted (non-negotiable requirement: publishing is not complete until
// verified). Pure given already-computed {graph, ecosystem} — the one extra read
// is a REAL contextual-retrieval probe: the exact same retrieveBest/classifyIntent/
// relevanceEngine chain ai-kb-admin.js's `retrieval-probe` action already uses to
// answer "would the live chatbot actually accept this concept, at HIGH confidence,
// past the relevance gate?" — so "chatbot can answer contextually" is verified
// against the real acceptance gate, not guessed from a database row existing.
//
// Gate design (deliberate, documented): the structural checks below (SEO fields,
// canonical, sitemap-ready, graph concept published) are one-time, deterministic
// facts about THIS publish call, so they gate the is_active flip. Chunk
// completeness and the contextual-confidence probe are reported as quality
// signals but do not gate — chunk coverage is best-effort by nature, and
// retrieval confidence is a RELATIVE signal that naturally improves as more
// related content joins the graph, so it isn't this one publish call's fact to
// fail on. Embeddings and "search index" are excluded entirely: embeddings are an
// environment-wide switch (KB_EMBEDDINGS_ENABLED), not a per-article concern, and
// there is no separate search index to go stale (search reads ai_articles live).
export async function verifyPublishPipeline(env, { article, graph, ecosystem } = {}) {
  const seo = ecosystem?.seoSuggestion || {};
  const graphOk = !!(graph?.published?.ok || graph?.authored?.action === 'merged');

  const publicWebsite = {
    pageAccessible: !!article?.slug,
    seoTitle: !!seo.ogTitle,
    metaDescription: !!seo.ogDescription,
    canonical: !!seo.canonicalUrl,
    structuredData: !!seo.faqSchema,                 // optional-by-design — see seoReadiness.recommendations
    sitemap: !!ecosystem?.sitemapEntry?.readyForSitemap,
    internalLinks: (ecosystem?.internalLinks || []).length,
  };
  publicWebsite.ok = publicWebsite.pageAccessible && publicWebsite.seoTitle
    && publicWebsite.metaDescription && publicWebsite.canonical && publicWebsite.sitemap;

  const seoReadiness = {
    seoTitle: publicWebsite.seoTitle, metaDescription: publicWebsite.metaDescription,
    keywords: (seo.keywordsCsv || '').length > 0, canonical: publicWebsite.canonical,
    openGraph: !!seo.ogType, structuredData: publicWebsite.structuredData,
    recommendations: [
      ...(publicWebsite.structuredData ? [] : ['FAQ schema needs at least one question pattern with a real answer — it will appear automatically once the article/concept has one.']),
      'Submit the URL to Google Search Console for faster indexing (external action — outside this pipeline).',
    ],
  };
  seoReadiness.ok = seoReadiness.seoTitle && seoReadiness.metaDescription && seoReadiness.keywords && seoReadiness.canonical && seoReadiness.openGraph;

  let chatbotProbe = null;
  if (graphOk && article?.title) {
    try {
      const q = String(article.title).toLowerCase();
      const top = await retrieveBest(env, q, { lang: 'en' });
      const cls = classifyIntent(q);
      const intent = (cls && cls.intent) || 'fallback';
      const rel = relevanceEngine(q, { intent, category: top?.item?.category });
      const kept = top ? enforceRelevance({ category: top.item.category, concepts: top.item.concepts, relevanceTags: top.item.relevanceTags }, rel) : false;
      chatbotProbe = { topConcept: top?.item?.id || null, confidence: top?.confidence || null, contextual: !!(top && top.confidence === 'HIGH' && kept) };
    } catch { chatbotProbe = { error: true, contextual: false }; }
  }
  const knowledgeGraph = {
    conceptPublished: graphOk,
    chunksCreated: !graph?.chunks || graph.chunks.total === 0 || (graph.chunks.results || []).some(r => r.published),
    chatbotAnswersContextually: !!chatbotProbe?.contextual,
    probe: chatbotProbe,
  };
  // Gate on the structural write; contextual confidence is a quality signal that
  // improves as the graph grows around this concept, not a one-time pass/fail.
  knowledgeGraph.ok = knowledgeGraph.conceptPublished;

  const ok = publicWebsite.ok && knowledgeGraph.conceptPublished;
  return { ok, publicWebsite, seoReadiness, knowledgeGraph };
}
