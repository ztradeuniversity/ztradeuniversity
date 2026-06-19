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

    // STAGE 1 (cont.) — SEO/FAQ/smart chips/internal links/recommendation widget/
    // sitemap entry, same builders + shapes as ai-kb-admin's ingest-article.
    const linkedEntries = [...links.related, ...links.nextSteps]
      .map(id => entries.find(e => e.id === id)).filter(Boolean);
    const urlPath = article.slug ? `/articles/${article.slug}` : null;
    const seoSuggestion = buildSeoSuggestion(kos, { urlPath });
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
