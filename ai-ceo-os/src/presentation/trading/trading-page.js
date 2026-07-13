// trading-page.js — Self Trading Excellence, Founder OS Restructure Step 2.
//
// Reuses /api/ceo/trading exactly as built (GET returns {rules, records,
// violations}; POST default = journal entry, POST {action:'violation'} =
// mistake log). This file only resequences rendering into the six-stage loop
// (weekly prep -> daily prep -> execution -> trade review -> mistake
// correction -> journal history) — no new endpoints, no schema change.
// Daily Preparation's markup is static (no live data yet), so it isn't
// touched here.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';

export async function initTradingPage() {
  const executionPanel = document.querySelector('[data-tab-panel="execution"]');
  if (!executionPanel) return;

  renderExecutionForm(executionPanel);
  wireLogTrade();

  await load();

  async function load() {
    try {
      const data = await getJson('/api/ceo/trading');
      renderWeeklyPrep(data.rules, data.violations);
      renderToday(data.records);
      renderReview(data.records, data.violations);
      renderMistakeCorrection(data.rules, data.violations);
      renderHistory(data.records);
    } catch (err) {
      const el = document.getElementById('tj-history-table');
      if (el) el.innerHTML = `<div class="ceo-alert ceo-alert-critical">Load fail: ${esc(err.message)}</div>`;
    }
  }

  // 1. Weekly Preparation — the rule set as reference, not an editor yet.
  function renderWeeklyPrep(rules, violations) {
    const panel = document.querySelector('[data-tab-panel="weekly-prep"] [data-section-body]');
    if (!panel) return;
    if (!rules || rules.length === 0) {
      panel.innerHTML = '<div class="ceo-empty-state"><h3>No rules defined yet</h3><p>Your versioned rule set (<code>trading_rules</code>) lives here.</p></div>';
      return;
    }
    const vByRule = {};
    for (const v of violations) vByRule[v.trading_rule_id] = (vByRule[v.trading_rule_id] || 0) + 1;
    panel.innerHTML = rules.map((r) => `
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
        <span class="ceo-badge ceo-badge-neutral">${esc(r.category || 'rule')}</span>
        <strong style="min-width: 12em;">${esc(r.title)}</strong>
        <span class="ceo-text-secondary" style="flex: 1; font-size: var(--ceo-font-size-sm);">${esc(r.description)}</span>
        <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${vByRule[r.id] || 0} violations</span>
      </div>`).join('');
  }

  // 3. Execution — quick-entry form.
  function renderExecutionForm(panel) {
    const body = panel.querySelector('[data-section-body]');
    body.innerHTML = `
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
         title="4 fields on purpose — blank-page fear is the enemy. Prices/size can be added later via corrections.">Sirf 4 cheezen — ⓘ</p>`;
  }

  function wireLogTrade() {
    executionPanel.addEventListener('click', async (e) => {
      if (e.target.id !== 'tj-save') return;
      const btn = e.target;
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
  }

  function renderToday(records) {
    const el = document.getElementById('tj-today');
    if (!el) return;
    const today = new Date().toISOString().slice(0, 10);
    const todays = records.filter((r) => (r.opened_at || '').slice(0, 10) === today);
    if (todays.length === 0) {
      el.innerHTML = '<div class="ceo-empty-state"><p>Aaj abhi tak koi trade nahin — pehli entry upar se karein.</p></div>';
      return;
    }
    el.innerHTML = recordsTable(todays);
  }

  // 4. Trade Review — compliance summary + recent trades.
  function renderReview(records, violations) {
    const summary = document.querySelector('[data-tab-panel="trade-review"] [data-section-body]');
    if (summary) {
      if (records.length === 0) {
        summary.innerHTML = '<div class="ceo-empty-state"><h3>Nothing to review yet</h3><p>Compliance rate and violation count appear here once trades are journaled.</p></div>';
      } else {
        const complianceRate = Math.round((1 - Math.min(violations.length, records.length) / records.length) * 100);
        summary.innerHTML = `
          <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap;">
            <div class="ceo-card" style="flex: 1; min-width: 160px; box-shadow: none; background: var(--ceo-surface-raised);">
              <div class="ceo-card-title">Trades logged</div>
              <div class="ceo-badge ceo-badge-neutral">${records.length}</div>
            </div>
            <div class="ceo-card" style="flex: 1; min-width: 160px; box-shadow: none; background: var(--ceo-surface-raised);">
              <div class="ceo-card-title">Violations</div>
              <div class="ceo-badge ${violations.length > 0 ? 'ceo-badge-warning' : 'ceo-badge-success'}">${violations.length}</div>
            </div>
            <div class="ceo-card" style="flex: 1; min-width: 160px; box-shadow: none; background: var(--ceo-surface-raised);">
              <div class="ceo-card-title">Approx. compliance</div>
              <div class="ceo-badge ceo-badge-neutral">${complianceRate}%</div>
            </div>
          </div>
          <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-3);">Process observation only — never trade advice.</p>`;
      }
    }
    const table = document.getElementById('tj-review-table');
    if (table) table.innerHTML = records.length ? recordsTable(records.slice(0, 15)) : '<div class="ceo-empty-state"><p>Pehli entry ka intezaar — journal se sab shuru hota hai.</p></div>';
  }

  // 5. Mistake Correction — violations + log-a-violation action per rule.
  function renderMistakeCorrection(rules, violations) {
    const panel = document.querySelector('[data-tab-panel="mistake-correction"] [data-section-body]');
    if (!panel) return;
    const ruleById = Object.fromEntries(rules.map((r) => [r.id, r]));
    const logRow = rules.map((r) => `
        <span class="ceo-flex ceo-items-center ceo-gap-2" style="display:inline-flex; margin: 0 var(--ceo-space-2) var(--ceo-space-2) 0;">
          <button class="ceo-btn ceo-btn-secondary" data-violate="${r.id}" title="Imandari discipline hai — violation log karna hi rule ko zinda rakhta hai">Log: ${esc(r.title)}</button>
        </span>`).join('');
    const list = violations.length === 0
      ? '<div class="ceo-empty-state"><h3>No violations logged</h3><p>Honesty is the discipline metric — logging a violation is what keeps the rule alive.</p></div>'
      : `<div style="overflow-x:auto;"><table class="ceo-table">
          <thead><tr><th>Date</th><th>Rule</th><th>Severity</th><th>Notes</th></tr></thead>
          <tbody>${violations.map((v) => `
            <tr><td>${esc((v.created_at || '').slice(0, 10))}</td>
            <td>${esc(ruleById[v.trading_rule_id]?.title || 'rule')}</td>
            <td><span class="ceo-badge ${v.severity === 'critical' ? 'ceo-badge-critical' : v.severity === 'major' ? 'ceo-badge-warning' : 'ceo-badge-neutral'}">${esc(v.severity)}</span></td>
            <td class="ceo-text-secondary">${esc(v.notes || '')}</td></tr>`).join('')}
          </tbody></table></div>`;
    panel.innerHTML = `<div style="margin-bottom: var(--ceo-space-4);">${rules.length ? logRow : ''}</div>${list}`;
    panel.querySelectorAll('[data-violate]').forEach((b) =>
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

  // 6. Journal History — full table.
  function renderHistory(records) {
    const el = document.getElementById('tj-history-table');
    if (!el) return;
    el.innerHTML = records.length ? recordsTable(records) : '<div class="ceo-empty-state"><p>Pehli entry ka intezaar — journal se sab shuru hota hai.</p></div>';
  }

  function recordsTable(records) {
    return `
      <div style="overflow-x:auto;"><table class="ceo-table">
        <thead><tr><th>Date</th><th>Instrument</th><th>Dir</th><th>Outcome</th><th>Notes</th></tr></thead>
        <tbody>${records.map((r) => `
          <tr><td>${esc((r.opened_at || '').slice(0, 10))}</td><td>${esc(r.instrument)}</td>
          <td>${esc(r.direction)}</td><td><span class="ceo-badge ${r.outcome === 'win' ? 'ceo-badge-success' : r.outcome === 'loss' ? 'ceo-badge-critical' : 'ceo-badge-neutral'}">${esc(r.outcome || 'open')}</span></td>
          <td class="ceo-text-secondary">${esc(r.notes || '')}</td></tr>`).join('')}
        </tbody></table></div>`;
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
