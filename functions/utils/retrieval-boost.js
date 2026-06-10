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
];

// Append canonical terms when a natural-phrasing trigger is present. Returns the
// original string when nothing matched (so the common path is a no-op).
export function expandQuery(text) {
  const s = String(text || '');
  let add = '';
  for (const [re, terms] of EXPAND) if (re.test(s)) add += terms;
  return add ? (s + add) : s;
}

// Wrap the base lexical scorer: score original AND expanded, keep the higher. Never
// reduces a match → HIGH gate + hallucination safety preserved. `base` is scoreEntry.
export function makeBoostedScorer(base) {
  return (query, entry) => {
    const a = base(query, entry);
    const exp = expandQuery(query);
    if (exp === query) return a;                 // no expansion → single score (fast path)
    const b = base(exp, entry);
    return (b && a && b.semanticScore > a.semanticScore) ? b : a;
  };
}
