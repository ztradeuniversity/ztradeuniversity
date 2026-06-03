// functions/utils/market-engine.js
// ════════════════════════════════════════════════════════════════════════════
// MARKET ANALYST SPECIALIST — Gold, BTC, macro, market mood, sessions, the
// economic events + news engine, and the AI Daily Brief™. Returns answer bodies
// (the orchestrator appends the disclaimer). No signals, ever.
// ════════════════════════════════════════════════════════════════════════════

import { loc, marketBlock, trustedSourceBlock, fmtTime, isSameDayInTz, impactEmoji } from './response-engine.js';

export function buildGold(ctx) {
  const { marketData, lang } = ctx;
  const mb = marketBlock(marketData);
  let out = '## Gold (XAU/USD) — Market Context\n';
  if (mb) out += mb + '\n\n';
  out += `**📐 Technical angle:** watch the key structural zones and whether price is making higher lows (bullish structure) or lower highs (bearish structure).\n` +
    `**🏦 Fundamental angle:** real yields & the Fed (lower/dovish → supportive), the **US Dollar (DXY)** (inverse), and inflation expectations.\n` +
    `**🛡️ Sentiment angle:** safe-haven demand rises with geopolitical risk and an elevated VIX.\n` +
    `**📰 News angle:** CPI, NFP and FOMC are the big movers — check the calendar before entries.\n`;
  if (marketData?.marketRegime?.label) {
    out += `\nCurrent regime reads **${marketData.marketRegime.label}** — context can shift fast around news.`;
  }
  out += `\n\nWant me to go deeper on the **technical**, **fundamental**, **sentiment**, or **news** angle — or **review your own Gold trade** (entry, SL, TP)?`;
  return out;
}

export function buildBtc(ctx) {
  const { marketData } = ctx;
  const mb = marketBlock(marketData);
  let out = '## Bitcoin (BTC/USD) — Market Context\n';
  if (mb) out += mb + '\n\n';
  out += `**Key BTC drivers:**\n` +
    `- **Risk appetite:** BTC behaves like a high-beta risk asset — low VIX / risk-on conditions tend to help, risk-off tends to pressure it.\n` +
    `- **Liquidity & the dollar:** looser global liquidity and a softer USD are historically supportive.\n` +
    `- **ETF & institutional flows:** spot-ETF inflows/outflows are a meaningful demand signal.\n` +
    `- **Halving cycle & on-chain:** supply dynamics and long-term holder behaviour shape the macro backdrop.\n`;
  out += `\nI can walk through **your own BTC trade idea** for structure and risk — just share entry, stop, and target.`;
  return out;
}

export function buildMacro(ctx) {
  const { marketData, lang } = ctx;
  const mb = marketBlock(marketData);
  let out = '## Macro Context — DXY, Yields & VIX\n';
  if (mb) out += mb + '\n\n';
  out += `**How these connect to Gold & BTC:**\n` +
    `- **DXY (US Dollar Index):** inverse to Gold; dollar strength is a headwind for both Gold and risk assets.\n` +
    `- **US 10Y & real yields:** rising yields raise the opportunity cost of holding Gold (no yield) → pressure; falling yields → tailwind.\n` +
    `- **Breakeven inflation:** higher inflation expectations are historically Gold-supportive.\n` +
    `- **VIX:** under 15 = calm/risk-on · 15–20 = neutral · 20–25 = caution · above 25 = risk-off.\n`;
  out += `\nFor the latest macro releases and central-bank data, these official sources are reliable:\n${trustedSourceBlock(lang, 'macro')}`;
  return out;
}

export function buildMood(ctx) {
  const { marketData } = ctx;
  const mb = marketBlock(marketData);
  const regime = marketData?.marketRegime?.label || 'Neutral';
  const vix = marketData?.vix?.value;
  let mood = 'Neutral / balanced';
  if (vix != null && vix >= 25) mood = 'High Volatility — elevated fear';
  else if (/risk-off/i.test(regime)) mood = 'Risk-Off — defensive';
  else if (/risk-on/i.test(regime)) mood = 'Risk-On — healthy appetite';
  else if (vix != null && vix < 15) mood = 'Calm — low volatility';
  let out = `## Market Mood\n**Current mood:** ${mood}\n\n`;
  if (mb) out += mb + '\n\n';
  out += `Use mood as **context, not a trigger**: risk-off / high-VIX conditions widen ranges and reward patience; calm conditions can mean slower, choppier moves.`;
  return out;
}

