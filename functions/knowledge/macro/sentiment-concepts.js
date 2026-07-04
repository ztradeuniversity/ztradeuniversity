// functions/knowledge/macro/sentiment-concepts.js
// KPOS V3 EXPANSION — MARKET SENTIMENT & POSITIONING (category: macro)
// Fills the verified sentiment gap (put/call ratio, correlation matrix, VIX context).
// Related links point INTO orphan nodes (market-noise, position-correlation) to
// repair graph connectivity while expanding. Additive; auto-integrates.

const F = (o) => ({
  level: 'intermediate', responseObjective: 'educate', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const SENTIMENT_CONCEPTS = [
  F({
    id: 'vix-index', category: 'macro', topic: 'The VIX (Volatility Index)', title: 'The VIX Index Explained',
    concepts: ['vix', 'volatility', 'sentiment'],
    questionPatterns: ['what is the vix', 'what does the vix measure', 'vix and the stock market', 'is a high vix bearish', 'how to use the vix'],
    canonical: {
      short: 'The VIX is a "fear gauge" that measures the market\'s expected volatility over the next 30 days, derived from options prices. A rising VIX signals fear and uncertainty (often falling stocks); a low VIX signals calm and complacency.',
      deep: 'The VIX reflects how much volatility traders are pricing into S&P 500 options, so it rises when demand for protection spikes during selloffs and falls in steady uptrends. It is inversely correlated with stocks most of the time, making it a useful risk-appetite barometer: high VIX = fear and risk-off, low VIX = calm and risk-on. Extremes can be contrarian — a very high VIX often coincides with capitulation lows, a very low one with complacent tops — but the VIX measures expected size of moves, not direction, so it is a context tool, not a timing signal on its own.',
    },
    marketContext: 'A VIX spike above 30 during a selloff signals fear and often coincides with risk-off flows into safe havens like Gold and the dollar.',
    desiredOutcome: 'use the VIX as a risk-appetite and volatility gauge, reading extremes as context not precise timing',
    relevanceTags: ['vix', 'volatility', 'sentiment', 'intermediate'],
    commonMistakes: ['reading the VIX as a directional signal rather than a measure of expected volatility'],
    misconceptions: ['that a high VIX by itself tells you where price is going'],
    prerequisites: ['volatility-basics'], nextSteps: ['put-call-ratio', 'correlation-matrix'], related: ['risk-on-risk-off', 'fear-and-greed', 'market-noise'],
    followups: ['put-call-ratio'],
    riskNote: 'The VIX measures size of expected moves, not direction — use it as context, not a trigger.',
    seo: { title: 'The VIX Index Explained (Fear Gauge)', description: 'What the VIX measures, why it is called the fear gauge, its inverse link to stocks, and how to read extremes.', keywords: ['vix', 'vix index', 'volatility index', 'fear gauge'] },
  }),
  F({
    id: 'put-call-ratio', category: 'macro', topic: 'Put/Call Ratio', title: 'The Put/Call Ratio Explained',
    concepts: ['put-call-ratio', 'sentiment', 'options'],
    questionPatterns: ['what is the put call ratio', 'how to use the put call ratio', 'is a high put call ratio bullish', 'put call ratio as sentiment', 'put call ratio explained'],
    canonical: {
      short: 'The put/call ratio compares the volume of put options (bearish bets) to call options (bullish bets). A high ratio shows heavy fear/hedging; a low ratio shows heavy optimism — traders use it as a contrarian sentiment gauge.',
      deep: 'The put/call ratio measures the balance of bearish versus bullish options activity. Read as a contrarian indicator, extremes often mark turning points: an unusually high ratio (everyone buying puts) can signal excessive fear near a bottom, while a very low ratio (everyone buying calls) can signal complacency near a top. The logic is that when the crowd is maximally positioned one way, there is little fuel left to push further. It is noisy and best used at extremes with confirmation, not as a precise trigger — moderate readings carry little signal, and sentiment can stay stretched longer than expected.',
    },
    marketContext: 'A put/call ratio spiking to fearful extremes during a selloff often coincides with capitulation, hinting a bounce may be near.',
    desiredOutcome: 'use the put/call ratio as a contrarian sentiment gauge at extremes, with confirmation',
    relevanceTags: ['put-call-ratio', 'sentiment', 'options', 'intermediate'],
    commonMistakes: ['acting on moderate put/call readings that carry little signal'],
    misconceptions: ['that the ratio gives precise timing rather than contrarian context at extremes'],
    prerequisites: ['fear-and-greed'], nextSteps: ['correlation-matrix', 'vix-index'], related: ['fear-and-greed', 'market-noise'],
    followups: ['correlation-matrix'],
    riskNote: 'Sentiment can stay stretched — use extremes as context with confirmation, never as a standalone trigger.',
    seo: { title: 'The Put/Call Ratio Explained (Sentiment Indicator)', description: 'What the put/call ratio measures, why it is a contrarian sentiment gauge, and how to read extremes.', keywords: ['put call ratio', 'put/call ratio', 'options sentiment', 'contrarian indicator'] },
  }),
  F({
    id: 'correlation-matrix', category: 'macro', topic: 'Correlation Matrix', title: 'The Correlation Matrix Explained', level: 'advanced',
    concepts: ['correlation-matrix', 'correlation', 'risk'],
    questionPatterns: ['what is a correlation matrix', 'how to use a correlation matrix in trading', 'why does correlation matter for risk', 'positive vs negative correlation trading', 'correlation matrix explained'],
    canonical: {
      short: 'A correlation matrix is a table showing how strongly different markets move in relation to each other, scored from +1 (move together) to −1 (move opposite). Traders use it to avoid hidden concentration risk and to understand diversification.',
      deep: 'A correlation matrix maps the relationships between instruments — for example Gold, the dollar, and yields, or a basket of currency pairs. Values near +1 mean they rise and fall together, near −1 mean they move oppositely, and near 0 mean little relationship. Its critical use is risk management: taking several "different" trades that are actually highly correlated multiplies exposure to one theme, so a single move can hit them all at once. Correlations also shift over time, especially in a crisis when many assets suddenly move together, so the matrix is a periodic risk check, not a fixed rule.',
    },
    marketContext: 'A trader long Gold, short the dollar, and long silver may think they are diversified, but a correlation matrix reveals it is essentially one leveraged bet on a weak dollar.',
    desiredOutcome: 'use a correlation matrix to detect hidden concentration risk and understand true diversification',
    relevanceTags: ['correlation-matrix', 'correlation', 'risk', 'advanced'],
    commonMistakes: ['stacking several highly correlated trades and mistaking them for diversification'],
    misconceptions: ['that correlations are fixed and do not change in a crisis'],
    prerequisites: ['intermarket-analysis'], nextSteps: ['vix-index', 'put-call-ratio'], related: ['position-correlation', 'diversification', 'intermarket-analysis'],
    followups: ['vix-index'],
    riskNote: 'Correlations spike toward 1 in a crisis — recheck them so "diversified" trades are not one hidden bet.',
    seo: { title: 'Correlation Matrix Explained for Traders', description: 'What a correlation matrix is, how +1 to −1 values work, and why it is essential for spotting hidden concentration risk.', keywords: ['correlation matrix', 'market correlation', 'correlation trading', 'concentration risk'] },
  }),
];
