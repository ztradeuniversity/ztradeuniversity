// functions/api/ceo/today-update.js
// ════════════════════════════════════════════════════════════════════════════
// AI CEO OS — TODAY UPDATE
//   GET /api/ceo/today-update                      → verified market evidence
//   GET /api/ceo/today-update?part=expert&gold=BUY&btc=SELL → Expert View Today
//
// A general, one-click market check for Gold and Bitcoin: "according to
// today's live verified evidence, is BUY or SELL scalping better supported?"
// No trade input of any kind. PUBLIC: no IB, OTP, License Request, premium or
// CEO-session check — it returns only market-analysis data.
//
// ZTU RESCUE IS THE SOURCE OF TRUTH. Every market fact and judgement below
// comes from Rescue's own modules, called exactly as rescue-assess.js calls
// them — nothing re-implemented:
//   evidence.js   collectEvidence()        /api/market (TwelveData → gold-api.com
//                                          backup), /api/sentiment (FRED),
//                                          /api/news (Finnhub → GNews backup),
//                                          /api/calendar (Finnhub → FRED backup),
//                                          retry-once rule, VERIFIED/UNAVAILABLE.
//                 provenanceLines()        the Sources audit trail.
//   history.js    collectHistory()         /api/market-history (TwelveData
//                                          /time_series), same retry rule.
//   meters.js     buildMeters()            Technical / Fundamental / Sentiment.
//   levels.js     computeVerifiedRange(), defensibleInvalidation().
//   result-i18n.js marketDirectionText(), overallEvidence(), calendarSection(),
//                 newsItems(), instrumentDisplayName(), invalidationRefusalText(),
//                 localizeProvenanceLine(), localizeUnavailable(), newsUnavailable().
// Presentation (scalping framing, en/ur/ar) lives in utils/ceo/today-update.js.
//
// The evidence part never waits on OpenAI, so an OpenAI outage cannot delay
// or break it. The expert part (the only new intelligence layer — see
// composer-llm.js researchExpertView()) is a second request the page makes
// after the evidence renders.
// ════════════════════════════════════════════════════════════════════════════
import { collectEvidence, provenanceLines } from '../../utils/trade-rescue/evidence.js';
import { collectHistory } from '../../utils/trade-rescue/history.js';
import { buildMeters } from '../../utils/trade-rescue/meters.js';
import { computeVerifiedRange, defensibleInvalidation } from '../../utils/trade-rescue/levels.js';
import * as RI from '../../utils/trade-rescue/result-i18n.js';
import { researchExpertView } from '../../utils/composer-llm.js';
import { cacheGet, cachePut } from '../../utils/cache.js';
import * as TU from '../../utils/ceo/today-update.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// Exactly the two instruments Rescue's live feed covers (case.js INSTRUMENTS).
const SUPPORTED = [
  { key: 'gold', id: 'XAU/USD', live: 'gold' },
  { key: 'btc', id: 'BTC/USD', live: 'btc' },
];
const BIASES = ['BUY', 'SELL', 'NO CLEAR EDGE'];

// Public endpoint + paid model call → the research result is shared through
// the edge cache: at most one research run per instrument per window,
// however often anyone clicks. Failures are cached briefly so an OpenAI
// outage is not re-hit on every click either.
const EXPERT_TTL_OK = 15 * 60;
const EXPERT_TTL_FAIL = 2 * 60;

function historyLine(lang, hist) {
  if (hist.status !== 'verified') return null;
  const at = hist.retrievedAt || '';
  return ({
    en: `Price history — ZTU /api/market-history — TwelveData /time_series (${hist.candles.length} daily candles), retrieved ${at}`,
    ur: `Price history — ZTU /api/market-history — TwelveData /time_series (${hist.candles.length} daily candles)، حاصل کردہ ${at}`,
    ar: `سجل الأسعار — ZTU /api/market-history — TwelveData /time_series (${hist.candles.length} شمعة يومية)، تم الجلب في ${at}`,
  })[lang];
}

