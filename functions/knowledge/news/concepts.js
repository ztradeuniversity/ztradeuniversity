// functions/knowledge/news/concepts.js
// CATEGORY: news — economic news impact on price/volatility.

export const NEWS_CONCEPTS = [
  {
    id: 'economic-news-impact', category: 'news', topic: 'Economic News Impact', level: 'beginner',
    title: 'How Economic News Affects Trading', intent: 'macro',
    concepts: ['news', 'nfp', 'cpi', 'fomc', 'volatility'],
    questionPatterns: ['how does news affect gold', 'should i trade during news', 'what is nfp and cpi', 'economic news impact on trading', 'trading around fomc'],
    canonical: {
      short: 'High-impact news — NFP, CPI, FOMC — can move gold violently in seconds, widening spreads and skipping straight past stops. The safe default is to be flat or already protected before red-folder news, and to let the dust settle before trading the aftermath.',
      deep: 'The danger in news is not direction, it is execution: spreads blow out, slippage jumps, and a stop may fill far from where you placed it. If you hold through news, do it with reduced size and eyes open; if you trade the reaction, wait for the first real structure to form rather than guessing the spike.',
    },
    responseObjective: 'warn', desiredOutcome: 'avoid getting caught oversized into news',
    relevanceTags: ['news', 'macro'],
    recommendedTools: ['library'],
    related: ['gold-analysis', 'gold-risk'], followups: ['gold-risk'],
    riskNote: 'Spreads widen and stops slip in news — reduce size or step aside.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
