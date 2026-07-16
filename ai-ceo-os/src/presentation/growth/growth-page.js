// growth-page.js — Founder Growth System, Founder OS Restructure Step 2.
//
// Merges the former Clients + Growth + Retention-panel pages into one, split
// into exactly two sections: Acquisition (new IB clients — content engine +
// pre-activation directory) and Retention (existing IB clients — daily
// due-list + active-client directory). Reuses /api/ceo/clients,
// /api/ceo/retention, /api/ceo/growth exactly as built — no new endpoints,
// no schema change.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';

const ALL_STAGES = ['lead', 'qualified', 'onboarding', 'activated', 'engaged', 'at_risk', 'retained'];
const ACQUISITION_STAGES = ['lead', 'qualified', 'onboarding'];
const RETENTION_STAGES = ['activated', 'engaged', 'at_risk', 'retained'];
const CONTENT_FLOW = ['idea', 'production', 'published', 'evergreen', 'retired'];
// Mirrors mission.js's computeAcquisition impact rule exactly (production
// is near-complete investment = high; idea is not yet started = medium) —
// same signal, not a second invented scoring system.
const CONTENT_IMPACT = { idea: 'medium', production: 'high' };
const IMPACT_BADGE = { high: 'ceo-badge-critical', medium: 'ceo-badge-warning', low: 'ceo-badge-neutral' };

// Groups retention-stage clients into execution segments (Founder OS
// Restructure Step 4). Pure function, exported for QA. Membership is
// exclusive, checked in urgency order: a client due a milestone today is a
// Milestone client even if they're also high-equity — the segment answers
// "what does this client need TODAY", not "what type are they". Action/
// reason/outcome text is grounded in the seeded rules (retention templates,
// vip-rule, the medium_consistent audience card's "this pool feeds
// Champions", KPI keys from seed-01).
export function segmentRetention(clients, retention) {
  const pool = clients.filter((c) => RETENTION_STAGES.includes(c.stage));
  const due = new Map((retention.due || []).map((d) => [d.clientId, d]));
  const risk = new Map((retention.atRisk || []).map((a) => [a.clientId, a]));
  const dorm = new Map((retention.dormant || []).map((d) => [d.clientId, d]));
  const now = Date.now();

  const segments = {
    milestone: { label: 'Milestone clients', members: [], action: 'Send today’s milestone touch (template attached on each row above)', reason: 'A ladder checkpoint (Day 1/7/14/30/60/90) lands today', outcome: 'Milestones kept → 90-day survival stays on track (retention.survival_90d)' },
    sleeping: { label: 'Sleeping clients', members: [], action: 'Send the gentle check-in — zero guilt mechanics, door-open framing', reason: '14+ days of silence', outcome: 'Re-engagement counted in at-risk recovery (retention.at_risk_recovery)' },
    inactive: { label: 'Inactive clients', members: [], action: 'Dormant-checkpoint touch per the seeded template (community pull first, founder note for high-LTV only)', reason: 'Hit a 30/60/90/180-day dormancy checkpoint today', outcome: 'Dignity-preserving return path — or graceful dormancy, never deletion' },
    top: { label: 'Top performers', members: [], action: 'No touch due today — recognition stays on the VIP rhythm (quarterly 1:1, monthly review)', reason: 'High equity band, retained/engaged', outcome: 'VIP retention ~100% (seeded vip-rule benchmark)' },
    fresh: { label: 'New clients', members: [], action: 'Watch first-week engagement — Day-1/7 touches arrive via the milestone ladder automatically', reason: 'Activated within the last 30 days', outcome: 'Survive the first weeks — the window where most churn happens' },
    highPotential: { label: 'High potential', members: [], action: 'Class/challenge invite at the next natural touch — this pool feeds Champions', reason: 'Medium equity, consistently engaged', outcome: 'Identity progression: consistent trader → higher equity follows' },
  };

  for (const c of pool) {
    if (due.has(c.id)) { segments.milestone.members.push({ ...c, detail: due.get(c.id).label }); continue; }
    if (risk.has(c.id)) { segments.sleeping.members.push({ ...c, detail: `${risk.get(c.id).silentDays}d silent` }); continue; }
    if (dorm.has(c.id)) { segments.inactive.members.push({ ...c, detail: `${dorm.get(c.id).checkpoint}d checkpoint` }); continue; }
    if (c.equity_band === 'high') { segments.top.members.push(c); continue; }
    const ageDays = c.created_at ? Math.floor((now - new Date(c.created_at).getTime()) / 86400000) : null;
    if (ageDays !== null && ageDays <= 30) { segments.fresh.members.push({ ...c, detail: `${ageDays}d in` }); continue; }
    if (c.equity_band === 'medium' && (c.stage === 'engaged' || c.stage === 'retained')) { segments.highPotential.members.push(c); continue; }
    // Steady clients with nothing due today deliberately don't get a segment
    // card — no action exists for them, and inventing one would be noise.
  }
  return segments;
}

