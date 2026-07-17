// home.js — Home dashboard, rebuilt into exactly 3 sections (IB Growth,
// Physical Activity, Personal Trading), date-first: the founder picks a
// date, then that day's plan loads. Replaces the prior 12-section "Today's
// Mission" layout — see the AI CEO OS Home Dashboard Simplification plan.
//
// Data sources, unchanged contracts: GET /api/ceo/mission?date=YYYY-MM-DD
// (now date-aware — see mission.js), GET /api/ceo/institutes (Physical IB
// Expansion cycle, always "live now" — not date-scoped), GET
// /api/ceo/trading?date=YYYY-MM-DD (now returns a `checkin` field for the
// Personal Trading 5-question check-in). Done/Partial/Skip on IB Growth and
// Physical rows reuse the existing /api/ceo/activities contract untouched.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';
import { confirmDialog } from '../shared/components/confirm-dialog.js';
import { wireGlossary } from '../shared/glossary.js';

const TIER_BADGE = { 0: 'ceo-badge-critical', 1: 'ceo-badge-warning', 2: 'ceo-badge-neutral' };
const IMPACT_RANK = { high: 0, medium: 1, low: 2 };
const IMPACT_BADGE = { high: 'ceo-badge-critical', medium: 'ceo-badge-warning', low: 'ceo-badge-neutral' };
const SKIP_REASONS = [
  ['no_time', 'Waqt nahin'],
  ['blocked', 'Blocked'],
  ['avoided', 'Tal raha tha'],
  ['not_relevant', 'Relevant nahin'],
];
const PHYSICAL_CADENCE_KEY = 'daily.physical_outreach';
const HIDDEN_ON_HOME = new Set(['daily.core_block', 'daily.shutdown', PHYSICAL_CADENCE_KEY]);

export async function initHome() {
  const picker = document.getElementById('home-date-picker');
  const realToday = new Date().toISOString().slice(0, 10);
  picker.value = realToday;
  picker.addEventListener('change', () => loadDay(picker.value || realToday));
  wireLeaveButton(picker);
  wireResetButton(picker);
  await loadDay(picker.value);
}

// --- Leave Management (Section 2) ---------------------------------------
// Submit new leave (the backend answers needsConfirmation when work is still
// open before the leave starts), plus edit dates/reason and cancel any
// existing leave. The plan's leave-shifting is untouched — it re-derives from
// leave.periods on every read, so any edit/cancel re-shifts automatically.
let currentLeavePeriods = [];
// Micro-step checklist state (Section 4): steps by task key for the current
// render, and the viewed date (part of the per-step localStorage key so each
// day starts fresh — unchecked steps naturally return when the task recurs).
const stepData = {};
let currentViewDate = new Date().toISOString().slice(0, 10);

function stepKey(taskKey, i) { return `ceo-step:${currentViewDate}:${taskKey}:${i}`; }
function getStepState(taskKey, i) {
  try { return localStorage.getItem(stepKey(taskKey, i)) || 'open'; } catch { return 'open'; }
}
function setStepState(taskKey, i, s) {
  try { s === 'open' ? localStorage.removeItem(stepKey(taskKey, i)) : localStorage.setItem(stepKey(taskKey, i), s); } catch {}
}

