// functions/utils/trade-rescue/analysis.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU TRADE RESCUE — MULTI-LAYER ANALYSIS ENGINE
//
// Turns a Trade Case + a verified evidence bundle into structured findings.
// Pure functions: no I/O, no LLM, no market access. Everything it states is
// either (a) a number the trader gave, (b) a number a provider returned, or
// (c) arithmetic over those two. It never sources a market value of its own.
//
// EVERY finding carries a `kind`, because the difference matters more here than
// anywhere else on the site:
//   FACT        a verified value, or arithmetic over verified values
//   ANALYSIS    an interpretation of those facts — reasoned, not guaranteed
//   SCENARIO    a conditional path ("if X then Y"), never a prediction
//   UNCERTAINTY something that could not be verified, stated as such
//
// No layer is allowed to override the others. The decision-support layer reads
// the whole set and, where the evidence disagrees, says that it disagrees.
// ════════════════════════════════════════════════════════════════════════════

export const KIND = { FACT: 'FACT', ANALYSIS: 'ANALYSIS', SCENARIO: 'SCENARIO', UNCERTAINTY: 'UNCERTAINTY' };

// Directional reading of one piece of evidence, RELATIVE TO THE TRADER'S SIDE.
// `basis` is mandatory — an item with no stated basis cannot enter the balance.
const supportive = (text, basis) => ({ stance: 'supportive', text, basis });
const opposing   = (text, basis) => ({ stance: 'opposing',   text, basis });
const neutral    = (text, basis) => ({ stance: 'neutral',    text, basis });

const r2 = (n) => Math.round(n * 100) / 100;
const pct = (a, b) => (b ? r2((a / b) * 100) : null);

// ── LAYER 1 — TRADE CONTEXT ─────────────────────────────────────────────────
export function layerTradeContext(c) {
  const f = [];
  if (c.instrument && c.direction) {
    f.push({ kind: KIND.FACT, text: `${c.direction === 'buy' ? 'Long' : 'Short'} ${c.instrument}${c.entry != null ? ` from ${c.entry}` : ''}${c.holding_duration ? `, held ${c.holding_duration}` : ''}.` });
  }
  if (c.original_thesis) f.push({ kind: KIND.FACT, text: `Original reason for entry, in your words: “${c.original_thesis}”.` });
  else f.push({ kind: KIND.UNCERTAINTY, text: 'You have not stated the original reason for entering, so this analysis cannot judge whether the idea itself is still intact — only whether the position is.' });
  if (c.timeframe_entry) f.push({ kind: KIND.FACT, text: `Entry timeframe: ${c.timeframe_entry}${c.timeframe_management ? `, managing on ${c.timeframe_management}` : ''}.` });
  return { id: 'trade_context', title: 'Trade context', findings: f, evidence: [] };
}

