// functions/utils/question-awareness.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 10 — QUESTION AWARENESS ENGINE.
//
// Classifies the user's message BEFORE any keyword routing, so the assistant
// reasons (intent → goal → category → depth → market-dump gate) instead of
// reflexively dumping a Gold/BTC block on a keyword match. Pure (no I/O).
//
//   analyzeQuestion(text) → {
//     intent, goal, category, depth, confidence,
//     marketDumpAllowed, statusInstrument, multi, suggestedFollowups
//   }
// ════════════════════════════════════════════════════════════════════════════

const CATEGORY_RULES = [
  ['Psychology',       /\b(fomo|revenge|fear|greed|greedy|emotion|emotional|discipline|mindset|psycholog|tilt|patience|overtrad|confidence|self.?sabotage)\b/],
  ['Risk Management',  /\b(risk management|manage risk|money management|position siz|lot size|stop loss|drawdown|risk per trade|risk reward|protect.*capital|how much.*risk)\b/],
  ['Trading Career',   /\b(become.*(profitable|trader|millionaire|rich|wealthy)|profitab|consistent|full.?time|quit my job|living from trading|trade for a living|financial freedom|make money trading|earn from trading|career)\b/],
  ['Prop Firms',       /\b(prop firm|prop.?firm|funded|ftmo|the5ers|myfunded|challenge|payout|evaluation)\b/],
  ['Brokers',          /\b(broker|exness|octa|ic markets|fp markets|hfm|xm|fbs|regulat[a-z]*|spread|commission|deposit|withdraw|leverage|account type|mt5|mt4|metatrader)\b/],
  ['Smart Money',      /\b(smart money|smc|order block|liquidity|institutional|bos|choch|fair value gap|fvg|market maker)\b/],
  ['Strategy',         /\b(strategy|system|scalp|swing|day trad|trend follow|setup|method|approach|which style)\b/],
  ['Beginner Learning',/\b(beginner|new to trading|just start|how (do|to) (i )?start|learn to trade|basics|where do i (start|begin)|roadmap|teach me)\b/],
  ['Macro News',       /\b(cpi|nfp|fomc|fed|federal reserve|interest rate|dxy|dollar index|yield|bond|inflation|economic|news event|calendar)\b/],
  ['Forex',            /\b(forex|currency|currencies|eur ?usd|gbp ?usd|usd ?jpy|major pair|fx)\b/],
  ['BTC',              /\b(btc|bitcoin|crypto|bit coin)\b/],
  ['Gold',             /\b(gold|xau|sona|emas)\b/],
  ['Market Analysis',  /\b(analysis|structure|support|resistance|trend|price action|technical|chart pattern|candle)\b/],
];

const STATUS_ASK = /\b(price|rate|today|now|currently|right now|trading at|level|trend|analysis|analyse|analyze|context|status|outlook|update|live|sentiment|mood|forecast|how is the market|how'?s the market|how is gold|how'?s gold|how is btc|how'?s btc|what.?s happening)\b/;
const DEEP_MARK  = /\b(how (do|can|to)|why|become|learn|explain|guide|step by step|roadmap|strategy|profitab|consistent|career|millionaire|wealthy|mindset|psycholog|manage|plan|difference|compare|teach)\b/;
const MARKET_CATEGORIES = new Set(['Gold', 'BTC', 'Forex', 'Market Analysis', 'Macro News']);

function detectCategory(s) {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(s)) return cat;
  return 'General Trading';
}

function detectGoal(s, category, marketDumpAllowed) {
  if (marketDumpAllowed)                 return 'status';
  if (category === 'Trading Career')     return 'wealth';
  if (category === 'Psychology')         return 'psychology';
  if (category === 'Risk Management')    return 'risk';
  if (category === 'Strategy')           return 'strategy';
  if (category === 'Smart Money')        return 'smartmoney';
  if (category === 'Beginner Learning')  return 'learn';
  if (category === 'Prop Firms')         return 'funding';
  if (category === 'Brokers')            return 'broker';
  if (/\bwhy\b/.test(s))                 return 'why';
  if (/\bhow (do|can|to)\b/.test(s))     return 'howto';
  if (/\b(what is|what are|define|meaning of)\b/.test(s)) return 'definition';
  return 'general';
}

