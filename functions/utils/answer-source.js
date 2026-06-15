// functions/utils/answer-source.js
// ════════════════════════════════════════════════════════════════════════════
// ANSWER SOURCE BADGE — tiny, pure mapping from the retrieval LAYER that produced
// an answer to a small user-visible badge ({icon,label}) + an optional admin debug
// payload. Additive only: it reports which existing layer answered; it does NOT
// change routing, retrieval, or the priority chain.
//
// Retrieval priority (unchanged): Database → Knowledge Graph → Live API → OpenAI → Safe Reply.
//   database  📚  Supabase article (ai_articles, knowledge-orchestrator)
//   graph     🕸  Knowledge-graph concept (retrieveBest — kb_nodes live, else offline anchors)
//   live      📡  Live market intelligence (sentiment/calendar/market-context)
//   calc      🧮  Deterministic calculator (lot/RR/pip — pure math)
//   openai    🧠  LLM fallback (composer-llm generateEducationalAnswer)
//   safe      🛟  Safe reply (unknown / clarify / generic engine fallback)
// Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

const MAP = {
  database: { icon: '📚', label: 'Database' },
  graph:    { icon: '🕸', label: 'Graph' },
  live:     { icon: '📡', label: 'Live API' },
  calc:     { icon: '🧮', label: 'Calculator' },
  openai:   { icon: '🧠', label: 'OpenAI' },
  safe:     { icon: '🛟', label: 'Safe Reply' },
};

// The five priority stages, in order, for the admin debug panel.
export const SOURCE_STAGES = [
  { layer: 'database', label: 'Database' },
  { layer: 'graph',    label: 'Knowledge Graph' },
  { layer: 'live',     label: 'Live API' },
  { layer: 'openai',   label: 'OpenAI' },
  { layer: 'safe',     label: 'Safe Reply' },
];

// Normalize an internal source id to a known layer (defaults to 'safe').
export function normalizeLayer(layer) {
  return Object.prototype.hasOwnProperty.call(MAP, layer) ? layer : 'safe';
}

// Canonical snake_case value for the ai_response_logs.answer_source analytics column.
// Keeps live_api reserved for dynamic market data; deterministic calculator answers
// stay a distinct value so they never pollute the market-API bucket.
const LOG_VALUE = {
  database: 'database',
  graph:    'graph',
  live:     'live_api',
  calc:     'calculator',
  openai:   'openai',
  safe:     'safe_reply',
};
export function logSourceValue(layer) {
  return LOG_VALUE[normalizeLayer(layer)] || 'safe_reply';
}

// Build the small badge object emitted to the client. `debug` (optional) is an
// admin-only details bag attached verbatim when debug mode is on.
export function sourceBadge(layer, debug = null) {
  const key = normalizeLayer(layer);
  const m = MAP[key];
  const out = { layer: key, icon: m.icon, label: m.label, badge: `${m.icon} ${m.label}` };
  if (debug && typeof debug === 'object') out.debug = debug;
  return out;
}