// Fill every [data-step-list] container from stepData + saved state. Open
// steps render as actionable ☐ rows (mark done ☑ or Skip); done/skipped
// steps collapse into a summary with a Reset link.
function renderAllStepLists(root) {
  root.querySelectorAll('[data-step-list]').forEach((box) => renderStepList(box));
}
function renderStepList(box) {
  const taskKey = box.getAttribute('data-step-list');
  const steps = stepData[taskKey] || [];
  let doneN = 0, skipN = 0;
  const openRows = steps.map((text, i) => {
    const st = getStepState(taskKey, i);
    if (st === 'done') { doneN++; return ''; }
    if (st === 'skip') { skipN++; return ''; }
    return `
      <div class="ceo-flex ceo-items-center ceo-gap-2" data-step-i="${i}" style="padding: 2px 0; font-size: var(--ceo-font-size-sm);">
        <button class="ceo-btn ceo-btn-secondary" data-step-done title="Mark done" style="padding: 0 8px;">☐</button>
        <span style="flex: 1; min-width: 10em;">${escapeHtml(text)}</span>
        <button class="ceo-btn ceo-btn-secondary" data-step-skip title="Skip this step" style="padding: 0 8px; font-size: 0.72rem;">Skip</button>
      </div>`;
  }).join('');
  const summary = (doneN + skipN) > 0
    ? `<div class="ceo-text-muted" style="font-size: 0.72rem; margin-top: 2px;">✓ ${doneN} done${skipN ? ` · ⤫ ${skipN} skipped` : ''} · <a href="#" data-step-reset style="color: inherit; text-decoration: underline;">reset</a></div>`
    : '';
  box.innerHTML = (openRows || (summary ? '' : '')) + summary;
  box.querySelectorAll('[data-step-done]').forEach((b) =>
    b.addEventListener('click', () => { setStepState(taskKey, Number(b.closest('[data-step-i]').getAttribute('data-step-i')), 'done'); renderStepList(box); }));
  box.querySelectorAll('[data-step-skip]').forEach((b) =>
    b.addEventListener('click', () => { setStepState(taskKey, Number(b.closest('[data-step-i]').getAttribute('data-step-i')), 'skip'); renderStepList(box); }));
  const reset = box.querySelector('[data-step-reset]');
  if (reset) reset.addEventListener('click', (e) => { e.preventDefault(); steps.forEach((_, i) => setStepState(taskKey, i, 'open')); renderStepList(box); });
  wireGlossary(box); // re-annotate: this box was just rebuilt
}

function wireLeaveButton(picker) {
  const btn = document.getElementById('home-leave-btn');
  const holder = document.getElementById('home-leave-form');
  btn.addEventListener('click', () => {
    if (holder.style.display !== 'none') { holder.style.display = 'none'; return; }
    holder.style.display = '';
    renderLeaveManager(holder, picker);
  });
}

function renderLeaveManager(holder, picker) {
  const existing = currentLeavePeriods.length
    ? currentLeavePeriods.map((p) => `
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap; padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border);" data-leave-index="${p.index}">
          <input class="ceo-input" type="date" data-edit-start value="${escapeAttr(p.start)}" style="max-width: 11em;" />
          <span class="ceo-text-muted">→</span>
          <input class="ceo-input" type="date" data-edit-end value="${escapeAttr(p.end)}" style="max-width: 11em;" />
          <input class="ceo-input" data-edit-reason maxlength="200" value="${escapeAttr(p.reason || '')}" placeholder="Reason" style="flex: 1; min-width: 8em;" />
          <button class="ceo-btn ceo-btn-secondary" data-leave-save>Save</button>
          <button class="ceo-btn ceo-btn-destructive" data-leave-delete>Cancel leave</button>
        </div>`).join('')
    : '<p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin: 0;">No leave submitted yet.</p>';

  holder.innerHTML = `
    <div class="ceo-card">
      <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">Your leave</div>
      <div style="margin: var(--ceo-space-2) 0 var(--ceo-space-4);">${existing}</div>
      <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">Add leave</div>
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap; margin-top: var(--ceo-space-2);">
        <div class="ceo-field" style="margin: 0;"><label class="ceo-label">Start date</label><input class="ceo-input" type="date" id="leave-start" /></div>
        <div class="ceo-field" style="margin: 0;"><label class="ceo-label">End date</label><input class="ceo-input" type="date" id="leave-end" /></div>
        <div class="ceo-field" style="margin: 0; flex: 1; min-width: 12em;"><label class="ceo-label">Reason (optional)</label><input class="ceo-input" id="leave-reason" maxlength="200" placeholder="e.g. family, travel, weekend" /></div>
        <button class="ceo-btn ceo-btn-primary" id="leave-submit" style="align-self: end;">Submit</button>
      </div>
      <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin: var(--ceo-space-2) 0 0;">Leave days get no tasks and never go overdue — the whole plan shifts forward automatically.</p>
    </div>`;
  holder.querySelector('#leave-submit').addEventListener('click', () => submitLeave(holder, picker));
  wireExistingLeaveActions(holder, picker);
}

