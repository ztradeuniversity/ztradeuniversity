// functions/utils/health-probes.js
// ════════════════════════════════════════════════════════════════════════════
// LIVE PROVIDER PROBES for OpenAI/Workers AI, Supabase (AI project), and
// Cloudflare Pages — the exact same pattern as functions/api/diagnose.js's
// FRED/Finnhub/TwelveData probes (AbortController timeout, key-presence
// short-circuit, classifyApiError normalization, uniform result shape). Reused,
// not reinvented — diagnose.js already proved this pattern for 3 providers.
// ════════════════════════════════════════════════════════════════════════════

import { classifyApiError } from './api-error.js';

const TIMEOUT_MS = 8000;

async function probeUrl(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    let body = '';
    try { body = await res.text(); } catch {}
    return { ok: res.ok, status: res.status, ms, body: body.slice(0, 400), error: null };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: null, ms: Date.now() - t0, body: '', error: err };
  }
}

function keyMeta(k) {
  const s = String(k || '').trim();
  return { keyPresent: s.length > 0, keyLength: s.length, key: s };
}

// ── OPENAI / WORKERS AI ──────────────────────────────────────────────────────
// Same 3-way "configured" check as composer-llm.js's llmConfigured() — probes
// whichever path is actually active, in the same priority order the chat engine
// itself uses (env.AI binding first, then OPENAI_*, then legacy LLM_ENDPOINT).
export async function probeOpenAI(env) {
  const service = 'OpenAI / Workers AI';
  if (env.AI && typeof env.AI.run === 'function') {
    const t0 = Date.now();
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout (Workers AI binding)')), TIMEOUT_MS));
      await Promise.race([
        env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
        timeout,
      ]);
      return {
        service, endpoint: 'Workers AI binding (env.AI)', keyPresent: true, keyLength: null,
        httpStatus: null, ok: true, errorCategory: null,
        rootCause: 'None — Workers AI binding responded', recommendedFix: '',
        responseSnippet: '(success — model call completed)', ms: Date.now() - t0, timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const cls = classifyApiError('Workers AI', err);
      return {
        service, endpoint: 'Workers AI binding (env.AI)', keyPresent: true, keyLength: null,
        httpStatus: null, ok: false, errorCategory: cls.category,
        rootCause: cls.error || cls.category, recommendedFix: cls.recommended_fix,
        responseSnippet: '', ms: Date.now() - t0, timestamp: new Date().toISOString(),
      };
    }
  }
  const openaiReady = String(env.OPENAI_ENABLED).toLowerCase() === 'true';
  const { keyPresent, keyLength, key } = keyMeta(env.OPENAI_API_KEY);
  if (openaiReady && keyPresent) {
    const probe = await probeUrl('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    const err = probe.error || (probe.ok ? null : new Error(`HTTP ${probe.status} from api.openai.com`));
    const cls = classifyApiError('OpenAI', err, probe.status);
    return {
      service, endpoint: 'GET /v1/models', keyPresent, keyLength, httpStatus: probe.status, ok: probe.ok,
      errorCategory: probe.ok ? null : cls.category,
      rootCause: probe.ok ? 'None — API responding correctly' : cls.category,
      recommendedFix: probe.ok ? '' : cls.recommended_fix,
      responseSnippet: probe.ok ? '(success — models list returned)' : probe.body.slice(0, 200) || cls.error,
      ms: probe.ms, timestamp: new Date().toISOString(),
    };
  }
  if (env.LLM_ENDPOINT && env.LLM_API_KEY) {
    const probe = await probeUrl(env.LLM_ENDPOINT, { headers: { Authorization: `Bearer ${env.LLM_API_KEY}` } });
    const err = probe.error || (probe.ok ? null : new Error(`HTTP ${probe.status} from ${env.LLM_ENDPOINT}`));
    const cls = classifyApiError('LLM endpoint', err, probe.status);
    return {
      service, endpoint: 'LLM_ENDPOINT (legacy)', keyPresent: true, keyLength: String(env.LLM_API_KEY).length,
      httpStatus: probe.status, ok: probe.ok, errorCategory: probe.ok ? null : cls.category,
      rootCause: probe.ok ? 'None — endpoint responding' : cls.category,
      recommendedFix: probe.ok ? '' : cls.recommended_fix,
      responseSnippet: probe.ok ? '(success)' : probe.body.slice(0, 200) || cls.error,
      ms: probe.ms, timestamp: new Date().toISOString(),
    };
  }
  return {
    service, endpoint: 'none configured', keyPresent: false, keyLength: 0, httpStatus: null, ok: false,
    errorCategory: 'Missing configuration',
    rootCause: 'Neither a Workers AI binding (env.AI), OPENAI_ENABLED+OPENAI_API_KEY, nor LLM_ENDPOINT+LLM_API_KEY is configured.',
    recommendedFix: 'Bind Workers AI to this Pages project, or set OPENAI_ENABLED=true + OPENAI_API_KEY in Cloudflare → Pages → Environment Variables.',
    responseSnippet: '(not attempted — nothing configured)', ms: 0, timestamp: new Date().toISOString(),
  };
}

// ── SUPABASE (AI / "ZTU Chatbot" project) ────────────────────────────────────
export async function probeSupabase(env) {
  const service = 'Supabase (AI project)';
  const { keyPresent, keyLength, key } = keyMeta(env.AI_SUPABASE_SERVICE_KEY);
  if (!env.AI_SUPABASE_URL || !keyPresent) {
    return {
      service, endpoint: 'GET /rest/v1/', keyPresent, keyLength, httpStatus: null, ok: false,
      errorCategory: 'Missing configuration',
      rootCause: 'AI_SUPABASE_URL or AI_SUPABASE_SERVICE_KEY is not set.',
      recommendedFix: 'Set AI_SUPABASE_URL and AI_SUPABASE_SERVICE_KEY in Cloudflare → Pages → Environment Variables, then redeploy.',
      responseSnippet: '(not attempted — key missing)', ms: 0, timestamp: new Date().toISOString(),
    };
  }
  const probe = await probeUrl(`${env.AI_SUPABASE_URL}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const err = probe.error || (probe.ok ? null : new Error(`HTTP ${probe.status} from ${env.AI_SUPABASE_URL}`));
  const cls = classifyApiError('Supabase', err, probe.status);
  return {
    service, endpoint: 'GET /rest/v1/', keyPresent, keyLength, httpStatus: probe.status, ok: probe.ok,
    errorCategory: probe.ok ? null : cls.category,
    rootCause: probe.ok ? 'None — PostgREST responding correctly' : cls.category,
    recommendedFix: probe.ok ? '' : cls.recommended_fix,
    responseSnippet: probe.ok ? '(success — PostgREST root reachable)' : probe.body.slice(0, 200) || cls.error,
    ms: probe.ms, timestamp: new Date().toISOString(),
  };
}

// ── CLOUDFLARE PAGES ─────────────────────────────────────────────────────────
// Honest by design: there is no external "Cloudflare platform health" endpoint
// to ping that would mean anything more than what's already true — this code is
// a Cloudflare Pages Function, so if it's executing, Cloudflare is serving
// requests. Fabricating a separate network call here would not prove anything
// this one fact doesn't already prove.
export async function probeCloudflare(env) {
  return {
    service: 'Cloudflare Pages', endpoint: '(self — this request)', keyPresent: true, keyLength: null,
    httpStatus: 200, ok: true, errorCategory: null,
    rootCause: 'None — this response was served by Cloudflare Pages Functions, which is proof the platform is up.',
    recommendedFix: '', responseSnippet: '(self-evident)', ms: 0, timestamp: new Date().toISOString(),
  };
}

export async function runHealthProbes(env) {
  const [openai, supabase, cloudflare] = await Promise.allSettled([
    probeOpenAI(env), probeSupabase(env), probeCloudflare(env),
  ]);
  const unwrap = (r, service) => r.status === 'fulfilled' ? r.value : { service, ok: false, rootCause: r.reason?.message || 'probe threw', httpStatus: null, ms: 0 };
  return [
    unwrap(openai, 'OpenAI / Workers AI'),
    unwrap(supabase, 'Supabase (AI project)'),
    unwrap(cloudflare, 'Cloudflare Pages'),
  ];
}
