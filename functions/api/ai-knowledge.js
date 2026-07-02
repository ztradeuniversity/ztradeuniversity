// functions/api/ai-knowledge.js
// ──────────────────────────────────────────────────────────────────────────
// GET /api/ai-knowledge?topic=psychology&q=mark+douglas&level=beginner
// ZTU AI Knowledge Base — trading books, concepts, psychology, glossary.
//
// Two-tier architecture:
//   Tier 1 — Static curated knowledge embedded here (always available)
//   Tier 2 — Custom uploaded PDFs/docs from AI Supabase (future — schema ready)
//
// Future PDF ingestion: upload PDFs → chunk + embed → store in ai_knowledge_base
// with source_file_url, chunk_index, page_number. Query via pgvector similarity.
// ──────────────────────────────────────────────────────────────────────────

import { searchKnowledge, isConfigured } from '../utils/ai-supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control':                'public, max-age=300',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };

// ── STATIC KNOWLEDGE BASE (Tier 1) ────────────────────────────────────────
// Curated trading psychology & education content. Always available.

const STATIC_KB = [

  // ── MARK DOUGLAS ──────────────────────────────────────────────────────────
  {
    id: 'md-five-truths',
    source_type: 'book', source_title: 'Trading in the Zone', source_author: 'Mark Douglas',
    title: 'The Five Fundamental Truths of Trading',
    content: `Mark Douglas identified five truths every consistent trader must internalize:

1. **Anything can happen** — markets are probabilistic, not deterministic. Any individual trade can fail regardless of how good the setup looks.
2. **You don't need to know what will happen next to make money** — you need an edge with positive expectancy, applied consistently over many trades.
3. **There is a random distribution of wins and losses** — even a 70% win-rate system will produce streaks of losses. Each trade is statistically independent.
4. **An edge is simply a higher probability of one thing happening over another** — not a certainty.
5. **Every moment in the market is unique** — your last trade's outcome should not influence how you execute the next one.`,
    summary: 'Douglas teaches that consistent profitability comes from probabilistic thinking, not prediction.',
    tags: ['psychology', 'mark-douglas', 'mindset', 'fundamentals', 'probability'],
    difficulty_level: 'intermediate',
  },
  {
    id: 'md-beliefs-system',
    source_type: 'book', source_title: 'Trading in the Zone', source_author: 'Mark Douglas',
    title: 'The Belief System — Why Traders Self-Sabotage',
    content: `Douglas explains that most trading losses aren't technical failures — they're belief failures.

The market is neutral and generates patterns of opportunity. Your **beliefs about money, risk, and loss** filter what you perceive and act on. A trader who believes "I always lose when I'm up" will find unconscious ways to make that true.

**Key insight:** Your subconscious tries to protect your beliefs. If you believe losing is catastrophic, you'll freeze at the moment you need to cut losses. If you believe markets are fair, you'll feel victimized when they aren't.

**The solution:** Develop beliefs that are aligned with market reality:
- "Losses are the cost of doing business"
- "Every trade is just one of the next 100"
- "My edge works over time, not on every trade"`,
    summary: 'Self-sabotage in trading stems from limiting beliefs, not lack of knowledge.',
    tags: ['psychology', 'mark-douglas', 'self-sabotage', 'beliefs', 'mindset'],
    difficulty_level: 'intermediate',
  },

  // ── VAN THARP ─────────────────────────────────────────────────────────────
  {
    id: 'vt-r-multiple',
    source_type: 'book', source_title: 'Trade Your Way to Financial Freedom', source_author: 'Van Tharp',
    title: 'The R-Multiple System — Measuring All Trades in Risk Units',
    content: `Van Tharp's R-Multiple system measures every trade outcome in units of initial risk (1R).

**How it works:**
- If you risk $100 on a trade (1R), a profit of $300 = **+3R**
- A loss of the full stop = **−1R**
- A loss of only half the stop = **−0.5R**

**Why this matters:**
Comparing wins and losses in dollar terms is misleading. R-multiples allow you to objectively evaluate your trading system across different position sizes and account sizes.

**Expectancy formula:** E = (Win% × Avg Win R) − (Loss% × Avg Loss R)
A system with 40% win rate but average 3R wins vs. 1R losses has: E = (0.4 × 3) − (0.6 × 1) = **+0.6R per trade**

**Key insight:** A low win rate can still be highly profitable if the R-multiple of wins is high enough.`,
    summary: 'Tharp\'s R-Multiple framework objectively measures trading performance regardless of dollar amounts.',
    tags: ['van-tharp', 'risk-management', 'r-multiple', 'position-sizing', 'expectancy'],
    difficulty_level: 'intermediate',
  },
  {
    id: 'vt-position-sizing',
    source_type: 'book', source_title: 'Trade Your Way to Financial Freedom', source_author: 'Van Tharp',
    title: 'Position Sizing™ — The Most Important Variable in Trading',
    content: `Van Tharp argues that position sizing — how much to trade — is the single most critical variable in determining long-term trading success. Two traders with identical entry/exit rules can have wildly different outcomes based solely on position sizing.

**The core principle:** Risk a fixed percentage of your account per trade (typically 1-2%).

**The calculation:**
Position Size = (Account × Risk%) ÷ (Entry − Stop Loss in pips × pip value)

**Gold example:**
- Account: $5,000 | Risk: 1% = $50
- Stop Loss: 10 pips | Gold pip value: ~$10 per 0.1 lot
- Position Size = $50 ÷ (10 × $10) = 0.05 lots

**Key insight:** Fixed-percentage risk ensures you can survive a long drawdown streak without destroying your account. At 1% risk, you'd need 100 consecutive losses to lose everything.`,
    summary: 'Position sizing is the critical variable separating profitable from unprofitable traders.',
    tags: ['van-tharp', 'position-sizing', 'risk-management', 'lot-size', 'account-management'],
    difficulty_level: 'beginner',
  },

  // ── MARKET WIZARDS ────────────────────────────────────────────────────────
  {
    id: 'mw-common-themes',
    source_type: 'book', source_title: 'Market Wizards', source_author: 'Jack Schwager',
    title: 'What the World\'s Best Traders Have in Common',
    content: `Schwager interviewed the world's top traders and found these recurring themes:

1. **Every trader has their own method** — there is no single correct approach. The key is finding what works for your personality and following it with discipline.
2. **Risk management is the priority** — the wizards talk more about losing than winning. "Cut losses short" is universal.
3. **They love what they do** — trading as a passion, not just a profession.
4. **They all had major losses early** — every wizard went through a near-wipeout that changed how they managed risk.
5. **They accept that they will be wrong** — being wrong on individual trades doesn't bother them. They focus on the portfolio over time.
6. **Patience is paramount** — waiting for high-quality setups, not forcing trades.
7. **They don't fight the market** — adapting to conditions rather than insisting on a view.`,
    summary: 'The world\'s top traders share discipline, risk management focus, and patience — not a magic strategy.',
    tags: ['market-wizards', 'schwager', 'discipline', 'risk-management', 'patience', 'professional'],
    difficulty_level: 'intermediate',
  },

  // ── TRADING PSYCHOLOGY ────────────────────────────────────────────────────
  {
    id: 'psych-fomo',
    source_type: 'psychology', source_title: 'Trading Psychology Concepts',
    title: 'FOMO — Fear of Missing Out',
    content: `FOMO (Fear of Missing Out) is one of the most costly psychological biases in trading.

**What it looks like:**
- Entering a trade because it's "already moving" without a valid setup
- Chasing price after a big move has already occurred
- Feeling anxious when watching a move you didn't take
- Averaging into trades to "catch" a move you missed

**The danger:**
When you chase, you're typically entering at the worst possible price — right before a retracement or reversal. You take maximum risk with minimum remaining reward.

**The antidote:**
- Remind yourself: "There will always be another setup." Markets generate opportunities constantly.
- Write your rules before the market opens and commit to them.
- Practice letting trades go. A skipped trade is always better than a revenge entry.
- Journal every FOMO moment — you'll quickly see the pattern.

**Key truth:** The trade you didn't take cannot hurt you. The trade you took emotionally can.`,
    summary: 'FOMO causes traders to enter at the worst prices. The cure is rule-based entries and accepting missed moves.',
    tags: ['psychology', 'fomo', 'emotional-trading', 'discipline', 'beginner'],
    difficulty_level: 'beginner',
  },
  {
    id: 'psych-revenge',
    source_type: 'psychology', source_title: 'Trading Psychology Concepts',
    title: 'Revenge Trading — The Most Dangerous Pattern',
    content: `Revenge trading is entering a trade immediately after a loss with the goal of "getting the money back" — driven by emotion, not analysis.

**Why it happens:**
Your brain treats a trading loss like a social slight or injustice. The emotional brain wants to "correct" this perceived unfairness immediately.

**The cycle:**
Loss → Emotional pain → Urgent need to recover → Impulsive entry (usually larger size) → Second loss → Deeper hole → Escalation

**Why it's destructive:**
1. You're now trading with heightened emotion = impaired judgment
2. You may increase size to recover faster = amplified losses
3. You abandon your actual strategy = no edge
4. Cascading losses can wipe accounts in a single session

**The antidote:**
- Implement a mandatory cool-down period after any loss (minimum 30-60 minutes)
- Set a daily loss limit and stop completely when hit (e.g., -3% = no more trading today)
- Write the loss in your journal BEFORE considering another trade
- Ask: "Would I take this exact setup if I hadn't just lost?" If the answer is no, don't trade.`,
    summary: 'Revenge trading is the fastest way to compound losses. Mandatory cool-downs and daily loss limits are essential.',
    tags: ['psychology', 'revenge-trading', 'emotional-trading', 'risk-management', 'discipline'],
    difficulty_level: 'beginner',
  },
  {
    id: 'psych-discipline',
    source_type: 'psychology', source_title: 'Trading Psychology Concepts',
    title: 'Discipline — The Edge Multiplier',
    content: `Even a profitable trading strategy produces losses when executed with poor discipline. Discipline multiplies (or destroys) every edge you have.

**What discipline means in trading:**
1. **Entry discipline:** Only entering setups that match your rules exactly, even when you feel certain about a non-rule trade
2. **Stop loss discipline:** Never moving a stop further away "just to give it room"
3. **Take profit discipline:** Not closing winners early out of fear, or letting them run into reversals
4. **Session discipline:** Stopping after your daily trade limit or loss limit, even when you want to keep going
5. **Review discipline:** Journaling every trade and reviewing performance weekly

**The hard truth:**
Many traders know exactly what they should do — and still don't do it. The gap between knowing and doing is closed only through deliberate practice, journaling, and building habits over months and years.

**Key reminder:** Your rules exist because you wrote them with a clear head. When you feel the urge to break them, that's exactly when you're most vulnerable.`,
    summary: 'Discipline is the multiplier of every trading edge. Rules exist to protect you from your emotional state.',
    tags: ['psychology', 'discipline', 'rules', 'trading-habits', 'intermediate'],
    difficulty_level: 'intermediate',
  },

  // ── GOLD SPECIFIC ─────────────────────────────────────────────────────────
  {
    id: 'gold-drivers',
    source_type: 'concept', source_title: 'Gold Market Education',
    title: 'What Drives Gold Prices — The Complete Framework',
    content: `Gold (XAU/USD) is driven by a combination of macro, geopolitical, and sentiment factors:

**1. Real Interest Rates (most important long-term driver)**
Gold earns no yield. When real rates (nominal yield − inflation) are low or negative, the opportunity cost of holding Gold is low → Gold-positive. Rising real rates → Gold headwind.

**2. US Dollar (DXY)**
Gold is priced in USD. Strong dollar = more expensive for foreign buyers = Gold pressure. Weak dollar = Gold tailwind. Inverse correlation is strong but not perfect.

**3. Inflation & Inflation Expectations**
Gold is historically used as an inflation hedge. Rising inflation breakeven rates (from TIPS spreads) are typically Gold-positive.

**4. Safe Haven Demand**
Geopolitical crises, financial market stress, and recession fears drive safe-haven flows into Gold. VIX spikes often coincide with Gold spikes.

**5. Central Bank Buying**
Central banks (especially BRICS nations) have been significant buyers. Large purchases structurally support Gold prices.

**6. Fed Policy Expectations**
Hawkish Fed (rate hikes) → pressure on Gold. Dovish Fed (rate cuts expected) → Gold tailwind. Watch FOMC meetings and dot plot revisions closely.

**7. ETF Flows**
Gold ETF (GLD, IAU) demand reflects institutional sentiment. Rising ETF holdings = institutional interest.`,
    summary: 'Gold is primarily driven by real yields, DXY, safe-haven demand, and Fed policy expectations.',
    tags: ['gold', 'fundamental-analysis', 'macro', 'dxy', 'interest-rates', 'education'],
    difficulty_level: 'intermediate',
  },

  // ── BTC SPECIFIC ──────────────────────────────────────────────────────────
  {
    id: 'btc-drivers',
    source_type: 'concept', source_title: 'Bitcoin Market Education',
    title: 'What Drives Bitcoin Prices — Key Factors',
    content: `Bitcoin (BTC/USD) is driven by a unique mix of macro, on-chain, and sentiment factors:

**1. Risk Appetite (Macro Correlation)**
BTC behaves like a high-beta risk asset. When stocks and risk assets rise (VIX low), BTC typically benefits. When risk-off hits (VIX spike), BTC often sells off alongside equities.

**2. Halving Cycle**
Bitcoin's supply is cut in half approximately every 4 years (halving). Historically, halvings have preceded major bull markets (typically 12-18 months post-halving). Supply shock + stable/growing demand = price pressure upward.

**3. Institutional Adoption & ETF Flows**
Bitcoin spot ETF approvals (US in Jan 2024) opened institutional access. ETF inflows/outflows represent significant price pressure.

**4. Regulatory Environment**
Regulatory clarity (or crackdowns) have historically caused significant volatility. US, EU, and Asian regulatory headlines move prices.

**5. On-Chain Metrics**
Exchange supply (decreasing = bullish), whale movements, mining hash rate, and long-term holder behavior provide demand/supply context.

**6. Dollar & Liquidity**
Like Gold, a weaker dollar and looser global liquidity conditions historically benefit BTC. Watch Fed policy and global M2 money supply.

**7. Sentiment & Narrative**
Fear & Greed Index, social media sentiment, and prevailing narratives (store of value, payments, programmable money) influence retail flows significantly.`,
    summary: 'Bitcoin is driven by risk appetite, halving cycles, institutional flows, regulatory news, and macro liquidity.',
    tags: ['bitcoin', 'btc', 'crypto', 'fundamental-analysis', 'halving', 'macro'],
    difficulty_level: 'intermediate',
  },

  // ── GLOSSARY ──────────────────────────────────────────────────────────────
  {
    id: 'glossary-rr',
    source_type: 'glossary', source_title: 'Trading Glossary',
    title: 'Risk-to-Reward Ratio (R:R)',
    content: `**Definition:** The ratio of potential profit to potential loss on a trade.

**Formula:** R:R = (Take Profit distance) ÷ (Stop Loss distance)

**Example:** Entry 3,200 | Stop Loss 3,180 (20 pip risk) | Take Profit 3,240 (40 pip reward) = **1:2 R:R**

**Why it matters:**
- With 1:2 R:R, you only need to win 34% of trades to break even (before costs)
- With 1:1 R:R, you need to win more than 50% to be profitable
- Professional traders typically seek minimum 1:1.5, ideally 1:2 or better

**Common mistake:** Traders often take 1:0.5 trades (risking more than potential gain) and wonder why they're unprofitable despite a high win rate.`,
    summary: 'R:R measures the potential return vs. risk per trade. Minimum 1:1.5 is generally advised.',
    tags: ['glossary', 'risk-reward', 'risk-management', 'beginner', 'fundamental'],
    difficulty_level: 'beginner',
  },
  {
    id: 'glossary-sl',
    source_type: 'glossary', source_title: 'Trading Glossary',
    title: 'Stop Loss — Your Risk Manager',
    content: `**Definition:** A predetermined price level at which a trade is automatically closed to prevent further losses.

**Types:**
- **Fixed Stop:** Set at a specific price (e.g., below support, above resistance)
- **ATR Stop:** Based on Average True Range — accounts for volatility
- **Structural Stop:** Placed beyond a key market structure level

**The cardinal rule:** Set your stop loss BEFORE entering a trade, based on your analysis — never based on how much you're willing to lose at the moment.

**Why traders fail with stop losses:**
1. Moving the stop further away when price approaches it ("just give it more room")
2. Not setting one at all ("I'll watch it")
3. Setting it too tight (stops out on normal volatility)
4. Setting it too wide (loses more than planned on loss)

**Key principle:** Your stop loss tells you the trade idea is wrong. When price reaches it, your analysis was incorrect — and that's fine. Every trader's analysis is sometimes wrong.`,
    summary: 'A stop loss is your predetermined exit when your trade idea proves incorrect. Always set before entry.',
    tags: ['glossary', 'stop-loss', 'risk-management', 'beginner'],
    difficulty_level: 'beginner',
  },

  // ── BEGINNER ROADMAP ──────────────────────────────────────────────────────
  {
    id: 'roadmap-beginner',
    source_type: 'roadmap', source_title: 'ZTU Beginner Trading Roadmap',
    title: 'Beginner Trading Roadmap — From Zero to Consistent',
    content: `## Phase 1: Foundation (Weeks 1-4)
- Learn how markets work: price action, candlesticks, timeframes
- Understand Gold (XAU/USD) and Bitcoin basic drivers
- Study risk management fundamentals: stop loss, take profit, lot size
- Open a demo account — do not trade real money yet

## Phase 2: Education (Weeks 5-12)
- Study technical analysis: support/resistance, trend lines, moving averages
- Learn about macro factors: DXY, yields, VIX, economic events
- Read: "Trading in the Zone" by Mark Douglas (essential)
- Read: "Trade Your Way to Financial Freedom" by Van Tharp
- Start a trading journal — write down every demo trade with reasoning

## Phase 3: Practice (Months 3-6)
- Trade only on demo, aiming for 3 consecutive profitable months
- Focus on one instrument and one strategy until consistent
- Review journal weekly — identify patterns in your mistakes
- Study your psychology — when do you break rules? Why?

## Phase 4: Transition (Month 6+)
- Only after consistent demo performance, start with minimum real capital
- Risk maximum 1% per trade (non-negotiable)
- Continue journaling. Track R-multiples, not just P&L in dollars
- Gradual capital increase as consistency is proven over 6-12 months

**The honest truth:** Consistent profitability typically requires 1-3 years of dedicated learning and practice. Anyone promising faster results is not being honest with you.`,
    summary: 'A realistic 6-12 month roadmap from complete beginner to consistent trader.',
    tags: ['roadmap', 'beginner', 'education', 'demo-trading', 'getting-started'],
    difficulty_level: 'beginner',
  },

  // ── QUOTES ────────────────────────────────────────────────────────────────
  {
    id: 'quotes-wizards',
    source_type: 'quote', source_title: 'Trader Wisdom',
    title: 'Essential Trading Quotes',
    content: `**"The goal of a successful trader is to make the best trades. Money is secondary."**
— Alexander Elder

**"I just wait until there is money lying in the corner, and all I have to do is go over there and pick it up."**
— Jim Rogers (patience over forcing trades)

**"The most important thing is to cut your losses short and let your profits run."**
— Classic trading principle, echoed by every Market Wizard

**"The stock does not know you own it."**
— Adam Smith (markets have no mercy, no memory of your pain)

**"It never was my thinking that made the big money for me. It always was my sitting."**
— Jesse Livermore (patience, not overtrading)

**"Risk comes from not knowing what you're doing."**
— Warren Buffett

**"The secret to being wrong gracefully is not suffering psychologically when you are."**
— Mark Douglas

**"Trade what you see, not what you think."**
— Trading principle (follow price, not your bias)`,
    summary: 'Timeless wisdom from legendary traders — patience, discipline, and accepting losses.',
    tags: ['quotes', 'wisdom', 'discipline', 'patience', 'legendary-traders'],
    difficulty_level: 'beginner',
  },
];