// ── LAYER 2 — TECHNICAL / MARKET STRUCTURE ──────────────────────────────────
// HONEST LIMIT: the platform's market endpoint returns price, daily change and
// the session high/low — and no OHLC candle series. Trend, swing structure and
// computed support/resistance therefore CANNOT be derived, and this layer says
// so rather than inventing levels. What it can do exactly is measure the
// position against verified numbers.
export function layerTechnical(c, ev) {
  const f = [], e = [];
  if (ev.priceStatus !== 'verified') {
    f.push({ kind: KIND.UNCERTAINTY, text: `No verified live price for ${c.instrument || 'this instrument'}, so distance to entry, stop and target cannot be measured here.` });
    return { id: 'technical', title: 'Technical / market structure', findings: f, evidence: e };
  }

  const price = ev.price;
  f.push({ kind: KIND.FACT, text: `Current price ${price} (retrieved ${ev.priceAt}).` });

  if (c.entry != null) {
    const diff = r2(price - c.entry);
    const inFavour = c.direction === 'buy' ? diff > 0 : diff < 0;
    const move = Math.abs(diff);
    f.push({ kind: KIND.FACT, text: `Price is ${move} ${inFavour ? 'in favour of' : 'against'} your entry at ${c.entry} (${pct(move, c.entry)}% of entry price).` });
    e.push(inFavour
      ? supportive(`Price is currently beyond your entry in your direction (${c.entry} → ${price}).`, 'verified current price vs your stated entry')
      : opposing(`Price is currently against your entry by ${move} (${c.entry} → ${price}).`, 'verified current price vs your stated entry'));
  }

  if (ev.session && ev.session.high != null && ev.session.low != null) {
    const { high, low } = ev.session;
    const span = high - low;
    const posPct = span > 0 ? r2(((price - low) / span) * 100) : null;
    f.push({ kind: KIND.FACT, text: `Session range ${low} – ${high}; price is sitting ${posPct != null ? posPct + '% up that range' : 'inside that range'}.` });
    if (posPct != null) {
      // Position within the DAY's realised range is a real, measurable fact.
      // It is a weak signal on its own and is labelled as such.
      if (posPct >= 70) e.push(c.direction === 'buy'
        ? supportive(`Price is in the upper ${100 - posPct}% of today's range.`, "position within today's verified session range")
        : opposing(`Price is in the upper ${100 - posPct}% of today's range, against a short.`, "position within today's verified session range"));
      else if (posPct <= 30) e.push(c.direction === 'sell'
        ? supportive(`Price is in the lower ${posPct}% of today's range.`, "position within today's verified session range")
        : opposing(`Price is in the lower ${posPct}% of today's range, against a long.`, "position within today's verified session range"));
      else e.push(neutral("Price is mid-range for the session — no directional edge from range position.", "position within today's verified session range"));
    }
    if (ev.session.changePct != null) {
      const cp = ev.session.changePct;
      const withUs = (c.direction === 'buy' && cp > 0) || (c.direction === 'sell' && cp < 0);
      e.push(withUs
        ? supportive(`Today's move (${cp}%) is in your direction.`, 'verified daily change from the market provider')
        : Math.abs(cp) < 0.15
          ? neutral(`Today's move (${cp}%) is effectively flat.`, 'verified daily change')
          : opposing(`Today's move (${cp}%) is against your direction.`, 'verified daily change from the market provider'));
    }
  }

  // Trader-stated levels are treated as THEIR levels, never as verified ones.
  const lv = [...(c.support_levels || []).map(v => ['support', v]), ...(c.resistance_levels || []).map(v => ['resistance', v])];
  for (const [kind, v] of lv) {
    const broken = kind === 'support' ? price < v : price > v;
    f.push({ kind: KIND.ANALYSIS, text: `Your stated ${kind} at ${v} is currently ${broken ? 'breached' : 'intact'} against a price of ${price}. (This level came from you — it is not a level this system verified from market data.)` });
    if (kind === 'support') e.push(broken
      ? (c.direction === 'buy' ? opposing(`Your stated support at ${v} has been breached.`, 'your level vs verified current price') : supportive(`Support at ${v} has broken, which favours the downside.`, 'your level vs verified current price'))
      : (c.direction === 'buy' ? supportive(`Your stated support at ${v} is still holding.`, 'your level vs verified current price') : neutral(`Support at ${v} still holding.`, 'your level vs verified current price')));
    else e.push(broken
      ? (c.direction === 'sell' ? opposing(`Your stated resistance at ${v} has been breached.`, 'your level vs verified current price') : supportive(`Price has cleared your stated resistance at ${v}.`, 'your level vs verified current price'))
      : (c.direction === 'sell' ? supportive(`Your stated resistance at ${v} is still capping price.`, 'your level vs verified current price') : neutral(`Resistance at ${v} still overhead.`, 'your level vs verified current price')));
  }

  if (!lv.length) {
    f.push({ kind: KIND.UNCERTAINTY, text: 'No support or resistance level is available. Our market feed provides price and session range only — not candle history — so this system cannot compute structural levels, and it will not invent them.' });
  }
  return { id: 'technical', title: 'Technical / market structure', findings: f, evidence: e };
}

