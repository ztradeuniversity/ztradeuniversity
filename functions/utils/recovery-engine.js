// functions/utils/recovery-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 14 — CONVERSATION RECOVERY ENGINE
// Handles: fragments, common typos, broken English, incomplete thoughts, and
// topic-switch signals. Recovers the effective question so downstream intent
// classification gets a clean input.
// Conservative — only acts on high-confidence corrections. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

// Common trading-domain typos (lowercase key → corrected form).
const TYPOS = {
  analysisi: 'analysis', anlaysis: 'analysis', anaylsis: 'analysis', analysys: 'analysis',
  stoploss: 'stop loss', 'stop-loss': 'stop loss',
  takeprofit: 'take profit', 'take-profit': 'take profit',
  suport: 'support', resistence: 'resistance', resistnce: 'resistance', resistanse: 'resistance',
  managment: 'management', managament: 'management',
  postion: 'position', positon: 'position',
  setupe: 'setup', steup: 'setup',
  brekaout: 'breakout', braekout: 'breakout', brekout: 'breakout',
  candlstick: 'candlestick', candelstick: 'candlestick', candelstic: 'candlestick',
  stratagy: 'strategy', stratergy: 'strategy', startegy: 'strategy', stratery: 'strategy',
  physcology: 'psychology', psycology: 'psychology', phychology: 'psychology',
  traiding: 'trading', tradeing: 'trading', trdaing: 'trading', tradign: 'trading',
  journel: 'journal', jounral: 'journal', jounal: 'journal',
  levarge: 'leverage', leverge: 'leverage', leaverage: 'leverage',
  confluance: 'confluence', confulence: 'confluence',
  profitible: 'profitable', profitabel: 'profitable',
  consistancy: 'consistency', consistancy: 'consistency',
  drawdwon: 'drawdown', drawdonw: 'drawdown',
};

// Fragment patterns: messages that are almost certainly incomplete references.
const FRAGMENT_RE = /^(what about|and what|but what|so what|ok so|right so|ok but|then what|how about|and then|also what|and so|but then)\s/i;
// Very short messages that are just a word + punctuation (e.g. "entry?", "ok?")
const TOO_SHORT_RE = /^[a-zA-Z]{1,8}[?!]?$/;

function fixTypos(text) {
  // Replace word-by-word; preserve surrounding whitespace
  return text.replace(/\b([a-zA-Z]+)\b/g, w => {
    const fix = TYPOS[w.toLowerCase()];
    if (!fix) return w;
    // Preserve original capitalisation for the first letter
    return w[0] === w[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix;
  });
}

function isFragment(text) {
  const t = text.trim();
  return FRAGMENT_RE.test(t) || (TOO_SHORT_RE.test(t) && t.length < 9);
}

// Pull the first meaningful line from the last assistant message.
function lastAssistantTopic(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const first = String(messages[i].content || '')
        .split('\n')
        .map(l => l.trim().replace(/^[#*>\-•]+\s*/, ''))
        .find(l => l.length > 20);
      if (first) return first.slice(0, 100);
    }
  }
  return '';
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────
// Returns: { text, changed, note }
// `text`    — the recovered/cleaned message (same as input when nothing changed)
// `changed` — true when recovery modified the text
// `note`    — short tag describing what was done ('', 'typo-fixed', 'fragment-expanded')

export function recoverMessage(text, messages = []) {
  const raw = String(text || '').trim();
  if (!raw) return { text: raw, changed: false, note: '' };

  // 1. Typo correction (whole-word only; never changes non-Latin or Urdu/Arabic script)
  const onlyLatin = /^[\x20-\x7E]+$/.test(raw);
  const fixed = onlyLatin ? fixTypos(raw) : raw;
  const typoFixed = fixed !== raw;

  // 2. Fragment expansion: "what about the entry?" with prior context → append topic
  if (isFragment(fixed)) {
    const topic = lastAssistantTopic(messages);
    if (topic) {
      return {
        text: fixed.trim() + ` (regarding: ${topic})`,
        changed: true,
        note: 'fragment-expanded',
      };
    }
  }

  if (typoFixed) return { text: fixed, changed: true, note: 'typo-fixed' };
  return { text: raw, changed: false, note: '' };
}
