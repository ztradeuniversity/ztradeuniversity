// functions/utils/chatbot-diagnostics.js
// ════════════════════════════════════════════════════════════════════════════
// CHATBOT CHECKER (spec Phase 8) — diagnoses WHY an answer is weak instead of
// just returning it. Reuses the exact same retrieval chain the publish-verification
// gate already uses (retrieveBest/classifyIntent/relevanceEngine, see
// article-graph-sync.js's verifyPublishPipeline) plus the ai_response_logs row the
// live /api/ai-chat call already writes (confidence, response_time_ms, article_id,
// graph_node_id, is_fallback) — no second chat engine, no new scoring logic.
// ════════════════════════════════════════════════════════════════════════════

import { getLatestResponseLog } from './ai-supabase.js';
import { retrieveBest } from './graph-retrieval.js';
import { classifyIntent } from './intent-engine.js';
import { relevanceEngine, enforceRelevance } from './relevance-engine.js';
import { SOURCE_STAGES } from './answer-source.js';
import { getSetting } from './site-settings.js';

const ROUTING_KEYS = ['database', 'graph', 'calc', 'live', 'openai'];
const ROUTING_LABEL = Object.fromEntries(SOURCE_STAGES.map(s => [s.layer, s.label]));
const ROUTING_DEFAULT = { database: true, graph: true, live: true, calc: true, openai: true };

// SOURCES ATTEMPTED / SKIPPED (spec: "Explain Every Answer") — mirrors
// buildExecutionContext() in ai-chat.js exactly: sourceFlags (when the
// diagnostic call forced specific sources) fully replaces the routing state
// for that one call; with no override, the REAL persisted Production Routing
// config is read so "Production" mode reports the truth a real visitor got.
async function resolveRoutingState(env, sourceFlags) {
  if (sourceFlags && typeof sourceFlags === 'object') {
    const ctx = {};
    for (const k of ROUTING_KEYS) ctx[k] = sourceFlags[k] !== false;
    return ctx;
  }
  const persisted = await getSetting(env, 'chatbot_routing', ROUTING_DEFAULT).catch(() => ROUTING_DEFAULT);
  const ctx = {};
  for (const k of ROUTING_KEYS) ctx[k] = persisted && persisted[k] === false ? false : true;
  return ctx;
}

// Each weakness maps to: a clear explanation, an auto-repair action when one
// genuinely exists in this codebase (kb-admin actions only — never invented),
// and manual-repair guidance (files + fix) used both here and by the Error
// Center's Claude-prompt builder (same shape, different trigger).
export const WEAKNESS_LIBRARY = {
  'no-article': {
    label: 'Article Missing',
    explanation: 'No published article (ai_articles) was used to answer this question.',
    autoRepair: null,
    files: ['functions/utils/article-knowledge.js', 'functions/api/ai-articles.js'],
    fix: 'Publish an article for this topic via Content Center (Manual, SEO Auto, or AI Generate).',
  },
  'no-graph-node': {
    label: 'Knowledge Missing',
    explanation: 'No knowledge-graph concept (kb_nodes) matched this question at retrieval time.',
    autoRepair: { action: 'sync-edges', label: 'Sync graph edges' },
    files: ['functions/utils/kb-store.js', 'functions/utils/graph-retrieval.js'],
    fix: 'Author/publish a graph concept for this topic, or run Migrate Seed if the graph looks empty.',
  },
  'low-confidence': {
    label: 'Low Confidence',
    explanation: 'Retrieval matched something, but only at MEDIUM/LOW confidence — not enough to answer with certainty.',
    autoRepair: { action: 'sync-edges', label: 'Sync graph edges' },
    files: ['functions/utils/semantic-retrieval.js', 'functions/utils/retrieval-boost.js'],
    fix: 'Add more question-pattern phrasings/tags to the matched concept or article so retrieval scores it higher.',
  },
  'is-fallback': {
    label: 'No Matching Topic',
    explanation: 'The response fell through to the Safe Reply / OpenAI fallback layer — no database, graph, or live-data source answered directly.',
    autoRepair: null,
    files: ['functions/utils/anchor-entries.js', 'functions/api/ai-kb-admin.js'],
    fix: 'This looks like a genuinely new topic — publish a graph concept or article for it (see Missing Topics).',
  },
  'poor-context': {
    label: 'Poor Context / Missing Internal Link',
    explanation: 'A source was found, but the relevance gate rejected it as off-topic for this question’s intent/category.',
    autoRepair: { action: 'sync-edges', label: 'Sync graph edges' },
    files: ['functions/utils/article-seo.js', 'functions/utils/relevance-engine.js'],
    fix: 'Add overlapping tags/category to nearby articles/concepts so suggestLinks finds real neighbors, or widen the concept’s relevanceTags.',
  },
};

