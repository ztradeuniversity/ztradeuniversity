// functions/utils/chart-engine.js
// ════════════════════════════════════════════════════════════════════════════
// CHART ENGINE — turns a detected chart-structure payload into an educational
// explanation (trend → patterns → levels → risk/psychology). No signals.
//
// ── CHART SCREENSHOT INTELLIGENCE ARCHITECTURE (current + future) ────────────
// Current:  client-side Canvas heuristics (analyzeChartImage) inspect the
//           uploaded screenshot, identify trend, support/resistance, and visible
//           patterns, then POST {trend, patterns, levels} as `chartAnalysis`.
// Future (architecture-ready, not wired): swap the detector for a stronger
//           vision worker that additionally returns liquidity zones and pattern
//           bounding boxes; this engine's explanation layer stays unchanged.
// ════════════════════════════════════════════════════════════════════════════

import { PATTERN_EDU } from './pattern-engine.js';
import { TELEGRAM }    from './response-engine.js';

export function buildChartResponse(chart, lang) {
  if (!chart) return null;
  const patterns = Array.isArray(chart.patterns) ? chart.patterns : [];
  let out = `## 📊 Chart Analysis (educational)\n`;

  if (chart.trend) {
    const tEdu = PATTERN_EDU[chart.trend];
    out += `\n**Overall structure:** ${tEdu ? tEdu.name : chart.trend}.\n`;
  }

  if (patterns.length) {
    out += `\n**Patterns detected:**\n`;
    for (const p of patterns.slice(0, 3)) {
      const e = PATTERN_EDU[p.key];
      if (!e) continue;
      const conf = p.confidence != null ? ` _(confidence: ${p.confidence})_` : '';
      out += `\n### ${e.name} — *${e.bias}*${conf}\n`;
      out += `- **Why detected:** ${e.logic}\n`;
      out += `- **Pattern logic:** ${e.expected}\n`;
      out += `- **What to watch:** ${e.watch}\n`;
    }
  } else {
    out += `\nI couldn't lock onto a classic textbook pattern with confidence, but here's the structure I can read:\n`;
  }

  if (chart.levels && chart.levels.length) {
    out += `\n**Key horizontal levels I can see** (approximate zones on your chart):\n`;
    for (const lv of chart.levels.slice(0, 4)) {
      out += `- ${lv.type === 'resistance' ? '🔴 Resistance' : '🟢 Support'} zone${lv.touches ? ` (~${lv.touches} touches)` : ''}\n`;
    }
  }

  out += `\n**⚠️ Risk & psychology angle:** patterns describe *probabilities, not certainties*. The cleanest setups still fail — so size for the loss, place your stop beyond the invalidation level, and never widen it emotionally if price approaches.\n`;
  out += `\n**This is educational structure analysis — not a buy/sell signal.** For live signals, our team posts them on [Telegram](${TELEGRAM}).`;
  out += `\n\n📊 Cross-check the live picture on [Live Market Sentiment](live-sentiment.html), or share your **entry, stop & target** and I'll assess the trade structure with you.`;
  return out;
}
