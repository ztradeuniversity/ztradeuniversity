// functions/knowledge/risk/concepts.js
// CATEGORY: risk — position sizing & risk-to-reward fundamentals.

export const RISK_CONCEPTS = [
  {
    id: 'position-sizing', category: 'risk', topic: 'Position Sizing', level: 'beginner',
    title: 'How to Size a Position', intent: 'riskmgmt',
    concepts: ['position size', 'lot size', 'risk per trade', 'sizing'],
    questionPatterns: ['how do i size my position', 'what lot size should i use', 'how to calculate position size', 'how big should my trade be', 'position sizing formula'],
    canonical: {
      short: 'Position size is the dial that turns a stop-loss distance into a fixed money risk. Pick the percent you will risk (1% is a sane default), measure the stop in pips or points, and let the lot size fall out of that math — never the other way around.',
      deep: 'The order that kills accounts is choosing the lot size first and discovering the risk afterwards. Flip it: risk amount divided by stop distance gives the size. Do this every single trade and your worst day becomes survivable instead of account-ending.',
    },
    responseObjective: 'educate', desiredOutcome: 'consistent money risk on every trade',
    relevanceTags: ['risk', 'position sizing'],
    guidance: { tradeProblem: true },
    commonMistakes: ['picking a round lot size out of habit', 'increasing size after a loss to win it back'],
    recommendedTools: ['position', 'calculator', 'lotsize'],
    prerequisites: ['risk-reward'], related: ['gold-risk'], nextSteps: ['trade-assessment'], followups: ['risk-reward'],
    riskNote: 'If the lot size feels exciting, it is too big.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
  {
    id: 'risk-reward', category: 'risk', topic: 'Risk to Reward', level: 'beginner',
    title: 'Risk-to-Reward Fundamentals', intent: 'riskmgmt',
    concepts: ['risk reward', 'rr', 'ratio', 'reward', 'expectancy'],
    questionPatterns: ['what is risk to reward', 'what is a good risk reward ratio', 'how do i use risk reward', 'explain rr ratio', 'risk reward fundamentals'],
    canonical: {
      short: 'Risk-to-reward compares what you risk to what you aim to make. A 1:2 means risking one to make two, so you can be right less than half the time and still grow. Set the target from structure first, then check the ratio is worth the risk before entering.',
      deep: 'Win rate alone tells you nothing — a 40% win rate at 1:2 is profitable, while 60% at 1:0.5 bleeds out. That product of win rate and reward is your expectancy, and it is what actually grows an account. Let the chart set a realistic target rather than inventing one to make the ratio look good.',
    },
    responseObjective: 'educate', desiredOutcome: 'judge trades by expectancy, not win rate',
    relevanceTags: ['risk', 'reward', 'rr'],
    misconceptions: ['a high win rate alone means you are profitable'],
    recommendedTools: ['calculator'],
    related: ['gold-buy-sell'], nextSteps: ['position-sizing'], followups: ['position-sizing'],
    riskNote: 'A great ratio with no stop is still a gamble.',
    status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en',
  },
];
