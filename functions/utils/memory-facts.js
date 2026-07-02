// functions/utils/memory-facts.js
// ════════════════════════════════════════════════════════════════════════════
// MEMORY FACTS (Phase 8A) — extract HIGH-VALUE trader facts from a message,
// assign weight, and render a NATURAL recall line (localized). Never exposes
// raw records. Pure (no I/O). Persistence happens in /api/ai-memory.
//
// High weight (remembered): preferred instrument, trader level, style, goals.
// Low weight: ordinary chatter (handled by the normal weight=3 path).
// ════════════════════════════════════════════════════════════════════════════

const INSTR = [
  [/\b(gold|xau)\b/, 'Gold'],
  [/\b(btc|bitcoin)\b/, 'Bitcoin'],
  [/\b(forex|currency|currencies|eur ?usd|gbp ?usd|usd ?jpy)\b/, 'Forex'],
];
const STYLE = [
  [/\bscalp(ing|er)?\b/, 'scalper'],
  [/\bswing\b/, 'swing'],
  [/\b(day ?trad|intraday)\b/, 'intraday'],
  [/\b(position trad|long.?term)\b/, 'position'],
];
const LEVEL = [
  [/\b(beginner|new to trading|just start|newbie)\b/, 'beginner'],
  [/\bintermediate\b/, 'intermediate'],
  [/\b(advanced|professional|experienced|\bpro\b)\b/, 'advanced'],
];

// Returns [{ category, profileField?, value?, fact, weight, pinned }]
export function extractFacts(text) {
  const s = (text || '').toLowerCase();
  const facts = [];

  const tradesPhrase = /\b(i (only|mainly|primarily|just|mostly|usually)?\s*(trade|focus on|prefer)|i'?m a|i am a|my main (instrument|pair|market)|i mostly trade|i trade only)\b/.test(s);
  if (tradesPhrase) {
    for (const [re, val] of INSTR) if (re.test(s)) {
      facts.push({ category: 'favorite-instrument', profileField: 'favorite_instrument', value: val, fact: `focuses primarily on ${val}`, weight: 8, pinned: true });
      break;
    }
  }
  if (/\b(i'?m a|i am a|i)\s*(scalp|swing|day ?trade|intraday|position)/.test(s) || /\bi'?m a (scalper|swing trader|day trader)\b/.test(s)) {
    for (const [re, val] of STYLE) if (re.test(s)) {
      facts.push({ category: 'trading-style', profileField: 'trading_style', value: val, fact: `trades as a ${val}`, weight: 7, pinned: true });
      break;
    }
  }
  if (/\b(i'?m a|i am a|i'?m|i am)\s*(beginner|intermediate|advanced)|new to trading|just start|newbie\b/.test(s)) {
    for (const [re, val] of LEVEL) if (re.test(s)) {
      facts.push({ category: 'experience', profileField: 'trader_level', value: val, fact: `is at ${val} level`, weight: 7, pinned: true });
      break;
    }
  }
  if (/\b(my goal|i want to|i'?m trying to|i am trying to|i aim to)\s+(grow|build|pass|reach|make|become|be)\b/.test(s)) {
    facts.push({ category: 'goal', fact: `goal: ${text.trim().slice(0, 140)}`, weight: 7, pinned: true });
  }
  return facts;
}

// Natural, in-language recall (Phase 8A.3). Returns '' unless a stored fact is
// relevant to the current intent. Never reveals raw memory rows.
// Phase 8C: aboutme/selfassess/fallback added so the assistant references what
// it remembers across those paths too.
const RECALL_INTENTS = new Set(['gold', 'btc', 'macro', 'assess', 'brief', 'whylosing', 'greeting', 'strategy', 'technical', 'mood', 'riskmgmt', 'aboutme', 'selfassess', 'fallback', 'career']);
export function buildMemoryRecall(profile, intent, lang = 'en') {
  if (!profile || !RECALL_INTENTS.has(intent)) return '';
  // The aboutme builder already recites the full profile — skip the one-liner
  // there to avoid repetition.
  if (intent === 'aboutme') return '';
  const instr = profile.favorite_instrument;
  const level = profile.trader_level;
  const style = profile.trading_style;
  if (!instr && !level && !style) return '';
  const L = {
    en:         instr ? `_I remember you focus primarily on **${instr}**${style ? ` (${style})` : ''} — keeping that in mind._` : style ? `_I remember you trade as a **${style}**._` : `_Picking up from your **${level}** level._`,
    ur:         instr ? `_مجھے یاد ہے کہ آپ بنیادی طور پر **${instr}** پر فوکس کرتے ہیں۔_` : style ? `_مجھے یاد ہے آپ **${style}** انداز میں trade کرتے ہیں۔_` : `_آپ کے **${level}** لیول کو مدِنظر رکھتے ہوئے۔_`,
    'ur-roman': instr ? `_Mujhe yaad hai aap mukhya tor par **${instr}** par focus karte hain._` : style ? `_Mujhe yaad hai aap **${style}** andaaz mein trade karte hain._` : `_Aap ke **${level}** level ko madde-nazar rakhte hue._`,
    ar:         instr ? `_أتذكّر أنك تركّز أساساً على **${instr}**._` : style ? `_أتذكّر أنك تتداول بأسلوب **${style}**._` : `_نواصل من مستواك **${level}**._`,
  };
  return L[lang] || L.en;
}