// ── LAYER 3 — FUNDAMENTAL ───────────────────────────────────────────────────
export function layerFundamental(c, ev) {
  const f = [], e = [];
  if (!ev.regime && !ev.yields) {
    f.push({ kind: KIND.UNCERTAINTY, text: 'No verified macro data was available for this analysis.' });
    return { id: 'fundamental', title: 'Fundamental / macro', findings: f, evidence: e };
  }
  if (ev.regime) {
    f.push({ kind: KIND.FACT, text: `Market regime reads ${ev.regime.label} (VIX ${ev.regime.vix_level}).` });
  }
  if (ev.yields) {
    if (ev.yields.us10y != null) f.push({ kind: KIND.FACT, text: `US 10Y nominal yield ${ev.yields.us10y}% (FRED, as of ${ev.yields.us10y_date || 'n/a'}).` });
    if (ev.yields.real10y != null) f.push({ kind: KIND.FACT, text: `US 10Y real yield ${ev.yields.real10y}% (FRED, as of ${ev.yields.real10y_date || 'n/a'}).` });
    if (ev.yields.breakeven != null) f.push({ kind: KIND.FACT, text: `Breakeven inflation ${ev.yields.breakeven}%.` });
  }

  // Instrument-specific interpretation, stated as tendency — never as a rule.
  if (c.instrument === 'XAU/USD' && ev.yields && ev.yields.real10y != null) {
    const rr = ev.yields.real10y;
    f.push({ kind: KIND.ANALYSIS, text: `Real yields at ${rr}% are a structural headwind for gold at the higher end and a tailwind at the lower end, because gold pays no yield. This is a cross-cycle tendency, not a same-day rule.` });
    if (rr >= 2.0) e.push(c.direction === 'buy'
      ? opposing(`Real 10Y yield is elevated at ${rr}%, historically a headwind for gold.`, 'FRED DFII10 + the gold/real-yield relationship')
      : supportive(`Elevated real yields (${rr}%) lean against gold.`, 'FRED DFII10 + the gold/real-yield relationship'));
    else if (rr <= 1.0) e.push(c.direction === 'buy'
      ? supportive(`Low real yields (${rr}%) reduce the opportunity cost of holding gold.`, 'FRED DFII10 + the gold/real-yield relationship')
      : opposing(`Low real yields (${rr}%) lean in gold's favour, against a short.`, 'FRED DFII10 + the gold/real-yield relationship'));
    else e.push(neutral(`Real yields at ${rr}% are mid-range — no clear fundamental lean for gold.`, 'FRED DFII10'));
  }

  if (ev.regime && ev.regime.label) {
    const riskOn = /risk-on/i.test(ev.regime.label);
    if (c.instrument === 'BTC/USD') {
      e.push(riskOn
        ? (c.direction === 'buy' ? supportive('Risk-on regime is the friendlier backdrop for a high-beta asset like BTC.', 'VIX-derived regime from /api/sentiment') : opposing('Risk-on backdrop leans against a BTC short.', 'VIX-derived regime'))
        : (c.direction === 'sell' ? supportive('Risk-off backdrop pressures high-beta assets like BTC.', 'VIX-derived regime') : opposing('Risk-off backdrop is a headwind for a BTC long.', 'VIX-derived regime')));
    } else if (c.instrument === 'XAU/USD') {
      e.push(neutral(`Regime reads ${ev.regime.label}. Gold's response to risk regime is inconsistent — it trades as a defensive asset in some episodes and with real yields in others — so this is context, not a directional signal.`, 'VIX-derived regime'));
    } else {
      e.push(neutral(`Regime reads ${ev.regime.label} — background context for ${c.instrument || 'this instrument'}.`, 'VIX-derived regime'));
    }
  }
  return { id: 'fundamental', title: 'Fundamental / macro', findings: f, evidence: e };
}

// ── LAYER 4 — NEWS / EVENT ──────────────────────────────────────────────────
// Headlines are surfaced as RELEVANCE, never converted into a direction. A
// headline is not a forecast, and this system does not pretend to read one.
export function layerNews(c, ev) {
  const f = [], e = [];
  if (ev.newsStatus === 'verified' && ev.news.length) {
    f.push({ kind: KIND.FACT, text: `${ev.news.length} recent headline(s) in the current feed touch this instrument or its macro drivers:` });
    for (const n of ev.news) f.push({ kind: KIND.FACT, text: `• “${n.title}” — ${n.source}, ${n.publishedAt}` });
    f.push({ kind: KIND.ANALYSIS, text: 'These are listed because they are topically relevant. This system does not convert a headline into a directional forecast — the market has usually already reacted by the time a headline is readable.' });
    e.push(neutral(`${ev.news.length} relevant headline(s) present; none is treated as a directional signal.`, 'ZTU /api/news (Finnhub)'));
  } else {
    f.push({ kind: KIND.UNCERTAINTY, text: 'No instrument-specific headline could be verified in the current feed. No news is being assumed.' });
  }

  if (ev.calendarStatus === 'verified' && ev.calendar.length) {
    f.push({ kind: KIND.FACT, text: 'Upcoming scheduled events:' });
    for (const evt of ev.calendar) f.push({ kind: KIND.FACT, text: `• ${evt.event || evt.title} — ${evt.time || evt.date} (${evt.impact || 'impact n/a'})` });
    e.push(neutral('Scheduled event risk is present in the holding window.', 'ZTU /api/calendar'));
  } else {
    f.push({ kind: KIND.UNCERTAINTY, text: `Upcoming economic events could not be verified${ev.calendarNote ? ` — ${ev.calendarNote}` : ''}. Check an economic calendar yourself before holding through the next session; this system will not guess what is scheduled.` });
  }
  return { id: 'news', title: 'News / event', findings: f, evidence: e };
}

