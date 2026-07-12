// home.js — Today's Mission view (interim rule-based engine, PX Constitution
// fixed order: warnings -> mission banner -> Top 3 -> core block -> attention
// -> headline KPI -> shutdown). All data via /api/ceo/mission; actions via
// /api/ceo/activities.

import { getJson, postJson } from '../shared/api.js';
import { showToast } from '../shared/components/toast.js';

export async function initHome() {
  try {
    const m = await getJson('/api/ceo/mission');
    renderBanner(m);
    renderTop(m);
    renderCore(m.coreBlock);
    renderAttention(m.attention);
    renderKpi(m.headlineKpi);
    wireShutdown();
  } catch (err) {
    document.getElementById('home-mission-banner').innerHTML =
      `<div class="ceo-alert ceo-alert-critical">Mission load nahin hui: ${escapeHtml(err.message)}. Refresh karein — agar barqarar rahe, seeds check karein.</div>`;
  }
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
  wireTaskButtons([...m.top, ...m.rest]);
}

function taskRow(t, rank) {
  const tierBadge = { 0: 'ceo-badge-critical', 1: 'ceo-badge-warning', 2: 'ceo-badge-neutral' }[t.tierRank] || 'ceo-badge-neutral';
  const tierName = ['Critical', 'Important', 'Optional'][t.tierRank] || 'Important';
  const label = t.key.replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');
  return `
    <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-3) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;" data-task-id="${t.id}">
      ${rank ? `<strong style="min-width: 1.2em;">${rank}</strong>` : '<span style="min-width: 1.2em;"></span>'}
      <span class="ceo-badge ${tierBadge}" title="Tier — why: rule ranking (tier → staleness → time-fit)">${tierName}</span>
      <span style="flex: 1; min-width: 12em;">${escapeHtml(label)}
        <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);" title="${escapeHtml(t.rule || '')}">ⓘ</span>
      </span>
      <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${t.minutes}m</span>
      <button class="ceo-btn ceo-btn-primary" data-complete>Done</button>
      <button class="ceo-btn ceo-btn-secondary" data-skip>Skip</button>
    </div>`;
}

function wireTaskButtons() {
  document.querySelectorAll('[data-task-id]').forEach((row) => {
    const id = row.getAttribute('data-task-id');
    row.querySelector('[data-complete]')?.addEventListener('click', () => act(row, id, 'completed'));
    row.querySelector('[data-skip]')?.addEventListener('click', () => skipFlow(row, id));
  });
}

async function act(row, id, status, reason) {
  try {
    const res = await postJson('/api/ceo/activities', { id, status, reason });
    row.style.opacity = '0.45';
    row.querySelectorAll('button').forEach((b) => (b.disabled = true));
    showToast(res.coaching || 'Ho gaya.', status === 'completed' ? 'success' : 'info');
  } catch (err) {
    showToast('Update fail hua: ' + err.message, 'critical');
  }
}

function skipFlow(row, id) {
  if (row.querySelector('[data-skip-reasons]')) return;
  const div = document.createElement('div');
  div.setAttribute('data-skip-reasons', '');
  div.style.cssText = 'width:100%;display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;';
  const reasons = [
    ['no_time', 'Waqt nahin'],
    ['blocked', 'Blocked'],
    ['avoided', 'Tal raha tha'],
    ['not_relevant', 'Relevant nahin'],
  ];
  for (const [key, label] of reasons) {
    const b = document.createElement('button');
    b.className = 'ceo-btn ceo-btn-secondary';
    b.textContent = label;
    b.addEventListener('click', () => { div.remove(); act(row, id, 'skipped', key); });
    div.appendChild(b);
  }
  row.appendChild(div);
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
      <a class="ceo-btn ceo-btn-secondary" href="/ai-ceo-os/src/presentation/clients/index.html">Open</a>
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}
