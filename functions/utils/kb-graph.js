// functions/utils/kb-graph.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11B.1 — KNOWLEDGE GRAPH MODEL (pure, no I/O). Node/edge taxonomy, the
// lifecycle/origin vocab, merge-safe helpers (dedup prep), and mappers between
// DB rows and the retrieval "entry" shape used by semantic-retrieval/ai-chat.
//
// The graph — not any answer string and never a future LLM — is the source of
// truth. This module defines its shape so 1k → 10k+ concepts need no redesign.
// ════════════════════════════════════════════════════════════════════════════

export const NODE_TYPES = Object.freeze({
  CONCEPT: 'concept', CATEGORY: 'category', TOPIC: 'topic', TAG: 'tag',
  // Phase 11B.2 — the human-guidance graph
  CONVERSATION: 'conversation',   // greetings / thanks / farewell / well-being
  EMOTION: 'emotion',             // frustrated / confused / overwhelmed / fear-after-loss
  TOOL: 'tool',                   // trade-assessment / lot-calculator / chart-analysis
  ARTICLE: 'article',             // mirrors an ai_articles row (no ownership change)
  COURSE: 'course',               // learning roadmap / educational track
});
export const EDGE_TYPES = Object.freeze({
  BELONGS_TO: 'BELONGS_TO', RELATED_TO: 'RELATED_TO', PREREQUISITE_OF: 'PREREQUISITE_OF',
  SUGGESTS: 'SUGGESTS', MAPS_TO_INTENT: 'MAPS_TO_INTENT', TAGGED: 'TAGGED', DERIVED_FROM: 'DERIVED_FROM',
  // Phase 11B.2 — guidance / engagement / journey edges
  LEADS_TO: 'LEADS_TO', NEXT_BEST_ACTION: 'NEXT_BEST_ACTION',
  RECOMMENDS_TOOL: 'RECOMMENDS_TOOL', RECOMMENDS_ARTICLE: 'RECOMMENDS_ARTICLE', RECOMMENDS_COURSE: 'RECOMMENDS_COURSE',
  SUPPORTS_EMOTION: 'SUPPORTS_EMOTION', COMMON_NEXT_QUESTION: 'COMMON_NEXT_QUESTION',
  COMMON_BEGINNER_PATH: 'COMMON_BEGINNER_PATH', COMMON_RECOVERY_PATH: 'COMMON_RECOVERY_PATH',
});
// Edge types that surface natural "if you'd like, I can also…" follow-ups.
export const ENGAGEMENT_EDGES = Object.freeze(['COMMON_NEXT_QUESTION', 'NEXT_BEST_ACTION', 'SUGGESTS', 'LEADS_TO']);
// Knowledge lifecycle (Part 6) — only PUBLISHED is ever retrieved.
export const STATUS = Object.freeze({ DRAFT: 'draft', AI_DRAFT: 'ai_draft', IN_REVIEW: 'in_review', PUBLISHED: 'published', DEPRECATED: 'deprecated', ARCHIVED: 'archived' });
export const ORIGIN = Object.freeze({ AUTHORED: 'authored', ARTICLE: 'article', AI_GENERATED: 'ai_generated', IMPORTED: 'imported' });

// Normalized dedup signature (Part 8) — concepts + topic, order-independent.
export function mergeKey(node) {
  const tags = [...new Set(node.concepts || [])].map(t => String(t).toLowerCase()).sort().join(',');
  return `${String(node.topic || node.subcategory || '').toLowerCase().trim()}|${tags}`;
}

