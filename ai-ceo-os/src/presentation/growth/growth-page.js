// growth-page.js — M4 wiring: content kanban from content_library (new idea +
// status moves; publishing to the live ZTU site stays a founder action through
// the warehouse workflow — this only tracks status) + campaigns table.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';

const FLOW = ['idea', 'production', 'published', 'evergreen', 'retired'];

export async function initGrowthPage() {
  const panel = document.querySelector('[data-tab-panel="content"]');
  const campaignsPanel = document.querySelector('[data-tab-panel="campaigns"]');
  if (!panel) return;

  panel.innerHTML = `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-6);">
      <h3>New idea</h3>
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap;">
        <input class="ceo-input" id="gr-title" placeholder="Topic title" style="flex: 1; min-width: 16em;" />
        <select class="ceo-input" id="gr-pillar" style="max-width: 12em;">
          <option value="fundamentals">Fundamentals</option><option value="gold_btc">Gold/BTC</option>
          <option value="psychology">Risk/Psychology</option><option value="legitimacy">Legitimacy/Trust</option>
          <option value="comparison">Comparison/Broker</option><option value="advanced">Advanced</option>
        </select>
        <button class="ceo-btn ceo-btn-primary" id="gr-add">Add idea</button>
      </div>
      <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);"
         title="Quality rule: a topic needs a real demand signal (search/chatbot logs) — no speculative topics.">Demand signal ke bina topic na dalen — ⓘ</p>
    </div>
    <div class="ceo-card">
      <h3>Content pipeline</h3>
      <div id="gr-kanban" class="ceo-kanban"><div class="ceo-skeleton" style="height: 10em; width: 100%;"></div></div>
    </div>`;

  document.getElementById('gr-add').addEventListener('click', async () => {
    const btn = document.getElementById('gr-add');
    btn.disabled = true;
    try {
      await postJson('/api/ceo/growth', {
        title: document.getElementById('gr-title').value,
        pillar: document.getElementById('gr-pillar').value,
      });
      showToast('Idea added at status=idea.', 'success');
      document.getElementById('gr-title').value = '';
      await load();
    } catch (err) {
      showToast('Add fail: ' + err.message, 'critical');
    } finally {
      btn.disabled = false;
    }
  });

  async function load() {
    try {
      const data = await getJson('/api/ceo/growth');
      renderKanban(data.content);
      renderCampaigns(data.campaigns);
    } catch (err) {
      document.getElementById('gr-kanban').innerHTML =
        `<div class="ceo-alert ceo-alert-critical">Load fail: ${esc(err.message)}</div>`;
    }
  }

  function renderKanban(byStatus) {
    const el = document.getElementById('gr-kanban');
    el.innerHTML = FLOW.map((status) => {
      const items = byStatus[status] || [];
      return `
        <div class="ceo-kanban-column">
          <div class="ceo-kanban-column-header">${status[0].toUpperCase() + status.slice(1)} (${items.length})</div>
          ${items.length === 0 ? '<div class="ceo-kanban-empty">Empty</div>' : items.map((c) => `
            <div class="ceo-card" style="box-shadow: none; background: var(--ceo-surface-raised); padding: var(--ceo-space-3); margin-bottom: var(--ceo-space-2);">
              <div style="font-size: var(--ceo-font-size-sm);" title="${esc(c.notes || '')}">${esc(c.title)}</div>
              <div class="ceo-flex ceo-gap-2" style="margin-top: var(--ceo-space-2); flex-wrap: wrap;">
                <span class="ceo-badge ceo-badge-neutral" style="font-size: 0.7em;">${esc(c.pillar || '')}</span>
                ${nextOf(status) ? `<button class="ceo-btn ceo-btn-secondary" style="font-size: 0.75em; padding: 2px 8px;" data-move="${c.id}" data-to="${nextOf(status)}">→ ${nextOf(status)}</button>` : ''}
              </div>
            </div>`).join('')}
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

  function nextOf(status) {
    const i = FLOW.indexOf(status);
    return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
  }

  function renderCampaigns(campaigns) {
    if (!campaignsPanel) return;
    if (!campaigns || campaigns.length === 0) return; // keep the built empty state
    campaignsPanel.innerHTML = `
      <div class="ceo-card">
        <h3>Campaigns</h3>
        <div style="overflow-x:auto;"><table class="ceo-table">
          <thead><tr><th>Channel</th><th>Name</th><th>Status</th><th>Start</th></tr></thead>
          <tbody>${campaigns.map((c) => `
            <tr><td>${esc(c.channel)}</td><td>${esc(c.name)}</td>
            <td><span class="ceo-badge ceo-badge-neutral">${esc(c.status)}</span></td>
            <td>${esc(c.start_date || '')}</td></tr>`).join('')}
          </tbody></table></div>
      </div>`;
  }

  await load();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
