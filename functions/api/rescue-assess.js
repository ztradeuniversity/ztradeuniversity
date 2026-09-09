// functions/api/rescue-assess.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU RESCUE — STRUCTURED TRADE ASSESSMENT   POST /api/rescue-assess
//
// The trader submits a complete position structure once; the system then does
// the rest itself. No questionnaire, no turn-by-turn extraction, no asking for
// anything it can retrieve.
//
//   { action: 'assess',
//     case: { instrument, layers:[…], account:{…}, context:{…} },
//     lang, identityToken }
//
//   { action: 'interpret', text, field, instrument }        ← voice / free text
//
// WHAT IS REUSED, UNCHANGED:
//   · access        — resolveTier / readGuestCount / buildGuestCookie, the SAME
//                     signed ztu_ai_guest counter and identity token every other
//                     ZTU surface uses. No second auth system, no second counter.
//   · evidence      — collectEvidence() over /api/market, /api/sentiment,
//                     /api/news, /api/calendar.
//   · analysis      — runAnalysis(): trade context, technical, fundamental,
//                     news, sentiment, risk, behaviour, crypto, scenarios,
//                     evidence weighting, decision support.
//   · knowledge     — selectKnowledge().
//   · LLM           — the existing OpenAI configuration via composer-llm.
//
// WHAT IS NEW HERE:
//   · position structure mathematics over multiple layers, including hedges;
//   · verified historical/OHLC context via /api/market-history;
//   · evidence meters with a declared methodology.
//
// NOTHING IS PERSISTED. The case travels in the request and back in the
// response; the trader's open-position details never touch a database.
// ════════════════════════════════════════════════════════════════════════════
import { collectEvidence, provenanceLines } from '../utils/trade-rescue/evidence.js';
import { runAnalysis } from '../utils/trade-rescue/analysis.js';
import { INSTRUMENTS, findWordNumbers } from '../utils/trade-rescue/case.js';
import { normalizeLayers, analyzePosition, aggregateToCase, positionLines, PROVENANCE } from '../utils/trade-rescue/position.js';
import { buildMeters } from '../utils/trade-rescue/meters.js';
import { computeVerifiedRange, defensibleInvalidation } from '../utils/trade-rescue/levels.js';
import * as RI from '../utils/trade-rescue/result-i18n.js';
import { generateRescuePlan, interpretTradeMessage, interpretLayers } from '../utils/composer-llm.js';
import { resolveTier, readGuestCount, buildGuestCookie } from '../utils/identity-session.js';
import { limitReachedPayload } from '../utils/access-copy.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// ── HISTORICAL / OHLC ────────────────────────────────────────────────────────
// Its own endpoint so a plan restriction there degrades this one section rather
// than the whole assessment.
async function collectHistory(origin, instrument, dates) {
  const out = { status: 'unavailable', note: null, candles: [], closes: [], volatility: null, dateContext: [] };
  const ins = INSTRUMENTS.find(i => i.id === instrument);
  if (!ins || !ins.live) { out.note = 'Historical context is offered only for instruments the live feed also covers.'; return out; }
  try {
    const qs = new URLSearchParams({ symbol: instrument, interval: '1day', outputsize: '60' });
    if (dates.length) qs.set('dates', dates.join(','));
    const url = `${origin}/api/market-history?${qs}`;
    // Same retry-once-on-transient-failure rule as collectEvidence()'s
    // getJson(): a 5xx or network/timeout error gets one retry; a definitive
    // 4xx (plan restriction, bad request) does not, since retrying it cannot
    // succeed differently.
    const attempt = () => fetch(url, { signal: AbortSignal.timeout(9000) }).catch(() => null);
    let r = await attempt();
    if (!r || (!r.ok && r.status >= 500)) r = await attempt();
    if (!r) { out.note = 'Historical market data could not be independently verified: the market-history endpoint did not respond.'; return out; }
    if (!r.ok) { out.note = `Historical market data could not be independently verified (HTTP ${r.status}).`; return out; }
    const d = await r.json();
    if (d.status !== 'verified') { out.note = d.note || 'Historical market data could not be independently verified.'; return out; }
    out.status = 'verified';
    out.candles = d.candles || [];
    out.closes = out.candles.map(c => c.close);
    out.volatility = d.volatility || null;
    out.dateContext = d.dateContext || [];
    out.source = d.source; out.retrievedAt = d.retrievedAt;
    out.firstAt = d.firstAt; out.lastAt = d.lastAt;
  } catch (e) {
    out.note = `Historical market data could not be independently verified: ${String(e.message || e).slice(0, 140)}`;
  }
  return out;
}

