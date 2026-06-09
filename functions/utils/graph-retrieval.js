// functions/utils/graph-retrieval.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11B.1 — GRAPH RETRIEVAL FOUNDATION (abstraction layer).
//
// Single retrieval contract the rest of the system depends on:
//   retrieveBest(env, query, ctx) → { item, semanticScore, confidence } | null
//   retrieve(env, query, ctx)     → [ ...ranked, each with related[]/followups[] ]
//
// Backends are pluggable WITHOUT changing callers:
//   • scorer  — default = lexical scoreEntry (11A.4); swap to pgvector/Workers AI later.
//   • source  — KB graph store when KB_GRAPH_ENABLED + provisioned; else the KB_SEED
//               fallback (identical to today's behavior → zero regression).
//
// `item` is always the retrieval "entry" shape (shortAnswer/deepAnswer/concepts/
// questionPatterns/levels) so ai-chat and the future Composer (11B.3) are stable.
// ════════════════════════════════════════════════════════════════════════════

import { semanticMatch, scoreEntry } from './semantic-retrieval.js';
import { KB_SEED } from './kb-schema.js';
import { getPublishedConcepts, isConfigured, getNeighbors, graphActive, getMissingKnowledge } from './kb-store.js';
import { ENGAGEMENT_EDGES } from './kb-graph.js';
import { isEmbeddingConfigured, embedText } from './embedding-provider.js';
import { makeHybridScorer } from './hybrid-scorer.js';

// Pluggable scorer (default lexical). Future: pgvector / Workers AI embeddings.
let _scorer = scoreEntry;
export function setScorer(fn) { if (typeof fn === 'function') _scorer = fn; }
export function getScorer() { return _scorer; }

function rank(query, entries) {
  // semanticMatch uses the module scorer internally; for an injected scorer we
  // re-rank explicitly so the abstraction stays swap-safe.
  if (_scorer === scoreEntry) return semanticMatch(query, entries);
  return (entries || [])
    .map(item => ({ item, ..._scorer(query, item) }))
    .sort((a, b) => b.semanticScore - a.semanticScore);
}

// Choose the knowledge source: graph store (when enabled + populated) else seed.
// Phase 11C.4 — at scale (KB_RETRIEVAL_NARROW='true') the candidate set is
// category-scoped before scoring, so 1k+ concepts don't all load per turn. The
// flag defaults OFF → loads everything exactly as today (zero regression); when
// a narrowed query returns nothing it falls back to the full set (correctness).
async function loadEntries(env, ctx) {
  const useGraph = graphActive(env);
  if (useGraph) {
    const lang = ctx?.lang || 'en';
    const narrow = env?.KB_RETRIEVAL_NARROW === 'true' && ctx?.category;
    if (narrow) {
      const scoped = await getPublishedConcepts(env, { lang, category: ctx.category });
      if (scoped && scoped.length) return scoped;  // category-scoped candidates
    }
    const rows = await getPublishedConcepts(env, { lang });
    if (rows && rows.length) return rows;          // graph-backed (full)
  }
  return KB_SEED;                                   // graceful fallback — current behavior
}

export async function retrieve(env, query, ctx = {}) {
  const entries = await loadEntries(env, ctx);
  // PHASE 11C.3 — HYBRID: embed the query once and blend semantic + lexical when
  // enabled + configured + entries carry vectors; otherwise pure lexical (today).
  let scorer = null;
  if (env?.KB_EMBEDDINGS_ENABLED === 'true' && isEmbeddingConfigured(env)) {
    const qv = await embedText(env, query).catch(() => null);
    if (qv) scorer = makeHybridScorer(qv);
  }
  const ranked = scorer
    ? entries.map(item => ({ item, ...scorer(query, item) })).sort((a, b) => b.semanticScore - a.semanticScore)
    : rank(query, entries);
  // attach graph context placeholders (filled by graph traversal once embeddings/
  // edges retrieval land; Composer 11B.3 consumes related/followups).
  return ranked.map(r => ({ ...r, related: r.item.related || [], followups: [] }));
}

