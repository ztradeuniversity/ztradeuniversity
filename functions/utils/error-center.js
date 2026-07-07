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

function parseMeta(metaStr) {
  if (!metaStr) return null;
  try { return JSON.parse(metaStr); } catch { return null; }
}

// kb_system_log has no dedicated error-code column (see system-log.js) — group by
// kind + message prefix so repeated identical failures collapse into one row with
// an occurrence count, exactly like the spec's "Occurrences Count" column.
// Surfaces the REAL underlying detail (meta.body — the actual PostgREST/provider
// error text) instead of just the summary message, so "PATCH ai_articles failed
// (HTTP 400)" is actually diagnosable instead of a dead end.
function groupSystemLogErrors(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.kind}:${(r.message || '').slice(0, 80)}`;
    const meta = parseMeta(r.meta);
    if (!groups.has(key)) {
      groups.set(key, {
        name: r.message || r.kind, module: r.kind, category: 'System Log',
        severity: r.level, rootCause: r.message,
        detail: meta?.body || meta?.error || null,
        lastOccurrence: r.created_at, occurrences: 0, status: 'open',
      });
    }
    const g = groups.get(key);
    g.occurrences++;
    if (new Date(r.created_at) > new Date(g.lastOccurrence)) { g.lastOccurrence = r.created_at; if (meta?.body || meta?.error) g.detail = meta.body || meta.error; }
  }
  return [...groups.values()];
}

// Only kinds a real existing admin action can plausibly fix automatically —
// never claim auto-repair is available when nothing in this codebase does it.
const AUTO_REPAIRABLE_KINDS = new Set(['graph-sync', 'chunking', 'embedding']);

export async function buildErrorCenter(env) {
  const logRows = await getSystemLog(env, { limit: 300 }).catch(() => []);

  // HEALTH-PROBE ENTRIES — these represent a point-in-time API check, re-run
  // every time health-live executes; the NEXT check always supersedes the
  // previous one. Only the LATEST entry per service is meaningful "current
  // status" — showing every historical failure here would mean an already-
  // fixed provider (e.g. a corrected deprecated-model config) keeps showing as
  // broken forever, which is exactly the stale-error bug found via live testing.
  const healthProbeRows = logRows.filter(r => r.kind === 'health-probe');
  const latestByService = new Map();
  for (const r of healthProbeRows) {
    const service = r.message?.split(':')[0]?.trim() || 'unknown';
    const existing = latestByService.get(service);
    if (!existing || new Date(r.created_at) > new Date(existing.created_at)) latestByService.set(service, r);
  }
  const currentProbeErrors = [...latestByService.values()]
    .filter(r => r.level === 'error')
    .map(r => {
      const meta = parseMeta(r.meta);
      return {
        name: r.message, module: 'health-probe', category: 'API Status', severity: 'error',
        rootCause: r.message, detail: meta?.body || meta?.error || null,
        lastOccurrence: r.created_at, occurrences: 1, status: 'open — current, as of last health check',
        autoRepair: null, manualFix: 'Open Website Health Center for the recommended fix, or click Refresh to re-check after fixing the underlying cause.',
      };
    });

  // Everything else in kb_system_log (graph-sync/chunking/embedding/article-
  // ingestion/article-store/publish-write) is a real application-level failure
  // occurrence, not a superseding point-in-time check — kept as history, grouped.
  const nonProbeErrors = logRows.filter(r => r.kind !== 'health-probe' && r.level === 'error');
  const logErrors = groupSystemLogErrors(nonProbeErrors).map(e => ({
    ...e,
    autoRepair: AUTO_REPAIRABLE_KINDS.has(e.module) ? { action: 'sync-edges', label: 'Sync graph edges' } : null,
    manualFix: AUTO_REPAIRABLE_KINDS.has(e.module) ? null : `Check ${e.module} — real error detail above (from kb_system_log.meta).`,
  }));

  const articles = await listArticles(env, { status: 'all', limit: 200 }).catch(() => []);
  const articleById = new Map(articles.map(a => [a.id, a]));
  // A 'publish-write' log entry names the specific article that failed — if that
  // SAME article's current last_verification.ok is now true, a later publish
  // attempt succeeded and this historical failure is resolved; drop it instead
  // of showing a permanently-stuck error for something that's since been fixed.
  const relevantLogErrors = logErrors.filter(e => {
    if (e.module !== 'publish-write') return true;
    const meta = parseMeta(nonProbeErrors.find(r => r.message === e.rootCause)?.meta);
    const articleId = meta?.articleId;
    const current = articleId ? articleById.get(articleId) : null;
    return !(current && current.last_verification && current.last_verification.ok === true);
  });

  const failedArticles = articles
    .filter(a => a.last_verification && a.last_verification.ok === false)
    .map(a => ({
      name: `Publish pipeline failed: ${a.title}`, module: 'publishing', category: 'Publishing Pipeline',
      severity: 'error',
      rootCause: !a.last_verification.knowledgeGraph?.conceptPublished
        ? 'Knowledge graph write did not complete on the last publish attempt.'
        : 'SEO/canonical/sitemap fields were incomplete on the last publish attempt.',
      detail: null,
      lastOccurrence: a.updated_at, occurrences: 1,
      status: a.is_active ? 'open — live but drifted from graph' : 'open — draft, never published',
      articleId: a.id,
      autoRepair: { action: 'repair-article', label: 'Improve & Republish' },
      manualFix: null,
    }));

  const errors = [...failedArticles, ...currentProbeErrors, ...relevantLogErrors]
    .sort((a, b) => new Date(b.lastOccurrence || 0) - new Date(a.lastOccurrence || 0));

  return {
    errors,
    totals: {
      total: errors.length,
      critical: errors.filter(e => e.severity === 'error').length,
      warnings: logRows.filter(r => r.level === 'warn' && r.kind !== 'health-probe').length,
    },
    note: 'Aggregates kb_system_log (real failure trail — health-probe entries show only the LATEST check per service, so a fixed provider clears automatically), ai_articles rows whose last publish attempt failed (clears automatically once a later publish succeeds), and live API probe failures. No error is invented.',
  };
}
