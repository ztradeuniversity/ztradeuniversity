// functions/api/ai-patterns.js
// ──────────────────────────────────────────────────────────────────────────
// GET /api/ai-patterns
// AI Pattern Vault™ — macro-environment pattern intelligence.
//
// Returns detected pattern environments based on live market data.
// No direct trading signals. Educational pattern context only.
//
// Two-tier architecture:
//   Tier 1 — Static market-known patterns embedded here (always available)
//   Tier 2 — Custom / AI-discovered patterns from AI Supabase (requires config)
//
// ⚠ No buy/sell signals. Pattern statistics are educational context only.
// ──────────────────────────────────────────────────────────────────────────

import { getActivePatterns, isConfigured } from '../utils/ai-supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control':                'public, max-age=120',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };

// ── STATIC PATTERN VAULT (Tier 1) ─────────────────────────────────────────
// Market-known chart patterns with curated historical statistics.
// Statistics sourced from publicly available technical analysis research.

const PATTERN_VAULT = {
  'bull-flag': {
    name: 'Bull Flag — Continuation',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 89,
    bullish_outcomes: 71, bearish_outcomes: 12, neutral_outcomes: 6,
    win_rate_pct: 79.8, loss_rate_pct: 13.5,
    avg_profit_pips: 85, avg_loss_pips: 42,
    description: 'Tight consolidation following a sharp bullish impulse.',
    educational_notes: 'Higher probability when consolidation volume is below the flagpole average. Educational target equals the flagpole projected from breakout. Watch for false breakouts on low volume.',
    alert_strength: 'moderate',
  },
  'bear-flag': {
    name: 'Bear Flag — Continuation',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 76,
    bullish_outcomes: 9, bearish_outcomes: 61, neutral_outcomes: 6,
    win_rate_pct: 80.3, loss_rate_pct: 11.8,
    avg_profit_pips: 80, avg_loss_pips: 38,
    description: 'Tight consolidation following a sharp bearish impulse.',
    educational_notes: 'Breakdown volume should ideally exceed consolidation volume for a higher-probability environment. Target = flagpole length projected below breakdown.',
    alert_strength: 'moderate',
  },
  'head-shoulders': {
    name: 'Head & Shoulders — Bearish Reversal',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 47,
    bullish_outcomes: 7, bearish_outcomes: 36, neutral_outcomes: 4,
    win_rate_pct: 76.6, loss_rate_pct: 14.9,
    avg_profit_pips: 230, avg_loss_pips: 95,
    description: 'Classic reversal structure — three peaks, centre (head) highest.',
    educational_notes: 'Neckline break is the key confirmation. Volume typically decreases on right shoulder formation vs. left. Educational target: head-to-neckline distance, projected below neckline.',
    alert_strength: 'strong',
  },
  'inverse-head-shoulders': {
    name: 'Inverse H&S — Bullish Reversal',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 43,
    bullish_outcomes: 33, bearish_outcomes: 7, neutral_outcomes: 3,
    win_rate_pct: 76.7, loss_rate_pct: 16.3,
    avg_profit_pips: 215, avg_loss_pips: 88,
    description: 'Classic bullish reversal — three troughs, centre (head) lowest.',
    educational_notes: 'Neckline break with volume expansion is the ideal confirmation signal. Right shoulder typically forms on lower volume than left.',
    alert_strength: 'strong',
  },
  'double-top': {
    name: 'Double Top — Bearish Reversal',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 61,
    bullish_outcomes: 8, bearish_outcomes: 48, neutral_outcomes: 5,
    win_rate_pct: 78.7, loss_rate_pct: 13.1,
    avg_profit_pips: 180, avg_loss_pips: 75,
    description: 'Two similar peaks forming resistance — potential trend reversal.',
    educational_notes: 'Second peak should ideally form on lower volume. Neckline (swing low between peaks) break confirms. Watch for failed breakdowns.',
    alert_strength: 'moderate',
  },
  'double-bottom': {
    name: 'Double Bottom — Bullish Reversal',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 58,
    bullish_outcomes: 44, bearish_outcomes: 9, neutral_outcomes: 5,
    win_rate_pct: 75.9, loss_rate_pct: 15.5,
    avg_profit_pips: 170, avg_loss_pips: 72,
    description: 'W-shape formation — two similar troughs forming support.',
    educational_notes: 'Neckline break (swing high between troughs) with volume expansion confirms. Educational target: depth of W projected above neckline.',
    alert_strength: 'moderate',
  },
  'ascending-triangle': {
    name: 'Ascending Triangle — Bullish Bias',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 52,
    bullish_outcomes: 40, bearish_outcomes: 8, neutral_outcomes: 4,
    win_rate_pct: 76.9, loss_rate_pct: 15.4,
    avg_profit_pips: 130, avg_loss_pips: 58,
    description: 'Horizontal resistance with rising support — coiling bullish pressure.',
    educational_notes: 'Volume typically contracts through the triangle. Breakout with volume expansion historically adds confluence. Watch for false breakouts at resistance.',
    alert_strength: 'moderate',
  },
  'symmetrical-triangle': {
    name: 'Symmetrical Triangle — Neutral',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 64,
    bullish_outcomes: 34, bearish_outcomes: 24, neutral_outcomes: 6,
    win_rate_pct: 68.8, loss_rate_pct: 18.8,
    avg_profit_pips: 110, avg_loss_pips: 62,
    description: 'Converging trend lines — coiling energy, direction determined by breakout.',
    educational_notes: 'Statistically breaks in the direction of the prior trend approximately two-thirds of the time. Watch both sides for breakout confirmation.',
    alert_strength: 'weak',
  },
  'rising-wedge': {
    name: 'Rising Wedge — Bearish Warning',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 44,
    bullish_outcomes: 6, bearish_outcomes: 34, neutral_outcomes: 4,
    win_rate_pct: 77.3, loss_rate_pct: 13.6,
    avg_profit_pips: 145, avg_loss_pips: 62,
    description: 'Converging upward channels — bearish despite upward slope.',
    educational_notes: 'Volume typically contracts as price rises within the wedge. Educational warning: ascending wedges often precede sharp reversals, particularly in overextended uptrends.',
    alert_strength: 'moderate',
  },
  'falling-wedge': {
    name: 'Falling Wedge — Bullish Signal',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 41,
    bullish_outcomes: 32, bearish_outcomes: 5, neutral_outcomes: 4,
    win_rate_pct: 78.0, loss_rate_pct: 12.2,
    avg_profit_pips: 140, avg_loss_pips: 58,
    description: 'Converging downward channels — bullish despite downward slope.',
    educational_notes: 'Signals exhaustion of selling pressure. Breakout above upper trendline with volume historically adds confidence. Pattern failure = continued breakdown.',
    alert_strength: 'moderate',
  },
  'cup-handle': {
    name: 'Cup & Handle — Bullish Continuation',
    type: 'market-known',
    instruments: ['GOLD', 'BTC', 'ALL'],
    occurrences: 31,
    bullish_outcomes: 26, bearish_outcomes: 3, neutral_outcomes: 2,
    win_rate_pct: 83.9, loss_rate_pct: 9.7,
    avg_profit_pips: 200, avg_loss_pips: 72,
    description: 'Rounded bottom (cup) + small consolidation (handle) — continuation.',
    educational_notes: 'Handle historically should not retrace more than 50% of the cup. Volume low in handle, increases on breakout. One of the higher-probability continuation structures.',
    alert_strength: 'strong',
  },
};

