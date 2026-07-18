// analytics-page.js — Growth Analytics Dashboard (intelligence layer).
//
// Reuses, never duplicates: GET /api/ceo/intelligence supplies the funnel,
// Pareto top/low, dimensions and executive summary (the Monthly AI Review's
// own engine) — rendered read-only here. GET /api/ceo/analytics supplies the
// NEW layer: daily capture, observation patterns, trends, and the
// approval-tracked recommendation queue. Nothing on this page mutates the
// planning engine; recommendations only change state when the founder clicks
// Accept / Reject / Remind Later.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';

let metricDefs = [];
// Set by loadAnalytics (from /api/ceo/analytics' own reset-aware gate) before
// loadReusedAnalytics ever renders, since initAnalyticsPage awaits the first
// call before firing the second — see loadReusedAnalytics below, which reuses
// this flag so the Monthly Review numbers it reads from /api/ceo/intelligence
// (deliberately NOT reset-scoped — it's a different, calendar-month page)
// never leak into the Growth Analytics cycle's "not enough data" state.
let notEnoughData = true;

export async function initAnalyticsPage() {
  const picker = document.getElementById('an-date');
  picker.value = new Date().toISOString().slice(0, 10);
  picker.addEventListener('change', () => loadAnalytics(picker.value));
  await loadAnalytics(picker.value);
  // The Monthly-Review analytics is date-independent (current month) — load once.
  loadReusedAnalytics();
}

async function loadAnalytics(date) {
  let a;
  try {
    a = await getJson('/api/ceo/analytics');
  } catch (err) {
    document.getElementById('an-recommendations').innerHTML =
      `<div class="ceo-alert ceo-alert-critical">Load fail: ${escapeHtml(err.message)}</div>`;
    return;
  }
  metricDefs = a.metricDefs || [];
  notEnoughData = !!a.notEnoughData;
  renderRecommendations(a.recommendations, a.accepted);
  renderPatterns(a.patterns);
  // Load the picked date's REAL entry (from the 30-day window the GET returns,
  // or today's dedicated row) so editing a past day never blanks/overwrites it.
  const entry = date === a.today ? a.todayEntry : (a.recentDaily || []).find((r) => r.entry_date === date) || null;
  renderDailyForm(entry, date);
  renderTrends(a.trends);
  renderProgress(a);
  renderPerformanceSummary(a);
}

// --- AI Recommendations (Accept / Reject / Remind Later) -----------------
const CAT_BADGE = { do_more: 'ceo-badge-success', stop: 'ceo-badge-critical', test: 'ceo-badge-warning', recurring: 'ceo-badge-success', remove: 'ceo-badge-neutral' };
const CAT_LABEL = { do_more: 'Do more', stop: 'Stop', test: 'Test next', recurring: 'Make recurring', remove: 'Reduce / remove' };
const PRIORITY_BADGE = { high: 'ceo-badge-critical', medium: 'ceo-badge-warning', low: 'ceo-badge-neutral' };
const PRIORITY_LABEL = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
const NOT_ENOUGH_DATA_HTML = '<div class="ceo-empty-state"><p>Not enough execution data yet.<br>Continue executing your new plan.<br>Growth Analytics will automatically become more accurate as additional activities are completed.</p></div>';

