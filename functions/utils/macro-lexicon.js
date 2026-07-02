// functions/utils/macro-lexicon.js
// ════════════════════════════════════════════════════════════════════════════
// PRODUCTION UPGRADE — macro-acronym + cross-asset synonym retrieval layer.
// Audit finding: acronyms (NFP, CPI, GDP, PMI, ISM, ADP, ECB, FED, ATR, RSI,
// BOS, FVG, ICT) and ticker/name synonyms (gold/XAUUSD, silver/XAGUSD,
// bitcoin/BTC, ethereum/ETH, NFP/"Non-Farm Payrolls", CPI/"Inflation Data")
// were detected by intent routing but NOT mapped onto the concept-tag axis
// used by semantic-retrieval.scoreEntry, so a bare "what is GDP" style query
// could under-score even when a matching concept exists.
//
// Mirrors functions/utils/retrieval-lexicon.js EXACTLY: same tokenizer, same
// 0.62/0.30/0.08 weights, same HIGH gate (>=55 or strongDirect). It only ever
// RAISES a score (best-of original/expanded/cluster) — never lowers one, never
// force-promotes an unrelated concept (a cluster only counts when the query's
// mapped tag is actually present in entry.concepts[]). Pure (no I/O).
// Compose with retrieval-lexicon's makeLexiconScorer via setScorer in ai-chat.js.
// ════════════════════════════════════════════════════════════════════════════

import { expandQuery } from './retrieval-boost.js';

const STOP = new Set(['the','a','an','i','do','to','my','is','of','in','it','for','and','can','what','why','how','should','am','me','you','on','with','be','get','keep','want','this','that','if','are','was','im',"i'm",'we','us']);
function toks(s) { return (String(s || '').toLowerCase().match(/[a-z']+/g) || []).filter(w => w.length > 2 && !STOP.has(w)); }
function jaccard(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); }

// key = tag that must literally appear in a concept's concepts[]; value = the
// real-world ways users type/abbreviate that tag. Word-boundary matched.
const CLUSTERS = {
  // Macro data acronyms
  'gdp': ['gdp', 'gross domestic product'],
  'pmi': ['pmi', 'purchasing managers index', 'purchasing manager index', 'manufacturing pmi', 'services pmi'],
  'ism': ['ism', 'ism manufacturing', 'ism services', 'institute for supply management'],
  'adp': ['adp', 'adp report', 'adp jobs', 'adp employment', 'adp payrolls'],
  'ecb': ['ecb', 'european central bank'],
  'fed': ['fed', 'federal reserve', 'the fed', 'us central bank'],
  'nfp': ['nfp', 'non farm payroll', 'non farm payrolls', 'nonfarm payroll', 'nonfarm payrolls', 'jobs report', 'payrolls report'],
  'cpi': ['cpi', 'consumer price index', 'inflation data', 'inflation report', 'inflation number'],
  'fomc': ['fomc', 'federal open market committee', 'fed meeting', 'rate decision meeting'],
  // Structure / ICT acronyms
  'bos': ['bos', 'break of structure', 'break in structure'],
  'choch': ['choch', 'change of character'],
  // Cross-asset ticker synonyms
  'xauusd': ['gold', 'xauusd', 'xau/usd', 'xau usd', 'xau'],
  'xagusd': ['silver', 'xagusd', 'xag/usd', 'xag usd', 'xag'],
  'bitcoin': ['bitcoin', 'btc', 'btc/usd', 'btcusd', 'btc usd'],
  'ethereum': ['ethereum', 'eth', 'eth/usd', 'ethusd', 'eth usd'],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CLUSTER_RE = Object.entries(CLUSTERS).map(([tag, terms]) => [tag, new RegExp('\\b(' + terms.map(esc).join('|') + ')\\b', 'i')]);

function queryClusters(text) {
  const s = String(text || '').toLowerCase();
  const out = new Set();
  for (const [tag, re] of CLUSTER_RE) if (re.test(s)) out.add(tag);
  return out;
}

// Replicates scoreEntry's exact formula/gate using the macro/cross-asset clusters
// for the concept axis instead of the small CONCEPTS lexicon or hot-search clusters.
function macroScore(query, entry) {
  const qTok = new Set(toks(query));
  const qCon = queryClusters(query);
  const eCon = new Set(entry.concepts || []);

  let hits = 0; for (const c of qCon) if (eCon.has(c)) hits++;
  const conceptScore = qCon.size ? hits / qCon.size : 0;

  let patternScore = 0;
  for (const p of (entry.questionPatterns || [])) patternScore = Math.max(patternScore, jaccard(qTok, new Set(toks(p))));

  const titleTok = new Set(toks(`${entry.category || ''} ${entry.subcategory || ''}`));
  const titleScore = qTok.size ? [...qTok].filter(t => titleTok.has(t)).length / qTok.size : 0;

  const raw = conceptScore * 0.62 + patternScore * 0.30 + titleScore * 0.08;
  const semanticScore = Math.round(Math.min(1, raw) * 100);
  const strongDirect = patternScore >= 0.6 || titleScore >= 0.85;
  const confidence = (semanticScore >= 55 || strongDirect) ? 'HIGH' : semanticScore >= 30 ? 'MEDIUM' : 'LOW';
  return { semanticScore, confidence };
}

const RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 };
function best(cands) {
  return cands.reduce((b, c) => {
    if (!c) return b;
    if (!b) return c;
    const rc = RANK[c.confidence] ?? 0, rb = RANK[b.confidence] ?? 0;
    if (rc !== rb) return rc > rb ? c : b;
    return c.semanticScore > b.semanticScore ? c : b;
  }, null);
}

// Drop-in scorer for graph-retrieval.setScorer. `base` is whatever scorer is
// already installed (e.g. the lexicon scorer) — this layers on top, never replaces.
export function makeMacroScorer(base) {
  return (query, entry) => {
    const cands = [base(query, entry)];
    const exp = expandQuery(query);
    if (exp !== query) cands.push(base(exp, entry));
    cands.push(macroScore(query, entry));
    return best(cands);
  };
}

// Exported for the synonym-intelligence requirement / admin introspection.
export function macroSynonyms() { return CLUSTERS; }
