// functions/api/ai-chart.js
// ════════════════════════════════════════════════════════════════════════════
// CHART INTELLIGENCE API (Module 1 upload + Module 8 storage + Module 7 explain).
//
//   POST {action:'upload', deviceId, filename, dataUrl, chartType, instrument, timeframe}
//        → validate · store to PRIVATE chart-uploads bucket · create session
//        → { sessionId, imageRef, previewUrl, chartType }
//   POST {action:'save_analysis', sessionId, deviceId, trend, patterns, levels,
//         structure, annotations, annotatedRef }              → ai_chart_analyses
//   POST {action:'explain', annotations, chartType}           → educational text
//   GET  ?action=get&id=<sessionId>                            → stored analysis
//
// Tier-1 detection + overlay run on the CLIENT (assets/chart-vision-pro.js).
// Graceful: {configured:false} until ZTU Chatbot creds. Service key server-only.
// ════════════════════════════════════════════════════════════════════════════

import { isConfigured, uploadChart, createSession, saveAnalysis, getAnalysis } from '../utils/chart-store.js';
import { explainAnnotations } from '../utils/chart-explain.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

function decodeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { contentType: m[1], bytes };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // ── GET ────────────────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const u = new URL(request.url);
    if ((u.searchParams.get('action') || '') === 'get') {
      if (!isConfigured(env)) return json({ configured: false, analysis: null });
      return json({ configured: true, analysis: await getAnalysis(env, u.searchParams.get('id')) });
    }
    return json({ error: 'unknown action' }, 400);
  }

  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const { action } = body;

  // ── EXPLAIN (works without Supabase — pure educational) ─────────────────────
  if (action === 'explain') {
    return json({ explanation: explainAnnotations(body.annotations || [], { chartType: body.chartType }) });
  }

  if (!isConfigured(env)) return json({ configured: false, note: 'Chart storage not connected (ZTU Chatbot AI Supabase).' });

  // ── UPLOAD (Module 1) ───────────────────────────────────────────────────────
  if (action === 'upload') {
    const decoded = decodeDataUrl(body.dataUrl);
    if (!decoded) return json({ error: 'invalid image dataUrl' }, 400);
    if (!ACCEPTED.includes(decoded.contentType)) return json({ error: 'unsupported type — use PNG, JPG, or WEBP' }, 400);
    if (decoded.bytes.length > MAX_BYTES) return json({ error: 'image too large (max 8 MB)' }, 400);

    const deviceId = (body.deviceId || 'anon').slice(0, 80);
    const safe = (body.filename || 'chart.png').replace(/[^a-z0-9._-]/gi, '_').slice(-60);
    const path = `${deviceId}/${Date.now()}-${safe}`;
    const up = await uploadChart(env, path, decoded.bytes, decoded.contentType);
    if (!up) return json({ error: 'upload failed' }, 502);

    const session = await createSession(env, deviceId, {
      instrument: body.instrument, timeframe: body.timeframe, chartType: body.chartType, imageRef: up.path,
    });
    return json({ configured: true, sessionId: session?.id || null, imageRef: up.path, previewUrl: up.signedUrl, chartType: body.chartType || null });
  }

  // ── SAVE ANALYSIS (Module 8) ────────────────────────────────────────────────
  if (action === 'save_analysis') {
    const row = await saveAnalysis(env, body.sessionId, {
      deviceId: body.deviceId, imageRef: body.imageRef,
      trend: body.trend, patterns: body.patterns, levels: body.levels,
      structure: body.structure, annotations: body.annotations, annotatedRef: body.annotatedRef,
    });
    return json({ configured: true, saved: !!row, analysis: row });
  }

  return json({ error: `unknown action: ${action}` }, 400);
}
