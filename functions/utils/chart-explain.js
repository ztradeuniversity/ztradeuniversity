// functions/utils/chart-explain.js
// ════════════════════════════════════════════════════════════════════════════
// CHART EXPLANATION ENGINE (Module 7) + SAFETY (Module 9). Server-side, pure.
// Turns the shared annotation set into an educational explanation: patterns,
// trend, support/resistance, BOS, CHOCH. Probability + logic only — NEVER a
// signal, direction guarantee, or buy/sell advice.
//
// Consumes the annotation JSON shape defined in /assets/chart-annotations.js
// (no cross-dir import needed — it reads .type/.label/.level/.confidence/.meta).
// ════════════════════════════════════════════════════════════════════════════

import { PATTERN_EDU } from './pattern-engine.js';

// Structure education not covered by PATTERN_EDU.
const STRUCTURE_EDU = {
  trend:        { name: 'Trend', logic: 'the dominant direction of higher highs/lows (up) or lower highs/lows (down); flat = range.', watch: 'whether the structure keeps holding or breaks.' },
  support:      { name: 'Support', logic: 'a level where price has repeatedly stopped falling — buyers reacted.', watch: 'a clean break (support can become resistance) vs. another bounce.' },
  resistance:   { name: 'Resistance', logic: 'a level where price has repeatedly stopped rising — sellers reacted.', watch: 'a decisive break vs. another rejection.' },
  bos:          { name: 'Break of Structure (BOS)', logic: 'price closed beyond the prior swing in the trend direction — a continuation cue.', watch: 'follow-through vs. a failed break/retest.' },
  choch:        { name: 'Change of Character (CHOCH)', logic: 'the first counter-trend structure break — an early *possible* shift in control.', watch: 'confirmation; CHOCH alone is tentative, not a reversal guarantee.' },
};

export const SAFETY_NOTE =
  '\n\n_⚠️ Educational purpose only — not financial advice. No guaranteed outcomes. ' +
  'This is structure analysis, not a buy/sell signal._';

function eduFor(type) {
  return PATTERN_EDU[type] || STRUCTURE_EDU[type] || null;
}

// Build the educational explanation from annotations (Module 7).
export function explainAnnotations(annotations = [], { chartType } = {}) {
  if (!Array.isArray(annotations) || !annotations.length) {
    return `## 📊 Chart Analysis (educational)\nI couldn't lock onto clear structure in that image. Try a cleaner candle/line screenshot with visible swing points.` + SAFETY_NOTE;
  }

  const byType = {};
  for (const a of annotations) (byType[a.type] = byType[a.type] || []).push(a);
  const frame = (a) => a.level === 'possible' ? `*possible*` : `detected`;

  let out = `## 📊 Chart Analysis (educational)\n`;
  if (chartType && chartType !== 'unknown') out += `_Read as a **${chartType}** chart._\n`;

  // Trend
  const trend = (byType.trend || [])[0];
  if (trend) {
    const e = STRUCTURE_EDU.trend;
    out += `\n**Overall trend:** ${trend.meta?.trend || trend.label} _(${frame(trend)}, ${trend.confidencePct}%)_ — ${e.logic}\n`;
  }

  // Patterns
  const patternTypes = ['double-top','double-bottom','symmetrical-triangle','ascending-triangle','descending-triangle','channel','range'];
  const patterns = annotations.filter(a => patternTypes.includes(a.type));
  if (patterns.length) {
    out += `\n**Patterns:**\n`;
    for (const p of patterns.slice(0, 3)) {
      const e = eduFor(p.type);
      out += `\n### ${p.displayLabel} _(${p.confidencePct}% confidence)_\n`;
      if (e) {
        out += `- **Why detected:** ${e.logic}\n`;
        if (e.expected) out += `- **Pattern logic:** ${e.expected}\n`;
        out += `- **What to watch:** ${e.watch}\n`;
      }
    }
  }

  // Support / Resistance
  const sup = (byType.support || []).length, res = (byType.resistance || []).length;
  if (sup || res) {
    out += `\n**Key levels:** ${res} resistance zone(s) and ${sup} support zone(s) detected. ` +
      `${STRUCTURE_EDU.support.watch}\n`;
  }

  // Structure: BOS / CHOCH
  for (const t of ['bos', 'choch']) {
    const items = byType[t] || [];
    if (items.length) {
      const e = STRUCTURE_EDU[t];
      const a = items[0];
      out += `\n**${e.name}** _(${frame(a)}, ${a.confidencePct}%)_ — ${e.logic} **What to watch:** ${e.watch}\n`;
    }
  }

  out += `\n📐 Want me to relate this to internal lessons? Ask about the pattern or "market structure" and I'll pull the relevant guide.`;
  return out + SAFETY_NOTE;
}