// DB row → retrieval "entry" (the exact shape semantic-retrieval.scoreEntry expects).
export function rowToEntry(row) {
  const data = (row && row.data) || {};
  const canon = data.canonical || {};
  return {
    id: row.id,
    category: row.category,
    subcategory: row.topic,
    level: row.level || 'beginner',
    concepts: row.concepts || data.concepts || [],
    questionPatterns: data.questionPatterns || [],
    shortAnswer: canon.short || data.shortAnswer || null,
    deepAnswer: canon.deep || data.deepAnswer || null,
    related: data.related || [],
    levels: data.levels || null,
    // Worker-side vector (jsonb array) for hybrid cosine; the pgvector column is
    // reserved for future server-side ANN. null until backfilled.
    embedding: data.embedding || row.embedding || null,
    status: row.status, origin: row.origin, version: row.version, lang: row.lang || 'en',
  };
}

// Seed/legacy entry → graph node row (migration + parity; no content invented).
export function conceptFromSeed(seed, extra = {}) {
  return {
    id: seed.id,
    type: NODE_TYPES.CONCEPT,
    category: seed.category,
    topic: seed.subcategory || null,
    level: seed.level || 'beginner',
    title: seed.subcategory || seed.id,
    concepts: seed.concepts || [],
    data: {
      canonical: { short: seed.shortAnswer || null, deep: seed.deepAnswer || null },
      questionPatterns: seed.questionPatterns || [],
      related: seed.related || [],
      levels: seed.levels || null,
    },
    intent: extra.intent || null,
    status: STATUS.PUBLISHED,
    origin: ORIGIN.AUTHORED,
    confidence: 'HIGH',
    version: 1,
    merge_key: mergeKey({ topic: seed.subcategory, concepts: seed.concepts }),
    lang: 'en',
    ...extra,
  };
}

// Merge-safe union (dedup-on-ingest prep). Survivor keeps canonical truth; the
// duplicate's patterns/concepts/related fold in, and the dup is archived with a
// pointer to the survivor (no data loss, reversible).
export function mergeNodes(survivor, duplicate) {
  const union = (a = [], b = []) => [...new Set([...(a || []), ...(b || [])])];
  const sData = survivor.data || {}, dData = duplicate.data || {};
  return {
    survivor: {
      ...survivor,
      concepts: union(survivor.concepts, duplicate.concepts),
      data: {
        ...sData,
        questionPatterns: union(sData.questionPatterns, dData.questionPatterns),
        related: union(sData.related, dData.related),
        canonical: sData.canonical || dData.canonical || {},
        levels: sData.levels || dData.levels || null,
      },
      version: (survivor.version || 1) + 1,
    },
    archived: { ...duplicate, status: STATUS.ARCHIVED, merged_into: survivor.id },
  };
}

// Map a full KOS object → kb_nodes row (mentor intelligence into data jsonb).
export function nodeFromKOS(kos) {
  return {
    id: kos.id, type: NODE_TYPES.CONCEPT, category: kos.category,
    topic: kos.topic || kos.subcategory || null, level: kos.level || 'beginner',
    title: kos.title || kos.topic || kos.id, concepts: kos.concepts || [],
    data: {
      canonical: kos.canonical || { short: kos.shortAnswer || null, deep: kos.deepAnswer || null },
      levels: kos.levels || null, localized: kos.localized || null,
      questionPatterns: kos.questionPatterns || [], related: kos.related || [],
      prerequisites: kos.prerequisites || [], nextSteps: kos.nextSteps || [], followups: kos.followups || [],
      guidance: kos.guidance || {}, commonMistakes: kos.commonMistakes || [], misconceptions: kos.misconceptions || [],
      islamic: kos.islamic || null, riskNote: kos.riskNote || null,
      recommendedTools: kos.recommendedTools || [], recommendedArticles: kos.recommendedArticles || [],
      recommendedAssessment: kos.recommendedAssessment || null,
      relevanceTags: kos.relevanceTags || [], negativeExamples: kos.negativeExamples || [],
      journeyStages: kos.journeyStages || [], contexts: kos.contexts || {},
      // Phase 11C.2 — answer intent for the (future) Composer:
      responseObjective: kos.responseObjective || null,   // educate|mentor|encourage|warn|clarify|recover|assess|motivate
      desiredOutcome: kos.desiredOutcome || null,          // e.g. "confidence without false certainty"
    },
    intent: kos.intent || null,
    status: kos.status || STATUS.DRAFT, origin: kos.origin || ORIGIN.AUTHORED,
    confidence: kos.confidence || 'MEDIUM', version: kos.version || 1, lang: kos.lang || 'en',
    merge_key: mergeKey({ topic: kos.topic || kos.subcategory, concepts: kos.concepts }),
  };
}

