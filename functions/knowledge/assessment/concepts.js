// functions/knowledge/assessment/concepts.js
// CATEGORY: assessment — trade (the setup) vs trader (the person) assessments.

export const ASSESSMENT_CONCEPTS = [
  {
    id: 'trade-assessment', category: 'assessment', topic: 'Trade Assessment', level: 'beginner',
    title: 'Is This a Good Trade', intent: 'assess',
    concepts: ['trade assessment', 'setup', 'evaluation', 'checklist'],
    questionPatterns: ['is this a good trade', 'assess my trade', 'should i take this setup', 'check my trade idea', 'rate this trade'],
    canonical: {
      short: 'A trade assessment checks a single idea before you risk money: is there a trend, a level, a defined stop, and a reward worth the risk? If any answer is no, the honest result is "no trade" — and that is a winning decision too.',
      deep: 'Treat it as a short checklist rather than a feeling. Trend present, level present, invalidation defined, reward worth the risk — four yes answers or you pass. The discipline of walking away from incomplete setups is what separates consistent traders from busy ones.',
    },
    responseObjective: 'assess', desiredOutcome: 'an objective go or no-go on a specific setup',
    relevanceTags: ['assessment', 'trade'],
    guidance: { tradeProblem: true },
    recommendedAssessment: 'trade', recommendedTools: ['assess', 'chart'],
    related: ['gold-buy-sell'], nextSteps: ['trader-assessment'], followups: ['trader-assessment'],
    riskNote: 'No-trade is a valid, profitable answer.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
  {
    id: 'trader-assessment', category: 'assessment', topic: 'Trader Self Assessment', level: 'intermediate',
    title: 'Trader Self Assessment', intent: 'assess',
    concepts: ['trader assessment', 'self assessment', 'habits', 'discipline'],
    questionPatterns: ['why do i keep losing', 'assess me as a trader', 'what am i doing wrong', 'why am i not profitable', 'evaluate my trading habits'],
    canonical: {
      short: 'A trader assessment looks at you, not the chart: your discipline, your risk habits, and the emotional patterns that repeat across many trades. Most blown accounts are not a strategy problem — they are a trader problem, and naming it is the first repair.',
      deep: 'A single trade can be judged by its setup; a trader is judged by patterns over dozens of trades — oversizing, moving stops, revenge entries, skipping the journal. These are habits, not bad luck, which means they are fixable once you stop blaming the system and start measuring yourself.',
    },
    responseObjective: 'assess', desiredOutcome: 'see the trader-level pattern behind the losses',
    relevanceTags: ['assessment', 'trader'],
    guidance: { traderProblem: true },
    recommendedAssessment: 'trader', recommendedTools: ['assess', 'journal'],
    related: ['trading-psychology', 'becoming-profitable'], nextSteps: ['trading-discipline'], followups: ['trading-discipline', 'trading-journal'],
    riskNote: 'Fix the trader and the strategy starts working.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
