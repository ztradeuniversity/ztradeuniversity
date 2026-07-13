// review-page.js — M7's first live wiring (Founder OS Step 5): the weekly
// and monthly numbers strips, rendered from GET /api/ceo/performance. Every
// figure is computed from real founder rows or manually-entered KPI values;
// a metric with no data says "no data yet" — nothing is projected. The
// structured review record flow (wins/problems/next-3, reviews table) stays
// a designed future step gated on the mentor.review_prefill automation.

import { getJson } from '../shared/api.js';

export async function initReviewPage() {
  const weeklyEl = document.getElementById('rv-weekly');
  const monthlyEl = document.getElementById('rv-monthly');
  if (!weeklyEl) return;
  try {
    const p = await getJson('/api/ceo/performance');
    renderWeekly(weeklyEl, p);
    renderMonthly(monthlyEl, p);
  } catch (err) {
    weeklyEl.innerHTML = `<div class="ceo-alert ceo-alert-critical">Performance load fail: ${esc(err.message)}</div>`;
    if (monthlyEl) monthlyEl.innerHTML = '';
  }
}

function renderWeekly(el, p) {
  const snapshots = (p.kpiSnapshots || []).map((k) =>
    stat(k.label, k.latest ? `${k.latest.value}${k.unit === 'percent' ? '%' : ''}` : null, k.previous ? `pichhli: ${k.previous.value}` : null)
  ).join('');
  el.innerHTML = `
    <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-4);">
      ${stat('Activations this week', String(p.activations?.thisWeek ?? 0), `pichhle hafte: ${p.activations?.lastWeek ?? 0}`)}
      ${stat('Execution quality (7d)', pct(p.executionQuality?.last7), 'Critical items completed')}
      ${stat('Consistency (7d)', pct(p.consistency?.last7), 'Days the daily anchor happened')}
      ${stat('Journal days (7d)', p.journalDays7 != null ? `${p.journalDays7}/7` : null, 'Days with a journal entry')}
      ${stat('Qualified leads', String(p.funnel?.qualifiedLeads ?? 0), 'stage = qualified')}
      ${stat('Active IB clients', String(p.funnel?.activeClients ?? 0), `at-risk: ${p.funnel?.atRisk ?? 0}`)}
      ${snapshots}
    </div>
    <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-3);">Only execution and client metrics — traffic and follower counts have no home here by design.</p>`;
}

function renderMonthly(el, p) {
  if (!el) return;
  el.innerHTML = `
    <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-4);">
      ${stat('Activations this month', String(p.activations?.thisMonth ?? 0), `pichhle mahine: ${p.activations?.lastMonth ?? 0}`)}
      ${stat('Execution quality (30d)', pct(p.executionQuality?.last30), 'Critical items completed')}
      ${stat('Consistency (30d)', pct(p.consistency?.last30), 'Days the daily anchor happened')}
      ${stat('Retention rate', snapshotValue(p, 'retention.survival_90d'), 'Manual entry until cohorts mature')}
    </div>`;
}

function snapshotValue(p, key) {
  const s = (p.kpiSnapshots || []).find((k) => k.key === key);
  return s?.latest ? `${s.latest.value}${s.unit === 'percent' ? '%' : ''}` : null;
}

function pct(v) {
  return v == null ? null : `${v}%`;
}

function stat(label, value, hint) {
  return `
    <div style="flex: 1; min-width: 170px;">
      <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">${esc(label)}</div>
      <div style="font-size: 1.4rem; font-weight: 700;">${value == null ? '<span class="ceo-text-muted" style="font-size: 0.9rem; font-weight: 400;">no data yet</span>' : esc(value)}</div>
      ${hint ? `<div class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${esc(hint)}</div>` : ''}
    </div>`;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
