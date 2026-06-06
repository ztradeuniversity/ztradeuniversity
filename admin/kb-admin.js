// admin/kb-admin.js — client for /api/ai-kb-admin (button-driven operator console).
// No secrets here: the key is typed at runtime and sent only as the x-admin-key
// header to the same-origin admin API, which enforces it server-side.

(function () {
  'use strict';
  const ENDPOINT = '/api/ai-kb-admin';
  const SS_KEY = 'ztu_kb_admin_key';
  const $ = (id) => document.getElementById(id);
  const out = $('out');

  // GET actions read; the rest are POST. Writes require a confirm.
  const META = {
    'status':           { method: 'GET',  write: false },
    'validate-anchors': { method: 'GET',  write: false },
    'migrate-seed':     { method: 'POST', write: true,  warn: 'Run MIGRATE-SEED? This writes the 3 base seed concepts.' },
    'populate-anchors': { method: 'POST', write: true,  warn: 'Run POPULATE-ANCHORS? This authors + publishes all 20 anchor concepts.' },
    'sync-edges':       { method: 'POST', write: true,  warn: 'Run SYNC-EDGES? Rebuilds concept→concept edges for every published node (run after Populate Anchors).' },
  };

  function render(text, cls) {
    out.textContent = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
    out.className = cls || '';
  }
  function getKey() {
    const k = ($('key').value || '').trim();
    if (!k) { render('⚠️ Enter your AI_ADMIN_KEY first.', 'err'); return null; }
    return k;
  }
  function setBusy(b) {
    document.querySelectorAll('button[data-act]').forEach((el) => { el.disabled = b; });
  }
  function updateBadges(j) {
    if (j && typeof j.conceptCount === 'number') $('count').textContent = j.conceptCount;
    if (j && typeof j.graphEnabled === 'boolean') $('graphflag').textContent = j.graphEnabled ? 'enabled' : 'disabled';
  }

  // populate-anchors is chunked server-side (subrequest cap) → loop nextOffset.
  // A single batch returning 5xx does NOT abort — we log the error and advance the
  // offset so subsequent batches still run. 403 (auth failure) is the only hard stop.
  async function runPopulate(key) {
    let offset = 0, authored = 0, published = 0, total = 0, batchErrors = 0;
    const all = [], batchErrs = [];
    // Per-offset retry: a transient non-200 on a single concept's chunk must NOT
    // permanently skip that concept (root cause of one missing anchor). Retry the
    // SAME offset up to RETRY_MAX times before giving up and advancing. Idempotent
    // (upsert by id), so a re-touch never duplicates or corrupts.
    const RETRY_MAX = 2;
    let lastOffset = -1, attempt = 0;
    for (let guard = 0; guard < 300; guard++) {
      if (offset !== lastOffset) { lastOffset = offset; attempt = 0; }
      render('… populating anchors (from #' + offset + ')' + (attempt ? ' retry ' + attempt : '') + ' …');
      let res, body;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST', headers: { 'x-admin-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'populate-anchors', offset }),
        });
        body = await res.json().catch(() => ({}));
      } catch (fetchErr) {
        // Network error — retry the SAME offset; only advance after RETRY_MAX tries.
        if (++attempt <= RETRY_MAX) { continue; }
        batchErrs.push({ offset, error: 'fetch-error: ' + (fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr)) });
        batchErrors++;
        offset += 1;
        if (offset >= (total || 9999)) break;
        continue;
      }
      if (res.status === 403) { render('🔒 Rejected (403): wrong or missing AI_ADMIN_KEY.', 'err'); return; }
      if (!res.ok) {
        // Server error on this chunk — retry the SAME offset; only advance (skip) after RETRY_MAX.
        if (++attempt <= RETRY_MAX) { continue; }
        batchErrs.push({ offset, httpStatus: res.status, error: JSON.stringify(body).slice(0, 300) });
        batchErrors++;
        offset += 1;
        if (offset >= (total || 9999)) break;
        continue;
      }
      total = body.total; authored += body.authored || 0; published += body.published || 0;
      all.push(...(body.results || []));
      render('… ' + Math.min(offset + (body.processed || 0), total) + '/' + total + ' processed (published so far: ' + published + ') …');
      if (body.nextOffset == null) break;
      offset = body.nextOffset;
    }
    // Collect per-concept failures: unhandled errors, author failures, and publish failures.
    const failures = all.filter(r =>
      r.error ||
      (r.authored && String(r.authored).startsWith('FAILED')) ||
      r.published === false
    );
    // Build human-readable failure detail lines.
    const failLines = failures.map(r => {
      const parts = ['id=' + r.id];
      if (r.error)        parts.push('throw: ' + r.error);
      if (r.authored && String(r.authored).startsWith('FAILED')) parts.push('author: ' + r.authored + (r.authorErrors ? ' ' + JSON.stringify(r.authorErrors) : ''));
      if (r.published === false) parts.push('publish-stage=' + (r.publishStage || '?') + ' error=' + (r.publishError || '?'));
      return parts.join(' | ');
    });
    const anyFailed = failures.length > 0 || batchErrors > 0;
    render(
      (anyFailed ? '⚠️' : '✅') + ' populate-anchors done — authored=' + authored +
      ', published=' + published + '/' + total +
      (batchErrors   ? '\n❌ ' + batchErrors + ' batch HTTP error(s):\n' + batchErrs.map(e => JSON.stringify(e)).join('\n') : '') +
      (failures.length ? '\n⚠️ ' + failures.length + ' concept failure(s):\n' + failLines.join('\n') : '') +
      '\n\n' + JSON.stringify(all, null, 2),
      anyFailed ? 'err' : 'ok'
    );
    refreshStatus(key);
  }

  // sync-edges is chunked client-side too: each node emits ~9 Supabase subrequests
  // (1 delete + N edge inserts), so a single invocation over 100+ nodes would exceed
  // Cloudflare's per-invocation subrequest budget. We page with a small limit and let
  // the server advance via nextOffset. Idempotent (delete-by-src + re-insert per node).
  async function runSyncEdges(key) {
    const LIMIT = 3;                 // ≤3 nodes × ≤14 subrequests ≈ 43 per invocation (under free-plan 50 cap)
    let offset = 0, nodes = 0, edges = 0, batchErrors = 0;
    const batchErrs = [];
    let lastOffset = -1, attempt = 0;
    const RETRY_MAX = 2;
    for (let guard = 0; guard < 300; guard++) {
      if (offset !== lastOffset) { lastOffset = offset; attempt = 0; }
      render('… syncing edges (from #' + offset + ')' + (attempt ? ' retry ' + attempt : '') + ' …');
      let res, body;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST', headers: { 'x-admin-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync-edges', limit: LIMIT, offset }),
        });
        body = await res.json().catch(() => ({}));
      } catch (fetchErr) {
        if (++attempt <= RETRY_MAX) { continue; }
        batchErrs.push({ offset, error: 'fetch-error: ' + (fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr)) });
        batchErrors++; offset += LIMIT; continue;
      }
      if (res.status === 403) { render('🔒 Rejected (403): wrong or missing AI_ADMIN_KEY.', 'err'); return; }
      if (!res.ok) {
        if (++attempt <= RETRY_MAX) { continue; }
        batchErrs.push({ offset, httpStatus: res.status, error: JSON.stringify(body).slice(0, 300) });
        batchErrors++; offset += LIMIT; continue;
      }
      nodes += body.nodes || 0; edges += body.edges || 0;
      render('… edges synced for ' + nodes + ' node(s), ' + edges + ' edge(s) so far …');
      if (body.nextOffset == null) break;
      offset = body.nextOffset;
    }
    render(
      (batchErrors ? '⚠️' : '✅') + ' sync-edges done — nodes=' + nodes + ', edges=' + edges +
      (batchErrors ? '\n❌ ' + batchErrors + ' batch error(s):\n' + batchErrs.map(e => JSON.stringify(e)).join('\n') : ''),
      batchErrors ? 'err' : 'ok'
    );
    refreshStatus(key);
  }

  async function run(action) {
    const meta = META[action];
    const key = getKey();
    if (!key) return;
    if (meta.write && !window.confirm(meta.warn)) return;

    if (action === 'populate-anchors') { setBusy(true); try { await runPopulate(key); } finally { setBusy(false); } return; }
    if (action === 'sync-edges')       { setBusy(true); try { await runSyncEdges(key); } finally { setBusy(false); } return; }

    setBusy(true);
    render('… running ' + action + ' …');
    try {
      const url = meta.method === 'GET' ? ENDPOINT + '?action=' + encodeURIComponent(action) : ENDPOINT;
      const init = { method: meta.method, headers: { 'x-admin-key': key, 'Content-Type': 'application/json' } };
      if (meta.method === 'POST') init.body = JSON.stringify({ action });
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({ error: 'non-JSON response', status: res.status }));

      if (res.status === 403) { render('🔒 Rejected (403): wrong or missing AI_ADMIN_KEY.', 'err'); return; }
      if (!res.ok) { render('❌ HTTP ' + res.status + '\n' + JSON.stringify(body, null, 2), 'err'); return; }

      // Friendly one-line summary + full payload.
      let head = '✅ ' + action + ' OK';
      if (action === 'status')           head = '✅ status — concept_count=' + body.conceptCount + ', graph=' + (body.graphEnabled ? 'enabled' : 'disabled') + ', ready=' + body.ready;
      if (action === 'migrate-seed')     head = '✅ migrate-seed — migrated=' + (body.migrate && body.migrate.migrated) + ', parity=' + (body.parity && body.parity.parity);
      if (action === 'validate-anchors') head = '✅ validate-anchors — valid=' + body.valid + '/' + body.total + ', invalid=' + body.invalid;
      if (action === 'populate-anchors') head = '✅ populate-anchors — authored=' + body.authored + ', published=' + body.published + '/' + body.total;
      render(head + '\n\n' + JSON.stringify(body, null, 2), 'ok');

      updateBadges(body);
      if (action === 'migrate-seed' && body.migrate && typeof body.migrate.migrated === 'number') { /* count refreshed by next status */ }
      // Auto-refresh the count badge after a write.
      if (meta.write) refreshStatus(key);
    } catch (e) {
      render('❌ Request failed: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus(key) {
    try {
      const res = await fetch(ENDPOINT + '?action=status', { headers: { 'x-admin-key': key } });
      if (res.ok) updateBadges(await res.json());
    } catch (_) { /* badge stays as-is */ }
  }

  // Wire up
  document.querySelectorAll('button[data-act]').forEach((el) => {
    el.addEventListener('click', () => run(el.getAttribute('data-act')));
  });
  $('show').addEventListener('change', (e) => { $('key').type = e.target.checked ? 'text' : 'password'; });
  $('remember').addEventListener('change', (e) => {
    if (e.target.checked) { try { sessionStorage.setItem(SS_KEY, $('key').value.trim()); } catch (_) {} }
    else { try { sessionStorage.removeItem(SS_KEY); } catch (_) {} }
  });
  $('key').addEventListener('input', () => {
    if ($('remember').checked) { try { sessionStorage.setItem(SS_KEY, $('key').value.trim()); } catch (_) {} }
  });
  // Prefill from this tab's session (if previously remembered)
  try {
    const saved = sessionStorage.getItem(SS_KEY);
    if (saved) { $('key').value = saved; $('remember').checked = true; }
  } catch (_) {}
})();
