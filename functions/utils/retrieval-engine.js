// functions/utils/retrieval-engine.js
// ════════════════════════════════════════════════════════════════════════════
// RETRIEVAL ENGINE — Article (Module 4) + Image (Module 5) + Pattern History
// (Module 6). ARCHITECTURE / FOUNDATION ONLY.
//
// Orchestrates the existing (untouched) article-engine & image-engine stubs and
// adds pattern-history retrieval. Everything degrades to `configured:false`
// until the ZTU Chatbot AI Supabase is connected later.
//
// FUTURE DESTINATIONS:
//   articles → ai_articles · images → ai_article_images
//   patterns → ai_pattern_vault (+ ai_chart_analyses for live occurrences)
// ════════════════════════════════════════════════════════════════════════════

import { searchArticles, recommendArticle, renderArticleCitation } from './article-engine.js';
import { findExampleImages } from './image-engine.js';
import { PATTERN_EDU } from './pattern-engine.js';

// ── MODULE 4 — ARTICLE RETRIEVAL ─────────────────────────────────────────────
// Flow: question → search ai_articles → extract knowledge → answer → recommend.
export const ARTICLE_RETRIEVAL_FLOW = [
  'user question',
  'searchArticles(query, tags)            → ai_articles',
  'extract relevant passage(s)',
  'fuse into engine answer (knowledge-router L1)',
  'recommendArticle() → renderArticleCitation() ("Related reading")',
];

export async function retrieveArticleKnowledge(/* env, */ { query, tags } = {}) {
  const found = await searchArticles({ query, tags, limit: 3 }).catch(() => ({ configured: false, results: [] }));
  const rec   = await recommendArticle({ topic: query, tags }).catch(() => ({ configured: false, article: null }));
  return {
    configured: !!found.configured,
    table: 'ai_articles',
    passages: found.results || [],
    recommendation: rec.article || null,
    citation: rec.article ? renderArticleCitation(rec.article) : '',
  };
}

// ── MODULE 5 — IMAGE RETRIEVAL ───────────────────────────────────────────────
// Flow: question → find matching educational image → return → explain.
export const IMAGE_RETRIEVAL_FLOW = [
  'user question',
  'findExampleImages(topic/patternKey)    → ai_article_images',
  'return image (url + caption)',
  'explain image (link to ai_articles via article_id)',
];

export async function retrieveImage(/* env, */ { topic, patternKey } = {}) {
  const res = await findExampleImages({ topic, patternKey, limit: 3 }).catch(() => ({ configured: false, images: [] }));
  return {
    configured: !!res.configured,
    table: 'ai_article_images',
    images: res.images || [],
    explain: (res.images && res.images[0])
      ? `Example: ${res.images[0].caption || topic || patternKey}`
      : '',
  };
}

// ── MODULE 6 — PATTERN HISTORY RETRIEVAL ─────────────────────────────────────
// Flow: "Double Bottom" → search ai_pattern_vault → occurrences/win/loss/avg move.
export const PATTERN_RETRIEVAL_FLOW = [
  'user names a pattern (e.g. "double bottom")',
  'lookup ai_pattern_vault[pattern_key]   → occurrences, win_rate, loss_rate, avg_move',
  '(optional) aggregate live ai_chart_analyses for recent occurrences',
  'render probability + education (pattern-engine.PATTERN_EDU) — no signal',
];

// Map a free-text pattern name to a canonical pattern key (pure, safe now).
export function resolvePatternKey(text) {
  const s = (text || '').toLowerCase();
  if (/double\s*top/.test(s)) return 'double-top';
  if (/double\s*bottom/.test(s)) return 'double-bottom';
  if (/inverse\s*(head|h&s)/.test(s)) return 'inverse-head-shoulders';
  if (/head\s*(and|&)?\s*shoulders|h&s|h and s/.test(s)) return 'head-shoulders';
  if (/ascending\s*triangle/.test(s)) return 'ascending-triangle';
  if (/descending\s*triangle/.test(s)) return 'descending-triangle';
  if (/symmetrical|triangle/.test(s)) return 'symmetrical-triangle';
  if (/rising\s*wedge/.test(s)) return 'rising-wedge';
  if (/falling\s*wedge|wedge/.test(s)) return 'falling-wedge';
  if (/bull\s*flag/.test(s)) return 'bull-flag';
  if (/bear\s*flag|flag/.test(s)) return 'bear-flag';
  if (/channel/.test(s)) return 'channel';
  if (/range|consolidat/.test(s)) return 'range';
  if (/breakout/.test(s)) return 'breakout';
  if (/liquidity\s*sweep|stop\s*hunt/.test(s)) return 'liquidity-sweep';
  return null;
}

export async function retrievePatternHistory(/* env, */ patternText) {
  const key = resolvePatternKey(patternText);
  const edu = key ? PATTERN_EDU[key] : null;
  // Education is available now; the STATISTICS come from ai_pattern_vault later.
  return {
    configured: false,                 // stats source not connected yet
    table: 'ai_pattern_vault',
    patternKey: key,
    education: edu || null,            // name/bias/logic/expected/watch (live today)
    stats: null,                       // FUTURE: { occurrences, win_rate, loss_rate, avg_move, sample_size }
  };
}
