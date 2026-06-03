// functions/utils/knowledge-engine.js
// ════════════════════════════════════════════════════════════════════════════
// BEGINNER MENTOR + EDUCATION + RISK SPECIALIST — knowledge-base rendering,
// greeting, the User-Satisfaction fallback, signal routing, platform help,
// trade assessment, lot-size maths, set-country, and the Phase-Next education
// intents: strategy, technical analysis, risk management, funding/prop, self-assessment.
// ════════════════════════════════════════════════════════════════════════════

import { loc, trustedSourceBlock, signalRouteBlock, money, extractNumbers, parseTradeLevels } from './response-engine.js';
import { parseCountryFromText, COUNTRY_TZ } from './intent-engine.js';

export function buildGreeting(ctx) { return loc(ctx.lang).greet; }

// User Satisfaction Engine — never "I don't know"; always offer real help.
export function buildFallback(ctx) {
  const { lang } = ctx;
  return `Based on the available information, that's a bit outside what I can answer precisely right now — but I won't leave you empty-handed. Here's how I can genuinely help:\n\n` +
    `- 🏅 **Gold / ₿ BTC market context** — drivers, structure, and the current regime\n` +
    `- 📋 **AI Daily Brief™** — say *"today's market"* for events, volatility & focus\n` +
    `- 🔍 **Trade assessment** — share your entry, stop & target and I'll review the structure\n` +
    `- 📊 **Chart analysis** — upload a screenshot and I'll read the patterns\n` +
    `- 🧠 **Psychology & "why am I losing"** coaching, **broker** help, and **risk/lot-size** maths\n\n` +
    `If it's live data you're after, these official sources are reliable:\n${trustedSourceBlock(lang, 'macro')}\n\n` +
    `What would you like to dig into?`;
}

export function buildSignal(ctx) {
  return signalRouteBlock(ctx.lang) + '\n\nMeanwhile, I can explain the **current market context**, assess **your own** trade idea, or check **news risk** — just ask.';
}

export function buildPlatform(ctx) {
  if (ctx.platform === 'tradingview') {
    return `## TradingView — Quick Help\n` +
      `- **Add an indicator:** top toolbar → *Indicators* → search (e.g., RSI, EMA) → click to add.\n` +
      `- **Draw a trendline:** left toolbar → trendline tool → click two points.\n` +
      `- **Set a price alert:** right-click the chart → *Add Alert*, or press the alarm icon; set condition & notification.\n` +
      `- **Multiple timeframes:** use the timeframe selector (top-left) or open a multi-chart layout.\n` +
      `- **Save a layout:** *Save* (top-right) to keep your drawings and indicators.\n\n` +
      `Official help: [TradingView Help Center](https://www.tradingview.com/support/)`;
  }
  return `## MetaTrader (MT4 / MT5) — Quick Help\n` +
    `- **Place an order:** *New Order* (F9) → choose symbol, volume (lots), and set Stop Loss / Take Profit → Buy/Sell.\n` +
    `- **Modify SL/TP:** right-click the position in the *Trade* tab → *Modify or Delete* → set new levels.\n` +
    `- **Read your account:** the *Toolbox → Trade* tab shows Balance, Equity, Margin, and Free Margin.\n` +
    `- **Margin & free margin:** Free Margin = Equity − Used Margin; if it hits zero you risk a margin call.\n` +
    `- **Login issues ("invalid account"):** double-check the **login number**, **password**, and especially the exact **server name** from your broker.\n\n` +
    `Official docs: [MetaTrader 5 Help](https://www.metatrader5.com/en/help)`;
}