function buildInstrument(ins, ev, hist) {
  const meters = buildMeters(ev, ins.id, hist);
  const range = computeVerifiedRange(hist.closes || []);
  const md = RI.marketDirectionText('en', meters, ins.id);
  const oe = RI.overallEvidence('en', meters);
  const { bias, basis } = TU.dataBias(meters, md, oe);
  const dir = bias === 'BUY' ? 'buy' : bias === 'SELL' ? 'sell' : null;
  const price = ev.priceStatus === 'verified' ? ev.price : null;
  const invalidation = dir ? defensibleInvalidation(dir, price, range) : null;
  const today = new Date().toISOString().slice(0, 10);

  const views = {};
  for (const lang of TU.LANGS) {
    const L = TU.uiLabels(lang);
    const name = RI.instrumentDisplayName(lang, ins.id);
    const cal = RI.calendarSection(lang, ev, ins.id, name, null);
    // High-impact = an event calendarSection() gives a scenario framework
    // (policy / inflation / employment / growth / consumer / manufacturing).
    const events = cal.events
      .filter((e) => e.scenario1 && (!e.when || String(e.when).slice(0, 10) >= today))
      .slice(0, 3)
      .map((e) => ({
        what: e.what, when: e.when, forecast: e.forecast, previous: e.previous, whatItMeans: e.whatItMeans,
        scenarios: [e.scenario1, e.scenario2].filter(Boolean)
          .map((s) => ({ label: s.label, impact: s.impact, impactLabel: s.impactLabel, reason: s.reason })),
      }));
    const news = RI.newsItems(lang, ev, 3)
      .map((n) => ({ what: n.what, source: n.source, at: n.at, impact: n.impact, impactLabel: n.impactLabel, reason: n.effect }));
    const cat = (k) => {
      const m = meters[k];
      return {
        label: L[k], lean: m && m.score != null ? m.lean : null,
        leanWord: TU.leanWord(lang, m && m.score != null ? m.lean : null),
        strength: m ? m.strength : null, coverage: m ? m.coverage : null,
        rows: TU.factorRows(lang, m, ev, hist, ins.id),
      };
    };
    const unavailable = ev.unavailable.map((u) => RI.localizeUnavailable(lang, u));
    if (hist.status !== 'verified') {
      unavailable.push(({ en: 'Price history could not be verified — trend and range levels are omitted.', ur: 'Price history verify نہیں ہو سکی — trend اور range levels شامل نہیں۔', ar: 'تعذّر التحقق من سجل الأسعار — حُذفت مستويات الاتجاه والنطاق.' })[lang]);
    }
    views[lang] = {
      labels: L,
      instrumentName: `${name} (${ins.id})`,
      biasWord: TU.biasWord(lang, bias),
      why: TU.whyLines(lang, bias, meters, basis),
      evidenceStrength: TU.evidenceStrengthText(lang, bias, meters),
      categories: { technical: cat('technical'), fundamental: cat('fundamental'), sentiment: cat('sentiment') },
      news, newsNote: news.length ? null : RI.newsUnavailable(lang),
      events, eventsNote: cal.unavailableText || (events.length ? cal.backupNote : L.nothingHigh),
      levels: TU.levelLines(lang, bias, ev, range, invalidation, dir ? RI.invalidationRefusalText(lang, invalidation) : null),
      overall: TU.overallView(lang, bias, null),
      sources: [...provenanceLines(ev).map((p) => RI.localizeProvenanceLine(lang, p)), historyLine(lang, hist)].filter(Boolean),
      unavailable,
    };
  }
  return { instrument: ins.id, price, priceAt: ev.priceAt, bias, basis, views };
}

