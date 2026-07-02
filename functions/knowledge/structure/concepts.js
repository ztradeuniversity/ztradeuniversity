// functions/knowledge/structure/concepts.js
// CATEGORY: structure — market structure, support/resistance, liquidity.

export const STRUCTURE_CONCEPTS = [
  {
    id: 'market-structure', category: 'structure', topic: 'Market Structure', level: 'beginner',
    title: 'Reading Market Structure', intent: 'technical',
    concepts: ['market structure', 'swing', 'structure', 'trend'],
    questionPatterns: ['what is market structure', 'how do i read market structure', 'market structure explained', 'swing highs and lows', 'how to identify structure'],
    canonical: {
      short: 'Market structure is the map of swing highs and lows that shows who is in control. Higher highs and higher lows mean buyers lead; a broken low after an uptrend is the first clue control is shifting. Everything else — levels, entries — hangs off this skeleton.',
      deep: 'Before drawing a single level, read the structure: are swings stepping up, stepping down, or overlapping? The first broken swing point against the trend is your earliest warning of a change. Trade with the structure and your levels become high-probability; trade against it and they become traps.',
    },
    responseObjective: 'educate', desiredOutcome: 'read who controls price from structure',
    relevanceTags: ['structure', 'market structure'],
    recommendedTools: ['chart'],
    related: ['liquidity-concepts', 'gold-analysis'], nextSteps: ['support-resistance'], followups: ['support-resistance'],
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
  {
    id: 'support-resistance', category: 'structure', topic: 'Support and Resistance', level: 'beginner',
    title: 'Support and Resistance', intent: 'technical',
    concepts: ['support', 'resistance', 'levels', 'zones'],
    questionPatterns: ['what is support and resistance', 'how do i draw support resistance', 'support resistance explained', 'key levels on a chart', 'how to find s/r zones'],
    canonical: {
      short: 'Support and resistance are zones, not exact lines, where price has repeatedly reacted. They matter because other traders are watching them too. Trade the reaction at the zone with a stop just beyond it — not a blind bounce into it.',
      deep: 'Mark zones from clear reaction points on the higher timeframe and keep them few; a chart with twenty lines tells you nothing. The edge is in waiting for price to show a reaction at the zone, then entering with invalidation just past it, so a clean break simply stops you out cheaply.',
    },
    responseObjective: 'educate', desiredOutcome: 'mark and trade levels with defined invalidation',
    relevanceTags: ['levels', 'support resistance'],
    prerequisites: ['market-structure'], recommendedTools: ['chart'],
    related: ['gold-analysis'], nextSteps: ['liquidity-concepts'], followups: ['liquidity-concepts'],
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
  {
    id: 'liquidity-concepts', category: 'structure', topic: 'Liquidity Concepts', level: 'intermediate',
    title: 'Liquidity Concepts', intent: 'technical',
    concepts: ['liquidity', 'stops', 'order flow', 'smart money'],
    questionPatterns: ['what is liquidity in trading', 'what are liquidity zones', 'liquidity grab explained', 'why does price hit my stop then reverse', 'smart money liquidity'],
    canonical: {
      short: 'Liquidity is simply where lots of orders sit — usually just beyond obvious highs, lows, and round numbers. Price often reaches for that liquidity before it truly turns, which is why stops placed right at the obvious level get hit so often.',
      deep: 'Think about where the crowd puts stops: just under support, just over resistance. That cluster is fuel, and price frequently spikes through it before reversing. Placing your own invalidation beyond that obvious pool — not on top of it — keeps you in trades that shake others out.',
    },
    responseObjective: 'educate', desiredOutcome: 'place stops away from obvious liquidity',
    relevanceTags: ['liquidity', 'structure'],
    prerequisites: ['support-resistance', 'market-structure'], related: ['gold-analysis'], followups: ['support-resistance'],
    riskNote: 'Hide stops beyond liquidity, not on top of it.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
