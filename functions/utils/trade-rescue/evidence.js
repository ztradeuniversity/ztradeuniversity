// functions/utils/trade-rescue/evidence.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU TRADE RESCUE — CURRENT-EVIDENCE COLLECTOR
//
// Gathers CURRENT external facts for one Trade Case and stamps every one of
// them with source + retrieval time + availability. Reuses the site's existing
// providers over same-origin HTTP — /api/market, /api/sentiment, /api/news,
// /api/calendar — exactly as the rest of the platform already does. No new
// market-data infrastructure, no new provider keys.
//
// THE ONE RULE: a value is either VERIFIED (fetched, with a timestamp) or it is
// UNAVAILABLE. There is no third state. Nothing here estimates, rounds,
// remembers or infers a market value, and the LLM never sees a number that did
// not come from one of these responses.
//
// VERIFIED PROVIDER REALITY (checked against production 2026-09-07, not assumed):
//   /api/market    200 · gold + BTC ONLY · price/change/changePct/high/low
//                  → no OHLC candles, no other instruments, so intraday market
//                    structure and computed support/resistance are IMPOSSIBLE
//                    from this source and are never claimed.
//   /api/sentiment 200 · marketRegime{label,vix_level,breakeven_inflation}, yields
//   /api/news      200 · Finnhub, ~12 asset-tagged articles
//   /api/calendar  ERROR · Finnhub /calendar/economic returns HTTP 403 on the
//                  free plan → events:[]. Treated as UNAVAILABLE and reported
//                  as such; upcoming events are NEVER invented to fill the gap.
// ════════════════════════════════════════════════════════════════════════════

export const EV = {
  VERIFIED:    'verified',      // fetched successfully, timestamped
  UNAVAILABLE: 'unavailable',   // provider failed / not covered — say so
};

function item(label, value, source, at, status, note) {
  return { label, value, source, retrievedAt: at, status, note: note || null };
}

async function getJson(origin, path, ms = 9000) {
  try {
    const r = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return { ok: false, error: `http_${r.status}` };
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'fetch_failed' };
  }
}

// Which news items plausibly bear on this instrument. Uses the `assets` tags the
// news endpoint already returns plus the instrument's own vocabulary — it does
// NOT decide what a headline means for price, only whether it is on-topic.
function relevantNews(articles, tradeCase) {
  const want = new Set(['macro']);
  if (tradeCase.instrumentLive === 'gold') { want.add('gold'); }
  if (tradeCase.instrumentLive === 'btc')  { want.add('bitcoin'); want.add('crypto'); }
  const kw = tradeCase.instrument === 'XAU/USD' ? /gold|xau|bullion|fed|inflation|rate|dollar|yield/i
    : tradeCase.instrument === 'BTC/USD' ? /bitcoin|btc|crypto|etf/i
    : new RegExp(String(tradeCase.instrument || '').replace('/', '.?'), 'i');
  return (articles || []).filter(a => {
    const tagged = Array.isArray(a.assets) && a.assets.some(x => want.has(String(x).toLowerCase()));
    return tagged || kw.test(String(a.title || ''));
  }).slice(0, 6);
}

