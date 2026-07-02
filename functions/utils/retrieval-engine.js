// functions/utils/retrieval-engine.js
// ════════════════════════════════════════════════════════════════════════════
// RETRIEVAL ENGINE — Article (Module 4/5) + Image (Module 5) + Pattern History
// (Module 6). NOW CONNECTED to the ZTU Chatbot AI Supabase canonical tables via
// ai-supabase.js (server-side, service key only). Degrades to education-only /
// empty results until credentials are provided.
//
//   articles → ai_articles · images → ai_article_images · stats → ai_pattern_vault
// ════════════════════════════════════════════════════════════════════════════

import { isConfigured, queryArticles, queryArticleImages, getPatternStats } from './ai-supabase.js';
import { renderArticleCitation } from './article-engine.js';
import { PATTERN_EDU } from './pattern-engine.js';

// ── MODULE 4/5 — ARTICLE RETRIEVAL ───────────────────────────────────────────
export const ARTICLE_RETRIEVAL_FLOW = [
  'user question',
  'queryArticles(query, tags)             → ai_articles',
  'extract relevant passage(s)',
  'fuse into engine answer (knowledge-router L1)',
  'renderArticleCitation() ("Related reading")',
];

export async function retrieveArticleKnowledge(env, { query, tags } = {}) {
  const results = await queryArticles(env, { query, tags, limit: 3 });
  const top = results[0] || null;
  return {
    configured: isConfigured(env),
    table: 'ai_articles',
    passages: results,
    recommendation: top,
    citation: top ? renderArticleCitation(top) : '',
  };
}

// ── MODULE 5 — IMAGE RETRIEVAL ───────────────────────────────────────────────
export const IMAGE_RETRIEVAL_FLOW = [
  'user question',
  'queryArticleImages(topic/patternKey)   → ai_article_images',
  'return image (url + caption)',
  'explain image (linked via article_id → ai_articles)',
];

export async function retrieveImage(env, { topic, patternKey } = {}) {
  const images = await queryArticleImages(env, { patternKey, limit: 3 });
  return {
    configured: isConfigured(env),
    table: 'ai_article_images',
    images,
    explain: images[0] ? `Example: ${images[0].caption || topic || patternKey || ''}` : '',
  };
}

// ── MODULE 6 — PATTERN HISTORY RETRIEVAL ─────────────────────────────────────
export const PATTERN_RETRIEVAL_FLOW = [
  'user names a pattern (e.g. "double bottom")',
  'getPatternStats(pattern_key)           → ai_pattern_vault',
  'render probability (stats) + education (pattern-engine.PATTERN_EDU)',
  'no signal · no guaranteed direction',
];

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

export async function retrievePatternHistory(env, patternText) {
  const key = resolvePatternKey(patternText);
  const edu = key ? PATTERN_EDU[key] : null;
  const stats = key ? await getPatternStats(env, key) : null;  // ai_pattern_vault
  return {
    configured: isConfigured(env),
    table: 'ai_pattern_vault',
    patternKey: key,
    education: edu || null,
    stats: stats
      ? {
          occurrences: stats.occurrences ?? null,
          win_rate:    stats.win_rate ?? null,
          loss_rate:   stats.loss_rate ?? null,
          avg_move:    stats.avg_move ?? null,
          sample_size: stats.sample_size ?? null,
        }
      : null,
  };
}
