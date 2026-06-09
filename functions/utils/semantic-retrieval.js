// functions/utils/semantic-retrieval.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.4 — SEMANTIC RETRIEVAL (foundation). Matches a user question to KB
// entries by MEANING, not exact keywords — via a curated trading concept lexicon
// + token overlap + phrase scoring. Zero infrastructure, zero cost, deterministic.
//
// Designed as a drop-in interface: scoreEntry()/semanticMatch() can later be
// backed by real embeddings (pgvector / Workers AI) without changing callers.
// Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

const STOP = new Set(['the','a','an','i','do','to','my','is','of','in','it','for','and','can','what','why','how','should','am','me','you','on','with','be','get','keep','want','this','that','if','are','was','im',"i'm",'me','we','us']);

function toks(s) {
  return (String(s || '').toLowerCase().match(/[a-z']+/g) || []).filter(w => w.length > 2 && !STOP.has(w));
}

// ── TRADING CONCEPT LEXICON — the semantic bridge ────────────────────────────
// concept → trigger phrases/terms (substring-matched, lowercase).
const CONCEPTS = {
  'account-recovery':  ['lose account', 'losing account', 'lost account', 'lost my account', 'lost my money', 'lost my capital', 'lost my funds', 'losing my account', 'stop losing my account', 'keep losing my account', 'blew account', 'blow account', 'blown account', 'blowing account', 'recover', 'recovery', 'comeback', 'rebuild', 'start over', 'stop losing account', 'wiped account', 'lost it all'],
  'risk-management':   ['stopped out', 'stop out', 'stop loss', 'sl hunt', 'risk', 'drawdown', 'position size', 'lot size', 'over risk', 'overrisk', 'risk reward', 'money management', 'protect capital', 'too tight', 'wide stop'],
  'trader-development':['become profitable', 'be profitable', 'consistently profitable', 'consistency', 'improve', 'get better', 'do better', 'develop', 'grow as a trader', 'progress', 'next level', 'profitable trader', 'master trading'],
  'psychology':        ['fomo', 'revenge', 'fear', 'scared', 'greed', 'greedy', 'discipline', 'emotional', 'tilt', 'patience', 'mindset', 'overtrade', 'hesitate', 'confidence'],
  'strategy':          ['strategy', 'system', 'setup', 'scalp', 'swing', 'trend follow', 'method', 'edge'],
  'entry-timing':      ['when to enter', 'entry', 'confirmation', 'pullback', 'breakout entry', 'too late'],
  'islamic-finance':   ['halal', 'haram', 'riba', 'usury', 'shariah', 'sharia', 'islamic account', 'swap free', 'swap-free', 'interest free', 'is forex halal', 'is trading halal'],
};

function conceptsOf(text) {
  const s = String(text || '').toLowerCase();
  const out = new Set();
  for (const [c, terms] of Object.entries(CONCEPTS)) {
    if (terms.some(t => s.includes(t))) out.add(c);
  }
  return out;
}

function jaccard(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter++;
  return inter / (aSet.size + bSet.size - inter);
}

// ── PART 4 — SEMANTIC SCORE (0–100 + confidence) ─────────────────────────────
export function scoreEntry(query, entry) {
  const qTok = new Set(toks(query));
  const qCon = conceptsOf(query);
  const eCon = new Set(entry.concepts || []);

  // concept overlap = fraction of the user's concepts found in the entry (strong signal)
  let conceptHits = 0;
  for (const c of qCon) if (eCon.has(c)) conceptHits++;
  const conceptScore = qCon.size ? conceptHits / qCon.size : 0;

  // best question-pattern token overlap (disambiguates entries sharing a concept)
  let patternScore = 0;
  for (const p of (entry.questionPatterns || [])) {
    patternScore = Math.max(patternScore, jaccard(qTok, new Set(toks(p))));
  }

  // light title/category overlap
  const titleTok = new Set(toks(`${entry.category || ''} ${entry.subcategory || ''}`));
  const titleScore = qTok.size ? [...qTok].filter(t => titleTok.has(t)).length / qTok.size : 0;

  const raw = conceptScore * 0.62 + patternScore * 0.30 + titleScore * 0.08;
  const semanticScore = Math.round(Math.min(1, raw) * 100);
  // STRONG-DIRECT match → HIGH on its own. The graph concepts carry domain words in
  // concepts[] (not the small semantic lexicon), so their conceptScore is 0 and a
  // perfect question-pattern / title match would otherwise cap at ~38 (MEDIUM) and
  // never clear the HIGH gate the chatbot requires. A near-exact pattern match (or a
  // query that essentially IS the concept title) is unambiguous, so treat it as HIGH.
  const strongDirect = patternScore >= 0.6 || titleScore >= 0.85;
  const confidence = (semanticScore >= 55 || strongDirect) ? 'HIGH'
    : semanticScore >= 30 ? 'MEDIUM' : 'LOW';
  return { semanticScore, confidence };
}

// Rank KB entries for a query (best first).
export function semanticMatch(query, entries = []) {
  if (!Array.isArray(entries) || !entries.length) return [];
  return entries
    .map(item => ({ item, ...scoreEntry(query, item) }))
    .sort((a, b) => b.semanticScore - a.semanticScore);
}
