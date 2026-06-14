// functions/utils/retrieval-lexicon.js
// ════════════════════════════════════════════════════════════════════════════
// RETRIEVAL LEXICON EXPANSION — raise offline retrieval quality for the new
// hot-search domains WITHOUT embeddings, WITHOUT touching the frozen scorer's
// weights or the HIGH gate. The frozen semantic-retrieval.scoreEntry maps a query
// to "concept clusters" via a small curated lexicon (account-recovery, risk, …)
// that does NOT contain the new domains (rsi, macd, fibonacci, mt5, ict, …), so a
// paraphrase like "ema cross" scores ~0 on the concept axis and can't clear HIGH.
//
// This module ADDS the missing synonym clusters and re-runs the EXACT same scoring
// formula + gate against them, then returns the BEST of {original, expanded,
// lexicon} by (confidence, score) — so it can only ever RAISE a result, never lower
// one, and never force-promotes an irrelevant match (a cluster only counts when the
// query's domain words map to a tag the concept actually carries in concepts[]).
//
// Reuses retrieval-boost.expandQuery. Pure (no I/O). Mirrors scoreEntry's weights
// (0.62 / 0.30 / 0.08) and gate (≥55 or strongDirect patternScore≥0.6/title≥0.85)
// exactly — it does not change them.
// ════════════════════════════════════════════════════════════════════════════

import { expandQuery } from './retrieval-boost.js';

