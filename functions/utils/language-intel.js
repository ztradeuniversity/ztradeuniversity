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

// ── PARTIAL-LANGUAGE HONESTY NOTE (Production Upgrade) ──────────────────────
// AUDIT FINDING: 5 languages are selectable in the UI dropdown and detected by
// detectLanguage() (id/ms/vi/bn/th) — intent classification, retrieval, and the
// whole pipeline work for them — but engine-i18n.js's `T` only has translated
// BODIES for ur/ur-roman/ar (hasLocale() is false for these 5), so the reply
// silently falls through to the full English pipeline. That is a real answer
// (not safe-reply/unsupported), but the user selected a different language and
// got English back with no explanation — worse than the existing honest
// "unsupported script" reply pattern this file already uses for languages we
// truly can't read at all.
//
// This does NOT fake a translation (forbidden) and does NOT touch the ur/ar/en
// pipeline. It adds ONE short, honest, native-script line so the user
// understands why the substantive answer below it is in English, while full
// localized bodies for these languages are being authored (tracked, not done).
const PARTIAL_LANG_NOTE = {
  id: '_(Bahasa Indonesia penuh akan datang — jawaban lengkap di bawah ini dalam Bahasa Inggris untuk saat ini.)_',
  ms: '_(Bahasa Melayu penuh akan tersedia tidak lama lagi — jawapan penuh di bawah dalam Bahasa Inggeris buat masa ini.)_',
  vi: '_(Tiếng Việt đầy đủ sẽ sớm có — câu trả lời đầy đủ dưới đây hiện bằng tiếng Anh.)_',
  bn: '_(সম্পূর্ণ বাংলা সমর্থন শীঘ্রই আসছে — নিচের সম্পূর্ণ উত্তরটি এখন ইংরেজিতে।)_',
  th: '_(การสนับสนุนภาษาไทยแบบเต็มรูปแบบกำลังจะมาเร็วๆนี้ — คำตอบแบบเต็มด้านล่างเป็นภาษาอังกฤษในขณะนี้)_',
};

// Languages the pipeline detects + answers correctly (English body), but does
// not yet have translated response bodies for. Distinct from UNSUPPORTED above
// (those scripts get NO answer at all; these get a real, accurate English one).
export const PARTIAL_LANGS = new Set(Object.keys(PARTIAL_LANG_NOTE));

export function partialLanguageNote(lang) { return PARTIAL_LANG_NOTE[lang] || ''; }

// ── FULL TRANSLATION ORCHESTRATOR (Production Upgrade — Part 1) ────────────
// Closes the gap completely: when an LLM is configured, translate the final
// grounded English answer into the user's selected partial language and
// quality-gate it before ever showing it. When the LLM isn't configured, or
// the translation fails the quality gate, this returns null and the caller
// keeps the EXISTING Phase-34 behavior (English + honest note) — so this can
// only ever IMPROVE the outcome, never produce a worse one than before.
// Dynamic imports avoid a static import cycle (composer-llm doesn't import
// this file, but keeping the dependency one-directional and lazy is safest
// since this module is also imported from the synchronous ai-engine.js path).
export async function localizeFinalAnswer(env, text, lang) {
  if (!PARTIAL_LANGS.has(lang)) return null;
  try {
    const { llmConfigured, translateAnswer } = await import('./composer-llm.js');
    if (!llmConfigured(env)) return null;
    const { validateTranslation } = await import('./translation-quality.js');
    // Strip a previously-appended honest note (if present) before translating —
    // it would otherwise be translated into a now-false "not yet supported" claim.
    const note = partialLanguageNote(lang);
    const rawText = String(text || '');
    const source = note && rawText.includes(note) ? rawText.replace(`\n\n${note}`, '').trim() : rawText;
    const translated = await translateAnswer(env, source, lang);
    if (!translated) return null;
    const check = validateTranslation(source, translated, lang);
    if (!check.ok) {
      try {
        const { logSystemEvent } = await import('./system-log.js');
        logSystemEvent(env, { kind: 'translation', level: 'warn', message: 'translation failed quality gate', meta: { lang, reasons: check.reasons } }).catch(() => {});
      } catch {}
      return null;
    }
    return translated;
  } catch { return null; }
}