// ── SEARCH FUNCTION ────────────────────────────────────────────────────────

// Direct (non-HTTP) accessor so the AI engine can read the static KB in-process.
export function getKnowledgeEntries(opts = {}) {
  return staticSearch(opts);
}

function staticSearch({ topic, q, level, limit = 5 }) {
  let results = [...STATIC_KB];

  // Filter by topic/tags
  if (topic) {
    const t = topic.toLowerCase();
    results = results.filter(e =>
      e.tags.some(tag => tag.includes(t)) ||
      e.source_type.includes(t) ||
      e.title.toLowerCase().includes(t) ||
      (e.source_author ?? '').toLowerCase().includes(t)
    );
  }

  // Filter by difficulty level
  if (level) {
    results = results.filter(e => e.difficulty_level === level);
  }

  // Keyword search in content/title
  if (q) {
    const qLower = q.toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter(e => {
      const searchable = `${e.title} ${e.content} ${e.tags.join(' ')} ${e.source_author ?? ''}`.toLowerCase();
      return qLower.some(kw => searchable.includes(kw));
    });
  }

  return results.slice(0, limit);
}

// ── BUILD KNOWLEDGE CONTEXT STRING ────────────────────────────────────────

export function buildKnowledgeContext(entries) {
  if (!entries?.length) return null;
  const items = entries
    .slice(0, 3)
    .map(e => `### ${e.title}${e.source_author ? ` *(${e.source_author})*` : ''}\n${e.summary ?? e.content.slice(0, 300) + '...'}`)
    .join('\n\n');
  return `\n\n---\n## KNOWLEDGE BASE REFERENCES\n${items}\n---`;
}

