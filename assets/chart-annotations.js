// assets/chart-annotations.js
// ════════════════════════════════════════════════════════════════════════════
// ANNOTATION MODEL (Module 4) + CONFIDENCE SYSTEM (Module 6)
//
// The SINGLE shared format every chart detection emits and every renderer /
// explainer consumes. Pure, dependency-free, isomorphic (browser + server).
// Lives in /assets/ so the client can import it directly (Cloudflare serves
// /functions/* as Functions, not static files); the server consumes the same
// JSON shape by convention.
// ════════════════════════════════════════════════════════════════════════════

export const ANNOTATION_TYPES = [
  'trend', 'support', 'resistance', 'swing-high', 'swing-low',
  'double-top', 'double-bottom', 'symmetrical-triangle',
  'ascending-triangle', 'descending-triangle', 'channel', 'range',
  'bos', 'choch', 'pattern-box',
];

// Geometry kinds (coordinates are in NORMALIZED image pixels of the analysed canvas)
//   hline: { y }                         → horizontal level across the chart
//   line:  { x1, y1, x2, y2 }            → sloped line / break marker
//   box:   { x, y, w, h }                → pattern / structure zone
//   point: { x, y }                      → swing marker
export const GEOMETRY_KINDS = ['hline', 'line', 'box', 'point'];

// ── MODULE 6 — CONFIDENCE SYSTEM ─────────────────────────────────────────────
export const CONFIDENCE_THRESHOLD = 0.6;   // ≥ → "detected", below → "possible"

export function confidenceLevel(score) {
  const s = Number(score) || 0;
  return s >= CONFIDENCE_THRESHOLD ? 'detected' : 'possible';
}

export function confidencePct(score) {
  return Math.round((Number(score) || 0) * 100);
}

// ── ANNOTATION FACTORY ───────────────────────────────────────────────────────
// makeAnnotation({ type, label, confidence(0..1), geometry, meta })
export function makeAnnotation({ type, label, confidence = 0.5, geometry = null, meta = {} } = {}) {
  const score = Math.max(0, Math.min(1, Number(confidence) || 0));
  const level = confidenceLevel(score);
  return {
    type,
    label: label || type,
    confidence: score,                 // 0..1
    confidencePct: confidencePct(score),
    level,                             // 'detected' | 'possible'
    displayLabel: level === 'possible' ? `Possible ${label || type}` : (label || type),
    geometry,                          // {kind, ...coords} | null
    meta: meta || {},
  };
}

export function isValidAnnotation(a) {
  return !!a && ANNOTATION_TYPES.includes(a.type) && typeof a.confidence === 'number';
}

// Summarise an annotation set (for storage / quick display).
export function summarizeAnnotations(annotations = []) {
  const detected = annotations.filter(a => a.level === 'detected');
  const possible = annotations.filter(a => a.level === 'possible');
  const byType = {};
  for (const a of annotations) byType[a.type] = (byType[a.type] || 0) + 1;
  return {
    total: annotations.length,
    detected: detected.length,
    possible: possible.length,
    byType,
    patterns: annotations.filter(a => /top|bottom|triangle|channel|range|wedge|flag/.test(a.type)).map(a => a.type),
    hasStructure: annotations.some(a => a.type === 'bos' || a.type === 'choch'),
  };
}

// Consistent colour/style policy for the overlay renderer (Module 5).
export const STYLE = {
  support:     { color: 'rgba(16,185,129,0.95)', label: 'Support' },
  resistance:  { color: 'rgba(239,68,68,0.95)',  label: 'Resistance' },
  'swing-high':{ color: 'rgba(239,68,68,0.9)',   label: '' },
  'swing-low': { color: 'rgba(16,185,129,0.9)',  label: '' },
  trend:       { color: 'rgba(212,174,94,0.95)', label: 'Trend' },
  bos:         { color: 'rgba(96,165,250,0.95)', label: 'BOS' },
  choch:       { color: 'rgba(167,139,250,0.95)',label: 'CHOCH' },
  'pattern-box':{ color: 'rgba(230,201,135,0.9)',label: '' },
  _default:    { color: 'rgba(230,201,135,0.9)', label: '' },
};
export function styleFor(type) { return STYLE[type] || STYLE._default; }
