// functions/utils/psychology-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PSYCHOLOGY COACH + TRADING COACH SPECIALIST — stuck-trade mentoring,
// "why am I losing" breakdown, the personalised Coach-Mode intro, and the
// trader-type personality tone. No signals, ever.
// ════════════════════════════════════════════════════════════════════════════

import { marketBlock } from './response-engine.js';

const WEAKNESS_PHRASE = {
  fomo:        'entering too early / chasing moves (FOMO)',
  fear:        'managing fear and pulling the trigger',
  revenge:     'revenge trading after losses',
  hesitation:  'hesitation and second-guessing entries',
  overtrading: 'overtrading — taking too many trades',
};

// Trader-type tone (emotional / overtrader / scalper / swing / funded)
export const TYPE_LINE = {
  emotional:  `Before the charts — I know emotions run high for you, so let's keep **risk and mindset first**. 🧘`,
  overtrader: `Quick reminder for you: **quality over quantity** — fewer, cleaner setups beat many rushed ones. ⏳`,
  scalper:    `Scalper mode: I'll keep this **session- and risk-focused** — spread, liquidity, and timing matter most for you. ⚡`,
  swing:      `Swing lens: let's think **higher-timeframe structure and patience** rather than noise. 🌊`,
  funded:     `Funded-account mindset: protect the **drawdown limit** first — consistency keeps the account, not hero trades. 🛡️`,
  advanced:   ``,
  beginner:   ``,
};

// A natural, human mentor observation woven in for the right moments.
export function buildCoachIntro(tc, intent) {
  if (!tc) return '';
  const n     = tc.conversations || 0;
  const p     = tc.patterns || {};
  const lines = [];

  if (intent === 'greeting' && n >= 3 && tc.topWeakness && WEAKNESS_PHRASE[tc.topWeakness]) {
    lines.push(`Good to see you back. 👋 Across our last **${n} conversations**, the pattern I keep noticing is **${WEAKNESS_PHRASE[tc.topWeakness]}** — let's keep sharpening that today.`);
  }

  if (intent === 'whylosing' || intent === 'stuck') {
    if ((p.revenge ?? 0) >= 2)
      lines.push(`I've noticed you often ask about recovering losing trades — that usually points to **emotional pressure**, not a strategy gap. Let's anchor on risk control first.`);
    else if ((p.fomo ?? 0) >= 2)
      lines.push(`From our chats, **chasing entries (FOMO)** comes up a lot for you — that's the thread worth pulling on here.`);
    else if ((p.hesitation ?? 0) >= 2)
      lines.push(`You've mentioned **hesitation** before — losses there often come from missing the plan, not the market.`);
  }

  if (intent === 'assess' && (p.hesitation ?? 0) >= 2) {
    lines.push(`Since hesitation has come up for you before — as we review this, notice whether the plan is clear enough to act on **without second-guessing**.`);
  }

  if ((intent === 'greeting' || intent === 'whylosing') && tc.improved && tc.improved.length) {
    lines.push(`And one win worth naming: you've improved your **${tc.improved[0]}** lately. 👏 Keep it going.`);
  }

  // Personality Engine — trader-type tone, only when no stronger coach line fired
  if (!lines.length && tc.type && TYPE_LINE[tc.type]
      && ['gold', 'btc', 'macro', 'brief', 'assess', 'chart', 'stuck', 'psychology'].includes(intent)) {
    lines.push(TYPE_LINE[tc.type]);
  }

  return lines.length ? lines.join('\n\n') + '\n\n' : '';
}

export function buildStuck(ctx) {
  const { marketData } = ctx;
  let out = `## On a Trade in Drawdown\n` +
    `First — drawdowns are stressful, and that feeling is completely normal. Let's think clearly. 🧭\n\n`;
  const mb = marketBlock(marketData);
  if (mb) out += `**Current context:**\n${mb}\n\n`;
  out += `**Honest framing (not a rescue instruction):**\n` +
    `- Stuck trades carry **genuine uncertainty** — no one can predict whether price returns to your level.\n` +
    `- ⚠️ Be very careful with **emotional averaging** (adding to a loser without a clear structural reason) and **revenge entries** — these turn one mistake into several.\n` +
    `- A useful question: *"If I had no position right now, would I open this trade based on the current structure?"*\n` +
    `- Whatever happens, journal it. The goal is to protect capital and bring discipline to the **next** clean setup.\n\n` +
    `I won't tell you to hold, close, or add — that decision is yours and depends on your plan and risk limits.`;
  return out;
}

export function buildWhyLosing(ctx) {
  return `## Why Am I Losing? — A Structured Breakdown\n` +
    `Losses usually trace back to one (or more) of these areas. Be honest with yourself on each:\n\n` +
    `**1. 🧠 Psychology** — FOMO entries, revenge trading, breaking your own rules under pressure.\n` +
    `**2. 🎯 Execution** — entering before confirmation, stops placed at arbitrary distances, exiting winners too early.\n` +
    `**3. 🛡️ Risk Management** — risking too much per trade, poor R:R, no daily loss limit.\n` +
    `**4. ⏳ Patience** — overtrading, forcing trades in ranging markets, not waiting for A+ setups.\n` +
    `**5. ⚖️ Leverage & Sizing** — positions too large for the account; one bad trade does outsized damage.\n` +
    `**6. 📅 News & Timing** — trading into high-impact events or thin-liquidity sessions.\n\n` +
    `A powerful first step: take the **[Trader Self-Assessment](trader-assessment.html)** — it pinpoints which of these is hurting you most and gives a personalised roadmap.\n\n` +
    `Tell me which area resonates and I'll go deeper with you.`;
}
