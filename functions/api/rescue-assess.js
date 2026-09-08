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
import { runAnalysis, KIND } from '../utils/trade-rescue/analysis.js';
import { selectKnowledge } from '../utils/trade-rescue/knowledge.js';
import { INSTRUMENTS, findWordNumbers } from '../utils/trade-rescue/case.js';
import { normalizeLayers, analyzePosition, aggregateToCase, positionLines, PROVENANCE } from '../utils/trade-rescue/position.js';
import { buildMeters, meterLines } from '../utils/trade-rescue/meters.js';
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
    const r = await fetch(`${origin}/api/market-history?${qs}`, { signal: AbortSignal.timeout(9000) });
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

// ── INTERPRETATION HELPERS ───────────────────────────────────────────────────
// Everything below turns already-computed, already-grounded facts into the
// FACT → WHY IT MATTERS → POSITION-SPECIFIC IMPACT shape the results page
// needs. None of it invents a new fact: `layer.evidence` items already carry
// `text` (the fact plus, in most layers, why it matters — see analysis.js),
// `basis` (the verified source) and `stance` computed RELATIVE TO THE TRADER'S
// OWN DIRECTION by the analysis layer that produced it (e.g. layerFundamental
// already flips real-yield pressure between a BUY and a SELL). This function
// only adds the explicit "Supports your X / Works against your X" label —
// the direction-awareness was already done upstream.
function positionBullets(layer, direction, limit = 5) {
  if (!layer) return [];
  const DIR = String(direction || '').toUpperCase();
  return (layer.evidence || []).slice(0, limit).map((e) => {
    const tag = e.stance === 'supportive' ? `Supports your ${DIR}`
      : e.stance === 'opposing' ? `Works against your ${DIR}`
      : 'Context only';
    return { text: e.text, tag, basis: e.basis };
  });
}
const topFacts = (layer, limit = 3) => (layer ? (layer.findings || []).filter(f => f.kind === KIND.FACT).slice(0, limit).map(f => f.text) : []);
const uncertaintyLines = (layer) => (layer ? (layer.findings || []).filter(f => f.kind === KIND.UNCERTAINTY).map(f => f.text) : []);

// NEWS — WHAT / WHY IT MATTERS / POSSIBLE EFFECT per headline, never a
// directional call from a title. Built straight from the verified article
// list (ev.news), not from a re-parsed findings string.
function newsBullets(ev, limit = 5) {
  if (ev.newsStatus !== 'verified' || !ev.news.length) return [];
  return ev.news.slice(0, limit).map((n) => ({
    what: n.title, source: n.source, at: n.publishedAt,
    why: "Touches this instrument's price drivers.",
    effect: 'Uncertain — content-dependent; markets typically move before a headline is readable, so no direction is inferred from the title alone.',
  }));
}
function calendarBullets(ev, limit = 5) {
  if (ev.calendarStatus !== 'verified' || !ev.calendar.length) return [];
  return ev.calendar.slice(0, limit).map((e) => ({
    what: e.event || e.title, when: e.time || e.date, impact: e.impact || 'impact not specified',
  }));
}

// MARKET DIRECTION — a single qualitative read for the INSTRUMENT (not the
// trader's position), averaged from the SAME −1…+1 scores the three evidence
// meters already computed, through the SAME ±0.15 threshold meters.js itself
// uses for one meter's lean. No new methodology, no percentage — an average of
// numbers that already exist, reported qualitatively as the task requires.
function marketDirection(meters) {
  const avail = ['technical', 'fundamental', 'sentiment'].map(k => meters[k]).filter(m => m && m.score != null);
  if (!avail.length) return { lean: null, drivers: [] };
  const avg = avail.reduce((a, m) => a + m.score, 0) / avail.length;
  const lean = avg > 0.15 ? 'bullish' : avg < -0.15 ? 'bearish' : 'mixed';
  const drivers = avail.map(m => `${m.label} reads ${m.lean || 'unavailable'} (${m.strength} evidence)`);
  return { lean, drivers };
}