// AI FIX PROMPT — AI-agnostic (Claude/ChatGPT/Gemini/any coding AI), self-
// contained with project context so it works pasted into a fresh chat with no
// extra explanation needed.
function buildClaudePrompt(question, weaknesses) {
  if (!weaknesses.length) return null;
  const w = weaknesses[0];
  const def = WEAKNESS_LIBRARY[w.code] || {};
  return [
    'Project: Z Trade University — a Cloudflare Pages + Supabase (Postgres via PostgREST) trading-education website. Backend: Cloudflare Pages Functions (JavaScript ES modules) under functions/api/*.js and functions/utils/*.js. This issue was detected by its admin Chatbot Checker diagnostic tool.',
    '',
    `Problem: The ZTU chatbot answered "${question}" weakly — diagnosed as: ${def.label || w.code}.`,
    `Root cause: ${def.explanation || 'unknown'}`,
    `Affected files: ${(def.files || []).join(', ') || 'unknown'}`,
    `Suggested fix: ${def.fix || 'investigate the retrieval pipeline for this topic.'}`,
    `Expected result: the chatbot answers "${question}" from a real Database/Graph source at HIGH confidence, not a fallback.`,
    '',
    'Please review the affected file(s) in this codebase and propose the exact code change needed to fix the root cause above.',
  ].join('\n');
}