function wireExistingLeaveActions(holder, picker) {
  holder.querySelectorAll('[data-leave-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-leave-index]');
      const index = Number(row.getAttribute('data-leave-index'));
      const start = row.querySelector('[data-edit-start]').value;
      const end = row.querySelector('[data-edit-end]').value;
      const reason = row.querySelector('[data-edit-reason]').value;
      if (!start || !end || start > end) { showToast('Start aur end date sahi chunein.', 'critical'); return; }
      btn.disabled = true;
      try {
        const res = await postJson('/api/ceo/activities', { action: 'update_leave', index, start_date: start, end_date: end, reason });
        showToast(res.coaching || 'Leave updated.', 'success');
        await loadDay(picker.value);
        renderLeaveManager(holder, picker);
      } catch (err) {
        btn.disabled = false;
        showToast('Update fail: ' + err.message, 'critical');
      }
    });
  });
  holder.querySelectorAll('[data-leave-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-leave-index]');
      const index = Number(row.getAttribute('data-leave-index'));
      const ok = await confirmDialog({
        title: 'Cancel this leave?',
        message: 'The plan will stop shifting around these dates and resume normal scheduling.',
        confirmLabel: 'Cancel leave',
        destructive: true,
      });
      if (!ok) return;
      try {
        const res = await postJson('/api/ceo/activities', { action: 'delete_leave', index });
        showToast(res.coaching || 'Leave cancelled.', 'success');
        await loadDay(picker.value);
        renderLeaveManager(holder, picker);
      } catch (err) {
        showToast('Cancel fail: ' + err.message, 'critical');
      }
    });
  });
}

async function submitLeave(holder, picker, priorComplete) {
  const start = holder.querySelector('#leave-start').value;
  const end = holder.querySelector('#leave-end').value;
  const reason = holder.querySelector('#leave-reason').value;
  if (!start || !end || start > end) {
    showToast('Start aur end date sahi chunein.', 'critical');
    return;
  }
  try {
    const body = { action: 'submit_leave', start_date: start, end_date: end, reason };
    if (typeof priorComplete === 'boolean') body.prior_complete = priorComplete;
    const res = await postJson('/api/ceo/activities', body);
    if (res.needsConfirmation) {
      const yes = await confirmDialog({
        title: 'Was this activity completed?',
        message: `${res.pendingCount} task(s) from before the leave (last: ${res.lastPendingDate}) are still open. "Yes" marks them completed and you continue fresh after leave; "Cancel" means No — they stay as your resume point after leave.`,
        confirmLabel: 'Yes — completed',
      });
      return submitLeave(holder, picker, yes);
    }
    holder.style.display = 'none';
    showToast(res.coaching || 'Leave saved.', 'success');
    loadDay(picker.value);
  } catch (err) {
    showToast('Leave save fail: ' + err.message, 'critical');
  }
}

// --- Reset Plan (Section 3) ----------------------------------------------
function wireResetButton(picker) {
  document.getElementById('home-reset-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset the entire plan?',
      message: 'The complete execution roadmap restarts from Day 1 — today becomes Day 1, the yearly IB Growth plan and the Physical IB Expansion cycle both regenerate from today, and every old pending task is closed out. This cannot be undone.',
      confirmLabel: 'Reset — today is Day 1',
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await postJson('/api/ceo/activities', { action: 'reset_plan' });
      showToast(res.coaching || 'Plan reset.', 'success');
      const realToday = new Date().toISOString().slice(0, 10);
      picker.value = realToday;
      loadDay(realToday);
    } catch (err) {
      showToast('Reset fail: ' + err.message, 'critical');
    }
  });
}

async function loadDay(date) {
  const realToday = new Date().toISOString().slice(0, 10);
  let m = null;
  try {
    m = await getJson('/api/ceo/mission?date=' + encodeURIComponent(date));
    document.getElementById('home-mentor-line').textContent = m.mentorMessage || '';
    currentLeavePeriods = m.leavePeriods || [];
    currentViewDate = date;
    const banner = document.getElementById('home-leave-banner');
    banner.innerHTML = m.leave?.onLeave
      ? `<div class="ceo-alert ceo-alert-warning" style="margin-bottom: var(--ceo-space-4);">On leave ${escapeHtml(m.leave.start)} → ${escapeHtml(m.leave.end)}${m.leave.reason ? ' (' + escapeHtml(m.leave.reason) + ')' : ''} — no tasks scheduled; the plan has shifted forward.</div>`
      : '';
  } catch (err) {
    document.getElementById('home-mentor-line').textContent = '';
    document.getElementById('home-ib-growth').innerHTML =
      `<div class="ceo-alert ceo-alert-critical">Plan load nahin hui: ${escapeHtml(err.message)}. Refresh karein.</div>`;
  }
  if (m) {
    renderIbGrowth(m);
  }

  // Physical + Trading are separate fetches — either one failing must never
  // take down the other two sections (matches the old physical-nudge
  // isolation pattern: the institutes endpoint may 500 pre-migration).
  try {
    const institutes = await getJson('/api/ceo/institutes');
    renderPhysical(institutes, m, date === realToday);
  } catch (err) {
    document.getElementById('home-physical').innerHTML =
      `<div class="ceo-empty-state"><p>Physical Growth Engine load nahin hua.</p></div>`;
  }

  try {
    const trading = await getJson('/api/ceo/trading?date=' + encodeURIComponent(date));
    renderTradingCheckin(trading, date);
  } catch (err) {
    document.getElementById('home-trading-checkin').innerHTML =
      `<div class="ceo-alert ceo-alert-critical">Trading check-in load nahin hui: ${escapeHtml(err.message)}.</div>`;
  }

  // Annotate every abbreviation now that all three sections have rendered.
  wireGlossary(document.querySelector('.ceo-content'));
}

