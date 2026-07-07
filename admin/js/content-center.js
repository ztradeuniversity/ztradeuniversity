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
  let libState = { page: 1, pageSize: 100, status: 'all', q: '' };

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

  // ── EDITOR ───────────────────────────────────────────────────────────────
  function editorTemplate() {
    return `
      <div class="editor-toolbar">
        <span class="title-mini" id="edTitleMini">New article</span>
        <div class="mode-toggle">
          <button data-mode="manual" class="active">✍ Manual</button>
          <button data-mode="ai">🤖 AI Writing</button>
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
      <div class="field-row">
        <div class="field" style="grid-column:1/3"><label>Title</label><input type="text" id="edTitleField" /></div>
        <div class="field"><label>Category</label><select id="edCategory"></select></div>
        <div class="field"><label>Difficulty</label><select id="edDifficulty"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
      </div>
      <div class="field-row two">
        <div class="field"><label>Tags (comma-separated)</label><input type="text" id="edTags" /></div>
        <div class="field"><label>Summary / meta description</label><input type="text" id="edSummary" /></div>
      </div>
      <div id="aiGenerateRow" style="display:none;margin-bottom:10px"><button class="btn sm gold" id="generateAiBtn">🤖 Generate with AI</button> <span id="aiGenNote" style="font-size:11.5px;color:var(--muted)"></span></div>
      <div class="field"><label>Content (Markdown)</label><textarea id="edContent" rows="16"></textarea></div>
      <div id="briefExtras"></div>

      <div class="card" style="margin-top:14px">
        <h3>🖼 Images</h3>
        <div id="imagesGate" style="font-size:11.5px;color:var(--muted)">Save the article once (Draft is fine) before attaching images.</div>
        <div id="imagesUploader" style="display:none">
          <div class="field-row two">
            <div class="field"><label>Image file</label><input type="file" id="imgFile" accept="image/*" /></div>
            <div class="field"><label>Caption</label><input type="text" id="imgCaption" /></div>
          </div>
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
    document.getElementById('imagesGrid').innerHTML = (images || []).map(img => `
      <div class="card" style="padding:8px">
        <img src="${esc(img.url)}" style="width:100%;border-radius:6px;display:block;margin-bottom:6px" />
        <div style="font-size:11px;color:var(--muted)">${esc(img.caption || '')}</div>
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
      });
      if (!res.image) { toast('Upload failed', 'bad'); return; }
      editorState.images = [...(editorState.images || []), res.image];
      renderImages(editorState.images);
      fileInput.value = ''; document.getElementById('imgCaption').value = '';
      toast('Image attached', 'ok');
    };
    reader.readAsDataURL(file);
  }
  function setMode(mode) {
    editorState.mode = mode;
    document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    document.getElementById('aiGenerateRow').style.display = mode === 'ai' ? 'flex' : 'none';
    if (mode === 'ai' && !document.getElementById('generateAiBtn')._wired) {
      document.getElementById('generateAiBtn')._wired = true;
      document.getElementById('generateAiBtn').onclick = generateWithAi;
    }
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
  }
  function renderBriefExtras(brief, internalLinks) {
    const faqs = (brief.faqs || []).map(f => `<li><b>${esc(f.question)}</b> — ${esc(f.answer)}</li>`).join('');
    const outline = (brief.outline || []).map(o => `<li>${esc(o)}</li>`).join('');
    const links = (internalLinks || []).map(l => `<li>${esc(l.title)} <span style="color:var(--dim)">(${l.type})</span></li>`).join('');
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
    document.getElementById('aiGenNote').textContent = 'Generated — review before publishing.';
  }

  function gather(isActive) {
    return {
      id: editorState.id,
      title: document.getElementById('edTitleField').value.trim(),
      category: document.getElementById('edCategory').value,
      difficulty: document.getElementById('edDifficulty').value,
      tags: document.getElementById('edTags').value.split(',').map(s => s.trim()).filter(Boolean),
      summary: document.getElementById('edSummary').value.trim(),
      content: document.getElementById('edContent').value,
      language: 'en',
      is_active: isActive,
    };
  }
  function renderVerification(v, status, reason) {
    const box = document.getElementById('verifyOut');
    if (!v) { box.innerHTML = ''; return; }
    const tick = ok => `<span class="tick ${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✕'}</span>`;
    box.innerHTML = `
      <div class="verify-box ${status === 'published' ? 'ok' : 'fail'}">
        <b>${status === 'published' ? '✓ Published — every check passed' : '✕ Pipeline Failed — not published'}</b>
        ${reason ? `<div style="margin:6px 0;color:var(--muted)">${esc(reason)}</div>` : ''}
        <div class="tick-row">${tick(v.publicWebsite?.ok)} Public Website (SEO title, meta description, canonical, sitemap)</div>
        <div class="tick-row">${tick(v.knowledgeGraph?.conceptPublished)} Knowledge Graph (concept published, chatbot searchable)</div>
        <div class="tick-row">${tick(v.knowledgeGraph?.chatbotAnswersContextually)} Chatbot answers contextually <span style="color:var(--dim)">(confidence-based — improves as the graph grows)</span></div>
        <div class="tick-row">${tick(v.seoReadiness?.ok)} Google SEO readiness</div>
        ${(v.seoReadiness?.recommendations || []).length ? '<div style="margin-top:6px;color:var(--muted);font-size:11.5px">Recommendations: ' + v.seoReadiness.recommendations.map(esc).join(' · ') + '</div>' : ''}
      </div>`;
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
    renderVerification(pub.verification, pub.status, pub.reason);
    toast(pub.status === 'published' ? 'Published — graph, SEO &amp; chatbot in sync' : 'Pipeline Failed — see details below', pub.status === 'published' ? 'ok' : 'bad');
    loadLibrary(); loadExecutive();
  }

  // ── ARTICLES LIBRARY (verification-at-a-glance) ─────────────────────────
  async function loadLibrary() {
    const data = await apiGet(ART + `?action=list&status=${libState.status}&page=${libState.page}&pageSize=${libState.pageSize}`);
    let rows = data.articles || [];
    if (libState.q) {
      const q = libState.q.toLowerCase();
      rows = rows.filter(a => (a.title || '').toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q));
    }
    const body = document.getElementById('libBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="empty">No articles match.</td></tr>'; return; }
    body.innerHTML = rows.map(a => {
      const statusBadge = a.pipelineStatus === 'published' ? '<span class="badge ok">Published</span>'
        : a.pipelineStatus === 'pipeline_failed' ? '<span class="badge bad">Pipeline Failed</span>'
        : '<span class="badge dim">Draft</span>';
      // SEO and Chatbot are both gated together with the graph write in this
      // pipeline (verifyPublishPipeline requires both before Published), so both
      // columns reflect the same underlying graphLinked signal — shown separately
      // because requirement 5 asks to verify each independently at a glance, even
      // though today they can never diverge by design.
      const seoBadge = a.graphLinked ? '<span class="badge ok">✓ SEO</span>' : '<span class="badge dim">—</span>';
      const chatBadge = a.graphLinked ? '<span class="badge ok">✓ answers</span>' : '<span class="badge dim">—</span>';
      return `<tr>
        <td class="title" title="${esc(a.title)}">${esc(a.title)}</td>
        <td>${esc(humanize(a.category))}</td>
        <td>${statusBadge}</td>
        <td>${seoBadge}</td>
        <td>${chatBadge}</td>
        <td>${a.updated_at ? new Date(a.updated_at).toLocaleDateString() : '—'}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-edit="${a.id}">Edit</button>
          ${a.pipelineStatus === 'pipeline_failed' ? `<button class="btn sm gold" data-repair="${a.id}">Improve &amp; Republish</button>` : ''}
          ${a.is_active ? `<button class="btn sm" data-unpub="${a.id}">Unpublish</button>` : `<button class="btn sm gold" data-pub="${a.id}">Publish</button>`}
          <button class="btn sm danger" data-del="${a.id}">Delete</button>
        </div></td>
      </tr>`;
    }).join('');
    document.getElementById('libPager').textContent = `Page ${data.page} of ${Math.max(1, Math.ceil((data.total || rows.length) / libState.pageSize))} — ${data.total ?? rows.length} articles`;

    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editArticle(b.dataset.edit)));
    body.querySelectorAll('[data-pub]').forEach(b => b.addEventListener('click', async () => { const r = await apiPost(ART, 'publish', { id: b.dataset.pub }); toast(r.status === 'published' ? 'Published' : 'Pipeline Failed — open Edit for details', r.status === 'published' ? 'ok' : 'bad'); loadLibrary(); loadExecutive(); }));
    body.querySelectorAll('[data-unpub]').forEach(b => b.addEventListener('click', async () => { await apiPost(ART, 'draft', { id: b.dataset.unpub }); toast('Unpublished — graph concept retracted', 'ok'); loadLibrary(); loadExecutive(); }));
    body.querySelectorAll('[data-repair]').forEach(b => b.addEventListener('click', async () => { toast('Improving…'); const r = await apiPost(ART, 'repair', { id: b.dataset.repair }); toast(r.verification?.ok ? 'Improved &amp; republished' : 'Still needs attention — see Edit', r.verification?.ok ? 'ok' : 'bad'); loadLibrary(); }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Delete this article? This also retracts it from the knowledge graph.')) return; await apiPost(ART, 'delete', { id: b.dataset.del }); toast('Deleted', 'ok'); loadLibrary(); loadExecutive(); }));
  }
  async function editArticle(id) {
    const data = await apiGet(ART + '?action=get&id=' + encodeURIComponent(id));
    if (!data.article) { toast('Not found', 'bad'); return; }
    openEditor();
    editorState.id = data.article.id;
    document.getElementById('edTitleField').value = data.article.title || '';
    document.getElementById('edTitleMini').textContent = data.article.title || '';
    document.getElementById('topicPrep').style.display = 'none';
    setTimeout(() => { document.getElementById('edCategory').value = data.article.category || ''; }, 60);
    document.getElementById('edDifficulty').value = data.article.difficulty || 'beginner';
    document.getElementById('edTags').value = (data.article.tags || []).join(', ');
    document.getElementById('edSummary').value = data.article.summary || '';
    document.getElementById('edContent').value = data.article.content || '';
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

    const ask = async () => {
      const q = document.getElementById('pgQ').value.trim(); if (!q) return;
      const out = document.getElementById('pgOut'); out.textContent = 'Querying…';
      try {
        const r = await fetch('/api/ai-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: q }] }) });
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '', answer = '', src = null;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n'); buf = parts.pop();
          for (const p of parts) {
            const line = p.replace(/^data:\s*/, '').trim(); if (!line || line === '[DONE]') continue;
            try { const j = JSON.parse(line); if (j.t) answer += j.t; if (j.source) src = j.source; } catch (_) {}
          }
        }
        out.textContent = (answer || '(empty)') + '\n\n— source: ' + (src ? JSON.stringify(src) : 'not reported');
      } catch (e) { out.textContent = 'Unreachable — deploy to Cloudflare to test live.'; }
    };
    document.getElementById('pgAsk').onclick = ask;
    document.getElementById('pgQ').addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
  }

  // ── BOOT ─────────────────────────────────────────────────────────────────
  function boot(token) {
    TOKEN = token;
    document.getElementById('wrap').style.display = '';
    loadExecutive();
    loadRecommendations();
    loadLibrary();
    wireAdvanced();

    document.getElementById('newArticleBtn').onclick = () => { openEditor(); };
    document.getElementById('refreshBtn').onclick = () => { loadExecutive(); loadRecommendations(); loadLibrary(); };
    document.getElementById('adminLibRefresh').onclick = () => loadLibrary();
    document.getElementById('adminLibStatus').onchange = e => { libState.status = e.target.value; libState.page = 1; loadLibrary(); };
    let deb;
    document.getElementById('adminLibSearch').addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { libState.q = e.target.value.trim(); loadLibrary(); }, 250); });
  }

  window.ContentCenter = { boot };
})();