export function buildSession(ctx) {
  return `## Trading Sessions (UTC)\n` +
    `- **Asia (Tokyo/Sydney):** ~00:00–09:00 — typically lower liquidity, tighter ranges.\n` +
    `- **London:** ~08:00–17:00 — often the most active session for Gold.\n` +
    `- **New York:** ~13:00–22:00 — high activity, major US data lands here.\n` +
    `- **London/NY overlap:** ~13:00–17:00 — **peak liquidity** and often the largest moves.\n\n` +
    `The live **AI Session Map™** in the sidebar shows which sessions are open right now.`;
}

// ── EVENTS + NEWS (Priority 1: live internal Finnhub/calendar data) ──────────
export function buildEvents(ctx) {
  const { calendarData, newsData, geo, lang, newsFocus } = ctx;
  const tz       = geo?.tz || 'UTC';
  const tzLabel  = geo?.name ? `${geo.name} Time` : (tz === 'UTC' ? 'UTC' : 'your local time');
  const events   = (calendarData?.events || []).filter(e => e.time);
  const articles = (newsData?.articles || []);

  if (!events.length && !articles.length) {
    return `## Market Events & News\n` +
      `I couldn't load live event/news data right now (the data service may be busy). ` +
      `Here's what typically drives the markets, and where to confirm the live schedule:\n\n` +
      `- **CPI / PPI:** inflation prints — can move Gold, the USD, and risk assets.\n` +
      `- **NFP / jobs:** labour data shifts Fed expectations.\n` +
      `- **FOMC:** the Fed's rate decision and tone.\n\n` +
      `Live calendar:\n${trustedSourceBlock(lang, 'calendar')}`;
  }

  let out = '';

  if (events.length) {
    const todays   = events.filter(e => isSameDayInTz(e.time, tz));
    const showList = (todays.length ? todays : events).slice(0, 6);
    const heading  = todays.length ? `Today's Major Economic Events` : `Upcoming Major Economic Events`;
    out += `## ${heading} — ${tzLabel}\n`;
    if (!todays.length) out += `_No high-impact US releases scheduled for today in your timezone — here's what's next:_\n`;
    out += '\n';
    for (const e of showList) {
      const when = fmtTime(e.time, tz) || e.time;
      const est  = e.estimate != null ? ` · est **${e.estimate}${e.unit || ''}**` : '';
      const prev = e.prev != null ? ` · prev ${e.prev}${e.unit || ''}` : '';
      out += `- ${impactEmoji(e.impact)} **${when}** — ${e.event}${est}${prev}\n`;
    }

    const highCount = events.filter(e => (e.impact || '').toLowerCase() === 'high').length;
    const medCount  = events.filter(e => (e.impact || '').toLowerCase() === 'medium').length;
    const risk = highCount >= 1 ? '🔴 **HIGH**' : medCount >= 1 ? '🟡 **MEDIUM**' : '🟢 **LOW**';
    out += `\n**News risk window:** ${risk} — ${highCount} high-impact and ${medCount} medium-impact US event(s) on the radar.\n`;

    out += `\n**Possible market impact (awareness only — not a forecast):**\n` +
      `- **Gold (XAU):** surprise inflation/Fed data can swing real yields and the dollar, which *may* drive Gold volatility.\n` +
      `- **USD:** stronger-than-expected data tends to support the dollar; softer data the reverse.\n` +
      `- **BTC:** as a risk asset, Bitcoin *may* react to shifts in risk appetite around these releases.\n` +
      `\n⚠️ Around high-impact prints, spreads widen and whipsaws are common — many traders avoid the first minutes.`;
  }

  if (articles.length) {
    let pool = articles;
    if (newsFocus === 'gold') pool = articles.filter(a => (a.assets || []).includes('gold'));
    else if (newsFocus === 'btc') pool = articles.filter(a => (a.assets || []).some(x => x === 'btc' || x === 'bitcoin' || x === 'crypto'));
    if (!pool.length) pool = articles;
    const top = pool.slice(0, 4);
    out += `${events.length ? '\n\n' : ''}## Latest Market Headlines\n`;
    for (const a of top) {
      const when = fmtTime(a.publishedAt, tz);
      out += `- **${a.title}** — _${a.source}${when ? ` · ${when}` : ''}_\n`;
    }
  }

  if (!geo || geo.confidence === 'low' || geo.confidence === 'none') {
    out += `\n\n_🌍 I've shown times in **${tzLabel}**. **Which country are you trading from?** Tell me and I'll remember it and always convert event times to your local time._`;
  }

  return out;
}

