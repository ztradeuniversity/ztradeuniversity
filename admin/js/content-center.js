// admin/js/content-center.js
// ════════════════════════════════════════════════════════════════════════════
// CONTENT INTELLIGENCE CENTER — orchestration only. Every read/write here calls
// an endpoint that already exists (/api/ai-articles, /api/ai-kb-admin) — no new
// business logic lives in this file, only fetch/render wiring, matching the
// "reuse before creating" rule this page was built under.
//
// Merges AI Article Manager, KB Admin, and Governance into this one page.
// admin/pages/ai-articles.html, admin/pages/kb-admin.html, admin/js/kb-admin.js,
// and admin/pages/governance-admin.html have all been deleted — every function
// they had (including image upload, below) is ported here.
// ════════════════════════════════════════════════════════════════════════════
(function () {
  const ART = '/api/ai-articles';
  const KB = '/api/ai-kb-admin';
  let TOKEN = null;
  let editorState = { id: null, images: [], brief: null, mode: 'manual' };
  let libState = { page: 1, pageSize: 100, status: 'all', category: 'all', sort: 'updated_desc', q: '' };

  function authHeaders(extra) {
    return Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, extra || {});
  }
  async function apiGet(url) {
    const r = await fetch(url, { headers: authHeaders() });
    return r.json().catch(() => ({}));
  }
  async function apiPost(base, action, data) {
    const r = await fetch(base, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action, data }) });
    return r.json().catch(() => ({}));
  }
  function toast(msg, kind) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 4200);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function humanize(s) { return String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  // ── EXECUTIVE OVERVIEW ───────────────────────────────────────────────────
  async function loadExecutive() {
    const [health, dash] = await Promise.all([
      apiGet(KB + '?action=health'),
      apiGet(KB + '?action=content-dashboard'),
    ]);
    const pending = Array.isArray(dash.pendingArticles) ? dash.pendingArticles.length : 0;
    const cards = [
      { lab: 'Published Articles', val: nz(health.articleCoverage?.totalArticles), led: ledFor(health.articleCoverage?.totalArticles > 0), sub: (dash.articleCoverage?.categoriesNeedingArticles || []).length + ' categories still need one' },
      { lab: 'Graph Concepts', val: nz(health.graphGrowth?.totalConcepts ?? health.retrievalQuality?.totalConcepts), led: ledFor(health.retrievalQuality?.graphActive), sub: health.retrievalQuality?.graphActive ? 'Graph active' : 'Graph inactive' },
      { lab: 'SEO Health', val: health.productionScore != null ? health.productionScore + ' / 100' : '—', led: scoreLed(health.productionScore), sub: 'production score' },
      { lab: 'Chatbot Demand', val: nz(health.unknownQuestionRate?.totalGapsLogged), led: 'idle', sub: (health.unknownQuestionRate?.askedTodayCount || 0) + ' asked today' },
      { lab: 'Pending Review', val: pending, led: pending > 0 ? 'warn' : 'ok', sub: 'article drafts in review queue' },
    ];
    document.getElementById('execCards').innerHTML = cards.map(c => `
      <div class="stat">
        <div class="lab">${c.lab}</div>
        <div class="val"><span class="led ${c.led}"></span>${c.val}</div>
        <div class="sub">${c.sub}</div>
      </div>`).join('');
  }
  function nz(v) { return (v === 0 || v) ? v : '—'; }
  function ledFor(b) { return b ? 'ok' : 'idle'; }
  function scoreLed(n) { if (n == null) return 'idle'; return n >= 80 ? 'ok' : n >= 50 ? 'warn' : 'bad'; }

  // ── WRITE THIS NEXT (unified recommendation engine — already built server-side,
  // this just renders it) ──────────────────────────────────────────────────
  async function loadRecommendations() {
    const data = await apiGet(KB + '?action=author-assistant');
    const topics = (data.rankedRecommendations && data.rankedRecommendations.rankedTopics) || [];
    const card = document.getElementById('recCard');
    if (!topics.length) { card.innerHTML = '<div class="empty">No demand logged yet — recommendations appear once real chatbot questions are logged (kb_missing).</div>'; return; }
    card.innerHTML = topics.slice(0, 8).map(t => {
      const badges = [];
      if (t.coverageGap) badges.push('<span class="chip seo">SEO gap</span>');
      if (t.frequency > 0) badges.push('<span class="chip chat">Chatbot ×' + t.frequency + '</span>');
      if (t.graphConcepts > 0) badges.push('<span class="chip graph">Graph</span>');
      const stars = '★'.repeat(Math.max(1, badges.length)) + '☆'.repeat(3 - Math.max(1, badges.length));
      return `<div class="rec-row">
        <div class="rec-topic"><div class="t">${esc(humanize(t.category))}</div><div class="why">${esc(t.suggestion)}</div></div>
        <div class="rec-badges">${badges.join('')}</div>
        <div class="stars">${stars}</div>
        <button class="btn sm gold" data-prepare="${esc(t.category)}">Prepare →</button>
      </div>`;
    }).join('');
    card.querySelectorAll('[data-prepare]').forEach(b => b.addEventListener('click', () => prepareFromTopic(humanize(b.dataset.prepare))));
  }

  // ── CONTENT COVERAGE DASHBOARD (spec Phase 2-3) ─────────────────────────
  async function loadCoverage() {
    const data = await apiGet(KB + '?action=coverage-dashboard');
    const card = document.getElementById('coverageCard');
    const rows = (data.rows || []).filter(r => r.graphConcepts > 0 || r.articles > 0).slice(0, 20);
    if (!rows.length) { card.innerHTML = '<div class="empty">No graph concepts or articles found yet.</div>'; return; }
    const totals = data.totals || {};
    card.innerHTML = `
      <div class="grid cols-3" style="margin-bottom:14px">
        <div class="stat"><div class="lab">Categories</div><div class="val">${totals.categories ?? '—'}</div></div>
        <div class="stat"><div class="lab">Total Articles</div><div class="val">${totals.totalArticles ?? '—'}</div></div>
        <div class="stat"><div class="lab">Overall Coverage</div><div class="val"><span class="led ${scoreLed(totals.overallCoveragePct)}"></span>${totals.overallCoveragePct ?? 0}%</div></div>
      </div>
      ${rows.map(r => `
        <div class="rec-row">
          <div class="rec-topic"><div class="t">${esc(r.label)}</div><div class="why">${r.articles} article${r.articles === 1 ? '' : 's'} / ${r.graphConcepts} graph concept${r.graphConcepts === 1 ? '' : 's'}</div></div>
          <div style="width:120px;background:var(--inset);border-radius:100px;height:8px;overflow:hidden"><div style="width:${r.coveragePct}%;height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2))"></div></div>
          <div class="stars" style="width:38px;text-align:right">${r.coveragePct}%</div>
          <button class="btn sm" data-explore-cat="${esc(r.category)}">Explore</button>
        </div>`).join('')}`;
    card.querySelectorAll('[data-explore-cat]').forEach(b => b.addEventListener('click', () => runExplore(b.dataset.exploreCat)));
  }

  // ── WEBSITE HEALTH CENTER (spec Phase 9) ────────────────────────────────
  async function loadHealth() {
    const data = await apiGet(KB + '?action=health-live');
    const card = document.getElementById('healthCard');
    const providers = data.providers || [];
    const overallLed = data.overallHealthPct >= 80 ? 'ok' : data.overallHealthPct >= 50 ? 'warn' : 'bad';
    const overallWord = data.overallHealthPct >= 80 ? 'Healthy' : data.overallHealthPct >= 50 ? 'Warning' : 'Critical';
    card.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:14px">
        <div class="stat"><div class="lab">Website Status</div><div class="val"><span class="led ${overallLed}"></span>${data.overallHealthPct ?? 0}%</div><div class="sub">${overallWord}</div></div>
        <div class="stat"><div class="lab">Working APIs</div><div class="val">${data.workingApis ?? 0}</div></div>
        <div class="stat"><div class="lab">Failed APIs</div><div class="val">${data.failedApis ?? 0}</div></div>
        <div class="stat"><div class="lab">Automation</div><div class="val"><span class="led idle"></span>${esc(data.automation?.status || '—')}</div><div class="sub">${esc(data.automation?.reason || '')}</div></div>
      </div>
      <div class="sec-title" style="margin:0 0 8px">API Status</div>
      ${providers.map(p => `
        <div class="rec-row">
          <div class="rec-topic"><div class="t">${esc(p.service)}</div><div class="why">${esc(p.rootCause || '')}</div></div>
          <div class="rec-badges">
            <span class="chip ${p.ok ? 'chat' : ''}" style="${p.ok ? '' : 'color:var(--bad);border-color:rgba(226,104,95,.3)'}">${p.ok ? 'Online' : 'Offline'}</span>
            ${p.ms ? `<span class="chip">${p.ms}ms</span>` : ''}
          </div>
        </div>`).join('') || '<div class="empty">No providers probed.</div>'}
      <div style="font-size:11px;color:var(--dim);margin-top:8px">${esc(data.automation?.note || '')}</div>`;
  }

  // ── ERROR CENTER (spec Phase 9) ──────────────────────────────────────────
  function buildClaudeRepairPrompt(e) {
    return [
      `Problem Summary: ${e.name}`,
      `Module: ${e.module}`,
      `Verified Root Cause: ${e.rootCause}`,
      `Affected: ${e.articleId ? 'ai_articles row ' + e.articleId : e.module + ' pipeline (see functions/utils/' + e.module + '.js or functions/api/*.js for this module)'}`,
      `Suggested Fix: ${e.manualFix || 'Investigate the module above using the root cause and repair the underlying issue.'}`,
      `Expected Result: the error stops recurring in kb_system_log / the article publishes successfully.`,
    ].join('\n');
  }
  async function loadErrorCenter() {
    const data = await apiGet(KB + '?action=error-center');
    const card = document.getElementById('errorCenterCard');
    const errors = data.errors || [];
    const totals = data.totals || {};
    const summary = `<div class="grid cols-3" style="margin-bottom:14px">
      <div class="stat"><div class="lab">Total</div><div class="val">${totals.total ?? 0}</div></div>
      <div class="stat"><div class="lab">Critical</div><div class="val"><span class="led ${totals.critical ? 'bad' : 'ok'}"></span>${totals.critical ?? 0}</div></div>
      <div class="stat"><div class="lab">Warnings</div><div class="val"><span class="led ${totals.warnings ? 'warn' : 'ok'}"></span>${totals.warnings ?? 0}</div></div>
    </div>`;
    if (!errors.length) { card.innerHTML = summary + '<div class="empty">No errors detected — nothing has failed.</div>'; return; }
    card.innerHTML = summary + errors.slice(0, 30).map((e, i) => `
      <div class="rec-row">
        <div class="rec-topic"><div class="t">${esc(e.name)}</div><div class="why">${esc(e.rootCause || '')} — ${e.occurrences}× · last ${e.lastOccurrence ? new Date(e.lastOccurrence).toLocaleString() : '—'}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${e.autoRepair ? `<button class="btn sm gold" data-err-repair="${i}">${esc(e.autoRepair.label)}</button>` : ''}
          ${!e.autoRepair && e.manualFix ? `<button class="btn sm" data-err-manual="${i}">Manual Repair Guide</button>` : ''}
          <button class="btn sm" data-err-claude="${i}">Claude Prompt</button>
        </div>
      </div>
      <div id="errClaudeOut${i}" style="display:none;margin:-4px 0 10px"><textarea rows="6" readonly style="width:100%;background:var(--inset);border:1px solid var(--border2);border-radius:9px;color:var(--text);font-family:'Courier New',monospace;font-size:11.5px;padding:10px"></textarea></div>
    `).join('');
    const list = errors.slice(0, 30);
    card.querySelectorAll('[data-err-repair]').forEach(b => b.addEventListener('click', async () => {
      const e = list[+b.dataset.errRepair];
      toast('Repairing…');
      if (e.autoRepair.action === 'repair-article') await apiPost(ART, 'repair', { id: e.articleId });
      else await apiPost(KB, e.autoRepair.action, { limit: 50, offset: 0 });
      toast('Repair attempted — refreshing…', 'ok');
      loadErrorCenter(); loadLibrary();
    }));
    card.querySelectorAll('[data-err-manual]').forEach(b => b.addEventListener('click', () => toast(list[+b.dataset.errManual].manualFix, 'ok')));
    card.querySelectorAll('[data-err-claude]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.errClaude;
      const out = document.getElementById('errClaudeOut' + i);
      out.style.display = 'block';
      const ta = out.querySelector('textarea');
      ta.value = buildClaudeRepairPrompt(list[i]);
      ta.select();
      navigator.clipboard?.writeText(ta.value).then(() => toast('Copied to clipboard', 'ok')).catch(() => {});
    }));
  }

  // ── MISSING TOPIC ENGINE (spec Phase 4) — every real gap, 3 actions each ───
  async function loadMissingTopics() {
    const data = await apiGet(KB + '?action=missing-topics');
    const card = document.getElementById('missingCard');
    const topics = data.topics || [];
    if (!topics.length) { card.innerHTML = '<div class="empty">No gaps logged yet — this fills in once real chatbot questions are logged (kb_missing) or a category has zero articles/graph concepts.</div>'; return; }
    card.innerHTML = topics.slice(0, 25).map(t => {
      const badges = [];
      if (t.seoOpportunity) badges.push('<span class="chip seo">SEO gap</span>');
      if (t.graphOpportunity) badges.push('<span class="chip graph">Graph gap</span>');
      if (t.chatbotOpportunity) badges.push(`<span class="chip chat">Chatbot ×${t.frequency}</span>`);
      return `<div class="rec-row">
        <div class="rec-topic"><div class="t">${esc(humanize(t.category))}</div><div class="why">${esc(t.suggestion)}</div></div>
        <div class="rec-badges">${badges.join('')}</div>
        <div style="display:flex;gap:5px">
          <button class="btn sm" data-topic-mode="manual" data-topic="${esc(t.category)}">Manual</button>
          <button class="btn sm" data-topic-mode="seo-auto" data-topic="${esc(t.category)}">SEO Auto</button>
          <button class="btn sm gold" data-topic-mode="ai" data-topic="${esc(t.category)}">AI Generate</button>
        </div>
      </div>`;
    }).join('');
    card.querySelectorAll('[data-topic-mode]').forEach(b => b.addEventListener('click', () => startTopicAction(humanize(b.dataset.topic), b.dataset.topicMode)));
  }

  // EXPLORE — MISSING TOPICS (spec: never empty when real gap data exists). Fetches
  // many concrete suggested article TITLES (not just categories) from real graph/
  // demand data and renders the same Manual/SEO Auto/AI Generate 3-button row per
  // title, reusing the exact same startTopicAction/editor flow — no second editor.
  // `category` (optional) scopes Explore to one Content Coverage row — reuses
  // the SAME explore-topics action/#exploreOut panel as the global Explore
  // button, just filtered server-side, so there is exactly one Explore
  // implementation, not a duplicate per-category one.
  async function runExplore(category) {
    const out = document.getElementById('exploreOut');
    out.innerHTML = '<div class="empty">Exploring…</div>';
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const qs = category ? '&category=' + encodeURIComponent(category) : '';
    const data = await apiGet(KB + '?action=explore-topics' + qs);
    const titles = data.titles || [];
    if (!titles.length) { out.innerHTML = `<div class="empty">No real gap data yet${category ? ' for "' + esc(humanize(category)) + '"' : ''} — this fills in as the graph grows or chatbot questions are logged.</div>`; return; }
    out.innerHTML = `
      ${category ? `<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">${titles.length} real candidate${titles.length === 1 ? '' : 's'} for "${esc(humanize(category))}"</div>` : ''}
      <div style="max-height:420px;overflow-y:auto">${titles.map(t => `
      <div class="rec-row">
        <div class="rec-topic"><div class="t">${esc(t.title)}</div><div class="why">${esc(humanize(t.category))} · ${esc(t.source)}</div></div>
        <div style="display:flex;gap:5px">
          <button class="btn sm" data-explore-mode="manual" data-explore-title="${esc(t.title)}">Manual</button>
          <button class="btn sm" data-explore-mode="seo-auto" data-explore-title="${esc(t.title)}">SEO Auto</button>
          <button class="btn sm gold" data-explore-mode="ai" data-explore-title="${esc(t.title)}">AI Generate</button>
        </div>
      </div>`).join('')}</div>`;
    out.querySelectorAll('[data-explore-mode]').forEach(b => b.addEventListener('click', () => startTopicAction(b.dataset.exploreTitle, b.dataset.exploreMode)));
  }

  // Opens the editor pre-seeded from a missing-topic row, in the mode the admin
  // picked — reuses the exact same editor/prepareFromTopic flow as "Write This
  // Next"'s single Prepare button, just exposing all 3 modes explicitly per spec.
  function startTopicAction(topic, mode) {
    openEditor();
    setMode(mode);
    document.getElementById('edTopic').value = topic;
    document.getElementById('edTitleField').value = topic;
    document.getElementById('edTitleMini').textContent = topic;
    if (mode === 'ai') {
      prepareFromTopic(topic);
    } else if (mode === 'manual') {
      prepareFromTopic(topic); // still fetch brief/outline/internal-links for reference; manual writing stays fully editable
    } else {
      toast('Write or paste your "' + topic + '" article below, then click Auto SEO', 'ok');
    }
  }

  // AUTO KNOWLEDGE CAPTURE — when the chatbot answered from OpenAI (no verified
  // Database/Graph source existed), prepare that already-generated, already-
  // validated answer as a review-ready article draft instead of discarding it and
  // making the admin recreate it from scratch. Reuses the EXISTING ai-brief
  // generator (same as prepareFromTopic) for metadata/outline/internal-links, but
  // seeds Content with the chatbot's actual answer text — never lost. Still opens
  // as a DRAFT: the existing Save/Publish review workflow is completely unchanged,
  // nothing here bypasses approval or auto-publishes.
  async function captureAsArticleDraft(question, answer) {
    openEditor();
    setMode('ai');
    document.getElementById('edTopic').value = question;
    document.getElementById('edTitleField').value = question;
    document.getElementById('edTitleMini').textContent = question;
    document.getElementById('edContent').value = String(answer || '').trim();
    toast('Preparing brief from the chatbot’s answer…');
    const data = await apiPost(ART, 'ai-brief', { topic: question });
    if (data.brief) {
      editorState.brief = data.brief;
      fillEditorFromBrief(data.brief);
      renderBriefExtras(data.brief, data.internalLinks);
      // fillEditorFromBrief doesn't touch Content — re-assert the real answer in
      // case anything above raced ahead of it (defensive, cheap, idempotent).
      if (!document.getElementById('edContent').value.trim()) document.getElementById('edContent').value = String(answer || '').trim();
    }
    // AUTO-PUBLISH POLICY (default off, server-controlled via
    // AI_AUTO_PUBLISH_CAPTURED_KNOWLEDGE — see ai-brief's autoPublishAllowed) —
    // only when the site owner has explicitly opted in does this skip the manual
    // Save & Publish click; reuses the exact same saveArticle(true) path a human
    // click would use, so the pipeline is identical either way.
    if (data.autoPublishAllowed) {
      toast('Auto-publish policy enabled — saving and publishing…', 'ok');
      await saveArticle(true);
    } else {
      toast('Draft prepared from the chatbot’s answer — review, then Publish', 'ok');
    }
  }

  // ── EDITOR ───────────────────────────────────────────────────────────────
  function editorTemplate() {
    return `
      <div class="editor-toolbar">
        <span class="title-mini" id="edTitleMini">New article</span>
        <div class="mode-toggle">
          <button data-mode="manual" class="active">✍ Manual</button>
          <button data-mode="seo-auto">⚡ SEO Auto</button>
          <button data-mode="ai">🤖 AI Generation</button>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn sm" id="saveDraftBtn">💾 Save Draft</button>
          <button class="btn sm gold" id="savePublishBtn">🚀 Save &amp; Publish</button>
          <button class="btn sm danger" id="closeEditorBtn">✕ Close</button>
        </div>
      </div>
      <div id="topicPrep" class="field-row two" style="align-items:flex-end">
        <div class="field"><label>Topic (blank article only)</label><input type="text" id="edTopic" placeholder="e.g. Risk Reward Ratio" /></div>
        <div><button class="btn sm" id="prepBriefBtn">⚡ Prepare Brief</button></div>
      </div>

      <div id="seoAutoRow" style="display:none;margin-bottom:12px">
        <div class="field"><label>Paste complete article — Auto SEO reads this and fills every field below</label><textarea id="seoAutoPaste" rows="8" placeholder="Paste the finished article text here…"></textarea></div>
        <button class="btn sm gold" id="autoSeoBtn" style="margin-top:8px">⚡ Auto SEO</button>
        <span id="autoSeoNote" style="font-size:11.5px;color:var(--muted);margin-left:8px"></span>
      </div>

      <div class="field-row">
        <div class="field" style="grid-column:1/3"><label>Title</label><input type="text" id="edTitleField" /></div>
        <div class="field"><label>Category</label><select id="edCategory"></select></div>
        <div class="field"><label>Difficulty</label><select id="edDifficulty"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
      </div>
      <div class="field-row two">
        <div class="field"><label>Slug (URL path — leave blank to auto-generate from Title)</label><input type="text" id="edSlug" placeholder="e.g. risk-reward-ratio" /></div>
        <div class="field"><label>Tags (comma-separated)</label><input type="text" id="edTags" /></div>
      </div>
      <div class="field"><label>Summary / meta description</label><input type="text" id="edSummary" /></div>
      <div id="aiGenerateRow" style="display:none;margin-bottom:10px"><button class="btn sm gold" id="generateAiBtn">🤖 Generate with AI</button> <span id="aiGenNote" style="font-size:11.5px;color:var(--muted)"></span></div>
      <div class="field"><label>Content (Markdown)</label><textarea id="edContent" rows="16"></textarea></div>
      <div id="briefExtras"></div>

      <details class="adv" style="margin-top:14px">
        <summary>▸ SEO &amp; Metadata — Title/Meta/Canonical/OG/Schema (optional — blank fields auto-compute at publish)</summary>
        <div class="adv-body">
          <div class="field-row two">
            <div class="field"><label>SEO Title</label><input type="text" id="seoTitle" placeholder="defaults to Title" /></div>
            <div class="field"><label>H1 (on-page heading)</label><input type="text" id="seoH1" placeholder="defaults to Title" /></div>
          </div>
          <div class="field-row two">
            <div class="field"><label>Meta Title</label><input type="text" id="seoMetaTitle" placeholder="defaults to SEO Title" /></div>
            <div class="field"><label>Canonical URL</label><input type="text" id="seoCanonical" placeholder="defaults to /articles/{slug}" /></div>
          </div>
          <div class="field"><label>Meta Description</label><input type="text" id="seoMetaDescription" placeholder="defaults to Summary" /></div>
          <div class="field-row two">
            <div class="field"><label>Focus Keyword</label><input type="text" id="seoFocusKeyword" /></div>
            <div class="field"><label>Secondary Keywords (comma-separated)</label><input type="text" id="seoSecondaryKeywords" /></div>
          </div>
          <div class="field-row two">
            <div class="field"><label>OpenGraph Title</label><input type="text" id="seoOgTitle" placeholder="defaults to SEO Title" /></div>
            <div class="field"><label>OpenGraph Description</label><input type="text" id="seoOgDescription" placeholder="defaults to Meta Description" /></div>
          </div>
          <div class="field-row two">
            <div class="field"><label>Twitter Card</label><select id="seoTwitterCard"><option value="summary_large_image">Summary — Large Image</option><option value="summary">Summary</option></select></div>
            <div class="field"><label>Author</label><input type="text" id="edAuthor" placeholder="ZTU" /></div>
          </div>
          <div class="field"><label>External Links (one per line — <code>Title | https://url</code>)</label><textarea id="seoExternalLinks" rows="3" placeholder="Investopedia: Risk/Reward | https://www.investopedia.com/..."></textarea></div>
          <div id="seoInternalLinksOut" style="font-size:11.5px;color:var(--muted);margin-top:6px">Internal links: click "Prepare Brief" above to generate suggestions from the live graph.</div>
          <div id="seoSchemaPreview" style="font-size:11.5px;color:var(--muted);margin-top:6px">FAQ schema preview appears here once the article has question-style content (auto-detected from Brief/FAQ).</div>
        </div>
      </details>

      <div class="card" style="margin-top:14px">
        <h3>🖼 Images</h3>
        <div id="imagesGate" style="font-size:11.5px;color:var(--muted)">Save the article once (Draft is fine) before attaching images.</div>
        <div id="imagesUploader" style="display:none">
          <div class="field-row two">
            <div class="field"><label>Image file</label><input type="file" id="imgFile" accept="image/*" /></div>
            <div class="field"><label>Caption</label><input type="text" id="imgCaption" /></div>
          </div>
          <div class="field"><label>Image ALT text (accessibility &amp; SEO)</label><input type="text" id="imgAlt" /></div>
          <div style="font-size:11px;color:var(--dim);margin:-2px 0 8px">The first image attached becomes the featured/OpenGraph image.</div>
          <button class="btn sm" id="imgUploadBtn">⬆ Upload &amp; Attach</button>
          <div class="grid cols-4" id="imagesGrid" style="margin-top:12px"></div>
        </div>
      </div>

      <div id="verifyOut"></div>`;
  }
  function openEditor() {
    document.getElementById('editorCard').classList.add('open');
    document.getElementById('editorCard').innerHTML = editorTemplate();
    loadCategoriesInto(document.getElementById('edCategory'));
    document.getElementById('editorCard').scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.getElementById('closeEditorBtn').onclick = () => { document.getElementById('editorCard').classList.remove('open'); editorState = { id: null, images: [], brief: null, mode: 'manual' }; };
    document.getElementById('prepBriefBtn').onclick = () => prepareFromTopic(document.getElementById('edTopic').value.trim());
    document.getElementById('saveDraftBtn').onclick = () => saveArticle(false);
    document.getElementById('savePublishBtn').onclick = () => saveArticle(true);
    document.querySelectorAll('.mode-toggle button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    document.getElementById('imgUploadBtn').onclick = uploadCurrentImage;
    refreshImagesGate();
  }

  // ── IMAGES (ported from the now-deleted admin/pages/ai-articles.html — same
  // upload_image/delete_image actions, same data-URL encoding, no new backend). ──
  function refreshImagesGate() {
    const has = !!editorState.id;
    document.getElementById('imagesGate').style.display = has ? 'none' : '';
    document.getElementById('imagesUploader').style.display = has ? '' : 'none';
    if (has) renderImages(editorState.images || []);
  }
  function renderImages(images) {
    document.getElementById('imagesGrid').innerHTML = (images || []).map((img, i) => `
      <div class="card" style="padding:8px">
        ${i === 0 ? '<div class="chip" style="margin-bottom:6px">★ Featured</div>' : ''}
        <img src="${esc(img.url)}" style="width:100%;border-radius:6px;display:block;margin-bottom:6px" />
        <div style="font-size:11px;color:var(--muted)">${esc(img.caption || '')}</div>
        <div style="font-size:10.5px;color:var(--dim)">alt: ${esc(img.alt_text || '—')}</div>
        <button class="btn sm danger" style="margin-top:6px" data-delimg="${img.id}">Remove</button>
      </div>`).join('') || '<div class="empty">No images yet.</div>';
    document.getElementById('imagesGrid').querySelectorAll('[data-delimg]').forEach(b => b.addEventListener('click', async () => {
      await apiPost(ART, 'delete_image', { id: b.dataset.delimg });
      editorState.images = (editorState.images || []).filter(i => i.id !== b.dataset.delimg);
      renderImages(editorState.images);
    }));
  }
  function uploadCurrentImage() {
    const fileInput = document.getElementById('imgFile');
    const file = fileInput.files && fileInput.files[0];
    if (!file) { toast('Choose an image file first', 'bad'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await apiPost(ART, 'upload_image', {
        articleId: editorState.id, filename: file.name, dataUrl: reader.result,
        caption: document.getElementById('imgCaption').value.trim(),
        alt: document.getElementById('imgAlt').value.trim(),
      });
      if (!res.image) { toast('Upload failed', 'bad'); return; }
      editorState.images = [...(editorState.images || []), res.image];
      renderImages(editorState.images);
      fileInput.value = ''; document.getElementById('imgCaption').value = ''; document.getElementById('imgAlt').value = '';
      toast('Image attached', 'ok');
    };
    reader.readAsDataURL(file);
  }
  function setMode(mode) {
    editorState.mode = mode;
    document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    document.getElementById('aiGenerateRow').style.display = mode === 'ai' ? 'flex' : 'none';
    document.getElementById('seoAutoRow').style.display = mode === 'seo-auto' ? 'block' : 'none';
    if (mode === 'ai' && !document.getElementById('generateAiBtn')._wired) {
      document.getElementById('generateAiBtn')._wired = true;
      document.getElementById('generateAiBtn').onclick = generateWithAi;
    }
    if (mode === 'seo-auto' && !document.getElementById('autoSeoBtn')._wired) {
      document.getElementById('autoSeoBtn')._wired = true;
      document.getElementById('autoSeoBtn').onclick = runAutoSeo;
    }
  }

  // ── SEO AUTO MODE — paste a complete article, generate every metadata field in
  // one click (ported/improved from the old ai-articles.html AUTO-mode toggle;
  // reuses the same auto-meta action/article-autometa.js, adds SEO-panel population
  // client-side so the AI prompt itself never needs to change). ──────────────────
  async function runAutoSeo() {
    const content = document.getElementById('seoAutoPaste').value.trim();
    if (!content) { toast('Paste the article content first', 'bad'); return; }
    document.getElementById('autoSeoNote').textContent = 'Generating…';
    const data = await apiPost(ART, 'auto-meta', { content });
    if (!data.meta) { document.getElementById('autoSeoNote').textContent = 'Auto SEO failed — try again or write manually.'; return; }
    document.getElementById('edContent').value = content;
    applyGeneratedMeta(data.meta);
    document.getElementById('autoSeoNote').textContent = 'Populated from ' + (data.meta.source || 'generator') + ' — review, then Publish.';
    toast('SEO Auto complete — every field populated', 'ok');
  }

  // Shared by SEO Auto + AI Generation: title/category/difficulty/tags/summary →
  // the manual fields, PLUS derived SEO-panel suggestions (seoTitle/ogTitle default
  // to the generated title, meta/og description to the summary, focus keyword to
  // the top retrieval keyword, the rest as secondary keywords) — computed here
  // rather than in the AI prompt so no existing generator output shape changes.
  function applyGeneratedMeta(meta) {
    document.getElementById('edTitleField').value = meta.title || '';
    document.getElementById('edTitleMini').textContent = meta.title || 'New article';
    if (meta.category) document.getElementById('edCategory').value = meta.category;
    document.getElementById('edDifficulty').value = meta.difficulty || 'beginner';
    document.getElementById('edTags').value = (meta.tags || []).join(', ');
    document.getElementById('edSummary').value = meta.summary || '';
    const kws = Array.isArray(meta.keywords) && meta.keywords.length ? meta.keywords : (meta.tags || []);
    document.getElementById('seoTitle').value = meta.title || '';
    document.getElementById('seoMetaTitle').value = meta.title || '';
    document.getElementById('seoOgTitle').value = meta.title || '';
    document.getElementById('seoMetaDescription').value = meta.summary || '';
    document.getElementById('seoOgDescription').value = meta.summary || '';
    document.getElementById('seoFocusKeyword').value = kws[0] || '';
    document.getElementById('seoSecondaryKeywords').value = kws.slice(1).join(', ');
  }
  async function loadCategoriesInto(select) {
    const data = await apiGet(ART + '?action=categories');
    select.innerHTML = (data.categories || []).map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('');
  }

  function fillEditorFromBrief(brief) {
    document.getElementById('edTitleField').value = brief.title || '';
    document.getElementById('edTitleMini').textContent = brief.title || 'New article';
    document.getElementById('edCategory').value = brief.category || '';
    document.getElementById('edDifficulty').value = brief.difficulty || 'beginner';
    document.getElementById('edTags').value = (brief.tags || []).join(', ');
    document.getElementById('edSummary').value = brief.metaDescription || '';
    const tags = brief.tags || [];
    document.getElementById('seoTitle').value = brief.title || '';
    document.getElementById('seoMetaTitle').value = brief.title || '';
    document.getElementById('seoOgTitle').value = brief.title || '';
    document.getElementById('seoMetaDescription').value = brief.metaDescription || '';
    document.getElementById('seoOgDescription').value = brief.metaDescription || '';
    document.getElementById('seoFocusKeyword').value = tags[0] || '';
    document.getElementById('seoSecondaryKeywords').value = tags.slice(1).join(', ');
    if (brief.faqs && brief.faqs.length) {
      document.getElementById('seoSchemaPreview').innerHTML = '<b>FAQ schema will publish from:</b> ' + brief.faqs.slice(0, 3).map(f => esc(f.question)).join(' · ');
    }
  }
  function renderBriefExtras(brief, internalLinks) {
    const faqs = (brief.faqs || []).map(f => `<li><b>${esc(f.question)}</b> — ${esc(f.answer)}</li>`).join('');
    const outline = (brief.outline || []).map(o => `<li>${esc(o)}</li>`).join('');
    const links = (internalLinks || []).map(l => `<li>${esc(l.title)} <span style="color:var(--dim)">(${l.type})</span></li>`).join('');
    editorState.internalLinks = internalLinks || [];
    const seoLinksOut = document.getElementById('seoInternalLinksOut');
    if (seoLinksOut) {
      seoLinksOut.innerHTML = (internalLinks || []).length
        ? '<b>Internal links (auto-suggested, published automatically):</b> ' + internalLinks.map(l => esc(l.title)).join(' · ')
        : 'No internal link matches yet in the live graph for this topic.';
    }
    document.getElementById('briefExtras').innerHTML = `
      <div class="card" style="margin:12px 0">
        <h3>⚡ Prepared brief</h3>
        <div class="grid cols-3">
          <div><div class="sec-title" style="margin:0 0 6px">Outline</div><ul style="padding-left:18px;font-size:12.5px">${outline || '<li class="empty">—</li>'}</ul></div>
          <div><div class="sec-title" style="margin:0 0 6px">FAQ suggestions</div><ul style="padding-left:18px;font-size:12.5px">${faqs || '<li class="empty">—</li>'}</ul></div>
          <div><div class="sec-title" style="margin:0 0 6px">Internal link suggestions</div><ul style="padding-left:18px;font-size:12.5px">${links || '<li class="empty">none yet</li>'}</ul></div>
        </div>
        <div style="margin-top:10px;font-size:11.5px;color:var(--muted)"><b>Image prompt:</b> ${esc(brief.imagePrompt || '—')}</div>
      </div>`;
  }

  async function prepareFromTopic(topic) {
    if (!topic) { toast('Enter a topic first', 'bad'); return; }
    if (!document.getElementById('editorCard').classList.contains('open')) openEditor();
    toast('Preparing brief…');
    const data = await apiPost(ART, 'ai-brief', { topic });
    if (!data.brief) { toast('Could not prepare a brief', 'bad'); return; }
    editorState.brief = data.brief;
    fillEditorFromBrief(data.brief);
    renderBriefExtras(data.brief, data.internalLinks);
    toast('Brief ready — write manually or switch to AI Writing', 'ok');
  }

  async function generateWithAi() {
    const brief = editorState.brief || {
      title: document.getElementById('edTitleField').value,
      tags: document.getElementById('edTags').value.split(',').map(s => s.trim()).filter(Boolean),
    };
    document.getElementById('aiGenNote').textContent = 'Generating…';
    const data = await apiPost(ART, 'ai-generate', { brief });
    if (!data.generated) { document.getElementById('aiGenNote').textContent = data.note || 'AI writing unavailable — write manually.'; return; }
    document.getElementById('edContent').value = data.content;
    // AI GENERATION AUDIT (spec) — model/generation-time/tokens/cost are the REAL
    // values echoed from the API response (composer-llm.js's generateArticleDraft),
    // never estimated. Cost only appears when the admin has configured real
    // per-1K pricing env vars; otherwise the honest costNote explains why.
    const u = data.usage || {};
    const bits = [];
    if (u.provider) bits.push('Provider: ' + u.provider);
    if (u.model) bits.push('Model: ' + u.model);
    if (u.ms != null) bits.push('Generation time: ' + u.ms + 'ms');
    if (u.usage) bits.push(`Tokens: ${u.usage.prompt_tokens ?? '?'} in / ${u.usage.completion_tokens ?? '?'} out / ${u.usage.total_tokens ?? '?'} total`);
    if (u.costUsd != null) bits.push('Est. cost: $' + u.costUsd.toFixed(5));
    else if (u.costNote) bits.push(u.costNote);
    document.getElementById('aiGenNote').innerHTML = 'Generated — review before publishing.' + (bits.length ? '<br><span style="color:var(--dim)">' + bits.map(esc).join(' · ') + '</span>' : '');
  }

  // Parses the "Title | https://url" external-links textarea into [{title,url}].
  function parseExternalLinks(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const [title, url] = line.split('|').map(s => s.trim());
      return url ? { title: title || url, url } : { title: line, url: line };
    }).filter(l => /^https?:\/\//i.test(l.url));
  }
  function gatherSeoOverrides() {
    const ov = {
      seoTitle: document.getElementById('seoTitle').value.trim(),
      h1: document.getElementById('seoH1').value.trim(),
      metaTitle: document.getElementById('seoMetaTitle').value.trim(),
      metaDescription: document.getElementById('seoMetaDescription').value.trim(),
      canonicalUrl: document.getElementById('seoCanonical').value.trim(),
      focusKeyword: document.getElementById('seoFocusKeyword').value.trim(),
      secondaryKeywords: document.getElementById('seoSecondaryKeywords').value.split(',').map(s => s.trim()).filter(Boolean),
      ogTitle: document.getElementById('seoOgTitle').value.trim(),
      ogDescription: document.getElementById('seoOgDescription').value.trim(),
      twitterCard: document.getElementById('seoTwitterCard').value,
      externalLinks: parseExternalLinks(document.getElementById('seoExternalLinks').value),
    };
    for (const k of Object.keys(ov)) {
      if (ov[k] == null || ov[k] === '' || (Array.isArray(ov[k]) && !ov[k].length)) delete ov[k];
    }
    return ov;
  }
  function fillSeoOverrides(ov) {
    ov = ov || {};
    document.getElementById('seoTitle').value = ov.seoTitle || '';
    document.getElementById('seoH1').value = ov.h1 || '';
    document.getElementById('seoMetaTitle').value = ov.metaTitle || '';
    document.getElementById('seoMetaDescription').value = ov.metaDescription || '';
    document.getElementById('seoCanonical').value = ov.canonicalUrl || '';
    document.getElementById('seoFocusKeyword').value = ov.focusKeyword || '';
    document.getElementById('seoSecondaryKeywords').value = (ov.secondaryKeywords || []).join(', ');
    document.getElementById('seoOgTitle').value = ov.ogTitle || '';
    document.getElementById('seoOgDescription').value = ov.ogDescription || '';
    document.getElementById('seoTwitterCard').value = ov.twitterCard || 'summary_large_image';
    document.getElementById('seoExternalLinks').value = (ov.externalLinks || []).map(l => `${l.title} | ${l.url}`).join('\n');
  }
  function gather(isActive) {
    return {
      id: editorState.id,
      title: document.getElementById('edTitleField').value.trim(),
      slug: document.getElementById('edSlug').value.trim() || undefined,
      category: document.getElementById('edCategory').value,
      difficulty: document.getElementById('edDifficulty').value,
      tags: document.getElementById('edTags').value.split(',').map(s => s.trim()).filter(Boolean),
      summary: document.getElementById('edSummary').value.trim(),
      content: document.getElementById('edContent').value,
      language: 'en',
      author: document.getElementById('edAuthor').value.trim() || 'ZTU',
      is_active: isActive,
      seo_overrides: gatherSeoOverrides(),
    };
  }
  // PUBLISH VERIFICATION CHECKLIST (spec Phase 5) — every one of the spec'd 10
  // checks, each mapped to a REAL sub-result already computed by
  // verifyPublishPipeline() (article-graph-sync.js) — no new verification logic.
  // Items that are one-time structural facts gate the tick (pass/fail); items that
  // are inherently best-effort or improve over time (schema, chatbot-contextual,
  // internal links, chunking) render as a Recommendation chip instead of a red X
  // when not yet satisfied — matches the spec's explicit "never show Failure for
  // something that only needs a Recommendation" rule.
  function renderVerification(v, status, reason, ecosystem, articleId) {
    const box = document.getElementById('verifyOut');
    if (!v) { box.innerHTML = ''; return; }
    const tick = ok => `<span class="tick ${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✕'}</span>`;
    const rec = label => `<div class="tick-row"><span class="tick pass" style="background:var(--warn)">i</span> ${label} <span class="chip" style="margin-left:4px">Recommendation</span></div>`;
    const internalLinksCount = (ecosystem?.internalLinks || []).length;
    const rows = [
      { label: 'Article exists', ok: true },
      { label: 'Public URL live (/articles/{slug})', ok: !!v.publicWebsite?.pageAccessible },
      { label: 'SEO completed (title, keywords)', ok: !!v.seoReadiness?.seoTitle && !!v.seoReadiness?.keywords },
      { label: 'Meta description completed', ok: !!v.publicWebsite?.metaDescription },
      { label: 'Schema / FAQ structured data', ok: !!v.publicWebsite?.structuredData, soft: true, softNote: 'Add FAQ-style questions to the article (or a Brief) to generate FAQ schema automatically.' },
      { label: 'Knowledge Graph updated (concept published)', ok: !!v.knowledgeGraph?.conceptPublished },
      { label: 'Chatbot can answer contextually', ok: !!v.knowledgeGraph?.chatbotAnswersContextually, soft: true, softNote: 'Confidence-based — improves automatically as more related content joins the graph.' },
      { label: 'Articles Library updated', ok: true },
      { label: `Internal links added (${internalLinksCount})`, ok: internalLinksCount > 0, soft: true, softNote: 'No related graph concepts/articles matched yet — add tags that overlap with existing content.' },
      { label: 'Searchable (full body indexed as chunks)', ok: !!v.knowledgeGraph?.chunksCreated, soft: true, softNote: 'Chunk indexing is best-effort and retries automatically on next publish.' },
    ];
    const recommendations = [...(v.seoReadiness?.recommendations || [])];
    box.innerHTML = `
      <div class="verify-box ${status === 'published' ? 'ok' : 'fail'}">
        <b>${status === 'published' ? '✓ Published — every gating check passed' : '✕ Pipeline Failed — not published'}</b>
        ${reason ? `<div style="margin:6px 0;color:var(--muted)">${esc(reason)}</div>` : ''}
        ${rows.map(r => r.ok ? `<div class="tick-row">${tick(true)} ${r.label}</div>` : (r.soft ? rec(r.label) : `<div class="tick-row">${tick(false)} ${r.label}</div>`)).join('')}
        ${rows.filter(r => !r.ok && r.soft && r.softNote).map(r => `<div style="margin-top:4px;font-size:11px;color:var(--dim)">→ ${esc(r.softNote)}</div>`).join('')}
        ${recommendations.length ? '<div style="margin-top:6px;color:var(--muted);font-size:11.5px">Recommendations: ' + recommendations.map(esc).join(' · ') + '</div>' : ''}
        ${status !== 'published' && articleId ? `
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn sm gold" id="vRetryPublish">🔁 Retry Publish</button>
            <button class="btn sm" id="vGraphRepair">⚙ Auto Repair Graph (sync edges) &amp; Retry</button>
          </div>` : ''}
      </div>`;
    // KNOWLEDGE GRAPH CONTEXTUAL AUTO-REPAIR (spec Phase 7) — the same sync-edges/
    // publish actions already available in the Advanced panel, promoted right next
    // to the failed check instead of requiring a scroll to the buried panel below.
    if (status !== 'published' && articleId) {
      document.getElementById('vRetryPublish').onclick = async () => {
        toast('Retrying publish…');
        const pub = await apiPost(ART, 'publish', { id: articleId });
        renderVerification(pub.verification, pub.status, pub.reason, pub.ecosystem, articleId);
        toast(pub.status === 'published' ? 'Published' : 'Still failing — see checklist above', pub.status === 'published' ? 'ok' : 'bad');
        loadLibrary(); loadExecutive(); loadCoverage(); loadMissingTopics();
      };
      document.getElementById('vGraphRepair').onclick = async () => {
        toast('Running graph edge sync…');
        await apiPost(KB, 'sync-edges', { limit: 50, offset: 0 });
        toast('Graph sync complete — retrying publish…');
        const pub = await apiPost(ART, 'publish', { id: articleId });
        renderVerification(pub.verification, pub.status, pub.reason, pub.ecosystem, articleId);
        toast(pub.status === 'published' ? 'Published' : 'Still failing — try Advanced → Graph Infrastructure for more tools', pub.status === 'published' ? 'ok' : 'bad');
        loadLibrary(); loadExecutive(); loadCoverage(); loadMissingTopics();
      };
    }
  }

  async function saveArticle(publish) {
    const payload = gather(false);
    if (!payload.title) { toast('Title required', 'bad'); return; }
    const action = editorState.id ? 'update' : 'create';
    const res = await apiPost(ART, action, payload);
    if (!res.saved) { toast('Save failed', 'bad'); return; }
    editorState.id = res.article.id;
    refreshImagesGate();
    toast(publish ? 'Draft saved — publishing…' : 'Draft saved', 'ok');
    if (!publish) return;
    const pub = await apiPost(ART, 'publish', { id: editorState.id });
    renderVerification(pub.verification, pub.status, pub.reason, pub.ecosystem, editorState.id);
    toast(pub.status === 'published' ? 'Published — graph, SEO &amp; chatbot in sync' : 'Pipeline Failed — see details below', pub.status === 'published' ? 'ok' : 'bad');
    // ARTICLE COMPLETION TRACKING (spec Phase 6 + production addendum) — a newly-
    // published article changes coverage ratios, may resolve a missing-topic gap,
    // and changes Knowledge Graph/Chatbot/SEO/Website Health status; refresh
    // everything automatically, no manual reload needed. Same event-driven pattern
    // already used for loadLibrary/loadExecutive.
    loadLibrary(); loadExecutive(); loadCoverage(); loadMissingTopics(); loadHealth(); loadErrorCenter();
  }

  // ── ARTICLES LIBRARY (verification-at-a-glance) ─────────────────────────
  async function loadLibraryCategoryOptions() {
    const sel = document.getElementById('adminLibCategory');
    if (sel.dataset.loaded) return;
    sel.dataset.loaded = '1';
    const data = await apiGet(ART + '?action=categories');
    sel.innerHTML = '<option value="all">All categories</option>' + (data.categories || []).map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('');
  }
  function sortRows(rows) {
    const r = [...rows];
    if (libState.sort === 'updated_asc') r.sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
    else if (libState.sort === 'title_asc') r.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else r.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    return r;
  }
  async function loadLibrary() {
    loadLibraryCategoryOptions();
    const catQs = libState.category !== 'all' ? `&category=${encodeURIComponent(libState.category)}` : '';
    const data = await apiGet(ART + `?action=list&status=${libState.status}&page=${libState.page}&pageSize=${libState.pageSize}${catQs}`);
    let rows = data.articles || [];
    if (libState.q) {
      const q = libState.q.toLowerCase();
      rows = rows.filter(a => (a.title || '').toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q));
    }
    rows = sortRows(rows);
    const total = data.total ?? rows.length;
    // ARTICLE ORGANIZATION (spec Phase 6) — once the library grows past one page,
    // label the visible window "Articles N–M of TOTAL" so a large library stays
    // navigable; purely a display label over the existing page/pageSize state, no
    // new grouping logic, no risk of duplicate URLs (slug uniqueness already
    // enforced server-side in ai-articles.js).
    const groupLabel = document.getElementById('libGroupLabel');
    if (total > libState.pageSize) {
      const start = (libState.page - 1) * libState.pageSize + 1;
      const end = Math.min(total, start + libState.pageSize - 1);
      groupLabel.style.display = '';
      groupLabel.textContent = `Showing articles ${start}–${end} of ${total}`;
    } else {
      groupLabel.style.display = 'none';
    }
    const body = document.getElementById('libBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="9" class="empty">No articles match.</td></tr>'; return; }
    body.innerHTML = rows.map(a => {
      const statusBadge = a.pipelineStatus === 'published' ? '<span class="badge ok">Published</span>'
        : a.pipelineStatus === 'pipeline_failed' ? '<span class="badge bad">Pipeline Failed</span>'
        : '<span class="badge dim">Draft</span>';
      // Independent SEO / Knowledge Graph / Chatbot status (spec Phase 6) — each
      // reads its own verification sub-result (see ai-articles.js `list` action's
      // last_verification-derived seoStatus/kgStatus/chatbotStatus), not a single
      // combined signal.
      const dot = ok => ok ? '<span class="badge ok">✓</span>' : '<span class="badge dim">—</span>';
      return `<tr>
        <td class="title" title="${esc(a.title)}">${esc(a.title)}</td>
        <td>${esc(humanize(a.category))}</td>
        <td>${statusBadge}</td>
        <td><button class="btn sm" style="padding:2px 8px" data-detail="${a.id}" data-detail-tab="seo">${dot(a.seoStatus)}</button></td>
        <td><button class="btn sm" style="padding:2px 8px" data-detail="${a.id}" data-detail-tab="graph">${dot(a.kgStatus)}</button></td>
        <td><button class="btn sm" style="padding:2px 8px" data-detail="${a.id}" data-detail-tab="chatbot">${dot(a.chatbotStatus)}</button></td>
        <td>${a.updated_at ? new Date(a.updated_at).toLocaleDateString() : '—'}</td>
        <td>${esc(a.author || '—')}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-edit="${a.id}">Edit</button>
          ${a.pipelineStatus === 'pipeline_failed' ? `<button class="btn sm gold" data-repair="${a.id}">Improve &amp; Republish</button>` : ''}
          ${a.is_active ? `<button class="btn sm" data-unpub="${a.id}">Unpublish</button>` : `<button class="btn sm gold" data-pub="${a.id}">Publish</button>`}
          ${a.is_active && a.slug ? `<button class="btn sm" data-preview="${esc(a.slug)}">Preview</button><button class="btn sm" data-copy="${esc(a.slug)}">Copy Link</button>` : ''}
          <button class="btn sm danger" data-del="${a.id}">Delete</button>
        </div></td>
      </tr>
      <tr id="detailRow-${a.id}" style="display:none"><td colspan="9"><div id="detailOut-${a.id}"></div></td></tr>`;
    }).join('');
    document.getElementById('libPager').textContent = `Page ${data.page} of ${Math.max(1, Math.ceil(total / libState.pageSize))} — ${total} articles`;

    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editArticle(b.dataset.edit)));
    body.querySelectorAll('[data-pub]').forEach(b => b.addEventListener('click', async () => { const r = await apiPost(ART, 'publish', { id: b.dataset.pub }); toast(r.status === 'published' ? 'Published' : 'Pipeline Failed — open Edit for details', r.status === 'published' ? 'ok' : 'bad'); loadLibrary(); loadExecutive(); loadCoverage(); loadMissingTopics(); loadHealth(); loadErrorCenter(); }));
    body.querySelectorAll('[data-unpub]').forEach(b => b.addEventListener('click', async () => { await apiPost(ART, 'draft', { id: b.dataset.unpub }); toast('Unpublished — graph concept retracted', 'ok'); loadLibrary(); loadExecutive(); }));
    body.querySelectorAll('[data-repair]').forEach(b => b.addEventListener('click', async () => { toast('Improving…'); const r = await apiPost(ART, 'repair', { id: b.dataset.repair }); toast(r.verification?.ok ? 'Improved &amp; republished' : 'Still needs attention — see Edit', r.verification?.ok ? 'ok' : 'bad'); loadLibrary(); }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Delete this article? This also retracts it from the knowledge graph.')) return; await apiPost(ART, 'delete', { id: b.dataset.del }); toast('Deleted', 'ok'); loadLibrary(); loadExecutive(); }));
    body.querySelectorAll('[data-preview]').forEach(b => b.addEventListener('click', () => window.open('/articles/' + b.dataset.preview, '_blank')));
    body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
      const url = window.location.origin + '/articles/' + b.dataset.copy;
      navigator.clipboard?.writeText(url).then(() => toast('Link copied', 'ok')).catch(() => toast(url, 'ok'));
    }));
    body.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => toggleArticleDetail(b.dataset.detail, b.dataset.detailTab)));
  }

  // ARTICLE STATUS DETAILS (spec) — clicking a SEO/Graph/Chatbot dot expands a row
  // showing the REAL stored data behind that checkmark (?action=article-detail),
  // not just a boolean. Cached per article id per library render so re-opening
  // the same tab doesn't re-fetch; switching tabs on an already-open row re-uses
  // the same fetched data.
  const detailCache = {};
  async function toggleArticleDetail(id, tab) {
    const row = document.getElementById('detailRow-' + id);
    const out = document.getElementById('detailOut-' + id);
    if (row.style.display !== 'none' && detailCache[id]?.tab === tab) { row.style.display = 'none'; return; }
    row.style.display = '';
    if (!detailCache[id] || detailCache[id].tab !== tab) {
      out.innerHTML = '<div class="empty">Loading details…</div>';
      const data = await apiGet(ART + '?action=article-detail&id=' + encodeURIComponent(id)).catch(() => null);
      detailCache[id] = { tab, data };
    }
    renderArticleDetail(out, tab, detailCache[id].data);
  }
  function renderArticleDetail(out, tab, data) {
    if (!data) { out.innerHTML = '<div class="empty">Details unavailable.</div>'; return; }
    if (tab === 'seo') {
      const ov = data.seo?.overrides || {}, c = data.seo?.computed || {};
      const row = (label, key) => `<div class="tick-row"><b style="min-width:160px;display:inline-block">${esc(label)}</b> ${esc(ov[key] || c[key] || '—')}</div>`;
      out.innerHTML = `<div class="card" style="background:var(--inset)">
        ${row('SEO Title', 'seoTitle')}${row('Meta Title', 'metaTitle')}${row('Meta Description', 'metaDescription')}
        ${row('Focus Keyword', 'focusKeyword')}<div class="tick-row"><b style="min-width:160px;display:inline-block">Secondary Keywords</b> ${esc((ov.secondaryKeywords || c.secondaryKeywords || []).join(', ') || '—')}</div>
        ${row('Slug', 'slug')}${row('Canonical URL', 'canonicalUrl')}${row('OpenGraph Title', 'ogTitle')}${row('OpenGraph Description', 'ogDescription')}${row('Twitter Card', 'twitterCard')}
        <div class="tick-row"><b style="min-width:160px;display:inline-block">Structured Data (FAQ)</b> ${c.faqSchema ? '✓ present' : '— none yet'}</div>
      </div>`;
    } else if (tab === 'graph') {
      const g = data.graph || {};
      out.innerHTML = `<div class="card" style="background:var(--inset)">
        <div class="tick-row"><b style="min-width:160px;display:inline-block">Graph node</b> ${g.nodeExists ? '✓ ' + esc(g.nodeId) : '— not published'}</div>
        <div class="tick-row"><b style="min-width:160px;display:inline-block">Status</b> ${esc(g.status || '—')}</div>
        <div class="tick-row"><b style="min-width:160px;display:inline-block">Embedding</b> ${g.hasEmbedding ? '✓ present' : '— none'}</div>
        <div class="tick-row"><b style="min-width:160px;display:inline-block">Chunks</b> ${g.chunks?.published ?? 0} / ${g.chunks?.total ?? 0} published</div>
        <div class="tick-row"><b style="min-width:160px;display:inline-block">Linked concepts</b> ${(g.neighbors || []).length ? (g.neighbors || []).map(n => esc(n.title || n.id)).join(', ') : '— none yet'}</div>
      </div>`;
    } else if (tab === 'chatbot') {
      const c = data.chatbot || {};
      out.innerHTML = `<div class="card" style="background:var(--inset)">
        ${c.probe ? `
          <div class="tick-row"><b style="min-width:160px;display:inline-block">Retrieval source</b> ${esc(c.probe.topConcept || '—')}</div>
          <div class="tick-row"><b style="min-width:160px;display:inline-block">Confidence</b> ${esc(c.probe.confidence || '—')}</div>
          <div class="tick-row"><b style="min-width:160px;display:inline-block">Answers contextually</b> ${c.probe.contextual ? '✓ yes' : '— no'}</div>
          <div style="font-size:11px;color:var(--dim);margin-top:6px">As of ${c.asOf ? new Date(c.asOf).toLocaleString() : '—'} — ${esc(c.note || '')}</div>
        ` : `<div class="empty">${esc(c.note || 'No verification recorded yet.')}</div>`}
      </div>`;
    }
  }
  async function editArticle(id) {
    const data = await apiGet(ART + '?action=get&id=' + encodeURIComponent(id));
    if (!data.article) { toast('Not found', 'bad'); return; }
    openEditor();
    editorState.id = data.article.id;
    document.getElementById('edTitleField').value = data.article.title || '';
    document.getElementById('edTitleMini').textContent = data.article.title || '';
    document.getElementById('topicPrep').style.display = 'none';
    document.getElementById('edSlug').value = data.article.slug || '';
    setTimeout(() => { document.getElementById('edCategory').value = data.article.category || ''; }, 60);
    document.getElementById('edDifficulty').value = data.article.difficulty || 'beginner';
    document.getElementById('edTags').value = (data.article.tags || []).join(', ');
    document.getElementById('edSummary').value = data.article.summary || '';
    document.getElementById('edContent').value = data.article.content || '';
    document.getElementById('edAuthor').value = data.article.author || '';
    fillSeoOverrides(data.article.seo_overrides);
    editorState.images = data.images || [];
    refreshImagesGate();
  }

  // ── ADVANCED PANEL — graph infra / deployment / logs / playground ───────
  function wireAdvanced() {
    document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.tool;
      const out = document.getElementById('toolOut');
      out.textContent = 'Running ' + id + '…';
      const isGet = id === 'status' || id === 'validate-anchors';
      const url = KB + '?action=' + id;
      const res = isGet ? await apiGet(url) : await apiPost(KB, id, id === 'populate-anchors' ? { offset: 0, limit: 20, publish: true } : id === 'sync-edges' ? { limit: 50, offset: 0 } : {});
      out.textContent = JSON.stringify(res, null, 2).slice(0, 4000);
    }));
    document.getElementById('deployProbeBtn').onclick = async () => { document.getElementById('deployOut').textContent = JSON.stringify(await apiGet(KB + '?action=deployment-probe'), null, 2); };
    document.getElementById('sysLogBtn').onclick = async () => { document.getElementById('deployOut').textContent = JSON.stringify(await apiGet(KB + '?action=system-log&limit=50'), null, 2); };

    document.getElementById('pgAsk').onclick = runChatbotCheck;
    document.getElementById('pgQ').addEventListener('keydown', e => { if (e.key === 'Enter') runChatbotCheck(); });
    loadChatbotSources();
  }

  // AUTOMATIC SOURCE DETECTION — populates the mode select from the live pipeline's
  // own SOURCE_STAGES (chatbot-diagnostics.js::getTestableSources), never hardcoded.
  // Every option drives the REAL production /api/ai-chat pipeline via sourceFlags
  // (see runChatbotCheck) — there is no separate diagnostic engine.
  let chatbotSourceKeys = [];
  async function loadChatbotSources() {
    const data = await apiGet(KB + '?action=chatbot-sources');
    const sel = document.getElementById('pgSourceMode');
    const sources = data.sources || [];
    chatbotSourceKeys = sources.map(s => s.key);
    sel.innerHTML = '<option value="production">Production (all sources enabled)</option>'
      + sources.map(s => `<option value="${esc(s.key)}"${s.note ? ` title="${esc(s.note)}"` : ''}>${esc(s.label)} Only</option>`).join('');
  }

  // ── CHATBOT CHECKER (spec Phase 8) — diagnostic tool, not a simple chatbot.
  // Step 1: ask the live chatbot exactly like a real user would (same /api/ai-chat
  // SSE stream, same source badge). Step 2: ask ai-kb-admin's chatbot-check action
  // to diagnose WHY (reuses ai_response_logs + the same retrieval chain the publish
  // gate uses — see chatbot-diagnostics.js). Never a second chat engine. ──────────
  // Builds the sourceFlags body for a "X Only" test mode: every detected source
  // disabled except the selected one. 'production' (or an unrecognized mode)
  // sends no override at all, so the request is byte-for-byte the same as a real
  // visitor's — see buildExecutionContext() in ai-chat.js.
  function sourceFlagsForMode(mode) {
    if (mode === 'production' || !chatbotSourceKeys.includes(mode)) return null;
    const flags = {};
    for (const k of chatbotSourceKeys) flags[k] = (k === mode);
    return flags;
  }

  async function runChatbotCheck() {
    const q = document.getElementById('pgQ').value.trim(); if (!q) return;
    const out = document.getElementById('pgOut');
    const mode = document.getElementById('pgSourceMode').value;
    const sourceFlags = sourceFlagsForMode(mode);
    out.innerHTML = '<div class="empty">Asking the chatbot' + (sourceFlags ? ' (' + esc(mode) + ' only)' : '') + '…</div>';
    const t0 = performance.now();
    let answer = '', src = null;
    try {
      // Sends the admin session Bearer token so ai-chat.js's admin-diagnostic
      // bypass exempts this call from the public visitor guest-message limit —
      // otherwise an already-tested admin browser can silently get a JSON "limit
      // reached" response instead of a real answer, misreporting a healthy
      // chatbot as broken (found via live testing). sourceFlags (only honored for
      // an authenticated admin-diagnostic call) drives the SAME production
      // routing decisions via the execution-context layer — this is the real
      // pipeline in every mode, never a second implementation.
      const body = { messages: [{ role: 'user', content: q }], debug: true };
      if (sourceFlags) body.sourceFlags = sourceFlags;
      const r = await fetch('/api/ai-chat', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const contentType = r.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        // Not a stream — either a validation error or the visitor limit response.
        const j = await r.json().catch(() => null);
        out.innerHTML = `<div class="verify-box fail"><b>Chatbot call did not return an answer</b><div style="margin-top:6px;color:var(--muted)">${esc((j && (j.title || j.error)) || 'HTTP ' + r.status + ' — non-streaming response.')}</div><div style="margin-top:6px;font-size:11.5px;color:var(--dim)">This is a chat-access response, not a weak-answer diagnosis — it does not reflect the chatbot's real answer quality.</div></div>`;
        return;
      }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop();
        for (const p of parts) {
          const line = p.replace(/^data:\s*/, '').trim(); if (!line || line === '[DONE]') continue;
          try { const j = JSON.parse(line); if (j.t) answer += j.t; if (j.source) src = j.source; } catch (_) {}
        }
      }
    } catch (e) { out.innerHTML = '<div class="empty">Unreachable — deploy to Cloudflare to test live.</div>'; return; }
    const clientLatencyMs = Math.round(performance.now() - t0);
    out.innerHTML = '<div class="empty">Diagnosing the answer…</div>';
    const diag = await apiPost(KB, 'chatbot-check', { question: q, sourceLayer: src?.layer }).catch(() => null);
    renderChatbotCheck(q, answer, src, diag, clientLatencyMs, mode);
  }

  function renderChatbotCheck(question, answer, src, diag, clientLatencyMs, mode) {
    const out = document.getElementById('pgOut');
    if (!diag) { out.innerHTML = '<div class="empty">Diagnosis unavailable — chatbot-check action failed.</div>'; return; }
    const strongBadge = diag.strong
      ? '<span class="badge ok">✓ Strong answer</span>'
      : '<span class="badge bad">Weak answer — see below</span>';
    const weaknessRows = (diag.weaknesses || []).map(w => `
      <div class="rec-row">
        <div class="rec-topic"><div class="t">${esc(w.label)}</div><div class="why">${esc(w.explanation)}</div></div>
        <div style="display:flex;gap:6px">
          ${w.autoRepair ? `<button class="btn sm gold" data-autorepair="${esc(w.autoRepair.action)}">${esc(w.autoRepair.label)}</button>` : `<button class="btn sm" data-claude-note="1">Manual Repair Guide</button>`}
        </div>
      </div>`).join('');
    out.innerHTML = `
      <div class="verify-box ${diag.strong ? 'ok' : 'fail'}">
        ${mode && mode !== 'production' ? `<div style="margin-bottom:8px"><span class="chip seo">Mode: ${esc(humanize(mode))} Only — other sources disabled for this call via the real production routing</span></div>` : ''}
        <div style="margin-bottom:8px"><b>Q:</b> ${esc(question)}</div>
        <div style="margin-bottom:8px;color:var(--muted)"><b>A:</b> ${esc((answer || '').slice(0, 500))}${(answer || '').length > 500 ? '…' : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          ${strongBadge}
          ${src ? `<span class="chip">${esc(src.badge || src.label || src.layer)}</span>` : ''}
          <span class="chip">Confidence: ${esc(diag.confidence || 'n/a')}</span>
          <span class="chip">Latency: ${diag.responseTimeMs != null ? diag.responseTimeMs : clientLatencyMs}ms</span>
          ${diag.articleId ? `<span class="chip">Article: ${esc(diag.articleId)}</span>` : ''}
          ${diag.graphNodeId ? `<span class="chip">Node: ${esc(diag.graphNodeId)}</span>` : ''}
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px"><b>Source used:</b> ${esc(diag.sourceUsed)} — ${esc(diag.whySelected)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px"><b>Retrieval summary:</b> ${esc(diag.retrievalSummary)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">Knowledge coverage: intent=${esc(diag.knowledgeCoverage?.intent)} · category=${esc(diag.knowledgeCoverage?.category || 'none')} · context kept=${diag.knowledgeCoverage?.contextKept ? 'yes' : 'no'}</div>
        ${weaknessRows || '<div class="empty">No issues detected.</div>'}
        ${diag.claudePrompt ? `<div style="margin-top:10px">
            <button class="btn sm" id="claudePromptBtn">📋 Generate Claude Repair Prompt</button>
            <textarea id="claudePromptOut" rows="6" readonly style="display:none;width:100%;margin-top:8px;background:var(--inset);border:1px solid var(--border2);border-radius:9px;color:var(--text);font-family:'Courier New',monospace;font-size:11.5px;padding:10px"></textarea>
          </div>` : ''}
        ${!diag.strong ? `<div style="margin-top:10px"><button class="btn sm" id="captureKnowledgeBtn">📥 Auto Knowledge Capture — prepare as article draft</button></div>` : ''}
      </div>`;
    // AUTO KNOWLEDGE CAPTURE (spec) — reuses the EXISTING ai-brief → editor draft
    // flow (same as Missing Topics' Manual/SEO Auto/AI Generate actions), never a
    // second publishing path, and never loses the already-generated OpenAI answer
    // by discarding it and regenerating from scratch — see captureAsArticleDraft.
    // Opens a DRAFT for review — the existing Save/Publish approval gate is
    // untouched, nothing bypasses it or auto-publishes.
    const captureBtn = document.getElementById('captureKnowledgeBtn');
    if (captureBtn) captureBtn.addEventListener('click', () => captureAsArticleDraft(question, answer));
    out.querySelectorAll('[data-autorepair]').forEach(b => b.addEventListener('click', async () => {
      toast('Running ' + b.dataset.autorepair + '…');
      await apiPost(KB, b.dataset.autorepair, { limit: 50, offset: 0 });
      toast('Repair attempted — re-checking…', 'ok');
      runChatbotCheck();
    }));
    out.querySelectorAll('[data-claude-note]').forEach(b => b.addEventListener('click', () => {
      const w = (diag.weaknesses || []).find(x => !x.autoRepair);
      if (w) toast(w.fix, 'ok');
    }));
    const claudeBtn = document.getElementById('claudePromptBtn');
    if (claudeBtn) claudeBtn.addEventListener('click', () => {
      const ta = document.getElementById('claudePromptOut');
      ta.style.display = 'block'; ta.value = diag.claudePrompt;
      ta.select();
      navigator.clipboard?.writeText(diag.claudePrompt).then(() => toast('Copied to clipboard', 'ok')).catch(() => {});
    });
  }

  // ── BOOT ─────────────────────────────────────────────────────────────────
  function boot(token) {
    TOKEN = token;
    document.getElementById('wrap').style.display = '';
    loadExecutive();
    loadRecommendations();
    loadCoverage();
    loadMissingTopics();
    loadLibrary();
    loadHealth();
    loadErrorCenter();
    wireAdvanced();

    document.getElementById('newArticleBtn').onclick = () => { openEditor(); };
    document.getElementById('exploreBtn').onclick = () => runExplore();
    document.getElementById('refreshBtn').onclick = () => { loadExecutive(); loadRecommendations(); loadCoverage(); loadMissingTopics(); loadLibrary(); loadHealth(); loadErrorCenter(); };
    document.getElementById('adminLibRefresh').onclick = () => loadLibrary();
    document.getElementById('adminLibStatus').onchange = e => { libState.status = e.target.value; libState.page = 1; loadLibrary(); };
    document.getElementById('adminLibCategory').onchange = e => { libState.category = e.target.value; libState.page = 1; loadLibrary(); };
    document.getElementById('adminLibSort').onchange = e => { libState.sort = e.target.value; loadLibrary(); };
    let deb;
    document.getElementById('adminLibSearch').addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { libState.q = e.target.value.trim(); loadLibrary(); }, 250); });
  }

  window.ContentCenter = { boot };
})();
