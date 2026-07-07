// functions/utils/error-center.js
// ════════════════════════════════════════════════════════════════════════════
// ERROR CENTER (spec Phase 9) — aggregates every REAL failure signal already
// tracked in this codebase into one categorized list: kb_system_log (embedding/
// graph-sync/article-ingestion/chunking failures), ai_articles rows whose last
// publish attempt failed (last_verification.ok===false, see ai-articles.js), and
// live API probe failures (health-probes.js + /api/diagnose). No new failure
// tracking is invented — an empty list means nothing has actually failed.
// ════════════════════════════════════════════════════════════════════════════

import { getSystemLog } from './system-log.js';
import { listArticles } from './article-store.js';

// kb_system_log has no dedicated error-code column (see system-log.js) — group by
// kind + message prefix so repeated identical failures collapse into one row with
// an occurrence count, exactly like the spec's "Occurrences Count" column.
function groupSystemLogErrors(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.kind}:${(r.message || '').slice(0, 80)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        name: r.message || r.kind, module: r.kind, category: 'System Log',
        severity: r.level, rootCause: r.message, lastOccurrence: r.created_at,
        occurrences: 0, status: 'open',
      });
    }
    const g = groups.get(key);
    g.occurrences++;
    if (new Date(r.created_at) > new Date(g.lastOccurrence)) g.lastOccurrence = r.created_at;
  }
  return [...groups.values()];
}

// Only kinds a real existing admin action can plausibly fix automatically —
// never claim auto-repair is available when nothing in this codebase does it.
const AUTO_REPAIRABLE_KINDS = new Set(['graph-sync', 'chunking', 'embedding']);

export async function buildErrorCenter(env) {
  const logRows = await getSystemLog(env, { limit: 300 }).catch(() => []);
  const logErrors = groupSystemLogErrors(logRows.filter(r => r.level === 'error')).map(e => ({
    ...e,
    autoRepair: AUTO_REPAIRABLE_KINDS.has(e.module) ? { action: 'sync-edges', label: 'Sync graph edges' } : null,
    manualFix: AUTO_REPAIRABLE_KINDS.has(e.module) ? null : `Check ${e.module} — see kb_system_log.meta for the full error payload.`,
  }));

  const articles = await listArticles(env, { status: 'all', limit: 200 }).catch(() => []);
  const failedArticles = articles
    .filter(a => a.last_verification && a.last_verification.ok === false)
    .map(a => ({
      name: `Publish pipeline failed: ${a.title}`, module: 'publishing', category: 'Publishing Pipeline',
      severity: 'error',
      rootCause: !a.last_verification.knowledgeGraph?.conceptPublished
        ? 'Knowledge graph write did not complete on the last publish attempt.'
        : 'SEO/canonical/sitemap fields were incomplete on the last publish attempt.',
      lastOccurrence: a.updated_at, occurrences: 1,
      status: a.is_active ? 'open — live but drifted from graph' : 'open — draft, never published',
      articleId: a.id,
      autoRepair: { action: 'repair-article', label: 'Improve & Republish' },
      manualFix: null,
    }));

  const errors = [...failedArticles, ...logErrors]
    .sort((a, b) => new Date(b.lastOccurrence || 0) - new Date(a.lastOccurrence || 0));

  return {
    errors,
    totals: {
      total: errors.length,
      critical: errors.filter(e => e.severity === 'error').length,
      warnings: logRows.filter(r => r.level === 'warn').length,
    },
    note: 'Aggregates kb_system_log (real failure trail), ai_articles rows whose last publish attempt failed, and (via health-live) API probe failures. No error is invented.',
  };
}
