// functions/knowledge/platforms/concepts.js
// ACTIVATION — BEGINNER PLATFORM HOW-TOS (category: platforms)
// The highest-search beginner gap: actually using MT4/MT5/TradingView. Authored to
// the existing KOS shape; flows through the existing graph/retrieval pipeline.

const F = (o) => ({
  level: 'beginner', responseObjective: 'educate', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const PLATFORMS_CONCEPTS = [
  F({
    id: 'mt5-basics', category: 'platforms', topic: 'MetaTrader 5 (Basics)', title: 'MetaTrader 5 (MT5) Basics',
    concepts: ['mt5', 'metatrader', 'platform', 'basics'],
    questionPatterns: ['what is mt5', 'how do i use metatrader 5', 'how does mt5 work', 'mt5 for beginners', 'metatrader 5 explained'],
    canonical: {
      short: 'MT5 (MetaTrader 5) is the trading platform most brokers give you — it shows live charts, lets you place orders, and manage trades. The key windows are Market Watch (instruments), the Chart, and the Toolbox (your open trades, history, and account figures).',
      deep: 'MetaTrader 5 is where you actually trade: Market Watch lists instruments (right-click → add Gold/XAUUSD), the chart shows price, and the Toolbox at the bottom shows your Trade tab (open positions), History, and account numbers (balance, equity, free margin, margin level). You place orders with the New Order button (F9), set a stop loss and take profit on the same ticket, and manage or close from the Trade tab. Learn the layout on a demo account first.',
    },
    desiredOutcome: 'navigate MT5 (Market Watch, chart, Toolbox) and place/manage a trade',
    relevanceTags: ['mt5', 'platform', 'beginner'],
    commonMistakes: ['placing live trades before learning the platform on demo'],
    misconceptions: ['that the platform itself gives buy/sell signals'],
    prerequisites: ['what-is-a-broker'], nextSteps: ['place-first-trade', 'set-sl-tp-platform'], related: ['mt4-basics', 'demo-account'],
    followups: ['place-first-trade'],
    riskNote: 'Practice on a demo account until the platform feels second nature.',
  }),
  F({
    id: 'mt4-basics', category: 'platforms', topic: 'MetaTrader 4 (Basics)', title: 'MetaTrader 4 (MT4) Basics',
    concepts: ['mt4', 'metatrader', 'platform', 'basics'],
    questionPatterns: ['what is mt4', 'how do i use metatrader 4', 'mt4 vs mt5', 'mt4 for beginners', 'difference between mt4 and mt5'],
    canonical: {
      short: 'MT4 (MetaTrader 4) is the older, very popular trading platform — simpler than MT5 and still widely used for Forex and Gold. The basics are the same: Market Watch, chart, and a Terminal window showing your trades and account figures.',
      deep: 'MetaTrader 4 works almost identically to MT5 for a beginner: Market Watch (instruments), the chart, and the Terminal (Ctrl+T) showing open trades and account figures. MT5 adds more timeframes, more instruments (stocks/futures), and an economic calendar, but for Forex/Gold the day-to-day actions — place order (F9), set SL/TP, close from the Trade tab — are the same. Use whichever your broker provides; the skills transfer.',
    },
    desiredOutcome: 'use MT4 and understand how it differs from MT5',
    relevanceTags: ['mt4', 'platform', 'beginner'],
    commonMistakes: ['thinking MT4 and MT5 require completely different skills'],
    misconceptions: ['that MT5 is always better — for FX/Gold either is fine'],
    prerequisites: ['what-is-a-broker'], nextSteps: ['place-first-trade'], related: ['mt5-basics'],
    followups: ['place-first-trade'],
  }),
  F({
    id: 'tradingview-basics', category: 'platforms', topic: 'TradingView (Basics)', title: 'TradingView Basics',
    concepts: ['tradingview', 'charts', 'platform', 'basics'],
    questionPatterns: ['what is tradingview', 'how do i use tradingview', 'tradingview for beginners', 'how to draw on tradingview', 'tradingview vs mt5'],
    canonical: {
      short: 'TradingView is a web charting platform traders use for analysis — clean charts, drawing tools (trendlines, support/resistance), indicators, and alerts. Many traders analyse on TradingView and execute on MT4/MT5.',
      deep: 'TradingView is the most popular charting tool: search an instrument (XAUUSD), switch timeframes, draw support/resistance and trendlines, add indicators from the top toolbar, and set price alerts (the clock icon). It is primarily for analysis and alerts — you often still place the actual trade in your broker\'s MT4/MT5 (unless your broker is integrated). A free account covers everything a beginner needs.',
    },
    desiredOutcome: 'analyse and set alerts on TradingView, execute on the broker platform',
    relevanceTags: ['tradingview', 'charts', 'beginner'],
    commonMistakes: ['cluttering the chart with too many indicators'],
    misconceptions: ['that you must pay for TradingView to start'],
    prerequisites: ['chart-reading-basics'], nextSteps: ['set-sl-tp-platform'], related: ['mt5-basics', 'technical-analysis-basics'],
    followups: ['set-sl-tp-platform'],
  }),
  F({
    id: 'place-first-trade', category: 'platforms', topic: 'Place Your First Trade', title: 'How to Place Your First Trade',
    concepts: ['order', 'execution', 'platform', 'basics'],
    questionPatterns: ['how do i place a trade', 'how to open a trade in mt5', 'how do i buy or sell on mt4', 'how to place my first trade', 'how do i enter a trade'],
    canonical: {
      short: 'On MT4/MT5: open New Order (press F9), pick the instrument, set your lot size, set a stop loss and take profit, then click Buy or Sell. Always set the stop loss on the same ticket — never place a trade without it.',
      deep: 'To place a trade in MetaTrader: (1) select the instrument in Market Watch; (2) click New Order or press F9; (3) set the volume (lot size — calculated from your 1–2% risk, not guessed); (4) enter the Stop Loss and Take Profit prices on the ticket; (5) click Buy (long) or Sell (short). The trade appears in the Trade tab where you can modify or close it. Do this on a demo account several times until it is automatic, and never skip the stop loss.',
    },
    desiredOutcome: 'open a trade with lot size + stop loss + take profit set correctly',
    relevanceTags: ['order', 'platform', 'beginner'],
    commonMistakes: ['placing the trade first and trying to add a stop loss after'],
    misconceptions: ['that you can set the stop loss later when you have time'],
    prerequisites: ['mt5-basics', 'order-types-overview'], nextSteps: ['set-sl-tp-platform', 'stop-loss-basics'], related: ['market-order', 'first-trade-checklist'],
    followups: ['set-sl-tp-platform'],
    riskNote: 'Set the stop loss and lot size BEFORE you click Buy/Sell — every time.',
  }),
  F({
    id: 'set-sl-tp-platform', category: 'platforms', topic: 'Setting SL & TP', title: 'How to Set Stop Loss & Take Profit',
    concepts: ['stop-loss', 'take-profit', 'platform', 'basics'],
    questionPatterns: ['how do i set stop loss in mt5', 'how to add take profit', 'how do i set sl and tp', 'where do i put stop loss on mt4', 'how to modify stop loss'],
    canonical: {
      short: 'On the order ticket (or by right-clicking the open trade → Modify), type the Stop Loss price below your entry for a buy (above for a sell) and the Take Profit at your target. You enter prices, not pips — so know the level before you click.',
      deep: 'In MT4/MT5 the Stop Loss and Take Profit are price levels on the order ticket. For a buy: SL goes below entry (where your idea is wrong), TP above at your target; for a sell, reverse it. To change them on a live trade, right-click it in the Trade tab → Modify or Close → type the new SL/TP prices → Modify. Because you enter prices (not pips), decide the structural level first, then size the lot so that distance is only 1–2% of your account.',
    },
    desiredOutcome: 'place SL/TP as price levels correctly for buys and sells',
    relevanceTags: ['stop-loss', 'take-profit', 'platform', 'beginner'],
    commonMistakes: ['putting the stop loss on the wrong side of entry'],
    misconceptions: ['that SL/TP are entered in pips on the platform (they are prices)'],
    prerequisites: ['place-first-trade'], nextSteps: ['stop-loss-basics', 'take-profit-basics'], related: ['pips-to-money', 'entry-and-exit'],
    followups: ['stop-loss-basics'],
    riskNote: 'Double-check SL is on the correct side of entry — a reversed SL removes your protection.',
  }),
  F({
    id: 'install-indicator-ea', category: 'platforms', topic: 'Indicators & EAs', title: 'Installing Indicators & EAs',
    concepts: ['indicator', 'ea', 'platform', 'basics'],
    questionPatterns: ['how do i add an indicator', 'how to install an ea', 'how do i add indicators in mt5', 'what is an expert advisor', 'how to install a custom indicator'],
    canonical: {
      short: 'In MT4/MT5, built-in indicators are under Insert → Indicators (or the Navigator panel). Custom indicators/EAs go in the data folder (File → Open Data Folder → MQL5/Indicators or /Experts), then restart. An EA (Expert Advisor) is an automated strategy — use them cautiously.',
      deep: 'To add a standard indicator, use Insert → Indicators or drag it from the Navigator (Ctrl+N) onto the chart. To install a custom one or an EA: File → Open Data Folder → MQL4/MQL5 → drop the file into Indicators or Experts → restart the platform → it appears in Navigator. An Expert Advisor automates trading; many are over-marketed and risky, so test any EA on demo for a long time before trusting real money — automation does not remove risk.',
    },
    desiredOutcome: 'add indicators/EAs safely and treat EAs with caution',
    relevanceTags: ['indicator', 'ea', 'platform', 'beginner'],
    commonMistakes: ['running a bought EA on a live account without long demo testing'],
    misconceptions: ['that an EA or indicator is a guaranteed money-maker'],
    prerequisites: ['mt5-basics'], nextSteps: ['reading-the-terminal'], related: ['technical-analysis-basics', 'forward-testing'],
    followups: ['reading-the-terminal'],
    riskNote: 'No indicator or EA removes risk — test on demo before any live use.',
  }),
  F({
    id: 'reading-the-terminal', category: 'platforms', topic: 'Reading the Terminal', title: 'Reading the MT4/MT5 Terminal',
    concepts: ['terminal', 'account', 'platform', 'basics'],
    questionPatterns: ['how do i read the mt5 terminal', 'what do balance equity margin mean in mt4', 'how to see my open trades', 'what is the toolbox in mt5', 'how do i check my account in metatrader'],
    canonical: {
      short: 'The Toolbox/Terminal (Ctrl+T) shows your open Trades (with live profit/loss), your account figures — Balance, Equity, Free Margin, Margin Level — and your History. Watch Equity and Margin Level while trades are open; they tell you your real, live risk.',
      deep: 'The Trade tab of the Terminal lists open positions with floating P/L, and along the bottom shows Balance (closed-trade cash), Equity (live value), Free Margin (cushion), and Margin Level %. While trades are open, Equity and Margin Level are what matter — a falling Margin Level toward your broker\'s limits warns of a margin call. The History tab is your record for journaling. Knowing where these numbers live keeps a beginner aware of real-time risk instead of only watching price.',
    },
    desiredOutcome: 'read open trades + Balance/Equity/Free Margin/Margin Level in the terminal',
    relevanceTags: ['terminal', 'account', 'platform', 'beginner'],
    commonMistakes: ['watching only price and ignoring Equity / Margin Level'],
    misconceptions: ['that Balance shows your live account value (Equity does)'],
    prerequisites: ['mt5-basics'], nextSteps: ['equity', 'margin-level'], related: ['balance', 'free-margin'],
    followups: ['equity'],
    riskNote: 'A falling Margin Level is your early margin-call warning — watch it, not just price.',
  }),
];