// TRADE MANAGEMENT OPTIONS — exactly three, always. Option 2's protective
// level is either the verified-range invalidation candidate or an explicit,
// reasoned refusal — it is never a guessed number. Option 3 is a conditional
// scenario, never framed as a promise.
function buildManagementOptions(direction, weighed, invalidation) {
  const DIR = String(direction || '').toUpperCase();
  const opts = [];

  opts.push({
    title: 'Exit now', what: 'Close the position (or its losing layers) immediately, removing the open exposure.',
    why: weighed.balance === 'against'
      ? `Evidence currently leans against your ${DIR}; if you would not open this position today on the same information, that is itself the case for closing it now.`
      : weighed.balance === 'insufficient'
      ? 'There is not yet enough verified evidence to judge the position either way — removing the uncertainty is itself a legitimate reason some traders close here.'
      : `Even with evidence currently ${weighed.balance === 'favours' ? 'in your favour' : 'mixed'}, exiting removes all further exposure — the option exists regardless of the read.`,
    risk: 'Any loss on the closed portion is realised immediately rather than remaining open to change.',
  });

  if (invalidation && invalidation.ok) {
    opts.push({
      title: 'Protected hold',
      what: `Keep the position open, with a protective stop at or beyond the verified level ${invalidation.level} (${invalidation.side} the current price).`,
      why: `This is the boundary of the verified ${invalidation.sessions}-session trading range — the most defensible invalidation point available from real market data, not an estimate.`,
      trigger: `A close ${invalidation.side} ${invalidation.level} breaks the verified range this level is anchored to.`,
      risk: 'A brief spike through the level can still trigger the stop before price returns in your favour — this places a floor on the loss, it does not prevent one.',
    });
  } else {
    opts.push({
      title: 'Protected hold', what: 'Keep the position open with a protective stop.',
      why: `An exact protective level cannot be independently justified from the available verified data${invalidation ? `: ${invalidation.reason}` : ''}.`,
      risk: 'Without a defensible level, any stop placed here would be a guess rather than evidence — so none is proposed.', refused: true,
    });
  }

  opts.push({
    title: 'Conditional continuation / recovery scenario',
    what: 'Hold the position only while its confirming conditions remain true, on a defined schedule for reassessment — not indefinitely.',
    why: weighed.balance === 'favours'
      ? `Evidence currently leans in your favour; the position remains consistent with what is verified right now.`
      : 'This is not a guaranteed recovery. It names what would need to stay true for continuing to make sense.',
    trigger: invalidation && invalidation.ok
      ? `Reassess if the evidence balance flips, or on a close ${invalidation.side} ${invalidation.level}.`
      : 'Reassess if the evidence balance flips, or at the next verified price/news update, since no independent invalidation level is currently available.',
    risk: 'Holding without a defined reassessment point is how a stuck trade becomes an indefinite one — this option requires an actual review moment, not just hope.',
  });

  return opts;
}

