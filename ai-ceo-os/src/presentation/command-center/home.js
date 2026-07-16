// home.js — Founder Mission Center (Founder OS Restructure Step 3, built on
// Step 2's Today's Mission). Fixed render order: warnings -> mission banner
// -> Today's Focus -> Top 3 -> core block -> Self Trading check-in -> Growth
// Acquisition -> Growth Retention -> research focus -> attention -> headline
// KPI -> shutdown. All data via the single enriched /api/ceo/mission GET;
// actions via /api/ceo/activities (mission items) and /api/ceo/trading
// (rule check-in) — both existing endpoints, unchanged contracts extended.
// Acquisition/Retention action cards deep-link into the Growth page rather
// than duplicating clients.js/growth.js write-wiring here (mission-rule
// 'deep_link': every mission item opens its module pre-focused).

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

export async function initHome() {
  try {
    const m = await getJson('/api/ceo/mission');
    renderBanner(m);
    renderOverdue(m.overdue);
    renderTriage(m);
    renderFocus(m.focus);
    renderTop(m);
    renderCore(m.coreBlock);
    renderTradingCheckin(m.trading);
    renderExecutionPlan(m);
    renderAcquisition(m.growth?.acquisition);
    renderRetention(m.growth?.retention);
    renderAttention(m.attention);
    renderKpi(m.headlineKpi);
    wireShutdown();
  } catch (err) {
    document.getElementById('home-mission-banner').innerHTML =
      `<div class="ceo-alert ceo-alert-critical">Mission load nahin hui: ${escapeHtml(err.message)}. Refresh karein — agar barqarar rahe, seeds check karein.</div>`;
  }
  // Physical engine nudge — separate, non-blocking fetch (its endpoint may
  // 500 until migration 032 runs; that must never break the mission view).
  renderPhysicalNudge();
}

// Mentor nudge only: the current area's single next step + due follow-ups,
// deep-linking to the full engine on the Growth page (Home nudges, the
// module executes — the established pattern, not a duplicate CRM).
async function renderPhysicalNudge() {
  try {
    const data = await getJson('/api/ceo/institutes');
    const a = data.cycle?.assignment || {};
    if (!a.started && (a.remaining || []).length === 0) return; // physical engine not seeded
    const card = document.getElementById('home-physical-card');
    const el = document.getElementById('home-physical');
    const dueCount = (data.followUpsDue || []).length;
    let line;
    if (!a.started) {
      line = `Cycle not started. First area: <strong>${escapeHtml((a.remaining || [])[0] || '')}</strong> — start it on the Growth page.`;
    } else if (a.exhausted) {
      line = 'Area queue complete — schedule the next round on the Growth page.';
    } else {
      const focus = data.summary?.focus?.label;
      line = `Current area: <strong>${escapeHtml(a.current)}</strong> (${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left).${focus ? ' Push now: ' + escapeHtml(focus) + '.' : ' No institutes logged yet — start researching this area.'}${dueCount ? ` <span class="ceo-badge ceo-badge-warning">${dueCount} follow-up${dueCount === 1 ? '' : 's'} due</span>` : ''}`;
    }
    el.innerHTML = `<p style="margin: 0;">${line}</p>
      <a class="ceo-btn ceo-btn-secondary" style="margin-top: var(--ceo-space-3);" href="/ai-ceo-os/src/presentation/growth/index.html">Open Physical Growth Engine</a>`;
    card.style.display = '';

    // Progressive enhancement of the triage's NOW bucket — physical data
    // arrives on a separate, later fetch than mission.js, so this appends
    // rather than re-rendering the whole triage.
    const nowList = document.getElementById('home-triage-now');
    if (nowList && dueCount > 0) {
      nowList.insertAdjacentHTML('beforeend', `<div style="font-size: var(--ceo-font-size-sm); padding: 2px 0;">${dueCount} institute follow-up${dueCount === 1 ? '' : 's'} due</div>`);
    }
  } catch {
    // Silent — endpoint not live yet (pre-migration). No mission disruption.
  }
}