export async function collectEvidence(origin, tradeCase) {
  const startedAt = new Date().toISOString();
  const facts = [];
  const bundle = {
    collectedAt: startedAt,
    instrument: tradeCase.instrument || null,
    price: null, priceStatus: EV.UNAVAILABLE, priceAt: null, priceSource: null,
    priceProvider: null, priceViaFallback: false,   // which feed actually answered
    newsProvider: null, newsViaFallback: false,
    session: null,                // today's high/low + change from the same source
    regime: null,
    yields: null,
    news: [], newsStatus: EV.UNAVAILABLE, newsAt: null,
    calendar: [], calendarStatus: EV.UNAVAILABLE, calendarAt: null, calendarNote: null,
    facts,
    unavailable: [],
  };

  const [mk, sm, nw, cal] = await Promise.allSettled([
    getJson(origin, '/api/market'),
    getJson(origin, '/api/sentiment'),
    getJson(origin, '/api/news'),
    getJson(origin, '/api/calendar'),
  ]);

  // ── PRICE + SESSION RANGE ────────────────────────────────────────────────
  const mkOk = mk.status === 'fulfilled' && mk.value.ok ? mk.value.data : null;
  const liveKey = tradeCase.instrumentLive;
  if (mkOk && liveKey && mkOk[liveKey] && typeof mkOk[liveKey].price === 'number') {
    const q = mkOk[liveKey];
    bundle.price = q.price;
    bundle.priceStatus = EV.VERIFIED;
    bundle.priceAt = mkOk.updatedAt || startedAt;
    // /api/market reports per-instrument provider status: 'ok' = TwelveData
    // answered, 'fallback' = the keyless gold-api.com backup did. Report the
    // one that actually served this number, never the pair.
    const mkStatus = (mkOk.sourceStatus || {})[`twelvedata_${liveKey}`];
    bundle.priceViaFallback = mkStatus === 'fallback';
    bundle.priceProvider = bundle.priceViaFallback ? 'gold-api.com (backup feed)' : 'TwelveData';
    bundle.priceSource = `ZTU /api/market — ${bundle.priceProvider}`;
    bundle.session = { high: q.high ?? null, low: q.low ?? null, change: q.change ?? null, changePct: q.changePct ?? null };
    facts.push(item(`${tradeCase.instrument} current price`, q.price, bundle.priceSource, bundle.priceAt, EV.VERIFIED));
    if (q.high != null && q.low != null) {
      facts.push(item(`${tradeCase.instrument} session range`, `${q.low} – ${q.high}`, bundle.priceSource, bundle.priceAt, EV.VERIFIED));
    }
    if (q.changePct != null) {
      facts.push(item(`${tradeCase.instrument} change`, `${q.changePct}%`, bundle.priceSource, bundle.priceAt, EV.VERIFIED));
    }
  } else {
    const why = !mkOk ? 'the market endpoint did not respond'
      : !liveKey ? `live pricing is not available for ${tradeCase.instrument || 'this instrument'} on our data plan (only XAU/USD and BTC/USD are covered)`
      : 'the provider returned no price for this instrument';
    bundle.unavailable.push(`Current price — ${why}.`);
    facts.push(item(`${tradeCase.instrument || 'Instrument'} current price`, null, 'ZTU /api/market', startedAt, EV.UNAVAILABLE, why));
  }

  // ── MARKET REGIME / MACRO CONTEXT ────────────────────────────────────────
  const smOk = sm.status === 'fulfilled' && sm.value.ok ? sm.value.data : null;
  if (smOk && smOk.marketRegime) {
    bundle.regime = smOk.marketRegime;
    facts.push(item('Market regime', `${smOk.marketRegime.label} (VIX ${smOk.marketRegime.vix_level})`,
      'ZTU /api/sentiment (FRED VIXCLS)', smOk.updatedAt || startedAt, EV.VERIFIED));
    if (smOk.yields) {
      bundle.yields = smOk.yields;
      if (smOk.yields.us10y != null) {
        facts.push(item('US 10Y nominal yield', `${smOk.yields.us10y}%`, `FRED DGS10 (as of ${smOk.yields.us10y_date || 'n/a'})`, smOk.updatedAt || startedAt, EV.VERIFIED));
      }
      if (smOk.yields.real10y != null) {
        facts.push(item('US 10Y real yield', `${smOk.yields.real10y}%`, `FRED DFII10 (as of ${smOk.yields.real10y_date || 'n/a'})`, smOk.updatedAt || startedAt, EV.VERIFIED));
      }
      if (smOk.yields.breakeven != null) {
        facts.push(item('Breakeven inflation', `${smOk.yields.breakeven}%`, 'FRED (DGS10 − DFII10)', smOk.updatedAt || startedAt, EV.VERIFIED));
      }
    }
  } else {
    bundle.unavailable.push('Market regime / macro context — the sentiment endpoint did not respond.');
  }

  // ── NEWS ─────────────────────────────────────────────────────────────────
  const nwOk = nw.status === 'fulfilled' && nw.value.ok ? nw.value.data : null;
  if (nwOk && Array.isArray(nwOk.articles) && nwOk.articles.length) {
    bundle.news = relevantNews(nwOk.articles, tradeCase).map(a => ({
      title: a.title, source: a.source, publishedAt: a.publishedAt, url: a.url,
    }));
    bundle.newsStatus = EV.VERIFIED;
    const nwStatus = nwOk.sourceStatus || {};
    bundle.newsViaFallback = nwStatus.finnhub !== 'ok' && nwStatus.gnews === 'ok';
    bundle.newsProvider = bundle.newsViaFallback ? 'GNews (backup feed)' : 'Finnhub';
    bundle.newsAt = nwOk.updatedAt || startedAt;
    if (!bundle.news.length) {
      bundle.unavailable.push(`No recent headline in the current feed is specific to ${tradeCase.instrument || 'this instrument'}.`);
    }
  } else {
    bundle.unavailable.push('Recent news — the news endpoint did not respond.');
  }

  // ── ECONOMIC CALENDAR ────────────────────────────────────────────────────
  // Known-broken in production (Finnhub free plan → 403). Reported honestly.
  const calOk = cal.status === 'fulfilled' && cal.value.ok ? cal.value.data : null;
  if (calOk && Array.isArray(calOk.events) && calOk.events.length) {
    bundle.calendar = calOk.events.slice(0, 8);
    bundle.calendarStatus = EV.VERIFIED;
    bundle.calendarAt = calOk.updatedAt || startedAt;
  } else {
    const note = calOk && calOk._finnhubDiag
      ? (calOk._finnhubDiag.rootCause || 'calendar provider unavailable')
      : 'calendar provider did not respond';
    bundle.calendarNote = note;
    bundle.unavailable.push(`Upcoming economic events could not be verified — ${note}`);
  }

  return bundle;
}

// One-line, human-readable provenance for anything the trader is shown.
export function provenanceLines(bundle) {
  const L = [];
  if (bundle.priceStatus === EV.VERIFIED) {
    L.push(`Price — ${bundle.priceSource}${bundle.priceViaFallback ? ' [primary feed unavailable, backup used]' : ''}, retrieved ${bundle.priceAt}`);
  }
  if (bundle.regime) L.push(`Market regime & yields — ZTU /api/sentiment (FRED), retrieved ${bundle.collectedAt}`);
  if (bundle.newsStatus === EV.VERIFIED) {
    L.push(`News — ZTU /api/news — ${bundle.newsProvider || 'Finnhub'}${bundle.newsViaFallback ? ' [primary feed unavailable, backup used]' : ''}, retrieved ${bundle.newsAt}`);
  }
  if (bundle.calendarStatus === EV.VERIFIED) L.push(`Economic calendar — ZTU /api/calendar, retrieved ${bundle.calendarAt}`);
  return L;
}