export async function retrieveBest(env, query, ctx = {}) {
  const ranked = await retrieve(env, query, ctx);
  const top = ranked[0] || null;
  // Phase 11B.2: attach engagement neighbors (natural follow-ups / next-best-action)
  // when the graph is live. The Composer (11B.3) renders these as human sentences;
  // the current pipeline keeps using its own single follow-up, so this is inert today.
  if (top && graphActive(env)) {
    const nb = await getNeighbors(env, top.item.id, ENGAGEMENT_EDGES, 2);
    top.followups = nb.map(x => ({ id: x.node.id, topic: x.node.subcategory || x.node.id, edgeType: x.edgeType }));
  }
  return top;
}

// ── HUMAN BEHAVIOUR LAYER ─────────────────────────────────────────────────────
// Turn a concept's graph neighbours (next-best-question / next-step edges) into ONE
// natural mentor invitation to go deeper — so the bot guides instead of dead-ending.
// English only (KB answers are English-gated); returns '' when there is nothing to
// suggest, so the Composer keeps a single forward line.
// USER ENGAGEMENT LAYER — when the bot can't confidently answer (vague/off-topic),
// guide the user with real, answerable questions pulled live from the graph, spread
// across beginner/intermediate/advanced so there's always a next thing to ask.
// Returns [] when the graph isn't active/populated (caller falls back to its default).
export async function suggestQuestions(env, { lang = 'en', limit = 4, exclude = [], level = null } = {}) {
  if (!graphActive(env)) return [];
  const rows = await getPublishedConcepts(env, { lang });
  if (!rows || !rows.length) return [];
  const ex = new Set(exclude);
  const tiers = { beginner: [], intermediate: [], advanced: [] };
  for (const r of rows) {
    if (ex.has(r.id) || !(r.questionPatterns || []).length) continue;
    (tiers[r.level] || tiers.beginner).push(r);
  }
  const cap = (q) => { const s = String(q || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[?]$/.test(s) ? '' : '?') : ''; };
  // PHASE 4 — bias the tier order to the user's detected level (their level first),
  // so beginners see beginner prompts and advanced users see advanced ones.
  const base = ['beginner', 'intermediate', 'advanced'];
  const order = (level && base.includes(level)) ? [level, ...base.filter(l => l !== level)] : base;
  const out = [];
  for (const lv of order) {
    const pool = tiers[lv];
    if (pool.length) { const r = pool[Math.floor(Math.random() * pool.length)]; const q = cap(r.questionPatterns[0]); if (q && !out.includes(q)) out.push(q); }
  }
  // fill remaining slots, drawing from the user's tier first.
  const all = order.flatMap(lv => tiers[lv]);
  while (out.length < limit && all.length) {
    const r = all.splice(Math.floor(Math.random() * all.length), 1)[0];
    const q = cap(r.questionPatterns[0]); if (q && !out.includes(q)) out.push(q);
  }
  return out.slice(0, limit);
}

// LEARNING PATH SYSTEM — build an ordered journey by walking the graph's
// NEXT_BEST_ACTION edges from a starting concept. Picks the highest-weight next
// step each hop, avoids cycles, stops at maxSteps or a dead end. Purely graph-driven
// (edges built by syncEdges from each concept's nextSteps) — no hardcoded sequence.
export async function buildLearningPath(env, startId, { maxSteps = 6 } = {}) {
  const active = graphActive(env);
  if (!active || !startId) return { start: startId || null, active, steps: 0, path: [] };
  const path = [];
  const seen = new Set([startId]);
  let current = startId;
  for (let i = 0; i < maxSteps; i++) {
    const nb = await getNeighbors(env, current, ['NEXT_BEST_ACTION'], 5);
    const next = (nb || [])
      .filter(x => x.node && x.node.id && !seen.has(x.node.id))
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
    if (!next) break;
    path.push({ id: next.node.id, topic: next.node.subcategory || next.node.id, level: next.node.level || 'beginner' });
    seen.add(next.node.id);
    current = next.node.id;
  }
  return { start: startId, active, steps: path.length, path };
}

