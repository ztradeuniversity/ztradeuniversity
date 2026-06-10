// functions/knowledge/price-action/structure-basics-concepts.js
// PHASE 21 — BEGINNER KNOWLEDGE FOUNDATION (category: price-action, structure)

const F = (o) => ({
  level: 'beginner', responseObjective: 'educate', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const PRICE_ACTION_STRUCTURE_BASICS_CONCEPTS = [
  F({
    id: 'swing-high-swing-low', category: 'price-action', topic: 'Swing High / Swing Low', title: 'Swing Highs and Swing Lows',
    concepts: ['swing', 'structure', 'basics'],
    questionPatterns: ['what is a swing high', 'what is a swing low', 'what are swing points', 'how do i mark swing highs and lows', 'what is a swing in trading'],
    canonical: {
      short: 'A swing high is a peak with lower candles on each side; a swing low is a trough with higher candles on each side. These swing points are the building blocks of structure — a series of higher swing highs and lows is an uptrend.',
      deep: 'Swing highs and lows are the turning points price makes as it moves. Connecting them defines trend and structure: higher swing highs and higher swing lows = uptrend; lower ones = downtrend. They also mark logical places for stops (just beyond a swing point that would invalidate your idea) and for support/resistance. Learning to spot clean swing points on a higher timeframe is the foundation of reading any chart.',
    },
    desiredOutcome: 'mark swing points to read trend and place logical stops',
    relevanceTags: ['swing', 'structure', 'beginner'],
    commonMistakes: ['marking every tiny wiggle as a swing point and losing the bigger structure'],
    misconceptions: ['that swing points must be exact single candles rather than areas'],
    prerequisites: ['what-is-a-trend'], nextSteps: ['support-resistance', 'market-structure'], related: ['higher-highs', 'lower-lows'],
    followups: ['support-resistance'],
  }),
  F({
    id: 'higher-timeframe-bias', category: 'price-action', topic: 'Higher-Timeframe Bias', title: 'Higher-Timeframe Bias',
    concepts: ['bias', 'multi-timeframe', 'basics'],
    questionPatterns: ['what is higher timeframe bias', 'why use a higher timeframe', 'what timeframe sets direction', 'how do i find the trend direction', 'top down analysis for beginners'],
    canonical: {
      short: 'Higher-timeframe bias means deciding your direction from a bigger timeframe (like H4 or daily) before looking for entries on a smaller one. Trading in the direction of the bigger picture stacks the odds in your favour.',
      deep: 'A higher-timeframe (HTF) bias is the directional decision made from a larger chart — is the daily/H4 trending up, down, or ranging? You then drop to a lower timeframe only to time entries that agree with that bias. This "top-down" approach stops beginners from taking counter-trend trades that look tempting up close but fight the dominant flow. Direction from the HTF, precision from the LTF.',
    },
    desiredOutcome: 'set direction from the higher timeframe, time entries on the lower',
    relevanceTags: ['bias', 'multi-timeframe', 'beginner'],
    commonMistakes: ['taking lower-timeframe trades against the higher-timeframe trend'],
    misconceptions: ['that the timeframe you enter on should also set your direction'],
    prerequisites: ['timeframes-basics'], nextSteps: ['multi-timeframe-analysis'], related: ['daily-bias-formation', 'structural-bias'],
    followups: ['chart-reading-basics'],
  }),
];
