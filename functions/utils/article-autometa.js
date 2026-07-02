// functions/utils/article-autometa.js
// ════════════════════════════════════════════════════════════════════════════
// AUTO-MODE ARTICLE METADATA GENERATOR (additive, fail-safe).
//
// From a pasted article body, produce every field the manual form needs (SEO title,
// AI-friendly title, category, difficulty, language, tags, retrieval keywords,
// summary, image caption) so AUTO-mode users only paste content. Uses Workers AI
// (env.AI) when available; ALWAYS returns a valid result via a deterministic
// fallback. Pure data out — it does NOT touch the DB or any existing API/action.
// The caller still persists through the unchanged create/publish path, so schema,
// searchArticles, rankArticles, and knowledge injection are all unaffected.
// ════════════════════════════════════════════════════════════════════════════

import { CATEGORY_KEYS, inferCategory, slugify } from './article-categories.js';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const ADVANCED_HINTS = /\b(order block|fair value gap|fvg|liquidity sweep|inducement|market maker|institutional|wyckoff|optimal trade entry|smt divergence|backtest|expectancy|optimization)\b/i;
const INTERMEDIATE_HINTS = /\b(rsi|macd|fibonacci|moving average|bollinger|divergence|confluence|risk reward|position sizing|market structure|break of structure|supply and demand)\b/i;

const STOP = new Set(('the a an of to in is it for on and or how do i my what why about with this that as are be your you we our at from by can will into not but if then so they their them he she his her its also more most over under out up down off than too very just like get got use using used each other some any all many few new now best top good great help guide trading trade trader market markets price prices').split(' '));

function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [];
}
function firstHeading(content) {
  const m = String(content || '').match(/^\s*#{1,3}\s+(.+)$/m);
  return m ? m[1].trim().replace(/[#*_`]/g, '').slice(0, 80) : '';
}
function topKeywords(content, n = 8) {
  const freq = new Map();
  for (const w of String(content || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

// Always-valid baseline (no I/O). Any caller override wins.
function deterministicMeta(content, overrides = {}) {
  const heading = firstHeading(content);
  const sents = sentences(content);
  const title = (overrides.title || heading || (sents[0] || 'Untitled Article')).toString().trim().slice(0, 80);
  const summary = (overrides.summary || sents.slice(0, 2).join(' ')).toString().trim().slice(0, 280);
  const cat = overrides.category || inferCategory(content) || 'beginner-guides';
  const diff = overrides.difficulty
    || (ADVANCED_HINTS.test(content) ? 'advanced' : INTERMEDIATE_HINTS.test(content) ? 'intermediate' : 'beginner');
  const tags = (Array.isArray(overrides.tags) && overrides.tags.length) ? overrides.tags : topKeywords(content, 8);
  return {
    title,
    aiTitle: title,
    summary,
    category: CATEGORY_KEYS.includes(cat) ? cat : 'beginner-guides',
    difficulty: DIFFICULTIES.includes(diff) ? diff : 'beginner',
    language: overrides.language || 'en',
    tags,
    keywords: tags,
    caption: (overrides.caption || title).toString().slice(0, 90),
    slug: slugify(title),
    source: 'deterministic',
  };
}

const SYS = `You generate retrieval metadata for a Gold/Forex/Crypto trading-education knowledge base. Output ONLY a compact JSON object (no prose, no code fence) with keys: title (SEO-friendly, <=70 chars), aiTitle (clear natural-question phrasing a student would type), category (EXACTLY one of: __CATS__), difficulty (beginner|intermediate|advanced), tags (array of 5-8 short lowercase keywords), keywords (array of 5-10 retrieval phrases a user might search), summary (2-3 plain sentences the chatbot can cite), caption (short image caption). Base everything ONLY on the provided content.`;

function parseJson(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

async function aiMeta(env, content) {
  const model = env.LLM_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  const sys = SYS.replace('__CATS__', CATEGORY_KEYS.join(', '));
  const r = await env.AI.run(model, {
    messages: [{ role: 'system', content: sys }, { role: 'user', content: String(content).slice(0, 6000) }],
    max_tokens: 500, temperature: 0.3,
  });
  return parseJson(r && (r.response || r.result || (typeof r === 'string' ? r : '')));
}

function arr(v) { return Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []; }

// AI fields win when valid; deterministic baseline fills any gap. Keywords are folded
// into tags so they boost searchArticles candidate pooling + rankArticles scoring.
function mergeMeta(base, ai) {
  const cat = CATEGORY_KEYS.includes(ai.category) ? ai.category : base.category;
  const diff = DIFFICULTIES.includes(ai.difficulty) ? ai.difficulty : base.difficulty;
  const tags = [...new Set([...arr(ai.tags), ...arr(ai.keywords)])].slice(0, 12);
  const title = (ai.title || base.title).toString().trim().slice(0, 90);
  return {
    title,
    aiTitle: (ai.aiTitle || ai.title || base.title).toString().trim(),
    summary: (ai.summary || base.summary).toString().trim().slice(0, 400),
    category: cat,
    difficulty: diff,
    language: base.language,
    tags: tags.length ? tags : base.tags,
    keywords: arr(ai.keywords).length ? arr(ai.keywords) : base.keywords,
    caption: (ai.caption || base.caption).toString().slice(0, 120),
    slug: slugify(ai.title || base.title),
    source: 'workers-ai',
  };
}

function stripEmpty(o) { const r = {}; for (const k in o) if (o[k] != null && o[k] !== '') r[k] = o[k]; return r; }

export async function generateArticleMeta(env, { content = '', overrides = {} } = {}) {
  const base = deterministicMeta(content, overrides);
  if (!content || String(content).trim().length < 20) return base;     // too short → baseline
  if (env && env.AI && typeof env.AI.run === 'function') {
    try {
      const ai = await aiMeta(env, content);
      if (ai && typeof ai === 'object') return { ...mergeMeta(base, ai), ...stripEmpty(overrides) };
    } catch { /* any failure → deterministic baseline */ }
  }
  return base;
}
