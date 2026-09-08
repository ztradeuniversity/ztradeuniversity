// functions/utils/trade-rescue/meters.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU RESCUE — EVIDENCE METERS
//
// Three meters (Technical, Fundamental, Sentiment) summarising which way the
// VERIFIED evidence currently leans for the INSTRUMENT — never for the trader's
// position, and never as a forecast.
//
// These are deliberately NOT probabilities. This system has no historical
// outcome database, so it has no basis on which to say "70% chance of recovery",
// and inventing one would be the single most damaging thing it could do. What it
// can honestly do is state which verified inputs it found, which direction each
// leans, and how much of the intended evidence was actually available.
//
// METHODOLOGY (identical for all three meters, and printed to the user):
//   · Each meter declares a fixed set of INPUTS it would use if available.
//   · Every input that IS available contributes a lean of −1, 0 or +1, and a
//     weight. Nothing else contributes.
//   · score = Σ(lean × weight) / Σ(weight of available inputs)   →  −1 … +1
//   · COVERAGE = available inputs / declared inputs. Strength is coverage-based:
//     it describes how much evidence was found, NOT how confident the read is.
//   · An unavailable input lowers coverage. It is never treated as neutral
//     evidence, and never silently dropped from the denominator's meaning.
//   · Horizon: the current session. Every input is a same-day or latest-release
//     reading, so the meters say nothing about any longer horizon.
// ════════════════════════════════════════════════════════════════════════════

export const LEAN = { BULLISH: 'bullish', BEARISH: 'bearish', NEUTRAL: 'neutral' };

export const METHODOLOGY = {
  formula: 'score = Σ(lean × weight) ÷ Σ(weight of available inputs), lean ∈ {−1, 0, +1}',
  strength: 'Strength reports EVIDENCE COVERAGE (inputs found ÷ inputs declared), not confidence in an outcome.',
  horizon: 'Current session only. Every input is a same-day or latest-release reading.',
  limits: [
    'No probability of any outcome is produced, because this system holds no historical outcome data to derive one from.',
    'Unavailable inputs reduce coverage; they are never counted as neutral evidence.',
    'A meter describes the instrument, not the trader’s position. Whether that helps or hurts depends on their direction.',
  ],
};

const clamp = (n) => Math.max(-1, Math.min(1, n));
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function build(id, label, declared, contributions, unavailable) {
  const used = contributions.filter(c => c && c.lean !== undefined);
  const wsum = used.reduce((a, c) => a + c.weight, 0);
  const score = wsum > 0 ? clamp(used.reduce((a, c) => a + c.lean * c.weight, 0) / wsum) : null;
  const coverage = declared.length ? used.length / declared.length : 0;

  // Coverage bands. Deliberately conservative: a meter built on one input out of
  // four is Weak however decisive that input looks.
  const strength = score === null ? 'Unavailable'
    : coverage >= 0.75 ? 'Strong'
    : coverage >= 0.5 ? 'Moderate' : 'Weak';

  return {
    id, label,
    score: score === null ? null : round(score),
    lean: score === null ? null : score > 0.15 ? LEAN.BULLISH : score < -0.15 ? LEAN.BEARISH : LEAN.NEUTRAL,
    strength,
    coverage: round(coverage, 2),
    inputsDeclared: declared,
    inputsUsed: used.map(c => ({ input: c.input, lean: c.lean, weight: c.weight, basis: c.basis })),
    inputsUnavailable: unavailable,
  };
}

/**
 * TECHNICAL — what the verified price feed can actually support.
 * Structure, swing levels, momentum and multi-timeframe context all require
 * candle history. When no OHLC source answered, those inputs are reported
 * unavailable rather than estimated, and coverage falls accordingly.
 */
export function technicalMeter(ev, ohlc) {
  const declared = ['session position', 'session change', 'trend vs recent closes', 'distance from recent range'];
  const c = [], un = [];

  if (ev.priceStatus === 'verified' && ev.session && ev.session.high != null && ev.session.low != null && ev.session.high > ev.session.low) {
    const pos = (ev.price - ev.session.low) / (ev.session.high - ev.session.low);
    c.push({ input: 'session position', lean: pos > 0.6 ? 1 : pos < 0.4 ? -1 : 0, weight: 1,
             basis: `price sits ${Math.round(pos * 100)}% up today's ${ev.session.low}–${ev.session.high} range` });
  } else un.push('session position');

  if (ev.priceStatus === 'verified' && ev.session && ev.session.changePct != null) {
    const ch = ev.session.changePct;
    c.push({ input: 'session change', lean: ch > 0.15 ? 1 : ch < -0.15 ? -1 : 0, weight: 1,
             basis: `today's change ${ch}%` });
  } else un.push('session change');

  if (ohlc && ohlc.status === 'verified' && Array.isArray(ohlc.closes) && ohlc.closes.length >= 5 && ev.priceStatus === 'verified') {
    const closes = ohlc.closes;
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    c.push({ input: 'trend vs recent closes', lean: ev.price > mean ? 1 : ev.price < mean ? -1 : 0, weight: 1.5,
             basis: `current ${ev.price} vs mean of last ${closes.length} closes ${round(mean, 2)}` });
    const hi = Math.max(...closes), lo = Math.min(...closes);
    if (hi > lo) {
      const p = (ev.price - lo) / (hi - lo);
      c.push({ input: 'distance from recent range', lean: p > 0.66 ? 1 : p < 0.34 ? -1 : 0, weight: 1,
               basis: `price is ${Math.round(p * 100)}% up the recent ${round(lo, 2)}–${round(hi, 2)} range` });
    } else un.push('distance from recent range');
  } else {
    un.push('trend vs recent closes', 'distance from recent range');
  }

  return build('technical', 'Technical', declared, c, un);
}