// STUDY PLAN ENGINE — generate a personalized, ordered curriculum from the graph.
// Beginner (≈30-day), intermediate (≈60-day), advanced (≈90-day) include concepts up
// to that level, foundation-first. Built dynamically from published concepts — no
// hardcoded syllabus. Each step carries a suggested day so the UI can pace it.
export async function buildStudyPlan(env, { level = 'beginner', count = 12 } = {}) {
  const active = graphActive(env);
  if (!active) return { level, active, total: 0, plan: [] };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  if (!rows || !rows.length) return { level, active, total: 0, plan: [] };
  const rank = { beginner: 0, intermediate: 1, advanced: 2 };
  const target = rank[level] ?? 0;
  // include concepts up to the target tier, foundation-first; concepts with fewer
  // prerequisites come earlier (more foundational), giving a natural learning order.
  const pool = rows
    .filter(r => (rank[r.level] ?? 0) <= target)
    .sort((a, b) => ((rank[a.level] ?? 0) - (rank[b.level] ?? 0))
      || ((a.prerequisites || []).length - (b.prerequisites || []).length));
  const plan = pool.slice(0, count).map((r, i) => ({
    day: i + 1, id: r.id, topic: r.subcategory || r.id, level: r.level || 'beginner',
  }));
  return { level, active, total: plan.length, plan };
}

// MARKET SCENARIO ENGINE — build an educational scenario by pulling the relevant
// concepts from the graph (matched on category/concept tags). The scenario themes are
// named, but ALL content comes from the live graph — no hardcoded scenario answers.
const _SCENARIOS = {
  'bullish-gold':   { title: 'Bullish Gold Scenario',  match: ['gold', 'macro', 'trend'] },
  'bearish-gold':   { title: 'Bearish Gold Scenario',  match: ['gold', 'dxy', 'dollar', 'yield'] },
  'high-inflation': { title: 'High Inflation Scenario', match: ['inflation', 'cpi', 'rate', 'macro'] },
  'strong-dollar':  { title: 'Strong Dollar Scenario', match: ['dollar', 'dxy', 'correlation'] },
  'risk-on':        { title: 'Risk-On Environment',     match: ['risk', 'sentiment', 'trend'] },
  'risk-off':       { title: 'Risk-Off Environment',    match: ['risk', 'safe', 'crisis', 'volatility'] },
};
export function scenarioKeys() { return Object.keys(_SCENARIOS); }
export async function buildScenario(env, key, { limit = 6 } = {}) {
  const active = graphActive(env);
  const def = _SCENARIOS[key] || _SCENARIOS['bullish-gold'];
  if (!active) return { key, title: def.title, active, concepts: [] };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  if (!rows || !rows.length) return { key, title: def.title, active, concepts: [] };
  const hits = rows.filter(r => {
    const hay = [String(r.category || ''), ...(r.concepts || [])].map(x => String(x).toLowerCase());
    return def.match.some(m => hay.some(h => h.includes(m)));
  }).slice(0, limit).map(r => ({ id: r.id, topic: r.subcategory || r.id, level: r.level || 'beginner' }));
  return { key, title: def.title, active, total: hits.length, concepts: hits };
}

// AI TRADING UNIVERSITY — assemble courses dynamically from graph concepts by level
// and/or specialist category. The course names are fixed; the modules are pulled live
// from the graph (never hardcoded), foundation-first.
const _COURSES = {
  beginner:          { title: 'Beginner Course',     level: 'beginner' },
  intermediate:      { title: 'Intermediate Course', level: 'intermediate' },
  advanced:          { title: 'Advanced Course',     level: 'advanced' },
  professional:      { title: 'Professional Course', cats: ['coaching', 'institutional', 'research', 'advanced'] },
  'gold-specialist': { title: 'Gold Specialist',     cats: ['gold'] },
  'forex-specialist':{ title: 'Forex Specialist',    cats: ['forex', 'markets'] },
  'risk-specialist': { title: 'Risk Specialist',     cats: ['risk', 'mistakes'] },
  'psychology-specialist': { title: 'Psychology Specialist', cats: ['psychology', 'coaching', 'discipline'] },
};