function renderRecommendations(recs, accepted) {
  const el = document.getElementById('an-recommendations');
  if ((!recs || recs.length === 0) && (!accepted || accepted.length === 0)) {
    el.innerHTML = NOT_ENOUGH_DATA_HTML;
    return;
  }
  const card = (r, isAccepted) => `
    <div class="ceo-card" style="box-shadow: none; background: var(--ceo-surface-raised); margin-bottom: var(--ceo-space-2);" data-rec="${escapeAttr(r.rec_key)}">
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
        <span class="ceo-badge ${CAT_BADGE[r.category] || 'ceo-badge-neutral'}">${CAT_LABEL[r.category] || r.category}</span>
        ${r.priority ? `<span class="ceo-badge ${PRIORITY_BADGE[r.priority] || 'ceo-badge-neutral'}">${PRIORITY_LABEL[r.priority] || r.priority}</span>` : ''}
        <strong style="flex: 1; min-width: 12em;">${escapeHtml(r.title)}</strong>
        ${isAccepted ? '<span class="ceo-badge ceo-badge-success">Accepted</span>' : ''}
      </div>
      <div class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-1);">${escapeHtml(r.detail)}</div>
      <div class="ceo-text-muted" style="font-size: 0.75rem; margin-top: 2px;">Why: ${escapeHtml(r.reason)}</div>
      ${r.impact ? `<div class="ceo-text-muted" style="font-size: 0.75rem;">Expected impact: ${escapeHtml(r.impact)}</div>` : ''}
      ${isAccepted ? '' : `
        <div class="ceo-flex ceo-gap-2" style="margin-top: var(--ceo-space-2); flex-wrap: wrap;">
          <button class="ceo-btn ceo-btn-primary" data-decide="accepted" style="font-size: 0.8em; padding: 2px 10px;">Accept</button>
          <button class="ceo-btn ceo-btn-secondary" data-decide="rejected" style="font-size: 0.8em; padding: 2px 10px;">Reject</button>
          <button class="ceo-btn ceo-btn-secondary" data-decide="remind_later" style="font-size: 0.8em; padding: 2px 10px;">Remind later</button>
        </div>`}
    </div>`;
  el.innerHTML =
    (recs || []).map((r) => card(r, false)).join('') +
    ((accepted && accepted.length)
      ? `<div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin: var(--ceo-space-3) 0 var(--ceo-space-1);">Accepted — apply these to your plan when ready</div>${accepted.map((r) => card(r, true)).join('')}`
      : '');
  el.querySelectorAll('[data-decide]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const recKey = btn.closest('[data-rec]').getAttribute('data-rec');
      const status = btn.getAttribute('data-decide');
      btn.closest('[data-rec]').style.opacity = '0.5';
      try {
        await postJson('/api/ceo/analytics', { action: 'decide', rec_key: recKey, status });
        showToast(status === 'accepted' ? 'Accepted — apply it to your plan when ready.' : status === 'rejected' ? 'Dismissed.' : 'Will remind you in 3 days.', 'success');
        loadAnalytics(document.getElementById('an-date').value);
      } catch (err) {
        showToast('Fail: ' + err.message, 'critical');
      }
    })
  );
}

// --- Observation patterns learned ----------------------------------------
function renderPatterns(patterns) {
  const el = document.getElementById('an-patterns');
  if (!patterns || patterns.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;">Themes learned from your observations (14 days)</div>` +
    patterns.map((p) => `
      <div class="ceo-flex ceo-items-center ceo-gap-2" style="padding: 2px 0; font-size: var(--ceo-font-size-sm);">
        <span class="ceo-badge ${p.isPattern ? 'ceo-badge-success' : 'ceo-badge-neutral'}">${p.count}×</span>
        <span style="flex: 1;">${escapeHtml(p.label)}</span>
        <span class="ceo-text-muted" style="font-size: 0.72rem;">${p.isPattern ? 'pattern — recommended' : 'watching (needs 3+)'}</span>
      </div>`).join('');
}

// --- Daily quick log ------------------------------------------------------
function renderDailyForm(entry, date) {
  const el = document.getElementById('an-daily-form');
  const m = entry?.metrics || {};
  const inputs = metricDefs.map((d) => `
    <div class="ceo-field" style="margin: 0;">
      <label class="ceo-label" style="font-size: 0.72rem;">${escapeHtml(d.label)}</label>
      <input class="ceo-input" type="number" min="0" step="any" data-metric="${escapeAttr(d.key)}" value="${m[d.key] ?? ''}" style="max-width: 9em;" />
    </div>`).join('');
  el.innerHTML = `
    <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap;">${inputs}</div>
    <div class="ceo-flex ceo-gap-3" style="flex-wrap: wrap; margin-top: var(--ceo-space-3);">
      <div class="ceo-field" style="margin: 0; flex: 1; min-width: 12em;"><label class="ceo-label">Today's wins</label><input class="ceo-input" id="an-wins" maxlength="1000" value="${escapeAttr(entry?.wins || '')}" placeholder="What worked" /></div>
      <div class="ceo-field" style="margin: 0; flex: 1; min-width: 12em;"><label class="ceo-label">Today's problems</label><input class="ceo-input" id="an-problems" maxlength="1000" value="${escapeAttr(entry?.problems || '')}" placeholder="What blocked" /></div>
    </div>
    <div class="ceo-field" style="margin: var(--ceo-space-3) 0 0;">
      <label class="ceo-label">Observation</label>
      <textarea class="ceo-input" id="an-observation" rows="2" maxlength="2000" placeholder="e.g. Contacted five institutes today; a business community generated many leads; a Reel format performed unusually well.">${escapeHtml(entry?.observation || '')}</textarea>
    </div>
    <button class="ceo-btn ceo-btn-primary" id="an-save" style="margin-top: var(--ceo-space-3);">Save ${date === new Date().toISOString().slice(0, 10) ? 'today' : escapeHtml(date)}</button>
    <span id="an-save-msg" class="ceo-text-muted" style="margin-left: var(--ceo-space-3); font-size: var(--ceo-font-size-sm);"></span>`;
  el.querySelector('#an-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const metrics = {};
    el.querySelectorAll('[data-metric]').forEach((inp) => { if (inp.value !== '') metrics[inp.getAttribute('data-metric')] = inp.value; });
    try {
      await postJson('/api/ceo/analytics', {
        action: 'save_daily', date,
        metrics,
        wins: el.querySelector('#an-wins').value,
        problems: el.querySelector('#an-problems').value,
        observation: el.querySelector('#an-observation').value,
      });
      showToast('Saved — the engine will learn from it.', 'success');
      loadAnalytics(date);
    } catch (err) {
      showToast('Save fail: ' + err.message, 'critical');
      btn.disabled = false;
    }
  });
}