// Unified NOW/NEXT/LATER triage — re-buckets the SAME tier-ranked arrays
// mission.js already computed (top/rest/coreBlock), so it can never disagree
// with the detailed sections below it. No second scoring system invented:
// NOW = non-negotiable core block + today's top-ranked items; NEXT = the
// remaining Critical/Important items; LATER = Optional-tier only.
function renderTriage(m) {
  const el = document.getElementById('home-triage');
  if (!el) return;
  const label = (t) => t.key.replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');
  const now = [
    ...(m.coreBlock || []).filter((c) => c.key !== 'daily.shutdown' && c.status !== 'completed'),
    ...(m.top || []),
  ];
  const rest = m.rest || [];
  const next = rest.filter((t) => t.tierRank <= 1);
  const later = rest.filter((t) => t.tierRank === 2);
  const bucket = (title, cls, items, listId) => `
    <div style="flex: 1; min-width: 190px;">
      <span class="ceo-badge ${cls}">${title}</span>
      <div ${listId ? `id="${listId}"` : ''} style="margin-top: var(--ceo-space-2);">
        ${items.length === 0 ? '<p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin:0;">Nothing</p>' :
          items.map((t) => `<div style="font-size: var(--ceo-font-size-sm); padding: 2px 0;">${escapeHtml(label(t))}</div>`).join('')}
      </div>
    </div>`;
  const overdueBucket = (m.overdue && m.overdue.length)
    ? bucket(`OVERDUE (${m.overdue.length})`, 'ceo-badge-critical', m.overdue, null)
    : '';
  el.innerHTML = `<div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap;">
    ${overdueBucket}
    ${bucket('DO NOW', 'ceo-badge-critical', now, 'home-triage-now')}
    ${bucket('DO NEXT', 'ceo-badge-warning', next, null)}
    ${bucket('DO LATER', 'ceo-badge-neutral', later, null)}
  </div>`;
}

function renderBanner(m) {
  const el = document.getElementById('home-mission-banner');
  const dayLabel = { production: 'Production day', publish: 'Publish day', review: 'Review day', community: 'Community day' }[m.dayType] || m.dayType;
  const h = Math.floor(m.estimatedMinutes / 60), min = m.estimatedMinutes % 60;
  el.innerHTML = `
    <div class="ceo-flex ceo-items-center ceo-gap-4" style="flex-wrap: wrap;">
      <span class="ceo-badge ceo-badge-neutral">${escapeHtml(dayLabel)}</span>
      <span class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);" title="Sum of pending task estimates — corrects itself weekly from your shutdown data">Est. ${h ? h + 'h ' : ''}${min}m ⓘ</span>
    </div>
    <p style="margin-top: var(--ceo-space-3);">${escapeHtml(m.mentorMessage)}</p>`;
}

// Today's Focus — the single highest-leverage item, with why it matters and
// the KPI it's expected to move (Section 1 enrichment).
function renderFocus(f) {
  const el = document.getElementById('home-focus');
  if (!f) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Sab ho gaya — koi focus item baaqi nahin.</p></div>';
    return;
  }
  const label = f.key.replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');
  el.innerHTML = `
    <div class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); text-transform: uppercase; letter-spacing: 0.04em;">Today's Focus</div>
    <div style="font-size: 1.3rem; font-weight: 700; margin: var(--ceo-space-1) 0;">${escapeHtml(label)}</div>
    <div class="ceo-flex ceo-items-center ceo-gap-4" style="flex-wrap: wrap; font-size: var(--ceo-font-size-sm);">
      <span class="ceo-badge ${TIER_BADGE[f.tierRank] || 'ceo-badge-neutral'}">${escapeHtml(f.priority)} priority</span>
      <span class="ceo-text-secondary">${f.minutes}m estimated</span>
      ${f.expectedOutcome ? `<span class="ceo-text-secondary">Moves: ${escapeHtml(f.expectedOutcome)}</span>` : ''}
    </div>
    ${f.why ? `<p class="ceo-text-secondary" style="margin-top: var(--ceo-space-2); font-size: var(--ceo-font-size-sm);">Why this matters: ${escapeHtml(f.why)}</p>` : ''}`;
}

