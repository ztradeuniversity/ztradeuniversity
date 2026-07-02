// functions/utils/article-seed.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 2.2 — SEO ARTICLE SEED. A curated set of production-quality, SEO-structured
// educational articles, shaped exactly like an ai_articles row so the existing
// admin pipeline can bulk-import them (idempotent by slug). On import each article
// is published AND fed to the graph via conceptFromArticle → authorConcept (origin
// 'article'), so approved articles continuously strengthen chatbot knowledge.
//
// SEO mapping (no schema change): summary = meta description, tags = keywords,
// FAQ + headings live inside markdown `content`, related reading is rendered AND
// resolved dynamically by relatedArticles() (category/tag overlap — never hardcoded).
// Extend by appending objects to ARTICLE_SEED; the importer scales unchanged.
// ════════════════════════════════════════════════════════════════════════════

const A = (o) => ({ language: 'en', author: 'Z Trade University', difficulty: 'beginner', ...o });

export const ARTICLE_SEED = [
  A({
    slug: 'how-to-trade-gold-xauusd-guide',
    title: 'How to Trade Gold (XAUUSD): A Practical Guide',
    category: 'gold',
    difficulty: 'beginner',
    tags: ['gold trading', 'xauusd', 'how to trade gold', 'gold analysis'],
    summary: 'Learn how to trade gold (XAUUSD) step by step: read the higher-timeframe trend, mark key levels, time your entry, and manage risk like a professional.',
    content: `## How to Trade Gold (XAUUSD)
Gold is one of the most traded instruments in the world, but its speed punishes traders who skip the basics. This guide shows the repeatable process professionals use.

## Start on the Higher Timeframe
Read the daily and 4-hour trend first. Mark the key support and resistance zones where price has repeatedly reacted, then drop to a lower timeframe only to time entries that agree with that bias.

## Build Confluence
Strong gold trades stack evidence: trend direction, a tested level, and a clean trigger such as a sweep-and-reclaim. When several factors agree at one price, the odds improve. The dollar (DXY) and real yields give macro context — gold usually moves inverse to both.

## Manage Risk First
Gold can travel hundreds of points on news. Decide your stop from structure, then size the position so a loss costs about 1% of your account. On high-impact news days, reduce size or stand aside.

## FAQ
**Is gold good for beginners?** It is tradable for beginners who respect risk, but its volatility means small position sizes are essential.
**What moves the gold price?** The US dollar, real yields, risk sentiment, and geopolitics — often all at once.
**What is the best time to trade gold?** The London and New York sessions, when liquidity and follow-through are highest.

## Related Reading
Explore liquidity sweeps, market structure, and position sizing to deepen your gold trading edge.`,
  }),
  A({
    slug: 'what-is-a-liquidity-sweep',
    title: 'What Is a Liquidity Sweep? (Smart Money Explained)',
    category: 'smart-money',
    difficulty: 'intermediate',
    tags: ['liquidity sweep', 'smart money', 'stop hunt', 'liquidity'],
    summary: 'A liquidity sweep is when price spikes past an obvious high or low to trigger stops, then reverses. Learn to spot the sweep-and-reclaim and trade it.',
    content: `## What Is a Liquidity Sweep?
A liquidity sweep is a fast move beyond an obvious high or low designed to trigger resting stop orders before price reverses. It is often mistaken for a breakout.

## Why Liquidity Sweeps Happen
Large players need counterparties to fill size. The stops sitting just beyond swing highs, swing lows, and round numbers provide that liquidity, so price reaches for them before the real move.

## How to Trade the Sweep-and-Reclaim
Wait for price to take the liquidity, fail to follow through, and reclaim the level. Enter in the reversal direction with your stop beyond the sweep's extreme. This turns the trap that catches breakout traders into a high-probability setup.

## FAQ
**Is a liquidity sweep the same as a stop hunt?** Effectively yes — both describe price running obvious stops before reversing.
**Where do I place my stop?** Beyond the sweep extreme, not on the obvious level everyone uses.
**Does this work on gold and forex?** Yes, on any liquid market with clear structure.

## Related Reading
Pair this with market structure, inducement, and stop hunts for a complete smart-money read.`,
  }),
  A({
    slug: 'how-risk-reward-works',
    title: 'How Risk-Reward Works (and Why Win Rate Is Not Enough)',
    category: 'risk',
    difficulty: 'beginner',
    tags: ['risk reward', 'risk to reward', 'expectancy', 'win rate'],
    summary: 'Risk-reward compares what you risk to what you aim to make. Learn why a 1:2 ratio lets you be right less than half the time and still grow your account.',
    content: `## How Risk-Reward Works
Risk-reward (R:R) compares the amount you risk on a trade to the amount you aim to make. A 1:2 trade risks one unit to make two.

## Why It Beats Win Rate Alone
Win rate means nothing on its own. A 40% win rate at 1:2 is profitable; a 60% win rate at 1:0.5 bleeds out. The product of win rate and reward — your expectancy — is what actually grows an account.

## Setting Targets Correctly
Set your target from market structure first, then check the ratio is worth the risk. Inventing a target just to make the ratio look good is how traders fool themselves.

## FAQ
**What is a good risk-reward ratio?** Many traders aim for at least 1:2, but the right ratio depends on your win rate and strategy.
**Do I need a high win rate?** No — a modest win rate with strong R:R is highly profitable.
**What is expectancy?** (win rate × average win) − (loss rate × average loss).

## Related Reading
Continue with position sizing, win rate vs risk-reward, and trade management.`,
  }),
  A({
    slug: 'why-do-most-traders-lose-money',
    title: 'Why Do Most Traders Lose Money?',
    category: 'mistakes',
    difficulty: 'beginner',
    tags: ['why traders lose', 'trading mistakes', 'risk management', 'trading psychology'],
    summary: 'Most traders lose from poor risk and psychology, not bad analysis. Learn the repeating mistakes — oversizing, no stop, revenge trading — and how to fix them.',
    content: `## Why Do Most Traders Lose Money?
The popular belief is that traders lose because they cannot predict the market. The truth is that most accounts are killed by the trader, not the chart.

## The Repeating Causes
Oversizing positions, trading without a stop, chasing losses with revenge trades, abandoning a plan after two losses, and over-leveraging small accounts. None of these are analysis problems.

## How to Stop Losing
Fix risk at about 1% per trade, always use a stop, honour a daily loss limit, and trade one defined setup consistently. Survival comes first; profit is the by-product of discipline.

## FAQ
**Do 90% of traders really lose?** A large majority of retail traders lose, mostly from risk and psychology errors.
**What is the single biggest mistake?** Oversizing — it turns a normal losing streak into a blown account.
**How do I turn it around?** Cut risk, journal honestly, and remove your most costly repeating habit.

## Related Reading
See overtrading, overleveraging, and how to become profitable.`,
  }),
  A({
    slug: 'how-beginners-should-start-trading',
    title: 'How Should Beginners Start Trading? (Step-by-Step Roadmap)',
    category: 'planning',
    difficulty: 'beginner',
    tags: ['beginner trading', 'how to start trading', 'trading roadmap', 'demo trading'],
    summary: 'A beginner roadmap that puts survival first: learn market basics, master risk, practise one setup on demo, then go live small. Avoid the mistakes that blow accounts.',
    content: `## How Should Beginners Start Trading?
Most beginners blow up by going live big with no risk plan. This roadmap fixes the order of learning so survival comes first.

## Step 1 — Market and Order Basics
Understand pairs, pips, lots, leverage, and order types before risking money.

## Step 2 — Master Risk
Learn position sizing and fix risk at about 1% per trade. This is more important than any strategy.

## Step 3 — One Simple Setup on Demo
Pick one setup, such as trend continuation at a level, and practise it on demo until it is repeatable.

## Step 4 — Go Live Small
Trade tiny live size to learn real emotion cheaply, and journal every trade from day one.

## FAQ
**How long on demo?** Until you can follow your rules consistently for several weeks.
**How much money do I need to start?** Start small; the percentage matters, not the dollar amount.
**Should I buy signals?** No — depth in one approach beats chasing signals.

## Related Reading
Continue with the intermediate roadmap, risk per trade, and building a trading plan.`,
  }),
  A({
    slug: 'what-is-market-structure',
    title: 'What Is Market Structure? (Higher Highs and Lower Lows)',
    category: 'structure',
    difficulty: 'beginner',
    tags: ['market structure', 'higher highs', 'lower lows', 'trend'],
    summary: 'Market structure is the map of swing highs and lows that shows who controls price. Learn to read uptrends, downtrends, and structure breaks objectively.',
    content: `## What Is Market Structure?
Market structure is the sequence of swing highs and lows that reveals who is in control — buyers or sellers.

## Reading the Trend
Higher highs and higher lows mean buyers lead (uptrend). Lower highs and lower lows mean sellers lead (downtrend). Overlapping swings mean the market is ranging.

## Structure Breaks
The first time price fails to make a new high in an uptrend and breaks a key higher low, control may be shifting. This break of structure is your earliest objective warning.

## FAQ
**Is one big candle a trend change?** No — you need a broken swing point to confirm a change.
**Which timeframe should I read structure on?** The one you trade from, plus the one above it for context.
**Why does structure matter?** Your levels and entries all hang off this skeleton.

## Related Reading
Continue with support and resistance, break of structure, and trend trading.`,
  }),
  A({
    slug: 'position-sizing-explained',
    title: 'Position Sizing Explained: The Dial That Protects Your Account',
    category: 'risk',
    difficulty: 'beginner',
    tags: ['position sizing', 'lot size', 'risk per trade', 'money management'],
    summary: 'Position sizing turns a stop-loss distance into a fixed money risk. Learn the simple formula that keeps any single loss to about 1% of your account.',
    content: `## What Is Position Sizing?
Position size is the dial that converts a stop-loss distance into a fixed money risk. It should be the last thing you set, not the first.

## The Correct Order
Pick the percent you will risk (1% is a sane default), measure the stop in pips or points, then let the lot size fall out of that math. Choosing the lot first and discovering the risk afterwards is what blows accounts.

## Why It Matters
With consistent 1% risk, even ten losses in a row is a recoverable drawdown. Position sizing is the foundation everything else is built on.

## FAQ
**How much should I risk per trade?** About 1% of your account is a safe default.
**What if my stop is wide?** Use a smaller lot so the dollar risk stays the same.
**Does this apply to gold?** Yes — gold's volatility makes correct sizing essential.

## Related Reading
Continue with risk per trade, risk-reward, and managing risk on gold.`,
  }),
  A({
    slug: 'what-is-a-prop-firm',
    title: 'What Is a Prop Firm? Funded Trading Explained',
    category: 'prop-firms',
    difficulty: 'intermediate',
    tags: ['prop firm', 'funded account', 'evaluation', 'funded trading'],
    summary: 'A prop firm funds disciplined traders with larger capital after an evaluation that tests risk control. Learn how the model works and how to pass the challenge.',
    content: `## What Is a Prop Firm?
A proprietary trading (prop) firm gives traders access to larger capital in exchange for a profit split, usually after an evaluation that tests risk discipline.

## How the Evaluation Works
You pay a fee, hit a modest profit target without breaching daily or overall drawdown, and earn a funded account. The skill being tested is not big wins — it is not breaking the rules.

## How to Pass
Trade the drawdown, not the target. Risk 0.5–1% per trade, take only your best setups, and the target arrives without ever threatening the loss limit. Most failures are behavioural, not technical.

## FAQ
**Is prop trading legit?** Reputable, well-reviewed firms are legitimate; vet payout history like a broker withdrawal.
**How do payouts work?** You keep a split (often 70–90%) on the firm's payout cycle.
**Personal account or prop?** Prop suits disciplined traders with limited capital who can follow rules.

## Related Reading
Continue with prop drawdown rules, surviving the evaluation, and choosing a prop firm.`,
  }),
  A({
    slug: 'scalping-vs-swing-trading',
    title: 'Scalping vs Swing Trading: Which Style Fits You?',
    category: 'strategy',
    difficulty: 'intermediate',
    tags: ['scalping', 'swing trading', 'trading style', 'day trading'],
    summary: 'Scalping takes many fast trades on low timeframes; swing trading holds for days. Learn the trade-offs and how to choose the style that fits your life.',
    content: `## Scalping vs Swing Trading
The best trading style is the one you can execute calmly and consistently — not the one that looks most exciting online.

## Scalping
Many small, fast trades on low timeframes. It demands sharp execution, low spreads, and emotional control. Costs and slippage punish careless scalpers, so it suits focused traders in high-liquidity sessions.

## Swing Trading
Positions held for days to weeks on higher-timeframe structure. It needs patience and wider stops but far less screen time — often the most realistic style for people with jobs.

## Choosing
Match the style to your schedule and temperament, then commit long enough to build a track record. Constant style-hopping is why many traders never become consistent.

## FAQ
**Which is better for beginners?** Swing trading's slower pace usually makes discipline easier to build.
**Can I do both?** Eventually, but master one first.
**Does style change my risk rules?** No — fixed risk per trade applies to every style.

## Related Reading
Continue with finding your trading style, timeframe selection, and trend trading.`,
  }),
  A({
    slug: 'how-to-become-a-profitable-trader',
    title: 'How to Become a Profitable Trader',
    category: 'psychology',
    difficulty: 'intermediate',
    tags: ['become profitable', 'consistency', 'trading psychology', 'discipline'],
    summary: 'Becoming profitable is mostly subtraction: cut oversized risk, revenge trades, and undefined setups. Learn the capital-first path to consistency.',
    content: `## How to Become a Profitable Trader
Most traders try to add — more indicators, more setups, more screen time. The gains come from removing leaks.

## Survive First
Cut oversized risk, revenge trades, and any setup you cannot define. You can only compound an account that is still alive.

## Repeat One Edge
Trade one defined setup with small, consistent risk. Journal every trade and review weekly to find your single most costly repeating mistake — then remove it.

## Let the Math Work
Consistency is a by-product of capital preservation, not a separate skill. A positive expectancy compounds over months, not days.

## FAQ
**How long does it take?** Usually longer than beginners expect — months of disciplined practice.
**Do I need a complex strategy?** No — a simple edge executed consistently beats a complex one you cannot follow.
**What is the fastest way to improve?** Journal honestly and fix one mistake at a time.

## Related Reading
Continue with becoming profitable, the trader mindset, and the trading journal.`,
  }),
  A({
    slug: 'forex-trading-for-beginners',
    title: 'Forex Trading for Beginners: How Currency Pairs Work',
    category: 'forex',
    difficulty: 'beginner',
    tags: ['forex trading', 'currency pairs', 'pips', 'leverage'],
    summary: 'Forex is trading one currency against another. Learn pairs, pips, lots, and leverage — the core mechanics every beginner needs before risking real money.',
    content: `## Forex Trading for Beginners
Forex means trading one currency against another, so every trade is a relationship, not a single asset. Master the mechanics first.

## Pips, Lots and Leverage
A pip is the standard small unit a pair moves; lot size sets how much each pip is worth; leverage lets you control a larger position with a small deposit. Leverage multiplies both profit and loss — it is access, not free money.

## Start With Major Pairs
Majors like EURUSD have the tightest spreads and cleanest behaviour. Focus on one or two while you learn.

## FAQ
**Is forex a scam?** Forex itself is a legitimate global market; scams come from unregulated brokers, so verify regulation.
**How much to start?** Start small; the percentage you risk matters, not the dollar amount.
**Best pair for beginners?** EURUSD, the most liquid pair.

## Related Reading
Continue with leverage, position sizing, and how to choose a broker.`,
  }),
  A({
    slug: 'what-is-leverage-in-trading',
    title: 'What Is Leverage in Trading? (And Why It Is Dangerous)',
    category: 'forex',
    difficulty: 'beginner',
    tags: ['leverage', 'margin', 'risk', 'forex'],
    summary: 'Leverage lets you control a large position with a small deposit — multiplying both profit and loss. Learn to treat it as access, not as a bigger edge.',
    content: `## What Is Leverage?
Leverage of 1:100 means $1,000 controls $100,000 of currency. It is a tool, not free money.

## Why High Leverage Is Dangerous
More leverage does not increase your edge — it only increases how fast a mistake hurts. Two traders risking 1% per trade have identical risk regardless of leverage; the high-leverage trader just has more rope.

## Use It Safely
Keep risk per trade small (about 1%) and let your stop and position size control risk, not the leverage number.

## FAQ
**What leverage should I use?** Low effective risk matters more than the headline number; keep risk per trade at ~1%.
**Can leverage blow my account?** Only via oversizing — leverage magnifies oversized losses.
**What is margin?** The deposit your broker locks to hold a position.

## Related Reading
Continue with margin, position sizing, and overleveraging.`,
  }),
  A({
    slug: 'trading-discipline-guide',
    title: 'Trading Discipline: How to Follow Your Own Rules',
    category: 'discipline',
    difficulty: 'beginner',
    tags: ['trading discipline', 'consistency', 'rules', 'process'],
    summary: 'Discipline is doing the boring thing on purpose — same risk, same checklist, every time. Learn to build rule-following habits that survive losing streaks.',
    content: `## What Is Trading Discipline?
Discipline is doing the same right things repeatedly: the same risk, the same checklist, whether you are up or down.

## Willpower Runs Out, Systems Do Not
Write few, clear rules you can actually keep. Grade yourself on whether you followed them, not just whether you won. Kept rules compound into self-trust.

## Build the Habit
Attach a checklist to opening your platform and a journal entry to closing each trade until disciplined action becomes automatic.

## FAQ
**Why can't I follow my rules?** Usually the rules are too many or vague, or your size is too big and emotion takes over.
**How do I build discipline fast?** Make the rules few, the size small, and review adherence weekly.
**Is discipline more important than strategy?** Yes — most traders have a rule-following problem, not a strategy problem.

## Related Reading
Continue with the trading checklist, consistency, and process over outcome.`,
  }),
  A({
    slug: 'trading-journal-guide',
    title: 'How to Keep a Trading Journal (and Actually Use It)',
    category: 'psychology',
    difficulty: 'beginner',
    tags: ['trading journal', 'review', 'improvement', 'discipline'],
    summary: 'A trading journal turns random trades into data. Learn what to log, how to review weekly, and how to find the one repeating mistake costing you money.',
    content: `## Why Keep a Trading Journal?
A journal turns random trades into data. You cannot fix what you never wrote down.

## What to Log
The setup, your risk, the reason for entering, and how you felt. The screenshot is the easy part — the value is in the review.

## Review Weekly
Once a week, look for the repeating mistake — the oversized trade, the entry with no level, the revenge click — and remove one. A journal you never review is just a diary.

## FAQ
**What should I journal?** Setup, risk, reason, emotion, and outcome.
**How often should I review?** Weekly, looking for patterns rather than single trades.
**Does journaling really help?** Yes — it is the fastest way to find and fix your costliest habit.

## Related Reading
Continue with trading discipline, becoming profitable, and decision quality.`,
  }),
  A({
    slug: 'how-to-choose-a-broker',
    title: 'How to Choose a Safe, Regulated Broker',
    category: 'brokers',
    difficulty: 'beginner',
    tags: ['broker selection', 'regulated broker', 'withdrawal safety', 'broker red flags'],
    summary: 'Choose a broker like a bank: real regulation, clean withdrawals, fair spreads, reliable execution. Learn to verify a licence and spot scam red flags.',
    content: `## How to Choose a Broker
Pick a broker the way you would pick a bank — regulation and the ability to get your money out matter more than bonuses.

## Verify Regulation
Take the licence number and check it on the regulator's own register (FCA, ASIC, CySEC), not the broker's site. Cloned and fake licences are common.

## Test Withdrawals Early
Deposit small, trade a little, and withdraw to confirm the process is smooth before scaling up.

## Red Flags
Withdrawal problems, pushy account managers, guaranteed-profit talk, and bonuses with impossible conditions. One serious flag is enough to walk away.

## FAQ
**How do I know a broker is regulated?** Verify the licence on the regulator's official register.
**Are unregulated brokers safe?** No — there is little protecting your deposit or right to withdraw.
**What is the biggest red flag?** Difficulty withdrawing your own money.

## Related Reading
Continue with broker red flags, withdrawal safety, and account security.`,
  }),
  A({
    slug: 'how-to-recover-a-blown-trading-account',
    title: 'How to Recover a Blown Trading Account',
    category: 'recovery',
    difficulty: 'beginner',
    tags: ['account recovery', 'drawdown', 'rebuild account', 'losses'],
    summary: 'Recovery starts by stopping the bleeding: cut risk hard, rebuild the habit before the balance, and never chase losses. A calm, capital-first recovery plan.',
    content: `## How to Recover a Blown Account
The instinct after a big loss is to size up and win it back fast — that instinct is exactly what empties accounts.

## Stop the Bleeding
Drop to the smallest risk possible (0.5% or less) so no streak can finish you. Survival first.

## Rebuild the Habit, Not the Balance
Return to your checklist, journal every trade, and rebuild confidence one disciplined trade at a time. The balance follows the habit, never the other way around.

## FAQ
**Should I increase risk to recover faster?** No — that is how accounts die. Cut risk instead.
**How long does recovery take?** As long as it takes to rebuild consistent, disciplined execution.
**Is it a strategy or psychology problem?** Recovery is mostly psychological and procedural, not strategic.

## Related Reading
Continue with risk after a losing streak, position sizing, and the trader self-assessment.`,
  }),
  A({
    slug: 'breakout-trading-and-false-breakouts',
    title: 'Breakout Trading and How to Avoid False Breakouts',
    category: 'strategy',
    difficulty: 'intermediate',
    tags: ['breakout trading', 'false breakout', 'fakeout', 'liquidity'],
    summary: 'Breakout trading rides price escaping a level — but most failed breakouts are liquidity grabs. Learn to filter real breaks from traps and trade the reclaim.',
    content: `## Breakout Trading
A breakout enters as price escapes a level or range with momentum. The edge is filtering real breaks from traps.

## Real Break vs False Break
A genuine breakout closes beyond the level and holds on a retest. A false breakout pokes through, fails to follow, and reclaims the range — a liquidity grab in disguise.

## Trade the Failure
Instead of chasing the break, wait: if price breaks, fails, and reclaims the level, trade the reversal with a stop beyond the false-break extreme. This turns the trap into your edge.

## FAQ
**Why do breakouts fail?** Obvious levels attract stops, so price runs them for liquidity then reverses.
**How do I avoid fakeouts?** Require a close and follow-through, or trade the retest/reclaim.
**Where is my stop?** Beyond the breakout extreme, not on the obvious level.

## Related Reading
Continue with false breakouts, liquidity sweeps, and trend trading.`,
  }),
  A({
    slug: 'trading-around-economic-news',
    title: 'Trading Around Economic News (NFP, CPI, FOMC)',
    category: 'news',
    difficulty: 'beginner',
    tags: ['economic news', 'nfp', 'cpi', 'fomc', 'volatility'],
    summary: 'High-impact news can move markets violently and skip past stops. Learn to check the calendar, stay protected into releases, and trade the aftermath safely.',
    content: `## Trading Around Economic News
High-impact releases — NFP, CPI, FOMC — can move markets violently in seconds, widening spreads and slipping stops.

## Be Flat or Protected
The safe default is to be flat or already protected before red-folder news. Holding through it with full size invites a stop filled far from where you placed it.

## Trade the Aftermath
Let the initial spike print, let structure reform, then trade the real continuation or reversal — reacting to confirmation, not the headline.

## FAQ
**Should I trade during news?** Most traders are better flat into high-impact news, then trading the aftermath.
**What news matters most for gold?** Inflation (CPI), rates (FOMC), and jobs (NFP).
**Why did news blow past my stop?** Spreads widen and price gaps, so stops can slip — reduce size or step aside.

## Related Reading
Continue with how economic news affects trading, gold news reactions, and the trading routine.`,
  }),
];