// Multiple writers share #an-analytics — give each a stable sub-container
// once (removing the skeleton) so none clobbers another on reload.
function ensureAnalyticsBlocks() {
  const holder = document.getElementById('an-analytics');
  if (!document.getElementById('an-progress-block')) {
    holder.innerHTML =
      '<div id="an-progress-block"></div><div id="an-performance-block"></div><div id="an-trends-block"></div><div id="an-reused-block"></div>';
  }
}

// --- Overall Progress (Founder Decision Dashboard) ------------------------
const HEALTH_BADGE = { on_track: 'ceo-badge-success', slightly_behind: 'ceo-badge-warning', behind: 'ceo-badge-warning', critical: 'ceo-badge-critical' };

function renderProgress(data) {
  ensureAnalyticsBlocks();
  const block = document.getElementById('an-progress-block');
  if (data.notEnoughData) {
    block.innerHTML = NOT_ENOUGH_DATA_HTML;
    return;
  }
  const p = data.progress;
  block.innerHTML = `
    <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;">Overall Progress</div>
    <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; margin-bottom: var(--ceo-space-3);">
      <div style="min-width: 140px;"><div class="ceo-text-muted" style="font-size: 0.7rem;">Plan Completion</div><div style="font-weight: 700;">${p.completionPct}%</div></div>
      <div style="min-width: 140px;"><div class="ceo-text-muted" style="font-size: 0.7rem;">Remaining Work</div><div style="font-weight: 700;">${p.remainingPct}%</div></div>
      <div style="min-width: 140px;"><div class="ceo-text-muted" style="font-size: 0.7rem;">Execution Score</div><div style="font-weight: 700;">${p.executionScore}/100</div></div>
      <div style="min-width: 140px;"><div class="ceo-text-muted" style="font-size: 0.7rem;">Consistency Score</div><div style="font-weight: 700;">${p.consistencyScore ?? '—'}${p.consistencyScore !== null ? '%' : ''}</div></div>
      <div style="min-width: 140px;"><div class="ceo-text-muted" style="font-size: 0.7rem;">Plan Health</div><div><span class="ceo-badge ${HEALTH_BADGE[p.healthStatus] || 'ceo-badge-neutral'}">${escapeHtml(p.health)}</span></div></div>
    </div>
    <div class="ceo-alert" style="border: 1px solid var(--ceo-border); border-radius: var(--ceo-radius-sm); padding: var(--ceo-space-3);">
      <strong>Goal — 50,000 Active Clients:</strong> ${p.goal.progressPct}% there (${p.goal.activeClients} active) · 50k probability: ${p.goal.probability50k}%${p.goal.monthsTo50kAtCurrentRate ? ` · ~${p.goal.monthsTo50kAtCurrentRate} months at current rate` : ''}
    </div>`;
}

// --- Performance Summary + Target Analysis (reused lessons/improvements) --
function renderPerformanceSummary(data) {
  ensureAnalyticsBlocks();
  const block = document.getElementById('an-performance-block');
  if (data.notEnoughData) { block.innerHTML = ''; return; }
  const s = data.performanceSummary || {};
  const group = (icon, title, items) => {
    if (!items || items.length === 0) return '';
    return `
      <div style="margin-bottom: var(--ceo-space-3);">
        <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;">${icon} ${title}</div>
        <ul style="margin: 0; padding-left: 1.2em; font-size: var(--ceo-font-size-sm);">${items.map((it) => `<li><strong>${escapeHtml(it.label)}</strong> — ${escapeHtml(it.reason)}</li>`).join('')}</ul>
      </div>`;
  };
  const targetLines = [...(data.lessons || []), ...(data.improvements || [])];
  const target = targetLines.length
    ? `<div style="margin-bottom: var(--ceo-space-3);">
        <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;">Target Analysis — the 50k goal</div>
        <ul style="margin: 0; padding-left: 1.2em; font-size: var(--ceo-font-size-sm);">${targetLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
      </div>`
    : '';
  const html =
    group('✅', 'Best Performing Activities', s.bestPerforming) +
    group('⚠', 'Activities Needing Improvement', s.needsImprovement) +
    group('⏳', 'High Priority Pending Activities', s.highPriorityPending) +
    group('❌', 'Frequently Skipped Activities', s.frequentlySkipped) +
    group('🔥', 'Highest Impact Activities', s.highestImpact) +
    target;
  block.innerHTML = html || '<p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: 0;">Performance summary appears once enough activities have been decided.</p>';
}