export function buildAssess(ctx) {
  const { text, marketData } = ctx;
  const { entry, sl, tp } = parseTradeLevels(text);
  let out = '## Trade Assessment (educational)\n';
  if (entry && sl && tp) {
    const slDist = Math.abs(entry - sl);
    const tpDist = Math.abs(tp - entry);
    const rr = slDist > 0 ? (tpDist / slDist) : null;
    out += `**Your levels:** Entry ${money(entry)} · Stop ${money(sl)} · Target ${money(tp)}\n\n`;
    out += `- **Stop distance:** ${slDist.toLocaleString('en-US')} points\n`;
    out += `- **Target distance:** ${tpDist.toLocaleString('en-US')} points\n`;
    if (rr != null) {
      const verdict = rr >= 2 ? '🟢 strong' : rr >= 1.5 ? '🟡 acceptable' : '🔴 below the common 1:1.5 minimum';
      out += `- **Risk-to-Reward:** ≈ **1:${rr.toFixed(2)}** — ${verdict}\n`;
    }
    out += `\n**How to read this (not a signal):**\n` +
      `- A minimum **1:1.5** R:R is generally considered acceptable; **1:2+** is preferred by most risk managers.\n` +
      `- Ask: is your **stop** beyond a logical structure level (not just an arbitrary distance)?\n` +
      `- Ask: does your **target** sit before a major opposing level that could reject price?\n` +
      `- Check **news risk**: is a high-impact event due within your trade's timeframe?\n`;
  } else {
    out += `Share your **entry**, **stop loss**, and **take profit** (e.g., *"entry 2650, stop 2640, target 2675"*) and I'll calculate your risk-to-reward and review the structure.\n\n` +
      `I'll cover: stop placement vs. structure, target realism, R:R, and news risk — all **educational**, never a buy/sell instruction.`;
  }
  if (marketData?.marketRegime?.label) out += `\n_Current regime: **${marketData.marketRegime.label}**._`;
  return out;
}

export function buildLotsize(ctx) {
  const { text } = ctx;
  const s = text.toLowerCase();
  const acct    = (s.match(/(?:account|balance|capital|equity)[^\d]{0,10}(\d[\d,]*\.?\d*)/i) || [])[1];
  const riskPct = (s.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1];
  const slPips  = (s.match(/(\d+(?:\.\d+)?)\s*(?:pips?|points?)/i) || [])[1];
  let out = '## Position Size & Risk Calculator (educational)\n';
  const account = acct ? parseFloat(acct.replace(/,/g, '')) : null;
  const risk    = riskPct ? parseFloat(riskPct) : null;
  const pips    = slPips ? parseFloat(slPips) : null;
  if (account && risk && pips) {
    const riskAmt = account * (risk / 100);
    const pipValuePerLot = 10; // documented assumption for XAU/USD per 1.00 lot
    const lots = riskAmt / (pips * pipValuePerLot);
    out += `**Your inputs:** Account ${money(account)} · Risk ${risk}% · Stop ${pips} pips\n\n` +
      `- **Risk amount:** ${money(riskAmt)} (the most you'd lose if stopped out)\n` +
      `- **Assumed Gold pip value:** ~$${pipValuePerLot} per pip per **1.00** standard lot\n` +
      `- **Suggested size:** ≈ **${lots.toFixed(2)} lots**\n\n` +
      `_Formula:_ \`Lots = (Account × Risk%) ÷ (Stop pips × pip value per lot)\`\n\n` +
      `⚠️ Pip value varies by broker and instrument — **always confirm the exact pip/point value on your own platform** before sizing.`;
  } else {
    out += `Tell me three things and I'll calculate it:\n` +
      `1. **Account size** (e.g., $5,000)\n2. **Risk per trade %** (1–2% recommended)\n3. **Stop loss distance** in pips/points\n\n` +
      `_Formula:_ \`Lots = (Account × Risk%) ÷ (Stop pips × pip value per lot)\`\n\n` +
      `Golden rule: risk **1–2% max** per trade so a losing streak can't wipe your account.`;
  }
  return out;
}

export function buildSetCountry(ctx) {
  const code = parseCountryFromText(ctx.text);
  if (code && COUNTRY_TZ[code]) {
    const c = COUNTRY_TZ[code];
    return `✅ Got it — I'll remember you're trading from **${c.name}** and show all event, news, and session times in **${c.name} Time** (${c.tz}).\n\n` +
      `Ask me *"today's news"* or *"upcoming events"* and I'll convert everything to your local time.`;
  }
  return `Which country are you trading from? (e.g., Pakistan, India, Indonesia, UAE…) I'll remember it and convert all event & session times to your local timezone.`;
}

// Knowledge base rendering (used by both 'knowledge' and 'psychology' intents)
export function buildKnowledge(ctx) {
  const { knowledgeEntries } = ctx;
  if (knowledgeEntries && knowledgeEntries.length) {
    const e = knowledgeEntries[0];
    let out = `## ${e.title}${e.source_author ? ` — *${e.source_author}*` : ''}\n${e.content}`;
    if (knowledgeEntries[1]) {
      out += `\n\n---\n**Related:** ${knowledgeEntries[1].title} — ${knowledgeEntries[1].summary || ''}`;
    }
    return out;
  }
  return `I can share lessons from our knowledge base — **Mark Douglas (Trading in the Zone)**, **Van Tharp (position sizing & R-multiples)**, **Market Wizards**, trading **psychology**, a **beginner roadmap**, and a **glossary**. Which would you like?`;
}

