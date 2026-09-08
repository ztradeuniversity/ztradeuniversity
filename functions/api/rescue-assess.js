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

const L10N = {
  en: {
    disclaimer: '_This is decision-support based on the evidence available right now — not a guaranteed outcome, and not financial advice. Market conditions can change at any time, and the decision on your own position is always yours._',
    degraded: '_The written analysis below was composed from the verified data without the AI reasoning layer, which was briefly unavailable. Every figure and source shown is unaffected._',
  },
  ur: {
    disclaimer: '_یہ اس وقت دستیاب evidence کی بنیاد پر decision-support ہے — کوئی guaranteed نتیجہ نہیں، اور نہ ہی financial advice۔ Market حالات کسی بھی وقت بدل سکتے ہیں، اور آپ کی اپنی position کا فیصلہ ہمیشہ آپ کا ہے۔_',
    degraded: '_نیچے دیا گیا تجزیہ verified data سے تیار کیا گیا ہے؛ AI reasoning layer عارضی طور پر دستیاب نہیں تھی۔ تمام figures اور sources بدستور درست ہیں۔_',
  },
  ar: {
    disclaimer: '_هذا دعم لاتخاذ القرار بناءً على الأدلة المتاحة الآن — وليس نتيجة مضمونة ولا نصيحة مالية. ظروف السوق قد تتغير في أي وقت، والقرار بشأن مركزك يبقى قرارك أنت._',
    degraded: '_التحليل أدناه بُني من البيانات الموثقة دون طبقة الاستدلال بالذكاء الاصطناعي، التي كانت غير متاحة مؤقتاً. جميع الأرقام والمصادر غير متأثرة._',
  },
};
const pickL = (l) => L10N[String(l || 'en').slice(0, 2).toLowerCase()] || L10N.en;

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

// ── THE GROUNDED BRIEF ───────────────────────────────────────────────────────
function buildBrief(c, pos, ev, hist, meters, analysis, knowledge) {
  const L = [];
  L.push(`INSTRUMENT: ${c.instrument}`);
  L.push('');
  L.push('POSITION STRUCTURE (DERIVED — arithmetic on the trader\'s own figures plus the verified current price):');
  for (const line of positionLines(pos, c.instrument)) L.push(`• ${line}`);
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

  L.push('CURRENT VERIFIED DATA (fetched now; nothing here is remembered or estimated):');
  if (ev.priceStatus === 'verified') {
    L.push(`• ${c.instrument} price ${ev.price} — ${ev.priceSource}, retrieved ${ev.priceAt}`);
    if (ev.session) L.push(`• Session low ${ev.session.low}, high ${ev.session.high}, change ${ev.session.changePct}%`);
  } else L.push('• Current price could not be verified.');
  if (ev.regime) L.push(`• Market regime ${ev.regime.label}, VIX ${ev.regime.vix_level} — FRED via /api/sentiment, retrieved ${ev.collectedAt}`);
  if (ev.yields) {
    if (ev.yields.us10y != null) L.push(`• US 10Y nominal ${ev.yields.us10y}% (FRED DGS10, as of ${ev.yields.us10y_date})`);
    if (ev.yields.real10y != null) L.push(`• US 10Y real ${ev.yields.real10y}% (FRED DFII10, as of ${ev.yields.real10y_date})`);
    if (ev.yields.breakeven != null) L.push(`• Breakeven inflation ${ev.yields.breakeven}%`);
  }
  if (ev.newsStatus === 'verified' && ev.news.length) {
    L.push(`• ${ev.news.length} relevant headline(s), retrieved ${ev.newsAt}:`);
    for (const n of ev.news) L.push(`   – "${n.title}" (${n.source}, ${n.publishedAt})`);
  }
  L.push('');

  L.push('HISTORICAL / OHLC CONTEXT:');
  if (hist.status === 'verified') {
    L.push(`• ${hist.candles.length} daily candles ${hist.firstAt} → ${hist.lastAt} (${hist.source}, retrieved ${hist.retrievedAt}).`);
    if (hist.volatility) L.push(`• Realised volatility ${hist.volatility.dailyPct}% daily / ${hist.volatility.annualisedPct}% annualised (${hist.volatility.method}, ${hist.volatility.samples} samples).`);
    for (const d of hist.dateContext) {
      L.push(d.matched
        ? `• Entry date ${d.date}: O ${d.open} H ${d.high} L ${d.low} C ${d.close} (VERIFIED, ${d.source}).`
        : `• Entry date ${d.date}: ${d.reason}`);
    }
  } else {
    L.push(`• ${hist.note || 'Historical market context could not be independently verified.'} Do not describe trend, structure or levels as though candles were available.`);
  }
  L.push('');

  if (ev.unavailable.length) {
    L.push('COULD NOT BE VERIFIED (state as unavailable — never fill in):');
    for (const u of ev.unavailable) L.push(`• ${u}`);
    L.push('');
  }

  L.push('EVIDENCE METERS (methodology is fixed and declared; these are NOT probabilities):');
  L.push(`• Formula: ${meters.methodology.formula}`);
  L.push(`• Strength: ${meters.methodology.strength}`);
  L.push(`• Horizon: ${meters.methodology.horizon}`);
  for (const line of meterLines(meters)) L.push(line.startsWith('   ') ? line : `• ${line}`);
  L.push('');

  for (const layer of analysis.layers) {
    if (!layer.findings.length) continue;
    L.push(`${layer.title.toUpperCase()}:`);
    for (const f of layer.findings) L.push(`[${f.kind}] ${f.text}`);
    L.push('');
  }

  const w = analysis.weighed;
  L.push('EVIDENCE BALANCE:');
  L.push(`Methodology: ${w.methodology}`);
  if (w.supportive.length) { L.push(`Supportive of the net position (${w.supportive.length}):`); for (const e of w.supportive) L.push(`• ${e.text}`); }
  if (w.opposing.length) { L.push(`Against the net position (${w.opposing.length}):`); for (const e of w.opposing) L.push(`• ${e.text}`); }
  L.push('');

  if (knowledge && knowledge.length) {
    L.push('RELEVANT TRADE-MANAGEMENT PRINCIPLES (stored knowledge — NOT current market data):');
    for (const k of knowledge) L.push(`• ${k.title}: ${k.body}`);
    L.push('');
  }
  if (analysis.decision && (analysis.decision.considerations || []).length) {
    L.push('DECISION SUPPORT:');
    for (const t of analysis.decision.considerations) L.push(`• ${t}`);
  }
  return L.join('\n');
}

