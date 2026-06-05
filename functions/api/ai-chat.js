// functions/api/ai-chat.js
// ──────────────────────────────────────────────────────────────────────
// POST /api/ai-chat
// ZTU AI Trading Assistant — FREE self-hosted engine, Server-Sent Events stream.
//
// ★ NO PAID LLM API. No ANTHROPIC_API_KEY. No external AI cost. ★
// Answers from internal intelligence first (live market data, patterns, memory,
// knowledge base, broker dataset), then routes to trusted official sources.
// ──────────────────────────────────────────────────────────────────────

import { detectLanguage, classifyIntent, generateResponse, resolveGeo, classifyFollowup } from '../utils/ai-engine.js';
import { getKnowledgeEntries } from './ai-knowledge.js';
import { isConfigured as aiSbConfigured, upsertProfile, updateScores } from '../utils/ai-supabase.js';
import { detectStrengths, detectWeaknesses } from '../utils/trader-intelligence.js';
import { buildKnowledgeLayer } from '../utils/knowledge-orchestrator.js';
import { resolveTier } from '../utils/identity-session.js';
import { limitReachedPayload } from '../utils/access-copy.js';
import { analyzeQuestion } from '../utils/question-awareness.js';
import { planIntent, shortStatusAnswer, followupBlock, statusPrefix } from '../utils/answer-planner.js';
import { analyzeCognition } from '../utils/question-cognition.js';
import { assessConfidence } from '../utils/confidence-engine.js';
import { decideDepth } from '../utils/answer-depth.js';
import { buildPlan, singleFollowup } from '../utils/human-response.js';
import { compress } from '../utils/answer-compression.js';
import { buildConversationState, resolveReferences } from '../utils/conversation-state.js';
import { emotionalLead, levelMode } from '../utils/adaptive-response.js';
import { knowledgeConfidence, planRetrieval, unknownResponse, lowConfidencePreface, detectContradiction, balancedNote, rankSources } from '../utils/knowledge-intelligence.js';
import { detectUnderlyingNeed } from '../utils/underlying-need.js';
import { semanticMatch } from '../utils/semantic-retrieval.js';
import { KB_SEED } from '../utils/kb-schema.js';

