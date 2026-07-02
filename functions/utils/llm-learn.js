// functions/utils/llm-learn.js
// ════════════════════════════════════════════════════════════════════════════
// AUTO-LEARN ENGINE (Part 7 / Level-4) — additive, fail-safe, gated.
//
// When the chatbot has to fall back to a generated (OpenAI/Workers-AI) answer for
// an in-domain question the internal KB did NOT cover, this captures that Q→A as a
// REVIEWABLE DRAFT in the EXISTING ai_articles table (is_active=false). Drafts are
// NOT served by searchArticles (it filters is_active=true), so a generated answer
// can never become authoritative until it is promoted.
//
// SAFETY MODEL (matches the chosen policy):
//   • Internal published articles/concepts stay authoritative (this never competes).
//   • Generated answers start as DRAFT only.
//   • Smart auto-promotion: a draft is published automatically only after it has
//     been independently regenerated >= PROMOTE_AT times AND confidence is not LOW
//     (repeat + confidence gate). Low-confidence answers are never auto-promoted.
//   • Repeat questions reuse the stored draft (cache) instead of re-calling the LLM.
//   • Gated by env.AI_LEARN_ENABLED==='true' — OFF by default → zero behavior change.
//
// Reuses article-store (no new tables) + article-categories. Pure orchestration over
// existing functions; every DB call is best-effort and swallowed (never blocks chat).
// ════════════════════════════════════════════════════════════════════════════

import { getArticle, createArticle, updateArticle, setArticleStatus, listArticles } from './article-store.js';
import { inferCategory, estimateReadingTime, rankArticles } from './article-categories.js';
import { syncArticleToGraph } from './article-graph-sync.js';
import { graphActive } from './kb-store.js';

const PROMOTE_AT = 3;                 // independent regenerations before auto-promotion
const DRAFT_AUTHOR = 'AI-Draft';

export function learnEnabled(env) {
  return !!(env && env.AI_LEARN_ENABLED === 'true');
}

