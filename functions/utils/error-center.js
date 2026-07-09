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

// Interprets the ACTUAL captured error text (e.detail — the real PostgREST/
// provider response) into specific guidance, instead of a static "check the
// module" line that never changes regardless of what really went wrong.
function manualFixFor(module, detail) {
  if (AUTO_REPAIRABLE_KINDS.has(module)) return null;
  if (detail) {
    const col = /Could not find the '([^']+)' column of '([^']+)'/i.exec(detail);
    if (col) return `Verified root cause: Supabase's schema (or PostgREST's schema cache) is missing column "${col[1]}" on table "${col[2]}". Run the pending migration for this column, then run NOTIFY pgrst, 'reload schema'; in the Supabase SQL Editor.`;
    const rel = /relation "([^"]+)" does not exist/i.exec(detail);
    if (rel) return `Verified root cause: table "${rel[1]}" does not exist yet in Supabase. Create it via the required migration, then retry.`;
    return `Verified root cause (actual error from the last occurrence): ${detail}`;
  }
  return `${module} failed — no captured error detail for this occurrence (check kb_system_log directly).`;
}

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
    manualFix: manualFixFor(e.module, e.detail),
  }));

  const articles = await listArticles(env, { status: 'all', limit: 200 }).catch(() => []);
  const articleById = new Map(articles.map(a => [a.id, a]));
  // BUGFIX (found via live testing — a fixed migration still showed the old
  // "PATCH ai_articles failed" error hours later): 'publish-write' already had
  // a resolution check, but generic 'article-store' write failures (logged by
  // article-store.js's sb() on ANY create/update/PATCH rejection — e.g. the
  // exact "Could not find the 'last_verification' column" error) had none at
  // all, so they showed forever once logged, even after the underlying cause
  // was fixed. Resolution signal: article-store.js only sets `updated_at` on a
  // row that ACTUALLY wrote successfully (a failed write never reaches that
  // code) — so if ANY article has a real updated_at newer than this error's
  // last occurrence, the write path has since succeeded and this is stale.
  const newestArticleWrite = articles.reduce((max, a) => {
    const t = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  const relevantLogErrors = logErrors.filter(e => {
    if (e.module === 'publish-write') {
      const meta = parseMeta(nonProbeErrors.find(r => r.message === e.rootCause)?.meta);
      const articleId = meta?.articleId;
      const current = articleId ? articleById.get(articleId) : null;
      return !(current && current.last_verification && current.last_verification.ok === true);
    }
    if (e.module === 'article-store') {
      return !(newestArticleWrite > new Date(e.lastOccurrence).getTime());
    }
    return true;
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