// ── LAYER 5 — SENTIMENT / MARKET CONTEXT ────────────────────────────────────
export function layerSentiment(c, ev) {
  const f = [], e = [];
  if (ev.regime && typeof ev.regime.vix_level === 'number') {
    const v = ev.regime.vix_level;
    const band = v >= 25 ? 'high' : v >= 20 ? 'elevated' : v >= 14 ? 'normal' : 'low';
    f.push({ kind: KIND.FACT, text: `VIX ${v} — ${band} volatility regime.` });
    if (band === 'high' || band === 'elevated') {
      f.push({ kind: KIND.ANALYSIS, text: 'In an elevated-volatility regime the distance price routinely travels against a sound position widens. Stops sized for a calm market get hit more often without the idea being wrong.' });
      e.push(neutral(`Volatility is ${band} (VIX ${v}) — wider adverse excursions are normal right now.`, 'FRED VIXCLS via /api/sentiment'));
    } else {
      e.push(neutral(`Volatility is ${band} (VIX ${v}).`, 'FRED VIXCLS via /api/sentiment'));
    }
  } else {
    f.push({ kind: KIND.UNCERTAINTY, text: 'No verified volatility/sentiment reading was available.' });
  }
  return { id: 'sentiment', title: 'Sentiment / market context', findings: f, evidence: e };
}

// ── LAYER 6 — RISK / POSITION MANAGEMENT ────────────────────────────────────
export function layerRisk(c, ev) {
  const f = [], e = [];
  if (c.has_stop_loss === false) {
    f.push({ kind: KIND.FACT, text: 'There is no Stop Loss on this position.' });
    f.push({ kind: KIND.ANALYSIS, text: 'This is the single most consequential fact in the case. The maximum loss is currently undefined — it is set by whatever the market does next, not by your plan. Every judgement below is secondary to it.' });
    e.push(opposing('No stop loss — maximum loss on the position is undefined.', 'stated by you in this conversation'));
  } else if (c.stop_loss != null && c.entry != null) {
    const riskDist = Math.abs(c.entry - c.stop_loss);
    f.push({ kind: KIND.FACT, text: `Risk per unit is ${r2(riskDist)} (entry ${c.entry} → stop ${c.stop_loss}).` });
    const wrongSide = (c.direction === 'buy' && c.stop_loss > c.entry) || (c.direction === 'sell' && c.stop_loss < c.entry);
    if (wrongSide) f.push({ kind: KIND.ANALYSIS, text: `Note: your stop at ${c.stop_loss} sits on the profitable side of entry for a ${c.direction}. If that is a deliberate stop into profit, good; if it is a typo, it changes the whole risk picture.` });
    if (c.take_profit != null) {
      const rewardDist = Math.abs(c.take_profit - c.entry);
      const rr = riskDist > 0 ? r2(rewardDist / riskDist) : null;
      if (rr != null) {
        f.push({ kind: KIND.FACT, text: `Planned risk/reward is approximately 1:${rr}.` });
        e.push(rr >= 1.5 ? supportive(`Planned R:R of 1:${rr} is structurally sound.`, 'arithmetic over your stated entry, stop and target')
          : opposing(`Planned R:R of 1:${rr} means the trade needs a high win rate to be viable.`, 'arithmetic over your stated entry, stop and target'));
      }
    }
    if (ev.priceStatus === 'verified') {
      const toStop = Math.abs(ev.price - c.stop_loss);
      f.push({ kind: KIND.FACT, text: `Price is currently ${r2(toStop)} away from your stop (${pct(toStop, ev.price)}% of price).` });
      const past = (c.direction === 'buy' && ev.price <= c.stop_loss) || (c.direction === 'sell' && ev.price >= c.stop_loss);
      if (past) f.push({ kind: KIND.ANALYSIS, text: 'Price is at or beyond your stop level — if the position is still open, confirm on your platform whether it executed.' });
    }
  } else {
    f.push({ kind: KIND.UNCERTAINTY, text: 'Stop level not established, so risk per unit cannot be measured.' });
  }

  if (c.position_size) f.push({ kind: KIND.FACT, text: `Position size, in your words: “${c.position_size}”.` });
  else f.push({ kind: KIND.UNCERTAINTY, text: 'Position size is unknown, so total exposure cannot be assessed.' });
  return { id: 'risk', title: 'Risk / position management', findings: f, evidence: e };
}

