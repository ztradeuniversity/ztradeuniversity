// admin/kb-admin.js — client for /api/ai-kb-admin (button-driven operator console).
// Auth is handled entirely by admin-auth-client.js's AdminGate: the KB Admin
// password is entered once at the gate, which exchanges it for a signed
// session token. Every request here sends that token as
// `Authorization: Bearer <token>` — no key is ever typed into this page.
window.KBAdmin = (function () {
  'use strict';
  const ENDPOINT = '/api/ai-kb-admin';
  const $ = (id) => document.getElementById(id);
  const out = $('out');
  let TOKEN = null;

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
  function authHeaders(extra) {
    return Object.assign({ Authorization: 'Bearer ' + TOKEN }, extra || {});
  }
  function setBusy(b) {
    document.querySelectorAll('button[data-act]').forEach((el) => { el.disabled = b; });
  }
  function updateBadges(j) {
    if (j && typeof j.conceptCount === 'number') $('count').textContent = j.conceptCount;
    if (j && typeof j.graphEnabled === 'boolean') $('graphflag').textContent = j.graphEnabled ? 'enabled' : 'disabled';
  }
  function sessionExpired() {
    render('🔒 Session expired or rejected (403) — please reload and log in again.', 'err');
    try { sessionStorage.removeItem('ztu_admin_sess::kb'); } catch (_) {}
  }

  // populate-anchors is chunked server-side (subrequest cap) → loop nextOffset.
  // A single batch returning 5xx does NOT abort — we log the error and advance the
  // offset so subsequent batches still run. 403 (auth failure) is the only hard stop.
  async function runPopulate() {
    const RETRY_MAX = 2, CONCURRENCY = 5, CKPT = 'ztu_populate_ckpt';
    const all = [], batchErrs = [];
    let authored = 0, published = 0, skipped = 0, processed = 0, total = 0, batchErrors = 0, aborted = false;
    let done = new Set();
    try { const raw = sessionStorage.getItem(CKPT); if (raw) done = new Set(JSON.parse(raw)); } catch (_) {}

    async function callOffset(offset) {
      for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
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

    render('… populating anchors (parallel ×' + CONCURRENCY + ') …');
    const first = await callOffset(0);
    if (first.fatal403) { sessionExpired(); return; }
    total = (first.ok && first.body && first.body.total) || 0;
    absorb(first);

    const queue = [];
    for (let o = 1; o < total; o++) if (!done.has(o)) queue.push(o);
    let qi = 0;
    async function worker() {
      while (qi < queue.length && !aborted) {
        const r = await callOffset(queue[qi++]);
        if (r.fatal403) { aborted = true; return; }
        absorb(r);
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, queue.length)) }, worker));
    if (aborted) { sessionExpired(); return; }
    try { if (done.size >= total) sessionStorage.removeItem(CKPT); } catch (_) {}
    const failures = all.filter(r =>
      r.error ||
      (r.authored && String(r.authored).startsWith('FAILED')) ||
      r.published === false
    );
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
    refreshStatus();
  }

  // sync-edges is chunked client-side too (see runPopulate's header comment for why).
  async function runSyncEdges() {
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
            method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
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
        if (done.has(offset)) continue;
        const r = await callOffset(offset);
        if (r.fatal403) { aborted = true; return; }
        if (r.ok) {
          if ((r.body.nodes || 0) === 0) { ended = true; break; }
          nodes += r.body.nodes || 0; edges += r.body.edges || 0; skipped += r.body.skipped || 0;
          done.add(offset); persist();
          render('… edges: ' + nodes + ' node(s), +' + edges + ' new, ' + skipped + ' unchanged …');
        } else { batchErrs.push(r.httpError ? { offset: r.offset, httpStatus: r.httpError } : { offset: r.offset, error: r.netError || 'err' }); batchErrors++; done.add(offset); }
      }
    }

    render('… syncing edges (parallel ×' + CONCURRENCY + ', incremental) …');
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (aborted) { sessionExpired(); return; }
    try { sessionStorage.removeItem(CKPT); } catch (_) {}
    render(
      (batchErrors ? '⚠️' : '✅') + ' sync-edges done — nodes=' + nodes + ', new edges=' + edges + ', unchanged=' + skipped +
      (batchErrors ? '\n❌ ' + batchErrors + ' batch error(s):\n' + batchErrs.map(e => JSON.stringify(e)).join('\n') : ''),
      batchErrors ? 'err' : 'ok'
    );
    refreshStatus();
  }

  async function run(action) {
    const meta = META[action];
    if (meta.write && !window.confirm(meta.warn)) return;

    if (action === 'populate-anchors') { setBusy(true); try { await runPopulate(); } finally { setBusy(false); } return; }
    if (action === 'sync-edges')       { setBusy(true); try { await runSyncEdges(); } finally { setBusy(false); } return; }

    setBusy(true);
    render('… running ' + action + ' …');
    try {
      const url = meta.method === 'GET' ? ENDPOINT + '?action=' + encodeURIComponent(action) : ENDPOINT;
      const init = { method: meta.method, headers: authHeaders({ 'Content-Type': 'application/json' }) };
      if (meta.method === 'POST') init.body = JSON.stringify({ action });
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({ error: 'non-JSON response', status: res.status }));

      if (res.status === 403) { sessionExpired(); return; }
      if (!res.ok) { render('❌ HTTP ' + res.status + '\n' + JSON.stringify(body, null, 2), 'err'); return; }

      let head = '✅ ' + action + ' OK';
      if (action === 'status')           head = '✅ status — concept_count=' + body.conceptCount + ', graph=' + (body.graphEnabled ? 'enabled' : 'disabled') + ', ready=' + body.ready;
      if (action === 'migrate-seed')     head = '✅ migrate-seed — migrated=' + (body.migrate && body.migrate.migrated) + ', parity=' + (body.parity && body.parity.parity);
      if (action === 'validate-anchors') head = '✅ validate-anchors — valid=' + body.valid + '/' + body.total + ', invalid=' + body.invalid;
      if (action === 'populate-anchors') head = '✅ populate-anchors — authored=' + body.authored + ', published=' + body.published + '/' + body.total;
      render(head + '\n\n' + JSON.stringify(body, null, 2), 'ok');

      updateBadges(body);
      if (meta.write) refreshStatus();
    } catch (e) {
      render('❌ Request failed: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    try {
      const res = await fetch(ENDPOINT + '?action=status', { headers: authHeaders() });
      if (res.ok) updateBadges(await res.json());
    } catch (_) { /* badge stays as-is */ }
  }

  function boot(token) {
    TOKEN = token;
    document.querySelectorAll('button[data-act]').forEach((el) => {
      el.addEventListener('click', () => run(el.getAttribute('data-act')));
    });
    refreshStatus();
  }

  return { boot };
})();
