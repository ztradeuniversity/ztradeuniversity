// functions/utils/article-categories.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE CATEGORIES (Module 3) + LANGUAGE PREP (Module 7) + search helpers.
// Pure constants & functions — no I/O, no dependencies. Future-extensible.
// ════════════════════════════════════════════════════════════════════════════

// Module 3 — category catalog (key → label + matching keywords for AI routing).
export const ARTICLE_CATEGORIES = [
  { key: 'gold',             label: 'Gold',                 keywords: ['gold', 'xau', 'xauusd', 'bullion'] },
  { key: 'bitcoin',          label: 'Bitcoin',              keywords: ['bitcoin', 'btc', 'crypto'] },
  { key: 'forex',            label: 'Forex',                keywords: ['forex', 'fx', 'currency', 'pairs'] },
  { key: 'psychology',       label: 'Trading Psychology',   keywords: ['psychology', 'mindset', 'emotion', 'fomo', 'fear', 'revenge', 'discipline'] },
  { key: 'risk-management',  label: 'Risk Management',      keywords: ['risk', 'money management', 'position size', 'lot size', 'stop loss', 'drawdown'] },
  { key: 'strategy',         label: 'Strategy',             keywords: ['strategy', 'setup', 'system', 'scalping', 'swing', 'trend'] },
  { key: 'broker-guides',    label: 'Broker Guides',        keywords: ['broker', 'account', 'deposit', 'withdrawal', 'spread', 'commission'] },
  { key: 'beginner-guides',  label: 'Beginner Guides',      keywords: ['beginner', 'basics', 'start', 'how to trade', 'learn'] },
  { key: 'advanced-guides',  label: 'Advanced Guides',      keywords: ['advanced', 'optimization', 'expectancy', 'backtest'] },
  { key: 'market-structure', label: 'Market Structure',     keywords: ['market structure', 'support', 'resistance', 'swing', 'break of structure', 'bos'] },
  { key: 'smc',              label: 'Smart Money Concepts', keywords: ['smc', 'smart money', 'order block', 'liquidity', 'fair value gap', 'fvg', 'imbalance'] },
  { key: 'news-trading',     label: 'News Trading',         keywords: ['news', 'cpi', 'nfp', 'fomc', 'event', 'calendar'] },
  { key: 'tradingview',      label: 'TradingView Tutorials',keywords: ['tradingview', 'indicator', 'trendline', 'alert'] },
  { key: 'mt5',              label: 'MT5 Tutorials',        keywords: ['mt5', 'mt4', 'metatrader', 'ea', 'expert advisor'] },
];

export const CATEGORY_KEYS = ARTICLE_CATEGORIES.map(c => c.key);

export function isValidCategory(key) {
  return CATEGORY_KEYS.includes(key);
}

// Infer the most likely category for a free-text query (AI routing helper).
export function inferCategory(text) {
  const s = (text || '').toLowerCase();
  let best = null, bestHits = 0;
  for (const c of ARTICLE_CATEGORIES) {
    const hits = c.keywords.filter(k => s.includes(k)).length;
    if (hits > bestHits) { bestHits = hits; best = c.key; }
  }
  return best;
}

// Module 7 — supported article languages (architecture only; no auto-translate).
export const ARTICLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'tr', label: 'Türkçe' },
];
export const ARTICLE_LANGUAGE_CODES = ARTICLE_LANGUAGES.map(l => l.code);

// ── SEARCH HELPERS (Module 4 fuzzy matching) ─────────────────────────────────
export function slugify(title) {
  return (title || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || ('article-' + Date.now().toString(36));
}

export function estimateReadingTime(content) {
  const words = (content || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200)); // ~200 wpm
}

const STOP = new Set(['the','a','an','of','to','in','is','it','for','on','and','or','how','do','i','my','what','why','about']);
function tokens(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
}

// Lightweight fuzzy relevance score of a query against an article record.
// Weighted: title > tags > category > summary > content. Returns 0..~100.
export function fuzzyScore(query, article) {
  const q = tokens(query);
  if (!q.length || !article) return 0;
  const fields = {
    title:    (article.title || '').toLowerCase(),
    tags:     (article.tags || []).join(' ').toLowerCase(),
    category: (article.category || '').toLowerCase(),
    summary:  (article.summary || '').toLowerCase(),
    content:  (article.content || '').toLowerCase(),
  };
  const weight = { title: 10, tags: 6, category: 5, summary: 3, content: 1 };
  let score = 0;
  for (const term of q) {
    for (const [f, text] of Object.entries(fields)) {
      if (!text) continue;
      if (text.includes(term)) score += weight[f];
      else if (term.length > 4 && text.includes(term.slice(0, term.length - 1))) score += weight[f] * 0.4; // fuzzy stem
    }
  }
  // small boost for exact phrase in title
  if (fields.title && fields.title.includes((query || '').toLowerCase().trim())) score += 8;
  return Math.round(score);
}

// Rank a candidate list by fuzzyScore, drop zero-score, cap.
export function rankArticles(query, candidates, limit = 5) {
  return (candidates || [])
    .map(a => ({ article: a, score: fuzzyScore(query, a) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => ({ ...x.article, _score: x.score }));
}