function renderTop(m) {
  const top = document.getElementById('home-top3');
  const rest = document.getElementById('home-rest');
  if (m.top.length === 0 && m.done.length > 0) {
    top.innerHTML = '<div class="ceo-empty-state"><p>Sab ho gaya. Aaj ka din jeet liya — shutdown karein.</p></div>';
    rest.innerHTML = '';
    return;
  }
  if (m.top.length === 0) {
    top.innerHTML = '<div class="ceo-empty-state"><p>Aaj ke liye koi task generate nahin hua — seeds (cadence-template) check karein.</p></div>';
    return;
  }
  top.innerHTML = m.top.map((t, i) => taskRow(t, i + 1)).join('');
  rest.innerHTML = m.rest.length
    ? `<div class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-bottom: var(--ceo-space-2);">Baaqi aaj:</div>` +
      m.rest.map((t) => taskRow(t, null)).join('')
    : '';
  wireTaskButtons(document.querySelectorAll('#home-top3 [data-task-id], #home-rest [data-task-id]'));
}

// Overdue — pending activities from before today. Reuses taskRow() exactly
// (same Done/Partial/Skip controls, same enrichment) so acting on an overdue
// item works identically to acting on a today item; only the data source and
// the days-overdue badge differ.
function renderOverdue(overdue) {
  const card = document.getElementById('home-overdue-card');
  const el = document.getElementById('home-overdue');
  if (!overdue || overdue.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  el.innerHTML = `<div class="ceo-alert ceo-alert-warning" style="margin-bottom: var(--ceo-space-3);">${overdue.length} activit${overdue.length === 1 ? 'y' : 'ies'} still pending from earlier days — nothing was auto-skipped.</div>`
    + overdue.map((t) => taskRow(t, null, true)).join('');
  wireTaskButtons(document.querySelectorAll('#home-overdue [data-task-id]'));
}

function taskRow(t, rank, isOverdue) {
  const label = t.key.replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');
  const isOpen = t.execState !== 'completed' && t.execState !== 'skipped';
  const controls = isOpen
    ? `<button class="ceo-btn ceo-btn-primary" data-act="completed">Done</button>
       <button class="ceo-btn ceo-btn-secondary" data-act="partial">Partial</button>
       <button class="ceo-btn ceo-btn-secondary" data-act="skipped">Skip</button>`
    : `<span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${t.note ? escapeHtml(t.note) : ''}</span>`;
  return `
    <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-3) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;" data-task-id="${t.id}">
      ${rank ? `<strong style="min-width: 1.2em;">${rank}</strong>` : '<span style="min-width: 1.2em;"></span>'}
      ${isOverdue ? `<span class="ceo-badge ceo-badge-critical">${t.daysOverdue}d overdue</span>` : ''}
      <span class="ceo-badge ${TIER_BADGE[t.tierRank] || 'ceo-badge-neutral'}">${escapeHtml(t.priority)}</span>
      ${execStateBadge(t.execState)}
      <span style="flex: 1; min-width: 14em;">
        ${escapeHtml(label)}
        ${t.why ? `<div class="ceo-text-muted" style="font-size: 0.75rem;">${escapeHtml(t.why)}${t.expectedOutcome ? ' · Moves: ' + escapeHtml(t.expectedOutcome) : ''}</div>` : ''}
        ${t.delayCost ? `<div class="ceo-text-muted" style="font-size: 0.72rem;">Delay cost: ${escapeHtml(t.delayCost)}</div>` : ''}
        ${t.automationStatus ? `<div class="ceo-text-muted" style="font-size: 0.72rem;">${escapeHtml(t.automationStatus)}</div>` : ''}
      </span>
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

// Scoped to an explicit row list (not a global querySelectorAll) — Overdue
// and Top-3/Rest are rendered by separate functions using the same taskRow()
// markup; wiring globally would double-attach listeners to whichever
// section rendered first.
function wireTaskButtons(rows) {
  rows.forEach((row) => {
    const id = row.getAttribute('data-task-id');
    row.querySelectorAll('[data-act]').forEach((btn) =>
      btn.addEventListener('click', () => actionFlow(row, id, btn.getAttribute('data-act')))
    );
  });
}

// Reveals a small inline form under the row — real minutes + note for
// done/partial, a reason picker for skip — instead of a modal, matching the
// existing low-friction pattern (skip reasons worked this way since Step 2).
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

function renderCore(core) {
  const el = document.getElementById('home-core');
  const items = core.filter((c) => c.key !== 'daily.shutdown');
  if (items.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Core templates seed hone baaqi hain.</p></div>';
    return;
  }
  el.innerHTML = items.map((t) => `
    <label class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; cursor: pointer;">
      <input type="checkbox" data-core-id="${t.id}" ${t.status === 'completed' ? 'checked disabled' : ''} />
      <span>${escapeHtml(t.key.replace('daily.', '').replace(/_/g, ' '))}</span>
      <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${t.minutes}m</span>
    </label>`).join('');
  el.querySelectorAll('input[data-core-id]:not(:disabled)').forEach((cb) => {
    cb.addEventListener('change', async () => {
      if (!cb.checked) return;
      cb.disabled = true;
      try {
        const res = await postJson('/api/ceo/activities', { id: cb.getAttribute('data-core-id'), status: 'completed' });
        showToast(res.coaching, 'success');
      } catch (err) {
        cb.disabled = false; cb.checked = false;
        showToast('Update fail: ' + err.message, 'critical');
      }
    });
  });
}

// Self Trading — daily questions come from the founder's own active
// trading_rules ("Did you follow: <rule>?"), not a fixed literal list.
// "Yes" is acknowledgment only (no schema field exists for logging
// compliance — only violations are logged, matching the Trading module's
// existing "logging a violation is what keeps the rule alive" design).
function renderTradingCheckin(t) {
  const el = document.getElementById('home-trading-checkin');
  if (!t) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Load nahin hua.</p></div>';
    return;
  }
  const parts = [];
  parts.push(`
    <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
      <span style="flex:1; min-width: 14em;">Did you journal today's trades?</span>
      <span class="ceo-badge ${t.journaledToday ? 'ceo-badge-success' : 'ceo-badge-neutral'}">${t.journaledToday ? 'Yes' : 'Not yet'}</span>
      ${t.journaledToday ? '' : '<a class="ceo-btn ceo-btn-secondary" href="/ai-ceo-os/src/presentation/trading/index.html">Log now</a>'}
    </div>`);
  if (t.repeatedMistake) {
    parts.push(`
      <div class="ceo-alert ceo-alert-warning" style="margin: var(--ceo-space-3) 0;">
        Did you repeat yesterday's mistake? <strong>${escapeHtml(t.repeatedMistake.ruleTitle)}</strong> was violated yesterday and today — that's a pattern, not an accident.
      </div>`);
  }
  if (t.topViolated) {
    parts.push(`
      <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: var(--ceo-space-2) 0;">
        Coach's note: pichhle 2 hafton mein sab se zyada tuta hua rule — <strong>${escapeHtml(t.topViolated.ruleTitle)}</strong> (${t.topViolated.count}×). Aaj isko #1 watch rakhein.
      </p>`);
  }
  if (!t.rulesCheckin || t.rulesCheckin.length === 0) {
    parts.push('<div class="ceo-empty-state"><p>Koi active trading rule nahin — Trading page se rules set karein.</p></div>');
  } else {
    // Split by the rule's OWN seeded category (no invented emotion tracker):
    // discipline rules = the before-session prep checklist (analysis, zones,
    // plan); psychology/risk/integrity = the after-session reflection (FOMO,
    // revenge, overtrading, rule adherence). Anything else falls to "after".
    const before = t.rulesCheckin.filter((r) => r.category === 'discipline');
    const after = t.rulesCheckin.filter((r) => r.category !== 'discipline');
    const ruleRow = (r) => `
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;" data-rule-id="${r.id}">
        <span style="flex:1; min-width: 14em;">Did you follow: <strong>${escapeHtml(r.title)}</strong>?</span>
        <button class="ceo-btn ceo-btn-secondary" data-rule-ok>Yes — full</button>
        <button class="ceo-btn ceo-btn-secondary" data-rule-partial title="Logs a minor violation with a 'partial compliance' note — honesty is the discipline metric">Partial</button>
        <button class="ceo-btn ceo-btn-secondary" data-rule-violated>No — log it</button>
      </div>`;
    if (before.length) {
      parts.push(`<div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-top: var(--ceo-space-3);">Before the session</div>`);
      parts.push(before.map(ruleRow).join(''));
    }
    if (after.length) {
      parts.push(`<div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-top: var(--ceo-space-3);">After the session — FOMO / revenge / overtrading / emotional decisions</div>`);
      parts.push(after.map(ruleRow).join(''));
    }
  }
  el.innerHTML = parts.join('');

  // Full violation and partial compliance both flow through the EXISTING
  // trading.js violation action — severity distinguishes them (minor =
  // partial, major = violation), so discipline history stays in one table.
  const logViolation = async (b, severity, note, toast) => {
    const row = b.closest('[data-rule-id]');
    b.disabled = true;
    try {
      await postJson('/api/ceo/trading', {
        action: 'violation',
        trading_rule_id: row.getAttribute('data-rule-id'),
        severity,
        notes: note,
      });
      row.querySelectorAll('button').forEach((x) => (x.disabled = true));
      showToast(toast, 'info');
    } catch (err) {
      showToast('Fail: ' + err.message, 'critical');
      b.disabled = false;
    }
  };
  el.querySelectorAll('[data-rule-violated]').forEach((b) =>
    b.addEventListener('click', () => logViolation(b, 'major', '', 'Violation logged. Pattern hi asal ustad hai.'))
  );
  el.querySelectorAll('[data-rule-partial]').forEach((b) =>
    b.addEventListener('click', () => logViolation(b, 'minor', 'partial compliance', 'Partial logged — aadha sach bhi sach hai. Kal full compliance.'))
  );
  el.querySelectorAll('[data-rule-ok]').forEach((b) =>
    b.addEventListener('click', () => {
      b.closest('[data-rule-id]').querySelectorAll('button').forEach((x) => (x.disabled = true));
      showToast('Full compliance — discipline hi asal edge hai.', 'success');
    })
  );
}