/**
 * FUNDAMENTAL — macro pressure on the instrument, from FRED via /api/sentiment.
 * Gold and BTC read the same inputs in opposite directions where the
 * relationship is a documented cross-cycle tendency.
 */
export function fundamentalMeter(ev, instrument) {
  const isGold = instrument === 'XAU/USD';
  const declared = ['real 10Y yield', 'nominal 10Y yield', 'market regime', 'breakeven inflation'];
  const c = [], un = [];
  const y = ev.yields || {};

  // Gold pays no yield, so a high real yield raises the opportunity cost of
  // holding it. A cross-cycle tendency, not a same-day rule — hence weight 1.5,
  // not decisive.
  if (y.real10y != null) {
    const lean = y.real10y > 2.0 ? -1 : y.real10y < 1.0 ? 1 : 0;
    c.push({ input: 'real 10Y yield', lean: isGold ? lean : lean, weight: 1.5,
             basis: `US 10Y real yield ${y.real10y}% (FRED DFII10, ${y.real10y_date || 'latest'})` });
  } else un.push('real 10Y yield');

  if (y.us10y != null) {
    const lean = y.us10y > 4.5 ? -1 : y.us10y < 3.5 ? 1 : 0;
    c.push({ input: 'nominal 10Y yield', lean, weight: 1,
             basis: `US 10Y nominal ${y.us10y}% (FRED DGS10, ${y.us10y_date || 'latest'})` });
  } else un.push('nominal 10Y yield');

  if (ev.regime && ev.regime.label) {
    const riskOn = /risk[- ]?on/i.test(ev.regime.label);
    // Risk-on tends to favour higher-beta assets (BTC) and pressure defensive
    // ones (gold); risk-off the reverse.
    c.push({ input: 'market regime', lean: isGold ? (riskOn ? -1 : 1) : (riskOn ? 1 : -1), weight: 1,
             basis: `regime ${ev.regime.label} (VIX ${ev.regime.vix_level})` });
  } else un.push('market regime');

  if (y.breakeven != null) {
    c.push({ input: 'breakeven inflation', lean: y.breakeven > 2.5 ? 1 : y.breakeven < 2.0 ? -1 : 0, weight: 1,
             basis: `breakeven inflation ${y.breakeven}%` });
  } else un.push('breakeven inflation');

  return build('fundamental', 'Fundamental', declared, c, un);
}

/**
 * SENTIMENT — risk appetite and news tone. News tone is counted only as
 * relevance volume, never as a directional forecast, because a headline's
 * direction cannot be verified from its title.
 */
export function sentimentMeter(ev, instrument) {
  const isGold = instrument === 'XAU/USD';
  const declared = ['volatility regime', 'risk regime', 'relevant news flow'];
  const c = [], un = [];

  const vix = ev.regime && ev.regime.vix_level != null ? Number(ev.regime.vix_level) : null;
  if (vix != null && Number.isFinite(vix)) {
    // Elevated volatility is defensive-supportive and risk-asset-negative.
    const lean = vix > 25 ? 1 : vix < 15 ? -1 : 0;
    c.push({ input: 'volatility regime', lean: isGold ? lean : -lean, weight: 1.5,
             basis: `VIX ${vix} — ${vix > 25 ? 'elevated' : vix < 15 ? 'calm' : 'normal'}` });
  } else un.push('volatility regime');

  if (ev.regime && ev.regime.label) {
    const riskOn = /risk[- ]?on/i.test(ev.regime.label);
    c.push({ input: 'risk regime', lean: isGold ? (riskOn ? -1 : 1) : (riskOn ? 1 : -1), weight: 1,
             basis: `regime ${ev.regime.label}` });
  } else un.push('risk regime');

  if (ev.newsStatus === 'verified') {
    // Volume of relevant coverage is a real, checkable fact. Direction is not,
    // so this input always leans neutral and only reports that news exists.
    c.push({ input: 'relevant news flow', lean: 0, weight: 0.5,
             basis: `${ev.news.length} relevant headline(s) retrieved ${ev.newsAt} — counted as context, never scored directionally` });
  } else un.push('relevant news flow');

  return build('sentiment', 'Sentiment', declared, c, un);
}

/** All three meters plus the declared methodology. */
export function buildMeters(ev, instrument, ohlc) {
  return {
    methodology: METHODOLOGY,
    technical: technicalMeter(ev, ohlc),
    fundamental: fundamentalMeter(ev, instrument),
    sentiment: sentimentMeter(ev, instrument),
  };
}

/** Meter lines for the grounded brief, with their basis so nothing is asserted bare. */
export function meterLines(meters) {
  const L = [];
  for (const k of ['technical', 'fundamental', 'sentiment']) {
    const m = meters[k];
    if (!m) continue;
    if (m.score === null) { L.push(`${m.label} meter: UNAVAILABLE — none of its declared inputs could be verified.`); continue; }
    L.push(`${m.label} meter: ${m.lean} (score ${m.score} on −1…+1), evidence strength ${m.strength} (coverage ${Math.round(m.coverage * 100)}%).`);
    for (const i of m.inputsUsed) L.push(`   · ${i.input}: ${i.basis} → lean ${i.lean > 0 ? '+1' : i.lean < 0 ? '−1' : '0'} (weight ${i.weight})`);
    if (m.inputsUnavailable.length) L.push(`   · unavailable: ${m.inputsUnavailable.join(', ')}`);
  }
  return L;
}
