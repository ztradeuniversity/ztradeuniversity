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

function buildClaudePrompt(question, weaknesses) {
  if (!weaknesses.length) return null;
  const w = weaknesses[0];
  const def = WEAKNESS_LIBRARY[w.code] || {};
  return [
    `Problem: The ZTU chatbot answered "${question}" weakly — diagnosed as: ${def.label || w.code}.`,
    `Root cause: ${def.explanation || 'unknown'}`,
    `Affected files: ${(def.files || []).join(', ') || 'unknown'}`,
    `Suggested fix: ${def.fix || 'investigate the retrieval pipeline for this topic.'}`,
    `Expected result: the chatbot answers "${question}" from a real Database/Graph source at HIGH confidence, not a fallback.`,
  ].join('\n');
}

// Diagnoses the most recent chat answer to `question`. `sourceLayer` (optional)
// is the source.layer badge the client already received from the SSE stream
// (see answer-source.js) — passed through so is-fallback detection doesn't
// depend solely on the analytics row landing in time.
export async function diagnoseChatbotAnswer(env, { question, sourceLayer } = {}) {
  const log = await getLatestResponseLog(env).catch(() => null);
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

  const codes = [];
  if (!articleId && !graphNodeId) codes.push('no-article');
  if (!graphNodeId) codes.push('no-graph-node');
  if (graphNodeId && top && !kept) codes.push('poor-context');
  if (confidence && confidence !== 'HIGH') codes.push('low-confidence');
  if (isFallback) codes.push('is-fallback');

  const weaknesses = [...new Set(codes)].map(code => ({ code, ...WEAKNESS_LIBRARY[code] }));
  const strong = !isFallback && !!(articleId || (graphNodeId && confidence === 'HIGH' && kept));

  return {
    question, confidence, responseTimeMs, articleId, graphNodeId, isFallback,
    knowledgeCoverage: { intent, category: top?.item?.category || null, contextKept: kept },
    strong,
    weaknesses,
    claudePrompt: strong ? null : buildClaudePrompt(question, weaknesses),
  };
}
