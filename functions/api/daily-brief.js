// functions/api/daily-brief.js
// ════════════════════════════════════════════════════════════════════════════
// AI DAILY BRIEF — generated ONCE per (UTC) day, cached in the existing
// site_settings key/value store, and served identically to every visitor for
// the rest of the day. Regenerates automatically when the UTC date changes.
// This minimizes OpenAI cost (one generation/day, not one per user) while
// keeping the brief current.
//
// Reuse-only, additive, and it touches NONE of the protected systems:
//   • Storage      → existing site-settings.js getSetting/setSetting (shared KV).
//   • Market data  → existing /api/sentiment, /api/calendar, /api/news.
//   • OpenAI       → existing EXPORTED makeLLMComposer (grounded rephrase: "use
//                    ONLY the facts in the draft — never invent"). The OpenAI
//                    logic file (composer-llm.js) is not modified.
// If OpenAI is unconfigured or fails, a deterministic factual brief (built from
// the same live data) is served and cached — always accurate, never fabricated,
// zero cost. Graceful throughout: any data source can be missing.
// ════════════════════════════════════════════════════════════════════════════

import { getSetting, setSetting } from '../utils/site-settings.js';
import { llmConfigured, makeLLMComposer } from '../utils/composer-llm.js';

const CACHE_KEY = 'daily_brief_v1';
const JSON_H = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300',   // edge/browser can hold it briefly; source of truth is the daily KV cache
};
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

function todayUTC() { return new Date().toISOString().slice(0, 10); }               // YYYY-MM-DD
function stampUTC() { return new Date().toUTCString().slice(0, 16) + ' UTC'; }       // "Mon, 20 Jul 2026 UTC"

// Direction words from a % change — factual, never predictive.
function dir(pct) {
  if (pct == null) return 'little changed (no live reading)';
  if (pct > 0.3)  return 'higher';
  if (pct < -0.3) return 'lower';
  return 'little changed';
}
function pctStr(pct) { return pct == null ? '' : ` (${pct > 0 ? '+' : ''}${Number(pct).toFixed(2)}%)`; }
function priceStr(p) { return p == null ? 'n/a' : (p >= 1000 ? '$' + Number(p).toLocaleString('en-US') : '$' + p); }

async function fetchJson(url, ms) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return r.ok ? await r.json().catch(() => null) : null; }
  catch { return null; }
}

// A structured, purely-factual markdown brief built from the live data. This is
// both (a) the deterministic output when OpenAI is off, and (b) the grounded
// draft handed to the LLM (which may only rephrase these facts, never add to them).
function buildFactualBrief(market, calendar, news) {
  const g = market?.gold, b = market?.btc;
  const vix = market?.vix?.value;
  const regime = market?.marketRegime?.label;

  const events = (calendar?.events || []).filter(e => e && e.time).slice(0, 5);
  const highToday = events.filter(e => String(e.impact || '').toLowerCase() === 'high');
  const arts = (news?.articles || []).filter(a => a && a.title).slice(0, 2);

  const L = [];
  L.push(`## 📋 Daily Brief — ${stampUTC()}`);

  // 1) Today's important market events + 2) high-impact economic news
  L.push(`\n**Today's key market events**`);
  if (events.length) for (const e of events) L.push(`- ${String(e.impact || '').toLowerCase() === 'high' ? '🔴' : '🟡'} ${e.event || e.title || 'Event'}${e.time ? ` — ${e.time}` : ''}`);
  else L.push(`- No major scheduled high-impact US releases detected on the radar right now.`);
  L.push(`\n**High-impact economic news:** ${highToday.length ? highToday.map(e => e.event || e.title).filter(Boolean).join(', ') : 'none flagged high-impact on the radar.'}`);

  // 3) Gold direction
  L.push(`\n**Gold (XAU/USD):** ${priceStr(g?.price)}, ${dir(g?.changePct)}${pctStr(g?.changePct)} on the latest session${(g?.high != null && g?.low != null) ? `; session range ${priceStr(g.low)}–${priceStr(g.high)}` : ''}.`);
  // 4) BTC direction
  L.push(`**Bitcoin (BTC):** ${priceStr(b?.price)}, ${dir(b?.changePct)}${pctStr(b?.changePct)} on the latest session${(b?.high != null && b?.low != null) ? `; session range ${priceStr(b.low)}–${priceStr(b.high)}` : ''}.`);

  // 5) Latest session performance summary + market regime/volatility
  L.push(`\n**Latest session performance:** ${regime ? `market regime **${regime}**` : 'regime unavailable'}${vix != null ? `, VIX **${vix}**` : ''}. Figures above reflect the most recent completed/active session (data via live feeds).`);

  // 6) International / geopolitical headlines affecting markets
  if (arts.length) { L.push(`\n**Notable international/market headlines:**`); for (const a of arts) L.push(`- ${a.title}${a.source ? ` — _${a.source}_` : ''}`); }

  // Disclaimer intentionally NOT included here — it's appended exactly ONCE by
  // the caller (generate(), below), after either the LLM rephrase or this
  // deterministic fallback, so it can never appear twice in one response
  // (once baked into the draft handed to the LLM + once passed as the
  // composer's own disclaimer param would otherwise double it in the prompt).
  return L.join('\n');
}

const DISCLAIMER = '_⚠ Educational only._';

async function generate(env, origin) {
  const [market, calendar, news] = await Promise.all([
    fetchJson(`${origin}/api/sentiment`, 4000),
    fetchJson(`${origin}/api/calendar`, 4000),
    fetchJson(`${origin}/api/news`, 4000),
  ]);
  const factual = buildFactualBrief(market, calendar, news);

  // OpenAI phrasing (grounded, reuses the existing composer — never invents
  // numbers/dates). Cost is paid at most once per day because of the cache below.
  // Single disclaimer guarantee: the draft handed to the LLM carries NO
  // disclaimer of its own (see buildFactualBrief above), so the ONE passed here
  // via `disclaimer` is the only one that can appear — never doubled.
  if (llmConfigured(env)) {
    try {
      const compose = makeLLMComposer(env);
      const out = await compose({ body: factual, disclaimer: DISCLAIMER }, { lang: 'en' });
      if (out && typeof out === 'string' && out.trim().length > 80) return out.trim();
    } catch { /* fall through to the deterministic factual brief */ }
  }
  // Deterministic fallback (OpenAI unconfigured/failed) — append the single
  // disclaimer exactly once here, since buildFactualBrief no longer includes it.
  return `${factual}\n\n${DISCLAIMER}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_H });
  const origin = new URL(request.url).origin;
  const today = todayUTC();

  // 1) Serve today's cached brief to everyone (no regeneration, no OpenAI cost).
  try {
    const cached = await getSetting(env, CACHE_KEY, null);
    if (cached && cached.date === today && cached.markdown) {
      return json({ ok: true, date: today, markdown: cached.markdown, cached: true });
    }
  } catch { /* cache read is best-effort; fall through to generate */ }

  // 2) New day (or first run / no cache) → generate once, store, serve.
  const markdown = await generate(env, origin);
  try { await setSetting(env, CACHE_KEY, { date: today, markdown }); } catch { /* serve even if the write fails */ }
  return json({ ok: true, date: today, markdown, cached: false });
}
