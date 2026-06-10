// functions/knowledge/markets/more-basics-concepts.js
// PHASE 21 — BEGINNER KNOWLEDGE FOUNDATION (category: markets, additional)

const F = (o) => ({
  level: 'beginner', responseObjective: 'educate', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const MARKETS_MORE_BASICS_CONCEPTS = [
  F({
    id: 'trading-sessions-basics', category: 'markets', topic: 'Trading Sessions (Basics)', title: 'Trading Sessions',
    concepts: ['sessions', 'timing', 'basics'],
    questionPatterns: ['what are trading sessions', 'when is the market most active', 'what is the london session', 'best time to trade', 'what time should i trade gold'],
    canonical: {
      short: 'The market runs in sessions — Asia, London, and New York. London and the London–New York overlap are the most active and liquid, which is when Gold and major pairs move most. The quiet Asian session often just ranges.',
      deep: 'Forex and Gold trade 24 hours across three main sessions: Asia (quieter, often ranging), London (high activity), and New York (high activity, especially the London overlap). Volatility, spread, and the character of moves change by session, so trading at the right time matters as much as the setup — most beginners do best in the London or overlap window and avoid forcing trades in thin, choppy hours.',
    },
    desiredOutcome: 'trade during active sessions and respect quiet, choppy hours',
    relevanceTags: ['sessions', 'timing', 'beginner'],
    commonMistakes: ['forcing trades during the thin, choppy late-Asia hours'],
    misconceptions: ['that the market behaves the same at every hour'],
    prerequisites: ['financial-markets'], nextSteps: ['volatility-basics'], related: ['forex-sessions', 'london-session-gold'],
    followups: ['volatility-basics'],
  }),
  F({
    id: 'what-is-xauusd', category: 'markets', topic: 'XAU/USD (Gold)', title: 'What Is XAU/USD',
    concepts: ['gold', 'xauusd', 'basics'],
    questionPatterns: ['what is xauusd', 'what does xauusd mean', 'what is gold ticker', 'how do i trade xauusd', 'is xauusd the same as gold'],
    canonical: {
      short: 'XAU/USD is the symbol for Gold priced in US dollars — "XAU" is the code for one ounce of gold. Trading XAU/USD means taking a position on the price of gold against the dollar, which is why a stronger dollar usually pressures it.',
      deep: 'XAU/USD quotes the price of one troy ounce of gold in US dollars, so it behaves like a currency pair with gold as the base. Because it is priced in dollars, it tends to move inversely to the US dollar and to real yields, and it attracts safe-haven demand in risk-off conditions. It is more volatile than most major Forex pairs, so positions should be sized smaller and stops set by structure.',
    },
    desiredOutcome: 'understand XAU/USD as dollar-priced gold with inverse-dollar behaviour',
    relevanceTags: ['gold', 'xauusd', 'beginner'],
    commonMistakes: ['trading Gold with Forex-sized lots despite its larger swings'],
    misconceptions: ['that XAU/USD is something different from "Gold"'],
    prerequisites: ['currency-pair'], nextSteps: ['gold-analysis', 'volatility-basics'], related: ['gold-dxy-correlation', 'gold-analysis'],
    followups: ['gold-analysis'],
    riskNote: 'Gold moves more than most pairs — size down and use structure-based stops.',
  }),
  F({
    id: 'contract-for-difference', category: 'markets', topic: 'CFD', title: 'What Is a CFD',
    concepts: ['cfd', 'basics'],
    questionPatterns: ['what is a cfd', 'what does cfd mean', 'how do cfds work', 'what is contract for difference', 'do i own the asset with a cfd'],
    canonical: {
      short: 'A CFD (Contract for Difference) lets you trade the price movement of an asset without owning it — you settle the difference between your entry and exit. Most retail Gold, indices, and Forex trading is done through CFDs, which is why you can go short and use leverage.',
      deep: 'A CFD is an agreement to exchange the price difference of an asset between opening and closing a trade, so you profit or lose on the move without ever owning the underlying. This structure is what allows short selling and leverage on instruments like Gold and indices. The trade-offs to understand are leverage (magnifies both ways), overnight swap fees, and that the broker is your counterparty — so regulation matters.',
    },
    desiredOutcome: 'understand CFDs as price-movement contracts enabling shorting and leverage',
    relevanceTags: ['cfd', 'beginner'],
    commonMistakes: ['using CFD leverage to oversize because no capital is "tied up"'],
    misconceptions: ['that trading a CFD means you own the gold or shares'],
    prerequisites: ['what-is-trading'], nextSteps: ['leverage'], related: ['leverage', 'swap'],
    followups: ['leverage'],
    riskNote: 'CFD leverage magnifies losses as much as gains — keep risk at 1–2% per trade.',
  }),
  F({
    id: 'market-noise', category: 'markets', topic: 'Market Noise', title: 'Market Noise vs Signal',
    concepts: ['noise', 'structure', 'basics'],
    questionPatterns: ['what is market noise', 'what does noise mean in trading', 'why does price move randomly', 'how do i filter market noise', 'signal vs noise trading'],
    canonical: {
      short: 'Market noise is the small, random back-and-forth of price that means nothing for your trade. The "signal" is the meaningful move at a real level. Lower timeframes are mostly noise — zooming out to a higher timeframe filters it.',
      deep: 'Not every wiggle matters. Market noise is the constant minor fluctuation that tempts beginners into over-trading and panic exits; signal is the move that occurs with context — at a key level, in line with the trend. The simplest noise filter is timeframe: the 1-minute chart is mostly noise, while the H1/H4 shows the structure that actually drives decisions. Trading the higher timeframe keeps you reacting to signal, not static.',
    },
    desiredOutcome: 'filter noise by trading higher-timeframe structure',
    relevanceTags: ['noise', 'structure', 'beginner'],
    commonMistakes: ['panic-exiting on noise that never threatened the trade idea'],
    misconceptions: ['that every small move is meaningful information'],
    prerequisites: ['timeframes-basics'], nextSteps: ['chart-reading-basics'], related: ['multi-timeframe-analysis', 'patience'],
    followups: ['chart-reading-basics'],
  }),
];
