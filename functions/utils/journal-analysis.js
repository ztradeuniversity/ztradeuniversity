// functions/utils/journal-analysis.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 6 — TRADE RESULT AUDIT ENGINE (pure, deterministic, dependency-free)
//
// Single source of truth for "why did this trade go the way it did".
// Consumed by BOTH:
//   • functions/api/journal-analyze.js  → the browser calls it after a save
//   • functions/api/journal-admin.js    → admin-side distributions/aggregates
// so the user's verdict and the admin's statistics can never disagree.
//
// Deterministic by design (no LLM call): the audit runs on EVERY completed
// trade, must be instant, must be identical for the same inputs, and must
// never invent a weakness that the logged fields don't actually evidence.
// The generative seam is composer-llm.js and stays out of this path.
// ════════════════════════════════════════════════════════════════════════════

// Canonical weakness taxonomy. `label` strings are what the user/admin see.
export const WEAKNESS = {
  RISK:        { code: 'risk-management-weak',    label: 'Risk Management Weak' },
  PSYCHOLOGY:  { code: 'psychology-weak',         label: 'Psychology Weak' },
  TECHNICAL:   { code: 'technical-analysis-weak', label: 'Technical Analysis Weak' },
  FUNDAMENTAL: { code: 'fundamental-analysis-weak', label: 'Fundamental Analysis Weak' },
  DISCIPLINE:  { code: 'discipline-weak',         label: 'Discipline Weak' },
  OVERTRADING: { code: 'overtrading',             label: 'Overtrading' },
  FOMO:        { code: 'fomo',                    label: 'FOMO' },
  REVENGE:     { code: 'revenge-trading',         label: 'Revenge Trading' },
  EMOTIONAL:   { code: 'emotional-trading',       label: 'Emotional Trading' },
  POOR_ENTRY:  { code: 'poor-entry',              label: 'Poor Entry' },
  POOR_EXIT:   { code: 'poor-exit',               label: 'Poor Exit' },
};
const WEAKNESS_BY_CODE = Object.fromEntries(Object.values(WEAKNESS).map((w) => [w.code, w]));

// Canonical strength taxonomy — the positive counterpart to WEAKNESS, so a
// clean trade isn't just "no weaknesses" but gets credited for what it did
// right. Mirrors the same rule shape (code/label/severity/why).
export const STRENGTH = {
  RISK_FOLLOWED:   { code: 'risk-management-followed', label: 'Risk Management Followed' },
  PLAN_FOLLOWED:   { code: 'plan-followed',             label: 'Followed Trading Plan' },
  CALM_EXECUTION:  { code: 'calm-execution',            label: 'Calm, Controlled Execution' },
  CLEAR_SETUP:     { code: 'clear-setup-reasoning',     label: 'Clear Setup Reasoning' },
  GOOD_RR:         { code: 'good-risk-reward',          label: 'Strong Risk/Reward Planning' },
  DEFINED_EXIT:    { code: 'defined-exit',              label: 'Defined Exit Before Entry' },
};

// One recommendation per primary weakness — concrete and actionable.
const RECOMMENDATION = {
  'risk-management-weak':      'Reduce position size and pre-define your stop loss before entry. Never risk more than your fixed % per trade.',
  'psychology-weak':           'Step away after a losing trade and re-read your plan before the next entry. Log your emotional state before you click, not after.',
  'technical-analysis-weak':   'Wait for your setup to fully confirm before entering. Write the exact technical trigger in your reason field so it can be reviewed.',
  'fundamental-analysis-weak': 'Check the economic calendar before entering. Avoid opening positions minutes before high-impact news unless it is your planned strategy.',
  'discipline-weak':           'Follow your written plan on every trade. If the setup is not in your plan, it is not your trade.',
  'overtrading':               'Cap your trades per day. Quality over quantity — a smaller number of A+ setups beats a high trade count.',
  'fomo':                      'Do not chase price. If you missed the entry, let the trade go and wait for the next planned setup.',
  'revenge-trading':           'Stop trading for the session after a significant loss. Re-entering immediately to "win it back" is the fastest route to a bigger drawdown.',
  'emotional-trading':         'Trade your plan, not your feelings. Use a fixed pre-trade checklist so entries stay mechanical.',
  'poor-entry':                'Wait for confirmation before entering — a late or unconfirmed entry ruins an otherwise valid setup.',
  'poor-exit':                 'Always set a take profit and honour it. Define your exit at the same moment you define your entry.',
};

