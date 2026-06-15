// functions/utils/composer-llm.js
// ════════════════════════════════════════════════════════════════════════════
// GENERATIVE COMPOSER (activation of the composer.setComposer seam)
// Turns the rule-assembled answer parts into natural, human mentor prose — WITHOUT
// inventing anything. The graph remains the single source of truth: the LLM is
// given the already-grounded draft and instructed to REWRITE it only, never add
// facts/numbers/claims. Registered via composer.setComposer; if the model is not
// bound or the call fails, composer.js silently falls back to the rule assembler
// (current behavior) — so this is additive and dormant until configured.
//
// Safety preserved: English-only (Language Lock — non-English keeps the localized
// template), disclaimers/links re-appended, no signals, graph-grounded. Mentor
// persona is the system prompt. Pure logic + one optional model call.
// ════════════════════════════════════════════════════════════════════════════

// Configured when a Cloudflare Workers AI binding (env.AI) exists, OR a legacy
// OpenAI-compatible endpoint (LLM_ENDPOINT + LLM_API_KEY) is provided, OR the new
// OPENAI_* adapter is switched on (OPENAI_ENABLED=true + OPENAI_API_KEY). Dormant otherwise.
// Backward compatible: the original two conditions are preserved untouched.
export function llmConfigured(env) {
  if (!env) return false;
  const openaiReady = String(env.OPENAI_ENABLED).toLowerCase() === 'true' && !!env.OPENAI_API_KEY;
  return !!(env.AI || (env.LLM_ENDPOINT && env.LLM_API_KEY) || openaiReady);
}

const SYSTEM = `You are the ZTU AI trading mentor — a calm, warm, experienced senior trader teaching Gold (XAU/USD) and Bitcoin. Rewrite the DRAFT below into natural, human mentor language.
STRICT RULES:
1. Use ONLY the facts, numbers, prices, levels, names and claims already in the draft. NEVER add new ones or guess.
2. Keep every link, disclaimer, and any question/invitation that is in the draft.
3. Education only — never give a buy/sell signal or a specific entry/exit price.
4. Keep it concise and conversational; vary the wording so it doesn't sound templated.
5. Output ONLY the rewritten message — no preamble, no notes. Reply in English.`;

function assembleDraft(parts = {}) {
  return [parts.lead, parts.prefix, parts.body, parts.contradiction, parts.engagement, parts.disclaimer]
    .map(x => (x == null ? '' : String(x)))
    .filter(s => s.trim())
    .join('\n\n')
    .trim();
}

// Resolve the OpenAI (or OpenAI-compatible) fallback config. The NEW OPENAI_* names
// take precedence over the legacy LLM_* names; legacy names keep working unchanged.
function resolveOpenAI(env) {
  const key = env.OPENAI_API_KEY || env.LLM_API_KEY || '';
  const model = env.OPENAI_MODEL || env.LLM_MODEL || 'gpt-4o-mini';
  // Explicit endpoint wins; otherwise default to the public OpenAI endpoint when an
  // OPENAI_API_KEY is present (so users of the new names need not set an endpoint).
  const endpoint = env.LLM_ENDPOINT || (env.OPENAI_API_KEY ? 'https://api.openai.com/v1/chat/completions' : '');
  const enabledByNew = String(env.OPENAI_ENABLED).toLowerCase() === 'true';
  const enabledByLegacy = !!(env.LLM_ENDPOINT && env.LLM_API_KEY); // preserve existing behavior
  const usable = !!(key && endpoint) && (enabledByNew || enabledByLegacy);
  // OpenAI may run AFTER Workers AI only when explicitly opted in. Legacy combos keep
  // their exact prior behavior (no surprise cross-engine fallback).
  const fallbackEnabled = String(env.OPENAI_FALLBACK_ENABLED).toLowerCase() === 'true';
  return { key, model, endpoint, usable, fallbackEnabled };
}