// --- Content Production Engine meta tag (Step 5) ----------------------
//
// The schema is frozen (no country/language/hook/keyword/CTA columns on
// content_library), so a topic's execution context rides in the existing
// notes column as one parse-safe tag — the same pattern db.js established
// for daily_activities exec state. Legacy seed notes ("ur | discover | ...")
// have no tag and pass through parseContentMeta untouched as free text, so
// the 40 seeded ideas render exactly as before. Exported pure for QA.
export function buildContentMeta(fields) {
  const parts = Object.entries(fields || {})
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim().slice(0, 120))}`);
  return parts.length ? `#META#${parts.join(';')}#` : '';
}

export function parseContentMeta(notes) {
  const raw = String(notes || '');
  const m = /#META#(.*?)#/.exec(raw);
  const free = raw.replace(/ ?#META#.*?#/, '').trim();
  if (!m) return { meta: {}, free };
  const meta = {};
  for (const kv of m[1].split(';')) {
    const i = kv.indexOf('=');
    if (i > 0) meta[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  return { meta, free };
}

export async function initGrowthPage() {
  const root = document.getElementById('ceo-growth-tabs-group');
  if (!root) return;

  renderAddLeadForm();
  renderAddIdeaForm();
  wireAddLead();
  wireAddIdea();

  await load();

  async function load() {
    try {
      const [clients, retention, growth, physical] = await Promise.all([
        getJson('/api/ceo/clients'),
        getJson('/api/ceo/retention'),
        getJson('/api/ceo/growth'),
        getJson('/api/ceo/institutes').catch((e) => ({ _error: e.message })),
      ]);
      renderFunnel(clients.stageCounts);
      renderProspects(clients.clients);
      renderRetained(clients.clients);
      renderRetentionToday(retention);
      renderSegments(clients.clients, retention);
      renderContentKanban(growth.content);
      renderTasks(growth.tasks);
      renderCampaigns(growth.campaigns);
      renderPhysicalEngine(physical);
    } catch (err) {
      document.getElementById('gr-funnel').innerHTML =
        `<div class="ceo-alert ceo-alert-critical">Load fail: ${esc(err.message)}</div>`;
    }
  }

  // --- Acquisition ---------------------------------------------------

  function renderAddLeadForm() {
    document.getElementById('gr-add-lead').innerHTML = `
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap;">
        <input class="ceo-input" id="gr-name" placeholder="Full name" style="min-width: 12em;" />
        <input class="ceo-input" id="gr-phone" placeholder="WhatsApp (optional)" style="min-width: 10em;" />
        <select class="ceo-input" id="gr-stage" style="max-width: 10em;">
          ${ACQUISITION_STAGES.map((s) => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <input class="ceo-input" id="gr-referral" placeholder="Referral source (optional)" style="min-width: 10em;" />
        <button class="ceo-btn ceo-btn-primary" id="gr-add-client">Add</button>
      </div>`;
  }

  function wireAddLead() {
    document.getElementById('gr-add-client').addEventListener('click', async () => {
      const btn = document.getElementById('gr-add-client');
      btn.disabled = true;
      try {
        await postJson('/api/ceo/clients', {
          full_name: document.getElementById('gr-name').value,
          contact_phone: document.getElementById('gr-phone').value,
          stage: document.getElementById('gr-stage').value,
          referral_source: document.getElementById('gr-referral').value,
        });
        showToast('Lead added — pehla touch Day-1 voice note hai.', 'success');
        document.getElementById('gr-name').value = '';
        await load();
      } catch (err) {
        showToast('Add fail: ' + err.message, 'critical');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderFunnel(counts) {
    const el = document.getElementById('gr-funnel');
    el.innerHTML = ALL_STAGES.map((s) => {
      const n = counts?.[s] ?? 0;
      return `
        <div class="ceo-kanban-column">
          <div class="ceo-kanban-column-header">${label(s)}</div>
          ${n === 0 ? '<div class="ceo-kanban-empty">Empty</div>' : `<div class="ceo-kanban-empty">${n} client${n > 1 ? 's' : ''}</div>`}
        </div>`;
    }).join('');
  }

  function renderProspects(clients) {
    const el = document.getElementById('gr-prospects');
    const prospects = clients.filter((c) => ACQUISITION_STAGES.includes(c.stage));
    if (prospects.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Koi prospect nahin — pehla lead upar se add karein.</p></div>';
      return;
    }
    el.innerHTML = directoryTable(prospects, ACQUISITION_STAGES.concat(RETENTION_STAGES));
    wireDirectoryTable(el);
  }

  function renderContentKanban(byStatus) {
    const el = document.getElementById('gr-kanban');
    el.innerHTML = CONTENT_FLOW.map((status) => {
      const items = byStatus?.[status] || [];
      return `
        <div class="ceo-kanban-column">
          <div class="ceo-kanban-column-header">${status[0].toUpperCase() + status.slice(1)} (${items.length})</div>
          ${items.length === 0 ? '<div class="ceo-kanban-empty">Empty</div>' : items.map((c) => {
            const { meta, free } = parseContentMeta(c.notes);
            const detail = [meta.hook && `Hook: ${meta.hook}`, meta.kw && `Keyword: ${meta.kw}`, meta.cta && `CTA: ${meta.cta}`, free].filter(Boolean).join(' · ');
            const next = nextContentStatus(status);
            return `
            <div class="ceo-card" style="box-shadow: none; background: var(--ceo-surface-raised); padding: var(--ceo-space-3); margin-bottom: var(--ceo-space-2);">
              <div style="font-size: var(--ceo-font-size-sm);" title="${esc(detail)}">${esc(c.title)}${detail ? ' <span class="ceo-text-muted">ⓘ</span>' : ''}</div>
              <div class="ceo-flex ceo-gap-2" style="margin-top: var(--ceo-space-2); flex-wrap: wrap;">
                ${CONTENT_IMPACT[status] ? `<span class="ceo-badge ${IMPACT_BADGE[CONTENT_IMPACT[status]]}" style="font-size: 0.7em;">${CONTENT_IMPACT[status]}</span>` : ''}
                <span class="ceo-badge ceo-badge-neutral" style="font-size: 0.7em;">${esc(c.pillar || '')}</span>
                ${meta.lang ? `<span class="ceo-badge ceo-badge-neutral" style="font-size: 0.7em;">${esc(meta.lang)}</span>` : ''}
                ${meta.country ? `<span class="ceo-badge ceo-badge-neutral" style="font-size: 0.7em;">${esc(meta.country)}</span>` : ''}
                ${meta.platform ? `<span class="ceo-badge ceo-badge-neutral" style="font-size: 0.7em;">${esc(meta.platform)}</span>` : ''}
                ${next ? `<button class="ceo-btn ceo-btn-secondary" style="font-size: 0.75em; padding: 2px 8px;" data-move="${c.id}" data-to="${next}" ${next === 'published' ? 'title="Repurposing chain: GEO article ≤48h + 3–5 clips + distribution — one effort, six surfaces"' : ''}>→ ${next}</button>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>`;
    }).join('');
    el.querySelectorAll('[data-move]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await postJson('/api/ceo/growth', { action: 'move', id: b.getAttribute('data-move'), status: b.getAttribute('data-to') });
          showToast('Moved. Live publish hamesha warehouse workflow se — OS sirf status track karta hai.', 'info');
          await load();
        } catch (err) {
          showToast('Move fail: ' + err.message, 'critical');
          b.disabled = false;
        }
      })
    );
  }

  function nextContentStatus(status) {
    const i = CONTENT_FLOW.indexOf(status);
    return i >= 0 && i < CONTENT_FLOW.length - 1 ? CONTENT_FLOW[i + 1] : null;
  }

  function renderAddIdeaForm() {
    // Datalists suggest the locked seed tokens but values stay free text —
    // if founder-approved research adds a market/language/platform later,
    // the engine accepts it with zero code change (data-driven rule).
    document.getElementById('gr-add-idea').innerHTML = `
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap;">
        <input class="ceo-input" id="gr-title" placeholder="Topic title" style="flex: 1; min-width: 16em;" />
        <select class="ceo-input" id="gr-pillar" style="max-width: 11em;">
          <option value="fundamentals">Fundamentals</option><option value="gold_btc">Gold/BTC</option>
          <option value="psychology">Risk/Psychology</option><option value="legitimacy">Legitimacy/Trust</option>
          <option value="comparison">Comparison/Broker</option><option value="advanced">Advanced</option>
        </select>
        <select class="ceo-input" id="gr-format" style="max-width: 10em;">
          <option value="video+article">Video + article</option><option value="video">Video</option>
          <option value="article">Article</option><option value="clips">Clips/short-form</option>
        </select>
      </div>
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap; margin-top: var(--ceo-space-3);">
        <input class="ceo-input" id="gr-lang" list="gr-lang-list" placeholder="Language (ur)" style="max-width: 8em;" />
        <datalist id="gr-lang-list"><option value="ur"></option><option value="en"></option><option value="ar"></option><option value="bn"></option></datalist>
        <input class="ceo-input" id="gr-country" list="gr-country-list" placeholder="Country (pk)" style="max-width: 8em;" />
        <datalist id="gr-country-list"><option value="pk"></option><option value="gcc"></option><option value="ng"></option><option value="ke"></option><option value="bd"></option><option value="eg"></option></datalist>
        <input class="ceo-input" id="gr-platform" list="gr-platform-list" placeholder="Platform" style="max-width: 9em;" />
        <datalist id="gr-platform-list"><option value="youtube"></option><option value="telegram"></option><option value="whatsapp"></option><option value="facebook"></option><option value="website"></option><option value="tiktok"></option><option value="instagram"></option><option value="shorts"></option><option value="linkedin"></option><option value="x"></option></datalist>
        <input class="ceo-input" id="gr-audience" placeholder="Audience (beginner-pk)" style="max-width: 11em;" />
        <input class="ceo-input" id="gr-keyword" placeholder="Keyword (SEO)" style="max-width: 11em;" />
      </div>
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap; margin-top: var(--ceo-space-3);">
        <input class="ceo-input" id="gr-hook" placeholder="Hook — the first 5 seconds" maxlength="120" style="flex: 1; min-width: 14em;" />
        <input class="ceo-input" id="gr-cta" placeholder="CTA (free course, never deposit)" maxlength="80" style="max-width: 16em;" />
        <input class="ceo-input" id="gr-note" placeholder="Founder note (optional)" maxlength="200" style="flex: 1; min-width: 10em;" />
        <button class="ceo-btn ceo-btn-primary" id="gr-add-idea-btn">Add topic</button>
      </div>
      <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);"
         title="Quality rule: a topic needs a real demand signal (search/chatbot logs) — no speculative topics. Schedule comes from day-types (production/publish), not per-card dates; per-item analytics is Future — track via published URL + weekly KPI entry.">Demand signal ke bina topic na dalen — ⓘ</p>`;
  }

  function wireAddIdea() {
    document.getElementById('gr-add-idea-btn').addEventListener('click', async () => {
      const btn = document.getElementById('gr-add-idea-btn');
      const val = (id) => document.getElementById(id).value;
      btn.disabled = true;
      try {
        const meta = buildContentMeta({
          lang: val('gr-lang'), country: val('gr-country'), platform: val('gr-platform'),
          hook: val('gr-hook'), kw: val('gr-keyword'), cta: val('gr-cta'),
        });
        const free = val('gr-note').trim();
        await postJson('/api/ceo/growth', {
          title: val('gr-title'),
          pillar: val('gr-pillar'),
          content_type: val('gr-format'),
          target_audience: val('gr-audience'),
          notes: `${meta}${free ? ' ' + free : ''}`.trim(),
        });
        showToast('Topic added at status=idea — full execution context saved.', 'success');
        ['gr-title', 'gr-hook', 'gr-keyword', 'gr-note'].forEach((id) => (document.getElementById(id).value = ''));
        await load();
      } catch (err) {
        showToast('Add fail: ' + err.message, 'critical');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderTasks(tasks) {
    const el = document.getElementById('gr-tasks');
    if (!tasks || tasks.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Koi open task nahin.</p></div>';
      return;
    }
    el.innerHTML = tasks.map((t) => `
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
        <span class="ceo-badge ceo-badge-neutral">${esc(t.status)}</span>
        <span style="flex: 1;">${esc(t.title)}</span>
        <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${esc(t.due_date || '')}</span>
      </div>`).join('');
  }

  function renderCampaigns(campaigns) {
    const el = document.getElementById('gr-campaigns');
    if (!campaigns || campaigns.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><h3>No campaigns yet</h3><p>Every campaign requires a forced evaluation step before it can be marked complete.</p></div>';
      return;
    }
    el.innerHTML = `
      <div style="overflow-x:auto;"><table class="ceo-table">
        <thead><tr><th>Channel</th><th>Name</th><th>Status</th><th>Start</th></tr></thead>
        <tbody>${campaigns.map((c) => `
          <tr><td>${esc(c.channel)}</td><td>${esc(c.name)}</td>
          <td><span class="ceo-badge ceo-badge-neutral">${esc(c.status)}</span></td>
          <td>${esc(c.start_date || '')}</td></tr>`).join('')}
        </tbody></table></div>`;
  }

  // --- Physical Growth Engine (institutes + 15-day area cycle) ----------

  const INSTITUTE_STAGES = ['cold_contact', 'proposal_sent', 'meeting', 'negotiation', 'accepted', 'rejected', 'classes_running', 'batch_complete', 'follow_up_later'];

  function renderPhysicalEngine(data) {
    const el = document.getElementById('gr-physical');
    if (!el) return;
    if (!data || data._error) {
      el.innerHTML = `<div class="ceo-empty-state"><p>Physical Expansion isn't set up yet — this is a one-time step for whoever manages your Founder OS account. Nothing to do here until then.</p></div>`;
      return;
    }
    const a = data.cycle?.assignment || {};
    let cycleHtml;
    if (!a.started) {
      cycleHtml = `
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
          <span class="ceo-text-secondary">Cycle not started. Queue (${esc(data.cycle?.city || '')}): ${esc((a.remaining || []).join(' → '))}</span>
          <button class="ceo-btn ceo-btn-primary" id="gr-phys-start">Start 15-day cycle (today = day 1 of ${esc((a.remaining || [])[0] || '')})</button>
        </div>`;
    } else if (a.exhausted) {
      cycleHtml = `
        <div class="ceo-alert ceo-alert-warning">Every scheduled area has had its cycle. Add more areas or start a new round from <a href="/ai-ceo-os/src/presentation/intelligence/index.html">Playbooks → Physical → Complete Plan</a> — areas never repeat automatically unless you add them back.</div>`;
    } else {
      cycleHtml = `
        <div class="ceo-flex ceo-items-center ceo-gap-4" style="flex-wrap: wrap;">
          <div>
            <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">Current area (${esc(data.cycle?.city || '')})</div>
            <div style="font-size: 1.3rem; font-weight: 700;">${esc(a.current)}</div>
          </div>
          <span class="ceo-badge ceo-badge-warning">${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left</span>
          <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">Done: ${a.done.length ? esc(a.done.join(', ')) : 'none'} · Next: ${esc(a.remaining[0] || '— queue ends')}</span>
        </div>`;
    }

    const due = data.followUpsDue || [];
    const dueHtml = due.length
      ? `<div class="ceo-alert ceo-alert-warning" style="margin-top: var(--ceo-space-3);">Follow-ups due: ${due.map((i) => `${esc(i.name)} (${esc(i.stage.replace(/_/g, ' '))})`).join(' · ')}</div>`
      : '';

    // Region view (Refinement Patch 5) — current/next/remaining REGIONS
    // (cities), not just areas, + an honestly-computed timeline (cycle days
    // x entries left, real config arithmetic, never a fabricated estimate).
    const r = data.cycle?.region;
    const regionHtml = (r && (r.currentRegion || r.remainingRegions?.length))
      ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);">
          Region: <strong>${esc(r.currentRegion || '—')}</strong>${r.nextRegion ? ` · Next region: <strong>${esc(r.nextRegion)}</strong>` : ''}${r.remainingRegions?.length ? ` · Remaining: ${esc(r.remainingRegions.join(', '))}` : ''}${Number.isFinite(r.estimatedDaysRemaining) ? ` · Est. ${r.estimatedDaysRemaining} days left in the current plan (${data.cycle.cycleDays}d/area × entries left)` : ''}
        </p>`
      : '';

    // Mentor hand-holding: this area's real pipeline numbers + the single
    // phase to push on now (coach-logic.pipelineSummary, from stage counts).
    const s = data.summary;
    const summaryHtml = (s && s.total > 0)
      ? `<div class="ceo-card" style="box-shadow: none; background: var(--ceo-surface-raised); margin-top: var(--ceo-space-3);">
          <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-2);">
            ${s.questions.map((q) => `<div><span class="ceo-text-muted" style="font-size: 0.72rem;">${esc(q.q)}</span><div style="font-weight: 700;">${q.a}</div></div>`).join('')}
          </div>
          ${s.focus ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: var(--ceo-space-2) 0 0 0;"><strong>Push now:</strong> ${esc(s.focus.label)}</p>` : ''}
        </div>`
      : '';

    // Negotiation coach — appears only when an institute is actually at a
    // negotiation-phase stage; the text is the seeded sales-template.
    const g = data.salesGuidance || {};
    const inNegotiation = (data.institutes || []).some((i) => ['proposal_sent', 'meeting', 'negotiation'].includes(i.stage));
    const negotiationHtml = (inNegotiation && (g.negotiation || g.objections))
      ? `<details class="ceo-card" style="box-shadow: none; background: var(--ceo-surface-raised); margin-top: var(--ceo-space-3);">
          <summary style="cursor: pointer; font-weight: 600;">Negotiation coach — you have institutes in the meeting/negotiation phase</summary>
          ${g.negotiation ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);"><strong>Strategy:</strong> ${esc(g.negotiation)}</p>` : ''}
          ${g.objections ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);"><strong>Objections:</strong> ${esc(g.objections)}</p>` : ''}
          ${g.follow_up ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);"><strong>Follow-up timing:</strong> ${esc(g.follow_up)}</p>` : ''}
        </details>`
      : '';

    const rows = data.institutes || [];
    const tableHtml = rows.length === 0
      ? '<div class="ceo-empty-state" style="margin-top: var(--ceo-space-3);"><p>Koi institute nahin — current area research se shuru karein (Playbooks → Physical mein search method hai).</p></div>'
      : `<div style="overflow-x:auto; margin-top: var(--ceo-space-3);"><table class="ceo-table">
          <thead><tr><th>Institute</th><th>Area</th><th>Stage</th><th>Next step</th><th>Follow-up</th><th>Batch end</th><th>Students</th></tr></thead>
          <tbody>${rows.map((i) => `
            <tr>
              <td title="${esc(i.notes || '')}">${esc(i.name)}${i.institute_type ? ` <span class="ceo-text-muted" style="font-size: 0.75rem;">(${esc(i.institute_type)})</span>` : ''}</td>
              <td class="ceo-text-secondary">${esc(i.area)}</td>
              <td><select class="ceo-input" data-inst-stage="${i.id}" style="min-width: 10em;">
                ${INSTITUTE_STAGES.map((s) => `<option value="${s}" ${s === i.stage ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
              </select></td>
              <td class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); max-width: 18em;">${esc(i.nextStep?.label || '')}</td>
              <td><input class="ceo-input" type="date" data-inst-followup="${i.id}" value="${esc(i.next_follow_up || '')}" style="min-width: 9em;" /></td>
              <td><input class="ceo-input" type="date" data-inst-batchend="${i.id}" value="${esc(i.batch_end_date || '')}" style="min-width: 9em;" /></td>
              <td><input class="ceo-input" type="number" min="0" data-inst-students="${i.id}" value="${i.students_registered ?? ''}" style="max-width: 6em;" /></td>
            </tr>`).join('')}
          </tbody></table></div>`;

    const formHtml = `
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap; margin-top: var(--ceo-space-4);">
        <input class="ceo-input" id="gr-inst-name" placeholder="Institute name" style="flex: 1; min-width: 12em;" />
        <input class="ceo-input" id="gr-inst-type" placeholder="Type (computer academy…)" style="max-width: 13em;" />
        <input class="ceo-input" id="gr-inst-area" placeholder="Area" value="${esc(a.current || '')}" style="max-width: 10em;" />
        <input class="ceo-input" id="gr-inst-phone" placeholder="Contact (optional)" style="max-width: 10em;" />
        <button class="ceo-btn ceo-btn-primary" id="gr-inst-add">Add institute</button>
      </div>`;

    // Editable execution order (Refinement Patch 4) — the founder's own
    // sequence, preserved exactly; reordering never regenerates the queue,
    // it only rewrites physical.area_queue's array order via reorder_queue.
    const queue = data.cycle?.queue || [];
    const orderHtml = queue.length === 0 ? '' : `
      <details style="margin-top: var(--ceo-space-3);">
        <summary style="cursor: pointer; font-weight: 600;">Execution order — ${queue.length} areas/regions <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">(edit freely; never auto-regenerated)</span></summary>
        <div id="gr-queue-order" style="margin-top: var(--ceo-space-2);">
          ${queue.map((name, i) => {
            const isDone = a.exhausted || i < (a.index ?? -1);
            const isRunning = !a.exhausted && i === a.index;
            const label = isDone ? 'Completed' : isRunning ? 'Running' : 'Pending';
            const cls = isDone ? 'ceo-badge-success' : isRunning ? 'ceo-badge-warning' : 'ceo-badge-neutral';
            return `
            <div class="ceo-flex ceo-items-center ceo-gap-2" style="padding: 2px 0;" data-queue-item="${esc(name)}">
              <span class="ceo-badge ${cls}" style="min-width: 4.5em; text-align: center;">${label}</span>
              <span style="flex: 1;">${esc(name)}</span>
              <button class="ceo-btn ceo-btn-secondary" data-queue-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move earlier">↑</button>
              <button class="ceo-btn ceo-btn-secondary" data-queue-down="${i}" ${i === queue.length - 1 ? 'disabled' : ''} title="Move later">↓</button>
            </div>`;
          }).join('')}
        </div>
      </details>`;

    el.innerHTML = cycleHtml + regionHtml + summaryHtml + dueHtml + negotiationHtml + orderHtml + tableHtml + formHtml;
    wirePhysicalEngine(el);
    wireQueueReorder(el, queue);
  }

  function wireQueueReorder(el, queue) {
    const submit = async (newOrder) => {
      try {
        await postJson('/api/ceo/institutes', { action: 'reorder_queue', order: newOrder });
        showToast('Execution order updated.', 'success');
        await load();
      } catch (err) {
        showToast('Reorder fail: ' + err.message, 'critical');
      }
    };
    el.querySelectorAll('[data-queue-up]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.getAttribute('data-queue-up'));
        if (i <= 0) return;
        const next = queue.slice();
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
        submit(next);
      })
    );
    el.querySelectorAll('[data-queue-down]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.getAttribute('data-queue-down'));
        if (i >= queue.length - 1) return;
        const next = queue.slice();
        [next[i + 1], next[i]] = [next[i], next[i + 1]];
        submit(next);
      })
    );
  }

  function wirePhysicalEngine(el) {
    el.querySelector('#gr-phys-start')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await postJson('/api/ceo/institutes', { action: 'start_cycle' });
        showToast('Cycle started — aaj day 1 hai. 15 din, ek area.', 'success');
        await load();
      } catch (err) {
        showToast('Start fail: ' + err.message, 'critical');
        e.target.disabled = false;
      }
    });
    el.querySelector('#gr-inst-add')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await postJson('/api/ceo/institutes', {
          name: document.getElementById('gr-inst-name').value,
          institute_type: document.getElementById('gr-inst-type').value,
          area: document.getElementById('gr-inst-area').value,
          contact_phone: document.getElementById('gr-inst-phone').value,
        });
        showToast('Institute added at cold contact.', 'success');
        await load();
      } catch (err) {
        showToast('Add fail: ' + err.message, 'critical');
        e.target.disabled = false;
      }
    });
    const patch = (id, fields, msg) =>
      postJson('/api/ceo/institutes', { action: 'update', id, ...fields })
        .then(() => showToast(msg, 'success'))
        .catch((err) => showToast('Update fail: ' + err.message, 'critical'));
    el.querySelectorAll('[data-inst-stage]').forEach((sel) =>
      sel.addEventListener('change', () => patch(sel.getAttribute('data-inst-stage'), { stage: sel.value }, `Stage: ${sel.value.replace(/_/g, ' ')}`))
    );
    el.querySelectorAll('[data-inst-followup]').forEach((inp) =>
      inp.addEventListener('change', () => patch(inp.getAttribute('data-inst-followup'), { next_follow_up: inp.value }, 'Follow-up set.'))
    );
    el.querySelectorAll('[data-inst-batchend]').forEach((inp) =>
      inp.addEventListener('change', () => patch(inp.getAttribute('data-inst-batchend'), { batch_end_date: inp.value }, 'Batch end set.'))
    );
    el.querySelectorAll('[data-inst-students]').forEach((inp) =>
      inp.addEventListener('change', () => patch(inp.getAttribute('data-inst-students'), { students_registered: inp.value }, 'Student count saved.'))
    );
  }

  // --- Retention -------------------------------------------------------

  function renderRetentionToday(r) {
    const el = document.getElementById('gr-retention');
    const rows = [
      ...r.due.map((d) => ({ badge: 'ceo-badge-critical', tag: 'due', name: d.name, label: d.label, tmpl: d.template, id: d.clientId, action: d.action })),
      ...r.atRisk.map((a) => ({ badge: 'ceo-badge-warning', tag: `${a.silentDays}d silent`, name: a.name, label: 'Gentle check-in', tmpl: a.template, id: a.clientId, action: 'atrisk_gentle' })),
      ...r.dormant.map((d) => ({ badge: 'ceo-badge-neutral', tag: `dormant ${d.checkpoint}d`, name: d.name, label: 'Dormant checkpoint', tmpl: d.template, id: d.clientId, action: `dormant_${d.checkpoint}` })),
    ];
    if (rows.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Aaj koi touch due nahin — sab clients ka haq ada hai.</p></div>';
      return;
    }
    el.innerHTML = rows.map((x) => `
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
        <span class="ceo-badge ${x.badge}">${esc(x.tag)}</span>
        <strong style="min-width: 9em;">${esc(x.name)}</strong>
        <span class="ceo-text-secondary" style="flex: 1; font-size: var(--ceo-font-size-sm);" title="${esc(x.tmpl || '')}">${esc(x.label)} ⓘ</span>
        <button class="ceo-btn ceo-btn-primary" data-done-touch="${x.id}" data-action="${esc(x.action)}">Done</button>
      </div>`).join('');
    el.querySelectorAll('[data-done-touch]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await postJson('/api/ceo/clients', {
            action: 'touch', client_id: b.getAttribute('data-done-touch'),
            touch_type: 'message', summary: b.getAttribute('data-action'),
          });
          showToast('Touch logged — trust ka sab se sasta sauda.', 'success');
          await load();
        } catch (err) {
          showToast('Fail: ' + err.message, 'critical');
          b.disabled = false;
        }
      })
    );
  }

  function renderSegments(clients, retention) {
    const el = document.getElementById('gr-segments');
    if (!el) return;
    const segments = segmentRetention(clients, retention);
    const cards = Object.values(segments).filter((s) => s.members.length > 0);
    if (cards.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Koi retention-stage client nahin — segments pehle activation ke baad banenge.</p></div>';
      return;
    }
    el.innerHTML = cards.map((s) => `
      <div style="padding: var(--ceo-space-3) 0; border-bottom: 1px solid var(--ceo-border);">
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
          <strong>${esc(s.label)}</strong>
          <span class="ceo-badge ceo-badge-neutral">${s.members.length}</span>
          <span class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);">${s.members.slice(0, 5).map((m) => esc(m.full_name) + (m.detail ? ` (${esc(m.detail)})` : '')).join(' · ')}${s.members.length > 5 ? ' …' : ''}</span>
        </div>
        <div class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-1);">
          <strong>Today:</strong> ${esc(s.action)}<br />
          <strong>Why:</strong> ${esc(s.reason)} · <strong>Expected outcome:</strong> ${esc(s.outcome)}
        </div>
      </div>`).join('');
  }

  function renderRetained(clients) {
    const el = document.getElementById('gr-retained-table');
    const retained = clients.filter((c) => RETENTION_STAGES.includes(c.stage));
    if (retained.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Abhi koi client activated nahin hua — funnel Acquisition tab mein hai.</p></div>';
      return;
    }
    el.innerHTML = directoryTable(retained, ALL_STAGES);
    wireDirectoryTable(el);
  }

  // --- Shared directory table (used by both Prospects and Retained) ----

  function directoryTable(clients, stageOptions) {
    return `
      <div style="overflow-x:auto;"><table class="ceo-table">
        <thead><tr><th>Name</th><th>Stage</th><th>Broker</th><th>Last touch</th><th></th></tr></thead>
        <tbody>${clients.map((c) => `
          <tr>
            <td>${esc(c.full_name)}</td>
            <td><select class="ceo-input" data-stage-for="${c.id}" style="min-width: 8em;">
              ${stageOptions.map((s) => `<option value="${s}" ${s === c.stage ? 'selected' : ''}>${label(s)}</option>`).join('')}
            </select></td>
            <td>${esc(c.broker || '')}</td>
            <td class="ceo-text-secondary">${c.last_touch ? esc(c.last_touch.occurred_at.slice(0, 10)) : '<em>none</em>'}</td>
            <td><button class="ceo-btn ceo-btn-secondary" data-touch-for="${c.id}">Log touch</button></td>
          </tr>`).join('')}
        </tbody></table></div>`;
  }

  function wireDirectoryTable(container) {
    container.querySelectorAll('[data-stage-for]').forEach((sel) =>
      sel.addEventListener('change', async () => {
        try {
          const res = await postJson('/api/ceo/clients', { action: 'stage', client_id: sel.getAttribute('data-stage-for'), stage: sel.value });
          if (!res.unchanged) showToast(`Stage: ${res.from} → ${res.to} (history logged)`, 'success');
          await load();
        } catch (err) {
          showToast('Stage change fail: ' + err.message, 'critical');
        }
      })
    );
    container.querySelectorAll('[data-touch-for]').forEach((b) =>
      b.addEventListener('click', async () => {
        const summary = prompt('Touch summary (1 line):') || '';
        if (!summary) return;
        try {
          await postJson('/api/ceo/clients', { action: 'touch', client_id: b.getAttribute('data-touch-for'), touch_type: 'note', summary });
          showToast('Touch logged.', 'success');
          await load();
        } catch (err) {
          showToast('Fail: ' + err.message, 'critical');
        }
      })
    );
  }

  function label(stage) {
    return stage.replace('_', ' ');
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