// ============================================================
// 1) IB GROWTH — one flat, impact-ranked list: today's cadence tasks
//    (Not Started/Partial/Complete, via the same daily_activities pipeline)
//    interleaved with real acquisition/retention/attention actions
//    (Open -> deep-links into the Growth page, unchanged behavior there).
// ============================================================
function renderIbGrowth(m) {
  const el = document.getElementById('home-ib-growth');
  const cadenceItems = [...(m.top || []), ...(m.rest || []), ...(m.overdue || []), ...(m.done || [])]
    .filter((t) => !HIDDEN_ON_HOME.has(t.key));

  // Date-first execution: a date with no stored rows (any past day never
  // opened, or any future day) shows its deterministic roadmap day —
  // exactly what the Complete Plan holds for that date, leave-shifted.
  if (cadenceItems.length === 0 && m.plannedDay) {
    const d = m.plannedDay;
    el.innerHTML = `
      <div class="ceo-alert" style="border: 1px solid var(--ceo-border); border-radius: var(--ceo-radius-sm); padding: var(--ceo-space-3); margin-bottom: var(--ceo-space-3);">
        <strong>Day ${d.day} of ${d.totalDays || 1825}</strong> · ${escapeHtml(d.stage)}
        <div class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: 2px;">Planned roadmap for this date — tasks become actionable (Done/Partial/Skip) on the day itself.</div>
      </div>
      <ul style="margin: 0; padding-left: 1.2em;">${d.activities.map((a) => `<li style="padding: 2px 0;">${escapeHtml(a)}</li>`).join('')}</ul>
      ${plannedCampaignsHtml(d.campaigns)}
      <div class="ceo-text-muted" style="font-size: 0.75rem; margin-top: var(--ceo-space-2);">
        Platform: ${escapeHtml(d.platform)} · ${escapeHtml(d.country)} · ${escapeHtml(d.language)}<br />
        Budget: ${escapeHtml(d.budget)} · Expected: ${escapeHtml(d.expectedResult)}${d.estimatedLoad ? '<br />Workload: ' + escapeHtml(d.estimatedLoad) : ''}
      </div>`;
    return;
  }

  // Outcome first: the tier+history-ranked top items (m.top) ARE today's
  // highest-impact 20% — rendered as their own opening block so the founder
  // starts with results, not a task list. Everything else is secondary.
  const topIds = new Set((m.top || []).map((t) => t.id));
  const highImpact = cadenceItems.filter((t) => topIds.has(t.id));
  const secondary = cadenceItems.filter((t) => !topIds.has(t.id));

  const rows = secondary.map((t) => ({
    impactRank: IMPACT_RANK[t.impact] ?? 1,
    kind: 'cadence',
    t,
  }));

  const a = m.growth?.acquisition;
  if (a) {
    if (a.nextIdea) rows.push(actionEntry(`Produce: ${a.nextIdea.title}`, a.nextIdea.impact));
    for (const p of a.inProduction || []) rows.push(actionEntry(`Finish producing: ${p.title}`, p.impact));
    for (const f of a.followUps || []) rows.push(actionEntry(`${f.label}: ${f.name}`, f.impact));
    for (const task of a.tasks || []) rows.push(actionEntry(task.title, task.impact));
  }
  const r = m.growth?.retention;
  if (r) {
    for (const d of r.due || []) rows.push(actionEntry(`${d.isTopPerformer ? '🏆 Congratulate: ' : ''}${d.label}: ${d.name}`, 'high', '#retention'));
    for (const risk of r.atRisk || []) rows.push(actionEntry(`Contact sleeping client: ${risk.name} (${risk.silentDays}d silent)`, 'high', '#retention'));
    for (const dm of r.dormant || []) rows.push(actionEntry(`Dormant checkpoint (${dm.checkpoint}d): ${dm.name}`, 'medium', '#retention'));
  }
  for (const att of m.attention || []) {
    rows.push(actionEntry(`Needs attention: ${att.name} — ${att.reason}`, 'high', '#retention'));
  }

  if (rows.length === 0 && highImpact.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Aaj ke liye koi IB Growth action nahin — seeds ya prospects check karein.</p></div>';
    return;
  }
  rows.sort((x, y) => x.impactRank - y.impactRank);
  const highImpactBlock = highImpact.length
    ? `<div style="border: 1px solid var(--ceo-border); border-radius: var(--ceo-radius-sm); padding: var(--ceo-space-3); margin-bottom: var(--ceo-space-4);">
        <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">🎯 Today's Highest Impact Activities (the 20%)</div>
        <div class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: 2px 0 var(--ceo-space-2);">These few produce most of today's business result — do them first; everything below is secondary.</div>
        ${highImpact.map((t) => taskRowHtml(t)).join('')}
      </div>`
    : '';
  const secondaryLabel = rows.length
    ? '<div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: var(--ceo-space-1);">Secondary — after the 20% is done</div>'
    : '';
  el.innerHTML = highImpactBlock + secondaryLabel + rows.map((row) => (row.kind === 'cadence' ? taskRowHtml(row.t) : row.html)).join('');
  wireTaskButtons(el.querySelectorAll('[data-task-id]'));
  renderAllStepLists(el);
}

