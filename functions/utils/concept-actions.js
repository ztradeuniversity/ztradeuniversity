// functions/utils/concept-actions.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 23 — CLICKABLE AI CONVERSATION (context menu, STEP 3 / 4 / 6)
// Turns the concept the assistant JUST answered from into clickable action chips —
// Learn More · Show Example · Common Mistakes · Practice · Next Step — so the
// student keeps learning without typing. Each action is GATED by what the concept
// actually carries in the graph (no marketContext → no "Show Example"), which is
// the hallucination guard (STEP 6): a chip only appears for real graph data.
//
// Complements (does not duplicate) the Phase 19 suggestion chips: those are
// follow-up QUESTIONS; these are concept-anchored ACTIONS. Pure (no I/O).
// Labels ≤5 words (mobile, STEP 5) + localized; the click query re-enters the
// engine, which already answers it from the graph. Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

const _titleize = (s) => String(s || '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());

// Localized action labels (≤5 words). The query stays English — KB answers are
// English-gated today, so the follow-up answer matches the original concept.
const LABEL = {
  learn:    { en: '📖 Learn more',      ur: '📖 مزید سیکھیں',     'ur-roman': '📖 Mazeed seekhein',  ar: '📖 اعرف المزيد' },
  example:  { en: '💡 Show example',    ur: '💡 مثال دکھائیں',    'ur-roman': '💡 Misaal dikhayein', ar: '💡 أرني مثالاً' },
  mistakes: { en: '⚠️ Common mistakes', ur: '⚠️ عام غلطیاں',      'ur-roman': '⚠️ Aam ghaltiyan',   ar: '⚠️ أخطاء شائعة' },
  practice: { en: '🎯 Practice this',   ur: '🎯 مشق کریں',        'ur-roman': '🎯 Mashq karein',     ar: '🎯 تدرّب على هذا' },
  next:     { en: '➡️ Next step',       ur: '➡️ اگلا قدم',         'ur-roman': '➡️ Agla qadam',       ar: '➡️ الخطوة التالية' },
};
const L = (k, lang) => (LABEL[k] && (LABEL[k][lang] || LABEL[k].en)) || '';

// Returns [{ label, query }] — only the actions this concept genuinely supports.
export function buildContextActions({
  topic = '', title = '', hasExample = false, hasMistakes = false,
  hasDeep = false, nextStepTopic = '', lang = 'en',
} = {}) {
  const name = String(title || topic || '').trim();
  if (!name) return [];                              // STEP 6: only for a real concept
  const subject = _titleize(name);
  const out = [];
  if (hasDeep)     out.push({ label: L('learn', lang),    query: `Explain ${subject} in more depth` });
  if (hasExample)  out.push({ label: L('example', lang),  query: `Show me a real example of ${subject}` });
  if (hasMistakes) out.push({ label: L('mistakes', lang), query: `What are common beginner mistakes with ${subject}?` });
  out.push({ label: L('practice', lang), query: `Give me a practice exercise on ${subject}` });
  if (nextStepTopic) out.push({ label: L('next', lang), query: `Explain ${_titleize(nextStepTopic)}` });
  // de-dupe by label, cap at 5 (mobile)
  const seen = new Set();
  return out.filter(a => a.label && !seen.has(a.label) && seen.add(a.label)).slice(0, 5);
}
