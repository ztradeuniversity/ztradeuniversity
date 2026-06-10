// functions/utils/language-intel.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 20 — MULTI-LANGUAGE INTELLIGENCE (additive STEP 7 only)
// The existing Language Lock already handles English / Urdu / Roman Urdu / Arabic
// (+ id/ms/vi/bn/th), mixed-language ("Gold buy karun ya wait karun?"), live
// switching, and per-session persistence. The ONE gap is genuinely UNSUPPORTED
// languages: detectLanguage() falls back to English, so a Chinese/Russian/Hindi
// question would get an English answer instead of a polite "here's what I speak".
//
// This adds a HIGH-PRECISION unsupported-SCRIPT detector + a polite, honest reply
// (never hallucinate, never fake a translation). It does NOT touch the existing
// detector or add a translation engine. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

// Scripts the assistant does NOT support. Deliberately excludes the supported
// scripts: Latin (en / Roman-Urdu / id / ms / vi), Arabic block (ar / ur),
// Thai, and Bengali — all handled by the existing detectLanguage().
const UNSUPPORTED = [
  ['Chinese',   /[一-鿿㐀-䶿]/],          // CJK Unified
  ['Japanese',  /[぀-ヿ]/],                       // Hiragana / Katakana
  ['Korean',    /[가-힯ᄀ-ᇿ]/],          // Hangul
  ['Russian',   /[Ѐ-ӿ]/],                       // Cyrillic
  ['Hindi',     /[ऀ-ॿ]/],                       // Devanagari (≠ Bengali)
  ['Tamil',     /[஀-௿]/],
  ['Greek',     /[Ͱ-Ͽ]/],
  ['Hebrew',    /[֐-׿]/],
];

// Returns the language label of a clearly-unsupported script, or null.
// High precision: only fires on a script we genuinely cannot serve.
export function detectUnsupportedScript(text) {
  const t = String(text || '');
  for (const [label, re] of UNSUPPORTED) if (re.test(t)) return label;
  return null;
}

// A warm, honest reply offering the supported languages (native script so the
// user recognises them). Never pretends to understand or translate.
export function unknownLanguageReply(label) {
  const who = label ? ` It looks like you may be writing in **${label}**.` : '';
  return `I'm really sorry —${who} right now I can chat in **English**, **اردو (Urdu)**, **Roman Urdu**, and **العربية (Arabic)**. ` +
         `Please send your trading question in one of those and I'll gladly help. 🙏\n\n` +
         `_English · اردو · Roman Urdu · العربية_`;
}