// ── AI DAILY BRIEF™ ──────────────────────────────────────────────────────────
export function buildBrief(ctx) {
  const { marketData, calendarData, newsData, geo, lang } = ctx;
  const tz      = geo?.tz || 'UTC';
  const tzLabel = geo?.name ? `${geo.name} time` : 'UTC';
  let dateStr;
  try { dateStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()); }
  catch { dateStr = new Date().toUTCString().slice(0, 16); }

  let out = `## 📋 AI Daily Brief™ — ${dateStr}\n`;

  const mb = marketBlock(marketData);
  if (mb) out += `\n**Market snapshot:**\n${mb}\n`;

  const g = marketData?.gold, b = marketData?.btc;
  const dir = (pct) => pct == null ? 'flat' : pct > 0.3 ? 'firmer' : pct < -0.3 ? 'softer' : 'little changed';
  out += `\n**Gold context:** trading **${dir(g?.changePct)}** so far${g?.changePct != null ? ` (${g.changePct > 0 ? '+' : ''}${g.changePct.toFixed(2)}%)` : ''} — driven by real yields, the dollar, and safe-haven flows.`;
  out += `\n**BTC context:** **${dir(b?.changePct)}**${b?.changePct != null ? ` (${b.changePct > 0 ? '+' : ''}${b.changePct.toFixed(2)}%)` : ''} — moving with broad risk appetite and liquidity.`;

  const vix = marketData?.vix?.value;
  let vol = 'moderate', risk = '🟡 MEDIUM';
  if (vix != null) {
    if (vix >= 25)      { vol = 'high';     risk = '🔴 HIGH'; }
    else if (vix >= 20) { vol = 'elevated'; risk = '🟡 MEDIUM'; }
    else if (vix < 15)  { vol = 'low';      risk = '🟢 LOW'; }
    else                { vol = 'moderate'; risk = '🟡 MEDIUM'; }
  }
  out += `\n\n**Volatility:** ${vol}${vix != null ? ` (VIX ${vix})` : ''}\n**Today's risk rating:** ${risk}`;

  const events = (calendarData?.events || []).filter(e => e.time);
  const todays = events.filter(e => isSameDayInTz(e.time, tz));
  const list   = (todays.length ? todays : events).slice(0, 4);
  out += `\n\n**Key events ${todays.length ? `today (${tzLabel})` : 'ahead'}:**\n`;
  if (list.length) {
    for (const e of list) out += `- ${impactEmoji(e.impact)} ${fmtTime(e.time, tz) || ''} — ${e.event}\n`;
  } else {
    out += `- No major scheduled US releases detected on the radar right now.\n`;
  }

  const top = (newsData?.articles || [])[0];
  if (top) out += `\n**Top headline:** ${top.title} — _${top.source}_\n`;

  let focus;
  const highToday = todays.some(e => (e.impact || '').toLowerCase() === 'high');
  if (highToday)            focus = 'High-impact data is due — expect wider spreads and whipsaws. Patience and tighter risk are the priority today.';
  else if (vol === 'high')  focus = 'Volatility is elevated — reduce size, widen stops only with structure, and avoid emotional entries.';
  else if (vol === 'low')   focus = 'Quiet conditions — ranges may dominate. Wait for clean structure rather than forcing trades.';
  else                      focus = 'A balanced session — trade your plan, respect your stop, and let A+ setups come to you.';
  out += `\n🎯 **Today's focus:** ${focus}`;

  return out;
}