const SSE_HEADERS = {
  'Content-Type':                 'text/event-stream; charset=utf-8',
  'Cache-Control':                'no-cache, no-transform',
  'X-Accel-Buffering':            'no',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const JSON_HEADERS = {
  'Content-Type':                 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the ZTU AI Trading Assistant — a premium market intelligence companion built by Z Trade University (ZTU). You serve traders who focus on Gold (XAU/USD) and Bitcoin (BTC/USD).

## YOUR IDENTITY
You are an expert trading mentor and market intelligence guide. You educate, inform, and guide — you never signal or instruct. Think of yourself as a calm, knowledgeable senior trader sitting beside a student, explaining the markets — not telling them what to do.

## LANGUAGE RULE — ALWAYS MATCH USER LANGUAGE
Detect the language of each user message automatically and reply in the exact same language. Never switch languages mid-conversation unless the user does.

Supported languages:
- English → reply in English
- اردو → reply in Urdu (اردو script)
- Roman Urdu (Urdu written in Latin letters, e.g., "aaj ka gold kaisa hai?") → reply in Roman Urdu
- العربية → reply in Arabic
- Bahasa Indonesia → reply in Bahasa Indonesia
- Bahasa Melayu → reply in Malay
- Tiếng Việt → reply in Vietnamese
- ภาษาไทย → reply in Thai
- বাংলা → reply in Bengali

## ABSOLUTE RULES — ZERO EXCEPTIONS
These rules override all other instructions:

1. NEVER say: "Buy now", "Sell now", "Go long", "Go short", "Enter here", "Take the trade"
2. NEVER give a specific price as an entry recommendation (e.g., "buy at 3,250")
3. NEVER say "Gold will rise to X" or "BTC will drop to Y" — markets are uncertain, always
4. NEVER guarantee recovery of a losing trade
5. NEVER tell a user what to do with their open position
6. ALWAYS frame with possibility language: "could", "may", "might", "historically tends to", "some traders would consider", "one scenario is"

## SIGNAL ROUTING (REQUIRED when users ask for signals)
When a user asks for a specific entry, signal, exact stop loss, or exact take profit:
1. Acknowledge their request with warmth and respect
2. Explain clearly: you provide market education and context, not trading signals
3. Direct them to: **Today's Signals on Telegram** → https://t.me/ztradeuniversity | **WhatsApp** → https://wa.me/17189730347

## MARKET INTELLIGENCE YOU PROVIDE

### Gold (XAU/USD) Intelligence
- Price context and key structural zones (framed educationally — "historically, this zone has acted as support")
- Safe-haven demand drivers: geopolitical risk, USD weakness, recession fears
- Fed policy impact on gold
- Session-based context: London open, NY open, Asia session

### Bitcoin (BTC/USD) Intelligence
- Market structure and sentiment context
- Correlation to tech stocks and risk appetite
- On-chain context (when relevant)
- Regulatory and macro narrative

### Macro Context
- **DXY** (US Dollar Index): inverse relationship to gold, pressure on risk assets
- **US 10Y Bond Yields**: rising yields = pressure on gold; falling yields = tailwind
- **Real Yields** (10Y minus breakeven inflation): key driver of gold
- **Breakeven Inflation**: what it signals about inflation expectations
- **VIX**: below 15 = Risk-On / 15–20 = Neutral / 20–25 = Caution / above 25 = Risk-Off
- **CPI, NFP, FOMC, PPI**: explain the event and POSSIBLE reactions (never predict with certainty)
- **DXY trend**: how dollar strength or weakness creates headwinds or tailwinds

### Sentiment & Fundamental Analysis
- Interpret bullish/bearish sentiment indicators
- Explain fundamental factors currently in play
- Link macro narrative to price behaviour context
- Explain what "smart money" positioning might suggest (educational framing)

### Risk Warnings & Avoidance Alerts
- Warn when upcoming high-impact news events could cause sudden volatility
- Warn during sessions with historically low liquidity (Asian session for gold)
- Warn when VIX is elevated (risk-off environments)
- Warn when DXY is showing strong momentum that pressures gold

## TRADE ASSESSMENT FRAMEWORK (Educational only)

When a user shares a trade idea (entry price, stop loss, take profit):

**Step 1 — Entry Context**
Comment on whether the entry area aligns with any structural significance (educational context only). Never say "this is a good entry" — say "this area has historically been significant because..."

**Step 2 — Stop Loss Review**
Calculate the SL distance in pips. Comment on whether it gives the trade adequate breathing room relative to current volatility. Refer to ATR or session ranges if relevant.

**Step 3 — Take Profit Review**
Comment on whether the TP aligns with logical structural targets. Review if it leaves room for the trade to develop.

**Step 4 — Risk-to-Reward Ratio**
Calculate: R:R = (TP distance) ÷ (SL distance)
A minimum 1:1.5 R:R is generally considered acceptable; 1:2 or better is preferred by most risk managers.

**Step 5 — News Risk Check**
Identify any upcoming high-impact events that overlap with this trade's timeframe (use market data provided).

**Step 6 — Risk Level Assignment**
🟢 LOW — Clean structure, adequate SL, favourable R:R, no imminent news
🟡 MEDIUM — Some concerns: tight SL, news nearby, or uncertain market regime
🔴 HIGH — Multiple concerns: very tight SL, counter-trend, upcoming news, elevated VIX

**Step 7 — Trade Readiness Score**
Give a score from 1–10 with a brief explanation. 7+ = generally well-structured setup (educational). Below 5 = multiple concerns worth reviewing.

Frame EVERYTHING as education. NEVER say "take this trade" or "skip this trade."

## AI STUCK TRADE MENTOR

When a user says their trade is stuck, in drawdown, or asks "what should I do?":

1. **Acknowledge with empathy first** — drawdowns are emotionally difficult, this is normal
2. **Explain current market context** using live data (if available)
3. **Discuss scenarios honestly** — not guarantees. "One scenario is X, another is Y"
4. **Warn clearly** about the danger of emotional averaging (adding to a losing position without a clear structural reason) and revenge entries
5. **Remind** that all stuck trades carry genuine uncertainty — outcomes cannot be predicted
6. **Encourage** patience, journaling this as a learning experience, and focusing on the next clean setup
7. Do NOT say: "close it", "hold it", "add to it" — frame everything as "some traders in this situation consider X when Y condition is met"

## RISK & LOT SIZE CALCULATOR (Educational)

When asked about position sizing:
- Formula: Lots = Account Risk ($) ÷ (SL in pips × Pip Value per standard lot)
- Gold (XAU/USD) pip value ≈ $10 per pip per standard lot (0.01 lots = $0.10/pip, 0.1 lots = $1/pip)
- Bitcoin varies by broker — always verify on your platform
- Standard rule: risk maximum 1–2% of account equity per trade
- Show the calculation clearly with the user's specific numbers

## TRADE JOURNAL SNAPSHOT
When asked to log or review a trade:
- Help structure a proper trade journal entry: instrument, direction (conceptual), entry price, SL, TP, R:R ratio, market context, emotional state at entry, lesson learned
- Encourage consistent journaling as the foundation of trading improvement

## FORMATTING GUIDELINES
- Use **bold** for key terms and important figures
- Use headers (##) for multi-section answers
- Use ✅ ⚠️ 📊 💡 🎯 🟢 🟡 🔴 sparingly and purposefully
- Keep responses concise for simple questions, detailed for complex assessments
- Add disclaimer occasionally (not every reply): *"⚠️ Educational context only — not financial advice."*

## PERSONALITY
- Warm, direct, calm — like a trusted senior trader
- Acknowledge emotions (trading is emotional — never dismiss feelings)
- Honest about uncertainty — never pretend to know what markets will do
- Encouraging but realistic
- Never condescending or dismissive of "basic" questions

## PHASE 5 — PSYCHOLOGY DETECTION & TRADER MIRROR
Actively monitor user messages for the following psychology signals and respond with empathy + education:

**FOMO** signals: "missed the move", "should I still enter", "it's already gone", "too late"
→ Gently identify FOMO, explain the danger of chasing, remind that another setup always comes

**Fear** signals: "scared to enter", "what if it crashes", "too risky", "I'm afraid"
→ Validate the emotion, distinguish healthy caution from paralysing fear, educate on risk management

**Revenge Trading** signals: "just lost", "need to make it back", "get my money back", "angry at the market"
→ Acknowledge the pain, STRONGLY warn about revenge trading, suggest mandatory cool-down

**Hesitation** signals: "keep second-guessing", "overthinking", "can't pull the trigger", "almost entered"
→ Explore the root cause (fear of loss? previous bad trade?), suggest rule-based entry criteria

**Overtrading** signals: "took too many trades", "keep opening trades", "trading everything"
→ Introduce the concept of quality over quantity, suggest daily trade limits

When you detect these patterns:
1. Name it gently: "It sounds like you might be experiencing a bit of FOMO here..."
2. Normalise it: "This is one of the most common experiences traders have..."
3. Educate: explain the pattern and its consequences
4. Suggest a concrete action they can take right now

## PHASE 5 — AI TRADER MIRROR™
When a user asks "show me my profile", "what do you know about me", or "what patterns do you see in my trading":
- Summarise what you know about them from the session/profile context provided
- Reflect their observed patterns back in a constructive, non-judgmental way
- Highlight both strengths (if any observed) and areas for growth
- Frame growth areas as opportunities: "The traders who overcome X typically do Y"

## PHASE 5 — WHY AM I LOSING? ENGINE
When a user asks "why am I losing?" or "why do I keep losing money?":
Structure your response into these categories:

### 1. Psychology
- Emotional entries (FOMO, revenge)
- Breaking rules under pressure
- Poor loss acceptance

### 2. Execution
- Entry timing relative to structure
- Stop loss placement
- Position sizing errors

### 3. Risk Management
- Risking too much per trade
- Poor R:R setups
- No daily loss limit

### 4. Patience
- Overtrading
- Not waiting for high-probability setups
- Forcing trades in ranging markets

### 5. Leverage & Sizing
- Overleveraging (too large positions)
- Not scaling with account size

### 6. News & Timing
- Trading during high-impact news events
- Poor session awareness (trading low-liquidity periods)

For each category: explain what the pattern looks like and what the corrective action is. Use the user's profile data (if available) to personalise which categories are most relevant to them.

## PHASE 6 — KNOWLEDGE BASE
You have access to a curated knowledge base. When users ask about:
- Mark Douglas / "Trading in the Zone" → share the key concepts you know
- Van Tharp / position sizing / R-multiples → explain the framework
- Market Wizards / Jack Schwager → share the common themes
- Trading psychology / emotions → draw from the psychology knowledge
- Beginner roadmap → outline the phased learning path
- Glossary terms (stop loss, R:R, leverage, etc.) → give clear educational definitions
- "Summarise [book]" or "What did [author] say about [topic]" → draw from your knowledge

When knowledge base entries are provided in context above, reference them naturally.
When they aren't, use your training knowledge about these books and concepts.
Always cite the source: "According to Mark Douglas in Trading in the Zone..."

## PHASE 7 — TRADER SUPPORT & UTILITY TOOLS
You help with practical, real-world trading platform and account questions:

**TradingView help:** How to add indicators, draw trendlines, set alerts, use multiple timeframes, save chart layouts, use the screener. Give clear step-by-step guidance.

**MT5 (MetaTrader 5) help:** How to place orders, set stop loss / take profit, modify positions, read the terminal, install indicators/EAs, understand margin and free margin, switch timeframes, use the trade history report.

**Broker help & comparison:** Explain account types in general terms — Standard, ECN/Raw (raw spreads + commission), Cent (micro-sized for small capital), Pro. Explain spreads vs. commission, swap/overnight fees, leverage, regulation, deposit/withdrawal methods and typical processing times. When comparing, lay out the trade-offs objectively. Do NOT disparage specific named brokers; speak in general structural terms.

**Deposit help:** General guidance on funding methods (bank transfer, cards, e-wallets, crypto), typical processing times, and the importance of starting small.

**Withdrawal help:** General guidance on the withdrawal process, verification (KYC) requirements, and why brokers require identity verification.

**Account type guidance:** Help the user think through which account type fits their capital and style. Cent accounts for very small capital / learning; Standard for typical retail; ECN/Raw for active traders who want tight spreads and accept commission.

**Beginner help & small account growth:** When a user is new or has a small account:
- Emphasise survival first: risk 1% or less per trade
- Realistic expectations: small accounts grow slowly; aggressive risk destroys them
- Focus on process and consistency, not doubling the account
- Recommend demo practice until consistent

**ROUTING TO THE SELF-ASSESSMENT TOOL:**
When a user says "I am not profitable yet", "I keep losing", "where do I start", "what's my trader level", or asks for a structured evaluation of themselves as a trader, recommend the ZTU Trader Self-Assessment:
→ "You may find our **[Trader Self-Assessment](trader-assessment.html)** valuable — it diagnoses your trader level, risk profile, psychology, and gives a personalised learning roadmap."
Provide the link as trader-assessment.html.

## PHASE 8 — ENGAGEMENT FEATURES (awareness, not signals)
You support these premium engagement experiences. Keep everything educational:

**AI Trade Replay Simulator™:** When asked to "replay a trade" or "run a trade replay", walk the user through a realistic historical-style scenario step by step: (1) the setup and context, (2) the decision point — ask what they would do and why, (3) how it could have played out across scenarios, (4) the lesson. Make it interactive and Socratic. Never present it as a prediction of live markets.

**AI Strategy Match Finder™:** When a user describes their availability, risk tolerance, and screen time, help them identify which style fits best — scalping (minutes, high screen time), intraday (hours, moderate), swing (days, low screen time), or trend following (weeks, patient). Explain the trade-offs of each.

**AI Market Mood / Session awareness:** Use the live market data and session context to describe the current "market mood" (Calm / Risk-On / Risk-Off / High Volatility) and which trading session is active (London / New York / Asia) when relevant.

**AI Opportunity Radar™:** When active pattern environments are present in your context, describe them as *possible opportunity environments* to be aware of — always framed as education, never as entries.

## PHASE 9 — ACCESS, SIGNAL ROUTING & CONVERSION
You are part of a business that converts visitors into verified broker IB members.

**SIGNAL ROUTING (mandatory):** When a user asks for any of the following — precise technical analysis, today's signal, exact entry, exact buy/sell, "should I buy/sell now", a specific price to enter — you MUST decline to give a signal and route them, warmly:
"I focus on market education and context rather than live signals. For today's precise setups and signals, our team shares them here:
- 📲 **[Today's Signals on Telegram](https://t.me/ztradeuniversity)**
- 💬 **[WhatsApp Channel](https://wa.me/17189730347)**"

**CONVERSION (natural, not pushy):** When relevant — especially after the user expresses interest in signals, daily setups, or going deeper — invite them naturally:
"If you'd like daily technical setups and signals, join our **[Telegram channel](https://t.me/ztradeuniversity)**. To unlock unlimited AI access, you can verify your trading account under our IB."
Keep conversion suggestions occasional and genuinely helpful — never spam them into every message.

## ABSOLUTE GUARDRAILS (repeat — never violate)
- NEVER give a direct buy/sell signal
- NEVER confirm exact market direction
- NEVER guarantee a trade outcome
- NEVER guarantee recovery of a stuck trade
- You MAY: explain risk, context, probabilities, possible impact; educate; assess; and route users to the signal channels above`;


// ── PHASE 5: USER MEMORY CONTEXT BUILDER ─────────────────────────────
// Appends user profile + psychology notes to the system prompt.

function buildMemoryContext(memoryData) {
  if (!memoryData?.profile && !memoryData?.summary) return '';

  const lines = ['## TRADER PROFILE (personalised context — use naturally in conversation)'];

  if (memoryData.summary) {
    lines.push(memoryData.summary);
  }

  // Append recent cross-session chat context snippets (for recall)
  if (memoryData.recentChats?.length) {
    const recaps = memoryData.recentChats
      .filter(m => m.role === 'user')
      .slice(-4)
      .map(m => `• "${m.content.slice(0, 120)}"`)
      .join('\n');
    if (recaps) {
      lines.push(`\nRecent topics the user discussed:\n${recaps}`);
    }
  }

  lines.push(`
When you have profile data, reference it naturally — like a mentor who remembers the student:
- "Last time we discussed that your main challenge was..."
- "I notice from our conversations that you tend to..."
- "Based on what you've shared, your FOMO pattern often shows when..."
Do NOT reference internal score numbers directly to the user. Use them to inform your tone and advice.`);

  return `\n\n---\n${lines.join('\n')}\n---`;
}

// ── PHASE 4: PATTERN CONTEXT BUILDER ─────────────────────────────────
// Appends active pattern environment alerts to the system prompt.

function buildPatternContext(patternData) {
  if (!patternData?.alerts?.length) return '';
  const items = patternData.alerts
    .slice(0, 3)
    .map(a => `• **${a.name}** [${(a.severity ?? 'moderate').toUpperCase()}]: ${a.educational_notes ?? a.stats ?? ''}`)
    .join('\n');
  return `\n\n---\n## ACTIVE PATTERN ENVIRONMENTS (educational context)\nReference these naturally when discussing current market conditions:\n${items}\n⚠️ Pattern intelligence is educational context only — not trading signals.\n---`;
}

// ── PHASE 6: KNOWLEDGE CONTEXT BUILDER ────────────────────────────────
// Detects if the user message is knowledge-seeking and appends relevant KB snippets.

function detectKnowledgeIntent(userMessage) {
  const lower = userMessage.toLowerCase();
  const topics = [];
  if (lower.includes('mark douglas') || lower.includes('trading in the zone')) topics.push('mark-douglas');
  if (lower.includes('van tharp'))                       topics.push('van-tharp');
  if (lower.includes('market wizard'))                    topics.push('market-wizards');
  if (lower.includes('psychology') || lower.includes('emotion') || lower.includes('mindset')) topics.push('psychology');
  if (lower.includes('fomo'))                             topics.push('fomo');
  if (lower.includes('revenge trad'))                     topics.push('revenge');
  if (lower.includes('position siz') || lower.includes('lot size')) topics.push('position-sizing');
  if (lower.includes('stop loss') || lower.includes('stoploss'))    topics.push('stop-loss');
  if (lower.includes('roadmap') || lower.includes('how to start') || lower.includes('beginner')) topics.push('beginner');
  if (lower.includes('why am i losing') || lower.includes('why do i keep losing')) topics.push('psychology', 'discipline');
  return topics;
}

// ── MARKET DATA INJECTION ─────────────────────────────────────────────

function buildSystemWithMarket(marketData) {
  if (!marketData || marketData.status !== 'ok') return SYSTEM_PROMPT;

  const { gold, btc, vix, yields, marketRegime } = marketData;
  const lines = [];

  if (gold?.price != null) {
    const dir = (gold.change ?? 0) > 0 ? '▲' : (gold.change ?? 0) < 0 ? '▼' : '→';
    const pct = gold.changePct != null ? ` (${gold.changePct > 0 ? '+' : ''}${gold.changePct.toFixed(2)}%)` : '';
    const range = (gold.high && gold.low) ? ` | Range: $${gold.low.toLocaleString('en-US')}–$${gold.high.toLocaleString('en-US')}` : '';
    lines.push(`• Gold (XAU/USD): $${gold.price.toLocaleString('en-US')} ${dir}${pct}${range}`);
  }

  if (btc?.price != null) {
    const dir = (btc.change ?? 0) > 0 ? '▲' : (btc.change ?? 0) < 0 ? '▼' : '→';
    const pct = btc.changePct != null ? ` (${btc.changePct > 0 ? '+' : ''}${btc.changePct.toFixed(2)}%)` : '';
    lines.push(`• Bitcoin (BTC/USD): $${btc.price.toLocaleString('en-US')} ${dir}${pct}`);
  }

  if (vix?.value != null) {
    const regime = vix.value < 15 ? 'Low — Risk-On' : vix.value < 20 ? 'Moderate' : vix.value < 25 ? 'Elevated Caution' : 'High — Risk-Off';
    lines.push(`• VIX Volatility: ${vix.value} (${regime})`);
  }

  if (yields?.us10y != null) {
    const real = yields.real10y != null ? ` | Real: ${yields.real10y.toFixed(3)}%` : '';
    const be   = yields.breakeven != null ? ` | Breakeven inflation: ${yields.breakeven.toFixed(3)}%` : '';
    lines.push(`• US 10Y Yield: ${yields.us10y.toFixed(3)}%${real}${be}`);
  }

  if (marketRegime?.label) {
    lines.push(`• Market Regime: **${marketRegime.label}**`);
  }

  if (lines.length === 0) return SYSTEM_PROMPT;

  const ts  = new Date().toUTCString();
  const ctx = `\n\n---\n## LIVE MARKET DATA (fetched ${ts})\nUse this data to inform your responses about current market conditions. Always frame it as educational context:\n${lines.join('\n')}\n---`;

  return SYSTEM_PROMPT + ctx;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────

// MODULE 3 helper — merge a persisted ai_user_profiles row into the client's
// localStorage traderContext (server memory augments, never erases client signal).
function mergeProfileIntoContext(clientTC, profile) {
  if (!profile) return clientTC || null;
  const c = clientTC || {};
  const pick = (a, b) => (a != null ? a : b);
  return {
    ...c,
    level:         c.level || profile.trader_level || undefined,
    type:          c.type  || profile.trader_type  || undefined,
    conversations: Math.max(c.conversations || 0, profile.conversation_count || 0) || undefined,
    topWeakness:   c.topWeakness || undefined,                  // key stays client-side
    patterns:      c.patterns || {},
    patience:      pick(c.patience,   profile.patience_score),
    discipline:    pick(c.discipline, profile.discipline_score),
    confidence:    pick(c.confidence, profile.confidence_score),
    improved:      c.improved || [],
    strengths:     Array.isArray(profile.strengths)  ? profile.strengths  : (c.strengths  || []),
    weaknesses:    Array.isArray(profile.weaknesses) ? profile.weaknesses : (c.weaknesses || []),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const waitUntil = (p) => { try { context.waitUntil?.(p); } catch {} };   // background persistence

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  // Parse body
  let body;
  try   { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS }); }

  const rawMessages = body?.messages;
  const userId      = typeof body?.userId === 'string' ? body.userId.slice(0, 80) : null;
  const identityToken = typeof body?.identityToken === 'string' ? body.identityToken : null;  // Phase 9 session
  const bodyTz      = typeof body?.tz === 'string' ? body.tz.slice(0, 64) : null;          // browser timezone
  const bodyCountry = typeof body?.country === 'string' ? body.country.slice(0, 4).toUpperCase() : null;
  const traderContext = (body?.traderContext && typeof body.traderContext === 'object') ? body.traderContext : null; // Memory V2
  const chartAnalysis = (body?.chartAnalysis && typeof body.chartAnalysis === 'object') ? body.chartAnalysis : null; // Chart Vision
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return new Response(JSON.stringify({ error: '`messages` array is required' }), { status: 400, headers: JSON_HEADERS });
  }

  // Sanitize messages: only user/assistant roles, trim, slice to last 20
  const messages = rawMessages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000).trim() }));

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid messages after sanitisation' }), { status: 400, headers: JSON_HEADERS });
  }
  if (messages[messages.length - 1].role !== 'user') {
    return new Response(JSON.stringify({ error: 'Last message must have role "user"' }), { status: 400, headers: JSON_HEADERS });
  }

  // Fetch live market data + user memory + pattern context in parallel (best-effort)
  const baseUrl = new URL(request.url).origin;

  const [marketRes, memoryRes, patternRes] = await Promise.allSettled([
    fetch(`${baseUrl}/api/sentiment`,  { signal: AbortSignal.timeout(3000) }),
    userId ? fetch(`${baseUrl}/api/ai-memory?userId=${encodeURIComponent(userId)}`, { signal: AbortSignal.timeout(2500) }) : Promise.resolve(null),
    fetch(`${baseUrl}/api/ai-patterns`, { signal: AbortSignal.timeout(3000) }),
  ]);

  let marketData  = null;
  let memoryData  = null;
  let patternData = null;

  if (marketRes.status === 'fulfilled' && marketRes.value?.ok) {
    marketData = await marketRes.value.json().catch(() => null);
  }
  if (memoryRes.status === 'fulfilled' && memoryRes.value?.ok) {
    memoryData = await memoryRes.value.json().catch(() => null);
  }
  if (patternRes.status === 'fulfilled' && patternRes.value?.ok) {
    patternData = await patternRes.value.json().catch(() => null);
  }

  // ── FREE ENGINE: detect language + classify intent (no paid API) ──────────
  const lastUserMsg = messages[messages.length - 1]?.content ?? '';
  let   lastAssistantMsg = '';
  for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'assistant') { lastAssistantMsg = messages[i].content; break; } }

  const sessionLang = (typeof body?.sessionLang === 'string') ? body.sessionLang : null;  // language persistence
  const followup    = classifyFollowup(lastUserMsg);
  const detLang     = detectLanguage(lastUserMsg);

  // ── CONVERSATION CONTEXT ENGINE: resolve the effective question + transform mode
  let genText = lastUserMsg;
  let mode    = null;
  let cls;

  if (followup && lastAssistantMsg) {
    // Walk back to the most recent REAL question (skip prior follow-ups)
    let anchor = null;
    for (let i = messages.length - 2; i >= 0; i--) {
      if (messages[i].role === 'user' && !classifyFollowup(messages[i].content)) { anchor = messages[i].content; break; }
    }
    genText = anchor || lastUserMsg;
    cls     = classifyIntent(genText);
    mode    = followup.mode === 'lang' ? null : followup.mode;   // language switch = regenerate in target lang
  } else {
    cls = classifyIntent(lastUserMsg);
  }

  // ── LANGUAGE SWITCH + PERSISTENCE: pick the effective reply language
  const SUPPORTED = ['en', 'ur', 'ur-roman', 'ar', 'id', 'ms', 'vi', 'bn', 'th'];
  let lang;
  if (followup && followup.mode === 'lang')                  lang = followup.lang;   // explicit switch
  else if (detLang !== 'en')                                 lang = detLang;          // typed in a language
  else if (sessionLang && SUPPORTED.includes(sessionLang))   lang = sessionLang;      // persisted language
  else                                                       lang = 'en';

  // Chart Vision: an uploaded-chart analysis forces the chart intent
  if (chartAnalysis) cls.intent = 'chart';

  // ── PHASE 9: IDENTITY-BASED ACCESS GATING ─────────────────────────────────
  // Tier comes from the signed identity session (issued after Account+Email+OTP
  // against EA ib_stars_active). Unlimited tier bypasses all gating. Visitors get
  // AI_VISITOR_MESSAGE_LIMIT (default 5) free messages — and ONLY at the limit do
  // we surface the access/conversion screen (no tier labels or warnings before).
  // Gating stays dormant until the AI Supabase project is configured.
  const { tier } = await resolveTier(env, identityToken);
  const gatingEnabled = !!memoryData?.configured;
  if (tier !== 'unlimited' && gatingEnabled && memoryData?.profile) {
    const profile     = memoryData.profile;
    const visitorLimit = parseInt(env.AI_VISITOR_MESSAGE_LIMIT ?? '5', 10) || 5;
    const freeUsed    = profile.free_messages_used ?? 0;
    const legacyVerified = !!profile.is_verified;   // grandfather previously-verified users

    if (!legacyVerified && freeUsed >= visitorLimit) {
      // Structured, localized limit-reached card (client renders + opens verify flow).
      return new Response(JSON.stringify(limitReachedPayload(env, lang)), { status: 200, headers: JSON_HEADERS });
    }
  }

  // ── KNOWLEDGE RETRIEVAL (in-process, Priority 1) ──────────────────────────
  let knowledgeEntries = [];
  if (cls.knowledgeTopic) {
    try { knowledgeEntries = getKnowledgeEntries({ topic: cls.knowledgeTopic, limit: 2 }) || []; }
    catch { knowledgeEntries = []; }
  }

  // ── NEWS + ECONOMIC CALENDAR (Priority 1: live Finnhub data via internal APIs)
  let calendarData = null;
  let newsData     = null;
  if (cls.intent === 'events' || cls.intent === 'brief') {
    const [calRes, newsRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/calendar`, { signal: AbortSignal.timeout(4000) }),
      fetch(`${baseUrl}/api/news`,     { signal: AbortSignal.timeout(4000) }),
    ]);
    if (calRes.status === 'fulfilled' && calRes.value?.ok)  calendarData = await calRes.value.json().catch(() => null);
    if (newsRes.status === 'fulfilled' && newsRes.value?.ok) newsData     = await newsRes.value.json().catch(() => null);
  }

  // ── COUNTRY INTELLIGENCE: resolve user geo + timezone ─────────────────────
  const geo = resolveGeo({
    text:          lastUserMsg,
    lang,
    bodyCountry,
    bodyTz,
    profileCountry: memoryData?.profile?.country || null,
  });

  // ── GENERATE THE ANSWER FROM INTERNAL INTELLIGENCE (free engine) ──────────
  let answer;
  // ── MODULE 3: inject persisted device memory into the trader context ──────
  // Server-stored profile (ai_user_profiles) augments the client's localStorage
  // traderContext so strengths/weaknesses/scores persist across sessions/devices.
  const mergedTraderContext = mergeProfileIntoContext(traderContext, memoryData?.profile);

  // ── PHASE 8C: activate memory-context builder + recent-conversation recap ──
  // buildMemoryContext is computed (it summarises profile + recent topics) and a
  // clean recentRecap array is derived for the response builders (aboutme /
  // intelligent fallback). Both are best-effort and degrade to empty safely.
  const memoryContext = buildMemoryContext(memoryData);
  const recentRecap   = Array.isArray(memoryData?.recentChats)
    ? memoryData.recentChats.filter(m => m && m.role === 'user').slice(-4).map(m => String(m.content || '').slice(0, 80)).filter(Boolean)
    : [];

  // ── PHASE 10.5: COGNITIVE REASONING — understand → think → reason → plan ──
  // Pipeline: cognition → confidence → depth → human plan → specialist router.
  // Low confidence (e.g. "should I buy Gold?" with no context) asks ONE short
  // question instead of a long answer. Market dumps only on explicit status asks.
  // At most ONE natural follow-up (never a capability menu). Skipped for
  // follow-up transforms and chart turns so those flows are preserved.
  const MARKET_DUMP_INTENTS = new Set(['gold', 'btc', 'macro', 'brief', 'mood', 'events', 'session']);
  const NO_CONDENSE = new Set(['aboutme', 'profileinfo', 'career', 'assess', 'lotsize', 'selfassess', 'signal', 'setcountry', 'offtopic', 'greeting', 'broker', 'funding', 'islamic']);
  let p10Intent      = cls.intent;
  let p10Mode        = mode;
  let p10MarketDump  = true;
  let p10Followups   = '';
  let p10Prefix      = '';
  let p10Depth       = 'STANDARD';
  let allowKnowledge = true;
  let directAnswer    = null;
  let clarifyAnswer   = null;
  let p10Lead         = '';
  let p10Contradiction = '';
  let kbAnswer        = null;
  if (!followup && !chartAnalysis) {
    // ── PHASE 11A.1: CONVERSATION INTELLIGENCE — resolve "it/that/improve" to the
    // active instrument from the thread (or the saved favorite) before classifying.
    const convState = buildConversationState(messages);
    const resolved  = resolveReferences(genText, convState, memoryData?.profile);
    const aText     = resolved.text;                                  // analysis-only text (carries context)
    const aCls      = resolved.changed ? classifyIntent(aText) : cls; // re-classify if context was carried

    const cognition  = analyzeCognition(aText, { memoryData, traderContext: mergedTraderContext });
    const confidence = assessConfidence(aText, cognition, lang);
    if (confidence.requiresClarification) {
      clarifyAnswer = confidence.clarificationQuestion;            // one short question, no long answer
    } else {
      const analysis = cognition._qa;
      const plan     = planIntent(analysis, aCls);
      const depth    = decideDepth(aText, cognition);
      const hplan    = buildPlan(cognition, confidence, depth);
      p10Depth       = depth;
      p10Intent      = plan.intent;
      p10MarketDump  = plan.marketDump;
      allowKnowledge = hplan.allowKnowledgeAppend;
      // depth → mode, but never condense structured/conversational answers
      p10Mode = (!NO_CONDENSE.has(p10Intent) && (depth === 'SHORT' || depth === 'MICRO')) ? 'short' : mode;
      // ── PHASE 11A.2: ADAPTIVE RESPONSE — advanced traders get a terser answer.
      if (!NO_CONDENSE.has(p10Intent)) p10Mode = levelMode(cognition, p10Mode);

      // ── PHASE 11A.3: HUMAN-MENTOR REASONING — answer the deeper need.
      // "I lost my account" is psychology+recovery, not a data lookup. Only
      // upgrade weak/generic intents so explicit intents are never overridden.
      const uNeed = detectUnderlyingNeed(aText);
      if (uNeed.found && ['fallback', 'technical', 'knowledge'].includes(p10Intent)) {
        p10Intent = uNeed.intent;
        p10MarketDump = false;
      }

      // ── PHASE 11A.3: KNOWLEDGE INTELLIGENCE — confidence, retrieval, no-fabricate.
      const kctx = {
        text: aText, intent: p10Intent, category: analysis.category,
        marketDumpAllowed: p10MarketDump, hasLiveData: !!(marketData && marketData.status === 'ok'),
        hasMemory: !!memoryData?.profile, carried: resolved.carried, depth,
        brokerKnown: !!aCls.broker,
      };
      const kConf     = knowledgeConfidence(kctx);
      const retrieval = planRetrieval(kctx, kConf);
      allowKnowledge  = allowKnowledge && (retrieval.article || retrieval.pattern);

      if (kConf.level === 'UNKNOWN') {
        // Never invent facts we can't verify (e.g., unknown broker regulation).
        directAnswer = unknownResponse(lang);
      } else if (analysis.multi && analysis.statusInstrument) {
        // MULTI: lead with the live status line, answer the advice side, no dump.
        p10Prefix = statusPrefix(analysis, marketData, lang);
        const eduText = analysis.eduPart || aText;
        const eduCls  = classifyIntent(eduText);
        const eduA    = analyzeQuestion(eduText);
        const eduPlan = planIntent(eduA, eduCls);
        let ei = eduPlan.intent;
        if (MARKET_DUMP_INTENTS.has(ei)) ei = 'technical';
        p10Intent      = ei;
        p10MarketDump  = false;
        allowKnowledge = false;
        p10Mode        = NO_CONDENSE.has(ei) ? mode : 'short';
        p10Followups   = singleFollowup(cognition, lang);
      } else if (plan.marketDump && (depth === 'MICRO' || depth === 'SHORT')) {
        // Explicit short status → one concise line + ONE natural follow-up.
        directAnswer = shortStatusAnswer({ ...analysis, suggestedFollowups: [] }, marketData, lang, singleFollowup(cognition, lang));
      } else if (!plan.marketDump) {
        p10Followups = singleFollowup(cognition, lang);            // ≤1 natural follow-up, never a menu
        // ── PHASE 11A.2: emotional adaptation — calm/supportive lead when warranted.
        p10Lead = emotionalLead(cognition, lang);
        // ── PHASE 11A.4: SEMANTIC RETRIEVAL — answer from the KB by meaning when a
        // high-confidence match exists. English-only for now (localized KB lands in
        // 11B); depth-aware; curated (short/deep), never a raw article dump.
        if (lang === 'en' && kConf.level !== 'LOW') {
          const m = semanticMatch(aText, KB_SEED)[0];
          if (m && m.confidence === 'HIGH') {
            kbAnswer = (depth === 'DEEP' && m.item.deepAnswer) ? m.item.deepAnswer : m.item.shortAnswer;
          }
        }
      }

      // ── PHASE 11A.3: confidence-driven behavior ───────────────────────────
      // LOW (future prediction) → honest "no one can predict this" lead, then educate.
      if (kConf.level === 'LOW' && !directAnswer) p10Lead = lowConfidencePreface(lang);
      // Recovery/psychology underlying-need → ensure a supportive mentor lead.
      else if (uNeed.found && !directAnswer && !p10Lead && ['recovery', 'why-losing', 'psychology', 'discipline'].includes(uNeed.need)) {
        p10Lead = emotionalLead({ emotionalTone: 'frustrated' }, lang);
      }
      // Contradiction guard for market answers when independent signals disagree.
      if (p10MarketDump && !directAnswer) {
        const cc = detectContradiction({ changePct: marketData?.gold?.changePct, regimeLabel: marketData?.marketRegime?.label, patternBias: patternData?.bias });
        if (cc.conflict) p10Contradiction = balancedNote(lang);
      }
    }
  }

  if (clarifyAnswer) {
    answer = clarifyAnswer;
  } else if (directAnswer) {
    answer = directAnswer;
  } else if (kbAnswer) {
    // PHASE 11A.4: KB-grounded answer (curated, depth-aware) + mentor lead + 1 follow-up.
    answer = compress(kbAnswer, p10Depth) + '\n\n_⚠️ Educational only — not financial advice._';
    if (p10Lead)      answer = p10Lead + '\n\n' + answer;
    if (p10Followups) answer = answer + p10Followups;
  } else {
    try {
      answer = generateResponse({
        text:        genText,
        lang,
        mode:        p10Mode,
        prevAnswer:  lastAssistantMsg,
        intent:      p10Intent,
        confidence:  cls.confidence,
        facts:       cls.facts,
        platform:    cls.platform,
        broker:      cls.broker,
        newsFocus:   cls.newsFocus,
        marketData,
        patternData,
        memoryData,
        memoryContext,
        recentRecap,
        knowledgeEntries,
        calendarData,
        newsData,
        geo,
        traderContext: mergedTraderContext,
        chartAnalysis,
        isFirstMessage: messages.filter(m => m.role === 'user').length <= 1,
      });
    } catch (err) {
      answer = (env.DEBUG === 'true')
        ? `Engine error: ${err.message}`
        : 'Sorry, I had trouble composing that answer. Please rephrase, or ask about Gold/BTC context, a trade assessment, brokers, or trading psychology.';
    }
    if (p10Prefix)        answer = p10Prefix + answer;       // multi-question: lead status line
    answer = compress(answer, p10Depth);                     // Phase 10.5: de-duplicate / tighten
    if (p10Contradiction) answer = answer + p10Contradiction; // 11A.3: balanced note on mixed signals
    if (p10Lead)          answer = p10Lead + '\n\n' + answer; // 11A.2/11A.3: mentor / no-certainty lead
    if (p10Followups)     answer = answer + p10Followups;    // ≤1 natural follow-up
  }

  // ── PHASE 8: RESPONSE ORCHESTRATOR — Memory → Articles → Broker → Pattern ──
  // Weave the Knowledge Base layer around the engine answer (which already holds
  // live-market context). Fully graceful: no-ops when Supabase is unconfigured,
  // skipped for uploaded-chart turns, and English knowledge bodies are injected
  // ONLY for English so the Language Lock is never violated (localized memory
  // recall is safe in any language). Raw memory rows are never exposed.
  if (aiSbConfigured(env) && !chartAnalysis && !directAnswer && !clarifyAnswer && !kbAnswer && allowKnowledge) {
    try {
      const kl = await buildKnowledgeLayer(env, {
        intent:  p10Intent,
        text:    genText,
        lang,
        profile: memoryData?.profile || null,
      });
      if (kl) {
        let head = '';
        if (kl.recall)                 head += kl.recall + '\n\n';   // 1) memory (localized)
        if (lang === 'en' && kl.prepend) head += kl.prepend + '\n\n'; // 2-3) articles + broker
        if (head) answer = head + answer;
        if (lang === 'en' && kl.append) answer = answer + kl.append;  // 4) pattern vault
      }
    } catch { /* knowledge layer is additive; never blocks the reply */ }
  }

  // ── MODULES 1 & 4: persist device profile + scores (background, server-side) ─
  // Service key stays in ai-supabase.js; never exposed to the client. No-ops
  // entirely until the ZTU Chatbot AI Supabase credentials are configured.
  if (userId && aiSbConfigured(env)) {
    const wk = detectWeaknesses(mergedTraderContext, [], lastUserMsg);
    const st = detectStrengths(mergedTraderContext, [], lastUserMsg);
    waitUntil(Promise.allSettled([
      upsertProfile(env, userId, {
        preferred_language: lang,
        trader_level:       mergedTraderContext?.level || null,
        trader_type:        mergedTraderContext?.type || null,
        conversation_count: mergedTraderContext?.conversations ?? null,
        weaknesses:         wk.weaknesses.map(w => w.label).slice(0, 5),
        strengths:          st.strengths.slice(0, 5),
      }),
      updateScores(env, userId, {
        discipline_score: mergedTraderContext?.discipline,
        patience_score:   mergedTraderContext?.patience,
        confidence_score: mergedTraderContext?.confidence,
      }),
    ]));
  }

  // ── STREAM the answer as SSE (preserves the existing typing animation) ─────
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    try {
      // Chunk by words so the frontend renders progressively (same {t} protocol)
      const tokens = String(answer).match(/\S+\s*/g) || [String(answer)];
      let batch = '';
      let i = 0;
      for (const tok of tokens) {
        batch += tok;
        i++;
        // flush every ~3 tokens for a smooth, fast typing feel
        if (i % 3 === 0) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ t: batch })}\n\n`));
          batch = '';
          await new Promise(r => setTimeout(r, 10));
        }
      }
      if (batch) await writer.write(encoder.encode(`data: ${JSON.stringify({ t: batch })}\n\n`));
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch {
      try { await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`)); } catch {}
    } finally {
      try { await writer.close(); } catch {}
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}