// Derive the SINGLE best next action from a node's data (the composer offers one,
// never a menu). Order: assessment → tool → article → learning step.
export function deriveRecommendedAction(data = {}) {
  if (data.recommendedAssessment === 'trader') return { type: 'assessment', ref: 'trader-self-assessment' };
  if (data.recommendedAssessment === 'trade')  return { type: 'assessment', ref: 'trade-assessment' };
  if (Array.isArray(data.recommendedTools) && data.recommendedTools.length)    return { type: 'tool', ref: data.recommendedTools[0] };
  if (Array.isArray(data.recommendedArticles) && data.recommendedArticles.length) return { type: 'article', ref: data.recommendedArticles[0] };
  if (Array.isArray(data.nextSteps) && data.nextSteps.length)                  return { type: 'learning', ref: data.nextSteps[0] };
  return { type: null, ref: null };
}

// Derive the relationship graph for a node from its KOS data (Phase 11C.4).
// ALL edges are OUTGOING from node.id so a sync = delete-by-src + re-insert is
// fully idempotent. Targets may not exist yet (tool:/article:/category: refs or
// future concepts) — getNeighbors filters to PUBLISHED nodes, so dangling edges
// are simply inert until the target lands (no redesign, no orphan errors).
export function deriveEdgesFromKOS(node) {
  if (!node || !node.id) return [];
  const d = node.data || {};
  const out = [];
  const add = (dst, type, weight = 1.0, meta = {}) => {
    const id = dst == null ? '' : String(dst).trim();
    if (id && id !== node.id) out.push({ src: node.id, dst: id, type, weight, meta: { derived: true, ...meta } });
  };
  if (node.category) add(`category:${node.category}`, EDGE_TYPES.BELONGS_TO, 1.0, { kind: 'category' });
  for (const r of (d.related || []))         add(r, EDGE_TYPES.RELATED_TO, 0.8);
  for (const p of (d.prerequisites || []))   add(p, EDGE_TYPES.PREREQUISITE_OF, 0.9, { role: 'requires' });
  (d.nextSteps || []).forEach((nx, i)   =>   add(nx, EDGE_TYPES.NEXT_BEST_ACTION, Math.max(0.5, 1.0 - i * 0.1)));
  (d.followups || []).forEach((f)       =>   add(f, EDGE_TYPES.COMMON_NEXT_QUESTION, 0.7));
  for (const t of (d.recommendedTools || []))    add(`tool:${t}`, EDGE_TYPES.RECOMMENDS_TOOL, 0.9, { kind: 'tool' });
  for (const a of (d.recommendedArticles || [])) add(`article:${a}`, EDGE_TYPES.RECOMMENDS_ARTICLE, 0.8, { kind: 'article' });
  if (d.recommendedAssessment === 'trader') add('tool:assess-trader', EDGE_TYPES.NEXT_BEST_ACTION, 0.95, { kind: 'assessment' });
  if (d.recommendedAssessment === 'trade')  add('tool:assess-trade',  EDGE_TYPES.NEXT_BEST_ACTION, 0.95, { kind: 'assessment' });
  for (const j of (d.journeyStages || []))   add(j, EDGE_TYPES.LEADS_TO, 0.85, { kind: 'journey' });
  // de-dup identical (dst,type) pairs
  const seen = new Set();
  return out.filter(e => { const k = `${e.dst}|${e.type}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function validateNode(n) {
  return !!(n && n.id && n.type && (n.type !== NODE_TYPES.CONCEPT || (n.data && (n.data.canonical?.short || n.data.canonical?.deep))));
}
