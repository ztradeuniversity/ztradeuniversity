// admin/kb-admin.js — client for /api/ai-kb-admin (button-driven operator console).
// No secrets here: the key is typed at runtime and sent only as the x-admin-key
// header to the same-origin admin API, which enforces it server-side.

(function () {
  'use strict';
  const ENDPOINT = '/api/ai-kb-admin';
  const SS_KEY = 'ztu_kb_admin_key';
  const $ = (id) => document.getElementById(id);
  const out = $('out');
  // True only after the server has confirmed the currently-typed key (a non-403
  // response). Gates writes to the SHARED sessionStorage slot (see BUG FIX below).
  let keyConfirmedValid = false;

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
    // OPTIMIZED — bounded PARALLEL pool over distinct offsets. Each request stays
    // limit:1 (~20 subrequests, under Cloudflare's per-invocation cap); distinct
    // offsets touch distinct concepts, so concurrency is safe (no duplicate nodes/
    // edges — upsert by id). Server-side delta-skip returns "skipped" for unchanged
    // concepts (near-instant). Resume via a sessionStorage checkpoint; per-offset
    // retry preserved. Idempotent throughout.
    const RETRY_MAX = 2, CONCURRENCY = 5, CKPT = 'ztu_populate_ckpt';
    const all = [], batchErrs = [];
    let authored = 0, published = 0, skipped = 0, processed = 0, total = 0, batchErrors = 0, aborted = false;
    let done = new Set();
    try { const raw = sessionStorage.getItem(CKPT); if (raw) done = new Set(JSON.parse(raw)); } catch (_) {}

    async function callOffset(offset) {
      for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST', headers: { 'x-admin-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'populate-anchors', offset, limit: 1 }),
          });
          if (res.status === 403) return { offset, fatal403: true };
          const body = await res.json().catch(() => ({}));
          if (!res.ok) { if (attempt < RETRY_MAX) continue; return { offset, httpError: res.status, body }; }
          return { offset, ok: true, body };
        } catch (e) { if (attempt < RETRY_MAX) continue; return { offset, netError: String((e && e.message) || e) }; }
      }
    }
    const persist = () => { try { sessionStorage.setItem(CKPT, JSON.stringify([...done])); } catch (_) {} };
    const absorb = (r) => {
      if (r.ok) {
        authored += r.body.authored || 0; published += r.body.published || 0; skipped += r.body.skipped || 0;
        all.push(...(r.body.results || [])); done.add(r.offset);
      } else if (r.httpError) { batchErrs.push({ offset: r.offset, httpStatus: r.httpError, error: JSON.stringify(r.body).slice(0, 300) }); batchErrors++; }
      else if (r.netError) { batchErrs.push({ offset: r.offset, error: 'fetch-error: ' + r.netError }); batchErrors++; }
      processed++; persist();
      render('… ' + processed + '/' + (total || '?') + ' processed (published ' + published + ', skipped ' + skipped + ') …');
    };

    // Probe offset 0 to learn total, then process the rest in parallel.
    render('… populating anchors (parallel ×' + CONCURRENCY + ') …');
    const first = await callOffset(0);
    if (first.fatal403) {
      render('🔒 Rejected (403): wrong or missing AI_ADMIN_KEY.', 'err');
      try { if (sessionStorage.getItem(SS_KEY) === key) sessionStorage.removeItem(SS_KEY); } catch (_) {}
      return;
    }
    keyConfirmedValid = true;
    total = (first.ok && first.body && first.body.total) || 0;
    absorb(first);

    const queue = [];
    for (let o = 1; o < total; o++) if (!done.has(o)) queue.push(o);   // skip already-done → resume
    let qi = 0;
    async function worker() {
      while (qi < queue.length && !aborted) {
        const r = await callOffset(queue[qi++]);
        if (r.fatal403) { aborted = true; return; }
        absorb(r);
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, queue.length)) }, worker));
    if (aborted) {
      render('🔒 Rejected (403) mid-run — key cleared.', 'err');
      try { if (sessionStorage.getItem(SS_KEY) === key) sessionStorage.removeItem(SS_KEY); } catch (_) {}
      return;
    }
    try { if (done.size >= total) sessionStorage.removeItem(CKPT); } catch (_) {}
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
    // limit:1 — ONE node per invocation. The heaviest concepts (gold-buy-sell ~13
    // edges) cluster together in id order; processing several at once overran the
    // worker and the request hung (~offset #30). One node = ≤~15 subrequests, ~3s,
    // never hangs. A client-side abort timeout retries any stuck invocation instead
    // of blocking the loop forever (the page fetch has no timeout of its own).
    // OPTIMIZED — bounded PARALLEL pool (concurrency 4). Server syncEdges is now
    // INCREMENTAL (skips unchanged nodes → 0 writes; inserts only missing, deletes only
    // removed), so most invocations are a single read. Distinct offsets = distinct nodes
    // (edges keyed by src) → safe concurrency, no duplicate edges. 25s abort + retry per
    // request preserved. Checkpoint resume in sessionStorage. limit:1 keeps subrequests low.
    const RETRY_MAX = 2, CONCURRENCY = 4, CKPT = 'ztu_syncedges_ckpt';
    const batchErrs = [];
    let nodes = 0, edges = 0, skipped = 0, batchErrors = 0, next = 0, ended = false, aborted = false;
    let done = new Set();
    try { const raw = sessionStorage.getItem(CKPT); if (raw) done = new Set(JSON.parse(raw)); } catch (_) {}

    async function callOffset(offset) {
      for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
        const ctl = new AbortController();
        const tmo = setTimeout(() => ctl.abort(), 25000);
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST', headers: { 'x-admin-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync-edges', limit: 1, offset }), signal: ctl.signal,
          });
          if (res.status === 403) return { offset, fatal403: true };
          const body = await res.json().catch(() => ({}));
          if (!res.ok) { if (attempt < RETRY_MAX) continue; return { offset, httpError: res.status, body }; }
          return { offset, ok: true, body };
        } catch (e) { if (attempt < RETRY_MAX) continue; return { offset, netError: String((e && e.message) || e) }; }
        finally { clearTimeout(tmo); }
      }
    }
    const persist = () => { try { sessionStorage.setItem(CKPT, JSON.stringify([...done])); } catch (_) {} };

    async function worker() {
      while (!ended && !aborted) {
        const offset = next++;
        if (done.has(offset)) continue;                              // resume: skip completed
        const r = await callOffset(offset);
        if (r.fatal403) { aborted = true; return; }
        if (r.ok) {
          if ((r.body.nodes || 0) === 0) { ended = true; break; }    // past the last node
          keyConfirmedValid = true;
          nodes += r.body.nodes || 0; edges += r.body.edges || 0; skipped += r.body.skipped || 0;
          done.add(offset); persist();
          render('… edges: ' + nodes + ' node(s), +' + edges + ' new, ' + skipped + ' unchanged …');
        } else { batchErrs.push(r.httpError ? { offset: r.offset, httpStatus: r.httpError } : { offset: r.offset, error: r.netError || 'err' }); batchErrors++; done.add(offset); }
      }
    }

    render('… syncing edges (parallel ×' + CONCURRENCY + ', incremental) …');
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (aborted) {
      render('🔒 Rejected (403): wrong or missing AI_ADMIN_KEY.', 'err');
      try { if (sessionStorage.getItem(SS_KEY) === key) sessionStorage.removeItem(SS_KEY); } catch (_) {}
      return;
    }
    try { sessionStorage.removeItem(CKPT); } catch (_) {}
    render(
      (batchErrors ? '⚠️' : '✅') + ' sync-edges done — nodes=' + nodes + ', new edges=' + edges + ', unchanged=' + skipped +
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

    if (action === 'populate-anchors') {
      setBusy(true); try { await runPopulate(key); } finally { setBusy(false); }
      if (keyConfirmedValid && $('remember').checked) { try { sessionStorage.setItem(SS_KEY, key); } catch (_) {} }
      return;
    }
    if (action === 'sync-edges') {
      setBusy(true); try { await runSyncEdges(key); } finally { setBusy(false); }
      if (keyConfirmedValid && $('remember').checked) { try { sessionStorage.setItem(SS_KEY, key); } catch (_) {} }
      return;
    }

    setBusy(true);
    render('… running ' + action + ' …');
    try {
      const url = meta.method === 'GET' ? ENDPOINT + '?action=' + encodeURIComponent(action) : ENDPOINT;
      const init = { method: meta.method, headers: { 'x-admin-key': key, 'Content-Type': 'application/json' } };
      if (meta.method === 'POST') init.body = JSON.stringify({ action });
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({ error: 'non-JSON response', status: res.status }));

      // BUG FIX: this key is also written into the SHARED sessionStorage slot
      // ('ztu_kb_admin_key', read by admin/ai-feedback.html and admin/ai-articles.html
      // too) — but a previous version wrote it on every raw keystroke whenever
      // "remember" was checked, with NO server validation. An incomplete or wrong
      // key typed here silently poisoned the shared slot, so the OTHER admin pages
      // then auto-failed with "Invalid admin key" using a key that was never right.
      // Fix: only ever persist a key to the shared slot once the SERVER has
      // confirmed it (a non-403 response, right here); clear it on a confirmed 403.
      if (res.status === 403) {
        render('🔒 Rejected (403): wrong or missing AI_ADMIN_KEY.', 'err');
        try { if (sessionStorage.getItem(SS_KEY) === key) sessionStorage.removeItem(SS_KEY); } catch (_) {}
        return;
      }
      if (!res.ok) { render('❌ HTTP ' + res.status + '\n' + JSON.stringify(body, null, 2), 'err'); return; }

      keyConfirmedValid = true;
      if ($('remember').checked) { try { sessionStorage.setItem(SS_KEY, key); } catch (_) {} }

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
  // BUG FIX: "remember" + every keystroke used to write the RAW, unvalidated key
  // straight into the SHARED sessionStorage slot ('ztu_kb_admin_key' — also read
  // by admin/ai-feedback.html and admin/ai-articles.html). A wrong or half-typed
  // key here silently poisoned the shared slot, so the OTHER admin pages then
  // auto-failed with "Invalid admin key" using a key that was never actually
  // correct. Fix: only persist once the server has confirmed THIS key (run() sets
  // keyConfirmedValid = true on a non-403 response) — never on a raw keystroke.
  $('remember').addEventListener('change', (e) => {
    if (e.target.checked && keyConfirmedValid) { try { sessionStorage.setItem(SS_KEY, $('key').value.trim()); } catch (_) {} }
    else if (!e.target.checked) { try { sessionStorage.removeItem(SS_KEY); } catch (_) {} }
  });
  $('key').addEventListener('input', () => { keyConfirmedValid = false; });   // any edit invalidates the prior confirmation
  // Prefill from this tab's session (if previously remembered)
  try {
    const saved = sessionStorage.getItem(SS_KEY);
    if (saved) { $('key').value = saved; $('remember').checked = true; }
  } catch (_) {}
})();