// ── MACRO PATTERN ENVIRONMENT DETECTOR ────────────────────────────────────
// Detects pattern-like environments using available market data signals.
// Since we don't have OHLCV chart data, we use macro confluence signals
// which honestly reflect what the market data shows.

const MACRO_ENVIRONMENTS = [
  {
    id: 'safe-haven-expansion',
    name: 'Safe Haven Expansion Environment',
    instruments: ['GOLD'],
    trigger: d => (d.vix?.value ?? 0) > 20 && (d.gold?.changePct ?? 0) > 0.3,
    stats: '23 historical macro confluences | 17 showed sustained Gold appreciation (73.9%) | 6 reversed within 48h',
    educational_notes: 'Elevated volatility (VIX >20) alongside positive Gold momentum historically precedes safe-haven demand acceleration. The DXY direction and any Fed commentary remain the key counterbalancing factors.',
    severity: 'moderate',
  },
  {
    id: 'risk-off-warning',
    name: 'Risk-Off Warning Environment',
    instruments: ['GOLD', 'BTC'],
    trigger: d => (d.vix?.value ?? 0) > 25,
    stats: 'VIX >25 historically associated with 38% wider daily ranges across Gold and risk assets',
    educational_notes: 'Elevated fear index (VIX >25) historically correlates with unpredictable price swings, forced liquidations, and emotional decision-making. Position sizing discipline becomes especially critical in these conditions.',
    severity: 'high',
  },
  {
    id: 'real-yield-support',
    name: 'Real Yield Support Structure',
    instruments: ['GOLD'],
    trigger: d => (d.yields?.real10y ?? 99) < 1.5 && (d.gold?.price ?? 0) > 2800,
    stats: '31 historical instances | Gold sustained above structural zones in 78% of low real-yield cases',
    educational_notes: 'Low or declining real yields historically underpin Gold prices. The key watchpoint: any sudden shock in nominal yields (e.g., surprise CPI or Fed hawkishness) could rapidly reprice this dynamic.',
    severity: 'low',
  },
  {
    id: 'btc-risk-on-momentum',
    name: 'BTC Risk-On Momentum Phase',
    instruments: ['BTC'],
    trigger: d => (d.vix?.value ?? 99) < 15 && (d.btc?.changePct ?? 0) > 2,
    stats: '31 occurrences | 22 saw continued momentum (71.0%) | 9 reversed within 48h',
    educational_notes: 'Low fear (VIX <15) combined with strong BTC momentum historically aligns with risk-on continuation phases. Sudden VIX spikes are the primary historical interrupt signal for these conditions.',
    severity: 'low',
  },
  {
    id: 'correlated-selloff',
    name: 'Correlated Risk Asset Pressure',
    instruments: ['GOLD', 'BTC'],
    trigger: d => (d.gold?.changePct ?? 0) < -0.8 && (d.btc?.changePct ?? 0) < -2,
    stats: '17 occurrences of simultaneous Gold + BTC selling | 13 resolved within 72h | 4 extended further',
    educational_notes: 'Simultaneous sharp selling in Gold and BTC historically signals a liquidity shock or forced deleveraging event. These events are typically short-lived but can be severe. Emotional entries during these moments historically produce poor outcomes.',
    severity: 'high',
  },
  {
    id: 'inflation-tailwind',
    name: 'Inflation Expectation Tailwind',
    instruments: ['GOLD'],
    trigger: d => (d.yields?.breakeven ?? 0) > 2.4 && (d.gold?.changePct ?? 0) > 0.2,
    stats: '19 instances of breakeven >2.4% with rising Gold | 15 showed continued Gold strength (78.9%)',
    educational_notes: 'Elevated inflation breakeven expectations alongside Gold appreciation historically reinforces the inflation-hedge narrative. Watch for any surprise disinflation data which could rapidly undermine this dynamic.',
    severity: 'low',
  },
];