async function evidencePart(origin) {
  // Gold, then BTC: the second collectEvidence() reuses the edge-cached
  // /api/market, /api/sentiment, /api/news and /api/calendar responses the
  // first one just warmed (45 s / 90 s / 7 min / 1 h), instead of two
  // concurrent cache misses each calling the upstream providers.
  const evChain = (async () => {
    const out = [];
    for (const ins of SUPPORTED) out.push(await collectEvidence(origin, { instrument: ins.id, instrumentLive: ins.live }));
    return out;
  })();
  const [evs, hists] = await Promise.all([evChain, Promise.all(SUPPORTED.map((ins) => collectHistory(origin, ins.id, [])))]);
  const instruments = {};
  SUPPORTED.forEach((ins, i) => {
    try { instruments[ins.key] = buildInstrument(ins, evs[i], hists[i]); }
    catch { instruments[ins.key] = { instrument: ins.id, error: 'unavailable' }; }
  });
  return { checkedAt: new Date().toISOString(), instruments };
}

async function expertPart(request, env, biasByKey) {
  const origin = new URL(request.url).origin;
  const bucket = Math.floor(Date.now() / (EXPERT_TTL_OK * 1000));
  const cacheKey = new Request(`${origin}/api/ceo/today-update?__expert=${bucket}`);
  let research = null;
  const hit = await cacheGet(cacheKey);
  if (hit) { try { research = await hit.json(); } catch { research = null; } }
  if (!research) {
    const results = await Promise.all(SUPPORTED.map((ins) =>
      researchExpertView(env, `${RI.instrumentDisplayName('en', ins.id)} (${ins.id})`).catch(() => null)));
    research = {};
    SUPPORTED.forEach((ins, i) => {
      research[ins.key] = results[i] || { status: 'unavailable', reason: 'error', consensus: null, counts: { bullish: 0, bearish: 0, neutral: 0 }, views: [] };
    });
    const allOk = SUPPORTED.every((ins) => research[ins.key].status === 'verified');
    await cachePut(cacheKey, research, allOk ? EXPERT_TTL_OK : EXPERT_TTL_FAIL);
  }

  const instruments = {};
  for (const ins of SUPPORTED) {
    const ex = research[ins.key];
    const bias = biasByKey[ins.key];
    const views = {};
    for (const lang of TU.LANGS) {
      const h = TU.expertHeadline(lang, ex);
      views[lang] = {
        headline: h.text, counts: h.counts,
        overall: bias ? TU.overallView(lang, bias, ex) : null,
        source: ex.status === 'verified'
          ? ({ en: `Expert View — OpenAI web search${ex.model ? ` (${ex.model})` : ''}, searched ${ex.searchedAt}`,
               ur: `Expert View — OpenAI web search${ex.model ? ` (${ex.model})` : ''}، تلاش ${ex.searchedAt}`,
               ar: `رأي الخبراء — بحث الويب من OpenAI${ex.model ? ` (${ex.model})` : ''}، بتاريخ ${ex.searchedAt}` })[lang]
          : null,
      };
    }
    instruments[ins.key] = {
      status: ex.status, reason: ex.reason, consensus: ex.consensus, counts: ex.counts,
      items: (ex.views || []).map((v) => ({
        stance: v.stance, analyst: v.analyst, institution: v.institution, outlet: v.outlet,
        url: v.url, title: v.title, published: v.published, publishedVerified: v.publishedVerified, summary: v.summary,
      })),
      views,
    };
  }
  return { instruments };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
  const url = new URL(request.url);

  if (url.searchParams.get('part') === 'expert') {
    const biasByKey = {};
    for (const ins of SUPPORTED) {
      const b = String(url.searchParams.get(ins.key) || '').replace(/_/g, ' ').toUpperCase();
      biasByKey[ins.key] = BIASES.includes(b) ? b : null;
    }
    try { return json(await expertPart(request, env, biasByKey)); }
    catch { return json({ error: 'expert_unavailable' }, 502); }
  }

  try { return json(await evidencePart(url.origin)); }
  catch { return json({ error: 'today_update_unavailable' }, 502); }
}
