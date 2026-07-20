// functions/utils/knowledge-engine.js
// ════════════════════════════════════════════════════════════════════════════
// BEGINNER MENTOR + EDUCATION + RISK SPECIALIST — knowledge-base rendering,
// greeting, the User-Satisfaction fallback, signal routing, platform help,
// trade assessment, lot-size maths, set-country, and the Phase-Next education
// intents: strategy, technical analysis, risk management, funding/prop, self-assessment.
// ════════════════════════════════════════════════════════════════════════════

import { loc, trustedSourceBlock, signalRouteBlock, money, extractNumbers, parseTradeLevels } from './response-engine.js';
import { parseCountryFromText, COUNTRY_TZ } from './intent-engine.js';
import { readProfileFacts } from './profile-recall.js';
import { extractFacts } from './memory-facts.js';
import { vary, ACK_OPENERS, FB_OPENERS } from './humanize.js';

export function buildGreeting(ctx) {
  const base = loc(ctx.lang).greet;
  // Salam → reply with the customary "Wa Alaikum Assalam" before the greeting.
  if (ctx.lang === 'en' && /\b(salam|assalam|asalam|aslam|salaam|assalamu)\b/i.test(ctx.text || '')) {
    return `**Wa Alaikum Assalam** — I hope you're doing well today. ${base}`;
  }
  return base;
}

