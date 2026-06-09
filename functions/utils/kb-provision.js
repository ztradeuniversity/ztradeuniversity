// functions/utils/kb-provision.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.0C — GRAPH PROVISIONING, PARITY & ROLLBACK SAFETY (utilities only).
//
// Safe, read-mostly helpers to provision and verify the knowledge graph WITHOUT
// touching the live chat path:
//   • checkSchema(env)      — which kb_* tables exist (HEAD probes; graceful)
//   • provisionStatus(env)  — configured / graphEnabled / schema / count / ready
//   • validateParity(env)   — graph retrieval returns the SAME concept as KB_SEED
//   • rollbackCheck(env)    — confirms the KB_SEED fallback path is intact
//
// migrateSeed lives in kb-store (idempotent). Nothing here populates, embeds,
// ingests, or changes traversal. All graceful when unconfigured / un-provisioned.
// ════════════════════════════════════════════════════════════════════════════

import { isConfigured, countConcepts, migrateSeed, graphActive } from './kb-store.js';
import { retrieveBest } from './graph-retrieval.js';
import { semanticMatch } from './semantic-retrieval.js';
import { KB_SEED } from './kb-schema.js';

const KB_TABLES = ['kb_nodes', 'kb_edges', 'kb_question_patterns', 'kb_sources', 'kb_versions', 'kb_reviews'];

async function tableExists(env, table) {
  if (!isConfigured(env)) return false;
  try {
    const res = await fetch(`${env.AI_SUPABASE_URL}/rest/v1/${table}?limit=1`, {
      method: 'HEAD',
      headers: { apikey: env.AI_SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok || res.status === 206;   // 200/206 = table present
  } catch { return false; }
}

export async function checkSchema(env) {
  const out = {};
  for (const t of KB_TABLES) out[t] = await tableExists(env, t);
  return out;
}

export async function provisionStatus(env) {
  const configured = isConfigured(env);
  const schema = await checkSchema(env);
  const schemaComplete = KB_TABLES.every(t => schema[t]);
  // Count published concepts whenever kb_nodes exists (retrieval only needs kb_nodes),
  // NOT gated on full schema — the other kb_* tables are optional for serving answers.
  const conceptCount = (configured && schema.kb_nodes) ? await countConcepts(env) : 0;
  // SINGLE SOURCE OF TRUTH: the badge reports exactly what the chatbot uses to decide
  // graph vs KB_SEED — graphActive(env). No separate/stricter badge logic.
  const graphEnabled = graphActive(env);
  return {
    configured, graphEnabled, schema, schemaComplete, conceptCount,
    ready: configured && schema.kb_nodes && conceptCount > 0,
    note: !configured ? 'AI Supabase not configured'
      : !schema.kb_nodes ? 'run the kb_* SQL (at least kb_nodes), then migrateSeed'
      : conceptCount === 0 ? 'kb_nodes exists; run migrateSeed + populate'
      : 'graph live',
  };
}

// Migrate the legacy seed, then immediately parity-check (admin-triggered).
export async function provisionSeed(env) {
  const mig = await migrateSeed(env);
  const parity = await validateParity(env);
  return { migrate: mig, parity };
}

// Parity: for each seed concept's lead pattern, current retrieval must return
// that concept at HIGH confidence — true whether the source is graph or KB_SEED
// (so it passes pre-migration via fallback AND post-migration via the graph).
export async function validateParity(env) {
  // Parity = current retrieval (graph when live, else KB_SEED) returns the SAME
  // concept + confidence as the canonical KB_SEED source for every seed query.
  // True pre-migration (fallback) AND post-migration (identical entries).
  const results = [];
  for (const seed of KB_SEED) {
    const q = (seed.questionPatterns || [])[0] || seed.id;
    const seedTop = semanticMatch(q, KB_SEED)[0] || null;
    const got = await retrieveBest(env, q, { lang: 'en' });
    const ok = !!got && !!seedTop && got.item.id === seedTop.item.id && got.confidence === seedTop.confidence;
    results.push({ q, expected: seedTop?.item?.id || null, gotId: got?.item?.id || null, seedConf: seedTop?.confidence || null, gotConf: got?.confidence || null, ok });
  }
  return { parity: results.every(r => r.ok), checked: results.length, results };
}

// Rollback safety: the KB_SEED fallback must always resolve, regardless of graph
// state, so KB_GRAPH_ENABLED=false instantly reverts behavior with no data loss.
export function rollbackCheck(env) {
  const probe = semanticMatch('how do I stop losing accounts', KB_SEED)[0];
  return {
    rollbackSafe: probe?.item?.id === 'recovery-001' && probe?.confidence === 'HIGH',
    currentFlag: graphActive(env) ? 'on' : 'off',
    revert: 'set KB_GRAPH_ENABLED=false → retrieval falls back to KB_SEED (tables remain, inert)',
  };
}