// New Client Acquisition — real prospects/content/task rows, ranked by
// impact, deep-linking into the Growth page rather than re-wiring writes here.
function renderAcquisition(a) {
  const el = document.getElementById('home-acquisition');
  if (!a) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Load nahin hua.</p></div>';
    return;
  }
  const growthHref = '/ai-ceo-os/src/presentation/growth/index.html';
  const rows = [];
  if (a.nextIdea) rows.push({ label: `Produce: ${a.nextIdea.title}`, impact: a.nextIdea.impact });
  for (const p of a.inProduction || []) rows.push({ label: `Finish producing: ${p.title}`, impact: p.impact });
  for (const f of a.followUps || []) rows.push({ label: `${f.label}: ${f.name}`, impact: f.impact });
  for (const task of a.tasks || []) rows.push({ label: task.title, impact: task.impact });
  rows.sort((x, y) => (IMPACT_RANK[x.impact] ?? 1) - (IMPACT_RANK[y.impact] ?? 1));

  const platformNote = a.suggestedPlatform
    ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-bottom: var(--ceo-space-3);">Today's best platform: <strong>${escapeHtml(cap(a.suggestedPlatform.key))}</strong>${a.suggestedPlatform.note ? ' — ' + escapeHtml(truncate(a.suggestedPlatform.note, 140)) : ''}</p>`
    : '';

  if (rows.length === 0) {
    el.innerHTML = platformNote + '<div class="ceo-empty-state"><p>Aaj koi naya acquisition action nahin — content pipeline ya prospects check karein.</p></div>';
    return;
  }
  const rankedFirstNote = `
    <div class="ceo-text-muted" style="font-size: 0.75rem; padding: 0 0 var(--ceo-space-1) 0;">
      #1 by impact rank — high-impact work never sits below low-impact work. Moves: IB registrations → activations.
    </div>`;
  el.innerHTML = platformNote
    + rankedFirstNote
    + rows.map((r) => actionRow(r.label, r.impact, growthHref)).join('');
}

