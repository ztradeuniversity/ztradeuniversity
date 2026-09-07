// functions/utils/trade-rescue/language.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU TRADE RESCUE — WHICH LANGUAGE THE TRADER IS ACTUALLY SPEAKING
//
// Before this layer the reply language came only from the composer's dropdown.
// A trader who typed Urdu with the selector on English got an English answer,
// and "مجھے English میں سمجھائیں" changed nothing — they had to find a selector
// to be understood, which is not how a person talks to a mentor.
//
// Three signals, in priority order:
//   1. An EXPLICIT request ("explain in English", "اردو میں بتائیں",
//      "اشرح لي بالعربية"). Honoured immediately and remembered for the rest of
//      the conversation, because a stated preference outranks everything.
//   2. The SCRIPT the trader is actually writing in, for this turn.
//   3. Whatever was resolved on an earlier turn, then the composer selector.
//
// Nothing here translates or generates text; it only decides which language the
// existing L10N strings and the existing LLM prompt should be produced in.
// ════════════════════════════════════════════════════════════════════════════

export const SUPPORTED = ['en', 'ur', 'ar'];
const norm = (l) => {
  const v = String(l || '').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(v) ? v : null;
};

// Urdu and Arabic share an alphabet, so neither letters nor words alone separate
// them reliably: Urdu's retroflex/aspirate letters (ٹ ڈ ڑ ں ے ہ گ چ پ ژ ھ) are
// decisive when present, but a short Urdu phrase like "میری Gold ki SELL" has
// none — which is why such a message used to be answered in Arabic. Score both
// signals instead: distinctive letters weigh 2, distinctive function words 1.
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/;
const URDU_ONLY  = /[ٹڈڑںےہگچپژھ]/;
// Deliberately excludes آ ؤ ئ — Urdu uses all three (آپ, کوئی).
const ARABIC_ONLY = /[ةىإأًٌٍَُِّْ]/;
const URDU_WORDS   = /(?:میری|میرا|میرے|میں|ہے|ہیں|کی|کا|کے|نے|سے|پر|نہیں|آپ|کیا|رہا|رہی|تھی|تھا|گیا|کروں|بھی|لیکن)/;
const ARABIC_WORDS = /(?:أنا|هذا|هذه|في|من|على|عند|الذي|التي|صفقة|منذ|لدي|كيف|ماذا|أفعل|لقد)/;

function scoreUrduVsArabic(s) {
  const ur = (URDU_ONLY.test(s) ? 2 : 0) + (URDU_WORDS.test(s) ? 1 : 0);
  const ar = (ARABIC_ONLY.test(s) ? 2 : 0) + (ARABIC_WORDS.test(s) ? 1 : 0);
  if (ur > ar) return 'ur';
  if (ar > ur) return 'ar';
  return URDU_ONLY.test(s) ? 'ur' : 'ar';   // tie → the decisive letters win
}

// The trader naming a language, in any of the three languages. Deliberately
// requires a "say/explain/reply/write in X" shape or an explicit "X میں" so that
// merely mentioning a language in passing does not flip the conversation.
const EXPLICIT = [
  { lang: 'en', re: /(?:in|into|speak|reply|answer|respond|explain|write|talk|say\s+it)\s+(?:in\s+)?english\b/i },
  // No trailing \b on the Urdu alternatives: JavaScript's \b is ASCII-only and
  // never fires beside Arabic-script letters, which made "English میں" unmatchable.
  { lang: 'en', re: /\benglish\s*(?:me[iy]n?|mein)\b/i },
  { lang: 'en', re: /english\s*(?:میں|مے)/i },
  { lang: 'en', re: /(?:انگریزی|انگلش)\s*میں/ },
  { lang: 'en', re: /بالإنجليزي|بالانجليزي|بالإنجليزية|بالانجليزية/ },

  { lang: 'ur', re: /(?:in|into|speak|reply|answer|respond|explain|write|talk)\s+(?:in\s+)?urdu\b/i },
  { lang: 'ur', re: /\burdu\s*(?:me[iy]n?|mein)\b/i },
  { lang: 'ur', re: /urdu\s*میں/i },
  { lang: 'ur', re: /اردو\s*میں/ },
  { lang: 'ur', re: /بالأردية|بالاردية/ },

  { lang: 'ar', re: /(?:in|into|speak|reply|answer|respond|explain|write|talk)\s+(?:in\s+)?arabic\b/i },
  { lang: 'ar', re: /(?:عربی|عربی\s*زبان)\s*میں/ },
  { lang: 'ar', re: /بالعربية|بالعربي|باللغة\s*العربية/ },
];

/** An explicit "answer me in X" instruction, or null. */
export function explicitLangRequest(text) {
  const s = String(text || '');
  if (!s.trim()) return null;
  for (const e of EXPLICIT) if (e.re.test(s)) return e.lang;
  return null;
}

/** The language the trader is writing in THIS turn, by script. */
export function detectScriptLang(text) {
  const s = String(text || '');
  if (!s.trim()) return null;
  if (ARABIC_SCRIPT.test(s)) return scoreUrduVsArabic(s);
  // Latin script: Roman Urdu is still answered in Urdu when it is unmistakable
  // ("mera trade phans gaya hai") — that is the trader's language, not English.
  if (/\b(mera|meri|mujhe|kya|kaise|nahi|nahin|hai|hoon|kar\s?(?:un|na)|phans|phansi|karun|batao|bataye|samajh)\b/i.test(s)
      && /\b(trade|position|gold|btc|buy|sell|entry|sl|tp|loss|profit)\b/i.test(s)) return 'ur';
  return 'en';
}

/**
 * Decide the reply language for this turn.
 *
 * @param {string} message      what the trader just wrote
 * @param {string} clientLang   the composer selector's value ('en'|'ur'|'ar')
 * @param {object} tradeCase    carries `lang_pref` — a preference already stated
 * @returns {{lang: string, switched: boolean, pref: string|null}}
 *          `switched` is true only when the trader asked for the change on THIS
 *          turn, so the caller can acknowledge it once instead of every turn.
 */
export function resolveLang(message, clientLang, tradeCase) {
  const sel = norm(clientLang);
  const seen = norm(tradeCase && tradeCase.lang_sel);
  const asked = explicitLangRequest(message);

  // 1. An explicit request always wins and becomes the sticky preference.
  if (asked) {
    return { lang: asked, switched: asked !== norm(tradeCase && tradeCase.lang_pref), pref: asked, sel };
  }
  // 2. Moving the selector is itself an explicit choice, so it overrides and
  //    clears any earlier spoken preference.
  if (sel && seen && sel !== seen) {
    return { lang: sel, switched: false, pref: null, sel, selChanged: true };
  }
  // 3. A preference stated earlier in this conversation is sticky.
  const pref = norm(tradeCase && tradeCase.lang_pref);
  if (pref) return { lang: pref, switched: false, pref, sel };

  // 4. Otherwise the selector is authoritative.
  //
  // The script the trader happens to be TYPING in is deliberately NOT used here.
  // It was, and that made the output language flip whenever someone mixed Roman
  // Urdu or an English trading term into a sentence. detectScriptLang() is kept
  // and exported because understanding the input still benefits from knowing the
  // script — but understanding the input and choosing the reply language are two
  // different decisions, and only the trader gets to make the second one.
  return { lang: sel || 'en', switched: false, pref: null, sel };
}