// AI TRADING LAB — generate practical lab tasks by skill type, pulled live from the
// relevant graph categories (chart reading, decision-making, risk, psychology). No
// hardcoded task bank.
const _LAB_TYPES = {
  chart:      ['structure', 'price-action', 'smart-money', 'liquidity'],
  decision:   ['strategy', 'execution', 'assessment'],
  risk:       ['risk', 'mistakes', 'markets'],
  psychology: ['psychology', 'coaching', 'discipline'],
};
export function labTypes() { return Object.keys(_LAB_TYPES); }
export async function buildLab(env, { type = 'chart', level = null, count = 5 } = {}) {
  const active = graphActive(env);
  const cats = _LAB_TYPES[type] || _LAB_TYPES.chart;
  if (!active) return { type, active, count: 0, tasks: [] };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  if (!rows || !rows.length) return { type, active, count: 0, tasks: [] };
  const cap = (q) => { const s = String(q || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[?]$/.test(s) ? '' : '?') : ''; };
  let pool = rows.filter(r => cats.includes(r.category) && (r.questionPatterns || []).length);
  if (level) pool = pool.filter(r => (r.level || 'beginner') === level);
  const tasks = []; const used = new Set();
  while (tasks.length < count && used.size < pool.length) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    if (!r || used.has(r.id)) continue; used.add(r.id);
    tasks.push({ id: r.id, task: cap(r.questionPatterns[0]), topic: r.subcategory || r.id, hint: (r.commonMistakes && r.commonMistakes[0]) || null });
  }
  return { type, active, count: tasks.length, tasks };
}

// AI CASE STUDY ENGINE — build a case study from a single concept's own graph data.
export async function buildCaseStudy(env, conceptId) {
  const active = graphActive(env);
  if (!active || !conceptId) return { id: conceptId || null, active, caseStudy: null };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  const c = (rows || []).find(r => r.id === conceptId);
  if (!c) return { id: conceptId, active, caseStudy: null };
  return {
    id: conceptId, active,
    caseStudy: {
      title: c.subcategory || c.id,
      scenario: c.shortAnswer || null,
      lesson: c.deepAnswer || c.shortAnswer || null,
      commonMistake: (c.commonMistakes && c.commonMistakes[0]) || null,
      realContext: c.marketContext || null,
      related: c.related || [],
    },
  };
}

// AI CERTIFICATION SYSTEM — a certification = a course (modules) + an exam requirement.
const _CERTS = {
  'beginner-trader':      { course: 'beginner',              examLevel: 'beginner' },
  'intermediate-trader':  { course: 'intermediate',          examLevel: 'intermediate' },
  'advanced-trader':      { course: 'advanced',              examLevel: 'advanced' },
  'gold-specialist':      { course: 'gold-specialist',       examLevel: 'intermediate' },
  'forex-specialist':     { course: 'forex-specialist',      examLevel: 'intermediate' },
  'risk-specialist':      { course: 'risk-specialist',       examLevel: 'intermediate' },
  'psychology-specialist':{ course: 'psychology-specialist', examLevel: 'intermediate' },
};
export function certificationKeys() { return Object.keys(_CERTS); }
export async function buildCertification(env, key) {
  const def = _CERTS[key] || _CERTS['beginner-trader'];
  const course = await buildCourse(env, def.course);
  return {
    key, title: `${course.title} Certification`, active: course.active,
    requirements: { completeModules: course.total, examPassMark: '70%', examLevel: def.examLevel },
    modules: course.modules,
  };
}
export function courseKeys() { return Object.keys(_COURSES); }
export async function buildCourse(env, key, { limit = 15 } = {}) {
  const active = graphActive(env);
  const def = _COURSES[key] || _COURSES.beginner;
  if (!active) return { key, title: def.title, active, modules: [] };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  if (!rows || !rows.length) return { key, title: def.title, active, modules: [] };
  const rank = { beginner: 0, intermediate: 1, advanced: 2 };
  let pool = rows;
  if (def.cats) pool = pool.filter(r => def.cats.includes(r.category));
  if (def.level != null) {
    const t = rank[def.level] ?? 0;
    pool = pool.filter(r => (rank[r.level] ?? 0) <= t);
  }
  pool = pool.sort((a, b) => ((rank[a.level] ?? 0) - (rank[b.level] ?? 0))
    || ((a.prerequisites || []).length - (b.prerequisites || []).length));
  const modules = pool.slice(0, limit).map((r, i) => ({ module: i + 1, id: r.id, topic: r.subcategory || r.id, level: r.level || 'beginner' }));
  return { key, title: def.title, active, total: modules.length, modules };
}

