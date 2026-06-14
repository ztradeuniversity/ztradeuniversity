// functions/utils/awareness-router.js
// ════════════════════════════════════════════════════════════════════════════
// BASIC AWARENESS ROUTER (highest priority) — a clear live-price / live-market
// instrument query ("xauusd current price", "what is gold doing", "why is nasdaq
// falling") is NEVER ambiguous and must NEVER be answered with a clarification
// menu or an unrelated concept. This detects those queries (reusing the frozen
// market-coverage registry) and returns the educational market answer plus
// related-question chips and a date/time header — so the upstream pipeline can
// override any misfired clarification.
//
// Reuses market-coverage (which reuses market-context); adds no fetch/API and never
// invents a price. Pure-ish (only reads the clock). Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

import { detectInstrumentQuery, buildInstrumentAnalysis, resolveMarketSymbol } from './market-coverage.js';

// Related next-question chips for a resolved instrument (PART 6).
function relatedChips(symbol) {
  const n = symbol.id === 'gold' ? 'Gold' : symbol.id === 'btc' ? 'BTC' : symbol.label.split(' (')[0];
  return [
    `Why is ${n} moving?`,
    `${n} support & resistance`,
    `${n} news`,
    `What drives ${n}?`,
  ];
}

function stamp(lang) {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toUTCString().slice(17, 22);   // HH:MM
  const lbl = { en: '📅 As of', ur: '📅 بتاریخ', 'ur-roman': '📅 Bataarikh', ar: '📅 بتاريخ' };
  return `_${(lbl[lang] || lbl.en)} ${date} · ${time} UTC_`;
}

// Returns { answer, chips } for a clear market/price query, or null otherwise.
export function marketAwareness({ text, marketData, calendarData, lang = 'en' } = {}) {
  const iq = detectInstrumentQuery(text);
  if (!iq) return null;
  let answer = buildInstrumentAnalysis({ symbol: iq.symbol, marketData, calendarData, lang, kind: iq.kind });
  if (!answer) return null;
  // For live-feed instruments showing a real price, prepend the date/time (PART 6).
  if (iq.symbol.liveFeed && iq.kind !== 'why' && marketData?.status === 'ok') {
    answer = `${stamp(lang)}\n\n${answer}`;
  }
  return { answer, chips: relatedChips(iq.symbol) };
}

// Exposed for callers that only need the symbol (e.g. "xauusd" recognition).
export function isMarketQuery(text) {
  return !!detectInstrumentQuery(text) || !!resolveMarketSymbol(text);
}
