// functions/utils/knowledge-router.js
// ════════════════════════════════════════════════════════════════════════════
// HYBRID KNOWLEDGE ENGINE + KNOWLEDGE SOURCE ROUTER (Modules 1 & 6)
//
// Foundation layer that declares WHICH knowledge sources each intent should
// consult, in strict priority order. It is a PURE planner — it performs no
// fetching and no web crawling. Today the actual L1/L2 data is gathered in
// /api/ai-chat.js; this router formalises the source strategy so future phases
// can wire L3 lookups and article/image retrieval without touching the engines.
//
//   FLOW (Module 6):
//     Question → intent-engine → specialist-router → knowledge-router
//             → L1 Internal → L2 Live APIs → L3 Future Sources → Response
//
//   PRIORITY (Module 1):
//     LEVEL 1  Internal Website Intelligence   (authoritative, free, always)
//     LEVEL 2  Live APIs (Finnhub/TwelveData/FRED)  (connected today)
//     LEVEL 3  Trusted external sources         (architecture only — future)
// ════════════════════════════════════════════════════════════════════════════

import { TRUSTED_SOURCES } from './response-engine.js';

// ── LEVEL 1 — INTERNAL WEBSITE INTELLIGENCE ──────────────────────────────────
// `provider` documents what currently supplies each source (module or page).
export const INTERNAL_SOURCES = {
  weeklyReports:      { label: 'Weekly Reports',        provider: 'weekly-report.html',        status: 'site-content' },
  fundamentalReports: { label: 'Fundamental Reports',   provider: 'fundamentals.html / market-engine', status: 'connected' },
  sentimentReports:   { label: 'Sentiment Reports',     provider: '/api/sentiment',            status: 'connected' },
  brokerDatabase:     { label: 'Broker Database',       provider: 'broker-data.js',            status: 'connected' },
  psychologyDatabase: { label: 'Psychology Database',   provider: 'psychology-engine.js',      status: 'connected' },
  educationalContent: { label: 'Educational Content',   provider: 'knowledge-engine.js / ai-knowledge.js', status: 'connected' },
  tradeAssessment:    { label: 'Trade Assessment Logic',provider: 'knowledge-engine.buildAssess', status: 'connected' },
  selfAssessment:     { label: 'Self Assessment Logic', provider: 'trader-assessment.html',    status: 'connected' },
};

// ── LEVEL 2 — LIVE APIs (connected today) ────────────────────────────────────
export const LIVE_APIS = {
  finnhub:    { label: 'Finnhub',    provides: ['calendar', 'news', 'vix'],        endpoint: '/api/calendar, /api/news', status: 'connected' },
  twelvedata: { label: 'TwelveData', provides: ['gold', 'btc', 'dxy', 'quotes'],   endpoint: '/api/sentiment',           status: 'connected' },
  fred:       { label: 'FRED',       provides: ['yields', 'real-yields', 'vixcls'],endpoint: '/api/sentiment',           status: 'connected' },
};

// ── LEVEL 3 — TRUSTED EXTERNAL SOURCES (architecture only — FUTURE) ───────────
// No crawling implemented. This registry is the routing target for a future,
// permissioned lookup layer. `mode: 'reference'` = we cite/link only today.
export const TRUSTED_SOURCE_REGISTRY = {
  reuters:          { label: 'Reuters',           url: 'https://www.reuters.com/markets/',            kind: 'news',      mode: 'reference', status: 'future' },
  bloomberg:        { label: 'Bloomberg',         url: 'https://www.bloomberg.com/markets',           kind: 'news',      mode: 'reference', status: 'future' },
  tradingeconomics: { label: 'TradingEconomics',  url: 'https://tradingeconomics.com/',               kind: 'macro',     mode: 'reference', status: 'future' },
  fca:              { label: 'FCA Register',       url: 'https://register.fca.org.uk/',                kind: 'regulator', mode: 'reference', status: 'future' },
  asic:             { label: 'ASIC Connect',       url: 'https://connectonline.asic.gov.au/',          kind: 'regulator', mode: 'reference', status: 'future' },
  cysec:            { label: 'CySEC',              url: 'https://www.cysec.gov.cy/en-GB/entities/',    kind: 'regulator', mode: 'reference', status: 'future' },
  worldGoldCouncil: { label: 'World Gold Council', url: 'https://www.gold.org/',                       kind: 'gold',      mode: 'reference', status: 'future' },
};

