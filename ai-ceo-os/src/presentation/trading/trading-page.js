// trading-page.js — M2 wiring: journal quick-entry + records table into the
// "journal" panel; rules list into the "rules" panel. Other tabs keep their
// honest empty states until their features (review analytics, psychology
// patterns) are built — no fake implementations.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';

export async function initTradingPage() {
  const journalPanel = document.querySelector('[data-tab-panel="journal"]');
  const rulesPanel = document.querySelector('[data-tab-panel="rules"]');
  if (!journalPanel) return;

  journalPanel.innerHTML = `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-6);">
      <h3>New journal entry</h3>
      <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap;">
        <input class="ceo-input" id="tj-instrument" placeholder="Instrument (XAUUSD)" style="max-width: 10em;" />
        <select class="ceo-input" id="tj-direction" style="max-width: 8em;">
          <option value="long">Long</option><option value="short">Short</option>
        </select>
        <select class="ceo-input" id="tj-outcome" style="max-width: 9em;">
          <option value="open">Open</option><option value="win">Win</option>
          <option value="loss">Loss</option><option value="breakeven">Breakeven</option>
        </select>
        <input class="ceo-input" id="tj-notes" placeholder="Setup, reason, emotion — 1 line" style="flex: 1; min-width: 14em;" />
        <button class="ceo-btn ceo-btn-primary" id="tj-save">Log trade</button>
      </div>
      <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);"
         title="4 fields on purpose — blank-page fear is the enemy. Prices/size can be added later via corrections.">Sirf 4 cheezen — ⓘ</p>
    </div>
    <div class="ceo-card">
      <h3>Recent trades</h3>
      <div id="tj-table"><div class="ceo-skeleton" style="height: 6em;"></div></div>
    </div>`;

  document.getElementById('tj-save').addEventListener('click', async () => {
    const btn = document.getElementById('tj-save');
    btn.disabled = true;
    try {
      await postJson('/api/ceo/trading', {
        instrument: document.getElementById('tj-instrument').value,
        direction: document.getElementById('tj-direction').value,
        outcome: document.getElementById('tj-outcome').value,
        notes: document.getElementById('tj-notes').value,
      });
      showToast('Journal entry logged — spine barqarar.', 'success');
      document.getElementById('tj-instrument').value = '';
      document.getElementById('tj-notes').value = '';
      await load();
    } catch (err) {
      showToast('Save fail: ' + err.message, 'critical');
    } finally {
      btn.disabled = false;
    }
  });

  async function load() {
    try {
      const data = await getJson('/api/ceo/trading');
      renderRecords(data.records);
      renderRules(data.rules, data.violations);
    } catch (err) {
      document.getElementById('tj-table').innerHTML =
        `<div class="ceo-alert ceo-alert-critical">Load fail: ${esc(err.message)}</div>`;
    }
  }

  function renderRecords(records) {
    const el = document.getElementById('tj-table');
    if (records.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Pehli entry ka intezaar — journal se sab shuru hota hai.</p></div>';
      return;
    }
    el.innerHTML = `
      <div style="overflow-x:auto;"><table class="ceo-table">
        <thead><tr><th>Date</th><th>Instrument</th><th>Dir</th><th>Outcome</th><th>Notes</th></tr></thead>
        <tbody>${records.map((r) => `
          <tr><td>${esc((r.opened_at || '').slice(0, 10))}</td><td>${esc(r.instrument)}</td>
          <td>${esc(r.direction)}</td><td><span class="ceo-badge ${r.outcome === 'win' ? 'ceo-badge-success' : r.outcome === 'loss' ? 'ceo-badge-critical' : 'ceo-badge-neutral'}">${esc(r.outcome || 'open')}</span></td>
          <td class="ceo-text-secondary">${esc(r.notes || '')}</td></tr>`).join('')}
        </tbody></table></div>`;
  }

  function renderRules(rules, violations) {
    if (!rulesPanel) return;
    const vByRule = {};
    for (const v of violations) vByRule[v.trading_rule_id] = (vByRule[v.trading_rule_id] || 0) + 1;
    rulesPanel.innerHTML = `
      <div class="ceo-card">
        <h3>Trading rules <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);" title="Retiring a rule = is_active off; violations reference rules forever (no-hard-deletes)">ⓘ</span></h3>
        ${rules.map((r) => `
          <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
            <span class="ceo-badge ceo-badge-neutral">${esc(r.category || 'rule')}</span>
            <strong style="min-width: 12em;">${esc(r.title)}</strong>
            <span class="ceo-text-secondary" style="flex: 1; font-size: var(--ceo-font-size-sm);">${esc(r.description)}</span>
            <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${vByRule[r.id] || 0} violations</span>
            <button class="ceo-btn ceo-btn-secondary" data-violate="${r.id}" title="Imandari discipline hai — violation log karna hi rule ko zinda rakhta hai">Log violation</button>
          </div>`).join('')}
      </div>`;
    rulesPanel.querySelectorAll('[data-violate]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await postJson('/api/ceo/trading', { action: 'violation', trading_rule_id: b.getAttribute('data-violate') });
          showToast('Violation logged. Pattern hi asal ustad hai.', 'info');
          await load();
        } catch (err) {
          showToast('Fail: ' + err.message, 'critical');
        } finally {
          b.disabled = false;
        }
      })
    );
  }

  await load();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