const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

// News/fundamental keywords — used only to flag a LOSS taken around an event.
const NEWS_RX = /\b(news|nfp|cpi|fomc|ppi|fed|rate\s*decision|payroll|inflation|earnings|powell)\b/i;

/**
 * Audit a single completed trade.
 *
 * @param {object} trade   journal_trades row (Phase 6 shape).
 * @param {object} [ctx]
 * @param {Array}  [ctx.recentTrades]  the SAME user's other trades (any order),
 *                                     used for overtrading/revenge detection.
 * @returns {object} analysis — safe to store directly in journal_trades.ai_analysis
 */
export function analyzeTrade(trade, ctx = {}) {
  const t = trade || {};
  const found = [];
  const add = (w, severity, why) => found.push({ code: w.code, label: w.label, severity, why });
  const foundStrengths = [];
  const addStrength = (s, why) => foundStrengths.push({ code: s.code, label: s.label, why });

  const result   = t.result || (num(t.pnl) > 0 ? 'PROFIT' : num(t.pnl) < 0 ? 'LOSS' : 'BREAKEVEN');
  const isLoss   = result === 'LOSS';
  const rr       = num(t.rr_ratio);
  const conf     = num(t.confidence_level);
  const emotion  = t.emotion || null;
  const reason   = (t.trade_reason || '').trim();
  const hasTP    = t.take_profit != null;
  const plan     = t.followed_plan;
  const risk     = t.followed_risk;

  // ── Risk management ────────────────────────────────────────────────────
  if (risk === false) {
    add(WEAKNESS.RISK, isLoss ? 95 : 80,
      'You confirmed you did not follow your risk management rules on this trade.');
  }
  if (rr != null && rr < 1) {
    add(WEAKNESS.RISK, isLoss ? 70 : 55,
      `Your risk/reward was 1:${rr.toFixed(2)} — you risked more than you stood to gain.`);
  }

  // ── Discipline ─────────────────────────────────────────────────────────
  if (plan === false) {
    add(WEAKNESS.DISCIPLINE, isLoss ? 85 : 70,
      'You confirmed you did not follow your trading plan on this trade.');
  }

  // ── Emotion-driven weaknesses ──────────────────────────────────────────
  if (emotion === 'Revenge') {
    add(WEAKNESS.REVENGE, 92, 'You logged Revenge as your emotional state — this trade was a reaction, not a setup.');
    add(WEAKNESS.EMOTIONAL, 75, 'The entry was driven by emotion rather than by your plan.');
  } else if (emotion === 'FOMO') {
    add(WEAKNESS.FOMO, 84, 'You logged FOMO — the entry was a chase rather than a planned setup.');
    add(WEAKNESS.EMOTIONAL, 70, 'The entry was driven by emotion rather than by your plan.');
  } else if (emotion === 'Fear' || emotion === 'Greed') {
    add(WEAKNESS.EMOTIONAL, isLoss ? 68 : 50,
      `You logged ${emotion} during this trade — it likely affected your entry or exit timing.`);
    if (emotion === 'Fear' && isLoss) {
      add(WEAKNESS.POOR_EXIT, 55, 'Fear commonly causes an early exit before the setup can resolve.');
    }
  }

  // ── Psychology: overconfidence / confidence mismatch ───────────────────
  if (isLoss && conf != null && conf >= 8) {
    add(WEAKNESS.PSYCHOLOGY, 62,
      `You rated your confidence ${conf}/10 but the trade lost — check for overconfidence bias.`);
  }
  if (!isLoss && conf != null && conf <= 3 && result === 'PROFIT') {
    add(WEAKNESS.PSYCHOLOGY, 35,
      `You won at only ${conf}/10 confidence — a profitable result does not validate an unplanned entry.`);
  }

  // ── Technical / entry quality ──────────────────────────────────────────
  if (!reason) {
    add(WEAKNESS.TECHNICAL, isLoss ? 66 : 48,
      'No trade reason was recorded — an entry you cannot explain cannot be reviewed or repeated.');
    add(WEAKNESS.POOR_ENTRY, isLoss ? 58 : 40, 'The entry has no documented technical trigger.');
  } else if (reason.length < 15) {
    add(WEAKNESS.TECHNICAL, isLoss ? 50 : 35,
      'Your trade reason is too thin to review — describe the actual setup and trigger.');
  }

  // ── Exit quality ───────────────────────────────────────────────────────
  if (!hasTP) {
    add(WEAKNESS.POOR_EXIT, isLoss ? 60 : 45,
      'No take profit was defined — your exit was discretionary rather than planned.');
  }

  // ── Fundamental awareness ──────────────────────────────────────────────
  if (isLoss && NEWS_RX.test(reason)) {
    add(WEAKNESS.FUNDAMENTAL, 58,
      'This losing trade referenced a news/fundamental event — event volatility appears to have worked against you.');
  }

  // ── Strengths — the positive counterpart, so a clean trade is credited for
  //    what it did right rather than just "no weaknesses found". ──────────
  if (risk === true) addStrength(STRENGTH.RISK_FOLLOWED, 'You confirmed you followed your risk management rules.');
  if (plan === true) addStrength(STRENGTH.PLAN_FOLLOWED, 'You confirmed you followed your trading plan.');
  if (emotion && ['Calm', 'Confidence', 'Patience', 'Discipline'].includes(emotion)) {
    addStrength(STRENGTH.CALM_EXECUTION, `You logged ${emotion} — a controlled emotional state during execution.`);
  }
  if (reason && reason.length >= 15) {
    addStrength(STRENGTH.CLEAR_SETUP, 'Your trade reason documents a real, reviewable technical trigger.');
  }
  if (rr != null && rr >= 2) {
    addStrength(STRENGTH.GOOD_RR, `Your risk/reward was 1:${rr.toFixed(2)} — reward outweighed the risk taken.`);
  }
  if (hasTP) {
    addStrength(STRENGTH.DEFINED_EXIT, 'You set a take profit before the trade played out, not after.');
  }

  // ── Context-aware patterns (need the user's other trades) ──────────────
  const recent = Array.isArray(ctx.recentTrades) ? ctx.recentTrades : [];
  const at = t.created_at ? new Date(t.created_at).getTime() : null;
  if (at && recent.length) {
    const others = recent.filter((r) => r && r.id !== t.id && r.created_at);

    // Overtrading: 5+ trades by this user inside the same calendar day.
    const day = new Date(at).toISOString().slice(0, 10);
    const sameDay = others.filter((r) => String(r.created_at).slice(0, 10) === day).length + 1;
    if (sameDay >= 5) {
      add(WEAKNESS.OVERTRADING, 72,
        `This was trade #${sameDay} for you on ${day} — high trade frequency erodes selectivity.`);
    }

    // Revenge trading: opened within 60 min of closing a loss.
    const priorLoss = others
      .filter((r) => {
        const rt = new Date(r.created_at).getTime();
        const rLoss = (r.result || (num(r.pnl) < 0 ? 'LOSS' : null)) === 'LOSS';
        return rLoss && rt < at && (at - rt) <= 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (priorLoss) {
      const mins = Math.round((at - new Date(priorLoss.created_at).getTime()) / 60000);
      add(WEAKNESS.REVENGE, 78,
        `You opened this trade ${mins} min after a losing trade — a classic revenge-trading window.`);
    }
  }

  // ── Rank by severity, de-duplicate (keep the strongest reason per code) ─
  const best = new Map();
  for (const w of found) {
    const prev = best.get(w.code);
    if (!prev || w.severity > prev.severity) best.set(w.code, w);
  }
  const weaknesses = [...best.values()].sort((a, b) => b.severity - a.severity);

  const primary   = weaknesses[0] || null;
  const secondary = weaknesses[1] || null;

  const strengthBest = new Map();
  for (const s of foundStrengths) if (!strengthBest.has(s.code)) strengthBest.set(s.code, s);
  const strengths = [...strengthBest.values()];

  // ── Recurring mistakes — look across the trader's history, not just this
  //    trade. A weakness only counts as "recurring" once it has shown up as
  //    the PRIMARY issue on 3+ trades within the last 10 (this one included).
  const recurringPatterns = buildRecurringPatterns(primary, recent, t.id);

  const recommendation = primary
    ? (RECOMMENDATION[primary.code] || RECOMMENDATION['discipline-weak'])
    : (result === 'PROFIT'
        ? 'Clean, rule-following trade. Repeat this process — the process is the edge, not the result.'
        : 'No rule breaks detected. This loss looks like normal strategy variance — keep following the plan.');

  return {
    result,
    weaknesses,
    strengths,
    recurringPatterns,
    primary:   primary   ? primary.label   : null,
    secondary: secondary ? secondary.label : null,
    primary_code: primary ? primary.code : null,
    recommendation,
    nextAction: recommendation,
    summary: buildSummary(result, primary, secondary),
    coachNote: buildCoachNote(result, primary, strengths, recurringPatterns, recommendation),
    scores: scoreTrade(t, weaknesses),
    engine: 'ztu-journal-rules-v1',
    at: new Date().toISOString(),
  };
}

// Cross-trade pattern detection — "do not judge only one trade". Uses only the
// PRIMARY weakness code of each recent trade (already computed and stored by
// this same engine), so no extra scoring pass is needed over history.
function buildRecurringPatterns(primary, recent, currentId) {
  const history = (Array.isArray(recent) ? recent : [])
    .filter((r) => r && r.id !== currentId && r.ai_primary_code)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 9); // + the current trade = a 10-trade rolling window

  const tally = {};
  for (const r of history) tally[r.ai_primary_code] = (tally[r.ai_primary_code] || 0) + 1;
  if (primary) tally[primary.code] = (tally[primary.code] || 0) + 1;

  const windowSize = history.length + (primary ? 1 : 0);
  return Object.entries(tally)
    .filter(([, count]) => count >= 3)
    .map(([code, count]) => ({
      code, label: (WEAKNESS_BY_CODE[code] || {}).label || code,
      occurrences: count, windowSize,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

// Deterministic "coach voice" — a short paragraph that reads like a mentor's
// note, not a system log: leads with a real strength, names the thing that
// actually cost or earned the result, flags a recurring pattern if one
// exists, and closes on the single next action.
function buildCoachNote(result, primary, strengths, recurringPatterns, recommendation) {
  const parts = [];
  if (strengths.length) {
    parts.push(`You did ${strengths.length > 1 ? 'several things' : 'one thing'} right here — ${strengths.map((s) => s.label.toLowerCase()).join(', ')}. Keep that.`);
  }
  if (primary) {
    parts.push(`What worked against you: ${primary.label.toLowerCase()} — ${primary.why}`);
  } else {
    parts.push(result === 'PROFIT'
      ? 'This trade was executed cleanly with no rule breaks — the result followed the process.'
      : 'No rule breaks were found on this one; treat it as normal variance, not a mistake to fix.');
  }
  if (recurringPatterns.length) {
    const top = recurringPatterns[0];
    parts.push(`This is trade ${top.occurrences} of your last ${top.windowSize} where ${top.label.toLowerCase()} was the main issue — that is a pattern, not a one-off.`);
  }
  parts.push(`Next action: ${recommendation}`);
  return parts.join(' ');
}

function buildSummary(result, primary, secondary) {
  const head = result === 'LOSS' ? 'Reason for Loss' : result === 'PROFIT' ? 'Trade Review' : 'Breakeven Review';
  if (!primary) {
    return result === 'PROFIT'
      ? `${head}: executed to plan with no rule breaks detected.`
      : `${head}: no rule breaks detected — consistent with normal strategy variance.`;
  }
  const tail = secondary ? ` Secondary weakness: ${secondary.label}.` : '';
  return `${head}: Main weakness: ${primary.label}.${tail}`;
}

/**
 * Per-trade 0–100 scores. 100 = flawless on that dimension.
 * Each weakness deducts its severity from the dimension(s) it belongs to.
 */
function scoreTrade(t, weaknesses) {
  const DIM = {
    'risk-management-weak':    ['risk'],
    'poor-exit':               ['risk', 'technical'],
    'poor-entry':              ['risk', 'psychology', 'technical'],
    'psychology-weak':         ['psychology'],
    'emotional-trading':       ['psychology'],
    'fomo':                    ['psychology', 'discipline'],
    'revenge-trading':         ['psychology', 'discipline'],
    'discipline-weak':         ['discipline'],
    'overtrading':             ['discipline'],
    'technical-analysis-weak': ['technical'],
    'fundamental-analysis-weak': ['fundamental'],
  };
  const out = { risk: 100, psychology: 100, discipline: 100, technical: 100, fundamental: 100 };
  for (const w of weaknesses) {
    for (const d of (DIM[w.code] || [])) {
      // Scale the deduction so a single flag can't zero a dimension outright.
      out[d] -= Math.round(w.severity * 0.6);
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.max(0, Math.min(100, out[k]));
  return out;
}

/**
 * Roll per-trade analyses up into distributions.
 * Used by the admin panel (all users) and by the user dashboard (own trades).
 *
 * @param {Array} trades journal_trades rows that may carry `ai_analysis`.
 */
export function aggregateAnalyses(trades) {
  const list = Array.isArray(trades) ? trades : [];
  const weaknessCounts  = {};
  const emotionCounts   = {};
  const recommendations = {};
  const scoreTotals = { risk: 0, psychology: 0, discipline: 0, technical: 0, fundamental: 0 };
  let scored = 0;
  let planBreaks = 0, planAnswered = 0;
  let riskBreaks = 0, riskAnswered = 0;

  for (const t of list) {
    const a = t && t.ai_analysis && typeof t.ai_analysis === 'object' ? t.ai_analysis : null;
    if (a && Array.isArray(a.weaknesses)) {
      // Count the PRIMARY weakness once (what the trade is "about"), and every
      // detected weakness for the fuller distribution.
      for (const w of a.weaknesses) {
        if (!w || !w.label) continue;
        weaknessCounts[w.label] = (weaknessCounts[w.label] || 0) + 1;
      }
    }
    if (a && a.recommendation) {
      recommendations[a.recommendation] = (recommendations[a.recommendation] || 0) + 1;
    }
    if (a && a.scores) {
      scoreTotals.risk        += Number(a.scores.risk        ?? 100);
      scoreTotals.psychology  += Number(a.scores.psychology  ?? 100);
      scoreTotals.discipline  += Number(a.scores.discipline  ?? 100);
      scoreTotals.technical   += Number(a.scores.technical   ?? 100);
      scoreTotals.fundamental += Number(a.scores.fundamental ?? 100);
      scored++;
    }
    if (t && t.emotion) emotionCounts[t.emotion] = (emotionCounts[t.emotion] || 0) + 1;
    if (t && t.followed_plan != null) { planAnswered++; if (t.followed_plan === false) planBreaks++; }
    if (t && t.followed_risk != null) { riskAnswered++; if (t.followed_risk === false) riskBreaks++; }
  }

  const rank = (obj) => Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  return {
    analyzed: scored,
    mostCommonMistakes: rank(weaknessCounts),
    psychologyDistribution: rank(emotionCounts),
    topRecommendations: rank(recommendations),
    avgScores: scored ? {
      risk:        Math.round(scoreTotals.risk / scored),
      psychology:  Math.round(scoreTotals.psychology / scored),
      discipline:  Math.round(scoreTotals.discipline / scored),
      technical:   Math.round(scoreTotals.technical / scored),
      fundamental: Math.round(scoreTotals.fundamental / scored),
    } : null,
    planBreakRate: planAnswered ? (planBreaks / planAnswered) * 100 : null,
    riskBreakRate: riskAnswered ? (riskBreaks / riskAnswered) * 100 : null,
  };
}
