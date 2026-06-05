// functions/knowledge/brokers/concepts.js
// CATEGORY: brokers — choosing a safe, regulated broker.

export const BROKER_CONCEPTS = [
  {
    id: 'broker-selection', category: 'brokers', topic: 'Broker Selection Basics', level: 'beginner',
    title: 'Broker Selection Basics', intent: 'broker',
    concepts: ['broker', 'regulation', 'withdrawal', 'execution'],
    questionPatterns: ['how do i choose a broker', 'what makes a good broker', 'is my broker safe', 'broker selection basics', 'what is a regulated broker'],
    canonical: {
      short: 'Pick a broker the way you would pick a bank: real regulation (such as FCA, ASIC, or CySEC), clean withdrawals, fair spreads, and reliable execution. Bonuses and leverage headlines are marketing — regulation and the ability to get your money out are what protect you.',
      deep: 'Start with the regulator and verify the licence on the regulator’s own register, not the broker’s site. Then test a small withdrawal early, watch spreads during normal and news conditions, and judge execution by slippage. A flashy bonus means nothing if funds are hard to withdraw.',
    },
    responseObjective: 'educate', desiredOutcome: 'choose a regulated, withdrawal-safe broker',
    relevanceTags: ['brokers', 'regulation'],
    commonMistakes: ['choosing a broker for its bonus or high leverage', 'never testing a withdrawal'],
    recommendedTools: ['library'],
    related: ['islamic-overview'], nextSteps: ['demo-vs-live'], followups: ['demo-vs-live'],
    riskNote: 'If withdrawals are hard, nothing else about the broker matters.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
