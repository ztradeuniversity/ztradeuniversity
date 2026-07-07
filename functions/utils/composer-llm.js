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

import { formInstruction } from './intent-form.js';
import { CATEGORY_KEYS, inferCategory, slugify } from './article-categories.js';
import { parseJsonBlock } from './article-autometa.js';

// Configured when a Cloudflare Workers AI binding (env.AI) exists, OR a legacy
// OpenAI-compatible endpoint (LLM_ENDPOINT + LLM_API_KEY) is provided, OR the new
// OPENAI_* adapter is switched on (OPENAI_ENABLED=true + OPENAI_API_KEY). Dormant otherwise.
// Backward compatible: the original two conditions are preserved untouched.
export function llmConfigured(env) {
  if (!env) return false;
  const openaiReady = String(env.OPENAI_ENABLED).toLowerCase() === 'true' && !!env.OPENAI_API_KEY;
  return !!(env.AI || (env.LLM_ENDPOINT && env.LLM_API_KEY) || openaiReady);
}

const SYSTEM = `You are the ZTU AI trading mentor — a calm, experienced senior trader teaching Gold (XAU/USD) and Bitcoin. Rewrite the DRAFT below into natural, human language.
THINK FIRST, internally and silently: identify the user's real intent (educational / analytical / live-market / conversational / emotional / off-topic / troubleshooting) and answer ONLY what was actually asked — never a different or broader question — then write only the final answer. NEVER show or mention your reasoning.
STRICT RULES:
1. Use ONLY the facts, numbers, prices, levels, names and claims already in the draft. NEVER add new ones or guess. Confident, not arrogant; if the draft is uncertain, keep that uncertainty.
2. Keep every link, disclaimer, and any question/invitation that is in the draft.
3. Education only — never give a buy/sell signal or a specific entry/exit price.
4. Be concise and direct — lead with the answer. Sound like an experienced trader explaining to a peer, not a chatbot.
5. NO motivational filler, NO generic clichés ("trading is a journey", "patience is key", "the market is a battlefield"), NO repeated pep-talk, NO throat-clearing preamble ("Before we dive in…", "Let's make sure we have a solid foundation…").
6. Output ONLY the final message — no preamble, no notes, no chain-of-thought. Reply in English.`;

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

// Hard timeout wrapper so a slow/hung model call can never freeze the chat request.
// Rejects after `ms`; every caller already treats a rejection as "no LLM text" and
// falls back to the rule assembler / safe reply. Additive safety — no behavior change
// on a fast success.
function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function callOpenAIOnce(oa, messages) {
  const res = await fetch(oa.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oa.key}` },
    body: JSON.stringify({ model: oa.model, messages, max_tokens: 700, temperature: 0.4 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const e = new Error(`openai http ${res.status}: ${errBody.slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }
  const j = await res.json().catch(() => null);
  return j?.choices?.[0]?.message?.content || '';
}

// PRODUCTION UPGRADE — "OpenAI must not be skipped unnecessarily": retry once on a
// transient failure (timeout, 429, 5xx) before giving up, and surface the failure
// via system-log so admins can see it instead of it disappearing into a silent
// fallback. Never throws — callers already treat a thrown error as "no LLM text".
async function callOpenAI(oa, messages, env) {
  try {
    return await callOpenAIOnce(oa, messages);
  } catch (e1) {
    const retryable = !e1.status || e1.status === 429 || e1.status >= 500;
    if (!retryable) {
      logLLMFailure(env, 'openai', e1);
      throw e1;
    }
    try {
      return await callOpenAIOnce(oa, messages);
    } catch (e2) {
      logLLMFailure(env, 'openai', e2);
      throw e2;
    }
  }
}

function logLLMFailure(env, engine, err) {
  if (!env) return;
  import('./system-log.js').then(({ logSystemEvent }) =>
    logSystemEvent(env, { kind: 'llm-fallback', level: 'error', message: `${engine} call failed`, meta: { error: String(err?.message || err) } })
  ).catch(() => {});
}