// Full per-campaign execution detail for a planned (non-today) date — the
// same spec the Complete Plan shows, so any picked date is self-sufficient.
function plannedCampaignsHtml(campaigns) {
  if (!campaigns || !campaigns.length) return '';
  const field = (label, value) => value
    ? `<div><span class="ceo-text-muted">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>` : '';
  return `
    <details style="margin-top: var(--ceo-space-2);">
      <summary class="ceo-text-secondary" style="cursor: pointer; font-size: var(--ceo-font-size-sm);">📡 Campaign details (${campaigns.length}) — country, audience, budget, CTA, KPI</summary>
      <div class="ceo-card" style="margin-top: var(--ceo-space-2); font-size: 0.75rem;">
        ${campaigns.map((c) => `
          <div style="border-top: 1px solid var(--ceo-border); padding: var(--ceo-space-2) 0;">
            <div class="ceo-flex ceo-items-center ceo-gap-2" style="flex-wrap: wrap;">
              <strong>${escapeHtml(c.activity)}</strong>
              <span class="ceo-badge ${String(c.mode).toUpperCase().includes('PAID') ? 'ceo-badge-warning' : 'ceo-badge-neutral'}">${escapeHtml(c.mode)}</span>
              <span class="ceo-text-muted">${escapeHtml(c.platform)}</span>
            </div>
            ${field('Country', c.country)}
            ${field('Area / region', c.region)}
            ${field('Target audience', c.audience)}
            ${field('Audience interests', c.interests)}
            ${field('Language', c.language)}
            ${field('Objective', c.objective)}
            ${field('Budget', c.budget)}
            ${field('Campaign duration', c.duration)}
            ${field('CTA', c.cta)}
            ${field('KPI', c.kpi)}
            ${field('Expected result', c.expected)}
          </div>`).join('')}
      </div>
    </details>`;
}

function actionEntry(label, impact, hrefSuffix) {
  const key = impact || 'medium';
  const href = '/ai-ceo-os/src/presentation/growth/index.html' + (hrefSuffix || '');
  return {
    impactRank: IMPACT_RANK[key] ?? 1,
    kind: 'action',
    html: `
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
        <span class="ceo-badge ${IMPACT_BADGE[key] || 'ceo-badge-neutral'}">${cap(key)} impact</span>
        <span style="flex:1; min-width: 14em;">${escapeHtml(label)}</span>
        <a class="ceo-btn ceo-btn-secondary" href="${href}">Open</a>
      </div>`,
  };
}

