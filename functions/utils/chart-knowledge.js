// functions/utils/chart-knowledge.js
// ════════════════════════════════════════════════════════════════════════════
// ARTICLE-AWARE CHART INTELLIGENCE — composes the production chart response in
// the required order (Module 6), internal-knowledge first (Module 7), educational
// only (Module 8). Built on existing engines; modifies none of them.
//
//   Order: 1 Pattern Detection · 2 Structure · 3 Historical Stats ·
//          4 Educational Explanation · 5 Related Article · 6 Related Image ·
//          7 Recommended Reading · 8 Risk Disclaimer
//
//   Priority (Module 7): Internal Articles → Pattern Vault → (Broker) → Trusted.
//   For a chart, only Articles + Pattern Vault apply; no external source is used.
// ════════════════════════════════════════════════════════════════════════════

import { PATTERN_EDU } from './pattern-engine.js';
import { getPatternStats, formatHistoricalStats } from './pattern-stats.js';
import { searchArticles, relatedArticles } from './article-knowledge.js';

const PATTERN_TYPES = new Set([
  'double-top', 'double-bottom', 'symmetrical-triangle', 'ascending-triangle',
  'descending-triangle', 'channel', 'range',
]);
const STRUCT_EDU = {
  bos:   'Break of Structure — price closed beyond the prior swing in the trend direction (a continuation cue).',
  choch: 'Change of Character — the first counter-trend structure break (an early *possible* shift; tentative until confirmed).',
};

const SAFETY =
  '\n\n_⚠️ Educational purpose only — not financial advice. No guaranteed outcomes. ' +
  'This is structure analysis, not a buy/sell signal or trade-entry advice._';

// Map a detected pattern to an article search query/category seed.
function patternQuery(type, label) {
  if (type === 'bos' || type === 'choch') return 'market structure ' + label;
  return label;
}

export async function buildRichChartResponse(env, { annotations = [], chartType, lang } = {}) {
  const detected = annotations.filter(a => a.level === 'detected');
  const patterns = detected.filter(a => PATTERN_TYPES.has(a.type));
  const structures = detected.filter(a => a.type === 'bos' || a.type === 'choch');
  const trend = annotations.find(a => a.type === 'trend');
  const sup = annotations.filter(a => a.type === 'support').length;
  const res = annotations.filter(a => a.type === 'resistance').length;

  let out = `## 📊 Chart Analysis (educational)\n`;
  if (chartType && chartType !== 'unknown') out += `_Read as a **${chartType}** chart._\n`;

  // 1) PATTERN DETECTION
  out += `\n### 1) Pattern Detection\n`;
  out += patterns.length
    ? patterns.slice(0, 3).map(p => `- **${p.displayLabel}** _(${p.confidencePct}% confidence)_`).join('\n') + '\n'
    : '- No high-confidence textbook pattern; treating this as structure-led.\n';

  // 2) STRUCTURE DETECTION
  out += `\n### 2) Structure Detection\n`;
  out += `- **Trend:** ${trend ? (trend.meta?.trend || trend.label) : '—'}\n`;
  out += `- **Levels:** ${res} resistance · ${sup} support zone(s)\n`;
  for (const s of structures) out += `- **${s.displayLabel}** _(${s.confidencePct}%)_ — ${STRUCT_EDU[s.type] || ''}\n`;

  // 3) HISTORICAL STATISTICS (Pattern Vault — internal)
  let statsBlock = '';
  for (const p of patterns.slice(0, 2)) {
    const st = await getPatternStats(env, p.type).catch(() => null);
    const f = formatHistoricalStats(st, p.label);
    if (f) statsBlock += f + '\n';
  }
  if (statsBlock) out += `\n### 3) Historical Statistics\n${statsBlock}`;

  // 4) EDUCATIONAL EXPLANATION (pattern logic)
  out += `\n### 4) Educational Explanation\n`;
  const eduItems = patterns.length ? patterns : [];
  if (eduItems.length) {
    for (const p of eduItems.slice(0, 2)) {
      const e = PATTERN_EDU[p.type];
      if (!e) continue;
      out += `- **${e.name}:** ${e.logic} ${e.expected || ''} _Watch:_ ${e.watch}\n`;
    }
  } else {
    out += `- Focus on whether the structure (higher lows / lower highs) keeps holding or breaks; reactions at the marked support/resistance zones are the cleanest tells.\n`;
  }

  // 5–7) ARTICLE-AWARE RELATED READING (Internal articles first — Modules 1,4,7)
  const seed = patterns[0] || structures[0] || trend;
  if (seed) {
    const q = patternQuery(seed.type, seed.label || seed.type);
    const hits = await searchArticles(env, { q, limit: 3 }).catch(() => []);
    if (hits && hits.length) {
      const top = hits[0];
      out += `\n### 5) Related Article\n📖 **[${top.title}](${top.slug || '#'})**${top.summary ? ` — ${top.summary}` : ''}\n`;

      const rel = await relatedArticles(env, top.id).catch(() => ({ related: [], images: [], next: null }));
      // 6) Related Image
      if (rel.images && rel.images.length) {
        const im = rel.images[0];
        out += `\n### 6) Related Image\n![${im.alt || top.title}](${im.url})\n${im.caption ? `_${im.caption}_\n` : ''}`;
      }
      // 7) Recommended Reading
      const next = rel.next || hits[1] || null;
      if (next) out += `\n### 7) Recommended Reading\n➡️ **[${next.title}](${next.slug || '#'})**\n`;
    }
  }

  // 8) RISK DISCLAIMER
  out += `\n### 8) Risk\n${SAFETY.trim()}`;
  return out;
}
