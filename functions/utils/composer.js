// functions/utils/composer.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11B.3 — HUMAN COMPOSER. The single, final stage that turns the pipeline's
// parts (lead · prefix · body · contradiction · engagement · disclaimer) into ONE
// coherent, mentor-style answer:
//   • exactly ONE forward-looking line (drop the engagement if the body already
//     asks/invites) — no double questions,
//   • exactly ONE disclaimer (never stack),
//   • de-duplicated lines / collapsed whitespace,
//   • stable ordering.
//
// This is also the GROUNDED-LLM insertion point: setComposer(fn) lets a future
// Workers AI / Gemini / Groq composer rephrase the SAME parts (facts in → voice
// out), with the rule assembler below as the guaranteed fallback. The graph/parts
// remain the source of truth; the LLM never invents.
// Pure + async (no network in the default path).
// ════════════════════════════════════════════════════════════════════════════

let _composer = null;
export function setComposer(fn) { _composer = (typeof fn === 'function') ? fn : null; }
export function hasComposer() { return !!_composer; }

// Widened (Short Disclaimer task) to also recognize the new standardized EN
// phrase "Educational information only — always trade using your own judgment
// and risk management." — its own words "educational" + "only" are no longer
// adjacent, so the prior "educational only" phrase match alone would miss it,
// risking a duplicate. Backward compatible: every previously-matched pattern
// still matches; only "own judgment and risk management" is newly added.
const DISCLAIMER_RE = /(not financial advice|educational only|financial advice|own judgment and risk management|تعليمي|مالية|taleemi)/i;
const ENDS_INVITE   = /(\?|:)\s*$/;   // body already asks a question or opens a list

function dedupe(s) {
  const lines = String(s || '').split('\n');
  const out = []; let blank = 0; let last = null;
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '');
    if (!l.trim()) { blank++; if (blank <= 1) out.push(''); continue; }
    blank = 0;
    if (l.trim() === last) continue;          // drop consecutive duplicate line
    last = l.trim(); out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// parts: { lead, prefix, body, contradiction, engagement, disclaimer }
export async function composeAnswer(parts = {}, ctx = {}) {
  if (_composer) {
    try { const out = await _composer(parts, ctx); if (out && typeof out === 'string') return out; } catch { /* fall back to rule assembler */ }
  }
  const lead = (parts.lead || '').trim();
  const prefix = (parts.prefix || '').trim();
  const body = String(parts.body || '').trim();
  const contradiction = parts.contradiction || '';
  const disclaimerIn = parts.disclaimer || '';

  // ONE forward line: if the body already invites, suppress the extra engagement.
  const bodyInvites = ENDS_INVITE.test(body);
  const engagement = (!bodyInvites && parts.engagement) ? parts.engagement : '';

  // ONE disclaimer: skip if the body already carries one.
  const disclaimer = (disclaimerIn && !DISCLAIMER_RE.test(body)) ? disclaimerIn : '';

  let out = '';
  if (lead)   out += lead + '\n\n';
  if (prefix) out += prefix + '\n\n';
  out += body;
  if (contradiction) out += contradiction;
  if (engagement)    out += engagement;
  if (disclaimer)    out += '\n\n' + disclaimer;
  return dedupe(out);
}
