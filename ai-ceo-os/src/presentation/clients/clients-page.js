// clients-page.js — M3 wiring: directory (add client, log touch, change stage)
// + the Retention Today panel (due touches / at-risk / dormant, 7-4 Task 8)
// rendered into the "directory" tab, kanban counts into "workflow".
// Approval queue stays an honest empty state until M6 automation exists.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';

const STAGES = ['lead', 'qualified', 'onboarding', 'activated', 'engaged', 'at_risk', 'retained'];

export async function initClientsPage() {
  const dir = document.querySelector('[data-tab-panel="directory"]');
  const workflow = document.querySelector('[data-tab-panel="workflow"]');
  if (!dir) return;

  dir.innerHTML = `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-6);">
      <h3>Retention today <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);" title="Milestone ladder + 14-day silence flags — max 5 each, LTV-ranked. ~15 min of the day's highest-trust work.">ⓘ</span></h3>
      <div id="cl-retention"><div class="ceo-skeleton" style="height: 4em;"></div></div>
    </div>
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-6);">
      <h3>Add client</h3>
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap;">
        <input class="ceo-input" id="cl-name" placeholder="Full name" style="min-width: 12em;" />
        <input class="ceo-input" id="cl-phone" placeholder="WhatsApp (optional)" style="min-width: 10em;" />
        <select class="ceo-input" id="cl-stage" style="max-width: 10em;">
          ${STAGES.map((s) => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <input class="ceo-input" id="cl-referral" placeholder="Referral source (optional)" style="min-width: 10em;" />
        <button class="ceo-btn ceo-btn-primary" id="cl-add">Add</button>
      </div>
    </div>
    <div class="ceo-card">
      <h3>Directory</h3>
      <div id="cl-table"><div class="ceo-skeleton" style="height: 6em;"></div></div>
    </div>`;

  document.getElementById('cl-add').addEventListener('click', async () => {
    const btn = document.getElementById('cl-add');
    btn.disabled = true;
    try {
      await postJson('/api/ceo/clients', {
        full_name: document.getElementById('cl-name').value,
        contact_phone: document.getElementById('cl-phone').value,
        stage: document.getElementById('cl-stage').value,
        referral_source: document.getElementById('cl-referral').value,
      });
      showToast('Client added — pehla touch Day-1 voice note hai.', 'success');
      document.getElementById('cl-name').value = '';
      await load();
    } catch (err) {
      showToast('Add fail: ' + err.message, 'critical');
    } finally {
      btn.disabled = false;
    }
  });

  async function load() {
    try {
      const [c, r] = await Promise.all([getJson('/api/ceo/clients'), getJson('/api/ceo/retention')]);
      renderRetention(r);
      renderDirectory(c.clients);
      renderWorkflow(c.stageCounts);
    } catch (err) {
      document.getElementById('cl-table').innerHTML =
        `<div class="ceo-alert ceo-alert-critical">Load fail: ${esc(err.message)}</div>`;
    }
  }

  function renderRetention(r) {
    const el = document.getElementById('cl-retention');
    const rows = [
      ...r.due.map((d) => ({ badge: 'ceo-badge-critical', tag: 'due', name: d.name, label: d.label, tmpl: d.template, id: d.clientId, action: d.action })),
      ...r.atRisk.map((a) => ({ badge: 'ceo-badge-warning', tag: `${a.silentDays}d silent`, name: a.name, label: 'Gentle check-in', tmpl: a.template, id: a.clientId, action: 'atrisk_gentle' })),
      ...r.dormant.map((d) => ({ badge: 'ceo-badge-neutral', tag: `dormant ${d.checkpoint}d`, name: d.name, label: 'Dormant checkpoint', tmpl: d.template, id: d.clientId, action: `dormant_${d.checkpoint}` })),
    ];
    if (rows.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Aaj koi touch due nahin — sab clients ka haq ada hai.</p></div>';
      return;
    }
    el.innerHTML = rows.map((x, i) => `
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

  function renderDirectory(clients) {
    const el = document.getElementById('cl-table');
    if (clients.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Pehla client add karein — real data hi asal shuruaat hai. Kabhi demo data nahin.</p></div>';
      return;
    }
    el.innerHTML = `
      <div style="overflow-x:auto;"><table class="ceo-table">
        <thead><tr><th>Name</th><th>Stage</th><th>Broker</th><th>Last touch</th><th></th></tr></thead>
        <tbody>${clients.map((c) => `
          <tr>
            <td>${esc(c.full_name)}</td>
            <td><select class="ceo-input" data-stage-for="${c.id}" style="min-width: 8em;">
              ${STAGES.map((s) => `<option value="${s}" ${s === c.stage ? 'selected' : ''}>${s}</option>`).join('')}
            </select></td>
            <td>${esc(c.broker || '')}</td>
            <td class="ceo-text-secondary">${c.last_touch ? esc(c.last_touch.occurred_at.slice(0, 10)) : '<em>none</em>'}</td>
            <td><button class="ceo-btn ceo-btn-secondary" data-touch-for="${c.id}">Log touch</button></td>
          </tr>`).join('')}
        </tbody></table></div>`;
    el.querySelectorAll('[data-stage-for]').forEach((sel) =>
      sel.addEventListener('change', async () => {
        try {
          const res = await postJson('/api/ceo/clients', { action: 'stage', client_id: sel.getAttribute('data-stage-for'), stage: sel.value });
          if (!res.unchanged) showToast(`Stage: ${res.from} → ${res.to} (history logged)`, 'success');
          renderAfterStageChange();
        } catch (err) {
          showToast('Stage change fail: ' + err.message, 'critical');
        }
      })
    );
    el.querySelectorAll('[data-touch-for]').forEach((b) =>
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
    async function renderAfterStageChange() {
      const c = await getJson('/api/ceo/clients');
      renderWorkflow(c.stageCounts);
    }
  }

  function renderWorkflow(counts) {
    if (!workflow) return;
    workflow.querySelectorAll('.ceo-kanban-column').forEach((col) => {
      const header = col.querySelector('.ceo-kanban-column-header');
      if (!header) return;
      const stage = header.textContent.trim().toLowerCase().replace(' ', '_');
      const n = counts[stage] ?? 0;
      let body = col.querySelector('.ceo-kanban-empty');
      if (body) body.textContent = n === 0 ? 'Empty' : `${n} client${n > 1 ? 's' : ''}`;
    });
  }

  await load();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
