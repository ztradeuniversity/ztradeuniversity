// functions/utils/suggestion-chips.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 19 — SMART SUGGESTION CHIPS
// Builds short, clickable next-question chips so the student rarely needs to type.
// Sources are GRAPH-DRIVEN (never hardcoded): the answered concept's own related /
// next-step topics + the existing graph engagement engine (graph-retrieval
// .suggestQuestions, which is already level-biased and deduped). Degrades to []
// gracefully when the graph isn't provisioned — chips simply don't show.
//
// Rules honoured: ≤5 words per chip (STEP 6), no duplicates (STEP 7), level/topic/
// recency aware via suggestQuestions (STEP 4), easier+fewer when confidence is low
// (STEP 5). Reuses the existing suggestion engine — no parallel system.
// Pure-ish (delegates I/O to graph-retrieval). Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

import { suggestQuestions } from './graph-retrieval.js';

const _titleize = (s) => String(s || '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());

// Normalize a candidate to a clean chip label, or '' if unusable / too long (>5 words).
function toChip(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  t = t.replace(/[\s,.;:]+$/, '');                 // trim trailing punctuation (keep a '?')
  const words = t.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 5) return '';   // STEP 6: short only
  return t;
}

// Returns an array of ≤5 short chip labels (≤3 when lowConfidence). [] when nothing
// graph-derived is available (graceful — no chips rendered).
export async function buildSuggestionChips(env, {
  lang = 'en', level = 'beginner', lowConfidence = false,
  related = [], excludeIds = [], limit = 5,
} = {}) {
  const out = [];
  const seen = new Set();
  const push = (label) => {
    const c = toChip(label);
    if (!c) return;
    const k = c.toLowerCase();
    if (seen.has(k)) return;                        // STEP 7: no duplicate chips
    seen.add(k);
    out.push(c);
  };

  // 1) The answered concept's own related / next topics (graph-seed derived, short).
  //    English-gated so non-English turns don't show English topic labels (Lang-Lock).
  if (lang === 'en') for (const r of (related || [])) push(_titleize(r));

  // 2) The existing graph engagement engine — level-biased; easier when confidence
  //    is low (STEP 5). Returns [] until the graph is provisioned (graceful).
  try {
    const qLevel = lowConfidence ? 'beginner' : level;
    const qs = await suggestQuestions(env, {
      lang, level: qLevel, limit: lowConfidence ? 4 : 6, exclude: excludeIds,
    });
    for (const q of qs) push(q);
  } catch { /* additive — chips never block a reply */ }

  return out.slice(0, lowConfidence ? 3 : limit);
}
