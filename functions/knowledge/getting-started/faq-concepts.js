// functions/knowledge/getting-started/faq-concepts.js
// FINAL-PHASE — HIGH-SEARCH BEGINNER FAQs (category: getting-started)
// The exact questions people type into Google/YouTube that weren't yet concepts.

const F = (o) => ({
  level: 'beginner', responseObjective: 'mentor', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const GETTING_STARTED_FAQ_CONCEPTS = [
  F({
    id: 'small-account-100', category: 'getting-started', topic: 'Trading With $100', title: 'Can I Trade With $100?',
    concepts: ['small-account', 'capital', 'basics'],
    questionPatterns: ['can i trade with $100', 'can i start trading with 100 dollars', 'is $100 enough to trade', 'how much can i make with $100', 'trading with a small account'],
    canonical: {
      short: 'Yes, you can start with $100 — use a cent account so you can size trades safely and risk just 1–2% ($1–$2) per trade. Treat it as paid practice for real emotions, not a path to quick riches; the goal is learning discipline, not doubling it.',
      deep: 'A $100 account is fine to learn on if you respect the maths: risk 1–2% ($1–$2) per trade, which a cent account makes possible with tiny lot sizes. What $100 cannot do is make you rich quickly — to grow it you must not over-risk, and aggressive sizing wipes a small account fastest. Use it to experience real fear/greed cheaply, build consistency, and only add capital once your process is proven. The habit you build matters infinitely more than the starting balance.',
    },
    desiredOutcome: 'start small safely (cent account, 1–2% risk) as paid practice',
    relevanceTags: ['small-account', 'capital', 'beginner'],
    commonMistakes: ['over-risking a $100 account trying to grow it fast'],
    misconceptions: ['that a small account must be traded aggressively to be worth it'],
    prerequisites: [], nextSteps: ['one-percent-rule', 'account-types'], related: ['how-much-to-start', 'trading-goals-basics'],
    followups: ['one-percent-rule'],
    riskNote: 'A small account dies fastest from big risk — 1–2% per trade, always.',
  }),
  F({
    id: 'how-long-to-profit', category: 'getting-started', topic: 'How Long to Profit', title: 'How Long Until I Become Profitable?',
    concepts: ['timeline', 'profitability', 'basics'],
    questionPatterns: ['how long to become profitable', 'how long does it take to make money trading', 'how long to learn trading', 'when will i be profitable', 'how many years to be a profitable trader'],
    canonical: {
      short: 'Honestly, usually 1–3 years of consistent effort — most who quit early do so because they expected months, not years. The timeline shrinks with strict risk control, a journal, and mastering one setup; it stretches when you chase strategies and over-risk.',
      deep: 'There is no fixed number, but realistic ranges are 1–3 years of deliberate practice to reach consistent profitability — and many take longer or never get there because they skip risk management. What speeds it up: trading one setup until it\'s automatic, risking 1–2%, journaling every trade, and reviewing weekly to fix your repeating mistake. What slows it down: jumping between strategies, over-risking, and trading for income before you\'re consistent. Measure progress by discipline followed, not by the calendar.',
    },
    desiredOutcome: 'hold a realistic multi-year timeline and judge progress by process',
    relevanceTags: ['timeline', 'profitability', 'beginner'],
    commonMistakes: ['quitting after a few months expecting fast results'],
    misconceptions: ['that consistent profit comes in weeks with the right strategy'],
    prerequisites: [], nextSteps: ['becoming-profitable', 'beginner-mindset'], related: ['trading-goals-basics', 'how-to-learn-trading'],
    followups: ['becoming-profitable'],
  }),
  F({
    id: 'is-trading-gambling', category: 'getting-started', topic: 'Is Trading Gambling?', title: 'Is Trading Just Gambling?',
    concepts: ['gambling', 'edge', 'basics'],
    questionPatterns: ['is trading gambling', 'is forex gambling', 'is trading just luck', 'is trading the same as gambling', 'is day trading gambling'],
    canonical: {
      short: 'It becomes gambling when you trade with no plan, no stop loss, and random sizing. It becomes a skill when you trade a repeatable edge with strict risk management — taking small, defined risks for larger rewards over many trades, so the maths works in your favour.',
      deep: 'Trading and gambling differ in one thing: edge plus risk control. A gambler bets on random outcomes with no control over the odds; a trader takes a repeatable setup with positive risk-to-reward, caps each loss at 1–2%, and lets probability play out over many trades. Without a plan, a stop, and consistent sizing, trading IS gambling — and most beginners who lose were gambling without realising it. The discipline is what turns it from a casino into a profession.',
    },
    desiredOutcome: 'see edge + risk control as what separates trading from gambling',
    relevanceTags: ['gambling', 'edge', 'beginner'],
    commonMistakes: ['trading with no plan/stop and calling it trading'],
    misconceptions: ['that markets are pure luck, or that any trading is gambling'],
    prerequisites: [], nextSteps: ['risk-management-basics', 'edge-definition'], related: ['why-traders-lose', 'beginner-mindset'],
    followups: ['risk-management-basics'],
    riskNote: 'No plan + no stop + random size = gambling. A plan + a stop + fixed risk = trading.',
  }),
];