// ── INTENT → SOURCE PLAN MAP ─────────────────────────────────────────────────
// Each intent lists the ordered sources to consult at each level (by key).
const PLAN = {
  gold:      { l1: ['sentimentReports', 'fundamentalReports', 'educationalContent'], l2: ['twelvedata', 'fred', 'finnhub'], l3: ['worldGoldCouncil', 'tradingeconomics', 'reuters'] },
  btc:       { l1: ['sentimentReports', 'educationalContent'],                       l2: ['twelvedata', 'finnhub'],          l3: ['reuters', 'bloomberg'] },
  macro:     { l1: ['fundamentalReports', 'sentimentReports'],                       l2: ['fred', 'twelvedata'],             l3: ['tradingeconomics', 'reuters'] },
  mood:      { l1: ['sentimentReports'],                                             l2: ['twelvedata', 'fred'],             l3: ['reuters'] },
  brief:     { l1: ['weeklyReports', 'sentimentReports', 'fundamentalReports'],      l2: ['twelvedata', 'fred', 'finnhub'],  l3: ['tradingeconomics', 'reuters'] },
  events:    { l1: ['weeklyReports'],                                                l2: ['finnhub', 'twelvedata'],          l3: ['tradingeconomics', 'reuters', 'bloomberg'] },
  session:   { l1: ['educationalContent'],                                           l2: [],                                 l3: [] },
  broker:    { l1: ['brokerDatabase'],                                               l2: [],                                 l3: ['fca', 'asic', 'cysec'] },
  psychology:{ l1: ['psychologyDatabase', 'educationalContent'],                     l2: [],                                 l3: [] },
  whylosing: { l1: ['psychologyDatabase', 'tradeAssessment', 'selfAssessment'],      l2: [],                                 l3: [] },
  stuck:     { l1: ['psychologyDatabase', 'sentimentReports'],                       l2: ['twelvedata'],                     l3: [] },
  knowledge: { l1: ['educationalContent'],                                           l2: [],                                 l3: [] },
  strategy:  { l1: ['educationalContent', 'selfAssessment'],                         l2: [],                                 l3: [] },
  technical: { l1: ['educationalContent'],                                           l2: [],                                 l3: [] },
  riskmgmt:  { l1: ['educationalContent', 'tradeAssessment'],                        l2: [],                                 l3: [] },
  funding:   { l1: ['educationalContent'],                                           l2: [],                                 l3: [] },
  assess:    { l1: ['tradeAssessment', 'sentimentReports'],                          l2: ['twelvedata'],                     l3: [] },
  lotsize:   { l1: ['tradeAssessment'],                                              l2: [],                                 l3: [] },
  selfassess:{ l1: ['selfAssessment'],                                               l2: [],                                 l3: [] },
  chart:     { l1: ['educationalContent'],                                           l2: [],                                 l3: [] },
  signal:    { l1: [],                                                               l2: [],                                 l3: [] },
  greeting:  { l1: [],                                                               l2: [],                                 l3: [] },
  setcountry:{ l1: [],                                                               l2: [],                                 l3: [] },
  fallback:  { l1: ['educationalContent'],                                           l2: [],                                 l3: ['tradingeconomics', 'reuters'] },
};

// Resolve the ordered knowledge-source plan for an intent.
export function resolveKnowledgeSources(intent) {
  const p = PLAN[intent] || PLAN.fallback;
  return {
    intent,
    level1: (p.l1 || []).map(k => ({ key: k, ...INTERNAL_SOURCES[k] })).filter(x => x.label),
    level2: (p.l2 || []).map(k => ({ key: k, ...LIVE_APIS[k] })).filter(x => x.label),
    level3: (p.l3 || []).map(k => ({ key: k, ...TRUSTED_SOURCE_REGISTRY[k] })).filter(x => x.label),
  };
}

// Human-readable source trace (for debugging / a future "sources" UI).
export function sourceTrace(intent) {
  const plan = resolveKnowledgeSources(intent);
  const fmt = arr => arr.map(s => s.label).join(', ') || '—';
  return [
    `L1 Internal: ${fmt(plan.level1)}`,
    `L2 Live APIs: ${fmt(plan.level2)}`,
    `L3 Future: ${fmt(plan.level3)}`,
  ].join(' | ');
}

// Module 6 pipeline descriptor (documentation / future orchestration contract).
export const KNOWLEDGE_PIPELINE = [
  'intent-engine.classifyIntent',
  'specialist-router.route',
  'knowledge-router.resolveKnowledgeSources',
  'L1 internal (site intelligence + databases)',
  'L2 live APIs (Finnhub / TwelveData / FRED)',
  'L3 trusted sources (future, reference-only today)',
  'response-engine decorate → reply',
];

// Convenience: the existing L3 link sets already used for citation today.
export const L3_REFERENCE_LINKS = TRUSTED_SOURCES;