// ── HANDLER ────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers: JSON_H });
  }

  const params = new URL(request.url).searchParams;
  const topic  = params.get('topic') ?? '';
  const q      = params.get('q') ?? '';
  const level  = params.get('level') ?? '';
  const limit  = Math.min(parseInt(params.get('limit') ?? '5', 10), 10);

  // Tier 1: Static KB search
  const staticResults = staticSearch({ topic, q, level, limit });

  // Tier 2: DB-stored knowledge (custom PDFs etc.) — requires Supabase config
  let dbResults = [];
  if (isConfigured(env) && (topic || q)) {
    const tags = [topic, ...q.split(/\s+/)].filter(Boolean);
    dbResults = await searchKnowledge(env, tags, 3).catch(() => []);
  }

  const combined = [...staticResults, ...dbResults].slice(0, limit);

  return new Response(JSON.stringify({
    status:  'ok',
    query:   { topic, q, level },
    count:   combined.length,
    entries: combined.map(e => ({
      id:           e.id,
      source_type:  e.source_type,
      source_title: e.source_title,
      source_author: e.source_author,
      title:        e.title,
      summary:      e.summary,
      content:      e.content,
      tags:         e.tags,
      difficulty_level: e.difficulty_level,
    })),
    knowledgeContext: buildKnowledgeContext(combined),
  }), { headers: JSON_H });
}
