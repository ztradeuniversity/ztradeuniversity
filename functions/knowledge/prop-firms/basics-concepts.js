// functions/knowledge/prop-firms/basics-concepts.js
// LIVE-PHASE — BEGINNER PROP-FIRM HOW-TOS (category: prop-firms)
// High-search beginner questions about funded accounts / challenges. Authored to
// the existing KOS shape; flows through the existing graph/retrieval pipeline.

const F = (o) => ({
  level: 'beginner', responseObjective: 'educate', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const PROP_FIRM_BASICS_CONCEPTS = [
  F({
    id: 'what-is-a-prop-firm', category: 'prop-firms', topic: 'What Is a Prop Firm', title: 'What Is a Prop Firm',
    concepts: ['prop-firm', 'funded', 'basics'],
    questionPatterns: ['what is a prop firm', 'what does a prop firm do', 'how do prop firms work', 'what is proprietary trading firm', 'are prop firms worth it'],
    canonical: {
      short: 'A prop (proprietary) firm gives you their capital to trade after you prove yourself in an evaluation, and you split the profits. You risk a small fee, not a large account — but you must follow strict risk rules.',
      deep: 'A prop firm lets you trade a large funded account using the firm\'s money instead of your own. You first pass an evaluation (a "challenge") that tests whether you can hit a modest profit target without breaking risk rules, paying only an entry fee. Pass, and you trade real firm capital and keep a large share of the profits (often 70–90%). The catch is discipline: tight daily and overall drawdown limits mean risk management — not big wins — is what gets and keeps you funded.',
    },
    desiredOutcome: 'understand prop firms as funded trading with strict risk rules',
    relevanceTags: ['prop-firm', 'funded', 'beginner'],
    commonMistakes: ['treating a challenge like a gamble instead of a risk-control test'],
    misconceptions: ['that a prop firm is free money or guaranteed income'],
    prerequisites: ['risk-management-basics'], nextSteps: ['funded-account', 'how-prop-challenges-work'], related: ['prop-firm-basics', 'choosing-prop-firm'],
    followups: ['how-prop-challenges-work'],
    riskNote: 'The fee is real money — only attempt a challenge once you are consistent on demo.',
  }),
  F({
    id: 'funded-account', category: 'prop-firms', topic: 'Funded Account', title: 'What Is a Funded Account',
    concepts: ['funded', 'prop-firm', 'basics'],
    questionPatterns: ['what is a funded account', 'what does funded trader mean', 'how does a funded account work', 'how do i get funded', 'what is a funded trader'],
    canonical: {
      short: 'A funded account is a live account backed by a prop firm\'s capital that you earn by passing their evaluation. You trade it under their risk rules and keep a share of the profits — but break the drawdown limit and the account is lost.',
      deep: 'Once you pass the evaluation, the firm gives you a funded account: real capital, real payouts, but governed by daily-loss and maximum-drawdown limits. Your job shifts from "make money fast" to "protect the account first" — most funded traders fail not from bad analysis but from one oversized or revenge trade that breaches the drawdown. Trading small and consistently is the entire game.',
    },
    desiredOutcome: 'understand a funded account as capital under strict drawdown rules',
    relevanceTags: ['funded', 'prop-firm', 'beginner'],
    commonMistakes: ['chasing a big payout and breaching the drawdown limit'],
    misconceptions: ['that being funded means you can trade however you want'],
    prerequisites: ['what-is-a-prop-firm'], nextSteps: ['reducing-drawdown', 'passing-a-challenge'], related: ['prop-payout', 'prop-drawdown-rules'],
    followups: ['reducing-drawdown'],
    riskNote: 'Protect the drawdown limit before chasing profit — one bad trade can end it.',
  }),
  F({
    id: 'how-prop-challenges-work', category: 'prop-firms', topic: 'How Challenges Work', title: 'How Prop Challenges Work',
    concepts: ['challenge', 'evaluation', 'prop-firm', 'basics'],
    questionPatterns: ['how does a prop challenge work', 'how does ftmo work', 'what is a trading challenge', 'how do evaluations work', 'what are the rules of a prop challenge'],
    canonical: {
      short: 'A challenge asks you to reach a modest profit target (often ~8–10%) while never breaching a daily loss limit or a maximum drawdown, usually with no time pressure now. Firms like FTMO and others all follow this shape — the rules matter more than the target.',
      deep: 'A typical evaluation: hit a profit target (commonly 8–10%) without ever crossing the daily-loss limit (e.g. 5%) or the overall max drawdown (e.g. 10%). Many firms have dropped minimum trading days and time limits, so patience is free. The target is easy with good R:R; the rules are what fail people — a single oversized trade blows the daily limit. Pass and you get funded (sometimes after a second phase). Treat it as a discipline exam, not a profit sprint.',
    },
    desiredOutcome: 'understand the target + daily-loss + max-drawdown structure of challenges',
    relevanceTags: ['challenge', 'evaluation', 'beginner'],
    commonMistakes: ['focusing on the profit target and ignoring the daily-loss limit'],
    misconceptions: ['that you must trade aggressively to pass in time'],
    prerequisites: ['what-is-a-prop-firm'], nextSteps: ['passing-a-challenge', 'reducing-drawdown'], related: ['prop-firm-basics', 'evaluation-phase'],
    followups: ['passing-a-challenge'],
    riskNote: 'The daily-loss limit fails more traders than the profit target — respect it first.',
  }),
  F({
    id: 'passing-a-challenge', category: 'prop-firms', topic: 'Passing a Challenge', title: 'How to Pass a Prop Challenge',
    concepts: ['challenge', 'discipline', 'prop-firm', 'basics'],
    questionPatterns: ['how do i pass a prop challenge', 'how to pass ftmo', 'how to pass a funded challenge', 'tips to pass a prop firm challenge', 'how do i get funded fast'],
    canonical: {
      short: 'Pass by treating it as a risk test: risk 0.5–1% per trade, take only your A+ setups, aim for the target in small steps, and never go near the daily-loss limit. Slow and boring passes; fast and aggressive blows up.',
      deep: 'The reliable way to pass: (1) risk 0.5–1% per trade so no day can breach the daily limit; (2) trade only your highest-quality setup, fewer trades not more; (3) build the target gradually — at 1% risk and decent R:R you reach 8–10% in a handful of good trades; (4) stop for the day after one or two losses to protect the daily limit; (5) never revenge trade. The traders who fail almost always oversized or chased. Discipline, not a special strategy, is the edge.',
    },
    desiredOutcome: 'pass via small risk, A+ setups, and protecting the daily limit',
    relevanceTags: ['challenge', 'discipline', 'beginner'],
    commonMistakes: ['oversizing to reach the target faster and breaching a limit'],
    misconceptions: ['that passing needs a secret strategy rather than discipline'],
    prerequisites: ['how-prop-challenges-work'], nextSteps: ['reducing-drawdown'], related: ['risk-per-trade', 'one-percent-rule'],
    followups: ['reducing-drawdown'],
    riskNote: 'Stop trading for the day after one or two losses — protecting the daily limit is how you pass.',
  }),
  F({
    id: 'reducing-drawdown', category: 'prop-firms', topic: 'Reducing Drawdown', title: 'How to Reduce Drawdown',
    concepts: ['drawdown', 'risk', 'prop-firm', 'basics'],
    questionPatterns: ['how do i reduce drawdown', 'how to avoid blowing my account', 'how to manage drawdown', 'how do i protect my funded account', 'how to stop losing my account'],
    canonical: {
      short: 'Reduce drawdown by shrinking risk (0.5–1%), setting a daily loss limit and stopping when hit, avoiding revenge trades, and trading fewer high-quality setups. Drawdown is almost always a sizing and discipline problem, not a strategy problem.',
      deep: 'Drawdown control is pure risk management: (1) cap risk at 0.5–1% per trade so streaks stay shallow; (2) set a hard daily-loss limit (e.g. 2–3%) and stop the moment it\'s hit — no exceptions; (3) never add to losers or revenge trade after a loss; (4) take fewer, better trades; (5) bank partial profits to build a buffer. Deep drawdowns need huge gains to recover, so prevention beats heroics. This protects a funded account and a personal one alike.',
    },
    desiredOutcome: 'keep drawdown shallow via small risk + a hard daily loss limit',
    relevanceTags: ['drawdown', 'risk', 'beginner'],
    commonMistakes: ['increasing risk to recover a drawdown, deepening it'],
    misconceptions: ['that drawdown comes from a bad strategy rather than sizing'],
    prerequisites: ['risk-management-basics'], nextSteps: ['one-percent-rule', 'daily-loss-limit'], related: ['drawdown-basics', 'account-recovery'],
    followups: ['one-percent-rule'],
    riskNote: 'A hard daily-loss limit you actually obey is the single best drawdown protector.',
  }),
];
