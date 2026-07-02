// functions/utils/article-chunker.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE CHUNKING — production upgrade. Audit finding: conceptFromArticle()/
// buildConceptFromArticle() only ever expose the first ~1200 characters of an
// article's content as canonical.deep, so anything past that point was authored
// in ai_articles (full content, untouched) but never became retrievable/
// answerable knowledge. This module splits the FULL article body into
// sentence-aware chunks and turns each into its own KOS concept — so the whole
// article becomes searchable, not just its opening.
//
// Each chunk concept:
//   - preserves the article relationship  → sources[0].id = article.id,
//     sources[0].chunkIndex = i, related = [parentConceptId]
//   - preserves source tracking            → origin:'article', sources[].slug
//   - preserves the article id             → id = `article-chunk-${article.id}-${i}`
//
// Pure (no I/O) — callers feed the result through the EXISTING authorConcept/
// publishConcept pipeline (same gate, same dedup, same embeddings), so chunks
// are first-class graph citizens, not a parallel system. Additive only.
// ════════════════════════════════════════════════════════════════════════════

const MAX_CHUNK = 1100;   // keep each chunk inside the canonical.deep render budget
const MIN_CHUNK = 200;    // don't emit a trailing sliver chunk; fold it into the previous one

// Split into sentences, then greedily pack sentences into <=MAX_CHUNK chunks
// without ever cutting a sentence in half (mirrors article-ingest.js's sentence-
// aware approach, just continued across the WHOLE body instead of stopping at 5).
export function chunkText(body, maxLen = MAX_CHUNK) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur.length + 1 + s.length) > maxLen) { chunks.push(cur.trim()); cur = s; }
    else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  // Fold a too-small trailing chunk into the previous one rather than publishing a sliver.
  if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_CHUNK) {
    const last = chunks.pop();
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${last}`;
  }
  return chunks;
}

// Build retrievable chunk concepts for a published article. `parentKos` is the
// concept produced by conceptFromArticle()/buildConceptFromArticle() for the SAME
// article (reused so tags/category/level/lang stay consistent — no duplicate logic).
export function chunkConceptsFromArticle(article, parentKos) {
  if (!article || !article.id || !parentKos) return [];
  const content = String(article.content || '').trim();
  if (!content) return [];
  const chunks = chunkText(content);
  // Skip chunk-0 if it's essentially the same text already covered by parentKos.deep
  // (avoids publishing a near-duplicate of the main concept's own answer).
  const startAt = (chunks[0] && parentKos.canonical?.deep && chunks[0].startsWith(parentKos.canonical.deep.slice(0, 80))) ? 1 : 0;
  const title = String(article.title || parentKos.title || '').trim();
  const lowerTitle = title.toLowerCase();
  return chunks.slice(startAt).map((text, idx) => {
    const i = idx + startAt;
    return {
      id: `article-chunk-${article.id}-${i}`,
      category: parentKos.category || 'articles',
      topic: `${title} (part ${i + 1})`,
      title: `${title} (part ${i + 1})`,
      level: parentKos.level || 'beginner',
      lang: parentKos.lang || 'en',
      concepts: parentKos.concepts && parentKos.concepts.length ? parentKos.concepts : [lowerTitle],
      questionPatterns: Array.from(new Set([
        lowerTitle,
        `${lowerTitle} part ${i + 1}`,
        ...(parentKos.questionPatterns || []).slice(0, 3),
      ])).filter(Boolean),
      canonical: {
        short: text.slice(0, 280),
        deep: text.slice(0, MAX_CHUNK),
      },
      relevanceTags: parentKos.relevanceTags || [],
      responseObjective: 'educate',
      desiredOutcome: `answer grounded in part ${i + 1} of "${title}"`,
      related: [parentKos.id],
      origin: 'article',
      sources: [{ id: String(article.id), title, slug: article.slug || null, chunkIndex: i, chunkCount: chunks.length }],
      status: 'ai_draft',
      confidence: 'MEDIUM',
    };
  });
}