async function callModel(env, system, user) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];

  // PRIMARY engine: Cloudflare Workers AI (default; free-tier, lowest cost). On a
  // non-empty success we return immediately so the paid OpenAI path is never touched.
  if (env.AI && typeof env.AI.run === 'function') {
    let cfText = '';
    try {
      // Current supported Workers AI text model (the prior default @cf/meta/llama-3.1-8b-instruct
      // was deprecated 2026-05-30 → CF error 5028). Overridable via LLM_MODEL.
      const model = env.LLM_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast';
      // Workers AI has no built-in timeout — cap it so a hung binding never freezes the reply.
      const r = await withTimeout(env.AI.run(model, { messages, max_tokens: 700, temperature: 0.4 }), 8000, 'workers-ai');
      cfText = (r && (r.response || r.result || (typeof r === 'string' ? r : ''))) || '';
    } catch { cfText = ''; }
    if (cfText && cfText.trim()) return cfText;
    if (!cfText) logLLMFailure(env, 'workers-ai', new Error('empty/failed response'));
    // Workers AI unavailable/empty → OpenAI ONLY as a last-resort fallback, and ONLY
    // when explicitly enabled (OPENAI_FALLBACK_ENABLED=true).
    const oa = resolveOpenAI(env);
    if (oa.usable && oa.fallbackEnabled) {
      try { return await callOpenAI(oa, messages, env); } catch { return ''; }
    }
    return '';
  }

  // No Workers AI binding → OpenAI / OpenAI-compatible endpoint is the sole LLM (this is
  // the legacy LLM_* path, preserved). The rule assembler in composer.js remains the
  // ultimate fallback if this returns empty.
  const oa = resolveOpenAI(env);
  if (oa.usable) {
    try { return await callOpenAI(oa, messages, env); } catch { return ''; }
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
THINK FIRST, internally and silently: classify the question (educational / analytical / live-market / conversational / emotional / off-topic / troubleshooting), pin down the precise intent, and answer ONLY what was actually asked — never a different or broader question — then give it directly. NEVER show or mention your reasoning.
STRICT RULES:
1. Explain concepts only. NEVER invent specific prices, levels, dates, statistics or current market data — if a number is not general textbook knowledge, do not state it. Be confident but not arrogant; if unsure, say so plainly.
2. NEVER give a buy/sell signal or a specific entry/exit.
3. If the question is NOT about trading/markets/finance, reply with exactly: NOT_TRADING
4. If you are not reasonably sure, state only what is generally known and note the limit — never guess facts.
5. Be concise (under 120 words), direct and human — like an experienced trader explaining to a peer. No motivational filler, no clichés, no preamble; lead with the answer.
6. Output only the answer — no chain-of-thought.`;

// ── TRANSLATION LAYER (Production Upgrade — Part 1) ─────────────────────────
// Closes the real gap found in Phase 34: id/ms/vi/bn/th are detected/answered
// correctly but only got an English body + an honest "not yet translated"
// note (no fabricated translation). This translates the ALREADY-GROUNDED final
// English answer into the target language — it does not generate new content,
// so the no-fabrication guarantee holds (translation only, never invention).
// Reuses the EXACT SAME Workers-AI→OpenAI callModel chain (retry + failure
// logging already built) — no parallel LLM-calling path. Returns null when the
// LLM isn't configured or the call fails; the caller (ai-chat.js) then keeps
// the existing Phase-34 English-plus-honest-note behavior — zero regression.
const LANG_NAMES = {
  id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', vi: 'Tiếng Việt (Vietnamese)',
  bn: 'বাংলা (Bengali)', th: 'ภาษาไทย (Thai)',
};
function translateSystemPrompt(lang) {
  const name = LANG_NAMES[lang] || lang;
  return `You are a professional financial/trading translator. Translate the MESSAGE below into ${name}, exactly the way a native-speaking trading mentor would naturally write it — correct grammar, natural sentence order, no literal word-for-word phrasing.
STRICT RULES:
1. Translate ONLY. Do not add, remove, summarize, or explain anything. Do not answer a different question.
2. Preserve every fact, number, price, percentage, date, and name EXACTLY as given — never alter, round, or invent any value.
3. Preserve Markdown formatting exactly (**bold**, bullet lists, links like [text](url), line breaks) — translate the visible text inside them, never the markup syntax itself.
4. Keep these terms in their original form (do not translate): Gold, BTC, Bitcoin, XAU/USD, BTC/USD, stop loss, take profit, NFP, CPI, FOMC, GDP, PMI, ISM, ADP, ECB, RSI, ATR.
5. Output ONLY the translated message in ${name} — no preamble, no notes, no chain-of-thought, no English commentary.`;
}

export async function translateAnswer(env, text, lang) {
  if (!llmConfigured(env)) return null;
  const body = String(text || '').trim();
  if (!body || body.length < 4) return null;
  try {
    const out = await callModel(env, translateSystemPrompt(lang), body);
    const translated = (out && typeof out === 'string') ? out.trim() : '';
    return translated.length >= 4 ? translated : null;
  } catch { return null; }
}

export async function generateEducationalAnswer(env, question, lang = 'en', form = null) {
  if (!llmConfigured(env)) return null;
  if (lang && lang !== 'en') return null;                  // Language Lock — English only
  const q = String(question || '').trim();
  if (q.length < 6) return null;
  const formLine = form ? formInstruction(form) : '';
  const system = formLine ? `${EDU_SYSTEM}\n7. ${formLine}` : EDU_SYSTEM;
  try {
    const out = await callModel(env, system, q);
    const text = (out && typeof out === 'string') ? out.trim() : '';
    if (text.length < 12) return null;
    if (/\bNOT_TRADING\b/i.test(text)) return null;        // model judged it off-domain → no answer
    if (/\b(buy now|sell now|go long now|go short now|enter (now|here) at)\b/i.test(text)) return null; // safety
    return text;
  } catch { return null; }
}

// ── ARTICLE BRIEF + DRAFT GENERATION (Content Intelligence Center) ──────────
// From a bare topic (or an existing article's current fields, for the "repair
// weak metadata" flow), produce every field the editor needs before any body
// text is written: SEO/meta fields, keywords, an outline, FAQ suggestions, an
// image prompt. Reuses the SAME Workers-AI→OpenAI engine chain as every other
// function in this file (callModel) — no parallel LLM path, no second engine to
// configure/maintain. Always returns a usable object: a deterministic fallback
// (topic-derived, no LLM required) fills every field when the model is
// unconfigured, times out, or returns unusable JSON — mirrors the
// "always-valid baseline" pattern already established in article-autometa.js,
// for the same reason (the editor must never be blocked by an LLM outage).
const BRIEF_SYSTEM = `You are a content strategist for a Gold (XAU/USD), Bitcoin, and trading-education knowledge base. Given a topic, output ONLY a compact JSON object (no prose, no code fence) with keys:
title (<=70 chars), seoTitle (<=60 chars, keyword-forward), metaTitle (<=60 chars), metaDescription (140-160 chars), keywords (array of 6-10 search phrases), category (one short lowercase word), tags (array of 5-8 lowercase keywords), difficulty (beginner|intermediate|advanced), outline (array of 4-7 section heading strings), faqs (array of 3-5 {question, answer} objects, answers 1-2 sentences), imagePrompt (one sentence describing a header illustration), internalLinkHints (array of 2-4 short related-topic phrases).
Base everything only on the given topic — do not invent facts, prices, or statistics.`;

function deterministicBrief(topic, overrides = {}) {
  const t = String(topic || overrides.title || '').trim() || 'Untitled Topic';
  const cat = overrides.category || inferCategory(t) || 'beginner-guides';
  const kws = t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 8);
  return {
    title: t, seoTitle: t.slice(0, 60), metaTitle: t.slice(0, 60),
    metaDescription: `Learn ${t.toLowerCase()} — a clear, practical guide for Gold and crypto traders.`.slice(0, 160),
    keywords: kws.length ? kws : [t.toLowerCase()],
    category: CATEGORY_KEYS.includes(cat) ? cat : 'beginner-guides',
    tags: kws.slice(0, 6), difficulty: overrides.difficulty || 'beginner',
    outline: [`What is ${t}?`, 'Why it matters', 'How to use it', 'Common mistakes'],
    faqs: [{ question: `What is ${t}?`, answer: `${t} is a trading concept every ZTU student should understand before applying it live.` }],
    imagePrompt: `A clean, professional illustration representing ${t} for a trading-education article.`,
    internalLinkHints: [],
    source: 'deterministic',
  };
}

export async function generateArticleBrief(env, topic, overrides = {}) {
  const base = deterministicBrief(topic, overrides);
  let merged = base;
  if (llmConfigured(env)) {
    try {
      const out = await callModel(env, BRIEF_SYSTEM, String(topic || base.title).slice(0, 300));
      const ai = parseJsonBlock(out);
      if (ai && typeof ai === 'object') {
        const clean = Object.fromEntries(Object.entries(ai).filter(([, v]) => v != null && v !== ''));
        merged = { ...base, ...clean, source: 'llm' };
      }
    } catch { /* keep deterministic base */ }
  }
  // Slug is always deterministic (slugify), regardless of source — guarantees a
  // URL-safe value even if the model's own "slug" field (not requested above) or
  // title contains characters slugify would otherwise need to clean up anyway.
  merged.slug = slugify(merged.title || String(topic || ''));
  merged.category = CATEGORY_KEYS.includes(merged.category) ? merged.category : (inferCategory(merged.title || String(topic || '')) || 'beginner-guides');
  return merged;
}

const DRAFT_SYSTEM = `You are a senior trading educator writing for Z Trade University (Gold XAU/USD, Bitcoin, and general trading education). Write a complete, well-structured article in Markdown (## headings, occasional bullet lists) following the given outline.
STRICT RULES:
1. Educational only — never give a buy/sell signal or a specific entry/exit price.
2. Do not invent specific prices, statistics, or current market data — teach concepts and frameworks, not live numbers.
3. Confident, clear, human tone — no filler, no repeated disclaimers, no chain-of-thought.
4. Follow the given outline order. Aim for 700-1100 words.
5. Output ONLY the article body in Markdown — no title heading (handled separately), no preamble, no meta-commentary.`;

// Returns the generated Markdown body, or null when the LLM is unconfigured or the
// call fails — the caller (ai-articles.js `ai-generate`) surfaces this as an honest
// "write manually, or try again" note rather than silently producing empty content.
export async function generateArticleDraft(env, brief = {}) {
  if (!llmConfigured(env)) return null;
  const outline = Array.isArray(brief.outline) && brief.outline.length ? brief.outline.join('\n- ') : '(no outline provided — use your own structure)';
  const prompt = `Topic: ${brief.title || ''}\nOutline:\n- ${outline}\nKeywords to naturally include where relevant: ${(brief.keywords || []).join(', ')}`;
  try {
    const out = await callModel(env, DRAFT_SYSTEM, prompt);
    const text = (out && typeof out === 'string') ? out.trim() : '';
    return text.length > 80 ? text : null;
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
    // PRODUCTION UPGRADE — question-FORM awareness (what-is vs how-to vs example vs
    // comparison vs why): shapes presentation only, never adds facts. ctx.form is
    // optional — when a caller doesn't pass it, behavior is byte-for-byte unchanged.
    const formLine = ctx.form ? formInstruction(ctx.form) : '';
    const system = formLine ? `${SYSTEM}\n7. ${formLine}` : SYSTEM;
    try {
      const out = await callModel(env, system, draft);
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