// Diagnoses the most recent chat answer to `question`. `sourceLayer` (optional)
// is the source.layer badge the client already received from the SSE stream
// (see answer-source.js) — passed through so is-fallback detection doesn't
// depend solely on the analytics row landing in time.
export async function diagnoseChatbotAnswer(env, { question, sourceLayer, sourceFlags = null } = {}) {
  const log = await getLatestResponseLog(env).catch(() => null);
  const routingState = await resolveRoutingState(env, sourceFlags);
  const sourcesAttempted = ROUTING_KEYS.filter(k => routingState[k]).map(k => ({ key: k, label: ROUTING_LABEL[k] }));
  const sourcesSkipped = ROUTING_KEYS.filter(k => !routingState[k]).map(k => ({ key: k, label: ROUTING_LABEL[k] }));
  const cls = classifyIntent(question) || {};
  const intent = cls.intent || 'fallback';
  const top = await retrieveBest(env, question, { lang: 'en' }).catch(() => null);
  const rel = relevanceEngine(question, { intent, category: top?.item?.category });
  const kept = top ? enforceRelevance({ category: top.item.category, concepts: top.item.concepts, relevanceTags: top.item.relevanceTags }, rel) : false;

  const confidence = log?.confidence || top?.confidence || null;
  const articleId = log?.article_id || null;
  const graphNodeId = log?.graph_node_id || top?.item?.id || null;
  const isFallback = !!log?.is_fallback || sourceLayer === 'safe';
  const responseTimeMs = log?.response_time_ms ?? null;

  // BUGFIX (found via live testing): 'no-graph-node' must only fire when NEITHER
  // an article nor a graph node was found — a real Database-sourced answer (has
  // articleId, no graphNodeId, by design) was previously flagged with a spurious
  // "Knowledge Missing" weakness alongside a correct "Strong answer" verdict.
  const nothingFound = !articleId && !graphNodeId;
  const codes = [];
  if (nothingFound) { codes.push('no-article'); codes.push('no-graph-node'); }
  if (graphNodeId && top && !kept) codes.push('poor-context');
  if (confidence && confidence !== 'HIGH' && !articleId) codes.push('low-confidence');
  if (isFallback) codes.push('is-fallback');

  const weaknesses = [...new Set(codes)].map(code => ({ code, ...WEAKNESS_LIBRARY[code] }));
  const strong = !isFallback && !!(articleId || (graphNodeId && confidence === 'HIGH' && kept));

  // SOURCE USED + WHY (spec: "Response Diagnostics" — Final Answer/Source Used/Why
  // selected/Retrieval Summary). Derived from the same real signals above.
  // CORRECTED (Chatbot Checker audit): the previous copy claimed "Database
  // always wins first in the retrieval priority order" — traced against
  // ai-chat.js's actual merge (~L1296 `if(directAnswer)...else if(kbAnswer)`
  // then the Database blocks at ~L1359/1405, each guarded by
  // `!directAnswer && !kbAnswer`), the REAL execution order is:
  // Live/Calculator (directAnswer) → Knowledge Graph (kbAnswer) → Database →
  // OpenAI → Safe Reply. Database only gets a turn when Live/Calculator AND
  // the Knowledge Graph both miss — the opposite of "always wins first". This
  // is a documentation fix only; no routing/business logic changed.
  let sourceUsed = 'safe', whySelected = 'No database, graph, live-data, or OpenAI source produced a confident answer.';
  if (articleId) { sourceUsed = 'database'; whySelected = `A published article (id ${articleId}) matched this question. Database is checked after Live/Calculator and the Knowledge Graph in the real execution order, so this means neither of those produced an answer first.`; }
  else if (graphNodeId && confidence === 'HIGH' && kept) { sourceUsed = 'graph'; whySelected = `Knowledge-graph concept "${graphNodeId}" matched at HIGH confidence and passed the relevance gate before Database was ever checked.`; }
  else if (sourceLayer && sourceLayer !== 'safe') { sourceUsed = sourceLayer; whySelected = `Reported by the live chat call as the "${sourceLayer}" layer${sourceLayer === 'live' || sourceLayer === 'calc' ? ' — Live/Calculator are checked first, before Knowledge Graph or Database' : ''}.`; }
  else if (isFallback) { sourceUsed = 'safe'; whySelected = 'Fell through to Safe Reply / OpenAI fallback — no higher-priority source matched.'; }

  const retrievalSummary = nothingFound
    ? `No article and no graph concept matched "${question}" (intent=${intent}).`
    : `${articleId ? 'Article ' + articleId : ''}${articleId && graphNodeId ? ' + ' : ''}${graphNodeId ? 'graph concept ' + graphNodeId : ''} matched (confidence=${confidence || 'n/a'}, relevance kept=${kept ? 'yes' : 'no'}).`;

  return {
    question, confidence, responseTimeMs, articleId, graphNodeId, isFallback,
    sourceUsed, whySelected, retrievalSummary,
    // EXPLAIN EVERY ANSWER (spec) — sources attempted/skipped for THIS call,
    // derived from the same routing state ai-chat.js's buildExecutionContext
    // actually used (either the diagnostic sourceFlags override, or — when
    // simulating a real visitor — the real persisted Production Routing
    // config, read fresh so it reflects the truth even if it changed since
    // the last save).
    sourcesAttempted, sourcesSkipped,
    // Tokens: honest "not tracked" rather than fabricated — the live chat
    // pipeline's OpenAI fallback (composer-llm.js generateEducationalAnswer)
    // does not currently return usage/token counts (only the separate
    // article-generation path does). See README note in the report.
    tokens: null,
    tokensNote: 'Not tracked for the live chat pipeline — token usage is only recorded for AI-assisted article generation, not chat replies.',
    knowledgeCoverage: { intent, category: top?.item?.category || null, contextKept: kept },
    strong,
    weaknesses,
    claudePrompt: strong ? null : buildClaudePrompt(question, weaknesses),
  };
}

// AUTOMATIC SOURCE DETECTION — the testable source list comes directly from
// answer-source.js's SOURCE_STAGES (the same 6-stage chain — 5 testable
// sources + the terminal Safe Reply — the real chatbot already implements),
// not a hardcoded UI list.
//
// gateAvailable=true means /api/ai-chat's execution-context layer (see
// buildExecutionContext in ai-chat.js) has a REAL `ctx.<source>` check wired
// into that source's existing routing block — toggling it off makes the real
// production pipeline skip that source, exactly like its existing "not found"
// fallthrough already does. This is the ONLY chatbot execution path — there is
// no separate diagnostic engine. Every source (including 'live') is now
// gate-backed at EVERY producing call site — the last ungated short-status live
// branch was closed, so a "Live disabled" test can no longer surface any
// live-derived text. 'safe' is the terminal fallback
// and has no "disable" concept (it's what happens when everything else is off).
// Every source is now fully gate-backed at EVERY producing call site in
// ai-chat.js — the previously-documented ungated short-status live branch was
// closed by the Production Contract 2 change, so this note would now be false
// information in the admin panel and has been removed.
const GATE_NOTES = {};
export function getTestableSources() {
  return SOURCE_STAGES
    .filter(s => s.layer !== 'safe')
    .map(s => ({ key: s.layer, label: s.label, gateAvailable: true, note: GATE_NOTES[s.layer] || null }));
}
