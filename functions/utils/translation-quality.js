// functions/utils/translation-quality.js
// ════════════════════════════════════════════════════════════════════════════
// LANGUAGE QUALITY VALIDATION (Production Upgrade — Part 1). Gate between the
// translation layer (composer-llm.translateAnswer) and the user: rejects a bad
// translation instead of ever showing broken/mixed-language output. Pure (no
// I/O) — a deterministic set of checks, not another model call.
//
// On failure the caller (ai-chat.js) falls back to the existing Phase-34
// English-plus-honest-note behavior, so a validation failure can NEVER result
// in a worse outcome than before this layer existed — only "no translation
// this time" vs. a wrong one.
// ════════════════════════════════════════════════════════════════════════════

// Unicode script ranges for the languages that have a distinctive script.
// id/ms/vi are Latin-script (with diacritics for vi) — validated differently below.
const SCRIPT_RE = {
  bn: /[ঀ-৿]/,   // Bengali block
  th: /[฀-๿]/,   // Thai block
};

// Common English function words — a real ${lang} translation should contain
// very few of these as STANDALONE words. High density = leftover English
// fragments (the failure mode this gate exists to catch).
const ENGLISH_LEAK_WORDS = new Set([
  'the','and','is','are','was','were','this','that','these','those','with',
  'from','your','you','have','has','will','would','should','could','about',
  'because','however','therefore','please','before','after','market','trade',
  'trading','price','gold','bitcoin','risk',
]);

function wordCount(s) { return (String(s || '').trim().match(/[^\s]+/g) || []).length; }

function englishLeakRatio(text) {
  const toks = (String(text || '').toLowerCase().match(/[a-z']+/g) || []);
  if (!toks.length) return 0;
  const hits = toks.filter(t => ENGLISH_LEAK_WORDS.has(t)).length;
  return hits / toks.length;
}

// Markdown structure should survive translation roughly intact (bold markers,
// bullets, links) — a wildly different count signals the model mangled formatting.
function markdownDrift(original, translated) {
  const count = (s, re) => (String(s || '').match(re) || []).length;
  const boldO = count(original, /\*\*/g),   boldT = count(translated, /\*\*/g);
  const linkO = count(original, /\]\(/g),   linkT = count(translated, /\]\(/g);
  // Links must be preserved exactly (URLs are facts, never translated away).
  if (linkO > 0 && linkT < linkO) return true;
  // Bold-marker count should be close (allow ±2 for natural rephrasing).
  if (Math.abs(boldO - boldT) > Math.max(2, boldO * 0.5)) return true;
  return false;
}

// Main gate. Returns { ok, reasons[] }. `lang` is one of the PARTIAL_LANGS
// (id/ms/vi/bn/th) from language-intel.js.
export function validateTranslation(original, translated, lang) {
  const reasons = [];
  const o = String(original || '').trim();
  const t = String(translated || '').trim();

  if (!t) { reasons.push('empty'); return { ok: false, reasons }; }

  // 1) Script check (bn/th only have a distinctive non-Latin script to verify).
  const scriptRe = SCRIPT_RE[lang];
  if (scriptRe && !scriptRe.test(t)) reasons.push('wrong_script');

  // 2) Length sanity — catch truncation or a near-empty/garbage response.
  const oWords = wordCount(o), tWords = wordCount(t);
  if (oWords > 0) {
    const ratio = tWords / oWords;
    if (ratio < 0.35) reasons.push('too_short');
    if (ratio > 3.0)  reasons.push('too_long');
  }

  // 3) English-leakage density — real native text should rarely contain these
  // as standalone tokens (a few proper nouns like "Gold"/"Bitcoin" are expected
  // and excluded from being a hard failure by using a ratio, not a count).
  if (englishLeakRatio(t) > 0.18) reasons.push('english_leak');

  // 4) Markdown/links must survive translation intact (facts, not prose).
  if (markdownDrift(o, t)) reasons.push('markdown_drift');

  // 5) Must not be byte-identical to the English original (a no-op "translation").
  if (t === o) reasons.push('untranslated');

  return { ok: reasons.length === 0, reasons };
}
