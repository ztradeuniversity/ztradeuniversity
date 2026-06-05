// functions/utils/embedding-provider.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.3 — EMBEDDING PROVIDER (pluggable, cost-minimal, graceful).
//
// Produces a query/text vector via Cloudflare Workers AI (env.AI binding) or an
// HTTP embeddings endpoint (AI_EMBED_URL + AI_EMBED_KEY). Returns null when not
// configured → callers fall back to lexical scoring (zero cost, no break).
// Pure cosine helper for Worker-side similarity. Default model: bge-base (768d).
// ════════════════════════════════════════════════════════════════════════════

const MODEL = '@cf/baai/bge-base-en-v1.5';   // 768-dim; override via AI_EMBED_MODEL

export function isEmbeddingConfigured(env) {
  return !!(env && (env.AI?.run || (env.AI_EMBED_URL && env.AI_EMBED_KEY)));
}

export async function embedText(env, text) {
  if (!text || !isEmbeddingConfigured(env)) return null;
  const input = String(text).slice(0, 512);
  try {
    if (env.AI && typeof env.AI.run === 'function') {
      const out = await env.AI.run(env.AI_EMBED_MODEL || MODEL, { text: input });
      const vec = out?.data?.[0] || (Array.isArray(out) ? out[0] : null);
      return Array.isArray(vec) ? vec : null;
    }
    if (env.AI_EMBED_URL && env.AI_EMBED_KEY) {
      const res = await fetch(env.AI_EMBED_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.AI_EMBED_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, model: env.AI_EMBED_MODEL || MODEL }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      const vec = j?.data?.[0]?.embedding || j?.data?.[0] || j?.embeddings?.[0] || (Array.isArray(j) ? j[0] : null);
      return Array.isArray(vec) ? vec : null;
    }
  } catch { return null; }
  return null;
}

// Canonical text used to embed a node (title + concepts + question patterns +
// short answer). Stable across author/backfill so query↔node vectors are comparable.
export function embeddingText(node = {}) {
  const d = node.data || node;
  const canon = d.canonical || {};
  return [
    node.title || node.subcategory || node.topic || '',
    (node.concepts || d.concepts || []).join(' '),
    (d.questionPatterns || []).slice(0, 6).join(' '),
    canon.short || d.shortAnswer || '',
  ].filter(Boolean).join('. ').slice(0, 512);
}

// Compute + attach the embedding into node.data.embedding (graceful no-op when
// unconfigured/disabled). Returns the same node object.
export async function attachEmbedding(env, node) {
  if (!node || env?.KB_EMBEDDINGS_ENABLED !== 'true' || !isEmbeddingConfigured(env)) return node;
  const vec = await embedText(env, embeddingText(node)).catch(() => null);
  if (vec) { node.data = node.data || {}; node.data.embedding = vec; }
  return node;
}

// Cosine similarity (-1..1). Safe on shape mismatch → 0.
export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}