// Same tokenizer/stopwords/jaccard as the frozen scorer (replicated additively).
const STOP = new Set(['the','a','an','i','do','to','my','is','of','in','it','for','and','can','what','why','how','should','am','me','you','on','with','be','get','keep','want','this','that','if','are','was','im',"i'm",'we','us']);
function toks(s) { return (String(s || '').toLowerCase().match(/[a-z']+/g) || []).filter(w => w.length > 2 && !STOP.has(w)); }
function jaccard(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); }

// ── EXPANDED SYNONYM CLUSTERS — key = the tag used in the concept's concepts[];
// value = how real users phrase it. Word-boundary matched (so 'atr' ≠ "matrix").
const CLUSTERS = {
  // Indicators
  'rsi': ['rsi', 'relative strength index'],
  'macd': ['macd', 'moving average convergence'],
  'moving-average': ['moving average', 'moving averages', 'ema', 'sma', 'ma cross', 'ema cross', 'ma crossover', 'ema crossover', '200 ema', '50 ema', 'golden cross', 'death cross'],
  'bollinger-bands': ['bollinger', 'bollinger bands', 'band squeeze', 'bollinger strategy'],
  'fibonacci': ['fibonacci', 'fib', 'fib level', 'fib levels', 'fib retracement', 'fibonacci trading', 'retracement', 'golden ratio'],
  'atr': ['atr', 'average true range', 'atr stop'],
  'vwap': ['vwap', 'volume weighted', 'volume weighted average'],
  'stochastic': ['stochastic', 'stoch indicator', 'stochastic signal'],
  'indicators': ['best indicator', 'indicator combination', 'which indicators', 'indicators together', 'best indicators', 'indicator soup'],
  // Crypto
  'spot': ['spot', 'spot trading', 'spot market'],
  'futures': ['futures', 'perpetual', 'perp', 'perps', 'futures trading'],
  'funding-rate': ['funding rate', 'funding fee', 'funding'],
  'liquidation': ['liquidation', 'liquidated', 'liq price', 'rekt', 'get liquidated', 'got liquidated'],
  'leverage': ['leverage', 'leveraged', 'high leverage', 'crypto leverage', 'margin trading'],
  'altcoins': ['altcoin', 'altcoins', 'altseason', 'alt coins'],
  'defi': ['defi', 'decentralized finance', 'decentralised finance', 'on chain', 'on-chain', 'yield farming'],
  'crypto': ['crypto', 'cryptocurrency', 'crypto trading'],
  // Beginner
  'small-account': ['100 dollars', '100 bucks', '$100', 'little money', 'small money', 'few dollars', 'small account', 'tiny account', 'low capital', 'grow small account', 'small amount', 'not much money'],
  'timeline': ['how long', 'how many years', 'when will i be profitable', 'how long to become profitable', 'how long to learn'],
  'gambling': ['gambling', 'just luck', 'same as gambling', 'is trading gambling'],
  // Strategy
  'ict': ['ict', 'inner circle', 'ict trading', 'ict concepts'],
  'smart-money': ['smart money', 'smc', 'smart money concept'],
  'order-block': ['order block', 'order blocks', 'ob trading'],
  'fair-value-gap': ['fvg', 'fair value gap', 'fair value gaps'],
  'supply-demand': ['supply demand', 'supply and demand', 'demand zone', 'supply zone'],
  'pullback': ['pullback', 'buy the dip', 'trade pullbacks', 'pullback trading'],
  'scalping': ['scalp', 'scalping', 'scalping strategy'],
  'swing': ['swing trade', 'swing trading', 'swing strategy'],
  // Platforms
  'mt5': ['mt5', 'metatrader 5', 'meta trader 5'],
  'mt4': ['mt4', 'metatrader 4', 'meta trader 4'],
  'metatrader': ['metatrader', 'meta trader'],
  'tradingview': ['tradingview', 'trading view', 'tv chart'],
  'order': ['place trade', 'take trade', 'place a trade', 'open a trade', 'enter a trade', 'put a trade', 'how to place', 'first trade'],
  'ea': ['expert advisor', 'install ea', 'ea trading'],
  'indicator': ['install indicator', 'add indicator', 'custom indicator'],
};

// Precompile word-boundary matchers per cluster.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CLUSTER_RE = Object.entries(CLUSTERS).map(([tag, terms]) => [tag, new RegExp('\\b(' + terms.map(esc).join('|') + ')\\b', 'i')]);

function queryClusters(text) {
  const s = String(text || '').toLowerCase();
  const out = new Set();
  for (const [tag, re] of CLUSTER_RE) if (re.test(s)) out.add(tag);
  return out;
}

// Replicate scoreEntry EXACTLY, but using the expanded clusters for the concept axis.
function lexiconScore(query, entry) {
  const qTok = new Set(toks(query));
  const qCon = queryClusters(query);
  const eCon = new Set(entry.concepts || []);

  let hits = 0; for (const c of qCon) if (eCon.has(c)) hits++;
  const conceptScore = qCon.size ? hits / qCon.size : 0;

  let patternScore = 0;
  for (const p of (entry.questionPatterns || [])) patternScore = Math.max(patternScore, jaccard(qTok, new Set(toks(p))));

  const titleTok = new Set(toks(`${entry.category || ''} ${entry.subcategory || ''}`));
  const titleScore = qTok.size ? [...qTok].filter(t => titleTok.has(t)).length / qTok.size : 0;

  const raw = conceptScore * 0.62 + patternScore * 0.30 + titleScore * 0.08;   // SAME weights
  const semanticScore = Math.round(Math.min(1, raw) * 100);
  const strongDirect = patternScore >= 0.6 || titleScore >= 0.85;               // SAME gate
  const confidence = (semanticScore >= 55 || strongDirect) ? 'HIGH' : semanticScore >= 30 ? 'MEDIUM' : 'LOW';
  return { semanticScore, confidence };
}

const RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 };
// Pick the best candidate by (confidence, score) — guarantees we NEVER lower an
// existing result (max), and never down-rank a strongDirect HIGH to a higher-score MEDIUM.
function best(cands) {
  return cands.reduce((b, c) => {
    if (!c) return b;
    if (!b) return c;
    const rc = RANK[c.confidence] ?? 0, rb = RANK[b.confidence] ?? 0;
    if (rc !== rb) return rc > rb ? c : b;
    return c.semanticScore > b.semanticScore ? c : b;
  }, null);
}

// Drop-in scorer for graph-retrieval.setScorer. `base` is the frozen scoreEntry.
export function makeLexiconScorer(base) {
  return (query, entry) => {
    const cands = [base(query, entry)];
    const exp = expandQuery(query);
    if (exp !== query) cands.push(base(exp, entry));
    cands.push(lexiconScore(query, entry));
    return best(cands);
  };
}
