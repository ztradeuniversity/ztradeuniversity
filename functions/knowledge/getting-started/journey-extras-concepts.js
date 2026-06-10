// functions/knowledge/getting-started/journey-extras-concepts.js
// PHASE 21 — BEGINNER KNOWLEDGE FOUNDATION (category: getting-started, extras)

const F = (o) => ({
  level: 'beginner', responseObjective: 'mentor', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const GETTING_STARTED_EXTRAS_CONCEPTS = [
  F({
    id: 'how-to-learn-trading', category: 'getting-started', topic: 'How to Learn Trading', title: 'How to Learn Trading',
    concepts: ['learning', 'roadmap', 'basics'],
    questionPatterns: ['how do i learn trading', 'how do i start learning to trade', 'where do i start trading', 'how to learn forex from scratch', 'what should i learn first in trading'],
    canonical: {
      short: 'Learn in order: first the basics (how markets move, candles, support/resistance), then risk management, then one simple strategy — practised on demo until consistent. Skipping risk to chase strategies is why most beginners stall. One step at a time beats information overload.',
      deep: 'A sensible learning path: (1) foundations — what trading is, how price moves, candlesticks, trend, support/resistance; (2) risk management — stop loss, the 1–2% rule, position sizing (this is non-negotiable and comes before strategy); (3) one simple strategy you can follow mechanically; (4) demo practice and journaling until it is consistent; (5) small live size to learn emotion. Most people invert this, hunting strategies while ignoring risk, and blow up. Go slow, master each layer, and let skill compound.',
    },
    desiredOutcome: 'follow basics → risk → one strategy → demo → small live, in order',
    relevanceTags: ['learning', 'roadmap', 'beginner'],
    commonMistakes: ['collecting strategies while skipping risk management and the basics'],
    misconceptions: ['that finding the "right" strategy is the main thing to learn'],
    prerequisites: [], nextSteps: ['risk-management-basics', 'choosing-what-to-trade'], related: ['beginner-roadmap', 'demo-account'],
    followups: ['risk-management-basics'],
  }),
  F({
    id: 'first-trade-checklist', category: 'getting-started', topic: 'Your First Trade', title: 'Your First Trade Checklist',
    concepts: ['first-trade', 'checklist', 'basics'],
    questionPatterns: ['how do i place my first trade', 'what do i check before a trade', 'what is a pre trade checklist', 'how to take my first trade safely', 'what should i do before entering a trade'],
    canonical: {
      short: 'Before any trade, run a short checklist: Is there high-impact news soon? What is the higher-timeframe direction? Is there a clear level and setup? Where is my stop, and is my size only 1–2% risk? If any answer is shaky, there is no trade.',
      deep: 'A simple pre-trade checklist turns intention into discipline: (1) news — nothing high-impact about to hit; (2) direction — agrees with the higher-timeframe bias; (3) level + setup — a clear, defined trigger at a real level; (4) stop — placed beyond the structure that invalidates the idea; (5) size — calculated so the stop equals only 1–2% of the account; (6) target — at least 1.5–2x the risk. Running the same checklist every time is what makes a beginner consistent and keeps impulse trades out.',
    },
    desiredOutcome: 'run a fixed pre-trade checklist (news, direction, level, stop, size, target)',
    relevanceTags: ['first-trade', 'checklist', 'beginner'],
    commonMistakes: ['entering on impulse without checking news, stop, and size'],
    misconceptions: ['that a checklist slows you down rather than protecting you'],
    prerequisites: ['entry-and-exit', 'stop-loss-basics'], nextSteps: ['trading-journal', 'one-percent-rule'], related: ['trading-plan', 'checklist'],
    followups: ['trading-journal'],
    riskNote: 'If size, stop, or news is unclear, skip the trade — there is always another setup.',
  }),
  F({
    id: 'trading-goals-basics', category: 'getting-started', topic: 'Trading Goals', title: 'Setting Realistic Trading Goals',
    concepts: ['goals', 'mindset', 'basics'],
    questionPatterns: ['what goals should i set for trading', 'how much can i realistically make trading', 'what are realistic trading goals', 'how do i set trading goals', 'is it realistic to make money trading'],
    canonical: {
      short: 'Set process goals, not profit goals: "follow my checklist every trade", "risk 1% always", "journal daily". Money goals create pressure that breaks discipline. Realistic returns are modest and compounding — anyone promising fast riches is selling something.',
      deep: 'Beginners who chase a dollar target tend to over-risk to hit it, which is self-defeating. Process goals — followed the plan, kept risk at 1%, journaled, reviewed weekly — are fully in your control and directly produce results, while profit takes care of itself once the process is sound. Expectations should be grounded: professional traders aim for steady, compounding returns and survive drawdowns; "double my account this month" is a recipe for blowing it.',
    },
    desiredOutcome: 'set controllable process goals and hold realistic return expectations',
    relevanceTags: ['goals', 'mindset', 'beginner'],
    commonMistakes: ['setting aggressive money targets that drive over-risking'],
    misconceptions: ['that you can reliably double a small account quickly'],
    prerequisites: ['beginner-mindset'], nextSteps: ['trading-journal', 'becoming-profitable'], related: ['goal-setting', 'process-focus'],
    followups: ['becoming-profitable'],
    riskNote: 'Profit goals pressure you into over-risking — judge yourself on process instead.',
  }),
];