// AI MENTOR MISSIONS — practical, graph-generated tasks ("Study X", "Practice Y").
export async function buildMissions(env, { level = null, count = 5 } = {}) {
  const active = graphActive(env);
  if (!active) return { active, count: 0, missions: [] };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  if (!rows || !rows.length) return { active, count: 0, missions: [] };
  let pool = rows.filter(r => (r.questionPatterns || []).length);
  if (level) pool = pool.filter(r => (r.level || 'beginner') === level);
  const verbs = ['Study', 'Learn', 'Review', 'Master', 'Practice'];
  const missions = []; const used = new Set();
  while (missions.length < count && used.size < pool.length) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    if (!r || used.has(r.id)) continue; used.add(r.id);
    const topic = r.subcategory || r.id;
    missions.push({ id: r.id, mission: `${verbs[missions.length % verbs.length]}: ${topic}`, topic, level: r.level || 'beginner' });
  }
  return { active, count: missions.length, missions };
}

// AI EXAMINATION — a graded set of graph-sourced questions with a 70% pass mark.
// (Scoring is performed by the client against the concept ids; this generates the test.)
export async function buildExam(env, { level = 'beginner', count = 10 } = {}) {
  const p = await buildPractice(env, { level, count });
  return { level, active: p.active, total: p.exercises.length, passMark: Math.ceil((p.exercises.length || 0) * 0.7), questions: p.exercises };
}

// AI PRACTICE MODE — generate educational exercises straight from graph concepts of
// the chosen level. Each exercise = a concept's question prompt + the topic + a hint
// derived from its common mistake. No hardcoded quiz bank; scales with the graph.
export async function buildPractice(env, { level = 'beginner', count = 3 } = {}) {
  const active = graphActive(env);
  if (!active) return { level, active, count: 0, exercises: [] };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  if (!rows || !rows.length) return { level, active, count: 0, exercises: [] };
  const capQ = (q) => { const s = String(q || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[?]$/.test(s) ? '' : '?') : ''; };
  const pool = rows.filter(r => (r.level || 'beginner') === level && (r.questionPatterns || []).length);
  const exercises = [];
  const used = new Set();
  while (exercises.length < count && used.size < pool.length) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    if (!r || used.has(r.id)) continue;
    used.add(r.id);
    exercises.push({
      id: r.id,
      prompt: capQ(r.questionPatterns[0]),
      topic: r.subcategory || r.id,
      hint: (r.commonMistakes && r.commonMistakes[0]) || (r.misconceptions && r.misconceptions[0]) || null,
    });
  }
  return { level, active, count: exercises.length, exercises };
}

// AI TRADING DESK — session/event checklists assembled from the relevant graph
// concepts. The checklist names + concept sequence are curated operations; the CONTENT
// (each item's guidance) is pulled live from the graph, never hardcoded text.
const _CHECKLISTS = {
  'pre-market':    ['market-recon', 'daily-bias-formation', 'watchlist-building', 'risk-budgeting', 'economic-calendar'],
  'london':        ['session-models', 'killzones', 'daily-bias-formation', 'liquidity-sweep'],
  'new-york':      ['session-handover', 'news-desk-protocol', 'session-models'],
  'news-event':    ['news-desk-protocol', 'economic-news-impact', 'fomc'],
  'post-trade':    ['post-trade-review', 'professional-journaling', 'decision-quality'],
  'weekly-review': ['weekly-planning', 'monthly-review', 'performance-attribution'],
};
export function checklistKeys() { return Object.keys(_CHECKLISTS); }
export async function buildChecklist(env, key) {
  const active = graphActive(env);
  const ids = _CHECKLISTS[key] || _CHECKLISTS['pre-market'];
  if (!active) return { key, active, items: [] };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  const byId = new Map((rows || []).map(r => [r.id, r]));
  const items = ids.map(id => { const c = byId.get(id); return c ? { id, topic: c.subcategory || id, guidance: c.shortAnswer || null } : null; }).filter(Boolean);
  return { key, active, total: items.length, items };
}

