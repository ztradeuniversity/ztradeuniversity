// assets/chart-vision-pro.js
// ════════════════════════════════════════════════════════════════════════════
// CHART VISION (Tier 1) — client-side, browser-native, no paid API.
//   M1 validateImage · M2 preprocess · M3 detectTier1 · M5 renderOverlay · M6 confidence
//
// Detection and rendering are SEPARATE (Module 5): detectTier1() returns
// annotations only; renderOverlay() draws them. Both speak the shared
// annotation schema (./chart-annotations.js). Education/safety live server-side
// (chart-explain.js) and in the existing chart-engine.
// ════════════════════════════════════════════════════════════════════════════

import { makeAnnotation, styleFor, summarizeAnnotations } from './chart-annotations.js';

// ── MODULE 1 — VALIDATION ────────────────────────────────────────────────────
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export function validateImage(file) {
  if (!file) return { ok: false, error: 'No file provided.' };
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: 'Please upload a PNG, JPG, or WEBP screenshot.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'Image is too large (max 8 MB).' };
  return { ok: true, type: file.type };
}

// ── MODULE 2 — PREPROCESSOR ──────────────────────────────────────────────────
// Resize, optimise, detect theme, locate the chart area, crop margins.
export function preprocess(img, targetW = 360) {
  const scale = targetW / img.width;
  const W0 = targetW, H0 = Math.max(80, Math.min(280, Math.round(img.height * scale)));
  const c0 = document.createElement('canvas'); c0.width = W0; c0.height = H0;
  const x0 = c0.getContext('2d', { willReadFrequently: true });
  x0.drawImage(img, 0, 0, W0, H0);
  const data = x0.getImageData(0, 0, W0, H0).data;
  const px = (x, y) => { const i = (y * W0 + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

  // Theme from corners
  const corners = [px(2, 2), px(W0 - 3, 2), px(2, H0 - 3), px(W0 - 3, H0 - 3)];
  const bg = [0, 1, 2].map(k => Math.round(corners.reduce((s, c) => s + c[k], 0) / corners.length));
  const theme = lum(bg) < 128 ? 'dark' : 'light';
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const TH = 70;

  // Content bounding box (chart area) — rows/cols that differ from background
  let minX = W0, maxX = 0, minY = H0, maxY = 0, content = false;
  let redCols = 0, greenCols = 0, heightSum = 0, colWithContent = 0;
  for (let x = 0; x < W0; x++) {
    let top = null, bot = null, red = false, green = false;
    for (let y = 0; y < H0; y++) {
      const p = px(x, y);
      if (dist(p, bg) > TH) {
        if (top === null) top = y; bot = y; content = true;
        if (p[0] > p[1] + 25 && p[0] > p[2] + 10) red = true;
        if (p[1] > p[0] + 15 && p[1] > p[2] + 10) green = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (top !== null) { colWithContent++; heightSum += (bot - top); if (red) redCols++; if (green) greenCols++; }
  }
  if (!content) return { ok: false, error: 'I couldn\'t read a chart in that image. Try a clean candle/line screenshot.', theme, chartType: 'unknown' };

  // Crop to chart area (+small pad)
  const pad = 2;
  minX = Math.max(0, minX - pad); maxX = Math.min(W0 - 1, maxX + pad);
  minY = Math.max(0, minY - pad); maxY = Math.min(H0 - 1, maxY + pad);
  const W = Math.max(20, maxX - minX), H = Math.max(20, maxY - minY);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(c0, minX, minY, W, H, 0, 0, W, H);

  // Chart type heuristic
  const avgH = colWithContent ? heightSum / colWithContent : 0;
  const colorful = (redCols + greenCols) > colWithContent * 0.25;
  const chartType = (avgH > H0 * 0.18 && colorful) ? 'candle' : (avgH < H0 * 0.12 ? 'line' : 'unknown');

  return { ok: true, canvas: c, dataUrl: c.toDataURL('image/png'), theme, chartType, area: { minX, minY, W, H, W0, H0 } };
}

// ── helpers: price series + swings ───────────────────────────────────────────
function priceSeries(canvas) {
  const W = canvas.width, H = canvas.height;
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  const data = cx.getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const corners = [px(2, 2), px(W - 3, 2), px(2, H - 3), px(W - 3, H - 3)];
  const bg = [0, 1, 2].map(k => Math.round(corners.reduce((s, c) => s + c[k], 0) / corners.length));
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const series = new Array(W).fill(null);
  for (let x = 0; x < W; x++) {
    let sum = 0, n = 0;
    for (let y = 0; y < H; y++) if (dist(px(x, y), bg) > 70) { sum += y; n++; }
    if (n) series[x] = sum / n;
  }
  for (let x = 0; x < W; x++) if (series[x] == null) {
    let l = x; while (l >= 0 && series[l] == null) l--;
    let r = x; while (r < W && series[r] == null) r++;
    series[x] = l < 0 ? series[r] : r >= W ? series[l] : series[l] + (series[r] - series[l]) * ((x - l) / (r - l));
  }
  const k = 4, sm = new Array(W).fill(0);
  for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let j = -k; j <= k; j++) { const xi = x + j; if (xi >= 0 && xi < W) { s += series[xi]; n++; } } sm[x] = s / n; }
  return sm.map(y => ({ y, price: H - y })); // price up = y down
}

function findSwings(series, W) {
  const win = Math.max(6, Math.round(W * 0.05));
  const highs = [], lows = [];
  for (let x = win; x < W - win; x++) {
    let hi = true, lo = true;
    for (let j = -win; j <= win; j++) {
      if (series[x + j].price > series[x].price + 0.5) hi = false;
      if (series[x + j].price < series[x].price - 0.5) lo = false;
    }
    if (hi) highs.push({ x, ...series[x] });
    if (lo) lows.push({ x, ...series[x] });
  }
  const dedupe = (arr, better) => { const o = []; for (const e of arr) { const last = o[o.length - 1]; if (last && Math.abs(last.x - e.x) < win) { if (better(e.price, last.price)) o[o.length - 1] = e; } else o.push(e); } return o; };
  return { highs: dedupe(highs, (a, b) => a > b), lows: dedupe(lows, (a, b) => a < b), win };
}

function slope(pts) { if (pts.length < 2) return 0; let n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0; for (const p of pts) { sx += p.x; sy += p.price; sxy += p.x * p.price; sxx += p.x * p.x; } const d = (n * sxx - sx * sx) || 1; return (n * sxy - sx * sy) / d; }

// ── MODULE 3 — TIER 1 DETECTION → annotations ────────────────────────────────
export function detectTier1(canvas) {
  const W = canvas.width, H = canvas.height;
  const series = priceSeries(canvas);
  const prices = series.map(s => s.price);
  const minP = Math.min.apply(null, prices), maxP = Math.max.apply(null, prices), range = Math.max(1, maxP - minP);
  const { highs, lows } = findSwings(series, W);
  const ann = [];

  // Trend
  const sN = slope(series.map((s, x) => ({ x, price: s.price }))) * W / range;
  let trend = sN > 0.15 ? 'uptrend' : sN < -0.15 ? 'downtrend' : 'range';
  ann.push(makeAnnotation({ type: 'trend', label: trend, confidence: Math.min(1, 0.5 + Math.abs(sN)),
    geometry: { kind: 'line', x1: 0, y1: series[0].y, x2: W - 1, y2: series[W - 1].y }, meta: { trend } }));

  // Support / Resistance (clustered swing levels)
  const cluster = (swings, kind) => {
    const tol = 0.05 * range, used = new Array(swings.length).fill(false);
    for (let i = 0; i < swings.length; i++) {
      if (used[i]) continue; let sum = swings[i].price, cnt = 1; used[i] = true;
      for (let j = i + 1; j < swings.length; j++) if (!used[j] && Math.abs(swings[j].price - swings[i].price) <= tol) { sum += swings[j].price; cnt++; used[j] = true; }
      if (cnt >= 2) {
        const price = sum / cnt, y = H - price;
        ann.push(makeAnnotation({ type: kind, label: kind === 'resistance' ? 'Resistance' : 'Support',
          confidence: Math.min(1, 0.45 + cnt * 0.15), geometry: { kind: 'hline', y }, meta: { touches: cnt } }));
      }
    }
  };
  cluster(highs, 'resistance'); cluster(lows, 'support');

  // Patterns
  const near = (a, b, tol) => Math.abs(a - b) <= tol * range;
  const boxAround = (xs, conf, type, label) => {
    const minx = Math.min(...xs), maxx = Math.max(...xs);
    ann.push(makeAnnotation({ type, label, confidence: conf, geometry: { kind: 'box', x: minx, y: 2, w: Math.max(8, maxx - minx), h: H - 4 } }));
  };
  if (highs.length >= 2 && near(highs[highs.length - 2].price, highs[highs.length - 1].price, 0.06))
    boxAround([highs[highs.length - 2].x, highs[highs.length - 1].x], 0.62, 'double-top', 'Double Top');
  if (lows.length >= 2 && near(lows[lows.length - 2].price, lows[lows.length - 1].price, 0.06))
    boxAround([lows[lows.length - 2].x, lows[lows.length - 1].x], 0.62, 'double-bottom', 'Double Bottom');

  const hN = slope(highs) * W / range, lN = slope(lows) * W / range, flat = v => Math.abs(v) < 0.12;
  if (flat(hN) && lN > 0.12)            boxAround([0, W - 1], 0.6, 'ascending-triangle', 'Ascending Triangle');
  else if (flat(lN) && hN < -0.12)      boxAround([0, W - 1], 0.6, 'descending-triangle', 'Descending Triangle');
  else if (hN < -0.1 && lN > 0.1)       boxAround([0, W - 1], 0.5, 'symmetrical-triangle', 'Symmetrical Triangle');
  else if (flat(hN) && flat(lN))        boxAround([0, W - 1], 0.6, 'range', 'Range');
  else if (Math.abs(hN - lN) < 0.08 && Math.abs(hN) > 0.1) boxAround([0, W - 1], 0.5, 'channel', 'Channel');

  // BOS / CHOCH from swing sequence
  const merged = [...highs.map(h => ({ ...h, kind: 'H' })), ...lows.map(l => ({ ...l, kind: 'L' }))].sort((a, b) => a.x - b.x);
  if (merged.length >= 4) {
    const lastHigh = highs[highs.length - 1], prevHigh = highs[highs.length - 2];
    const lastLow = lows[lows.length - 1], prevLow = lows[lows.length - 2];
    if (trend === 'uptrend' && lastHigh && prevHigh && lastHigh.price > prevHigh.price)
      ann.push(makeAnnotation({ type: 'bos', label: 'BOS (bullish)', confidence: 0.55,
        geometry: { kind: 'hline', y: H - prevHigh.price }, meta: { direction: 'bullish' } }));
    if (trend === 'downtrend' && lastLow && prevLow && lastLow.price < prevLow.price)
      ann.push(makeAnnotation({ type: 'bos', label: 'BOS (bearish)', confidence: 0.55,
        geometry: { kind: 'hline', y: H - prevLow.price }, meta: { direction: 'bearish' } }));
    // CHOCH = first counter-trend break
    if (trend === 'uptrend' && lastLow && prevLow && lastLow.price < prevLow.price)
      ann.push(makeAnnotation({ type: 'choch', label: 'CHOCH (bearish shift)', confidence: 0.5,
        geometry: { kind: 'hline', y: H - prevLow.price }, meta: { direction: 'bearish' } }));
    if (trend === 'downtrend' && lastHigh && prevHigh && lastHigh.price > prevHigh.price)
      ann.push(makeAnnotation({ type: 'choch', label: 'CHOCH (bullish shift)', confidence: 0.5,
        geometry: { kind: 'hline', y: H - prevHigh.price }, meta: { direction: 'bullish' } }));
  }

  // swing markers (low confidence, informational)
  highs.forEach(h => ann.push(makeAnnotation({ type: 'swing-high', label: '', confidence: 0.4, geometry: { kind: 'point', x: h.x, y: h.y } })));
  lows.forEach(l => ann.push(makeAnnotation({ type: 'swing-low', label: '', confidence: 0.4, geometry: { kind: 'point', x: l.x, y: l.y } })));

  return { annotations: ann, trend, summary: summarizeAnnotations(ann) };
}

// ── MODULE 5 — OVERLAY DRAWING (separate from detection) ─────────────────────
export function renderOverlay(baseCanvas, annotations, opts = {}) {
  const W = baseCanvas.width, H = baseCanvas.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d');
  cx.drawImage(baseCanvas, 0, 0);
  cx.font = '11px Inter, sans-serif'; cx.textBaseline = 'top';

  for (const a of annotations) {
    const st = styleFor(a.type); const g = a.geometry; if (!g) continue;
    const possible = a.level === 'possible';
    cx.strokeStyle = st.color; cx.fillStyle = st.color;
    cx.lineWidth = possible ? 1 : 2;
    cx.setLineDash(possible ? [4, 4] : (g.kind === 'hline' ? [6, 4] : []));
    if (g.kind === 'hline') { cx.beginPath(); cx.moveTo(0, g.y); cx.lineTo(W, g.y); cx.stroke(); }
    else if (g.kind === 'line') { cx.beginPath(); cx.moveTo(g.x1, g.y1); cx.lineTo(g.x2, g.y2); cx.stroke(); }
    else if (g.kind === 'box') { cx.strokeRect(g.x, g.y, g.w, g.h); }
    else if (g.kind === 'point') { cx.setLineDash([]); cx.beginPath(); cx.arc(g.x, g.y, 3, 0, 7); cx.fill(); continue; }
    cx.setLineDash([]);
    if (a.displayLabel && a.displayLabel.trim()) {
      const lx = g.kind === 'box' ? g.x + 3 : 4;
      const ly = g.kind === 'hline' ? Math.max(0, g.y - 13) : (g.kind === 'box' ? g.y + 3 : g.y1);
      const t = a.displayLabel; const tw = cx.measureText(t).width;
      cx.fillStyle = 'rgba(13,9,2,0.72)'; cx.fillRect(lx - 2, ly - 1, tw + 6, 14);
      cx.fillStyle = st.color; cx.fillText(t, lx + 1, ly);
    }
  }
  // Watermark (Module 9 reinforcement)
  const wm = 'Approximate · Educational · Not a signal';
  cx.font = '9px Inter, sans-serif'; const ww = cx.measureText(wm).width;
  cx.fillStyle = 'rgba(13,9,2,0.55)'; cx.fillRect(W - ww - 10, H - 16, ww + 8, 13);
  cx.fillStyle = 'rgba(255,255,255,0.7)'; cx.fillText(wm, W - ww - 6, H - 15);

  return { canvas: c, dataUrl: c.toDataURL('image/png') };
}

// ── ONE-CALL PIPELINE (validate handled by caller) ───────────────────────────
export function analyzeImage(img) {
  const pre = preprocess(img);
  if (!pre.ok) return { ok: false, error: pre.error, theme: pre.theme, chartType: pre.chartType };
  const det = detectTier1(pre.canvas);
  const overlay = renderOverlay(pre.canvas, det.annotations);
  return {
    ok: true,
    theme: pre.theme,
    chartType: pre.chartType,
    trend: det.trend,
    annotations: det.annotations,
    summary: det.summary,
    normalizedDataUrl: pre.dataUrl,
    annotatedDataUrl: overlay.dataUrl,
  };
}
