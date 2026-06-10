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

// Configured when a Cloudflare Workers AI binding (env.AI) exists, or an
// OpenAI-compatible endpoint is provided. Dormant otherwise.
export function llmConfigured(env) {
  return !!(env && (env.AI || (env.LLM_ENDPOINT && env.LLM_API_KEY)));
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

async function callModel(env, system, user) {
  if (env.AI && typeof env.AI.run === 'function') {
    const model = env.LLM_MODEL || '@cf/meta/llama-3.1-8b-instruct';
    const r = await env.AI.run(model, {
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 700, temperature: 0.4,
    });
    return r && (r.response || r.result || (typeof r === 'string' ? r : ''));
  }
  if (env.LLM_ENDPOINT && env.LLM_API_KEY) {
    const res = await fetch(env.LLM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 700, temperature: 0.4,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await res.json().catch(() => null);
    return j?.choices?.[0]?.message?.content || '';
  }
  return '';
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