// Which instrument (if any) a status sub-question refers to.
function statusInstrument(s) {
  if (!STATUS_ASK.test(s)) return null;
  if (/\b(gold|xau|sona|emas)\b/.test(s)) return 'Gold';
  if (/\b(btc|bitcoin|crypto)\b/.test(s)) return 'BTC';
  return null;
}

// Lightweight multi-question split.
function splitQuestions(text) {
  const parts = String(text)
    .split(/\?|\b and \b|\balso\b|;|\n/i)
    .map(p => p.trim())
    .filter(p => p.length > 2);
  return parts.length ? parts : [String(text).trim()];
}

const FOLLOWUPS = {
  Gold:               ['gold_context', 'setup', 'risk'],
  BTC:                ['btc_context', 'setup', 'risk'],
  Forex:              ['market_context', 'strategy', 'risk'],
  Psychology:         ['psychology', 'risk', 'learning'],
  'Risk Management':  ['risk', 'setup', 'psychology'],
  'Trading Career':   ['risk', 'psychology', 'learning'],
  'Beginner Learning':['learning', 'risk', 'psychology'],
  Strategy:           ['strategy', 'setup', 'risk'],
  'Smart Money':      ['chart', 'setup', 'market_context'],
  'Market Analysis':  ['chart', 'market_context', 'setup'],
  'Prop Firms':       ['risk', 'psychology', 'strategy'],
  Brokers:            ['market_context', 'risk', 'setup'],
  'Macro News':       ['market_context', 'risk', 'learning'],
  'General Trading':  ['market_context', 'learning', 'risk'],
};

export function analyzeQuestion(text = '') {
  const s = String(text).toLowerCase().trim();
  const words = s.split(/\s+/).filter(Boolean).length;

  const category = detectCategory(s);
  const statusAsk = STATUS_ASK.test(s);
  const marketDumpAllowed = statusAsk && MARKET_CATEGORIES.has(category);
  const goal = detectGoal(s, category, marketDumpAllowed);

  // Depth: market-status asks are short unless they request analysis/breakdown;
  // educational asks are deep when they carry a "how/why/learn/..." marker.
  let depth;
  if (marketDumpAllowed) depth = /\b(analysis|analyse|analyze|deep|full|detailed|breakdown|in depth|explain everything)\b/.test(s) ? 'deep' : 'short';
  else depth = (DEEP_MARK.test(s) || words > 14) ? 'deep' : 'short';

  const questions = splitQuestions(text);
  const multi = questions.length > 1 && /\b(and|also)\b|\?/.test(text);

  // The educational/advice side of a multi-question (so we can lead with a status
  // line, then answer the "how / why / should I…" part separately).
  const EDU_ADVICE = /\b(how|why|should|can i|could i|learn|become|trade|trading|buy|sell|strategy|setup|manage|start|begin|profitab|risk)\b/;
  let eduPart = null;
  if (multi) {
    const cands = questions.filter(q => EDU_ADVICE.test(q.toLowerCase()) && !/^\s*(gold|btc|bitcoin)\s*(price|rate)?\s*$/i.test(q.trim()));
    if (cands.length) eduPart = cands.sort((a, b) => b.length - a.length)[0];
  }

  return {
    intent: null,                 // engine intent decided by the planner
    goal,
    category,
    depth,
    confidence: category === 'General Trading' ? 'low' : 'high',
    marketDumpAllowed,
    statusInstrument: statusInstrument(s),
    multi,
    eduPart,
    questions,
    suggestedFollowups: FOLLOWUPS[category] || FOLLOWUPS['General Trading'],
  };
}