// ── THE GROUNDED BRIEF FOR THE FINAL MENTOR REVIEW ───────────────────────────
// Deliberately small. Technical / Fundamental / Sentiment / Upcoming Economic
// Data / General News and the three named management solutions are ALL
// already shown to the trader, in full, as their own structured sections on
// the result page (see evidenceImpact / managementOptions below) — this brief
// exists only so the model can write ONE short synthesis that references
// them, never so it can restate them.
function buildBrief(c, pos, weighed, hasStop, managementOptions) {
  const L = [];
  L.push(`INSTRUMENT: ${c.instrument}`);
  L.push(`TRADER'S NET DIRECTION: ${String(c.direction || '').toUpperCase()}`);
  L.push('');
  L.push('POSITION (DERIVED):');
  for (const line of positionLines(pos, c.instrument, { includeBreakeven: false })) L.push(`• ${line}`);
  L.push('');
  L.push(`EVIDENCE BALANCE: ${weighed.balance}`);
  if (weighed.supportive.length) L.push(`STRONGEST SUPPORT: ${weighed.supportive[0].text}`);
  if (weighed.opposing.length) L.push(`STRONGEST MARKET-EVIDENCE RISK: ${weighed.opposing[0].text}`);
  if (hasStop === false) {
    L.push('CRITICAL RISK: No stop loss is set — the maximum loss on this position is currently undefined. This outranks every market-evidence consideration below.');
  }
  L.push('');
  L.push('THE THREE MANAGEMENT SOLUTIONS ALREADY SHOWN TO THE TRADER IN FULL (refer to by name only if useful — never redescribe their What/Why/Trigger/Risk, they are rendered in full below your text):');
  managementOptions.forEach((o, i) => L.push(`${i + 1}. ${o.title} — Management Fit ${o.rating}/10`));
  return L.join('\n');
}

