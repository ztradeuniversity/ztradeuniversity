// functions/knowledge/getting-started/basics-concepts.js
// PHASE 21 — BEGINNER KNOWLEDGE FOUNDATION (category: getting-started)
// The first practical steps: demo, live, journaling, testing, and what to trade.

const F = (o) => ({
  level: 'beginner', responseObjective: 'mentor', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const GETTING_STARTED_BASICS_CONCEPTS = [
  F({
    id: 'demo-account', category: 'getting-started', topic: 'Demo Account', title: 'What Is a Demo Account',
    concepts: ['demo', 'practice', 'basics'],
    questionPatterns: ['what is a demo account', 'what does demo account mean', 'should i start on demo', 'how long should i use a demo account', 'is demo trading useful'],
    canonical: {
      short: 'A demo account trades real market prices with fake money, so you can learn the platform and test a strategy with zero financial risk. Use it to prove you can follow your rules for several weeks before risking a cent.',
      deep: 'A demo account mirrors live pricing but uses virtual funds, making it the ideal place to learn order placement, build a routine, and confirm a strategy is repeatable. Its one limitation is emotional — fake money does not trigger real fear or greed. So the right use is mechanical mastery and consistency on demo first, then a move to small live size to learn the emotional side. Spending months only on demo, however, delays the lesson that only real money teaches.',
    },
    desiredOutcome: 'use demo to master mechanics and prove consistency before going live',
    relevanceTags: ['demo', 'practice', 'beginner'],
    commonMistakes: ['trading huge demo sizes you would never risk live, learning bad habits'],
    misconceptions: ['that demo success guarantees live success'],
    prerequisites: [], nextSteps: ['live-account', 'trading-journal'], related: ['demo-vs-live', 'forward-testing'],
    followups: ['live-account'],
  }),
  F({
    id: 'live-account', category: 'getting-started', topic: 'Live Account', title: 'Going Live (Live Account)',
    concepts: ['live', 'practice', 'basics'],
    questionPatterns: ['what is a live account', 'when should i go live', 'how much money to start live trading', 'should i trade real money', 'how do i know im ready for live'],
    canonical: {
      short: 'A live account uses real money, which adds the one thing demo cannot teach: emotion. Go live only after consistency on demo, and start with tiny size — the goal of your first live months is learning to handle real feelings, not making money.',
      deep: 'A live account introduces real fear and greed, which is exactly why the bridge from demo must be deliberate: go live once you can follow your rules consistently, and start with the smallest size that still feels real. Early live trading is tuition in emotional control — expect mistakes and keep risk at 1% so they are cheap. Scale size up only after a long stretch of disciplined, profitable execution at the small size.',
    },
    desiredOutcome: 'transition to live small, treating early live as emotional training',
    relevanceTags: ['live', 'practice', 'beginner'],
    commonMistakes: ['going live with large size too early, before consistency exists'],
    misconceptions: ['that a bigger account is the way to make trading "worth it"'],
    prerequisites: ['demo-account'], nextSteps: ['one-percent-rule', 'trading-journal'], related: ['demo-vs-live', 'risk-management-basics'],
    followups: ['one-percent-rule'],
    riskNote: 'Start live with the smallest size that still feels real — survive the emotions first.',
  }),
  F({
    id: 'forward-testing', category: 'getting-started', topic: 'Forward Testing', title: 'What Is Forward Testing',
    concepts: ['forward-testing', 'testing', 'basics'],
    questionPatterns: ['what is forward testing', 'what does forward testing mean', 'forward testing vs backtesting', 'how do i forward test a strategy', 'should i forward test'],
    canonical: {
      short: 'Forward testing is trading a strategy in real time on demo (or tiny live size) to see if it works on live, unseen price — the step after backtesting. It checks that a strategy survives real conditions like spread and slippage, not just historical data.',
      deep: 'Forward testing runs a strategy live, going forward, on demo or minimal size, to validate it on data it was never built on. Backtesting proves an idea worked on the past; forward testing proves it still works in real time, including the frictions historical tests often miss — spread, slippage, and your own execution. Run a strategy forward for a meaningful sample before trusting real size; if it holds up, scale gradually.',
    },
    desiredOutcome: 'validate a strategy in real time before committing real size',
    relevanceTags: ['forward-testing', 'testing', 'beginner'],
    commonMistakes: ['scaling up size right after a good backtest, skipping forward testing'],
    misconceptions: ['that a great backtest guarantees live results'],
    prerequisites: ['backtesting'], nextSteps: ['trading-journal'], related: ['backtesting', 'demo-vs-live'],
    followups: ['trading-journal'],
  }),
  F({
    id: 'choosing-what-to-trade', category: 'getting-started', topic: 'Choosing What to Trade', title: 'Choosing What to Trade',
    concepts: ['markets', 'focus', 'basics'],
    questionPatterns: ['what should i trade as a beginner', 'which market is best for beginners', 'should i trade gold or forex', 'how many pairs should i trade', 'what instrument to start with'],
    canonical: {
      short: 'Pick one instrument and learn it deeply — Gold or a major Forex pair like EUR/USD are common beginner choices. Mastering one market\'s behaviour beats spreading yourself thin across many, which only multiplies the noise and mistakes.',
      deep: 'Beginners progress fastest by focusing on a single liquid instrument whose rhythm they can learn — Gold (XAU/USD) or a major pair such as EUR/USD are sensible starts, with tight spreads and clean structure. Trading many markets at once divides attention, dilutes screen-time learning, and increases correlated risk. Master one, build a routine around its active session, and only add a second instrument once the first is consistently traded.',
    },
    desiredOutcome: 'focus on one liquid instrument until it is consistently traded',
    relevanceTags: ['markets', 'focus', 'beginner'],
    commonMistakes: ['watching many instruments at once and mastering none'],
    misconceptions: ['that trading more markets means more opportunity for a beginner'],
    prerequisites: ['financial-markets'], nextSteps: ['trading-routine-basics', 'trading-plan'], related: ['trading-style-fit', 'gold-analysis'],
    followups: ['trading-routine-basics'],
  }),
  F({
    id: 'trading-routine-basics', category: 'getting-started', topic: 'Trading Routine (Basics)', title: 'Building a Trading Routine',
    concepts: ['routine', 'discipline', 'basics'],
    questionPatterns: ['what is a trading routine', 'how do i build a trading routine', 'what should my daily trading routine be', 'trading routine for beginners', 'how to be consistent in trading'],
    canonical: {
      short: 'A trading routine is the repeatable set of steps you run every session: check the news calendar, mark key levels, wait for your setup, manage risk, and review afterward. Consistency in process is what produces consistency in results.',
      deep: 'A simple routine turns trading from reaction into process: before the session, check the economic calendar and mark higher-timeframe levels; during it, only act on your defined setup with pre-set stop and target; after it, journal the trades and the decisions. Trading the same checklist every day removes improvisation and builds the discipline that separates consistent traders from streaky ones. The routine matters more than any single indicator.',
    },
    desiredOutcome: 'run the same pre/during/post checklist every session',
    relevanceTags: ['routine', 'discipline', 'beginner'],
    commonMistakes: ['improvising every session instead of following a fixed checklist'],
    misconceptions: ['that consistency comes from a strategy rather than a routine'],
    prerequisites: ['choosing-what-to-trade'], nextSteps: ['trading-plan', 'trading-journal'], related: ['daily-routine', 'trading-discipline'],
    followups: ['trading-plan'],
  }),
];
