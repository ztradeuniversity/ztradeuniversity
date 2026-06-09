// functions/utils/kb-store.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11B.1 — KNOWLEDGE GRAPH STORE (AI Chatbot Supabase only). Read/write the
// graph tables (kb_nodes / kb_edges / kb_question_patterns / kb_sources /
// kb_versions / kb_reviews). Own REST client; service key server-only. Every
// call is GRACEFUL — returns []/null/0 when unconfigured OR before the tables
// exist — so the live assistant is unaffected until the graph is provisioned.
// Never touches the Article system, EA, Library, or Memory tables.
// ════════════════════════════════════════════════════════════════════════════

import { rowToEntry, conceptFromSeed, STATUS, deriveEdgesFromKOS } from './kb-graph.js';
import { KB_SEED } from './kb-schema.js';
import { attachEmbedding, isEmbeddingConfigured } from './embedding-provider.js';

export function isConfigured(env) {
  return !!(env?.AI_SUPABASE_URL && env?.AI_SUPABASE_SERVICE_KEY);
}

// Graph activation: ON automatically once the AI Supabase is configured — no env
// flag required. This is the SINGLE activation source for both the chatbot
// retrieval path and the KB Admin badge, so they can never disagree. Retrieval
// still falls back to KB_SEED automatically when the graph returns no rows, so this
// is safe even before the tables are populated. (KB_GRAPH_ENABLED is no longer read
// for activation; the graph follows the data, not a manual/stale flag.)
export function graphActive(env) {
  return isConfigured(env);
}