// ── LAYER 7 — TRADER BEHAVIOUR ──────────────────────────────────────────────
// Strengths as well as weaknesses, and only where the case actually supports it.
export function layerBehaviour(c) {
  const strengths = [], weaknesses = [];
  if (c.stop_loss != null) strengths.push('You defined a stop before this became a problem — that is the habit that keeps accounts alive.');
  if (c.take_profit != null) strengths.push('You set a target, so the trade had a defined objective rather than an open-ended hope.');
  if (c.original_thesis) strengths.push('You can still state why you entered, which is what makes it possible to judge whether the idea is intact.');
  if (c.timeframe_entry) strengths.push(`You know which timeframe the entry came from (${c.timeframe_entry}) — that anchors what counts as noise.`);

  if (c.has_stop_loss === false) weaknesses.push('No stop loss: the loss on this position is currently open-ended.');
  if (!c.original_thesis) weaknesses.push('No stated entry reason: without it, "hold" and "hope" are indistinguishable.');
  if (c.emotional_state === 'pressure_expressed') weaknesses.push('You have described pressure around this trade. That is worth naming — decisions made to relieve discomfort tend to be the ones traders regret.');
  if (c.timeframe_entry && c.timeframe_management && c.timeframe_entry !== c.timeframe_management) {
    weaknesses.push(`You entered on ${c.timeframe_entry} but are managing on ${c.timeframe_management}, which magnifies normal noise into apparent danger.`);
  }
  const f = [];
  for (const s of strengths) f.push({ kind: KIND.ANALYSIS, text: `Strength — ${s}` });
  for (const w of weaknesses) f.push({ kind: KIND.ANALYSIS, text: `Weakness — ${w}` });
  if (!f.length) f.push({ kind: KIND.UNCERTAINTY, text: 'Not enough detail yet to comment fairly on trade-management behaviour.' });
  return { id: 'behaviour', title: 'Trader behaviour', findings: f, evidence: [], strengths, weaknesses };
}

// ── LAYER 8 — SCENARIOS ─────────────────────────────────────────────────────
// Conditional paths only. Each is anchored to a condition that can be observed.
export function layerScenarios(c, ev) {
  const f = [];
  const inst = c.instrument || 'the instrument';
  const haveLevels = (c.support_levels || []).length || (c.resistance_levels || []).length;
  const sup = (c.support_levels || [])[0];
  const res = (c.resistance_levels || [])[0];

  f.push({ kind: KIND.SCENARIO, text: `**Continuation in your favour** — if ${inst} holds ${c.direction === 'buy' ? `above ${sup != null ? sup : 'the level your entry was based on'}` : `below ${res != null ? res : 'the level your entry was based on'}`} and the session range starts extending in your direction, the original idea is still doing what you expected. Management question becomes protecting what the position has, not whether to keep it.` });
  f.push({ kind: KIND.SCENARIO, text: `**Against you** — if ${inst} ${c.direction === 'buy' ? `loses ${sup != null ? sup : 'your invalidation level'}` : `reclaims ${res != null ? res : 'your invalidation level'}`} and closes beyond it on your entry timeframe (${c.timeframe_entry || 'the timeframe you entered on'}), the reason you entered is no longer present. That is the condition that turns "stuck" into "answered".` });
  f.push({ kind: KIND.SCENARIO, text: `**Range / no resolution** — if price keeps oscillating inside the current range, the trade neither confirms nor invalidates. Time in a position is itself a cost: exposure to scheduled events accumulates while nothing is proven.` });
  if (!haveLevels) f.push({ kind: KIND.UNCERTAINTY, text: 'These scenarios are framed generically because no verified or stated level was available to anchor them to. Give me your invalidation level and they become specific.' });
  return { id: 'scenarios', title: 'Scenarios', findings: f, evidence: [] };
}