// Deterministic fallback for when the model is unavailable — built directly
// from the SAME structured finalMentorReview object the JSON response sends,
// so the fallback prose can never disagree with the labelled fields next to
// it on the page.
function deterministicMentorProse(review) {
  return `${review.whereNow} ${review.takeaway}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const origin = new URL(request.url).origin;
  const lang = String(body.lang || 'en').slice(0, 2).toLowerCase();
  const T = RI.labels(lang);

  // ── ACCESS — the SAME gate, token and counter as every other ZTU surface ──
  const { tier } = await resolveTier(env, body.identityToken || '');
  const visitorLimit = parseInt(env.AI_VISITOR_MESSAGE_LIMIT ?? '5', 10) || 5;
  let guestSetCookie = null;
  if (tier !== 'unlimited') {
    const used = await readGuestCount(env, request);
    if (used >= visitorLimit) {
      return json({ mode: 'limit', tier: 'visitor', freeLimit: visitorLimit, gate: limitReachedPayload(env, lang) });
    }
    guestSetCookie = await buildGuestCookie(env, used + 1);
  }
  const respond = (payload, status = 200) => {
    const h = guestSetCookie ? { ...JSON_H, 'Set-Cookie': guestSetCookie } : JSON_H;
    return new Response(JSON.stringify({ ...payload, tier, freeLimit: visitorLimit }), { status, headers: h });
  };

  // ── ACTION: interpret one natural-language / dictated field ───────────────
  // Semantic understanding for a single field, so voice and free text fill the
  // structured form instead of bypassing it. Validation lives in
  // interpretTradeMessage: nothing the trader did not say can come back.
  // Numbers the sentence genuinely supports: digits AND spoken forms
  // ("چار ہزار تینتالیس" = 4043). The semantic layers are validated against
  // this list, so neither can introduce a figure the trader did not say.
  const supportedNumbers = (t) => [
    ...(String(t).match(/\d+(?:[.,]\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.'))),
    ...findWordNumbers(String(t)).map(w => w.value),
  ].filter(Number.isFinite);

  // ── ACTION: read a whole book out of one sentence ────────────────────────
  if (body.action === 'interpret_layers') {
    const text = String(body.text || '').slice(0, 1500);
    let res = null;
    try { res = await interpretLayers(env, text, supportedNumbers(text)); } catch { res = null; }
    return respond({ mode: 'interpret_layers', layers: (res && res.layers) || [],
                     ambiguous: res ? res.ambiguous : true, degraded: res === null });
  }

  if (body.action === 'interpret') {
    const text = String(body.text || '').slice(0, 1200);
    const allowedNumbers = supportedNumbers(text);
    let sem = null;
    try {
      sem = await interpretTradeMessage(env, text, {
        allowInstruments: INSTRUMENTS.map(i => i.id),
        allowedNumbers: [...allowedNumbers, ...(Array.isArray(body.allowedNumbers) ? body.allowedNumbers : [])],
        known: body.known || {},
      });
    } catch { sem = null; }
    return respond({ mode: 'interpret', field: body.field || null, semantic: sem, degraded: sem === null });
  }

  // ── ACTION: assess ────────────────────────────────────────────────────────
  const raw = body.case || {};
  const ins = INSTRUMENTS.find(i => i.id === String(raw.instrument || '').toUpperCase());
  if (!ins) return respond({ mode: 'error', error: 'unsupported_instrument' }, 400);

  const layers = normalizeLayers(raw.layers);
  if (!layers.length) return respond({ mode: 'error', error: 'no_layers' }, 400);

  const account = raw.account && typeof raw.account === 'object' ? raw.account : {};
  const ctx = raw.context && typeof raw.context === 'object' ? raw.context : {};

  // 1 ── VERIFIED CURRENT DATA. Fetched, never asked for.
  const baseCase = {
    instrument: ins.id, instrumentLive: ins.live,
    direction: null, entry: null, stop_loss: null, has_stop_loss: null,
    take_profit: null, position_size: null, holding_duration: ctx.holding_duration || null,
    timeframe_entry: ctx.timeframe || null, original_thesis: ctx.thesis || null,
    support_levels: [], resistance_levels: [], trend_context: null,
    floating_state: null, emotional_state: ctx.concern ? 'pressure_expressed' : null,
    user_notes: [], asked: [], turns: 1,
  };
  const dates = layers.map(l => l.opened_at).filter(Boolean).map(d => String(d).slice(0, 10));
  const [evidence, history] = await Promise.all([
    collectEvidence(origin, baseCase),
    collectHistory(origin, ins.id, [...new Set(dates)]),
  ]);

  // 2 ── POSITION MATHEMATICS (deterministic; no model involved).
  const price = evidence.priceStatus === 'verified' ? evidence.price : null;
  const position = analyzePosition(layers, ins.id, price, raw.contractUnits ?? null);

  // 3 ── AGGREGATE → the EXISTING analysis engine, unchanged. `history` is
  // passed through to layerTechnical ONLY here — the conversational endpoint
  // still calls runAnalysis with two arguments and gets its prior behaviour
  // unchanged (see analysis.js).
  const tradeCase = aggregateToCase(position, baseCase);
  const analysis = runAnalysis(tradeCase, evidence, history);
  const meters = buildMeters(evidence, ins.id, history);

  // The one defensible protective level this system will ever propose: the
  // boundary of the verified recent range, and only when it actually sits on
  // the side of current price that would invalidate the direction. See
  // levels.js for the exact refusal cases.
  const range = computeVerifiedRange(history.closes || []);
  const invalidation = defensibleInvalidation(
    tradeCase.direction, evidence.priceStatus === 'verified' ? evidence.price : null, range);

  // Computed ONCE here so every JSON field sent to the UI and the mentor
  // review text below are always the exact same values — never recomputed a
  // second time and never allowed to diverge.
  const balance = analysis.weighed.balance; // symbolic only: 'favours'|'against'|'mixed'|'insufficient'
  const managementOptions = RI.managementOptionsLocalized(lang, tradeCase.direction, balance, invalidation, position);
  // Management Fit — deterministic 1-10 (NOT a probability), attached in the
  // SAME fixed order managementOptionsLocalized() always returns its three
  // options in (Immediate Risk Reduction, Protected Continuation, Structured
  // Reassessment — see result-i18n.js's managementFitRatings() for the formula).
  const fit = RI.managementFitRatings({ balance, meters, hasStop: tradeCase.has_stop_loss !== false, invalidation });
  const fitOrder = [fit.exit, fit.protectedContinuation, fit.reassessment];
  managementOptions.forEach((o, i) => { o.rating = fitOrder[i]; });
  const marketDirection = RI.marketDirectionText(lang, meters, ins.id);
  const overallEvidence = RI.overallEvidence(lang, meters);
  // Enriches (never replaces) meters.js's own `inputsUsed` rows with a
  // position-specific impact tag and a tooltip explanation, both derived
  // purely from the existing `lean` sign each row already carries plus the
  // trader's own stated direction — meters.js itself is not modified.
  const withExplain = (m) => (!m ? m : {
    ...m,
    inputsUsed: m.inputsUsed.map(i => ({ ...i, ...RI.meterInputExplain(lang, tradeCase.direction, i.lean) })),
  });
  const metersOut = { methodology: meters.methodology,
    technical: withExplain(meters.technical), fundamental: withExplain(meters.fundamental), sentiment: withExplain(meters.sentiment) };

  // 4 ── SYNTHESIS. One model call, retried internally; deterministic on failure.
  const reportCase = { instrument: ins.id, direction: tradeCase.direction, account, context: ctx };
  const instrumentName = RI.instrumentDisplayName(lang, ins.id);

  // EVIDENCE IMPACT — the five evidence sections (Technical / Fundamental /
  // Sentiment / Upcoming Economic Data / General News), each a compact,
  // deterministic FACT → IMPACT ON INSTRUMENT → WHY → TRADE EFFECT reading.
  // No second analysis pipeline — these are the exact same localized section
  // builders and evidence objects the rest of this file already produces.
  const calendarUpcoming = RI.calendarSection(lang, evidence, instrumentName);
  const evidenceImpact = {
    instrumentName,
    technical: RI.technicalSection(lang, reportCase, evidence, range, invalidation),
    fundamental: RI.fundamentalSection(lang, reportCase, evidence),
    sentiment: RI.sentimentSection(lang, evidence),
    upcomingData: calendarUpcoming,
    news: RI.newsItems(lang, evidence),
  };
  const fiveFactor = RI.fiveFactorOverview(lang, meters, calendarUpcoming.events.length > 0, evidenceImpact.news.length > 0);

  // FINAL MENTOR REVIEW — structured (whereNow/strongestSupport/strongestRisk/
  // takeaway). Deliberately built from the LOCALIZED evidence bullets already
  // collected into evidenceImpact above, NOT analysis.js's own weighEvidence()
  // list — that list is intentionally English-only (it only ever fed the LLM
  // brief before this redesign); reading it directly here would leak
  // untranslated English into an Urdu/Arabic review. `report` is the short
  // flowing-prose version of the SAME facts: the LLM's paraphrase when
  // available, or a deterministic concatenation of the structured fields when
  // it is not — so the two can never disagree.
  const localizedEvidence = [
    ...evidenceImpact.technical.evidence,
    ...evidenceImpact.fundamental.evidence,
    ...evidenceImpact.sentiment.evidence,
  ];
  const localizedWeighed = {
    supportive: localizedEvidence.filter((b) => b.stance === 'supportive'),
    opposing: localizedEvidence.filter((b) => b.stance === 'opposing'),
  };
  const finalMentorReview = RI.finalMentorReview(lang, tradeCase.direction, balance, localizedWeighed, tradeCase);
  const brief = buildBrief(reportCase, position, analysis.weighed, tradeCase.has_stop_loss, managementOptions);
  const plan = await generateRescuePlan(env, brief, lang);

  let report = plan.text || deterministicMentorProse(finalMentorReview);
  if (plan.degraded) report = `${T.degraded}\n\n${report}`;

  return respond({
    mode: 'assessment',
    instrument: ins.id,
    report,
    finalMentorReview,
    position,
    meters: metersOut,
    // Structured, non-markdown fields for the page UI — rendered with real
    // HTML/CSS rather than parsed out of free text, so formatting is never
    // at the mercy of the model's own markdown choices.
    managementOptions,
    marketDirection,
    overallEvidence,
    evidenceImpact,
    fiveFactor,
    // Shared localized labels the client uses to render the sections above,
    // so no UI string is ever hand-duplicated in trade-rescue.html and
    // allowed to drift from the language this response was built in.
    ui: { headings: RI.headings(lang), labels: T },
    evidence: {
      collectedAt: evidence.collectedAt,
      price: evidence.price, priceStatus: evidence.priceStatus, priceAt: evidence.priceAt,
      session: evidence.session, regime: evidence.regime, yields: evidence.yields,
      news: evidence.news, newsStatus: evidence.newsStatus, newsAt: evidence.newsAt,
      calendarStatus: evidence.calendarStatus,
      // Both arrays leave evidence.js in English (untouched — see result-i18n.js's
      // header comment for why). Localized here, at the response boundary, so the
      // Sources panel (which renders both verbatim) matches the selected language
      // exactly like the report body already does.
      unavailable: evidence.unavailable.map(u => RI.localizeUnavailable(lang, u)),
      provenance: provenanceLines(evidence).map(p => RI.localizeProvenanceLine(lang, p)),
    },
    history: {
      status: history.status, note: history.note, count: history.candles.length,
      firstAt: history.firstAt || null, lastAt: history.lastAt || null,
      volatility: history.volatility, dateContext: history.dateContext, source: history.source || null,
    },
    // Per data type: which feed answered, and whether it was the backup. The
    // UI shows this verbatim, so a value served by gold-api.com is never
    // presented as TwelveData. Failure of one provider is reported as that
    // provider's failure only — never as "market data unavailable".
    providers: {
      price: { status: evidence.priceStatus, provider: evidence.priceProvider,
               viaFallback: !!evidence.priceViaFallback, at: evidence.priceAt },
      macro: { status: evidence.regime ? 'verified' : 'unavailable', provider: 'FRED', viaFallback: false, at: evidence.collectedAt },
      news:  { status: evidence.newsStatus, provider: evidence.newsProvider,
               viaFallback: !!evidence.newsViaFallback, at: evidence.newsAt },
      calendar: { status: evidence.calendarStatus, provider: 'Finnhub', viaFallback: false, at: evidence.calendarAt || null },
      history: { status: history.status, provider: history.status === 'verified' ? 'TwelveData /time_series' : null,
                 viaFallback: false, at: history.retrievedAt || null, note: history.note || null },
      reasoning: { status: plan.degraded ? 'unavailable' : 'verified', provider: plan.provider, reason: plan.reason },
    },
    synthesis: { provider: plan.provider, degraded: plan.degraded, reason: plan.reason },
    // The verified range and the ONE protective level this system will ever
    // propose (or its exact refusal reason) — same values the report text was
    // built from, exposed for a UI that wants to show them separately.
    levels: { range, invalidation },
    provenanceLegend: PROVENANCE,
  });
}