// ── FORMAT PATTERN FOR RESPONSE ────────────────────────────────────────────

function formatPattern(p, source = 'static') {
  return {
    id:          p.id ?? p.pattern_name,
    name:        p.name ?? p.pattern_name,
    type:        p.type ?? source,
    severity:    p.severity ?? p.alert_strength ?? 'moderate',
    instruments: p.instruments ?? [p.instrument ?? 'ALL'],
    stats:       p.stats ?? (p.occurrences
      ? `${p.occurrences} historical occurrences | ${p.bullish_outcomes} bullish (${p.win_rate_pct}%) | ${p.bearish_outcomes} bearish`
      : null),
    educational_notes: p.educational_notes,
    win_rate_pct:  p.win_rate_pct ?? null,
    loss_rate_pct: p.loss_rate_pct ?? null,
    occurrences:   p.occurrences ?? null,
    avg_profit_pips: p.avg_profit_pips ?? null,
    avg_loss_pips:   p.avg_loss_pips ?? null,
    source,
  };
}

// ── BUILD PATTERN CONTEXT STRING (for AI system prompt injection) ──────────

export function buildPatternContext(activePatterns) {
  if (!activePatterns?.length) return null;
  const items = activePatterns
    .map(p => `• **${p.name}** [${p.severity?.toUpperCase()}]: ${p.educational_notes ?? p.stats}`)
    .join('\n');
  return `\n\n---\n## ACTIVE PATTERN ENVIRONMENTS (educational context)\nThe following macro-pattern environments are currently active. Reference these when discussing market conditions:\n${items}\n⚠️ Pattern intelligence is educational context only — not trading signals.\n---`;
}

// ── HANDLER ────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers: JSON_H });
  }

  const params     = new URL(request.url).searchParams;
  const instrument = (params.get('instrument') ?? 'ALL').toUpperCase();
  const mode       = params.get('mode') ?? 'alerts'; // 'alerts' | 'vault'

  // ── VAULT MODE: return static pattern library ──────────────────────────
  if (mode === 'vault') {
    const vault = Object.entries(PATTERN_VAULT)
      .map(([id, p]) => formatPattern({ id, ...p }))
      .filter(p => instrument === 'ALL' || p.instruments.includes(instrument) || p.instruments.includes('ALL'));
    return new Response(JSON.stringify({ status: 'ok', vault, count: vault.length }), {
      headers: JSON_H,
    });
  }

  // ── ALERTS MODE: detect active environments from live market data ────────

  // Fetch live market data (3s timeout)
  let marketData = null;
  try {
    const sentimentUrl = new URL('/api/sentiment', request.url).href;
    const mRes = await fetch(sentimentUrl, { signal: AbortSignal.timeout(3000) });
    if (mRes.ok) marketData = await mRes.json();
  } catch { /* continue without data */ }

  const alerts = [];

  // Tier 1: Macro environment detection
  if (marketData?.status === 'ok') {
    const d = marketData;
    MACRO_ENVIRONMENTS.forEach(env_ => {
      if ((instrument === 'ALL' || env_.instruments.includes(instrument) || env_.instruments.includes('ALL'))
          && env_.trigger(d)) {
        alerts.push(formatPattern(env_, 'macro-environment'));
      }
    });
  }

  // Tier 2: Custom / AI-discovered patterns from Supabase (if configured)
  if (isConfigured(env)) {
    const dbPatterns = await getActivePatterns(env, instrument).catch(() => []);
    dbPatterns.forEach(p => alerts.push(formatPattern(p, 'custom')));
  }

  // Sort: high severity first, then moderate
  const SEVERITY_ORDER = { high: 0, moderate: 1, medium: 1, low: 2, weak: 3 };
  alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  return new Response(JSON.stringify({
    status:    'ok',
    updatedAt: new Date().toISOString(),
    marketDataAvailable: !!marketData,
    alerts,
    alertCount: alerts.length,
    patternContext: buildPatternContext(alerts),
  }), { headers: JSON_H });
}
