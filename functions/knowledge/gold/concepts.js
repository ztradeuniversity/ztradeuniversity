// functions/knowledge/gold/concepts.js
// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: gold — anchor concepts (KOS objects). Question patterns belong to
// their concept (not separate files). Authored into kb_nodes via kb-populate.
// ════════════════════════════════════════════════════════════════════════════

export const GOLD_CONCEPTS = [
  {
    id: 'gold-analysis', category: 'gold', topic: 'Gold Analysis', level: 'beginner',
    title: 'How to Analyze Gold', intent: 'gold',
    concepts: ['gold', 'xauusd', 'analysis', 'technical analysis', 'chart reading'],
    questionPatterns: ['how do i analyze gold', 'how to read xauusd', 'gold technical analysis', 'how do i study the gold chart', 'what should i look at on gold'],
    canonical: {
      short: 'Reading gold (XAUUSD) starts on the higher timeframe: mark the daily trend, the key support and resistance zones, then drop down to see where price actually reacts. Good analysis stacks evidence — trend, structure, and a level — rather than trying to predict the next candle.',
      deep: 'Build the read in layers. First the trend from market structure, then the zones other traders watch, then context like the dollar and real yields, and finally session timing. When several of these agree at one price, you have confluence worth trading. No read is certain, so size every idea for the loss before you act.',
    },
    responseObjective: 'educate', desiredOutcome: 'a repeatable way to read gold without false certainty',
    relevanceTags: ['gold', 'analysis', 'chart'],
    guidance: { tradeProblem: true },
    commonMistakes: ['trading the 1-minute chart with no higher-timeframe context', 'forcing a view when structure is unclear'],
    recommendedTools: ['chart'], recommendedArticles: ['gold-analysis-guide'],
    related: ['gold-trend', 'support-resistance', 'market-structure'], prerequisites: ['market-structure'],
    nextSteps: ['gold-buy-sell'], followups: ['gold-trend', 'support-resistance'], journeyStages: ['journey-core'],
    riskNote: 'Analysis improves the odds, it never guarantees — risk 0.5–1% per idea.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
  {
    id: 'gold-trend', category: 'gold', topic: 'Gold Trend', level: 'beginner',
    title: 'Finding the Gold Trend', intent: 'gold',
    concepts: ['gold', 'trend', 'direction', 'bullish', 'bearish'],
    questionPatterns: ['what is the gold trend', 'is gold bullish or bearish', 'how do i find the gold trend', 'which way is gold going', 'gold trend direction'],
    canonical: {
      short: "Gold's trend is just the sequence of swings: higher highs and higher lows is an uptrend, lower highs and lower lows is a downtrend, and overlapping swings mean it is ranging. Trade with the higher-timeframe trend until structure clearly breaks.",
      deep: 'Define the trend on the timeframe you actually trade from, then check the one above it for the bigger picture. A single strong candle is not a trend change; you need a broken swing point to confirm one. Until that happens, fading the trend is fighting the crowd.',
    },
    responseObjective: 'educate', desiredOutcome: 'identify trend objectively from structure',
    relevanceTags: ['gold', 'trend'],
    guidance: { tradeProblem: true },
    misconceptions: ['one big candle means the trend has reversed'],
    recommendedTools: ['chart'],
    related: ['gold-analysis', 'market-structure'], nextSteps: ['gold-buy-sell'], followups: ['gold-analysis'],
    riskNote: 'Trends end without warning — confirm with structure, not hope.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
  {
    id: 'gold-buy-sell', category: 'gold', topic: 'Gold Buy vs Sell', level: 'intermediate',
    title: 'Should I Buy or Sell Gold', intent: 'gold',
    concepts: ['gold', 'buy', 'sell', 'entry', 'long', 'short'],
    questionPatterns: ['should i buy or sell gold', 'is it time to buy gold', 'should i go long or short on gold', 'buy or sell xauusd', 'gold entry decision'],
    canonical: {
      short: 'Whether to buy or sell gold comes down to your plan, not a feeling: trade in the direction of the trend, enter at a tested level, and only take it if the stop is small enough to risk 1% or less. If you cannot define where the idea is wrong, there is no trade.',
      deep: 'A real entry has three parts you can point to: a trend you are following, a level you are reacting at, and an invalidation that defines the stop. The reward to that stop should be worth it. Skipping any part turns a trade into a guess, and guesses are not repeatable.',
    },
    responseObjective: 'mentor', desiredOutcome: 'a rule-based entry decision instead of guessing',
    relevanceTags: ['gold', 'entry', 'decision'],
    guidance: { tradeProblem: true },
    commonMistakes: ['entering with no defined stop', 'chasing price far from the level'],
    recommendedAssessment: 'trade', recommendedTools: ['assess', 'chart'], recommendedArticles: ['gold-entry-checklist'],
    prerequisites: ['gold-analysis', 'risk-reward'], related: ['gold-trend'],
    nextSteps: ['gold-risk', 'trade-assessment'], followups: ['gold-risk', 'trade-assessment'], journeyStages: ['journey-core'],
    riskNote: 'Never enter without a defined stop and a 1% maximum risk.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
  {
    id: 'gold-risk', category: 'gold', topic: 'Gold Risk Management', level: 'beginner',
    title: 'Managing Risk on Gold', intent: 'gold',
    concepts: ['gold', 'risk', 'stop loss', 'protection'],
    questionPatterns: ['how do i manage risk on gold', 'gold stop loss', 'how much should i risk on gold', 'protect my account trading gold', 'gold risk management'],
    canonical: {
      short: 'Risk on gold is managed before entry, not after: decide the stop distance from the chart, then size the position so a loss costs about 1% of the account. Gold moves fast around news, so widen the stop or skip the trade rather than oversizing.',
      deep: 'Because gold can travel quickly, a fixed lot size hides the real danger. Anchor on the money you are willing to lose, measure the stop, and let the lot size follow. On high-volatility days, smaller is smarter — the account you protect today is the one you grow next month.',
    },
    responseObjective: 'warn', desiredOutcome: 'survive volatility by sizing for the loss first',
    relevanceTags: ['gold', 'risk'],
    guidance: { tradeProblem: true },
    recommendedTools: ['position', 'lotsize'],
    related: ['position-sizing', 'risk-reward'], nextSteps: ['position-sizing'], followups: ['position-sizing'],
    riskNote: '1% maximum risk per trade; gold can gap, so respect it.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