// Shared row markup for any daily_activities-backed item (cadence tasks,
// the Physical checklist item) — Not Started/Partial/Complete via the exact
// same Done/Partial/Skip controls, now with full execution guidance
// (purpose, micro-steps, best time, expected outcome) so the founder never
// has to guess what "community touch" actually means today.
function taskRowHtml(t) {
  const label = t.key.replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');
  const isOpen = t.execState !== 'completed' && t.execState !== 'skipped';
  const controls = isOpen
    ? `<button class="ceo-btn ceo-btn-primary" data-act="completed">Done</button>
       <button class="ceo-btn ceo-btn-secondary" data-act="partial">Partial</button>
       <button class="ceo-btn ceo-btn-secondary" data-act="skipped">Skip</button>`
    : `<span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${t.note ? escapeHtml(t.note) : ''}</span>`;
  // Micro-step checklist (Section 4): each step is ☐ / ☑ / Skip, persisted
  // per day + task + step. Done/skipped steps drop out of the actionable list
  // (do-not-show-again for the day); unchecked steps return next day when the
  // task recurs. Rendered into a container filled by renderStepList().
  stepData[t.key] = t.steps || [];
  const steps = (t.steps || []).length
    ? `<div data-step-list="${escapeAttr(t.key)}" style="margin-top: var(--ceo-space-1);"></div>`
    : '';
  const metaLine = [
    t.bestTime ? `Best time: ${escapeHtml(t.bestTime)}` : '',
    t.outcomeLine ? `Expected: ${escapeHtml(t.outcomeLine)}` : (t.expectedOutcome ? `Moves: ${escapeHtml(t.expectedOutcome)}` : ''),
  ].filter(Boolean).join(' · ');
  return `
    <div style="padding: var(--ceo-space-3) 0; border-bottom: 1px solid var(--ceo-border);" data-task-id="${t.id}">
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
        ${t.daysOverdue ? `<span class="ceo-badge ceo-badge-critical">${t.daysOverdue}d overdue</span>` : ''}
        <span class="ceo-badge ${TIER_BADGE[t.tierRank] || 'ceo-badge-neutral'}">${escapeHtml(t.priority)}</span>
        ${execStateBadge(t.execState)}
        <strong style="flex: 1; min-width: 12em; text-transform: capitalize;">${escapeHtml(label)}</strong>
        <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${t.minutes}m${t.realMinutes ? ` (actual ${t.realMinutes}m)` : ''}</span>
        ${controls}
      </div>
      ${t.why ? `<div class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-1);">${escapeHtml(t.why)}</div>` : ''}
      ${steps}
      ${metaLine ? `<div class="ceo-text-muted" style="font-size: 0.75rem; margin-top: var(--ceo-space-1);">${metaLine}</div>` : ''}
      ${kitHtml(t.kit)}
    </div>`;
}

// Ready-to-use execution guide (Section 2) — collapsed by default so the
// list stays scannable; one click opens copy-ready questions, messages,
// scripts, CTAs, follow-ups, and mistakes to avoid.
function kitHtml(kit) {
  if (!kit) return '';
  const block = (title, content) => {
    if (!content) return '';
    const body = Array.isArray(content)
      ? `<ul style="margin: 2px 0 0; padding-left: 1.2em;">${content.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>`
      : `<div>${escapeHtml(content)}</div>`;
    return `<div style="margin-top: var(--ceo-space-2);"><strong style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">${title}</strong>${body}</div>`;
  };
  const targeting = [kit.platform, kit.country, kit.language].filter((x) => x && x !== '—').join(' · ');
  return `
    <details style="margin-top: var(--ceo-space-2);">
      <summary class="ceo-text-secondary" style="cursor: pointer; font-size: var(--ceo-font-size-sm);">📋 Full SOP — objective, scripts, CTA, checklists, risks</summary>
      <div class="ceo-card" style="margin-top: var(--ceo-space-2); font-size: var(--ceo-font-size-sm);">
        ${block('Objective', kit.objective)}
        ${targeting ? block('Where / who (platform · country · language)', targeting) : ''}
        ${block('Target audience', kit.audience)}
        ${block('Expected KPI', kit.kpi)}
        ${block('Recommended questions', kit.questions)}
        ${block('Recommended message', kit.message)}
        ${block('Recommended script', kit.script)}
        ${block('Recommended example', kit.example)}
        ${block('Recommended CTA', kit.cta)}
        ${block('Recommended follow-up', kit.followUp)}
        ${block('Mistakes to avoid', kit.mistakes)}
        ${block('Risks — and how to avoid each', kit.risks)}
        ${block('Quality checklist', kit.quality)}
        ${block('Completion checklist', kit.completion)}
        ${block('Recommended timing', kit.timing)}
        ${block('Expected result', kit.expected)}
        ${block('Next action', kit.nextAction)}
      </div>
    </details>`;
}