async function sb(env, method, table, qs, body, prefer) {
  if (!isConfigured(env)) return null;
  try {
    const url = `${env.AI_SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
    const headers = {
      apikey: env.AI_SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    if (method === 'HEAD') return res.headers.get('content-range');
    // return=minimal responses have an EMPTY body, so res.json() would throw and
    // wrongly yield null on a SUCCESSFUL write. Detect it by substring so composite
    // prefers like 'resolution=merge-duplicates,return=minimal' (upsertNode) are
    // correctly treated as success. This is the fix for the false "upsertNode failed"
    // db-write error in publishConcept while the row was actually committed.
    if ((prefer && prefer.includes('return=minimal')) || method === 'DELETE') return true;
    return res.json().catch(() => null);
  } catch { return null; }
}

// ── READ (retrieval-facing) ──────────────────────────────────────────────────
// Published concept nodes mapped to the retrieval "entry" shape.
export async function getPublishedConcepts(env, { lang = 'en', category, limit = 800 } = {}) {
  const cat = category ? `&category=eq.${encodeURIComponent(category)}` : '';
  const rows = await sb(env, 'GET', 'kb_nodes',
    `type=eq.concept&status=eq.${STATUS.PUBLISHED}&lang=eq.${encodeURIComponent(lang)}${cat}&limit=${limit}`, null, null);
  if (!Array.isArray(rows)) return [];
  return rows.map(rowToEntry);
}

export async function getNode(env, id) {
  const rows = await sb(env, 'GET', 'kb_nodes', `id=eq.${encodeURIComponent(id)}&limit=1`, null, null);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function countConcepts(env) {
  const range = await sb(env, 'HEAD', 'kb_nodes', `type=eq.concept&status=eq.${STATUS.PUBLISHED}`, null, 'count=exact');
  if (!range) return 0;
  const total = String(range).split('/').pop();
  const n = parseInt(total, 10);
  return Number.isFinite(n) ? n : 0;
}

// ── WRITE (knowledge economy — used by admin/ingestion later, not the chat path) ─
export async function upsertNode(env, node) {
  return sb(env, 'POST', 'kb_nodes', null, { ...node, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
}
export async function insertQuestionPattern(env, conceptId, text, lang = 'en', sourceId = null) {
  return sb(env, 'POST', 'kb_question_patterns', null, { concept_id: conceptId, text, lang, source_id: sourceId }, 'return=minimal');
}
// Single-row edge insert. Per-row (NOT bulk array) on purpose: kb_edges.dst has a
// FK to kb_nodes(id), so an edge pointing to a not-yet-created node fails. Per-row
// inserts let the VALID edges land while the dangling ones fail in isolation; a bulk
// array insert is atomic and would reject the WHOLE set on the first FK violation
// (→ 0 edges). Returns true on success, null on failure (sb swallows the FK error).
export async function insertEdge(env, src, dst, type, weight = 1.0, meta = {}) {
  return sb(env, 'POST', 'kb_edges', null, { src, dst, type, weight, meta }, 'return=minimal');
}
// Delete derived (outgoing) edges for a node so a re-sync is idempotent.
export async function deleteEdgesBySrc(env, src) {
  return sb(env, 'DELETE', 'kb_edges', `src=eq.${encodeURIComponent(src)}`, null, 'return=minimal');
}
// Phase 11C.4 — regenerate a node's relationship edges from its KOS data.
// Idempotent (delete-by-src + per-edge insert). FK-tolerant: edges to nodes that do
// not exist yet simply fail (inert by design — getNeighbors filters to PUBLISHED
// nodes). With populate limit=1 the per-edge inserts stay well under the subrequest
// budget for a single concept. Re-run via syncAllEdges once all nodes exist to
// backfill concept→concept edges that were forward-referenced during population.
export async function syncEdges(env, node) {
  if (!isConfigured(env) || !node?.id) return { synced: 0, configured: isConfigured(env) };
  const edges = deriveEdgesFromKOS(node);
  await deleteEdgesBySrc(env, node.id);
  let synced = 0;
  for (const e of edges) { if (await insertEdge(env, e.src, e.dst, e.type, e.weight, e.meta)) synced++; }
  return { synced, configured: true };
}
export async function insertSource(env, source) {
  return sb(env, 'POST', 'kb_sources', null, { ...source }, 'return=representation');
}
export async function snapshotVersion(env, node, editor = 'system') {
  return sb(env, 'POST', 'kb_versions', null, { node_id: node.id, version: node.version || 1, data: node.data || {}, status: node.status, editor }, 'return=minimal');
}
export async function addReview(env, nodeId, { status = 'pending', reviewer = null, notes = null } = {}) {
  return sb(env, 'POST', 'kb_reviews', null, { node_id: nodeId, status, reviewer, notes }, 'return=minimal');
}
export async function setStatus(env, id, status) {
  return sb(env, 'PATCH', 'kb_nodes', `id=eq.${encodeURIComponent(id)}`, { status, updated_at: new Date().toISOString() }, 'return=minimal');
}

// Version history (newest first) for rollback (Phase 11C.1).
export async function getVersions(env, nodeId, limit = 10) {
  const rows = await sb(env, 'GET', 'kb_versions', `node_id=eq.${encodeURIComponent(nodeId)}&order=version.desc&limit=${limit}`, null, null);
  return Array.isArray(rows) ? rows : [];
}

// Pending review queue (Phase 11C.1).
export async function getReviewQueue(env, limit = 50) {
  const rows = await sb(env, 'GET', 'kb_nodes', `status=in.(draft,ai_draft,in_review)&order=updated_at.desc&limit=${limit}`, null, null);
  return Array.isArray(rows) ? rows : [];
}

// ── TRAVERSAL (Phase 11B.2) — neighbors of a node along given edge types ─────
// Returns the destination nodes (mapped to entries) for engagement/guidance.
export async function getNeighbors(env, srcId, types = [], limit = 5) {
  if (!isConfigured(env) || !srcId) return [];
  const typeFilter = types.length ? `&type=in.(${types.map(encodeURIComponent).join(',')})` : '';
  const edges = await sb(env, 'GET', 'kb_edges',
    `src=eq.${encodeURIComponent(srcId)}${typeFilter}&order=weight.desc&limit=${limit}`, null, null);
  if (!Array.isArray(edges) || !edges.length) return [];
  const ids = [...new Set(edges.map(e => e.dst))];
  const rows = await sb(env, 'GET', 'kb_nodes',
    `id=in.(${ids.map(encodeURIComponent).join(',')})&status=eq.${STATUS.PUBLISHED}`, null, null);
  if (!Array.isArray(rows)) return [];
  const byId = new Map(rows.map(r => [r.id, rowToEntry(r)]));
  return edges.map(e => ({ edgeType: e.type, weight: e.weight, node: byId.get(e.dst) })).filter(x => x.node);
}

// ── MISSING-KNOWLEDGE QUEUE (Phase 11B.2 Part 6) — capture gaps for admin review.
// Logging only (no ingestion). Distinct misses captured; frequency aggregated DB-side.
export async function logMissingKnowledge(env, { question, intent, category, confidence } = {}) {
  if (!isConfigured(env) || !question) return null;
  const q = String(question).trim().slice(0, 500);
  return sb(env, 'POST', 'kb_missing', null, {
    question: q, question_norm: q.toLowerCase().replace(/\s+/g, ' '),
    intent: intent || null, category: category || null, confidence: confidence || null,
    last_seen: new Date().toISOString(),
  }, 'resolution=merge-duplicates,return=minimal');
}

// ── KNOWLEDGE ANALYTICS (Phase 6) — read the gap queue for admin recommendations.
// Anonymous: only the (normalized) question, intent, category, and frequency. No user
// data. Returns the most-frequently-missed topics so an operator can author the next
// concept/article. Graceful: [] until configured + kb_missing exists.
export async function getMissingKnowledge(env, { limit = 50 } = {}) {
  const rows = await sb(env, 'GET', 'kb_missing',
    `order=frequency.desc.nullslast,last_seen.desc&limit=${limit}`, null, null);
  return Array.isArray(rows) ? rows : [];
}

// ── EMBEDDING BACKFILL (Phase 11C.3) — admin-run, idempotent. Computes vectors
// for published concepts that lack one (data.embedding). Graceful: no-op when
// embeddings unconfigured/disabled. Re-running only fills the gaps (no re-embed).
export async function backfillEmbeddings(env, { limit = 200, offset = 0, force = false } = {}) {
  if (!isConfigured(env)) return { configured: false, embedded: 0 };
  if (env?.KB_EMBEDDINGS_ENABLED !== 'true' || !isEmbeddingConfigured(env)) {
    return { configured: true, embeddings: false, embedded: 0, reason: 'embeddings-disabled' };
  }
  const rows = await sb(env, 'GET', 'kb_nodes',
    `type=eq.concept&status=eq.${STATUS.PUBLISHED}&order=id.asc&limit=${limit}&offset=${offset}`, null, null);
  if (!Array.isArray(rows)) return { configured: true, embeddings: true, embedded: 0 };
  let embedded = 0, skipped = 0;
  for (const row of rows) {
    if (!force && row?.data?.embedding) { skipped++; continue; }
    const before = row?.data?.embedding || null;
    await attachEmbedding(env, row);
    if (row?.data?.embedding && row.data.embedding !== before) { await upsertNode(env, row); embedded++; }
  }
  return { configured: true, embeddings: true, embedded, skipped, scanned: rows.length };
}

// ── EDGE BACKFILL (Phase 11C.4) — regenerate relationship edges for every
// published concept (admin-run, idempotent, paginated). Graceful when unconfigured.
export async function syncAllEdges(env, { limit = 200, offset = 0 } = {}) {
  if (!isConfigured(env)) return { configured: false, nodes: 0, edges: 0 };
  const rows = await sb(env, 'GET', 'kb_nodes',
    `type=eq.concept&status=eq.${STATUS.PUBLISHED}&order=id.asc&limit=${limit}&offset=${offset}`, null, null);
  if (!Array.isArray(rows)) return { configured: true, nodes: 0, edges: 0 };
  let edges = 0;
  for (const row of rows) { const r = await syncEdges(env, row); edges += r.synced || 0; }
  return { configured: true, nodes: rows.length, edges, nextOffset: rows.length === limit ? offset + limit : null };
}

// Diagnostic node write — like upsertNode but surfaces the HTTP status + error
// body instead of swallowing it (so a failed migration self-explains, e.g. a
// missing column). Used only by migrateSeed; the graceful upsertNode is unchanged.
async function writeNodeDiag(env, node) {
  if (!isConfigured(env)) return { ok: false, status: 0, error: 'not-configured' };
  try {
    const res = await fetch(`${env.AI_SUPABASE_URL}/rest/v1/kb_nodes`, {
      method: 'POST',
      headers: {
        apikey: env.AI_SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ ...node, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) return { ok: true, status: res.status };
    const error = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, status: res.status, error };
  } catch (e) { return { ok: false, status: 0, error: String((e && e.message) || e) }; }
}

// ── MIGRATION (Part 3) — seed the legacy KB_SEED into the graph (admin-run, idempotent).
export async function migrateSeed(env) {
  if (!isConfigured(env)) return { migrated: 0, configured: false, total: KB_SEED.length };
  let migrated = 0; const errors = [];
  for (const seed of KB_SEED) {
    const node = conceptFromSeed(seed);
    const r = await writeNodeDiag(env, node);
    if (r.ok) migrated++; else errors.push({ id: seed.id, status: r.status, error: r.error });
  }
  // errors[] only present on failure → a migrated:0 result now explains exactly why.
  return { migrated, configured: true, total: KB_SEED.length, ...(errors.length ? { errors } : {}) };
}
