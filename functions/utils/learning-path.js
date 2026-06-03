// functions/utils/learning-path.js
// ════════════════════════════════════════════════════════════════════════════
// LEARNING PATH ENGINE (Module 6) — ARCHITECTURE + functional roadmaps.
//
// Generates a level-appropriate learning roadmap. Pure & usable now; future
// personalisation can weight steps by detected weaknesses (trader-intelligence)
// and recommended articles (retrieval-engine → ai_articles). No persistence here.
// ════════════════════════════════════════════════════════════════════════════

export const LEARNING_PATHS = {
  beginner: {
    title: 'Foundation Path',
    focus: 'survive first, learn the language of the market',
    steps: [
      'How markets move: candles, timeframes, trend vs range',
      'What drives Gold & BTC (real yields, DXY, risk appetite)',
      'Risk basics: stop loss, take profit, the 1–2% rule',
      'Open a **demo** account — no real money yet',
      'Read: *Trading in the Zone* (Mark Douglas) + start a trade journal',
    ],
  },
  intermediate: {
    title: 'Execution Path',
    focus: 'consistency in entries, exits, and risk',
    steps: [
      'Market structure: support/resistance, swing highs/lows',
      'Build & follow a written trading plan (rules for entry/exit/risk)',
      'Position sizing & R-multiples (Van Tharp)',
      'News-risk awareness: CPI / NFP / FOMC timing',
      'Weekly journal review — find your repeating mistake and fix one thing',
    ],
  },
  advanced: {
    title: 'Optimization Path',
    focus: 'refine edge, manage psychology, scale safely',
    steps: [
      'Quantify your edge: expectancy, win-rate vs R, drawdown profile',
      'Session/liquidity awareness and confluence stacking',
      'Psychology mastery: eliminate revenge/FOMO via process rules',
      'If pursuing funded accounts: trade to protect the drawdown limit first',
      'Periodic system review — cut what doesn\'t carry its weight',
    ],
  },
};

// Build a roadmap, optionally emphasising a detected weakness key.
export function buildLearningPath(level = 'beginner', weaknessKey = null) {
  const path = LEARNING_PATHS[level] || LEARNING_PATHS.beginner;
  const emphasis = {
    'no-stop-loss': 'Priority for you: make a stop loss **non-negotiable** on every trade.',
    'fomo':         'Priority for you: a written entry checklist to beat **FOMO**.',
    'revenge':      'Priority for you: a mandatory cool-down + daily loss limit to stop **revenge trading**.',
    'overtrading':  'Priority for you: a max-trades-per-day rule — **quality over quantity**.',
    'poor-risk':    'Priority for you: fixed **1–2% risk** and correct position sizing.',
    'no-patience':  'Priority for you: only A+ setups — practise **waiting** on demo first.',
  };
  return {
    level,
    title: path.title,
    focus: path.focus,
    steps: path.steps,
    emphasis: weaknessKey ? (emphasis[weaknessKey] || null) : null,
    cta: 'Take the **[Trader Self-Assessment](trader-assessment.html)** to lock your starting point.',
    futureSource: 'ai_articles (recommended reading per step) — via retrieval-engine',
  };
}

// Render the roadmap as trader-friendly markdown (pure helper, safe now).
export function renderLearningPath(level, weaknessKey = null) {
  const p = buildLearningPath(level, weaknessKey);
  let out = `## 🗺️ ${p.title} (${level})\n_Focus: ${p.focus}_\n\n`;
  out += p.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  if (p.emphasis) out += `\n\n🎯 ${p.emphasis}`;
  out += `\n\n${p.cta}`;
  return out;
}