// Stable, dependency-free hash of a normalized question (djb2). Used as the dedupe key.
function keyOf(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Real topic keywords from the question → become the concept's tags on promotion
// (so the graph node is retrievable, not tagged with internal markers).
const TAGSTOP = new Set(('what is a an the how do does why when which to of in on for and or with your you me my this that are be can will trade trading market price').split(' '));
function topTags(text, n = 6) {
  const f = new Map();
  for (const w of String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)) {
    if (w.length < 3 || TAGSTOP.has(w)) continue;
    f.set(w, (f.get(w) || 0) + 1);
  }
  return [...f.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function countFromTags(tags) {
  const t = (tags || []).find(x => /^count:\d+$/.test(String(x)));
  return t ? parseInt(String(t).split(':')[1], 10) || 1 : 1;
}
function withCount(tags, n) {
  const out = (tags || []).filter(x => !/^count:\d+$/.test(String(x)));
  out.push(`count:${n}`);
  return out;
}

// Generic/filler words that must NOT, on their own, justify reusing a stored draft —
// so a SIMILAR-question match requires a DISTINCTIVE shared term (e.g. "elliott"),
// never just filler ("explain"/"simple"/"what"). Preserves the no-wrong-answer safeguard.
const SIM_GENERIC = new Set(['explain','explained','explaining','simple','words','word','what','whats','when','where','which','does','about','into','from','this','that','with','your','tell','define','definition','meaning','mean','trading','trade','trades','trader','traders','market','markets','price','prices','term','terms','basics','beginner','beginners','please','give','show','work','works','using','used',
  // Domain DESCRIPTORS (never the distinctive SUBJECT) — without these, every indicator
  // question shares "indicator"/"oscillator"/"stop" with any stored indicator draft and
  // false-matches (e.g. "Vortex Indicator" wrongly reused "Schaff Trend Cycle indicator").
  'indicator','indicators','oscillator','oscillators','signal','signals','strategy','strategies','system','systems','method','methods','tool','tools','setup','setups','study','studies','technique','techniques','stop','stops']);
function simTokens(s) {
  return (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 3 && !SIM_GENERIC.has(w));
}

// Look up a previously-learned answer for THIS question so we can reuse it instead of
// paying for another LLM call. Two stages, both over the EXISTING ai_articles store
// (ai-draft namespace — no new storage, no promotion):
//   1) EXACT — normalized-question key (fast path; unchanged behavior).
//   2) SIMILAR — fuzzy match over stored AI drafts via the existing rankArticles, gated
//      by DISTINCTIVE-term overlap with the draft's original question (title/tags) so a
//      paraphrase ("Elliott Wave Theory" ≈ "Elliott Wave Principle") reuses the stored
//      answer, while an unrelated question can never reuse the wrong draft.
// Returns the article row (its .content is the stored answer) or null.
export async function recallLearned(env, question) {
  if (!learnEnabled(env) || !question) return null;
  try {
    const exact = await getArticle(env, `ai-draft-${keyOf(question)}`);
    if (exact && exact.content) return exact;
    // SIMILAR-question reuse
    const qSig = simTokens(question);
    if (!qSig.length) return null;                                   // nothing distinctive to match on
    const drafts = (await listArticles(env, { status: 'draft', limit: 100 }) || [])
      .filter(a => a && a.content && Array.isArray(a.tags) && a.tags.includes('ai-draft'));
    if (!drafts.length) return null;
    const top = (rankArticles(question, drafts, 1) || [])[0];        // reuse existing fuzzyScore ranking
    if (!top || !top.content) return null;
    const dSig = new Set([...simTokens(top.title), ...((top.tags || []).flatMap(t => simTokens(t)))]);
    const overlap = qSig.filter(t => dSig.has(t)).length;
    // Require a distinctive shared term AND a non-trivial score → no wrong-draft reuse.
    if (overlap >= 1 && (top._score || 0) >= 10) return top;
    return null;
  } catch { return null; }
}

// Capture / reinforce a generated answer as a reviewable draft. Idempotent by slug.
// Auto-promotes (is_active=true) once regenerated >= PROMOTE_AT times with non-LOW
// confidence. Returns {stored, slug, count, promoted} — never throws.
export async function learnFromAnswer(env, { question, answer, lang = 'en', confidence = 'MEDIUM' } = {}) {
  try {
    if (!learnEnabled(env)) return { stored: false, reason: 'disabled' };
    const q = String(question || '').trim();
    const a = String(answer || '').trim();
    if (q.length < 8 || a.length < 40) return { stored: false, reason: 'too-short' };

    const key = keyOf(q);
    const slug = `ai-draft-${key}`;
    const existing = await getArticle(env, slug).catch(() => null);

    if (existing) {
      const count = countFromTags(existing.tags) + 1;
      const tags = withCount(existing.tags, count);
      await updateArticle(env, existing.id, { tags }).catch(() => {});
      let promoted = false, graphed = false;
      if (!existing.is_active && count >= PROMOTE_AT && confidence !== 'LOW') {
        const row = await setArticleStatus(env, existing.id, true).catch(() => null);   // article-level promote
        promoted = !!row;
        // FULL concept promotion via the SAME shared publish pipeline (kb_nodes +
        // embeddings + edges). Only when the graph is live + confidence is not LOW —
        // a low-confidence answer never becomes authoritative graph knowledge.
        if (promoted && graphActive(env)) {
          const base = row || existing;
          const cleanTags = (base.tags || []).filter(t => !/^(ai-draft|key:|count:)/.test(String(t)));
          await syncArticleToGraph(env, { ...base, tags: cleanTags }).catch(() => {});
          graphed = true;
        }
      }
      return { stored: true, slug, count, promoted, graphed };
    }

    const title = q.length > 70 ? q.slice(0, 67) + '…' : q;
    const payload = {
      title, slug,
      summary: a.slice(0, 280),
      content: a,
      category: inferCategory(q) || 'beginner-guides',
      tags: [...topTags(q), 'ai-draft', `key:${key}`, 'count:1'],
      difficulty: 'beginner',
      language: lang,
      author: DRAFT_AUTHOR,
      reading_time: estimateReadingTime(a),
      is_active: false,                                 // DRAFT — never served until reviewed/promoted
      created_at: new Date().toISOString(),
    };
    const row = await createArticle(env, payload).catch(() => null);
    return { stored: !!row, slug, count: 1, promoted: false };
  } catch {
    return { stored: false, reason: 'error' };          // never block the chat reply
  }
}