// ── PHASE 11B.2: HUMAN SMALL TALK (warm, brief, gently redirect to trading) ──
export function buildSmallTalk(ctx) {
  const s = (ctx.text || '').toLowerCase();
  if (/\b(thank|thanks|thankyou|thank u|thx|shukr|jazak|appreciate)\b/.test(s))
    return `You're welcome — glad it helped. 🙂 Whenever you want to dig into Gold, BTC, a trade you're weighing, or the psychology side, I'm right here.`;
  if (/\b(bye|goodbye|good night|see you|see ya|take care|hafiz)\b/.test(s))
    return `Take care — trade safe and protect your capital. I'll be here whenever you need me. 👋`;
  if (/\b(how are you|how r u|how are u|how'?s it going|hows it going|kaise|kya haal)\b/.test(s))
    return `I'm well, thank you — ready to help you trade smarter. What's on your mind: Gold, BTC, a trade you're weighing, or something you'd like to learn?`;
  return `Good to see you. 🙂 What would you like to look at today — market context, a trade, or learning something new?`;
}

// ── PHASE 8E: PROFILE STATEMENT ACK (human confirmation + follow-up) ─────────
// "I only trade Gold" → "Got it — I'll remember you focus on Gold. <follow-up>"
export function buildProfileAck(ctx) {
  const facts = (ctx.facts && ctx.facts.length) ? ctx.facts : extractFacts(ctx.text || '');
  const parts = [];
  let followup = '';
  for (const f of facts) {
    if (f.category === 'favorite-instrument') {
      parts.push(`you focus primarily on **${f.value}**`);
      followup = `Want me to tailor **${f.value}** market context to how you trade, or check today's **${f.value}** drivers?`;
    } else if (f.category === 'trading-style') {
      parts.push(`you trade as a **${f.value}**`);
      followup = followup || `That style lives or dies on tight risk — want a quick rundown of risk control for a **${f.value}**?`;
    } else if (f.category === 'experience') {
      parts.push(`you're at a **${f.value}** level`);
      followup = followup || `I'll keep things clear and foundational. What do you trade most — **Gold** or **₿ BTC**?`;
    } else if (f.category === 'goal') {
      parts.push(`I've noted your goal`);
      followup = followup || `Good goal to have — want a simple, low-risk way to work toward it?`;
    }
  }
  const opener = vary(ACK_OPENERS, ctx.text || '');
  const ack = parts.length
    ? `${opener} — I'll remember that ${parts.join(' and ')}. ✅`
    : `${opener} — noted. ✅`;
  return `${ack}\n\n${followup || `What would you like to dig into — **market context**, a **trade review**, or **psychology**?`}`;
}

// Trading Journal (Final Phase, Part 3) — a real, honest answer that points to
// the site's actual Journal feature (journal.html) rather than a disconnected
// generic essay. No live journal API exists yet (submission/feedback is UI-only
// at this stage), so this is deliberately educational + a link, never a claim
// of a feature that isn't wired up.
export function buildJournal(ctx) {
  return `## Trading Journal\n` +
    `A journal is the single fastest way to actually improve — it turns "I feel like I keep losing" into a data trail you can fix. ` +
    `Log every trade: instrument, entry/exit, reason for the trade, and how you felt taking it. Review it weekly, not daily — patterns need a few trades to show up.\n\n` +
    `**What to track:** setup/strategy used · risk taken · outcome · one honest note on discipline (did you follow your own plan?).\n\n` +
    `You can start yours on our [Trading Journal page](/journal.html) — submit your trade history there for mentor-guided feedback. ` +
    `Want help with **what to track**, or would you rather look at **risk management** or **trading psychology** first?`;
}

// ── PHASE 8E: DOMAIN GUARDRAIL (off-topic → polite redirect) ─────────────────
export function buildOffTopic(ctx) {
  return `I'm your **trading assistant**, so I stick to markets — **Gold**, **₿ BTC**, market context, trade reviews, risk, and trading psychology. ` +
    `That one's outside my lane, but I'm all yours for anything trading-related.\n\nWhat would you like to look at — Gold/BTC context, a trade assessment, or chart analysis?`;
}

// ── PHASE 8C: ABOUT-ME / MEMORY RECALL ───────────────────────────────────────
// Answers "what do you know about me?" from the stored profile. If nothing is
// stored yet, asks for the key facts naturally (and remembers them next time).
export function buildAboutMe(ctx) {
  const f = readProfileFacts(ctx);
  if (!f.hasData) {
    return `## What I Know About You\n` +
      `We're still getting to know each other — I don't have much saved yet. Tell me a few things and I'll remember them next time:\n\n` +
      `- **What do you trade most?** (e.g., Gold, BTC)\n` +
      `- **Your experience level?** (beginner / intermediate / advanced)\n` +
      `- **Your style?** (scalping, intraday, swing)\n\n` +
      `You can also run the **[Trader Self-Assessment](trader-assessment.html)** and I'll tailor everything to your profile.`;
  }
  let out = `## What I Remember About You\n`;
  if (f.instrument)        out += `- 🎯 You focus primarily on **${f.instrument}**\n`;
  if (f.level)             out += `- 📈 Experience level: **${f.level}**\n`;
  if (f.style)             out += `- 🧭 Trading style: **${f.style}**\n`;
  if (f.convs)             out += `- 💬 We've talked across **${f.convs}** conversation${f.convs > 1 ? 's' : ''}\n`;
  if (f.strengths.length)  out += `- ✅ Strengths: ${f.strengths.join(', ')}\n`;
  if (f.weaknesses.length) out += `- ⚠️ Areas to work on: ${f.weaknesses.join(', ')}\n`;
  if (f.psych.length)      out += `- 🧠 Psychology patterns I've noticed: ${f.psych.join(', ')}\n`;
  if (f.recentTopics.length) out += `- 🕘 Recently you asked about: ${f.recentTopics.map(t => `"${t}"`).join(', ')}\n`;
  out += `\nI use this to tailor my answers. Want to **update** anything — or shall we dig into ${f.instrument || 'the market'}?`;
  return out;
}

// ── PHASE 11A.5: ISLAMIC / HALAL TRADING (educational, NEVER a fatwa) ─────────
export function buildIslamic(ctx) {
  return `## Islamic / Halal Trading — Educational Note\n` +
    `I'm not a religious authority, so please treat this as **education, not a fatwa** — for a binding ruling, consult a qualified scholar you trust.\n\n` +
    `The main points scholars discuss about trading:\n` +
    `- **Riba (interest):** overnight **swap/rollover** charges are interest-based. Many brokers offer **swap-free / Islamic accounts** that remove them.\n` +
    `- **Gharar (excessive uncertainty) & leverage:** heavy leverage and pure speculation are debated; clear analysis and lower risk are viewed more favourably by many.\n` +
    `- **Asset ownership:** trading real, owned assets vs. pure derivatives is part of the discussion.\n\n` +
    `Neutral, practical steps: use a **swap-free account**, avoid interest charges, trade from analysis (not gambling), and **ask a scholar** about your specific case.\n\n` +
    `Want help with **swap-free account** basics, or the risk-management side?`;
}

// ── PHASE 10: TRADING CAREER / PROFITABILITY / WEALTH ────────────────────────
export function buildCareer(ctx) {
  const f = readProfileFacts(ctx);
  const inst = f.instrument ? `As a **${f.instrument}** trader, ` : '';
  return `## Becoming a Profitable Trader (educational)\n` +
    `${inst}the traders who last aren't the ones chasing perfect entries — they're the ones who treat this as a **process, not a jackpot**:\n\n` +
    `- **🛡️ Risk first:** survive long enough to get good. Risk **1–2% per trade** so no losing streak can end you.\n` +
    `- **🔁 Consistency over intensity:** one repeatable setup traded with discipline beats ten random ideas.\n` +
    `- **🧠 Psychology is the edge:** FOMO, revenge, and impatience blow more accounts than bad analysis ever does.\n` +
    `- **📈 Compounding + realistic targets:** steady small gains compound; "get rich quick" sizing is how accounts die.\n` +
    `- **📓 Review everything:** journal trades, study your mistakes, and let the data — not emotion — shape your plan.\n\n` +
    `Wealth from trading is the **by-product** of skill + risk control + patience, not the goal you chase trade-to-trade. ` +
    `Want a **beginner roadmap**, a look at **risk management**, or the **psychology** side first?`;
}

// User Satisfaction Engine — never "I don't know". Intelligent fallback:
//   1) memory-aware (reference what we know) · 2) recent-context · 3) clarify
//   (low confidence) · 4) short capability hint (last resort).
export function buildFallback(ctx) {
  const { lang } = ctx;
  const f = readProfileFacts(ctx);

  // 1) Memory-aware — anchor on what we already know about the trader.
  if (f.hasData && (f.instrument || f.level || f.style)) {
    const bits = [];
    if (f.instrument) bits.push(`your focus on **${f.instrument}**`);
    if (f.level)      bits.push(`your **${f.level}** level`);
    const ref = bits.length ? `Given ${bits.join(' and ')}, ` : '';
    return `${vary(FB_OPENERS, ctx.text || '')}. ${ref}here's what I can dig into with you:\n\n` +
      `- 🏅 **Gold / ₿ BTC market context**\n` +
      `- 🔍 **Trade assessment** — share your entry, stop & target\n` +
      `- 🧠 **"Why am I losing" / psychology** coaching\n` +
      `- 📊 **Chart analysis** — upload a screenshot\n\n` +
      `What would you like — or could you rephrase in a few words?`;
  }

  // 2) Recent-context clarification.
  if (f.recentTopics.length) {
    return `I didn't quite catch that. Earlier you asked about ${f.recentTopics.slice(0, 2).map(t => `"${t}"`).join(' and ')} — ` +
      `want to continue there, or ask about **Gold/BTC** context, a **trade assessment**, or **chart analysis**?`;
  }

  // 3) Low-confidence → ask a clarifying question instead of a generic dump.
  if (ctx.confidence === 'low') {
    return `I want to give you a precise answer — could you tell me a little more?\n\n` +
      `- Are you asking about **Gold** or **₿ BTC**?\n` +
      `- Market **context**, a **trade assessment**, **chart analysis**, or **psychology**?\n\n` +
      `A few words is enough and I'll take it from there.`;
  }

  // 4) Last-resort capability hint (kept short).
  return `Here's how I can help: **Gold/BTC market context**, **trade assessment** (share entry/stop/target), ` +
    `**chart analysis** (upload a screenshot), **broker** help, and **psychology** coaching.\n\n` +
    `If it's live data you're after:\n${trustedSourceBlock(lang, 'macro')}\n\nWhat would you like to dig into?`;
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