// Client Retention — real due-list rows from the shared retention
// computation (same source as GET /api/ceo/retention). High-equity clients
// hitting a recognition milestone are flagged as "congratulate a top
// performer" — real data (equity_band + the milestone ladder), not invented.
function renderRetention(r) {
  const el = document.getElementById('home-retention');
  if (!r) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Load nahin hua.</p></div>';
    return;
  }
  const growthHref = '/ai-ceo-os/src/presentation/growth/index.html#retention';
  const rows = [];
  for (const d of r.due || []) rows.push({ label: `${d.isTopPerformer ? '🏆 Congratulate: ' : ''}${d.label}: ${d.name}`, impact: 'high' });
  for (const risk of r.atRisk || []) rows.push({ label: `Contact sleeping client: ${risk.name} (${risk.silentDays}d silent)`, impact: 'high' });
  for (const dm of r.dormant || []) rows.push({ label: `Dormant checkpoint (${dm.checkpoint}d): ${dm.name}`, impact: 'medium' });

  if (rows.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Aaj koi retention action due nahin — sab clients ka haq ada hai.</p></div>';
    return;
  }
  el.innerHTML = rows.map((x) => actionRow(x.label, x.impact, growthHref)).join('');
}

function actionRow(label, impact, href) {
  const key = impact || 'medium';
  return `
    <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
      <span class="ceo-badge ${IMPACT_BADGE[key] || 'ceo-badge-neutral'}">${cap(key)} impact</span>
      <span style="flex:1; min-width: 14em;">${escapeHtml(label)}</span>
      <a class="ceo-btn ceo-btn-secondary" href="${href}">Open</a>
    </div>`;
}

