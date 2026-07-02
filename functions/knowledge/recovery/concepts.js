// functions/knowledge/recovery/concepts.js
// CATEGORY: recovery — rebuilding after drawdown (trader-problem first).

export const RECOVERY_CONCEPTS = [
  {
    id: 'account-recovery', category: 'recovery', topic: 'Account Recovery', level: 'beginner',
    title: 'Recovering a Trading Account', intent: 'whylosing',
    concepts: ['recovery', 'drawdown', 'losses', 'rebuild'],
    questionPatterns: ['how do i recover my account', 'i blew my account', 'how to recover from losses', 'stop losing my account', 'rebuild my trading account'],
    canonical: {
      short: 'Recovery starts by stopping the bleeding: drop to the smallest risk possible (0.5% or less) so no streak can finish you, and rebuild the habit before the balance. Small, boring, consistent trades are how accounts genuinely come back — chasing losses is how they end.',
      deep: 'The instinct after a big loss is to size up and win it back fast; that instinct is exactly what empties accounts. Reverse it. Cut risk hard, return to your checklist, journal every trade, and rebuild confidence one disciplined trade at a time. The balance follows the habit, never the other way around.',
    },
    responseObjective: 'recover', desiredOutcome: 'a calm, capital-first recovery plan',
    relevanceTags: ['recovery', 'drawdown'],
    guidance: { traderProblem: true },
    recommendedAssessment: 'trader', recommendedTools: ['journal', 'position'],
    related: ['position-sizing', 'trading-discipline'], nextSteps: ['position-sizing'], followups: ['trader-assessment'],
    riskNote: 'Never increase risk to win it back — that is how accounts die.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
