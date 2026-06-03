// functions/utils/chart-pipeline.js
// ════════════════════════════════════════════════════════════════════════════
// CHART UPLOAD PIPELINE (Module 4) + PATTERN DETECTION FOUNDATION (Module 5)
// ARCHITECTURE / FOUNDATION ONLY — no new processing is wired here.
//
// Today (already live): the client (ai-trade-assistant.html → analyzeChartImage)
// performs Canvas-based detection and posts {trend, patterns, levels} as
// `chartAnalysis`; the server's chart-engine.buildChartResponse turns that into
// an educational explanation using pattern-engine.PATTERN_EDU.
//
// This module formalises the FUTURE end-to-end server pipeline so it can be
// swapped in without changing the explanation layer.
//
//   UPLOAD → PROCESSING → DETECTION → OVERLAY → EXPLANATION → RESPONSE
//
// GUARDRAILS (unchanged): no signals, no guaranteed direction — probability +
// education only.
// ════════════════════════════════════════════════════════════════════════════

import { PATTERN_CATALOG, PATTERN_EDU } from './pattern-engine.js';

// ── MODULE 4 — PIPELINE STAGES (contract) ────────────────────────────────────
export const CHART_PIPELINE = [
  { stage: 'upload',      input: 'image file',                 output: 'image ref / data URL',          owner: 'client (file input)',          status: 'live' },
  { stage: 'processing',  input: 'image',                      output: 'price series + canvas',         owner: 'client analyzeChartImage / future vision worker', status: 'live (client heuristic)' },
  { stage: 'detection',   input: 'price series / pixels',      output: '{trend, patterns[], levels[]}', owner: 'client heuristic / future detector', status: 'live (client heuristic)' },
  { stage: 'overlay',     input: 'patterns + levels',          output: 'annotated canvas',              owner: 'client (draws S/R + swings)',  status: 'live (basic)' },
  { stage: 'explanation', input: 'detection payload',          output: 'educational markdown',          owner: 'chart-engine.buildChartResponse', status: 'live' },
  { stage: 'response',    input: 'explanation',                output: 'trader-friendly reply (SSE)',   owner: 'ai-chat.js stream',            status: 'live' },
];

// ── MODULE 5 — PATTERN DETECTION FOUNDATION ──────────────────────────────────
// The catalog the pipeline targets (keys shared with pattern-engine & client).
export const SUPPORTED_PATTERNS = PATTERN_CATALOG;

// Per-pattern detection plan — documents how a FUTURE detector should confirm
// each structure. Education for each is already in pattern-engine.PATTERN_EDU.
export const PATTERN_DETECTION_PLAN = {
  'double-top':            'two swing highs at ~equal level + trough between; confirm neckline break',
  'double-bottom':         'two swing lows at ~equal level + peak between; confirm neckline break',
  'head-shoulders':        '3 highs, middle highest, outer two ~equal; confirm neckline',
  'inverse-head-shoulders':'3 lows, middle lowest, outer two ~equal; confirm neckline',
  'symmetrical-triangle':  'highs sloping down + lows sloping up (converging)',
  'ascending-triangle':    'flat highs + rising lows',
  'descending-triangle':   'flat lows + falling highs',
  'rising-wedge':          'highs & lows both rising, converging; bearish warning',
  'falling-wedge':         'highs & lows both falling, converging; bullish signal',
  'bull-flag':             'sharp up pole + tight down/sideways consolidation',
  'bear-flag':             'sharp down pole + tight up/sideways consolidation',
  'channel':               'parallel sloped highs & lows',
  'range':                 'flat highs & flat lows (horizontal band)',
  'breakout':              'decisive close beyond a established level + retest',
};

// FUTURE workflow each detected pattern follows:
//   detected → overlay generated → probability explanation → educational explanation
export const PATTERN_WORKFLOW = ['detected', 'overlay', 'probability', 'education'];

// FUTURE server-side entry point (stub). Client detection remains authoritative
// today; this is where a stronger server/vision detector would plug in.
export async function processChartUpload(/* { imageRef, instrument, timeframe } */) {
  return {
    configured: false,
    stage:      'not-implemented',
    note:       'Server-side chart processing is architecture-only. Client analyzeChartImage performs detection today; results flow to chart-engine for explanation.',
    pipeline:   CHART_PIPELINE.map(s => s.stage),
  };
}

// Helper: confirm a detected pattern key is supported + has education attached.
export function isKnownPattern(key) {
  return SUPPORTED_PATTERNS.includes(key) && !!PATTERN_EDU[key];
}