// Today's Execution Plan — the locked research verdicts rendered as today's
// WHAT/WHERE/WHO instead of informational cards. Every value is read from the
// mission payload (research verdicts, suggested platform, today's cadence
// items, the next content card's seeded audience) — nothing re-searched,
// nothing rotated, nothing invented. Where a number honestly doesn't exist
// yet (IB-contribution estimate needs the still-pending D0 baselines), the
// plan says so instead of fabricating one.
function renderExecutionPlan(m) {
  const el = document.getElementById('home-execution-plan');
  const r = m.research || {};
  const a = m.growth?.acquisition || {};
  if (!r.country && !r.language && !r.platform) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Research seed data nahin mila.</p></div>';
    return;
  }
  const topAction =
    (a.inProduction && a.inProduction[0] && `Finish producing: ${a.inProduction[0].title}`) ||
    (a.nextIdea && `Produce: ${a.nextIdea.title}`) ||
    (a.followUps && a.followUps[0] && `${a.followUps[0].label}: ${a.followUps[0].name}`) ||
    null;
  const audience = a.inProduction?.[0]?.audience || a.nextIdea?.audience || null;
  const format = deriveContentFormat(m);
  const outcome = m.focus?.expectedOutcome || 'IB registrations → activations';
  const platformName = a.suggestedPlatform ? cap(a.suggestedPlatform.key) : (r.platform ? r.platform.title : null);
  // CTA comes from the seeded platform playbook already in the payload
  // ("CTA: free course, never deposit"); execution mode from the registry's
  // real is_active state — both grounded, neither hardcoded.
  const cta = extractField(a.suggestedPlatform?.note, 'CTA');
  const execMode = (a.activeAutomations && a.activeAutomations.length > 0)
    ? `Semi-automated — active: ${a.activeAutomations.map((x) => x.label).join(', ')}`
    : 'Founder Manual — no automations active yet';

  const chip = (label, value, hint) => !value ? '' : `
    <div style="flex: 1; min-width: 170px;">
      <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">${label}</div>
      <div style="font-weight: 600;" ${hint ? `title="${escapeHtml(hint)}"` : ''}>${escapeHtml(value)}${hint ? ' <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">ⓘ</span>' : ''}</div>
    </div>`;

  el.innerHTML = `
    <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-4);">
      ${chip('Target country', r.country?.title, r.country?.summary)}
      ${chip('Target language', r.language?.title, r.language?.summary)}
      ${chip('Best platform', platformName, a.suggestedPlatform?.note || r.platform?.summary)}
      ${chip('Content format', format.label, format.hint)}
      ${chip('Audience', audience, 'From the next content card’s seeded targeting')}
      ${chip('Suggested CTA', cta, 'From the seeded platform playbook')}
      ${chip('Expected outcome', outcome, null)}
      ${chip('Execution', execMode, 'From the automation registry’s live state')}
    </div>
    ${topAction ? `
      <div class="ceo-alert" style="margin-top: var(--ceo-space-4); border: 1px solid var(--ceo-border); border-radius: var(--ceo-radius-sm); padding: var(--ceo-space-3);">
        <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">Today's high-impact activity</div>
        <div style="font-weight: 700; margin: var(--ceo-space-1) 0;">${escapeHtml(topAction)}</div>
        <div class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);">Why first: ${escapeHtml(r.platform?.summary || 'the compounding asset — everything else distributes this')}. ${r.country ? 'Market: ' + escapeHtml(r.country.title) + ' (' + escapeHtml(r.country.confidence) + ' confidence).' : ''}</div>
      </div>` : ''}
    <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-3);">Estimated IB contribution: not yet measurable — D0 baselines pending; the first tracked cohort calibrates this number.</p>`;
}