// AI PLAYBOOK ENGINE — a structured playbook built from one concept's own graph data.
export async function buildPlaybook(env, conceptId) {
  const active = graphActive(env);
  if (!active || !conceptId) return { id: conceptId || null, active, playbook: null };
  const rows = await getPublishedConcepts(env, { lang: 'en' });
  const c = (rows || []).find(r => r.id === conceptId);
  if (!c) return { id: conceptId, active, playbook: null };
  return {
    id: conceptId, active,
    playbook: {
      title: c.subcategory || c.id,
      setup: c.shortAnswer || null,
      execution: c.deepAnswer || c.shortAnswer || null,
      avoid: (c.commonMistakes && c.commonMistakes[0]) || null,
      riskNote: c.riskNote || null,
      context: c.marketContext || null,
      related: c.related || [],
      nextSteps: c.nextSteps || [],
    },
  };
}

// AI ACHIEVEMENT SYSTEM — graph-anchored achievements with completion requirements.
// Foundational achievements are activity-based; specialist ones map to certifications
// (which are themselves graph-built), so requirements stay tied to real content.
export function buildAchievements() {
  return {
    achievements: [
      { key: 'first-lesson',        title: 'First Lesson',        requirement: 'View your first concept' },
      { key: 'first-mission',       title: 'First Mission',       requirement: 'Complete one mission' },
      { key: 'first-practice',      title: 'First Practice',      requirement: 'Complete one practice exercise' },
      { key: 'first-exam',          title: 'First Exam',          requirement: 'Pass one exam (≥70%)' },
      { key: 'gold-specialist',     title: 'Gold Specialist',     requirement: 'Complete the Gold Specialist certification' },
      { key: 'forex-specialist',    title: 'Forex Specialist',    requirement: 'Complete the Forex Specialist certification' },
      { key: 'psychology-master',   title: 'Psychology Master',   requirement: 'Complete the Psychology Specialist certification' },
      { key: 'risk-manager',        title: 'Risk Manager',        requirement: 'Complete the Risk Specialist certification' },
      { key: 'professional-trader', title: 'Professional Trader', requirement: 'Complete the Advanced Trader certification' },
    ],
  };
}

// AI TRADING DASHBOARD — one unified, graph-driven view that composes the existing
// engines (roadmap, missions, practice, recommendations, weak areas, certifications)
// for the user's level. No new data source, no duplicate logic — pure aggregation.
export async function buildDashboard(env, { level = 'beginner' } = {}) {
  const active = graphActive(env);
  if (!active) return { active, level };
  const planCount = level === 'advanced' ? 30 : level === 'intermediate' ? 20 : 12;
  const [roadmap, missions, practice, recommended] = await Promise.all([
    buildStudyPlan(env, { level, count: planCount }),
    buildMissions(env, { level, count: 3 }),
    buildPractice(env, { level, count: 3 }),
    suggestQuestions(env, { lang: 'en', limit: 4, level }),
  ]);
  let weakAreas = [];
  try {
    const missing = await getMissingKnowledge(env, { limit: 20 });
    const byCat = {};
    for (const m of missing) { const c = m.category || 'uncategorized'; byCat[c] = (byCat[c] || 0) + (m.frequency || 1); }
    weakAreas = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([category, count]) => ({ category, count }));
  } catch { /* analytics is additive */ }
  return {
    active, level,
    roadmap: roadmap.plan || [],
    missions: missions.missions || [],
    practice: practice.exercises || [],
    recommendedConcepts: recommended,
    weakAreas,
    certifications: certificationKeys(),
  };
}

const _titleize = (s) => String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export function nextStepInvite(followups = [], item = {}) {
  let topics = (Array.isArray(followups) ? followups : [])
    .map(f => f && (f.topic || f.id)).filter(Boolean).map(_titleize);
  if (!topics.length) {
    topics = [...(item.related || []), ...(item.nextSteps || [])].slice(0, 2).map(_titleize);
  }
  topics = [...new Set(topics)].slice(0, 2);
  if (!topics.length) return '';
  const list = topics.length === 2 ? `**${topics[0]}** or **${topics[1]}**` : `**${topics[0]}**`;
  return `If you'd like to go deeper, I can walk you through ${list} next — just ask.`;
}