// Deterministic report — always produced, and the whole answer when the model
// is unavailable. Built from the same brief the model would have rewritten.
function renderDeterministic(c, pos, ev, hist, meters, analysis) {
  const L = [];
  L.push('### Position Summary');
  for (const line of positionLines(pos, c.instrument)) L.push(`- ${line}`);
  if (pos.perLayer.length) {
    L.push('');
    L.push('**Layer by layer** — which part of the book is helping and which is hurting:');
    L.push('');
    L.push('| Layer | Side | Size | Entry | Opened | Result | |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const r of pos.perLayer) {
      const res = r.points == null ? 'no verified price'
        : `${r.points} lot-pts${r.money != null ? ` (${r.money})` : ''}`;
      const mark = r.helping === true ? 'helping' : r.helping === false ? 'hurting' : '—';
      L.push(`| ${r.id}${r.purpose ? ` (${r.purpose})` : ''} | ${String(r.direction).toUpperCase()} | ${r.size} | ${r.entry} | ${r.opened_at || '—'} | ${res} | ${mark} |`);
    }
  }
  L.push('');
  L.push('### Current Market');
  if (ev.priceStatus === 'verified') {
    L.push(`- **${c.instrument} ${ev.price}** — retrieved ${ev.priceAt}`);
    if (ev.session) L.push(`- Session range **${ev.session.low} – ${ev.session.high}** (${ev.session.changePct}% today)`);
  } else L.push('- Current price could not be verified.');
  if (ev.regime) L.push(`- Market regime **${ev.regime.label}**, VIX ${ev.regime.vix_level}`);
  for (const u of ev.unavailable) L.push(`- ⚠️ ${u}`);
  L.push('');
  for (const layer of analysis.layers) {
    if (!layer.findings.length) continue;
    L.push(`### ${layer.title}`);
    for (const f of layer.findings) L.push(`- ${f.kind === KIND.UNCERTAINTY ? '⚠️ ' : ''}${f.text}`);
    L.push('');
  }
  const w = analysis.weighed;
  if (w.supportive.length) { L.push('### What Supports Your Trade'); for (const e of w.supportive) L.push(`- ${e.text}`); L.push(''); }
  if (w.opposing.length) { L.push('### What Works Against It'); for (const e of w.opposing) L.push(`- ${e.text}`); L.push(''); }
  if (analysis.decision && (analysis.decision.considerations || []).length) {
    L.push('### TRADE MANAGEMENT / LOSS RECOVERY PLAN');
    L.push('_Conditional considerations, not a recovery guarantee._');
    for (const t of analysis.decision.considerations) L.push(`- ${t}`);
  }
  return L.join('\n');
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const origin = new URL(request.url).origin;
  const lang = String(body.lang || 'en').slice(0, 2).toLowerCase();
  const T = pickL(lang);

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

  // 3 ── AGGREGATE → the EXISTING analysis engine, unchanged.
  const tradeCase = aggregateToCase(position, baseCase);
  const analysis = runAnalysis(tradeCase, evidence);
  const knowledge = selectKnowledge(tradeCase, evidence, 6);
  const meters = buildMeters(evidence, ins.id, history);

  // 4 ── SYNTHESIS. One model call, retried internally; deterministic on failure.
  const brief = buildBrief({ instrument: ins.id, account, context: ctx }, position, evidence, history, meters, analysis, knowledge);
  const deterministic = renderDeterministic({ instrument: ins.id }, position, evidence, history, meters, analysis);
  const plan = await generateRescuePlan(env, brief, lang);

  let report = plan.text || deterministic;
  if (plan.degraded) report = `${T.degraded}\n\n${deterministic}`;
  report += `\n\n${T.disclaimer}`;

  return respond({
    mode: 'assessment',
    instrument: ins.id,
    report,
    position,
    meters,
    evidence: {
      collectedAt: evidence.collectedAt,
      price: evidence.price, priceStatus: evidence.priceStatus, priceAt: evidence.priceAt,
      session: evidence.session, regime: evidence.regime, yields: evidence.yields,
      news: evidence.news, newsStatus: evidence.newsStatus, newsAt: evidence.newsAt,
      calendarStatus: evidence.calendarStatus, unavailable: evidence.unavailable,
      provenance: provenanceLines(evidence),
    },
    history: {
      status: history.status, note: history.note, count: history.candles.length,
      firstAt: history.firstAt || null, lastAt: history.lastAt || null,
      volatility: history.volatility, dateContext: history.dateContext, source: history.source || null,
    },
    synthesis: { provider: plan.provider, degraded: plan.degraded, reason: plan.reason },
    provenanceLegend: PROVENANCE,
  });
}