// ── LAYER 9 — EVIDENCE WEIGHTING ────────────────────────────────────────────
// METHODOLOGY (stated, not implied — and deliberately NOT a numeric score):
//   1. Only discrete, traceable observations enter the balance. Each carries a
//      `basis` naming the verified input it came from.
//   2. Each is classified relative to the TRADER'S OWN DIRECTION as supportive,
//      opposing, or neutral. "Neutral" is a real outcome, not a rounding error.
//   3. Neutral/context items are listed but EXCLUDED from the balance — counting
//      context as evidence is how a fake score gets built.
//   4. The balance is reported qualitatively. Items are not weighted against one
//      another, because this system has no validated basis for saying that (say)
//      a real-yield reading outweighs a session-range reading. Counts are shown
//      only so the reader can audit the list, never as a probability.
export function weighEvidence(layers) {
  const all = layers.flatMap(l => (l.evidence || []).map(e => ({ ...e, layer: l.title })));
  const supportiveList = all.filter(e => e.stance === 'supportive');
  const opposingList   = all.filter(e => e.stance === 'opposing');
  const neutralList    = all.filter(e => e.stance === 'neutral');

  let balance, balanceText;
  const s = supportiveList.length, o = opposingList.length;
  if (s === 0 && o === 0) { balance = 'insufficient'; balanceText = 'Not enough directional evidence to form a balance.'; }
  else if (s > o && s - o >= 2) { balance = 'favours'; balanceText = 'On the evidence gathered, the balance currently leans in favour of your position.'; }
  else if (o > s && o - s >= 2) { balance = 'against'; balanceText = 'On the evidence gathered, the balance currently leans against your position.'; }
  else { balance = 'mixed'; balanceText = 'The evidence is genuinely mixed — supportive and opposing factors are close in number, which is itself a finding, not a failure to decide.'; }

  return {
    supportive: supportiveList, opposing: opposingList, neutral: neutralList,
    counts: { supportive: s, opposing: o, neutral: neutralList.length },
    balance, balanceText,
    methodology: 'Each item is a discrete observation traceable to a verified input, classified relative to your stated direction. Context-only items are listed but excluded from the balance. Items are not numerically weighted against each other and the counts are not a probability.',
  };
}

// ── LAYER 10 — DECISION SUPPORT ─────────────────────────────────────────────
// Considerations, never commands. Every line is conditional or observational.
export function layerDecisionSupport(c, ev, weighed) {
  const out = [];
  if (c.has_stop_loss === false) {
    out.push('**Define the loss first.** Before any hold-or-close judgement, decide the price at which this trade is wrong and what that costs. An undefined maximum loss is the one problem no amount of analysis can compensate for.');
  }
  if (weighed.balance === 'against') {
    out.push('The current evidence leans against the position. That is a reason to re-examine the original thesis against what the market is doing now — not, by itself, an instruction to close.');
  } else if (weighed.balance === 'favours') {
    out.push('The current evidence leans in favour of the position. The management question becomes protecting the position rather than justifying it.');
  } else if (weighed.balance === 'mixed') {
    out.push('With genuinely mixed evidence, size and invalidation matter more than direction. A position you can hold calmly through a mixed tape is one you can still manage; one you cannot is a sizing problem, not a market problem.');
  }
  if (c.emotional_state === 'pressure_expressed') {
    out.push('You have described pressure around this trade. Reducing exposure to a size you can think clearly at is a legitimate management action in its own right — it is not the same as admitting the idea was wrong.');
  }
  if (ev.calendarStatus !== 'verified') {
    out.push('Because upcoming scheduled events could not be verified here, check an economic calendar yourself before deciding to hold through the next session.');
  }
  if (ev.priceStatus !== 'verified') {
    out.push('No live price could be verified for this instrument, so confirm every price-dependent judgement above on your own platform before acting on it.');
  }
  out.push('Whatever you decide, write the condition down: the specific price or event that would change your mind. A trade with a written invalidation stops being "stuck".');
  return { id: 'decision', title: 'Decision support', considerations: out };
}

// ── ORCHESTRATOR ────────────────────────────────────────────────────────────
export function runAnalysis(tradeCase, evidence) {
  const layers = [
    layerTradeContext(tradeCase),
    layerTechnical(tradeCase, evidence),
    layerFundamental(tradeCase, evidence),
    layerNews(tradeCase, evidence),
    layerSentiment(tradeCase, evidence),
    layerRisk(tradeCase, evidence),
    layerBehaviour(tradeCase),
    layerScenarios(tradeCase, evidence),
  ];
  const weighed = weighEvidence(layers);
  const decision = layerDecisionSupport(tradeCase, evidence, weighed);
  return { layers, weighed, decision };
}
