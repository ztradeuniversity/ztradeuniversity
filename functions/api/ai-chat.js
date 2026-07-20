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
import { isConfigured as aiSbConfigured, upsertProfile, updateScores, insertResponseLog } from '../utils/ai-supabase.js';
import { detectStrengths, detectWeaknesses } from '../utils/trader-intelligence.js';
import { buildKnowledgeLayer } from '../utils/knowledge-orchestrator.js';
import { resolveTier, readGuestCount, buildGuestCookie } from '../utils/identity-session.js';
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
import { retrieveBest, nextStepInvite, suggestQuestions, setScorer } from '../utils/graph-retrieval.js';
import { scoreEntry } from '../utils/semantic-retrieval.js';
import { makeBoostedScorer } from '../utils/retrieval-boost.js';
import { makeLexiconScorer } from '../utils/retrieval-lexicon.js';
import { makeMacroScorer } from '../utils/macro-lexicon.js';
import { detectQuestionForm } from '../utils/intent-form.js';
import { searchArticles } from '../utils/article-knowledge.js';
import { logMissingKnowledge, graphActive } from '../utils/kb-store.js';
import { composeAnswer, setComposer } from '../utils/composer.js';
import { llmConfigured, makeLLMComposer, generateEducationalAnswer } from '../utils/composer-llm.js';
import { optimizeAnswer, optimizeChips, wantsDetail } from '../utils/response-optimizer.js';
import { recallLearned, learnFromAnswer } from '../utils/llm-learn.js';
import { sourceBadge, SOURCE_STAGES, logSourceValue } from '../utils/answer-source.js';
import { wrapConversational } from '../utils/conversational-wrapper.js';
import { buildSafeReply } from '../utils/safe-reply.js';
import { TELEGRAM, WHATSAPP } from '../utils/response-engine.js';
import { detectCalcRequest, runCalculator } from '../utils/trade-calculators.js';
import { marketDecisionInstrument, livePriceInstrument, priceUnavailable, buildMarketContext } from '../utils/market-context.js';
import { detectMarketWhy, buildWhyExplanation, detectBroadDecision, genericDecisionAnalysis } from '../utils/market-explain.js';
import { detectInstrumentQuery, buildInstrumentAnalysis } from '../utils/market-coverage.js';
import { marketAwareness } from '../utils/awareness-router.js';
import { recommendGuidance, complimentLine } from '../utils/guidance-recommender.js';
import { relevanceEngine, enforceRelevance, applyEntityFilter } from '../utils/relevance-engine.js';
import { decideMentorAction, detectLearnerState, getMentorPrefix, buildMentorDecision, buildProactiveGuidance } from '../utils/mentor-brain.js';
import { buildSessionMemory, formatSessionRecall } from '../utils/session-memory.js';
import { recoverMessage } from '../utils/recovery-engine.js';
import { buildMentorJourney, progressRecall, studyContinuation } from '../utils/mentor-journey.js';
import { selectTeachingStyle, teachingLead, teachingTail } from '../utils/teaching-style.js';
import { interpretIndirect, needContextLine } from '../utils/dialogue-understanding.js';
import { detectEmotion, readBetweenLines, emotionLead, betweenLinesLead } from '../utils/emotion-layer.js';
import { detectLearningStyle, learningStyleNote } from '../utils/learning-style.js';
import { buildSuggestionChips } from '../utils/suggestion-chips.js';
import { detectUnsupportedScript, unknownLanguageReply, PARTIAL_LANGS, partialLanguageNote, localizeFinalAnswer } from '../utils/language-intel.js';
import { normalizeSlang } from '../utils/slang-normalizer.js';
import { buildContextActions } from '../utils/concept-actions.js';
import { detectExplanationRequest, explanationLead } from '../utils/explanation-engine.js';
import { buildRelationshipRecall } from '../utils/relationship-recall.js';
import { detectConversationMove, conversationLead } from '../utils/conversation-flow.js';
import { normalizeMultilang, refineLanguage } from '../utils/lang-assist.js';
import { detectLearningSpeed, adaptiveStance, smartRecommendation } from '../utils/adaptive-mentor.js';
import { fallbackPathChips } from '../utils/journey-flow.js';
import { requireAdminModule } from '../utils/admin-session.js';
import { getSetting } from '../utils/site-settings.js';
import { buildConversationalReply, CONVERSATIONAL_INTENTS } from '../utils/conversation-intelligence.js';

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

// ── EXECUTION CONTEXT (Chatbot Checker one-click source testing) ─────────────
// A single, additive, default-safe configuration layer the EXISTING routing
// decisions read via `ctx.<source>` checks — the routing logic itself (the
// if/else priority chain below) is completely unchanged; each check only adds
// `&& ctx.<source>` to an already-existing condition, so when every flag is true
// (the only possible state for a real visitor, and the default for an admin call
// too) the pipeline is byte-for-byte identical to before this layer existed.
//
// Only 3 of the 5 documented sources (database/graph/openai) are wired to a gate.
// 'live' and 'calc' are intentionally left partially/un-wired at a few call sites
// (documented inline at each one) where the source-producing code is a branch of
// a broader intent/depth cognitive-reasoning if/else-if chain rather than an
// independent "try this source, else fall through" block — forcing a gate there
// would change WHICH REASONING BRANCH executes, not just which source answers,
// and that could not be verified safely without live execution in this
// environment. Per instruction: implement the infrastructure, leave the
// unverifiable switches at their safe (always-on) default rather than risk an
// unverified behavior change to a production chatbot.
// Three layers, each optional, each safely defaulting to "on":
//   1. Hardcoded defaults — always {all: true} — the ultimate fail-safe.
//   2. Persisted Production Routing config (site_settings key 'chatbot_routing',
//      admin-configurable via Chatbot Checker, affects EVERY real visitor) — only
//      applied when a real object was actually read (any fetch failure/timeout/
//      unconfigured Supabase falls through to layer 1, never breaks live chat).
//   3. Per-request admin-diagnostic override (sourceFlags in the request body) —
//      ONLY honored for an authenticated admin-diagnostic call, and ONLY for that
//      one test call — never persisted, never affects other visitors.
function buildExecutionContext(persistedRouting, body, isAdminDiagnostic) {
  const ctx = { database: true, graph: true, live: true, calc: true, openai: true };
  if (persistedRouting && typeof persistedRouting === 'object') {
    for (const k of Object.keys(ctx)) {
      if (persistedRouting[k] === false) ctx[k] = false;
    }
  }
  if (isAdminDiagnostic && body && body.sourceFlags && typeof body.sourceFlags === 'object') {
    for (const k of Object.keys(ctx)) {
      ctx[k] = body.sourceFlags[k] !== false;
    }
  }
  return ctx;
}