async function callOpenAI(oa, messages) {
  const res = await fetch(oa.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oa.key}` },
    body: JSON.stringify({ model: oa.model, messages, max_tokens: 700, temperature: 0.4 }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => null);
  return j?.choices?.[0]?.message?.content || '';
}

async function callModel(env, system, user) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];

  // PRIMARY engine: Cloudflare Workers AI (default; free-tier, lowest cost). On a
  // non-empty success we return immediately so the paid OpenAI path is never touched.
  if (env.AI && typeof env.AI.run === 'function') {
    let cfText = '';
    try {
      const model = env.LLM_MODEL || '@cf/meta/llama-3.1-8b-instruct';
      const r = await env.AI.run(model, { messages, max_tokens: 700, temperature: 0.4 });
      cfText = (r && (r.response || r.result || (typeof r === 'string' ? r : ''))) || '';
    } catch { cfText = ''; }
    if (cfText && cfText.trim()) return cfText;
    // Workers AI unavailable/empty → OpenAI ONLY as a last-resort fallback, and ONLY
    // when explicitly enabled (OPENAI_FALLBACK_ENABLED=true).
    const oa = resolveOpenAI(env);
    if (oa.usable && oa.fallbackEnabled) {
      try { return await callOpenAI(oa, messages); } catch { return ''; }
    }
    return '';
  }

  // No Workers AI binding → OpenAI / OpenAI-compatible endpoint is the sole LLM (this is
  // the legacy LLM_* path, preserved). The rule assembler in composer.js remains the
  // ultimate fallback if this returns empty.
  const oa = resolveOpenAI(env);
  if (oa.usable) {
    try { return await callOpenAI(oa, messages); } catch { return ''; }
  }
  return '';
}

// ── LEVEL 3 — educational generation for an in-domain question the internal KB did
// NOT cover. Reuses the SAME Workers-AI→OpenAI callModel chain (so DB/API priority is
// untouched — this is only ever invoked AFTER both miss). English-only (Language Lock).
// Anti-hallucination: a strict no-fabrication prompt + off-domain + signal guards.
// Returns null when not configured / non-English / off-topic / unsafe / on any failure
// → the caller keeps its existing safe reply (unknown never becomes obviously wrong).
const EDU_SYSTEM = `You are the ZTU AI trading mentor teaching Gold (XAU/USD), Bitcoin and general trading concepts. A student asked something our internal library does not cover yet. Give a clear, accurate, EDUCATIONAL answer.
STRICT RULES:
1. Explain concepts only. NEVER invent specific prices, levels, dates, statistics or current market data — if a number is not general textbook knowledge, do not state it.
2. NEVER give a buy/sell signal or a specific entry/exit.
3. If the question is NOT about trading/markets/finance, reply with exactly: NOT_TRADING
4. If you are not reasonably sure, state only what is generally known and note the limit — never guess facts.
5. Be concise (under 120 words), simple and human. Output only the answer.`;

export async function generateEducationalAnswer(env, question, lang = 'en') {
  if (!llmConfigured(env)) return null;
  if (lang && lang !== 'en') return null;                  // Language Lock — English only
  const q = String(question || '').trim();
  if (q.length < 6) return null;
  try {
    const out = await callModel(env, EDU_SYSTEM, q);
    const text = (out && typeof out === 'string') ? out.trim() : '';
    if (text.length < 12) return null;
    if (/\bNOT_TRADING\b/i.test(text)) return null;        // model judged it off-domain → no answer
    if (/\b(buy now|sell now|go long now|go short now|enter (now|here) at)\b/i.test(text)) return null; // safety
    return text;
  } catch { return null; }
}

// Returns a composer fn (parts, ctx) → string | null. null → rule-assembler fallback.
export function makeLLMComposer(env) {
  return async (parts = {}, ctx = {}) => {
    // Language Lock: only English answers are LLM-rephrased; others keep the
    // guaranteed localized template (the model isn't reliable across all 9 langs).
    if (ctx.lang && ctx.lang !== 'en') return null;
    const draft = assembleDraft(parts);
    if (draft.length < 24) return null;                 // too short to bother
    try {
      const out = await callModel(env, SYSTEM, draft);
      let text = (out && typeof out === 'string') ? out.trim() : '';
      if (text.length < 12) return null;
      // Grounding guards: re-append a dropped disclaimer; never let signals slip in.
      if (parts.disclaimer && !/advice|educational|تعليمي|taleemi/i.test(text)) {
        text += `\n\n${String(parts.disclaimer).trim()}`;
      }
      if (/\b(buy now|sell now|go long now|enter (now|here) at)\b/i.test(text)) return null; // safety → fallback
      return text;
    } catch {
      return null;                                       // any failure → rule assembler
    }
  };
}