// Content format comes from what today's mission actually contains (the
// seeded cadence items already in the payload), not a separate lookup:
// production day carries weekly.film_video, publish day carries
// weekly.publish_chain, otherwise the daily community items apply.
function deriveContentFormat(m) {
  const keys = new Set([...(m.top || []), ...(m.rest || []), ...(m.done || []), ...(m.coreBlock || [])].map((t) => t.key));
  if (keys.has('weekly.film_video')) return { label: 'Long-form video', hint: 'The weekly compounding asset (cadence: weekly.film_video)' };
  if (keys.has('weekly.publish_chain')) return { label: 'GEO article + clips', hint: 'One video becomes six surfaces (cadence: weekly.publish_chain)' };
  if (keys.has('weekly.live_class')) return { label: 'Live class', hint: 'Weekly ritual + conversion moment (cadence: weekly.live_class)' };
  return { label: 'Community posts + replies', hint: 'Community day — presence is the format (cadence: daily.community_touch)' };
}

function renderAttention(attention) {
  const el = document.getElementById('home-attention');
  if (!attention || attention.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Aaj koi client flag nahin — sab theek chal raha hai.</p></div>';
    return;
  }
  el.innerHTML = attention.map((a) => `
    <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; flex-wrap: wrap;">
      <span class="ceo-badge ceo-badge-warning">${escapeHtml(a.stage)}</span>
      <span style="flex:1; min-width: 10em;">${escapeHtml(a.name)}</span>
      <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${escapeHtml(a.reason)}</span>
      <a class="ceo-btn ceo-btn-secondary" href="/ai-ceo-os/src/presentation/growth/index.html#retention">Open</a>
    </div>`).join('');
}

function renderKpi(k) {
  const el = document.getElementById('home-kpi');
  if (!k) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Headline KPI seed hone ke baad yahan aayega.</p></div>';
    return;
  }
  document.getElementById('home-kpi-label').textContent = k.label;
  if (k.value === null) {
    el.innerHTML = `<div class="ceo-empty-state"><p>Abhi koi value darj nahin — pehli KPI entry ke baad trend yahan banega. <span title="Manual entry: weekly KPI task se">ⓘ</span></p></div>`;
    return;
  }
  const prev = k.previous;
  const arrow = prev === null ? '' : Number(k.value) > Number(prev) ? '▲' : Number(k.value) < Number(prev) ? '▼' : '＝';
  el.innerHTML = `
    <div class="ceo-flex ceo-items-center ceo-gap-4">
      <span style="font-size: 2rem; font-weight: 700;">${escapeHtml(String(k.value))}<span class="ceo-text-muted" style="font-size: 1rem;"> ${escapeHtml(k.unit)}</span></span>
      <span>${arrow} <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${prev === null ? 'pehli reading' : 'pichhli: ' + escapeHtml(String(prev))}</span></span>
    </div>`;
}

function wireShutdown() {
  const btn = document.getElementById('home-shutdown-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const note = document.getElementById('home-shutdown-note').value.trim();
    try {
      const res = await postJson('/api/ceo/activities', { action: 'shutdown_note', note });
      document.getElementById('home-shutdown-msg').textContent = res.coaching;
      showToast(res.coaching, 'success');
    } catch (err) {
      btn.disabled = false;
      showToast('Shutdown save fail: ' + err.message, 'critical');
    }
  });
}

function cap(s) {
  s = String(s || '');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Pulls one "FIELD: value." segment out of a seeded playbook string (the
// same UPPERCASE-FIELD format mission.js parses server-side).
function extractField(content, field) {
  if (!content) return null;
  const m = new RegExp(`${field}:\\s*(.*?)(?=\\s+[A-Z][A-Z _-]{1,15}:|$)`).exec(content);
  return m ? m[1].trim().replace(/\.$/, '') : null;
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}
