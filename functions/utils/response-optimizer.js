// functions/utils/response-optimizer.js
// ════════════════════════════════════════════════════════════════════════════
// RESPONSE OPTIMIZATION LAYER (additive, final-pass, pure string transforms).
//
// Runs LAST — right before the assembled answer is streamed. It does NOT touch
// retrieval, routing, intent classification, APIs, live data, language detection,
// or the Workers-AI/OpenAI integration. Every function is pure and reversible
// (delete the two wiring blocks in ai-chat.js to fully roll back).
//
// Goals served (surgical):
//   1. Keep replies SHORT  → ≤ MAX_WORDS / ≤ MAX_PARAS, UNLESS the user asked for
//      detail. The educational disclaimer + any links are ALWAYS preserved.
//   5/6. Tight follow-up chips → at most 3, each ≤ 4 words, contextual, no generics.
//   13. Disclaimer kept (protected from trimming).
//
// Language-Lock safe: non-English answers are length-trimmed only (never reworded),
// and contextual chip back-fill (English topic labels) is gated to English turns.
// Fail-safe: any error returns the ORIGINAL input — it can never break a reply.
// ════════════════════════════════════════════════════════════════════════════

// Budget tuned to a PROFESSIONAL educational answer, not a one-liner. The graph's
// signature reply is a structured 5-part coach — direct answer + "⚠️ Common
// mistake" + "🎯 Professional insight" + "🛡️ Risk warning" + "📊 Market context"
// + a next-step invite (~6 short paragraphs / ~180-220 words). The old 120-word /
// 3-paragraph cap truncated that mid-structure with a "…", which (a) read as a
// broken, rule-based bot cutting itself off and (b) could drop the risk-warning
// line — a quality AND safety regression. 220 words / 7 paragraphs lets that
// structured answer complete while still catching a genuine runaway. Nothing can
// ramble to fill it: OpenAI generation is prompted "under 120 words", DB-article
// bodies are pre-sliced to ~1200 chars, and live/status replies are naturally
// short — so this raises the ceiling for the answers that were being clipped
// without lengthening the ones that were already concise. `wantsDetail` still
// removes the cap entirely when the user explicitly asks for depth.
const MAX_WORDS = 220;
const MAX_PARAS = 7;

// The user explicitly wants a longer / detailed answer → skip the length cap.
const DETAIL_RE = /\b(detail|details|explain (it )?(more|fully|in ?depth)|in ?depth|step[ -]?by[ -]?step|fully|elaborate|long answer|everything|complete guide|deep dive)\b|تفصیل|tafseel|poora batao|sab kuch|detail mein/i;

export function wantsDetail(userText = '') {
  try { return DETAIL_RE.test(String(userText)); } catch { return false; }
}

const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;

// A trailing paragraph is "protected" (never trimmed) when it carries the
// educational disclaimer or a link (markdown or bare path).
const PROTECT_RE = /educational|not (a )?(signal|advice|financial)|education,? not|advice only|تعليمي|taleemi|\]\(http|\]\(\//i;

// Sentence boundary that also understands Urdu (۔) and Arabic (؟) punctuation.
const SENTENCE_RE = /[^.!?۔؟\n]+[.!?۔؟]?\s*/g;

// Cap the answer to MAX_PARAS paragraphs / MAX_WORDS words while ALWAYS keeping the
// trailing protected (disclaimer/link) paragraph(s). Returns the original answer when
// it is already short, when detail was requested, or on any uncertainty (fail-safe).
export function optimizeAnswer(answer, { detail = false } = {}) {
  try {
    const text = String(answer == null ? '' : answer);
    if (!text.trim() || detail) return text;

    const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (paras.length === 0) return text;

    // Peel trailing protected paragraphs (disclaimer / links) off the body.
    const protectedTail = [];
    let i = paras.length - 1;
    while (i >= 0 && PROTECT_RE.test(paras[i])) { protectedTail.unshift(paras[i]); i--; }
    const body = paras.slice(0, i + 1);

    // Already within budget → leave untouched.
    if (body.length <= MAX_PARAS && wordCount(body.join(' ')) <= MAX_WORDS) return text;

    // Keep up to MAX_PARAS body paragraphs, then word-cap at sentence boundaries.
    let joined = body.slice(0, MAX_PARAS).join('\n\n');
    if (wordCount(joined) > MAX_WORDS) {
      const sentences = joined.match(SENTENCE_RE) || [joined];
      let acc = '', used = 0;
      for (const s of sentences) {
        const n = wordCount(s);
        if (used + n > MAX_WORDS && used > 0) break;
        acc += s; used += n;
      }
      joined = acc.trim() || joined;
      // Hard guard: a single oversized sentence (or punctuation-less text / bullet block)
      // would survive the sentence loop intact — force it down to the word budget.
      const w = joined.split(/\s+/).filter(Boolean);
      if (w.length > MAX_WORDS) joined = w.slice(0, MAX_WORDS).join(' ') + '…';
    }

    return [joined, ...protectedTail].filter(Boolean).join('\n\n').trim() || text;
  } catch {
    return String(answer == null ? '' : answer);   // never break the reply
  }
}

// ── Contextual follow-up chips ──────────────────────────────────────────────
const MAX_CHIPS = 3;
const MAX_CHIP_WORDS = 4;

// Known generic/low-value labels that must never be shown as "smart" suggestions.
const GENERIC = new Set([
  'what is forex', 'what is trading', 'how to start', 'where do i start',
  'tell me more', 'learn the basics', 'start here', 'ask me anything',
  'what can you do', 'trading basics', 'get started', 'explore topics',
]);

const titleize = (s) => String(s || '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b\w/g, c => c.toUpperCase());

function chipClean(s) {
  let t = String(s || '').replace(/[？?]+$/, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (GENERIC.has(t.toLowerCase())) return '';
  const words = t.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > MAX_CHIP_WORDS) return '';
  return t;
}

// Return ≤3 tight, de-duplicated, contextual chips. Sources: the already-derived
// contextual chips first; if short, back-fill from the answered concept's own
// related / next-step topics (English turns only). Generic labels are dropped — we
// would rather show fewer chips than generic ones.
export function optimizeChips(chips = [], { related = [], nextStepTopic = '', lang = 'en' } = {}) {
  try {
    const out = [], seen = new Set();
    const add = (raw) => {
      if (out.length >= MAX_CHIPS) return;
      const c = chipClean(raw);
      if (!c) return;
      const k = c.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k); out.push(c);
    };
    for (const c of (chips || [])) add(c);
    if (lang === 'en') {
      for (const r of (related || [])) add(titleize(r));
      if (nextStepTopic) add(titleize(nextStepTopic));
    }
    return out.slice(0, MAX_CHIPS);
  } catch {
    return (chips || []).slice(0, MAX_CHIPS);   // never break chip rendering
  }
}