// ── LIVE-DATA QUERY DETECTION (Live Market Freshness task) ───────────────────
// A single, reusable, PURE signal for "this question needs a CURRENT price/
// movement answer" — built entirely from the SAME detector functions the live
// blocks already use elsewhere in this file (no new classification logic, no
// new keyword list, no I/O). MARKET_DUMP_INTENTS (gold/btc/macro/brief/mood/
// events/session) alone misses generic instrument phrasing that classifies as
// 'fallback' — e.g. "what is EURUSD doing", "gold high and low today" — which
// could otherwise fall through to a stale database article or knowledge-graph
// concept and present old figures as current. Callers additionally OR this with
// `MARKET_DUMP_INTENTS.has(p10Intent)` (that set isn't in module scope here).
function isLiveMarketQuery(text) {
  try {
    return !!marketDecisionInstrument(text) || !!livePriceInstrument(text)
      || !!detectInstrumentQuery(text) || !!(detectMarketWhy(text) && detectMarketWhy(text).topic)
      || !!detectBroadDecision(text);
  } catch { return false; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const waitUntil = (p) => { try { context.waitUntil?.(p); } catch {} };   // background persistence

  // NOTE (Phase 1 routing fix): the generative composer used to be registered here,
  // unconditionally whenever a model was bound — meaning it could rewrite every
  // reply through the LLM even when the admin's "OpenAI" routing toggle was OFF.
  // It is now registered further below, gated on ctx.openai, once the persisted
  // routing config has been read — see "ACTIVATION: register the GROUNDED
  // generative composer" near the ctx build. This is the single OpenAI-provider
  // switch the Content Intelligence Center controls; it must not be bypassable.

  // ── ACTIVATION: boost lexical paraphrase matching when true embeddings aren't
  // enabled — wraps the existing scorer to also try a canonical-expanded query and
  // keep the HIGHER score (never reduces a match, HIGH gate + hallucination safety
  // intact). When KB_EMBEDDINGS_ENABLED='true', retrieve() uses the hybrid vector
  // scorer instead and this is ignored. Additive + dormant-compatible.
  // The lexicon scorer adds the new hot-search synonym clusters (indicators/crypto/
  // strategy/platforms/beginner) on top of the boost — replicating scoreEntry's
  // EXACT formula + HIGH gate, taking max() so it never lowers a score. (When
  // KB_EMBEDDINGS_ENABLED='true', retrieve() uses the hybrid vector scorer instead.)
  // Always install the lexicon scorer as a LEXICAL FLOOR — even with embeddings on, so
  // proven exact/cluster matches (e.g. "liquidity grab"→liquidity-sweep) are never lost
  // if vectors are missing/incomplete. retrieve() blends max(hybrid, lexicon). Additive.
  // PRODUCTION UPGRADE — macro-acronym (GDP/PMI/ISM/ADP/ECB/FED/NFP/CPI/BOS…) +
  // cross-asset ticker synonym (gold/XAUUSD, silver/XAGUSD, bitcoin/BTC,
  // ethereum/ETH) layer on top of the lexicon scorer. Additive, never lowers a score.
  try { setScorer(makeMacroScorer(makeLexiconScorer(scoreEntry))); } catch {}

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
  const uiLang      = (typeof body?.uiLang === 'string' && body.uiLang.length <= 8) ? body.uiLang : null;   // PART 2: explicit UI language selection
  const traderContext = (body?.traderContext && typeof body.traderContext === 'object') ? body.traderContext : null; // Memory V2
  const chartAnalysis = (body?.chartAnalysis && typeof body.chartAnalysis === 'object') ? body.chartAnalysis : null; // Chart Vision
  // ADMIN DEBUG MODE: client opt-in flag (or server-forced via AI_DEBUG) → the source
  // event carries which stage answered + the full Database→Graph→Live→OpenAI→Safe chain.
  const debugMode   = body?.debug === true || env.AI_DEBUG === 'true';
  const _logT0      = Date.now();   // ANALYTICS: response-time baseline for ai_response_logs
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

  // routingRes (4th) — the persisted Production Routing config (Chatbot Checker),
  // fetched here so its Supabase read runs CONCURRENTLY with market/memory/
  // pattern, adding zero extra sequential latency to a real chat request. Used
  // further below once isAdminDiagnostic is known (see buildExecutionContext).
  const [marketRes, memoryRes, patternRes, routingRes] = await Promise.allSettled([
    fetch(`${baseUrl}/api/sentiment`,  { signal: AbortSignal.timeout(3000) }),
    userId ? fetch(`${baseUrl}/api/ai-memory?userId=${encodeURIComponent(userId)}`, { signal: AbortSignal.timeout(2500) }) : Promise.resolve(null),
    fetch(`${baseUrl}/api/ai-patterns`, { signal: AbortSignal.timeout(3000) }),
    getSetting(env, 'chatbot_routing', null),
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

  // ── PHASE 14: CONVERSATION RECOVERY — normalize typos, fragments, incomplete messages.
  // Applied before followup/lang detection so classification sees cleaned text.
  // lastUserMsg is preserved for followup + language detection (not modified).
  const _recovery = recoverMessage(lastUserMsg, messages);

  const sessionLang = (typeof body?.sessionLang === 'string') ? body.sessionLang : null;  // language persistence
  const followup    = classifyFollowup(lastUserMsg);
  const detLang     = detectLanguage(lastUserMsg);

  // ── CONVERSATION CONTEXT ENGINE: resolve the effective question + transform mode
  // Use recovered text for initial classification; original lastUserMsg for followup/lang detection.
  let genText = _recovery.text;
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
    cls = classifyIntent(_recovery.text);
  }

  // ── PHASE 16: DEEP QUESTION UNDERSTANDING — indirect / hypothetical follow-ups ──
  // Additive layer between Phase 11A.1 (pronoun→instrument) and Phase 14 recovery
  // (typos/fragments): catches "and if gold goes up?", "what would you do?",
  // "is that good or bad?" — enriches the analysis text with the active topic +
  // scenario and re-classifies so the mentor answers in context (multi-turn
  // continuity, STEP 7) instead of restarting. Narrowly guarded → no effect on
  // normal messages; skipped entirely for explicit follow-up transforms.
  let _needContext = false;
  if (!followup) {
    const _interp = interpretIndirect({ text: _recovery.text, lastAssistant: lastAssistantMsg, messages });
    if (_interp.changed) { genText = _interp.enrichedText; cls = classifyIntent(genText); }
    else if (_interp.kind === 'needs-context') { _needContext = true; }
  }

  // ── PHASE 22: INTENT V2 — trading-slang normalization. Additive, conservative:
  // only re-routes when slang actually changed the text AND the current intent is
  // weak (fallback/technical/knowledge), so clear intents are never overridden.
  // Reuses the recovery + indirect understanding above; only the analysis text is
  // normalized (never the words shown to the user).
  if (!followup) {
    const _slang = normalizeSlang(genText);
    if (_slang.changed && ['fallback', 'technical', 'knowledge'].includes(cls.intent)) {
      genText = _slang.text;
      cls = classifyIntent(genText);
    }
  }

  // ── PHASE 28: MULTI-LANGUAGE ASSIST — expand "B/E" (breakeven) + Roman-Urdu
  // trading vocab (khareedna→buy, bechna→sell, nuksan→loss…) so mixed / broken-
  // grammar messages classify to the right intent. ONLY the analysis text is
  // normalized; the reply LANGUAGE stays whatever the Language Lock chose. Additive:
  // re-classifies weak intents only, never overrides a clear one.
  if (!followup) {
    const _ml = normalizeMultilang(genText);
    if (_ml.changed && ['fallback', 'technical', 'knowledge'].includes(cls.intent)) {
      genText = _ml.text;
      cls = classifyIntent(genText);
    }
  }

  // ── PHASE 20: MULTI-LANGUAGE — detect a genuinely UNSUPPORTED language/script
  // (Chinese/Russian/Hindi/…) so we reply politely with the languages we DO speak
  // instead of answering in English (STEP 7). High-precision; reuses the existing
  // Language Lock for everything it already handles.
  const _unsupported = detectUnsupportedScript(lastUserMsg);

  // ── LANGUAGE SWITCH + PERSISTENCE: pick the effective reply language
  const SUPPORTED = ['en', 'ur', 'ur-roman', 'ar', 'id', 'ms', 'vi', 'bn', 'th'];
  let lang;
  if (followup && followup.mode === 'lang')                  lang = followup.lang;   // explicit switch
  else if (detLang !== 'en')                                 lang = detLang;          // typed in a non-English script
  else if (uiLang && SUPPORTED.includes(uiLang))             lang = uiLang;           // PART 2: UI selection is authoritative over a STALE sessionLang
  else if (sessionLang && SUPPORTED.includes(sessionLang))   lang = sessionLang;      // persisted language
  else                                                       lang = 'en';

  // ── PHASE 28: MULTI-LANGUAGE — when the Language Lock defaulted to English but the
  // message clearly carries Roman-Urdu trading phrasing the ≥2-marker detector missed
  // (short/mixed, e.g. "gold buy karun?" / "stop loss kitna hona chahiye"), upgrade to
  // Roman Urdu so the reply matches. Additive: only acts on an English default; never
  // overrides an explicit switch or a non-English detection.
  if (lang === 'en' && !(followup && followup.mode === 'lang')) {
    lang = refineLanguage(lastUserMsg, 'en');
  }

  // Chart Vision: an uploaded-chart analysis forces the chart intent
  if (chartAnalysis) cls.intent = 'chart';

  // ── IDENTITY-BASED ACCESS GATING — SINGLE SOURCE OF TRUTH = LIBRARY PIPELINE ──
  // Tier comes from the signed identity session, which is minted ONLY after the
  // existing Library OTP flow succeeds (/api/ai-access → /api/library-auth →
  // EA broker_accounts). tier==='unlimited' ⇒ verified Library user ⇒ no limit.
  //
  // Everyone else is a guest: exactly AI_VISITOR_MESSAGE_LIMIT (default 5) free
  // messages, counted in a stateless HMAC-signed cookie (NO AI Supabase, NO
  // profile table, NO is_verified flag, NO second membership system). On the
  // (limit+1)-th message we block BEFORE any AI work and return the localized
  // limit-reached card, which the client renders + opens the existing modal.
  const { tier } = await resolveTier(env, identityToken);
  const visitorLimit = parseInt(env.AI_VISITOR_MESSAGE_LIMIT ?? '5', 10) || 5;
  // ADMIN DIAGNOSTIC BYPASS (Chatbot Checker) — the Content Center's Chatbot
  // Checker calls this exact endpoint to diagnose real answers; it must never be
  // blocked by the visitor guest-message limit, which exists to gate REAL public
  // usage, not an internal admin diagnostic. Reuses the SAME admin-session check
  // ai-articles.js/ai-kb-admin.js already gate on (Bearer admin session for
  // module 'articles'/'kb', or the legacy x-admin-key) — no new auth system.
  const isAdminDiagnostic = await requireAdminModule(env, request, ['articles', 'kb'], { header: 'x-admin-key', value: env.AI_ADMIN_KEY }).catch(() => false);
  // EXECUTION CONTEXT (Chatbot Checker source ON/OFF testing) — a small, additive,
  // default-safe configuration layer the EXISTING routing decisions below read.
  // Every flag defaults to true, so with no override (every real visitor, and any
  // admin call that doesn't pass sourceFlags) the pipeline is byte-for-byte
  // identical to before this layer existed. Only an authenticated admin-diagnostic
  // request may set a flag to false, and it only ever narrows behavior (skips an
  // existing "try this source" block, exactly like the existing not-found case
  // already does) — it never adds new behavior. See buildExecutionContext().
  // persistedRouting was fetched concurrently with market/memory/pattern data
  // above (routingRes) — reading it here, after that Promise.allSettled already
  // resolved, adds zero extra latency to this request.
  const persistedRouting = routingRes.status === 'fulfilled' ? routingRes.value : null;
  const ctx = buildExecutionContext(persistedRouting, body, isAdminDiagnostic);

  // ── ACTIVATION: register the GROUNDED generative composer when a model is bound
  // (Cloudflare Workers AI env.AI, or an OpenAI-compatible LLM_ENDPOINT) AND the
  // admin's "OpenAI" routing switch (ctx.openai) is on. The graph stays the source
  // of truth — the LLM only rewrites the already-grounded draft into human prose
  // (English-only; non-English keeps the localized template). Gated on ctx.openai
  // so the Content Intelligence Center's routing toggle is the single, honest
  // source of truth for whether any LLM touches a reply — disabling "OpenAI" now
  // really means no LLM involvement, not just "no fresh generation." If unbound,
  // disabled, or the call fails, composer.js falls back to the rule assembler.
  if (ctx.openai && llmConfigured(env)) { try { setComposer(makeLLMComposer(env)); } catch {} }

  let guestSetCookie = null;
  if (tier !== 'unlimited' && !isAdminDiagnostic) {
    const used = await readGuestCount(env, request);
    if (used >= visitorLimit) {
      // 6th message → block. Do not call the AI; do not increment further.
      return new Response(JSON.stringify(limitReachedPayload(env, lang)), { status: 200, headers: JSON_HEADERS });
    }
    // Allowed (messages 1..limit): record this use on the response cookie.
    guestSetCookie = await buildGuestCookie(env, used + 1);
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
  const NO_CONDENSE = new Set(['aboutme', 'profileinfo', 'career', 'assess', 'lotsize', 'selfassess', 'signal', 'setcountry', 'offtopic', 'greeting', 'broker', 'funding', 'islamic', 'smalltalk', 'journal']);
  let p10Intent      = cls.intent;
  let p10Mode        = mode;
  let p10MarketDump  = true;
  let p10Followups   = '';
  let p10Prefix      = '';
  let p10Depth       = 'STANDARD';
  let allowKnowledge = true;
  let directAnswer    = null;
  let directSource    = null;        // SOURCE BADGE: which layer set directAnswer ('live'/'calc'/'safe')
  let answerSource    = 'safe';      // SOURCE BADGE: final retrieval layer that produced the reply
  let answerConfidence = null;       // ANALYTICS: retrieval confidence for ai_response_logs
  let answerGraphNodeId = null;      // ANALYTICS: graph concept id when the graph layer answered
  let answerArticleId = null;        // ANALYTICS: article id when an article was surfaced
  let clarifyAnswer   = null;
  let p10Lead         = '';
  let p10Contradiction = '';
  let kbAnswer        = null;
  let p10GuideAppend  = '';
  let p10Level        = 'beginner';  // Phase 4: detected experience level (mentor adaptation)
  let p10KbCat        = null;        // Phase 5: matched concept category (article recommendation)
  let rel             = null;        // Phase 11C.0B relevance frame (no-drift)
  let p10Related      = [];          // Phase 19: answered concept's related/next topics (chip source)
  let p10ConceptTitle = '';          // Phase 23/24: answered concept identity + capabilities (context menu)
  let p10HasExample   = false;
  let p10HasMistakes  = false;
  let p10HasDeep      = false;
  let p10NextStepTopic = '';
  // ── PHASE 14: MENTOR BRAIN state (populated inside Phase 10.5 block below) ──
  let sessionMem      = {};
  let learnerState    = 'New Student';
  let mentorAction    = 'StaySilent';
  if (!followup && !chartAnalysis) {
    // ── PHASE 11A.1: CONVERSATION INTELLIGENCE — resolve "it/that/improve" to the
    // active instrument from the thread (or the saved favorite) before classifying.
    const convState = buildConversationState(messages);
    const resolved  = resolveReferences(genText, convState, memoryData?.profile);
    const aText     = resolved.text;                                  // analysis-only text (carries context)
    const aCls      = resolved.changed ? classifyIntent(aText) : cls; // re-classify if context was carried

    const cognition  = analyzeCognition(aText, { memoryData, traderContext: mergedTraderContext });
    const confidence = assessConfidence(aText, cognition, lang);
    // FIX: a greeting / small-talk ("hi", "hello") is scored high-ambiguity by the
    // cognition layer, which previously routed it to the clarify menu instead of a
    // warm greeting. Greetings & small-talk must never be clarified — let them fall
    // through to their proper reply. (Additive guard; genuine ambiguous asks still clarify.)
    const _isGreet = ['greeting', 'smalltalk'].includes(aCls.intent);
    // FIX (news-timing bug): concrete market-data intents (events/news, brief,
    // gold, btc, macro, mood, session) have deterministic handlers that ALWAYS
    // return a real answer — buildEvents() renders the live economic calendar in
    // the user's own timezone with Gold/USD/BTC impact. A short query like
    // "today news timing" was being intercepted by the clarification menu and
    // answered with a generic "what would you like to focus on?" instead. These
    // intents must never be clarified — let them flow to their handler.
    const _isData = MARKET_DUMP_INTENTS.has(aCls.intent);
    if (confidence.requiresClarification && !_isGreet && !_isData) {
      clarifyAnswer = confidence.clarificationQuestion;            // one short question, no long answer
    } else {
      const analysis = cognition._qa;
      const plan     = planIntent(analysis, aCls);
      const depth    = decideDepth(aText, cognition);
      // PHASE 4 — AI PERSONAL MENTOR: detect experience level so explanations adapt
      // (beginners get the concise canonical, advanced get the deep body + harder follow-ups).
      p10Level = cognition.userLevel || mergedTraderContext?.level || 'beginner';
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
      if (uNeed.found && ['fallback', 'technical', 'knowledge', 'strategy'].includes(p10Intent)) {
        p10Intent = uNeed.intent;   // trader-problem overrides a mis-matched strategy/knowledge intent
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
      answerConfidence = kConf.level || null;   // ANALYTICS: baseline confidence (kb match overrides below)
      const retrieval = planRetrieval(kctx, kConf);
      allowKnowledge  = allowKnowledge && (retrieval.article || retrieval.pattern);
      // ── PHASE 11C.0B: relevance frame — decides what may / may not appear.
      rel = relevanceEngine(aText, { intent: p10Intent, category: analysis.category, statusInstrument: analysis.statusInstrument });

      if (kConf.level === 'UNKNOWN') {
        // Never invent facts we can't verify (e.g., unknown broker regulation).
        directAnswer = unknownResponse(lang); directSource = 'safe';
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
        // NOT gated by ctx.live (unlike the other 4 live-source blocks below):
        // this is one branch of a mutually-exclusive intent/depth reasoning
        // if/else-if chain (see kConf.level==='UNKNOWN' / analysis.multi / this /
        // !plan.marketDump above and below) — disabling it would make control
        // fall into the SIBLING branch (`!plan.marketDump`, a completely
        // different CTA/follow-up reasoning path), not simply "skip live, try
        // the next source." That's a different behavior change than source
        // testing intends, and isn't verifiable without live execution, so it's
        // deliberately left out of the execution-context gating.
        directAnswer = shortStatusAnswer({ ...analysis, suggestedFollowups: [] }, marketData, lang, singleFollowup(cognition, lang)); directSource = 'live';
      } else if (!plan.marketDump) {
        // CTA intelligence: intents whose body already invites the user (or are
        // pure conversation) get NO extra offer — the Composer enforces a single
        // forward line; otherwise one natural, non-menu follow-up.
        const SELF_INVITE = new Set(['smalltalk', 'greeting', 'assess', 'lotsize', 'chart', 'signal', 'setcountry', 'offtopic']);
        // ── PHASE 11B.4: TRADER-PROBLEM → natural Trader Self-Assessment guidance
        // (statement, blended into the body so it isn't dropped as a forward offer).
        const guide = recommendGuidance({ intent: p10Intent, lang });
        if (guide) { p10GuideAppend = guide; p10Followups = ''; }
        else p10Followups = SELF_INVITE.has(p10Intent) ? '' : singleFollowup(cognition, lang);
        // ── PHASE 11A.2: emotional adaptation — calm/supportive lead when warranted.
        if (p10Intent !== 'smalltalk' && p10Intent !== 'greeting') p10Lead = emotionalLead(cognition, lang, aText);
        // ── PHASE 11B.4: respectful dua for Muslim users (Islamic-finance only; no spam).
        if (p10Intent === 'islamic') p10Lead = complimentLine('islamic', lang);
        // ── PHASE 11A.4: SEMANTIC RETRIEVAL — answer from the KB by meaning when a
        // high-confidence match exists. English-only for now (localized KB lands in
        // 11B); depth-aware; curated (short/deep), never a raw article dump.
        // FRESHNESS GUARD (Live Market Freshness task): this branch already never
        // runs for the named live intents (they take the sibling `plan.marketDump`
        // branch above). isLiveMarketQuery additionally excludes generic
        // instrument phrasing ("what is EURUSD doing") that classifies as
        // 'fallback' — the Knowledge Graph must never answer a current-price
        // question with an educational concept masquerading as live data.
        if (lang === 'en' && kConf.level !== 'LOW' && ctx.graph && !isLiveMarketQuery(aText)) {
          const m = await retrieveBest(env, aText, { lang, category: analysis.category });   // graph-backed when enabled, else KB_SEED; category narrows candidates at scale
          // Phase 11C.0B: only use a KB hit that passes relevance (no topic drift).
          if (m && m.confidence === 'HIGH' && enforceRelevance({ category: m.item.category, concepts: m.item.concepts, relevanceTags: m.item.relevanceTags }, rel)) {
            // PHASE 4 — level-adaptive depth: advanced (or DEEP intent) → deep body;
            // beginners always get the concise canonical so they are not overwhelmed.
            const wantDeep = (depth === 'DEEP' || p10Level === 'advanced') && p10Level !== 'beginner';
            kbAnswer = (wantDeep && m.item.deepAnswer) ? m.item.deepAnswer : m.item.shortAnswer;
            answerConfidence  = m.confidence || answerConfidence;   // ANALYTICS: kb match confidence (HIGH)
            answerGraphNodeId = m.item.id || null;                  // ANALYTICS: graph concept id used
            p10KbCat = m.item.category || null;   // Phase 5: drive article recommendation
            p10Related = [...(m.item.related || []), ...(m.item.nextSteps || [])];   // Phase 19: chip source
            // Phase 23/24: capture the concept's identity + which actions it can offer (graph-gated).
            p10ConceptTitle  = m.item.subcategory || m.item.topic || m.item.id || '';
            p10HasExample    = !!m.item.marketContext;
            p10HasMistakes   = !!(m.item.commonMistakes && m.item.commonMistakes.length);
            p10HasDeep       = !!m.item.deepAnswer;
            p10NextStepTopic = (m.item.nextSteps && m.item.nextSteps[0]) || (m.item.related && m.item.related[0]) || '';
            // PHASE 7 — AI DECISION COACH: a 5-part reply, every part drawn from the
            // concept's OWN graph data (never hardcoded). 1) Direct (above) · 2) Common
            // beginner error (commonMistakes) · 3) Professional insight (misconceptions)
            // · 4) Risk warning (riskNote) · 5) Next step (graph follow-up, set below).
            // PHASE 8 — RESEARCH COACH: + Real Market Context (concept.marketContext).
            const _mistake = (m.item.commonMistakes && m.item.commonMistakes[0]) || '';
            const _insight = (m.item.misconceptions && m.item.misconceptions[0]) || '';
            const _risk    = m.item.riskNote || '';
            const _context = m.item.marketContext || '';
            let _coach = '';
            if (_mistake) _coach += `\n\n⚠️ **Common beginner mistake:** ${_mistake}`;
            if (_insight) _coach += `\n\n🎯 **Professional insight:** ${_insight}`;
            if (_risk)    _coach += `\n\n🛡️ **Risk warning:** ${_risk}`;
            if (_context) _coach += `\n\n📊 **Real market context:** ${_context}`;
            if (_coach) kbAnswer += _coach;
            // HUMAN BEHAVIOUR LAYER: guide the user onward — surface the concept's graph
            // next-steps as ONE natural mentor invite (overrides the generic follow-up).
            const invite = nextStepInvite(m.followups, m.item);
            if (invite) p10Followups = invite;
          }
        }
      }

      // ── PHASE 11A.3: confidence-driven behavior ───────────────────────────
      // LOW (future prediction) → honest "no one can predict this" lead, then educate.
      if (kConf.level === 'LOW' && !directAnswer) p10Lead = lowConfidencePreface(lang);
      // Recovery/psychology underlying-need → ensure a supportive mentor lead.
      else if (uNeed.found && !directAnswer && !p10Lead && ['recovery', 'why-losing', 'psychology', 'discipline'].includes(uNeed.need)) {
        p10Lead = emotionalLead({ emotionalTone: 'frustrated' }, lang, aText);
      }
      // Contradiction guard for market answers when independent signals disagree.
      if (p10MarketDump && !directAnswer) {
        const cc = detectContradiction({ changePct: marketData?.gold?.changePct, regimeLabel: marketData?.marketRegime?.label, patternBias: patternData?.bias });
        if (cc.conflict) p10Contradiction = balancedNote(lang);
      }

      // ── PHASE 17: HUMAN MENTOR EMOTION LAYER — gentle, non-therapist tone. Catches
      // the emotional states the keyword detector scores as neutral (overconfidence,
      // impatience, disappointment, burnout, confusion, fear) and the "reading
      // between the lines" defeat cues ("nothing is working" / "maybe trading isn't
      // for me"), then leads with ONE calm acknowledgment that redirects to the
      // PROCESS — never dramatic, always a trading mentor. Runs BEFORE the mentor-
      // brain prefix so a real emotional cue takes precedence over a generic teach
      // lead, and stays additive by only filling an EMPTY lead (Phase 11's explicit
      // frustrated/anxious leads already set it keep priority). Silent on non-
      // emotional turns (STEP 6); varied phrasing avoids repetition (STEP 7). Market/
      // operational intents are skipped.
      if (!p10Lead && !MARKET_DUMP_INTENTS.has(p10Intent) &&
          !['signal', 'chart', 'setcountry', 'lotsize', 'smalltalk', 'greeting', 'offtopic'].includes(p10Intent)) {
        const _btl = readBetweenLines(aText);
        if (_btl.defeated) {
          p10Lead = betweenLinesLead(_btl, lang, aText);
        } else {
          const _emo = detectEmotion(aText, { cognition, profile: memoryData?.profile });
          if (_emo.state !== 'neutral') p10Lead = emotionLead(_emo.state, { lang, seed: aText });
        }
      }

      // ── PHASE 27: DEEP CONVERSATION FLOW — in a long thread, acknowledge the
      // conversational MOVE (repair "no, not that" / rejection "I tried that" /
      // affirmation "that's exactly my problem" / caveat "yes but not always" /
      // continuation "but I failed") so the conversation is repaired/continued, not
      // restarted (STEP 1/3/5). Reference resolution is already done by Phase 16
      // (interpretIndirect) + Phase 11 (conversation-state); this only adds the human
      // acknowledgment. Additive: fills an empty lead only (emotion keeps priority),
      // and stays silent on non-move turns (STEP 6). Skipped for the first message.
      if (!p10Lead && !MARKET_DUMP_INTENTS.has(p10Intent) && lastAssistantMsg &&
          !['signal', 'chart', 'setcountry', 'lotsize', 'greeting'].includes(p10Intent)) {
        const _move = detectConversationMove(lastUserMsg);
        if (_move) {
          const _moveLead = conversationLead(_move, { lang, seed: aText });
          if (_moveLead) p10Lead = _moveLead;
        }
      }

      // ── PHASE 18: PERSONALITY & LEARNING-STYLE — adapt HOW we explain to match how
      // this student learns (simple/step/examples/analogy/practical/analytical),
      // inferred gradually from the conversation + cross-session recap (no storage,
      // no profiling). Additive: only fills an EMPTY lead; runs after the emotion
      // layer (feelings first) but before the generic mentor prefix + the Phase 16
      // level/seed teaching pick, which stay the fallback. One mentor — only the
      // teaching STYLE shifts, never the personality (STEP 4). Silent without a
      // confident style (STEP 6).
      if (!p10Lead) {
        const _ls = detectLearningStyle({ messages, profile: memoryData?.profile, recentRecap });
        const _lsNote = learningStyleNote(_ls, { lang, seed: aText, level: p10Level, intent: p10Intent });
        if (_lsNote) p10Lead = _lsNote;
      }

      // ── PHASE 24: HUMAN EXPLANATION ENGINE — when the student EXPLICITLY asks for a
      // style ("explain like I'm 5", "tell it as a story", "use an analogy"), open
      // with a brief leveled framing lead. Additive: fills an empty lead only; covers
      // the very-simple / story / analogy tiers Phase 16 teaching-style does not.
      if (!p10Lead && !MARKET_DUMP_INTENTS.has(p10Intent)) {
        const _expStyle = detectExplanationRequest(aText);
        if (_expStyle) {
          const _expLead = explanationLead(_expStyle, { lang, seed: aText });
          if (_expLead) p10Lead = _expLead;
        }
      }

      // ── PHASE 14: MENTOR BRAIN — session memory, learner state, action, prefix, proactive ──
      // All additive — only sets p10Lead / p10GuideAppend when not already set by prior logic.
      sessionMem   = buildSessionMemory(messages, memoryData?.profile || {}, mergedTraderContext || {}, recentRecap);
      learnerState = detectLearnerState(memoryData?.profile || {}, mergedTraderContext || {}, sessionMem);
      mentorAction = decideMentorAction({
        cognition, learnerState, sessionMem, intent: p10Intent,
        hasKbAnswer: !!kbAnswer, clarifying: false,
      });
      // Session recall — natural reference to previous learning ("You've been exploring Risk Management...")
      // Only fires for educational actions when the mentor hasn't already set a lead.
      if (!p10Lead && sessionMem.lastTopic && ['Teach', 'Practice', 'Recommend'].includes(mentorAction)) {
        const _recall = formatSessionRecall(sessionMem, lang, aText);
        if (_recall) p10Lead = _recall;
      }
      // Mentor prefix phrases — only when p10Lead is still empty and intent is not operational/conversational.
      if (!p10Lead && !['greeting', 'smalltalk', 'offtopic', 'signal', 'setcountry', 'chart', 'lotsize'].includes(p10Intent)) {
        const _mPfx = getMentorPrefix(mentorAction, learnerState, lang, aText);
        if (_mPfx) p10Lead = _mPfx;
      }
      // Proactive guidance appended to body (Recommend action + specific learner states only).
      const _proactive = buildProactiveGuidance(mentorAction, learnerState, lang);
      if (_proactive) p10GuideAppend += _proactive;

      // ── PHASE 25: MEMORY & RELATIONSHIP V2 — occasionally reference the student's own
      // journey (a recent achievement, or the weakness we were tightening) from the
      // EXISTING session memory + traderContext. No new storage. Additive: fills an
      // empty lead only; rare + varied so continuity feels human, never robotic.
      if (!p10Lead && !['greeting', 'smalltalk', 'offtopic', 'signal', 'setcountry', 'chart', 'lotsize'].includes(p10Intent)) {
        const _relRecall = buildRelationshipRecall({
          sessionMem,
          journey: {
            achievements: Array.isArray(mergedTraderContext?.improved) ? mergedTraderContext.improved.map(i => 'improved ' + i) : [],
            weakArea: sessionMem.lastWeakArea || null,
          },
          lang, seed: aText,
        });
        if (_relRecall) p10Lead = _relRecall;
      }

      // ── PHASE 29: ADAPTIVE MENTOR — personalize to THIS trader: detect learning
      // speed (fast/slow/confused), derive an emphasis stance, and weave ONE weak-
      // area-targeted recommendation (practice/concept/mission/challenge) chosen from
      // the student's ACTUAL weak area (reused analytics/memory). Additive: appends
      // to the body only when no other guide tail is set (never stacks), gated +
      // varied so it's never spammy, and skipped for operational/market intents.
      if (!p10GuideAppend && !MARKET_DUMP_INTENTS.has(p10Intent) &&
          !['signal', 'chart', 'setcountry', 'lotsize', 'smalltalk', 'greeting', 'offtopic', 'aboutme', 'profileinfo'].includes(p10Intent)) {
        const _weakArea = sessionMem.lastWeakArea ||
                          (Array.isArray(memoryData?.profile?.weaknesses) && memoryData.profile.weaknesses[0]) ||
                          (Array.isArray(mergedTraderContext?.weaknesses) && mergedTraderContext.weaknesses[0]) || '';
        if (_weakArea) {
          const _speed = detectLearningSpeed({ cognition, profile: memoryData?.profile || {}, traderContext: mergedTraderContext || {}, messages });
          const _stance = adaptiveStance({ level: p10Level, learnerState, emotion: cognition.emotionalTone, speed: _speed });
          const _rec = smartRecommendation({ weakArea: _weakArea, level: p10Level, speed: _speed, stance: _stance, lang, seed: aText });
          if (_rec) p10GuideAppend += _rec;
        }
      }

      // ── PHASE 15: LONG-TERM MENTOR RELATIONSHIP — cross-session continuity ──
      // Phase 14's session recall handles WITHIN-thread continuity (scans messages);
      // Phase 15 handles ACROSS-session continuity from the persisted profile +
      // recentRecap. The two are complementary: on a fresh session the in-thread
      // history is short, so Phase 14 leaves the lead empty and Phase 15 can pick
      // up the long-term thread. Strictly additive — only sets p10Lead when STILL
      // empty (never overrides emotional/recovery/Phase-14 leads). Varied + often
      // silent so it never feels robotic.
      const _returning = (messages.filter(m => m.role === 'user').length <= 1) &&
                         (recentRecap.length > 0 || (memoryData?.profile?.conversation_count ?? 0) > 1);
      const journey = buildMentorJourney({
        profile: memoryData?.profile || {}, traderContext: mergedTraderContext || {},
        sessionMem, recentRecap, messages, returning: _returning,
      });
      if (!p10Lead && !['greeting', 'smalltalk', 'offtopic', 'signal', 'setcountry', 'chart', 'lotsize'].includes(p10Intent)) {
        const _cont = _returning ? studyContinuation(journey, lang, aText) : '';
        const _line = _cont || progressRecall(journey, lang, aText);
        if (_line) p10Lead = _line;
      }

      // ── PHASE 16: HUMAN TEACHING STYLE — frame the answer like a mentor (STEP 2/5/6).
      // Picks a teaching mode (simple/analogy/step-by-step/socratic/challenge) from
      // level + tone + depth, then offers a rare, varied framing lead and/or think-
      // prompt tail. Strictly additive: lead only when STILL empty (never overrides
      // emotional/recovery/Phase-14/15 leads); tail only when no guide tail is set
      // (never stacks). One mentor — the level just shifts emphasis, no switching.
      const _style = selectTeachingStyle({ level: p10Level, intent: p10Intent, cognition, depth: p10Depth, seed: aText });
      if (_style !== 'none') {
        if (!p10Lead) {
          const _tLead = teachingLead(_style, { lang, seed: aText });
          if (_tLead) p10Lead = _tLead;
        }
        if (!p10GuideAppend) {
          const _tTail = teachingTail(_style, { lang, seed: aText });
          if (_tTail) p10GuideAppend += _tTail;
        }
      }
    }
  }

  // ── PHASE 16: BETTER UNKNOWN BEHAVIOUR (STEP 4) — when a question was indirect
  // but had nothing to anchor to, ask for a little context naturally instead of
  // guessing or fabricating. Only when nothing confident was produced. Additive.
  if (_needContext && !clarifyAnswer && !directAnswer && !kbAnswer && (p10Intent === 'fallback' || cls.intent === 'fallback')) {
    clarifyAnswer = needContextLine(lang, genText);
  }

  // ── PHASE 11B.2: MISSING-KNOWLEDGE QUEUE (flagged, graceful, background) ──
  // When the graph is live and we couldn't confidently answer from knowledge,
  // capture the gap for admin review. No-op until KB_GRAPH_ENABLED + tables exist.
  if (graphActive(env) && !followup && !chartAnalysis && !kbAnswer && (clarifyAnswer || p10Intent === 'fallback')) {
    waitUntil(logMissingKnowledge(env, { question: genText, intent: cls.intent, category: null, confidence: clarifyAnswer ? 'clarify' : 'low' }));
  }

  // ── PART 1+6: BASIC AWARENESS (highest priority) — a clear live-price / market
  // instrument query ("xauusd current price", "what is gold doing", "why is nasdaq
  // falling") is NEVER ambiguous. Answer it from the market layer with a date/time
  // header + related chips, and OVERRIDE any misfired clarification so a price ask
  // can never be answered with a clarification menu or an unrelated concept.
  // CONVERSATION INTELLIGENCE GUARD (Final Conversation Phase): a greeting or
  // small-talk turn must NEVER reach the live-market layer. This block runs on
  // every non-followup turn and can OVERWRITE clarifyAnswer, so without the
  // guard a social message whose text was instrument-tagged upstream (the
  // conversation-state layer carries the thread's active/favorite instrument
  // into vague text) could be answered with a full Gold technical view — the
  // exact "hi → market data" production bug.
  let _awChips = [];
  if (!chartAnalysis && !followup && !_unsupported && ctx.live && !CONVERSATIONAL_INTENTS.has(p10Intent)) {
    try {
      const _aw = marketAwareness({ text: genText, marketData, calendarData, lang });
      if (_aw && _aw.answer) { directAnswer = _aw.answer; directSource = 'live'; clarifyAnswer = null; _awChips = _aw.chips || []; }
    } catch { /* additive — never blocks the reply */ }
  }

  // ── ACTIVATION: DETERMINISTIC CALCULATORS — when the user gives the numbers for a
  // lot-size / risk-reward / pip-value question, compute the EXACT answer (pure math,
  // never hallucinated) and short-circuit the engine. Highest content priority.
  if (!_unsupported && !chartAnalysis && !followup && ctx.calc) {
    try {
      const _calc = detectCalcRequest(genText);
      if (_calc.ready) { const _out = runCalculator(_calc, lang); if (_out) { directAnswer = _out; directSource = 'calc'; clarifyAnswer = null; } }
    } catch { /* additive — never blocks the reply */ }
  }

  // ── LIVE MARKET INTELLIGENCE — for a buy/sell DECISION on Gold/BTC, give the
  // structured educational analysis (Technical · Fundamental · Educational · Risk,
  // probability not certainty, never a signal) from the already-fetched marketData;
  // for a live-price ask on an instrument we have NO feed for (EUR/USD, indices,
  // oil), say so honestly instead of inventing a number (STEP 9). Additive.
  // (Same conversational guard as the awareness block above — this block can also
  // overwrite clarifyAnswer/directAnswer, so social turns must never enter it.)
  if (!chartAnalysis && !followup && !_unsupported && ctx.live && !CONVERSATIONAL_INTENTS.has(p10Intent)) {
    try {
      const _decInst = marketDecisionInstrument(genText);
      const _pxAsk   = livePriceInstrument(genText);
      if (_decInst) {
        directAnswer = buildMarketContext({ marketData, calendarData, instrument: _decInst, lang });
        directSource = 'live';
        clarifyAnswer = null;
      } else if (!directAnswer && _pxAsk && (!_pxAsk.supported || marketData?.status !== 'ok')) {
        directAnswer = priceUnavailable(_pxAsk.label, lang);
        directSource = 'live';
        clarifyAnswer = null;
      }
    } catch { /* additive — never blocks the reply */ }
  }

  // ── MARKET EXPLAIN — "why is gold/dollar/market moving" → educational driver
  // explanation; a buy/sell/hold DECISION on a no-live-feed instrument (EUR/USD,
  // indices, oil) → conceptual Technical/Fundamental/Risk/Confirmation/Conclusion
  // analysis without inventing a price (STEP 8). Additive; only when nothing
  // confident was already produced.
  if (!directAnswer && !clarifyAnswer && !chartAnalysis && !followup && !_unsupported && ctx.live) {
    try {
      const _why = detectMarketWhy(genText);
      if (_why.topic) {
        const _ex = buildWhyExplanation({ marketData, calendarData, topic: _why.topic, lang });
        if (_ex) { directAnswer = _ex; directSource = 'live'; }
      } else {
        const _bd = detectBroadDecision(genText);
        if (_bd) { directAnswer = genericDecisionAnalysis(_bd.label, lang); directSource = 'live'; }
      }
    } catch { /* additive — never blocks the reply */ }
  }

  // ── LIVE MARKET COVERAGE — extend educational analysis to the major FX pairs,
  // indices, oil, and silver ("what is EURUSD doing", "why is NASDAQ falling",
  // "what is driving USDJPY", "should I buy AUDUSD"). Gold/BTC reuse the live
  // market-context engine; the rest get driver-based educational analysis with an
  // honest "can't verify live price" (no invented prices, never a signal). Only
  // when nothing confident was already produced. Additive.
  if (!directAnswer && !clarifyAnswer && !chartAnalysis && !followup && !_unsupported && ctx.live) {
    try {
      const _iq = detectInstrumentQuery(genText);
      if (_iq) { directAnswer = buildInstrumentAnalysis({ symbol: _iq.symbol, marketData, calendarData, lang, kind: _iq.kind }); directSource = 'live'; }
    } catch { /* additive — never blocks the reply */ }
  }

  // ── CONVERSATION INTELLIGENCE — FINAL AUTHORITY for social turns (Final
  // Conversation Phase, Tasks 1/2/4/8). Reason-before-routing: a greeting,
  // thanks, farewell, "how are you", or "who are you / what can you do" is a
  // SOCIAL gesture, not an information request — it must be answered warmly and
  // briefly, never with market data, prices, articles, or an LLM generation.
  // Placed AFTER every live/calc block and written as an unconditional overwrite
  // for these two intents, so no upstream block can ever again turn "hi" into a
  // Gold technical view (the production bug). Recognizes a signed-in member
  // ("Welcome back — you're signed in.") on the opening turn (Task 4) and always
  // ends with one natural follow-up question (Task 8). English-only: for
  // ur/ur-roman/ar the builder returns null and the existing localized greeting
  // templates (engine-i18n, Language Lock) answer exactly as before.
  if (!followup && !chartAnalysis && !_unsupported && CONVERSATIONAL_INTENTS.has(p10Intent)) {
    try {
      const _conv = buildConversationalReply({
        text: genText, intent: p10Intent, lang,
        verified: tier === 'unlimited',
        firstTurn: messages.filter(m => m.role === 'user').length <= 1,
      });
      if (_conv) { directAnswer = _conv; directSource = 'safe'; clarifyAnswer = null; }
    } catch { /* additive — the rule-engine greeting below still answers */ }
  }

  // ── PHASE 20: unsupported language → polite, honest reply (highest priority,
  // never hallucinate, never fake a translation). Clears any English clarify menu.
  if (_unsupported) { directAnswer = unknownLanguageReply(_unsupported); directSource = 'safe'; clarifyAnswer = null; }

  // PRODUCTION UPGRADE — question FORM (what-is/how-to/example/comparison/why),
  // orthogonal to topic intent (p10Intent). Passed to the LLM composer as a
  // presentation hint only — additive, never changes which facts are used.
  const p10Form = detectQuestionForm(genText);

  if (clarifyAnswer) {
    answer = clarifyAnswer;
    answerSource = 'safe';                          // clarify question = safe-reply tier
  } else if (directAnswer) {
    answer = directAnswer;
    answerSource = directSource || 'live';          // live market / calculator / safe (set at source)
  } else if (kbAnswer) {
    answerSource = 'graph';                          // knowledge-graph concept (kb_nodes live, else offline anchors)
    // PHASE 11A.4 + 11B.3: KB-grounded answer composed into one mentor reply.
    answer = await composeAnswer({
      lead: p10Lead,
      body: compress(kbAnswer, p10Depth) + p10GuideAppend,
      engagement: p10Followups,
      disclaimer: '_⚠️ Educational information only — always trade using your own judgment and risk management._',
    }, { lang, intent: p10Intent, form: p10Form });
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
      // PHASE 11B.3: single human composition — ONE forward line, ONE disclaimer.
      answer = await composeAnswer({
        lead: p10Lead,
        prefix: p10Prefix,
        body: compress(answer, p10Depth) + p10GuideAppend,
        contradiction: p10Contradiction,
        engagement: p10Followups,
      }, { lang, intent: p10Intent, form: p10Form });
    } catch (err) {
      answer = (env.DEBUG === 'true')
        ? `Engine error: ${err.message}`
        : 'Sorry, I had trouble composing that answer. Please rephrase, or ask about Gold/BTC context, a trade assessment, brokers, or trading psychology.';
    }
  }

  // ── DATABASE LAYER — ANSWER *FROM* A PUBLISHED ARTICLE ────────────────────────
  // When no graph concept / live-market / clarify answer was produced, a published
  // ai_articles match must ANSWER the question — not merely be referenced under the
  // generic engine template (the prior behavior buried the article and left the
  // generic Technical-Analysis body as the "answer"). Reuses the EXISTING article
  // search + composer (no new pipeline, retrieval unchanged). English-only (Language
  // Lock). Relevance-gated by rankArticles (score>0 → off-topic returns nothing →
  // safe reply stays). Runs BEFORE the OpenAI fallback so DB precedes OpenAI.
  // FRESHNESS GUARD (Final Phase, Part 5; widened by the Live Market Freshness
  // task): excludes MARKET_DUMP_INTENTS (today's gold/btc/macro/brief/events/
  // mood/session — genuinely time-sensitive) AND isLiveMarketQuery (generic
  // instrument phrasing like "what is EURUSD doing" that classifies as
  // 'fallback' but still needs a live answer, not a stale article). If we reach
  // here with directAnswer still null for a live-data question, it means Live
  // API was disabled/unavailable — a coincidentally-matching STATIC article must
  // never stand in for live price/news data (that would misrepresent stale
  // content as current, a real trust/accuracy risk). Their own specialist
  // handlers already give an honest "live data isn't available right now" reply
  // in that case (see buildEvents/buildBrief), so this only removes a wrong
  // substitute, never a working answer.
  let _dbArticleAnswered = false;
  if (aiSbConfigured(env) && lang === 'en' && !chartAnalysis && !_unsupported
      && !directAnswer && !clarifyAnswer && !kbAnswer && ctx.database
      && !MARKET_DUMP_INTENTS.has(p10Intent) && !isLiveMarketQuery(genText)) {
    try {
      const _arts = await searchArticles(env, { q: genText, limit: 1 });
      const _art  = _arts && _arts[0];
      // Feed the composer the article's actual BODY (summary + content), not just the
      // summary metadata — the answer-bearing facts/bullets (e.g. "price may revisit
      // the area later") live in content. Summary leads (orients), content follows;
      // capped so the reply stays concise. This is what makes the article ANSWER the
      // question instead of the engine's generic Technical-Analysis template.
      const _sum = (_art && _art.summary && _art.summary.trim().length > 40) ? _art.summary.trim() : '';
      const _con = (_art && _art.content) ? String(_art.content).trim() : '';
      const _artBody = [_sum, _con].filter(Boolean).join('\n\n').slice(0, 1200);
      // RELEVANCE GUARD — only let the top article ANSWER when the question shares a
      // DISTINCTIVE term with its title/tags. rankArticles' score>0 is too loose (a
      // generic title word like "explained"/"simple" matches unrelated queries, e.g.
      // "elliott wave … in simple terms" wrongly hit the Liquidity Void article). A
      // weak match falls through to the OpenAI fallback instead of answering wrong.
      const _GENERIC = new Set(['explain','explained','explaining','simple','words','word','trading','trade','trades','trader','traders','price','prices','market','markets','area','areas','zone','zones','later','happens','because','about','into','from','this','that','with','your','what','when','where','does','term','terms','watch','return',
        // Domain DESCRIPTORS (not the distinctive SUBJECT) — prevent an unrelated query
        // matching an article on a shared generic word like "indicator"/"stop".
        'indicator','indicators','oscillator','oscillators','signal','signals','strategy','strategies','system','systems','method','methods','tool','tools','setup','setups','study','studies','technique','techniques','stop','stops']);
      const _sig = (s) => (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 3 && !_GENERIC.has(w));
      const _aTok = new Set([..._sig(_art && _art.title), ...((_art && _art.tags) || []).flatMap(t => _sig(t))]);
      const _relevant = _sig(genText).some(t => _aTok.has(t));
      if (_art && _artBody && _relevant) {
        const _src = _art.slug ? `\n\n📖 Source: [${_art.title}](${_art.slug})` : '';
        answer = await composeAnswer({
          lead: p10Lead,
          body: `From the ZTU article **${_art.title}**:\n\n${_artBody}${_src}` + p10GuideAppend,
          engagement: p10Followups,
          disclaimer: '_⚠️ Educational information only — always trade using your own judgment and risk management._',
        }, { lang, intent: p10Intent, form: p10Form });
        answerSource    = 'database';
        answerArticleId = (_art.id != null) ? _art.id : answerArticleId;
        p10KbCat        = _art.category || p10KbCat;
        _dbArticleAnswered = true;
      }
    } catch { /* additive — keep the existing reply on any failure */ }
  }

  // ── PHASE 8: RESPONSE ORCHESTRATOR — Memory → Articles → Broker → Pattern ──
  // Weave the Knowledge Base layer around the engine answer (which already holds
  // live-market context). Fully graceful: no-ops when Supabase is unconfigured,
  // skipped for uploaded-chart turns, and English knowledge bodies are injected
  // ONLY for English so the Language Lock is never violated (localized memory
  // recall is safe in any language). Raw memory rows are never exposed.
  // BUGFIX (Chatbot Checker audit): this call was not gated by ctx.database,
  // so a "Database disabled" test (Diagnostic single-source or Production
  // Routing) could still inject article/broker content here and even flip
  // answerSource to 'database' below — breaking source isolation for every
  // other single-source test (e.g. "OpenAI Only" could still show a database
  // answer). ctx.database defaults true, so real visitors and an unmodified
  // Production Routing config see zero behavior change.
  // FRESHNESS GUARD (Final Phase, Part 5; widened by the Live Market Freshness
  // task): same MARKET_DUMP_INTENTS + isLiveMarketQuery exclusion as the
  // database-article layer above — a market-freshness question reaching here
  // (directAnswer still null) means Live API was disabled/unavailable, so a
  // stale article prepend/append must not be woven into what should be an
  // honest "live data unavailable" reply.
  if (aiSbConfigured(env) && !chartAnalysis && !directAnswer && !clarifyAnswer && !kbAnswer && allowKnowledge
      && !_dbArticleAnswered && ctx.database && !MARKET_DUMP_INTENTS.has(p10Intent) && !isLiveMarketQuery(genText)) {
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
        // SOURCE BADGE: an injected Supabase article/broker body means the DB layer
        // contributed the substantive content over the generic engine safe reply.
        if (lang === 'en' && (kl.prepend || kl.append)) answerSource = 'database';
      }
    } catch { /* knowledge layer is additive; never blocks the reply */ }
  }

  // ── LEVEL 3 — SELECTED-PROVIDER ANSWERING (Phase 1 routing fix) ─────────────
  // ROOT CAUSE FIXED: this block previously required THREE independent, mostly
  // invisible conditions before OpenAI could ever answer — (1) env.AI_LEARN_ENABLED
  // === 'true' (a Cloudflare env var with no admin-panel control at all), (2) intent
  // classified as the rarest possible bucket 'fallback' (the LAST-RESORT default of
  // a ~28-category classifier — a real question like "risk management" or "gold"
  // never reached this branch even with every other source disabled), and (3) the
  // admin's ctx.openai toggle. An admin selecting "OpenAI only" in the Content
  // Intelligence Center therefore could not make OpenAI answer ordinary trading
  // questions — the routing panel and the runtime silently disagreed.
  // FIX: ctx.openai (the ONE admin-visible switch) is now the sole routing gate.
  // PRIORITY PRESERVED: still runs ONLY after every higher-priority source that was
  // actually enabled has had its turn and found nothing (kbAnswer/directAnswer/
  // _dbArticleAnswered all null) — so with every source enabled (the default), the
  // existing Database→Graph→Live→OpenAI priority is unchanged; with only OpenAI
  // enabled, it now genuinely answers everything the disabled sources would have.
  // EXCLUDED on purpose (each already has its own correct, deliberate reply that an
  // LLM must never overwrite or guess at): greeting/smalltalk (warm canned reply),
  // offtopic (professional scope decline), signal (compliance-mandated Telegram/
  // WhatsApp routing — never a freelanced signal), setcountry/profileinfo/aboutme
  // (reads/writes the user's own stored data — an LLM has no access to it and would
  // hallucinate), selfassess/assess (a structured tool flow, not a Q&A prompt),
  // lotsize (a deterministic financial calculation — an LLM guess would be a real
  // accuracy regression versus the calculator). English-only (Language Lock). A
  // previously-learned DRAFT is reused (cache) before any new LLM call — reuses
  // Content Center's existing learn/draft feature exactly as built (recallLearned/
  // learnFromAnswer already self-gate on AI_LEARN_ENABLED internally, so that
  // feature's own on/off switch is untouched; it just no longer also blocks the
  // ANSWER itself). Anti-hallucination preserved by the strict generator (off-domain/
  // signal/price guards in composer-llm.js); on any miss the existing safe reply stays.
  const OPENAI_EXCLUDED_INTENTS = new Set([
    'offtopic', 'greeting', 'smalltalk', 'signal', 'setcountry',
    'profileinfo', 'aboutme', 'selfassess', 'assess', 'lotsize',
    'journal',   // has a dedicated reply linking to the real /journal.html page —
                 // a generic LLM generation has no knowledge of that page and
                 // would silently drop the link, undermining its whole point.
  ]);
  if (ctx.openai && lang === 'en' && !chartAnalysis && !_unsupported
      && !kbAnswer && !directAnswer && !_dbArticleAnswered
      && !OPENAI_EXCLUDED_INTENTS.has(p10Intent)) {
    try {
      // STABILIZATION FIX: use the handler-scoped genText. `aText` is const-scoped to
      // the (!followup && !chartAnalysis) block above (closes ~L1091) and is OUT of
      // scope here — referencing it threw ReferenceError that the try/catch silently
      // swallowed, so this block never executed. genText is the correct in-scope
      // equivalent (recovery/slang/multilang-normalized user text). No logic change.
      const cached = await recallLearned(env, genText);   // no-op unless Content Center's learn feature is on
      if (cached && cached.content) {
        answer = cached.content + '\n\n_⚠️ Educational information only — always trade using your own judgment and risk management._';
        answerSource = 'database';                   // served from stored knowledge (exact or similar) — no LLM call
      } else {
        const gen = await generateEducationalAnswer(env, genText, lang, p10Form);
        if (gen) {
          answer = gen + '\n\n_⚠️ Educational information only — always trade using your own judgment and risk management._';
          answerSource = 'openai';                   // selected provider answered directly
          // STORE BEFORE RETURNING (await, not waitUntil) so the draft is committed by the
          // time the reply is sent — guarantees the very next identical question (even an
          // immediate repeat) is served from storage and does NOT call the LLM again.
          // learnFromAnswer is best-effort/never-throws (and no-ops unless the Content
          // Center learn feature is on), so awaiting it can't break the reply.
          await learnFromAnswer(env, { question: genText, answer: gen, lang, confidence: 'MEDIUM' });
        }
      }
    } catch { /* additive — keep the existing safe reply on any failure */ }
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

  // ── SAFE REPLY UPGRADE (Phase 1 fix) ─────────────────────────────────────────
  // ROOT CAUSE FIXED: `answerSource` is only ever moved off its initial 'safe'
  // default by the graph/database/live/calculator/openai branches above — the
  // baseline rule engine (generateResponse → specialist-router, a few hundred
  // lines up) NEVER sets it, even though that engine has real, specific, dedicated
  // handlers for gold/btc/psychology/riskmgmt/strategy/technical/session/career/
  // and ~20 other intents. The OLD condition (`answerSource === 'safe'` alone)
  // therefore fired for MOST real trading questions — not just genuinely unknown
  // ones — silently discarding a correct, specific answer and replacing it with
  // the generic "I'm focused on trading…" decline. The actual signal for "the
  // assistant genuinely doesn't know" is the INTENT itself: 'fallback' (the
  // classifier's last-resort default when nothing matched) or 'offtopic' (out of
  // scope, per Task 5). Every other intent's rule-engine/OpenAI answer is real and
  // must survive untouched — this is required for both Task 4 (trading questions
  // must never fall back to a generic reply) and Task 5 (only genuinely out-of-
  // scope questions get the scope-decline reply). Kept as an AND with the original
  // `answerSource === 'safe'` check (not a replacement) — strictly narrows when
  // the overwrite fires, adds no new risk. Greeting/smalltalk already have their
  // own good replies from the rule engine and are excluded by not being in the
  // fallback/offtopic set. Localized langs only (buildSafeReply's own coverage).
  if (answerSource === 'safe' && ['fallback', 'offtopic'].includes(p10Intent)
      && ['en', 'ur', 'ur-roman', 'ar'].includes(lang)
      && !clarifyAnswer && !chartAnalysis && !_unsupported && !directAnswer) {
    try {
      answer = buildSafeReply(lang);
    } catch { /* keep existing reply on any failure */ }
  }

  // ── PHASE 2: USER ENGAGEMENT — when the turn was vague/unmatched (clarify or
  // fallback), guide the user with real, answerable questions pulled live from the
  // graph (basic→advanced). English-only (Language-Lock safe); graceful when the
  // graph is inactive (suggestQuestions returns []). Never added to a confident answer.
  if (lang === 'en' && !chartAnalysis && !kbAnswer && !directAnswer && (clarifyAnswer || p10Intent === 'fallback')) {
    try {
      const qs = await suggestQuestions(env, { lang, limit: 3, level: p10Level });
      if (qs.length) {
        // PART 3: be honest when a question isn't fully covered, then offer 3 real,
        // answerable next questions (gap logged via logMissingKnowledge above).
        const _lead = (p10Intent === 'fallback' && lang === 'en')
          ? "\n\n_I don't have that fully covered yet — but I can help with these:_\n"
          : '\n\nYou can also ask me:\n';
        answer = answer.trimEnd() + _lead + qs.map(q => '• ' + q).join('\n');
      }
    } catch { /* engagement is additive; never blocks the reply */ }
  }

  // ── PHASE 13: DYNAMIC FOLLOW-UP ENGINE — a human mentor does NOT tack the same
  // "related article + next step" onto every reply. The graph next-step invite is
  // already woven in by the composer; here we choose AT MOST ONE extra tail, and
  // often none, varied deterministically so the conversation never feels robotic:
  //   • article   — surface a relevant article (when one genuinely matches)
  //   • reflect   — a short mentor prompt to apply the concept (no fake commands)
  //   • none      — let the answer breathe; rely on the woven next-step
  if (lang === 'en' && kbAnswer) {
    try {
      const seed = ((p10KbCat || '').length + (messages.length || 0)) % 4;   // 0..3
      const channel = ['article', 'reflect', 'none', 'article'][seed];
      // BUGFIX (Chatbot Checker audit): gated on ctx.database — this tail can
      // append a database-sourced link even when Database is disabled for a
      // diagnostic/routing test (e.g. "Knowledge Graph Only" should never
      // touch the database at all, per spec Example C).
      if (channel === 'article' && aiSbConfigured(env) && ctx.database) {
        // STABILIZATION FIX: genText (handler-scoped). `aText` is out of scope here
        // (block-scoped above ~L1091) → its ReferenceError was swallowed by the
        // try/catch, so the Related Article tail never ran. genText is the in-scope
        // equivalent user query. No logic change.
        const arts = await searchArticles(env, { q: genText, category: p10KbCat || undefined, limit: 1 });
        const a = arts && arts[0];
        if (a && a.title) {
          answer = answer.trimEnd() + `\n\n📖 Related article: ${a.slug ? `[${a.title}](${a.slug})` : a.title}`;
          answerArticleId = a.id != null ? a.id : (a.slug || null);   // ANALYTICS: surfaced article id
        }
      } else if (channel === 'reflect') {
        const topic = (rel && rel.primaryEntity) ? rel.primaryEntity : 'this';
        answer = answer.trimEnd() + `\n\n🧭 Try applying ${topic === 'this' ? 'this' : topic + ' analysis'} to your own chart or last trade — notice what you'd do differently.`;
      }
      // 'none' → no tail; the woven next-step invite already guides the user.
    } catch { /* follow-up is additive; never blocks the reply */ }
  }

  // ── PHASE 14: POST-ANSWER MENTOR DECISION TAIL ───────────────────────────────
  // Fires AT MOST once, only for Reflect action after educational KB answers.
  // English-only. Never fires on clarify/direct-status/chart turns.
  if (lang === 'en' && kbAnswer && !chartAnalysis && !clarifyAnswer && !directAnswer && mentorAction === 'Reflect') {
    try {
      const _mDec = buildMentorDecision(mentorAction, learnerState, p10Intent, lang, genText.slice(0, 30));
      if (_mDec.text) answer = answer.trimEnd() + _mDec.text;
    } catch { /* mentor decision is additive; never blocks the reply */ }
  }

  // ── PHASE 11C.0B: NO-DRIFT entity filter — a Gold answer must not carry a BTC
  // price line (and vice-versa). Whitelisted instrument codes only → Language-Lock safe.
  if (rel && rel.primaryEntity && p10MarketDump) answer = applyEntityFilter(answer, rel);

  // ── PHASE 19: SMART SUGGESTION CHIPS — graph-derived, clickable next questions so
  // the student rarely needs to type. Easier+fewer when confidence was low (STEP 5);
  // suppressed on unsupported-language + chart turns. Graceful [] until the graph is
  // provisioned. Streamed as a final SSE event; the client renders clickable chips.
  let suggestionChips = [];
  if (!_unsupported && !chartAnalysis) {
    try {
      suggestionChips = await buildSuggestionChips(env, {
        lang, level: p10Level, related: p10Related,
        lowConfidence: !!clarifyAnswer || p10Intent === 'fallback',
      });
    } catch { suggestionChips = []; }
  }
  // PART 6: for a live-market answer, surface the related-question chips instead.
  if (_awChips.length) suggestionChips = _awChips.slice(0, 5);

  // ── PHASE 23: CONTEXT-MENU ACTION CHIPS — concept-anchored clickable actions
  // (Learn more / Show example / Common mistakes / Practice / Next step), each GATED
  // by what the answered concept actually carries in the graph (no marketContext →
  // no "Show example") = hallucination-safe (STEP 6). One-click learning (STEP 4),
  // short labels (STEP 5). Only on a real KB-grounded educational answer.
  let actionChips = [];
  if (!_unsupported && !chartAnalysis && kbAnswer && p10ConceptTitle) {
    try {
      actionChips = buildContextActions({
        topic: p10ConceptTitle, title: p10ConceptTitle,
        hasExample: p10HasExample, hasMistakes: p10HasMistakes,
        hasDeep: p10HasDeep, nextStepTopic: p10NextStepTopic, lang,
      });
    } catch { actionChips = []; }
  }

  // ── PHASE 30: NO DEAD ENDS — if neither graph suggestions nor concept actions
  // were produced (e.g. graph not provisioned, or a short status/fallback answer),
  // guarantee a clickable path forward with always-answerable starter chips. Reuses
  // the Phase 19 suggestions event + renderer (plain strings). Skipped for
  // unsupported-language + chart turns. Never a dead end (STEP 1/2/4).
  if (!_unsupported && !chartAnalysis && !suggestionChips.length && !actionChips.length) {
    try {
      suggestionChips = fallbackPathChips({ lang, level: p10Level });
    } catch { /* additive — never blocks the reply */ }
  }

  // ── RESPONSE OPTIMIZATION LAYER (additive final pass) ─────────────────────
  // Surgical, post-composition only: caps the answer to short form (unless the user
  // asked for detail) while preserving the disclaimer + links, and tightens the
  // follow-up chips to ≤3 contextual ≤4-word labels (no generics). Pure string
  // transforms — no retrieval/routing/API/data/intent changes. Fully guarded.
  try {
    answer = optimizeAnswer(answer, { detail: wantsDetail(genText) });
  } catch { /* additive — never blocks the reply */ }
  try {
    suggestionChips = optimizeChips(suggestionChips, { related: p10Related, nextStepTopic: p10NextStepTopic, lang });
  } catch { /* additive — never blocks the reply */ }

  // ── CONVERSATIONAL WRAPPER (additive, post-optimize) — give substantive educational
  // answers (graph/database/openai) a human envelope: greeting (first turn) + question
  // acknowledgement, around the answer. Follow-up chips + source badge already stream.
  // Live/safe/clarify text is left byte-identical (priority preserved). Fully guarded.
  try {
    answer = wrapConversational(answer, {
      messages, answerSource, lang,
      topic: p10ConceptTitle || p10KbCat || '',
      isFirstMessage: messages.filter(m => m.role === 'user').length <= 1,
    });
  } catch { /* additive — never blocks the reply */ }

  // ── GLOBAL CONTACT FOOTER — single append point covering ALL sources (Database/
  // Graph/Live/OpenAI/Safe) since they all converge into `answer` here. Reuses the
  // EXISTING Telegram/WhatsApp constants (response-engine.js) — no hard-coded values,
  // no new env var. DEDUP GUARD: skip when the answer already contains a t.me/wa.me
  // link (e.g. market/signal replies) so the contact never appears twice. Runs after
  // optimize so it isn't trimmed; before the SSE stream so it streams normally.
  try {
    // Conversational turns (greeting/thanks/bye/how-are-you) are excluded: a
    // promo footer stapled to "Hello 👋" reads as a bot, not an assistant —
    // the footer stays on every substantive (informational) answer.
    if (typeof answer === 'string' && answer.trim() && !/t\.me\/|wa\.me\//i.test(answer)
        && !CONVERSATIONAL_INTENTS.has(p10Intent)) {
      answer = answer.trimEnd() +
        `\n\n_For research-based learning, training, and trading guidance, reach us on [Telegram](${TELEGRAM}) or [WhatsApp](${WHATSAPP})._`;
    }
  } catch { /* additive — never blocks the reply */ }

  // ── SOURCE BADGE — report which retrieval layer produced this answer so the user
  // (and, in admin debug mode, the operator) can see where it originated. Reports
  // only; never changes routing or the Database→Graph→Live→OpenAI→Safe priority.
  let sourceMeta = null;
  try {
    const _dbg = debugMode ? {
      stage: answerSource,
      chain: SOURCE_STAGES.map(s => ({ ...s, active: s.layer === answerSource })),
      available: {
        database: aiSbConfigured(env),
        graph:    graphActive(env),
        calc:     true,   // pure deterministic math — always available, no external config
        live:     !!(marketData && marketData.status === 'ok'),
        openai:   llmConfigured(env),   // the true prerequisite now that routing no longer also requires AI_LEARN_ENABLED
        safe:     true,
      },
      intent: p10Intent,
      lang,
    } : null;
    sourceMeta = sourceBadge(answerSource, _dbg);
  } catch { sourceMeta = null; }

  // ── ANALYTICS (best-effort, non-blocking) — one row per completed response into
  // ai_response_logs. ANALYTICS ONLY: it reads already-computed values and NEVER
  // changes retrieval/routing. No-ops when Supabase is unconfigured, runs in the
  // background via waitUntil, and the whole call is wrapped so a logging failure can
  // never affect or block the user's reply (req 3/4/15).
  try {
    if (aiSbConfigured(env)) {
      waitUntil(insertResponseLog(env, {
        userQuestion:   genText,   // handler-scoped processed user text (aText is block-scoped above)
        answerSource:   logSourceValue(answerSource),   // database|graph|live_api|openai|safe_reply (calc→calculator)
        confidence:     answerConfidence,
        responseTimeMs: Date.now() - _logT0,
        topic:          p10KbCat || p10ConceptTitle || (rel && rel.primaryEntity) || null,
        language:       lang,
        articleId:      answerArticleId,
        graphNodeId:    answerGraphNodeId,
        isFallback:     answerSource === 'safe',
      }));
    }
  } catch { /* analytics must never affect the response */ }

  // ── PRODUCTION UPGRADE — FULL TRANSLATION LAYER (Part 1) ───────────────────
  // Single late hook: `answer` is fully finalized by every path above (clarify /
  // direct-live / kb / engine / article / knowledge-layer / Level-3 learn) by
  // this point, so translating exactly ONCE here can never double-translate and
  // covers every source uniformly. Only fires for the 5 partial languages
  // (id/ms/vi/bn/th); en/ur/ur-roman/ar are already fully handled upstream and
  // this is a no-op for them. On any failure/unconfigured-LLM, `answer` is left
  // completely unchanged (existing Phase-34 English+honest-note behavior).
  if (PARTIAL_LANGS.has(lang)) {
    try {
      const _ansStr = String(answer || '');
      const localized = await localizeFinalAnswer(env, _ansStr, lang);
      if (localized) {
        answer = localized;
      } else if (!_ansStr.includes(partialLanguageNote(lang))) {
        // Direct/live-market answers never pass through generateResponse(), so
        // they never got the Phase-34 honest note — ensure it's present here so
        // EVERY partial-language reply explains the gap when translation didn't
        // happen, not just the ones that went through the engine path.
        answer = `${_ansStr}\n\n${partialLanguageNote(lang)}`;
      }
    } catch { /* translation is additive — never blocks the existing reply */ }
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
      // PHASE 19: emit clickable suggestion chips as a final structured event.
      if (suggestionChips && suggestionChips.length) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ suggestions: suggestionChips })}\n\n`));
      }
      // PHASE 23: emit concept-anchored context-menu action chips.
      if (actionChips && actionChips.length) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ actions: actionChips })}\n\n`));
      }
      // SOURCE BADGE: emit which retrieval layer produced this answer (final event).
      if (sourceMeta) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ source: sourceMeta })}\n\n`));
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch {
      try { await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`)); } catch {}
    } finally {
      try { await writer.close(); } catch {}
    }
  })();

  // Guest message counter: stamp the incremented signed-cookie count on the
  // streamed reply (verified/unlimited users get no cookie — guestSetCookie stays null).
  const responseHeaders = guestSetCookie ? { ...SSE_HEADERS, 'Set-Cookie': guestSetCookie } : SSE_HEADERS;
  return new Response(readable, { headers: responseHeaders });
}