// ── THE GROUNDED BRIEF ───────────────────────────────────────────────────────
function buildBrief(c, pos, ev, hist, meters, analysis, knowledge, range, invalidation) {
  const L = [];
  const byId = Object.fromEntries(analysis.layers.map(l => [l.id, l]));
  const md = marketDirection(meters);
  const w = analysis.weighed;
  const options = buildManagementOptions(c.direction, w, invalidation);

  L.push(`INSTRUMENT: ${c.instrument}`);
  L.push(`TRADER'S NET DIRECTION: ${String(c.direction || '').toUpperCase()} — every "supports/works against" label below is already relative to THIS side.`);
  L.push('');

  // Break-even is a computation aid, not something the trader asked to see as
  // a headline — deliberately excluded from this narrative summary. It stays
  // fully available on pos.breakevenPrice for the maths above and is never
  // referenced by name in the sections that follow.
  L.push('POSITION STRUCTURE (DERIVED — arithmetic on the trader\'s own figures plus the verified current price):');
  for (const line of positionLines(pos, c.instrument, { includeBreakeven: false })) L.push(`• ${line}`);
  L.push('');
  L.push('PER-LAYER RESULT (DERIVED):');
  for (const r of pos.perLayer) {
    L.push(`• ${r.id} ${String(r.direction).toUpperCase()} ${r.size} @ ${r.entry}${r.opened_at ? ` opened ${r.opened_at}` : ''}${r.purpose ? ` [${r.purpose}]` : ''} → ${r.points == null ? 'result unavailable (no verified price)' : `${r.points} lot-points${r.money != null ? ` ≈ ${r.money}` : ''}, ${r.helping ? 'helping' : r.helping === false ? 'hurting' : 'flat'}`}`);
  }
  L.push('');

  if (c.account && Object.keys(c.account).length) {
    L.push('ACCOUNT CONTEXT (USER_PROVIDED, unverified):');
    for (const [k, v] of Object.entries(c.account)) if (v !== null && v !== '') L.push(`• ${k}: ${v}`);
    L.push('');
  }
  if (c.context && Object.keys(c.context).length) {
    L.push('TRADE CONTEXT (USER_PROVIDED):');
    for (const [k, v] of Object.entries(c.context)) if (v !== null && v !== '') L.push(`• ${k}: ${v}`);
    L.push('');
  }

  if (ev.unavailable.length) {
    L.push('COULD NOT BE VERIFIED (state as unavailable — never fill in):');
    for (const u of ev.unavailable) L.push(`• ${u}`);
    L.push('');
  }

  // ── MARKET DIRECTION — the ONLY place a combined instrument-level read
  // appears; it is an average of the meters' own scores, nothing new.
  L.push('MARKET DIRECTION FOR THE INSTRUMENT (from the evidence meters below; write ONE sentence from this, no invented number):');
  L.push(md.lean ? `• Combined read: ${md.lean.toUpperCase()}.` : '• Not enough verified evidence to form a combined read.');
  for (const d of md.drivers) L.push(`• ${d}`);
  L.push('');

  L.push('EVIDENCE METERS (methodology is fixed and declared; these are NOT probabilities):');
  L.push(`• Formula: ${meters.methodology.formula}`);
  L.push(`• Strength: ${meters.methodology.strength}`);
  L.push(`• Horizon: ${meters.methodology.horizon}`);
  for (const line of meterLines(meters)) L.push(line.startsWith('   ') ? line : `• ${line}`);
  L.push('');

  // ── TECHNICAL — top facts, then position-tagged interpretation. If the
  // caller supplied verified OHLC, layerTechnical already computed a real
  // range and, where defensible, an invalidation candidate (see levels.js).
  L.push('TECHNICAL — write: what is happening, why it matters, the verified range if given, then the invalidation candidate or its refusal exactly as stated:');
  for (const t of topFacts(byId.technical, 4)) L.push(`• FACT: ${t}`);
  if (hist.status === 'verified' && hist.volatility) {
    L.push(`• FACT: Realised volatility ${hist.volatility.dailyPct}% daily / ${hist.volatility.annualisedPct}% annualised, over ${hist.volatility.samples} verified sessions (${hist.source}).`);
  }
  for (const b of positionBullets(byId.technical, c.direction)) L.push(`• ${b.text} → ${b.tag}. (basis: ${b.basis})`);
  for (const u of uncertaintyLines(byId.technical)) L.push(`• UNVERIFIED: ${u}`);
  if (invalidation) {
    L.push(invalidation.ok
      ? `• INVALIDATION CANDIDATE: ${invalidation.level} (${invalidation.side} current price), from the verified ${invalidation.sessions}-session range. Present this as the candidate protective level in Option 2 — do not alter the number.`
      : `• NO DEFENSIBLE INVALIDATION LEVEL: ${invalidation.reason} State this plainly in Option 2 — do NOT propose a number.`);
  }
  L.push('');

  L.push('FUNDAMENTAL — write: each verified driver as FACT, why it matters, and whether it supports or works against the trader\'s net direction. Include the supply/demand line exactly as given, do not omit it:');
  for (const t of topFacts(byId.fundamental, 4)) L.push(`• FACT: ${t}`);
  for (const b of positionBullets(byId.fundamental, c.direction)) L.push(`• ${b.text} → ${b.tag}. (basis: ${b.basis})`);
  for (const u of uncertaintyLines(byId.fundamental)) L.push(`• UNVERIFIED: ${u}`);
  L.push('');

  L.push('SENTIMENT — write: current reading, why, then position impact:');
  for (const t of topFacts(byId.sentiment, 3)) L.push(`• FACT: ${t}`);
  for (const b of positionBullets(byId.sentiment, c.direction)) L.push(`• ${b.text} → ${b.tag}. (basis: ${b.basis})`);
  for (const u of uncertaintyLines(byId.sentiment)) L.push(`• UNVERIFIED: ${u}`);
  L.push('');

  const newsItems = newsBullets(ev);
  const calItems = calendarBullets(ev);
  L.push('NEWS / EVENTS — for EACH item write WHAT, WHY IT MATTERS, POSSIBLE EFFECT exactly as "uncertain/content-dependent" (never a directional call from a headline):');
  if (newsItems.length) for (const n of newsItems) L.push(`• "${n.what}" (${n.source}, ${n.at}) — why: ${n.why} — effect: ${n.effect}`);
  else L.push('• No instrument-specific headline could be verified in the current feed.');
  if (calItems.length) for (const ev2 of calItems) L.push(`• Scheduled: ${ev2.what} — ${ev2.when} (${ev2.impact})`);
  else L.push(`• Upcoming economic events could not be verified${ev.calendarNote ? ` — ${ev.calendarNote}` : ''}.`);
  L.push('');

  L.push('EVIDENCE BALANCE (top 3-5 each — do not list more):');
  L.push(`Methodology: ${w.methodology}`);
  if (w.supportive.length) { L.push(`Supportive of the net position (${w.supportive.length} total, showing top 5):`); for (const e of w.supportive.slice(0, 5)) L.push(`• ${e.text}`); }
  if (w.opposing.length) { L.push(`Against the net position (${w.opposing.length} total, showing top 5):`); for (const e of w.opposing.slice(0, 5)) L.push(`• ${e.text}`); }
  L.push('');

  if (byId.risk) {
    L.push('RISK:');
    for (const f of byId.risk.findings) L.push(`• [${f.kind}] ${f.text}`);
    L.push('');
  }
  if (byId.behaviour) {
    L.push('TRADER STRENGTH / WEAKNESS:');
    for (const s of byId.behaviour.strengths || []) L.push(`• Strength: ${s}`);
    for (const wk of byId.behaviour.weaknesses || []) L.push(`• Weakness: ${wk}`);
    L.push('');
  }

  if (knowledge && knowledge.length) {
    L.push('RELEVANT TRADE-MANAGEMENT PRINCIPLES (stored knowledge — NOT current market data):');
    for (const k of knowledge) L.push(`• ${k.title}: ${k.body}`);
    L.push('');
  }

  L.push('TRADE MANAGEMENT OPTIONS — write EXACTLY these three, in this order, using ONLY the reasons/triggers/risks given (Option 2 must refuse a level if told to refuse — never invent one):');
  options.forEach((o, i) => {
    L.push(`Option ${i + 1} — ${o.title}:`);
    L.push(`  what: ${o.what}`);
    L.push(`  why: ${o.why}`);
    if (o.trigger) L.push(`  trigger: ${o.trigger}`);
    L.push(`  risk: ${o.risk}`);
  });
  return L.join('\n');
}

