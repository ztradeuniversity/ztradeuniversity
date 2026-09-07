// functions/utils/trade-rescue/knowledge.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU TRADE RESCUE — DEDICATED TRADE-MANAGEMENT KNOWLEDGE BANK
//
// A SEPARATE namespace from the site's 474-concept general knowledge graph
// (functions/knowledge/**, kb_nodes, retrieveBest). That graph is deliberately
// NOT reachable from Trade Rescue: it answers "what is support and resistance",
// which is a teaching question, not a trade-management decision. Letting it in
// is exactly what would turn this back into a general chatbot.
//
// Nothing here is market data. Every entry is STATIC, durable trade-management
// principle — clearly separated from current evidence everywhere it is used, so
// a reader can always tell "this is a rule of thumb" from "this is today's
// price". Entries are only attached to an analysis when the Trade Case actually
// triggers them; they are never dumped in wholesale.
//
// `applies(c, ev)` receives the Trade Case and the evidence bundle and returns
// true only when the situation genuinely matches. `weight` orders what surfaces
// first when several apply.
// ════════════════════════════════════════════════════════════════════════════

export const TR_KNOWLEDGE = [
  {
    id: 'no-stop-loss', topic: 'risk', weight: 100, severity: 'critical',
    title: 'An open position without a Stop Loss has undefined risk',
    body: 'Without a stop, the maximum loss on this position is not defined by a plan — it is defined by whatever the market does next and by how long you can bear to watch it. The first question in a stuck trade is not "where will price go" but "what is the most this can cost me". Until that has an answer, every other decision is being made blind.',
    applies: (c) => c.has_stop_loss === false,
  },
  {
    id: 'invalidation-undefined', topic: 'thesis', weight: 90,
    title: 'A trade needs a defined invalidation level',
    body: 'A trade idea is only meaningful if there is a price at which it is wrong. If you cannot name the level that would prove the idea wrong, you cannot tell the difference between a trade that needs patience and a trade that needs closing — and that is usually why a position starts to feel "stuck".',
    applies: (c) => c.has_stop_loss === false || (!c.stop_loss && !(c.support_levels || []).length && !(c.resistance_levels || []).length),
  },
  {
    id: 'thesis-vs-hope', topic: 'psychology', weight: 85,
    title: 'Hold because the thesis is intact, not because the position is losing',
    body: 'The reason to stay in a trade is that the conditions you entered on are still true. "It has to come back" is not a thesis — it is the position talking. Re-read your original reason for entering: if you cannot still state it in one sentence using what the market is doing now, the trade is being held by hope rather than by analysis.',
    applies: (c) => c.floating_state === 'loss',
  },
  {
    id: 'counter-trend-entry', topic: 'structure', weight: 80,
    title: 'Trading against the higher-timeframe trend needs a stricter plan',
    body: 'Counter-trend positions can work, but they demand tighter invalidation and faster decisions, because the dominant flow is against you the whole time. If the higher timeframe is trending against your direction, the burden of proof sits on the trade, not on the market.',
    applies: (c) => !!c.trend_context && !!c.direction &&
      ((c.direction === 'buy' && /down|bear/i.test(c.trend_context)) ||
       (c.direction === 'sell' && /up|bull/i.test(c.trend_context))),
  },
  {
    id: 'timeframe-mismatch', topic: 'structure', weight: 70,
    title: 'Manage the trade on the timeframe you entered on',
    body: 'Entering on a higher timeframe and then managing on a much lower one turns normal noise into a reason to panic. The lower chart will always show movement against you; that movement is only meaningful if it breaks the structure your entry was based on.',
    applies: (c) => !!c.timeframe_entry && !!c.timeframe_management && c.timeframe_entry !== c.timeframe_management,
  },
  {
    id: 'elevated-volatility', topic: 'volatility', weight: 65,
    title: 'Volatility regime changes what a normal pullback looks like',
    body: 'When volatility rises, the distance price routinely travels against a good position grows with it. A stop that was sensible in a calm regime can become a near-certainty of being hit in a fast one — without the trade idea itself having changed at all.',
    applies: (c, ev) => !!(ev && ev.regime && typeof ev.regime.vix_level === 'number' && ev.regime.vix_level >= 20),
  },
  {
    id: 'gold-real-yields', topic: 'fundamental', weight: 75,
    title: 'Gold and real yields usually pull against each other',
    body: 'Gold pays no yield, so the real (inflation-adjusted) return available on government bonds is one of its more persistent fundamental headwinds or tailwinds: rising real yields raise the opportunity cost of holding gold, falling real yields lower it. This is a tendency across cycles, not a rule that holds on any given day.',
    applies: (c, ev) => c.instrument === 'XAU/USD' && !!(ev && ev.yields && ev.yields.real10y != null),
  },
  {
    id: 'risk-on-off', topic: 'fundamental', weight: 60,
    title: 'Risk regime sets the background, not the entry',
    body: 'A risk-on regime tends to favour higher-beta assets and pressure defensive ones; risk-off does the reverse. It is background pressure that makes one direction easier to hold — it does not time an entry or an exit on its own.',
    applies: (c, ev) => !!(ev && ev.regime && ev.regime.label),
  },
  {
    id: 'event-risk', topic: 'news', weight: 78,
    title: 'Holding through a high-impact release is a separate decision',
    body: 'Carrying an open position into a scheduled high-impact release is a decision in its own right, distinct from the trade idea. The release can move price further and faster than your normal management assumes, and spreads can widen at exactly the moment you would want to act.',
    applies: (c, ev) => !!(ev && Array.isArray(ev.calendar) && ev.calendar.length),
  },
  {
    id: 'position-size-pressure', topic: 'risk', weight: 82,
    title: 'If the size is the reason you cannot think, the size is the problem',
    body: 'When a position is large enough that the floating number drives the decision, the analysis stops being about the market. Reducing exposure is not an admission that the idea was wrong — it is what makes it possible to manage the idea on its merits.',
    applies: (c) => c.emotional_state === 'pressure_expressed' ||
      (!!c.position_size && /larg|big|heavy|over|zyada|بڑ/i.test(String(c.position_size))),
  },
  {
    id: 'averaging-down', topic: 'risk', weight: 72,
    title: 'Adding to a losing position without a pre-defined plan increases risk faster than it improves the average',
    body: 'Averaging down feels like improving the entry, but it raises total exposure at exactly the moment the market is disagreeing with you. It is only defensible when it was part of the plan before the trade was opened, with the total risk defined up front.',
    applies: (c) => (c.user_notes || []).some(n => /averag|add(ed|ing)? (more|to)|double|scal(e|ing) in/i.test(n)),
  },
  {
    id: 'no-live-price', topic: 'data', weight: 95, severity: 'warning',
    title: 'This analysis has no verified live price for your instrument',
    body: 'Without a current price, nothing below can measure where the trade actually stands right now — how far it is from your entry, your stop, or any level. Treat the structural and risk points as still valid, and confirm every price-dependent judgement on your own platform before acting.',
    applies: (c, ev) => !!(ev && ev.priceStatus !== 'verified'),
  },
];

// Select only the entries this specific case triggers.
export function selectKnowledge(tradeCase, evidence, limit = 6) {
  return TR_KNOWLEDGE
    .filter(k => { try { return k.applies(tradeCase, evidence); } catch { return false; } })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

export function knowledgeIds() { return TR_KNOWLEDGE.map(k => k.id); }