function execStateBadge(state) {
  if (state === 'completed') return '<span class="ceo-badge ceo-badge-success">Completed</span>';
  if (state === 'partial') return '<span class="ceo-badge ceo-badge-warning">Partially done</span>';
  if (state === 'skipped') return '<span class="ceo-badge ceo-badge-neutral">Skipped</span>';
  return '<span class="ceo-badge ceo-badge-neutral" style="opacity:0.6;">Not started</span>';
}

function wireTaskButtons(rows) {
  rows.forEach((row) => {
    const id = row.getAttribute('data-task-id');
    row.querySelectorAll('[data-act]').forEach((btn) =>
      btn.addEventListener('click', () => actionFlow(row, id, btn.getAttribute('data-act')))
    );
  });
}

function actionFlow(row, id, status) {
  if (row.querySelector('[data-act-form]')) return;
  const div = document.createElement('div');
  div.setAttribute('data-act-form', '');
  div.style.cssText = 'width:100%;display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;align-items:center;';

  if (status === 'skipped') {
    for (const [key, label] of SKIP_REASONS) {
      const b = document.createElement('button');
      b.className = 'ceo-btn ceo-btn-secondary';
      b.textContent = label;
      b.addEventListener('click', () => { div.remove(); act(row, id, 'skipped', { reason: key }); });
      div.appendChild(b);
    }
  } else {
    const minsInput = document.createElement('input');
    minsInput.className = 'ceo-input';
    minsInput.type = 'number';
    minsInput.placeholder = 'Real minutes (optional)';
    minsInput.style.maxWidth = '11em';
    const noteInput = document.createElement('input');
    noteInput.className = 'ceo-input';
    noteInput.placeholder = 'Note (optional)';
    noteInput.style.flex = '1';
    noteInput.style.minWidth = '10em';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'ceo-btn ceo-btn-primary';
    confirmBtn.textContent = status === 'completed' ? 'Confirm done' : 'Confirm partial';
    confirmBtn.addEventListener('click', () => {
      div.remove();
      act(row, id, status, { real_minutes: minsInput.value, note: noteInput.value });
    });
    div.append(minsInput, noteInput, confirmBtn);
  }
  row.appendChild(div);
}

async function act(row, id, status, extra) {
  try {
    const res = await postJson('/api/ceo/activities', { id, status, ...extra });
    if (status === 'completed' || status === 'skipped') {
      row.style.opacity = '0.55';
      row.querySelectorAll('[data-act]').forEach((b) => (b.disabled = true));
    }
    showToast(res.coaching || 'Ho gaya.', status === 'completed' ? 'success' : 'info');
  } catch (err) {
    showToast('Update fail hua: ' + err.message, 'critical');
  }
}

// ============================================================
// 2) PHYSICAL ACTIVITY — the Physical IB Expansion engine (institute/area
//    outreach cycle), rendered as a simple checklist rather than prose: one
//    Done/Partial/Skip row for today's outreach action, plus due follow-ups.
// ============================================================
function renderPhysical(institutes, m, isRealToday) {
  const el = document.getElementById('home-physical');
  const a = institutes.cycle?.assignment || {};
  const parts = [];

  const physicalTask = m
    ? [...(m.top || []), ...(m.rest || []), ...(m.overdue || []), ...(m.done || [])].find((t) => t.key === PHYSICAL_CADENCE_KEY)
    : null;

  let areaLine;
  if (!a.started && (a.remaining || []).length === 0) {
    areaLine = 'Cycle not started yet — start it on the Growth page.';
  } else if (!a.started) {
    areaLine = `Cycle not started. First area: <strong>${escapeHtml((a.remaining || [])[0] || '')}</strong>.`;
  } else if (a.exhausted) {
    areaLine = 'Area queue complete — schedule the next round on the Growth page.';
  } else {
    areaLine = `Current area: <strong>${escapeHtml(a.current)}</strong> (${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left).`;
  }
  parts.push(`<p class="ceo-text-secondary" style="margin: 0 0 var(--ceo-space-3) 0;">${areaLine}</p>`);

  if (physicalTask) {
    parts.push(taskRowHtml(physicalTask));
  } else {
    parts.push('<div class="ceo-empty-state"><p>Physical outreach cadence seed hone baaqi hai.</p></div>');
  }

  if (isRealToday) {
    const due = institutes.followUpsDue || [];
    if (due.length > 0) {
      parts.push(`<div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-top: var(--ceo-space-3);">Follow-ups due (${due.length})</div>`);
      parts.push(due.map((i) => `
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
          <span style="flex:1; min-width: 14em;">${escapeHtml(i.name)} <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">(${escapeHtml(i.area)})</span></span>
          <a class="ceo-btn ceo-btn-secondary" href="/ai-ceo-os/src/presentation/growth/index.html">Open</a>
        </div>`).join(''));
    }
  }

  parts.push(`<a class="ceo-btn ceo-btn-secondary" style="margin-top: var(--ceo-space-3);" href="/ai-ceo-os/src/presentation/growth/index.html">Open Physical Growth Engine</a>`);
  el.innerHTML = parts.join('');
  if (physicalTask) wireTaskButtons(el.querySelectorAll('[data-task-id]'));
  renderAllStepLists(el);
}

