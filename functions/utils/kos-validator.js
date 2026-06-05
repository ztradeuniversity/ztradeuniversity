// functions/utils/kos-validator.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.0A — KNOWLEDGE OBJECT STANDARD (KOS) VALIDATOR.
//
// The machine-readable KOS contract. Every concept (authored, article-derived,
// AI-drafted, imported) must pass this before publish, so the graph stores
// MENTOR INTELLIGENCE — not answers only. Pure (no I/O). Not on the live chat
// path → additive, zero regression. Consumed by 11C.1 authoring/dedup tooling.
//
//   validateKnowledgeObject(obj, { mode:'draft'|'publish' })
//     → { valid, score(0-100), errors[], warnings[], dimensions{} }
//   errors  block publish · warnings are quality nudges · draft mode is lenient.
// ════════════════════════════════════════════════════════════════════════════

const TOOLS  = new Set(['assess', 'lotsize', 'position', 'chart', 'library', 'calculator', 'journal', 'tradingview', 'mt5']);
const LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const CONF   = new Set(['HIGH', 'MEDIUM', 'LOW']);
const ASSESS = new Set(['trade', 'trader']);
const OBJECTIVES = new Set(['educate', 'mentor', 'encourage', 'warn', 'clarify', 'recover', 'assess', 'motivate']);
const RISK_INTENTS = new Set(['gold', 'btc', 'assess', 'signal', 'macro', 'riskmgmt']);
// Meta/robotic phrasing that must never reach a user-facing answer.
const ROBOTIC = /(keyword detected|intent\s*[:=]|category\s*[:=]|node\s*id|regex|fallback triggered|\bNLP\b|template\b|\bclassif)/i;
const BROKEN  = /\bundefined\b|\$\{|\[object Object\]/;

const E = (arr, code, msg) => arr.push({ code, msg });

// Accept both the KOS shape ({canonical,…}) and the legacy seed shape
// ({shortAnswer,deepAnswer}) so existing KB_SEED stays valid (backward compat).
function normalize(obj) {
  const data = obj.data || obj;
  const canon = data.canonical || { short: obj.shortAnswer ?? data.shortAnswer, deep: obj.deepAnswer ?? data.deepAnswer };
  return {
    id: obj.id, category: obj.category, topic: obj.topic ?? obj.subcategory,
    level: obj.level, lang: obj.lang || 'en', intent: obj.intent || data.intent,
    questionPatterns: obj.questionPatterns || data.questionPatterns || [],
    short: canon.short, deep: canon.deep,
    guidance: obj.guidance || data.guidance || {},
    commonMistakes: obj.commonMistakes || data.commonMistakes || [],
    misconceptions: obj.misconceptions || data.misconceptions || [],
    relevanceTags: obj.relevanceTags || data.relevanceTags || [],
    recommendedAssessment: obj.recommendedAssessment ?? data.recommendedAssessment ?? null,
    recommendedTools: obj.recommendedTools || data.recommendedTools || [],
    nextSteps: obj.nextSteps ?? data.nextSteps,
    prerequisites: obj.prerequisites ?? data.prerequisites,
    related: obj.related ?? data.related,
    riskNote: obj.riskNote || data.riskNote || null,
    origin: obj.origin, sources: obj.sources || data.sources || [],
    confidence: obj.confidence,
    localized: obj.localized || data.localized || null,
    responseObjective: obj.responseObjective || data.responseObjective || null,
    desiredOutcome: obj.desiredOutcome || data.desiredOutcome || null,
  };
}

export function validateKnowledgeObject(obj, { mode = 'publish' } = {}) {
  const errors = [], warnings = [], dim = {};
  if (!obj || typeof obj !== 'object') return { valid: false, score: 0, errors: [{ code: 'no_object', msg: 'not an object' }], warnings: [], dimensions: {} };
  const n = normalize(obj);
  const pub = mode === 'publish';
  const body = `${n.short || ''} ${n.deep || ''}`.trim();

  // ── STRUCTURE (errors) ──────────────────────────────────────────────
  if (!n.id) E(errors, 'id', 'missing id');
  if (!n.category) E(errors, 'category', 'missing category');
  if (!Array.isArray(n.questionPatterns) || n.questionPatterns.length === 0) E(errors, 'questionPatterns', 'need ≥1 question pattern');
  if (!n.short && !n.deep) E(errors, 'answer', 'need canonical.short or canonical.deep');
  dim.structure = !errors.some(e => ['id', 'category', 'questionPatterns', 'answer'].includes(e.code));

  // ── COMPOSER COMPATIBILITY — needs a renderable short body ──────────
  if (!n.short) (pub ? E(errors, 'composer_short', 'composer needs canonical.short') : E(warnings, 'composer_short', 'no short answer (composer will improvise)'));
  dim.composer = !!n.short;

  // ── HUMAN QUALITY ───────────────────────────────────────────────────
  if (ROBOTIC.test(body)) E(errors, 'robotic', 'robotic/meta phrasing in answer');
  if (n.short && n.short.trim().split(/\s+/).length < 4) E(warnings, 'too_terse', 'short answer is very terse (e.g. "Gold bullish.")');
  if (n.short && n.short.trim().length > 8 && /^[^a-z]+$/.test(n.short.trim())) E(warnings, 'shouting', 'answer is all-caps');
  dim.human = !ROBOTIC.test(body);

  // ── LANGUAGE QUALITY ────────────────────────────────────────────────
  if (BROKEN.test(body)) E(errors, 'broken_lang', 'broken interpolation/placeholder in answer');
  if (n.lang !== 'en' && !n.localized) E(warnings, 'no_localized', `lang=${n.lang} but no localized body (Language Lock)`);
  dim.language = !BROKEN.test(body);

  // ── MENTOR INTELLIGENCE ─────────────────────────────────────────────
  const g = n.guidance || {};
  const hasMentor = ('tradeProblem' in g) || ('traderProblem' in g) || n.commonMistakes.length || n.misconceptions.length || (Array.isArray(n.nextSteps) && n.nextSteps.length);
  if (!hasMentor && pub) E(warnings, 'mentor_thin', 'thin mentor intelligence (no guidance / mistakes / misconceptions / next steps)');
  dim.mentor = !!hasMentor;

  // ── RELEVANCE (no-drift) ────────────────────────────────────────────
  if (n.relevanceTags.length === 0 && pub) E(warnings, 'relevance_tags', 'no relevanceTags — topic-drift risk at scale');
  dim.relevance = n.relevanceTags.length > 0;

  // ── ASSESSMENT mapping ──────────────────────────────────────────────
  if (n.recommendedAssessment && !ASSESS.has(n.recommendedAssessment)) E(errors, 'assessment_value', 'recommendedAssessment must be "trade", "trader" or null');
  if (g.traderProblem && n.recommendedAssessment && n.recommendedAssessment !== 'trader') E(warnings, 'assessment_mismatch', 'traderProblem true but recommendedAssessment ≠ trader');
  if (g.tradeProblem && n.recommendedAssessment && n.recommendedAssessment !== 'trade') E(warnings, 'assessment_mismatch2', 'tradeProblem true but recommendedAssessment ≠ trade');
  dim.assessment = !(n.recommendedAssessment && !ASSESS.has(n.recommendedAssessment));

  // ── LEARNING PATH ───────────────────────────────────────────────────
  for (const f of ['nextSteps', 'prerequisites', 'related']) {
    if (n[f] !== undefined && !Array.isArray(n[f])) E(errors, `${f}_type`, `${f} must be an array of ids`);
  }
  dim.learning = !errors.some(e => e.code.endsWith('_type'));

  // ── ARTICLE INTELLIGENCE metadata ───────────────────────────────────
  if (n.origin === 'article' && (!n.sources.length || !n.sources[0]?.id)) E(errors, 'article_source', 'article-origin concept requires sources[].id (provenance)');
  dim.article = !(n.origin === 'article' && (!n.sources.length || !n.sources[0]?.id));

  // ── TOOL references ─────────────────────────────────────────────────
  for (const t of n.recommendedTools) if (!TOOLS.has(t)) E(warnings, 'tool_unknown', `unknown tool reference: ${t}`);
  dim.tools = n.recommendedTools.every(t => TOOLS.has(t));

  // ── ENUMS ───────────────────────────────────────────────────────────
  if (n.level && !LEVELS.has(n.level)) E(errors, 'level', `invalid level: ${n.level}`);
  if (n.confidence && !CONF.has(n.confidence)) E(errors, 'confidence', `invalid confidence: ${n.confidence}`);
  if (n.responseObjective && !OBJECTIVES.has(n.responseObjective)) E(errors, 'response_objective', `invalid responseObjective: ${n.responseObjective}`);
  if (pub && !n.responseObjective) E(warnings, 'no_objective', 'no responseObjective — Composer cannot frame the answer goal');

  // ── RISK AWARENESS (trade/market concepts must mention risk) ────────
  const riskRelevant = g.tradeProblem || RISK_INTENTS.has(n.intent);
  if (riskRelevant && !n.riskNote && !/risk|stop|1\s*[-–]?\s*2\s*%|lose|protect|drawdown/i.test(body)) {
    E(warnings, 'no_risk', 'trade/market concept without risk awareness (add riskNote or mention risk)');
  }

  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);
  return { valid: errors.length === 0, score, errors, warnings, dimensions: dim };
}

// Batch helper for ingestion/QA (coverage of a wave before publish).
export function validateBatch(objs = [], opts = {}) {
  const results = objs.map(o => ({ id: o?.id, ...validateKnowledgeObject(o, opts) }));
  const invalid = results.filter(r => !r.valid);
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;
  return { total: results.length, valid: results.length - invalid.length, invalid: invalid.length, avgScore: avg, results };
}