// --- Daily trends (from the new capture) ---------------------------------
function renderTrends(trends) {
  ensureAnalyticsBlocks();
  const block = document.getElementById('an-trends-block');
  if (!trends || !trends.enoughData) {
    block.innerHTML = '<p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: 0;">Daily trends appear after ~1 week of logging.</p>';
    return;
  }
  const arrow = (m) => m.deltaPct > 0 ? '▲' : m.deltaPct < 0 ? '▼' : '＝';
  block.innerHTML = `
    <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;">Last 7 days vs prior 7</div>
    <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; margin-bottom: var(--ceo-space-3);">
      ${trends.metrics.filter((m) => m.last7 || m.prev7).map((m) => `
        <div style="min-width: 120px;">
          <div class="ceo-text-muted" style="font-size: 0.7rem;">${escapeHtml(m.label)}</div>
          <div style="font-weight: 700;">${m.last7} <span class="ceo-text-muted" style="font-size: 0.75rem;">${arrow(m)} ${m.deltaPct >= 0 ? '+' : ''}${m.deltaPct}%</span></div>
        </div>`).join('')}
    </div>
    ${trends.paid.costPerRegistration !== null ? `<div class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);">Paid: $${trends.paid.fbSpend7} FB spend → ${trends.paid.registrations7} registrations (7d) = <strong>$${trends.paid.costPerRegistration}/registration</strong></div>` : ''}`;
}

// --- Reused Monthly AI Review analytics (read-only) ----------------------
async function loadReusedAnalytics() {
  ensureAnalyticsBlocks();
  const holder = document.getElementById('an-reused-block');
  // /api/ceo/intelligence is the Monthly AI Review's own endpoint — deliberately
  // calendar-month scoped, not growth.reset_date-aware, because it also backs
  // that separate page. Gating its render here (not its computation) keeps the
  // Growth Analytics cycle honest without touching the Monthly Review itself.
  if (notEnoughData) {
    holder.innerHTML = NOT_ENOUGH_DATA_HTML;
    return;
  }
  let r;
  try {
    r = await getJson('/api/ceo/intelligence');
  } catch (err) {
    holder.innerHTML = `<p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">Monthly analytics unavailable: ${escapeHtml(err.message)}</p>`;
    return;
  }
  const dim = (title, lines) => `
    <div style="flex: 1; min-width: 220px;">
      <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;">${escapeHtml(title)}</div>
      ${lines.length ? `<ul style="margin: 0; padding-left: 1.2em; font-size: var(--ceo-font-size-sm);">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : '<p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin: 0;">No data yet.</p>'}
    </div>`;
  const leak = r.biggestLeak;
  holder.innerHTML = `
    <div class="ceo-alert" style="border: 1px solid var(--ceo-border); border-radius: var(--ceo-radius-sm); padding: var(--ceo-space-3); margin: var(--ceo-space-2) 0;">
      <strong>Progress:</strong> ${r.trajectory.progressPct}% to 50,000 (${r.trajectory.activeClients} active) · <strong>50k probability:</strong> ${r.trajectory.probability50k}%${leak ? ` · <strong>Biggest funnel leak:</strong> ${escapeHtml(leak.stage)} (${leak.dropOffRate}% drop-off)` : ''}
    </div>
    <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; margin-bottom: var(--ceo-space-2);">
      ${dim('Top activities (kept)', (r.pareto.top || []).map((x) => `${x.label} — ${x.share}% of impact`))}
      ${dim('Low activities (reduce)', (r.pareto.low || []).map((x) => `${x.label} — skipped ${x.skipped}×`))}
      ${dim('Brokers (by active)', (r.dimensions.brokers || []).map((b) => `${b.name} — ${b.active} active`))}
      ${dim('Platforms (by source)', (r.dimensions.platforms || []).map((p) => `${p.name} — ${p.active} active`))}
      ${dim('Content types', (r.dimensions.contentTypes || []).map((c) => `${c.name} — ${c.published} published`))}
    </div>
    <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);"><strong>Focus next month:</strong> ${escapeHtml(r.executiveSummary)}</p>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