// ============================================================
// 3) PERSONAL TRADING — fixed 5-question daily check-in, stored per date;
//    recurring-weakness coaching is computed server-side (psychology-logic).
// ============================================================
function renderTradingCheckin(trading, date) {
  const el = document.getElementById('home-trading-checkin');
  const c = trading.checkin || {};

  const yesNo = (name, label, current) => `
    <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
      <span style="flex:1; min-width: 16em;">${escapeHtml(label)}</span>
      <label class="ceo-flex ceo-items-center ceo-gap-1"><input type="radio" name="${name}" value="true" ${current === true ? 'checked' : ''} /> Yes</label>
      <label class="ceo-flex ceo-items-center ceo-gap-1"><input type="radio" name="${name}" value="false" ${current === false ? 'checked' : ''} /> No</label>
    </div>`;

  const coachingLines = (c.coaching || []).map((line) =>
    `<div class="ceo-alert ceo-alert-warning" style="margin-bottom: var(--ceo-space-2);">🧠 ${escapeHtml(line)}</div>`
  ).join('');
  el.innerHTML = `
    ${coachingLines}
    ${yesNo('analyzed_chart', 'Did I analyze the charts today?', c.analyzed_chart)}
    ${yesNo('took_trade', 'Did I take any trade today?', c.took_trade)}
    ${yesNo('followed_rules', 'Did I follow my trading rules and risk management?', c.followed_rules)}
    <div class="ceo-field" style="margin-top: var(--ceo-space-3);">
      <label class="ceo-label" for="home-trading-weakness">What was today's biggest weakness?</label>
      <input class="ceo-input" id="home-trading-weakness" maxlength="500" value="${escapeAttr(c.weakness || '')}" placeholder="e.g. entered before confirmation" />
    </div>
    ${yesNo('avoided_repeat', 'Did I consciously avoid repeating that weakness today?', c.avoided_repeat)}
    <button class="ceo-btn ceo-btn-primary" id="home-trading-checkin-save" style="margin-top: var(--ceo-space-3);">Save check-in</button>
    <span id="home-trading-checkin-msg" class="ceo-text-muted" style="margin-left: var(--ceo-space-3); font-size: var(--ceo-font-size-sm);"></span>`;

  const radioVal = (name) => {
    const checked = el.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value === 'true' : null;
  };

  el.querySelector('#home-trading-checkin-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await postJson('/api/ceo/trading', {
        action: 'checkin',
        date,
        analyzed_chart: radioVal('analyzed_chart'),
        took_trade: radioVal('took_trade'),
        followed_rules: radioVal('followed_rules'),
        weakness: el.querySelector('#home-trading-weakness').value,
        avoided_repeat: radioVal('avoided_repeat'),
      });
      document.getElementById('home-trading-checkin-msg').textContent = 'Saved.';
      showToast((res.coaching && res.coaching[0]) || 'Check-in saved.', res.ok ? 'success' : 'info');
      // Refresh the coaching alerts with the just-saved history.
      const refreshed = { ...trading, checkin: { ...res.checkin, date, coaching: res.coaching || [], recurringWeakness: null } };
      renderTradingCheckin(refreshed, date);
    } catch (err) {
      showToast('Save fail: ' + err.message, 'critical');
    } finally {
      btn.disabled = false;
    }
  });
}

function cap(s) {
  s = String(s || '');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
