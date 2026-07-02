// functions/knowledge/getting-started/concepts.js
// CATEGORY: getting-started — onboarding decisions (demo vs live). Neutral intent
// so retrieval relevance keeps it (no over-specific policy forces a reject).

export const GETTING_STARTED_CONCEPTS = [
  {
    id: 'demo-vs-live', category: 'getting-started', topic: 'Demo vs Live Trading', level: 'beginner',
    title: 'Demo vs Live Trading',
    concepts: ['demo', 'live', 'practice', 'beginner'],
    questionPatterns: ['should i trade demo or live', 'when should i go live', 'demo vs live trading', 'how long on a demo account', 'is demo trading useful'],
    canonical: {
      short: 'Demo is for proving your process is repeatable; live is for learning to handle real emotion. Stay on demo until you can follow your rules for several weeks, then go live with tiny size — the lesson is not the money, it is the feeling.',
      deep: 'Demo teaches mechanics and removes excuses about the platform; it cannot teach the fear of real loss. The right bridge is small live size: enough that it matters emotionally, little enough that mistakes are cheap tuition. Scale up only after consistency survives contact with real money.',
    },
    responseObjective: 'mentor', desiredOutcome: 'transition to live at the right time with small size',
    relevanceTags: ['getting started', 'demo'],
    nextSteps: ['position-sizing', 'trading-journal'], related: ['becoming-profitable'],
    journeyStages: ['journey-foundation'], followups: ['position-sizing'],
    riskNote: 'Go live small — the first goal is surviving the emotions.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
