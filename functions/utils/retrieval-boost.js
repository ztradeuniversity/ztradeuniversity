// functions/utils/retrieval-boost.js
// ════════════════════════════════════════════════════════════════════════════
// RETRIEVAL BOOST — lift paraphrase / natural-search matching WITHOUT embeddings,
// through the EXISTING graph-retrieval.setScorer seam. True semantic vectors still
// need the (dormant) embedding-provider + a Workers AI binding; until then this
// closes much of the gap offline: it EXPANDS a beginner/natural query with the
// canonical terms a concept's question-patterns use, scores both the original and
// the expanded query against each concept, and keeps the HIGHER score.
//
// Safety: it only ever RAISES a score (max of original vs expanded) — it can never
// reduce a match or weaken the HIGH-confidence gate, so hallucination safety is
// unchanged. Dormant-compatible: when embeddings ARE enabled, retrieve() uses the
// hybrid scorer and ignores this. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

// [pattern, canonical terms to append]. Maps how real users type → the words the
// concept question-patterns/concept-tags actually contain. Append-only (never strips).
const EXPAND = [
  [/\b(100 bucks|100 dollars|\$ ?100|hundred (bucks|dollars)|little money|small money|few dollars|small amount|low capital|tiny account|small account|not much money)\b/i, ' $100 small account capital start trade with'],
  [/\b(start|begin|trade) with (little|small|less|barely)\b/i, ' small account $100 capital start'],
  [/\bhow much (capital|money|funds?|cash)\b/i, ' how much to start capital small account need'],
  [/\b(quit (my )?job|leave my job|full[- ]?time trad|trade for a living|trading for a living|do this full time)\b/i, ' trading career quit job living full time'],
  [/\b(why (am i|do i keep|do i always) losing|keep losing|losing money|losing trades|i lose every)\b/i, ' why traders lose losing money mistakes'],
  [/\b((recover|rebuild|come back).{0,12}account|blew (my )?account|blown account|lost (my )?account|after blowing)\b/i, ' account recovery recover rebuild blew'],
  [/\b(how much can i (earn|make)|change my life|get rich|become rich|millionaire|make a living|life changing)\b/i, ' realistic earnings returns become profitable career'],
  [/\b(is (it|trading|forex|gold) (halal|haram)|allowed in islam|islamic account|swap free)\b/i, ' islamic halal swap-free permissible'],
  [/\b(am i ready|when (can|should) i go live|ready for live)\b/i, ' demo vs live going live ready'],
  [/\b(how do i (start|begin)|where do i (start|begin)|new to (trading|forex)|complete beginner|just starting)\b/i, ' how to start beginner roadmap learn'],
  [/\b(ema|sma|ma cross|ema cross|golden cross|death cross|moving average cross)\b/i, ' moving average'],
];

// Append canonical terms when a natural-phrasing trigger is present. Returns the
// original string when nothing matched (so the common path is a no-op).
export function expandQuery(text) {
  const s = String(text || '');
  let add = '';
  for (const [re, terms] of EXPAND) if (re.test(s)) add += terms;
  return add ? (s + add) : s;
}

// Generic concept tags that don't uniquely identify a concept (so they must NOT
// trigger a direct-match promotion).
const GENERIC_TAG = new Set([
  'basics', 'strategy', 'indicator', 'indicators', 'crypto', 'beginner', 'trading',
  'momentum', 'risk', 'trend', 'levels', 'platform', 'volatility', 'zones', 'intraday',
  'charts', 'account', 'execution', 'order', 'markets', 'market', 'structure', 'leverage',
]);

// A query literally containing a concept's DISTINCTIVE single-word tag (mt5, fibonacci,
// rsi, vwap, ict, liquidation, altcoins…) is an unambiguous, high-confidence match —
// the same KIND of signal as scoreEntry's strongDirect. It never promotes an UNRELATED
// low match (the tag must be present in the query), so the HIGH gate + hallucination
// safety hold; it only helps the directly-named concept clear the gate.
// Only the entry's PRIMARY tag (concepts[0]) counts — its main subject. This way a
// concept that merely lists a term as a SECONDARY tag (e.g. optimal-trade-entry
// listing 'fibonacci') can never be promoted over the concept the term defines
// (fibonacci-retracement). Two concepts can't share the same primary subject, so
// exactly the directly-named concept is helped — no wrong concept at HIGH.
function tagDirectHit(query, entry) {
  const primary = entry.concepts && entry.concepts[0];
  if (typeof primary !== 'string' || primary.length < 3) return false;
  const q = ' ' + String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  if (primary.includes('-')) {
    // Multi-word concept name (e.g. 'order-block', 'moving-average'): require the FULL
    // spaced phrase, so only the literally-named concept matches. Skip all-generic names.
    const parts = primary.split('-');
    if (parts.every(p => GENERIC_TAG.has(p))) return false;
    return q.includes(' ' + parts.join(' ') + ' ');
  }
  if (GENERIC_TAG.has(primary)) return false;
  return q.includes(' ' + primary + ' ');
}

// Wrap the base lexical scorer: score original AND expanded, keep the higher; then a
// distinctive direct tag match floors the result at HIGH. Never reduces a match.
export function makeBoostedScorer(base) {
  return (query, entry) => {
    const a = base(query, entry);
    const exp = expandQuery(query);
    let best = a;
    if (exp !== query) { const b = base(exp, entry); if (b && b.semanticScore > best.semanticScore) best = b; }
    if (best.confidence !== 'HIGH' && (tagDirectHit(query, entry) || (exp !== query && tagDirectHit(exp, entry)))) {
      return { semanticScore: Math.max(best.semanticScore, 60), confidence: 'HIGH' };
    }
    return best;
  };
}