// ── PHASE NEXT: STRATEGY / TECHNICAL / RISK / FUNDING / SELF-ASSESS ──────────

export function buildStrategy(ctx) {
  return `## Choosing a Trading Strategy (educational)\n` +
    `There's no single "best" strategy — the right one fits your **time, temperament, and risk tolerance**:\n\n` +
    `- **⚡ Scalping** — minutes per trade, high screen time, tight spreads matter most. Suits fast decision-makers.\n` +
    `- **📊 Intraday / Day trading** — open & close within the day. Balanced opportunity vs. control.\n` +
    `- **🌊 Swing trading** — hold days to weeks. Lower screen time, more patience, larger stops.\n` +
    `- **📈 Trend following** — ride the higher-timeframe trend; fewer, bigger moves.\n\n` +
    `Whatever you pick, the edge comes from **consistency + risk management**, not the indicator. Master one style before adding another.\n\n` +
    `Not sure which fits you? The **[Trader Self-Assessment](trader-assessment.html)** matches a style to your profile, or try the **AI Strategy Match Finder™** in the sidebar.`;
}

export function buildTechnical(ctx) {
  return `## Technical Analysis — The Core (educational)\n` +
    `Technical analysis is about reading **structure and probability**, not predicting the future:\n\n` +
    `- **Trend:** higher highs/lows = uptrend; lower highs/lows = downtrend; flat = range.\n` +
    `- **Support & Resistance:** horizontal zones where price has repeatedly reacted — the more touches, the more significant until broken.\n` +
    `- **Market structure:** track swing points and whether structure is being respected or broken.\n` +
    `- **Confluence:** the best setups stack multiple factors (structure + level + trend + session) — not a single indicator.\n` +
    `- **Price action:** candles tell you who's in control; context beats any single candle.\n\n` +
    `📊 Upload a **chart screenshot** with the image button and I'll read its trend, support/resistance, and visible patterns — educational structure analysis, never a signal.`;
}

export function buildRiskMgmt(ctx) {
  return `## Risk Management — The Real Edge (educational)\n` +
    `Most blown accounts are a risk problem, not a strategy problem. The non-negotiables:\n\n` +
    `- **1–2% rule:** risk a fixed small % of equity per trade so a losing streak can't wipe you out.\n` +
    `- **Risk-to-Reward:** aim for **1:1.5 minimum**, ideally **1:2+** — then a sub-50% win rate can still be profitable.\n` +
    `- **Stop loss = invalidation:** place it where your idea is *wrong* (beyond structure), never an arbitrary distance — and never widen it emotionally.\n` +
    `- **Position sizing:** \`Lots = (Account × Risk%) ÷ (Stop pips × pip value)\` — tell me your numbers and I'll calculate it.\n` +
    `- **Daily loss limit:** stop for the day after a set drawdown to prevent tilt and revenge trades.\n\n` +
    `Want me to **size a specific trade**? Share your account, risk %, and stop distance.`;
}

export function buildFunding(ctx) {
  return `## Funded Accounts & Prop-Firm Challenges (educational)\n` +
    `Prop / funded challenges give you a larger account to trade if you pass an evaluation — but the **rules** are what trip most traders, not the market:\n\n` +
    `- **Max daily loss & max overall drawdown:** breaching either usually fails the account instantly — these are your real constraint.\n` +
    `- **Profit target:** reachable with **low risk per trade** over many trades; you do *not* need hero trades.\n` +
    `- **Consistency rules:** some firms cap how much of your profit can come from one day/trade.\n` +
    `- **Mindset:** trade to **protect the drawdown limit first** — survival keeps the account; aggression loses it.\n\n` +
    `Practical approach: risk **0.25–0.5%** per trade during a challenge, avoid high-impact news, and treat the daily-loss limit as a hard stop. Read each firm's official rulebook carefully before paying.\n\n` +
    `⚠️ Educational only — I'm not endorsing any specific prop firm; always verify a firm's terms and track record yourself.`;
}

export function buildSelfAssess(ctx) {
  return `## Discover Your Trader Profile\n` +
    `The best way to know your real level, strengths, weaknesses, risk profile, and psychology is our dedicated tool:\n\n` +
    `👉 **[Trader Self-Assessment](trader-assessment.html)** — a guided diagnostic that returns your trader level, a behavioural profile, risk & psychology scores, and a personalised learning roadmap.\n\n` +
    `It takes a few minutes and tailors everything I tell you afterwards. You can also watch your live patterns build in the **AI Trader Mirror™** panel in the sidebar as we chat.`;
}