// Deterministic report — always produced, and the whole answer when the model
// is unavailable. UNLIKE buildBrief() (an English instruction document the
// model translates), this is genuinely trilingual on its own: every section is
// generated by result-i18n.js directly from the same verified objects
// (ev/pos/meters/range/invalidation) — it does not pull English strings from
// analysis.js and does not depend on the LLM to translate anything. Only
// `analysis.weighed.balance` is read from analysis.js, and only as a symbolic
// label ('favours'/'against'/'mixed'/'insufficient'), never as English text.
function renderDeterministic(lang, c, pos, ev, hist, meters, analysis, range, invalidation) {
  const H = RI.headings(lang), Lb = RI.labels(lang);
  const L = [];
  const bullet = (b) => `- ${b.text} — **${b.tag}**${b.basis ? ` _(${b.basis})_` : ''}`;

  // Collected as sections are built, so "What Supports/Against" is drawn from
  // the SAME localized bullets shown in each section — never a separate,
  // possibly-out-of-sync English list.
  const allEvidence = [];
  const collect = (items) => { for (const it of items) allEvidence.push(it); return items; };

  L.push(`### ${H.position}`);
  for (const line of RI.positionSummaryLines(lang, pos)) L.push(`- ${line}`);
  if (pos.perLayer.length) {
    L.push('');
    L.push(`**${H.layerByLayer}**`);
    L.push('');
    L.push(`| ${Lb.layer} | ${Lb.side} | ${Lb.size} | ${Lb.entry} | ${Lb.result} | |`);
    L.push('| --- | --- | --- | --- | --- | --- |');
    for (const r of pos.perLayer) {
      const { res, mark, size } = RI.perLayerRow(lang, r);
      L.push(`| ${r.id}${r.purpose ? ` (${r.purpose})` : ''} | ${String(r.direction).toUpperCase()} | ${size} | ${r.entry} | ${res} | ${mark} |`);
    }
  }
  L.push('');

  // Market Direction is now rendered separately at the top of the results page
  // (from the `marketDirection` field in the response, computed once in
  // onRequest() with the exact same RI.marketDirectionText() call) — so it is
  // deliberately NOT repeated here, to avoid showing it twice.

  L.push(`### ${H.currentMarket}`);
  if (ev.priceStatus === 'verified') {
    L.push(`- **${c.instrument} ${ev.price}** — ${ev.priceAt}`);
    if (ev.session) L.push(`- ${pick3(lang, `Session range **${ev.session.low} – ${ev.session.high}** (${ev.session.changePct}% today)`, `Session range **${ev.session.low} – ${ev.session.high}** (آج ${ev.session.changePct}%)`, `نطاق الجلسة **${ev.session.low} – ${ev.session.high}** (${ev.session.changePct}% اليوم)`)}`);
  } else L.push(`- ${pick3(lang, 'Current price could not be verified.', 'موجودہ price verify نہیں ہو سکی۔', 'تعذّر التحقق من السعر الحالي.')}`);
  for (const u of ev.unavailable) L.push(`- ⚠️ ${RI.localizeUnavailable(lang, u)}`);
  L.push('');

  L.push(`### ${H.technical}`);
  const tech = RI.technicalSection(lang, c, ev, range, invalidation);
  for (const t of tech.facts) L.push(`- ${t}`);
  if (hist.status === 'verified' && hist.volatility) {
    L.push(`- ${pick3(lang,
      `Realised volatility **${hist.volatility.dailyPct}% daily / ${hist.volatility.annualisedPct}% annualised**, over ${hist.volatility.samples} verified sessions (${hist.source}).`,
      `Realised volatility **${hist.volatility.dailyPct}% daily / ${hist.volatility.annualisedPct}% annualised**، ${hist.volatility.samples} verified sessions پر (${hist.source})۔`,
      `التقلب المحقق **${hist.volatility.dailyPct}% يومياً / ${hist.volatility.annualisedPct}% سنوياً**، عبر ${hist.volatility.samples} جلسة موثقة (${hist.source}).`)}`);
  }
  for (const b of collect(tech.evidence)) L.push(bullet(b));
  for (const u of tech.uncertainty) L.push(`- ⚠️ ${u}`);
  L.push('');

  L.push(`### ${H.fundamental}`);
  const fund = RI.fundamentalSection(lang, c, ev);
  for (const t of fund.facts) L.push(`- ${t}`);
  for (const b of collect(fund.evidence)) L.push(bullet(b));
  for (const u of fund.uncertainty) L.push(`- ⚠️ ${u}`);
  L.push('');

  L.push(`### ${H.sentiment}`);
  const sent = RI.sentimentSection(lang, ev);
  for (const t of sent.facts) L.push(`- ${t}`);
  for (const b of collect(sent.evidence)) L.push(bullet(b));
  for (const u of sent.uncertainty) L.push(`- ⚠️ ${u}`);
  L.push('');

  L.push(`### ${H.news}`);
  const newsIt = RI.newsItems(lang, ev);
  if (newsIt.length) for (const n of newsIt) L.push(`- **${n.what}** (${n.source}, ${n.at}) — ${n.why} ${pick3(lang, 'Possible effect:', 'ممکنہ اثر:', 'التأثير المحتمل:')} ${n.effect}`);
  else L.push(`- ${RI.newsUnavailable(lang)}`);
  const calIt = RI.calendarItems(lang, ev);
  if (calIt.length) for (const e2 of calIt) L.push(`- ${pick3(lang, 'Scheduled:', 'طے شدہ:', 'مجدول:')} ${e2.what} — ${e2.when} (${e2.impact})`);
  else L.push(`- ⚠️ ${RI.calendarUnavailable(lang, ev.calendarNote)}`);
  L.push('');

  // Also fold in the risk-section evidence item (e.g. "no stop loss") into the
  // same collected pool, so it can appear in the aggregate lists below exactly
  // as it appears in the Risk section itself.
  const risk = RI.riskSection(lang, c);
  collect(risk.evidence);

  const supportiveList = allEvidence.filter(b => b.stance === 'supportive');
  const opposingList = allEvidence.filter(b => b.stance === 'opposing');
  if (supportiveList.length) { L.push(`### ${H.supports}`); for (const b of supportiveList.slice(0, 5)) L.push(`- ${b.text}`); L.push(''); }
  if (opposingList.length) { L.push(`### ${H.against}`); for (const b of opposingList.slice(0, 5)) L.push(`- ${b.text}`); L.push(''); }

  L.push(`### ${H.risk}`);
  for (const t of risk.facts) L.push(`- ${t}`);
  L.push('');

  const behaviour = RI.behaviourSection(lang, c);
  if (behaviour.strengths.length) { L.push(`### ${H.strength}`); for (const s of behaviour.strengths) L.push(`- ${s}`); L.push(''); }
  if (behaviour.weaknesses.length) { L.push(`### ${H.weakness}`); for (const w2 of behaviour.weaknesses) L.push(`- ${w2}`); L.push(''); }

  const balance = analysis.weighed.balance; // symbolic only: 'favours'|'against'|'mixed'|'insufficient'
  // Trade Management Options are now rendered separately, directly under the
  // meters, from the structured `managementOptions` field in the response
  // (computed once in onRequest() via RI.managementOptionsLocalized(), and
  // reused there for both the response field and this function's own
  // `balance` input) — never as free markdown text here, so no heading-marker
  // artifact can leak into the UI and the WHAT/WHY/TRIGGER/RISK fields always
  // render with real typography instead of being parsed back out of prose.

  L.push(`### ${H.finalView}`);
  L.push(RI.finalMentorView(lang, c.direction, balance));
  return L.join('\n');
}
const pick3 = (lang, en, ur, ar) => RI.normLang(lang) === 'ur' ? ur : RI.normLang(lang) === 'ar' ? ar : en;

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
  const knowledge = selectKnowledge(tradeCase, evidence, 6);
  const meters = buildMeters(evidence, ins.id, history);

  // The one defensible protective level this system will ever propose: the
  // boundary of the verified recent range, and only when it actually sits on
  // the side of current price that would invalidate the direction. See
  // levels.js for the exact refusal cases.
  const range = computeVerifiedRange(history.closes || []);
  const invalidation = defensibleInvalidation(
    tradeCase.direction, evidence.priceStatus === 'verified' ? evidence.price : null, range);

  // Computed ONCE here so the JSON fields sent to the UI (managementOptions,
  // marketDirection, overallEvidence, and the per-meter-input impact/tooltip
  // below) and the deterministic report text are always the exact same
  // values — never recomputed a second time and never allowed to diverge.
  const balance = analysis.weighed.balance; // symbolic only: 'favours'|'against'|'mixed'|'insufficient'
  const managementOptions = RI.managementOptionsLocalized(lang, tradeCase.direction, balance, invalidation);
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
  const brief = buildBrief(reportCase, position, evidence, history, meters, analysis, knowledge, range, invalidation);
  const deterministic = renderDeterministic(lang, reportCase, position, evidence, history, meters, analysis, range, invalidation);
  const plan = await generateRescuePlan(env, brief, lang);

  let report = plan.text || deterministic;
  if (plan.degraded) report = `${T.degraded}\n\n${deterministic}`;
  report += `\n\n${T.disclaimer}`;

  return respond({
    mode: 'assessment',
    instrument: ins.id,
    report,
    position,
    meters: metersOut,
    // Structured, non-markdown fields for the top-of-page UI — rendered with
    // real HTML/CSS rather than parsed out of free text, so formatting is
    // never at the mercy of the model's own markdown choices. Each is the
    // exact same value the deterministic report text is built from.
    managementOptions,
    marketDirection,
    overallEvidence,
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
