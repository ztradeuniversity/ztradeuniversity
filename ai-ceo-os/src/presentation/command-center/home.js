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
  await loadDay(picker.value);
}

async function loadDay(date) {
  const realToday = new Date().toISOString().slice(0, 10);
  let m = null;
  try {
    m = await getJson('/api/ceo/mission?date=' + encodeURIComponent(date));
    document.getElementById('home-mentor-line').textContent = m.mentorMessage || '';
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

  const rows = cadenceItems.map((t) => ({
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

  if (rows.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Aaj ke liye koi IB Growth action nahin — seeds ya prospects check karein.</p></div>';
    return;
  }
  rows.sort((x, y) => x.impactRank - y.impactRank);
  el.innerHTML = rows.map((row) => (row.kind === 'cadence' ? taskRowHtml(row.t) : row.html)).join('');
  wireTaskButtons(el.querySelectorAll('[data-task-id]'));
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
// same Done/Partial/Skip controls the old Home used.
function taskRowHtml(t) {
  const label = t.key.replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');
  const isOpen = t.execState !== 'completed' && t.execState !== 'skipped';
  const controls = isOpen
    ? `<button class="ceo-btn ceo-btn-primary" data-act="completed">Done</button>
       <button class="ceo-btn ceo-btn-secondary" data-act="partial">Partial</button>
       <button class="ceo-btn ceo-btn-secondary" data-act="skipped">Skip</button>`
    : `<span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${t.note ? escapeHtml(t.note) : ''}</span>`;
  return `
    <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-3) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;" data-task-id="${t.id}">
      ${t.daysOverdue ? `<span class="ceo-badge ceo-badge-critical">${t.daysOverdue}d overdue</span>` : ''}
      <span class="ceo-badge ${TIER_BADGE[t.tierRank] || 'ceo-badge-neutral'}">${escapeHtml(t.priority)}</span>
      ${execStateBadge(t.execState)}
      <span style="flex: 1; min-width: 14em;">${escapeHtml(label)}</span>
      <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${t.minutes}m${t.realMinutes ? ` (actual ${t.realMinutes}m)` : ''}</span>
      ${controls}
    </div>`;
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

  el.innerHTML = `
    ${c.recurringWeakness ? `
      <div class="ceo-alert ceo-alert-warning" style="margin-bottom: var(--ceo-space-3);">
        Recurring weakness: <strong>${escapeHtml(c.recurringWeakness.text)}</strong> mentioned ${c.recurringWeakness.count}× recently — that's a pattern, not an accident.
      </div>` : ''}
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
      showToast('Check-in saved.', res.ok ? 'success' : 'info');
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
