// playbooks-page.js — Playbooks as execution surfaces (Founder OS Restructure
// Step 4). Renders GET /api/ceo/playbooks — the seeded country/platform
// playbooks, research verdicts, cadence roadmap, and automation registry —
// as cards that answer WHAT/WHERE/WHO/WHY, not informational dumps. The seed
// rows are the single source of truth; the only knowledge in this file is
// HOW to parse their locked "FIELD: value." text format and which locked
// titles join to which (same precedent as mission.js's ACTIVITY_META).

import { getJson, postJson } from '../shared/api.js';
import { openModal, closeModal } from '../shared/components/modal.js';
import { showToast } from '../shared/components/toast.js';

// Splits a seeded playbook row ("PRIORITY 1, active. LANG: ur. BROKER: ...")
// into its intro sentence and an UPPERCASE-FIELD map. Exported pure for QA.
export function parsePlaybookFields(content) {
  const text = String(content || '');
  const re = /\b([A-Z][A-Z _-]{1,24}):\s/g;
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) return { intro: text.trim(), fields: {} };
  const intro = text.slice(0, matches[0].index).trim();
  const fields = {};
  matches.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    fields[m[1].trim()] = text.slice(start, end).trim().replace(/\.$/, '');
  });
  return { intro, fields };
}

// Splits a seeded WARNING field ("7d silence -> auto nudge email.") into the
// trigger and its recovery action — every lifecycle-rule WARNING already
// contains this "-> " separator in the seed text; this reads it, never
// authors a recovery action that isn't already there. Exported pure for QA.
export function splitWarning(warningText) {
  const t = String(warningText || '');
  if (!t) return { trigger: null, recovery: null };
  const idx = t.indexOf('->');
  if (idx === -1) return { trigger: t.trim(), recovery: null };
  return { trigger: t.slice(0, idx).trim(), recovery: t.slice(idx + 2).trim() };
}

// Buckets REAL scheduled decision_log.review_date rows into 30/90/365-day
// windows — the only honest "roadmap calendar" this system can show, since
// no other date-bearing founder-execution data exists. Overdue rows (negative
// daysUntil) sort first inside the 30-day bucket — never dropped, so the
// founder can't silently lose track of a missed re-check. Exported pure for QA.
// Derived "next review due" (Refinement Patch 3) — research_library has no
// forward-looking review-date column, only reviewed_at (when it was last
// checked). Every research doc in this project states the same 90-day
// freshness cadence (mentor-rule 'staleness_volunteer': "this verdict is 80
// days old — re-research due"), so this reads that already-established
// convention rather than inventing a number. Exported pure for QA.
// Reformats an existing seeded "(1) ... (2) ... (3) ..." numbered clause
// list into checklist items — reads the founder's own already-written sales
// rules (seed-04's negotiation row), never authors new advice. Exported
// pure for QA.
export function splitNumberedList(text) {
  const t = String(text || '');
  const matches = [...t.matchAll(/\((\d+)\)\s*/g)];
  if (matches.length === 0) return [];
  return matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : t.length;
    return t.slice(start, end).trim().replace(/;\s*$/, '');
  });
}

export function nextReviewDue(reviewedAt, cadenceDays = 90) {
  if (!reviewedAt) return null;
  const ms = Date.parse(reviewedAt);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + cadenceDays * 86400000).toISOString().slice(0, 10);
}

export function bucketByWindow(decisions, now = Date.now()) {
  const DAY = 86400000;
  const buckets = { within30: [], within90: [], within365: [], beyond: [] };
  for (const d of decisions || []) {
    if (!d.review_date) continue;
    const daysUntil = Math.ceil((Date.parse(d.review_date) - now) / DAY);
    const item = { ...d, daysUntil };
    if (daysUntil <= 30) buckets.within30.push(item);
    else if (daysUntil <= 90) buckets.within90.push(item);
    else if (daysUntil <= 365) buckets.within365.push(item);
    else buckets.beyond.push(item);
  }
  Object.values(buckets).forEach((arr) => arr.sort((a, b) => a.daysUntil - b.daysUntil));
  return buckets;
}

// Locked seed-title joins (country playbook row -> its research verdict rows).
const COUNTRY_RESEARCH = {
  pakistan: ['Pakistan — launch market'],
  gcc: ['GCC diaspora cluster (UAE/KSA lead)'],
  nigeria_kenya: ['Nigeria', 'Kenya'],
  bangladesh_egypt: ['Bangladesh', 'Egypt'],
  rejected_deferred: ['Malaysia', 'Indonesia'],
};
const COUNTRY_LABEL = {
  pakistan: 'Pakistan',
  gcc: 'GCC diaspora (UAE/KSA lead)',
  nigeria_kenya: 'Nigeria + Kenya',
  bangladesh_egypt: 'Bangladesh + Egypt (gates)',
  rejected_deferred: 'Rejected / deferred markets',
};
// Locked language seed titles in execution order (Wave 1 -> trials).
const LANGUAGE_ORDER = ['Urdu / Roman-Urdu', 'English', 'Arabic', 'Bengali'];
const LANGUAGE_TOKEN = { 'Urdu / Roman-Urdu': 'ur', English: 'en' };
// Soft display-order hint ONLY — never an allow-list. Any platform-playbook
// row the seeds return renders even if it's absent here (unknown platforms
// sort last). Recommendation/rejection is never encoded here: it is read live
// from research_library verdicts (findPlatformVerdict), so a founder-approved
// research change flows to the UI with zero code edits.
const PLATFORM_ORDER = ['youtube', 'telegram', 'whatsapp', 'facebook', 'website', 'email', 'instagram', 'tiktok', 'rejected', 'posting_times_note'];
// Platform tokens as they appear inside country PLATFORMS fields.
const PLATFORM_TOKEN = { youtube: 'YT', telegram: 'TG', whatsapp: 'WA', facebook: 'FB' };
const LIFECYCLE_FUNNEL = ['lead', 'course_user', 'ib_client', 'active_trader', 'loyal', 'vip', 'advocate'];

// The founder execution funnel (Step 5) — structural joins between the
// seeded lifecycle-rule stages and the tools/checklists/automations/KPIs
// that serve each stage. These are locked-seed KEY joins (same precedent as
// mission.js's ACTIVITY_META), never recommendations: every displayed value
// (objective, warning, exit criteria, automation class, KPI label) is read
// from its seed row at render time.
const FUNNEL_MAP = [
  { key: 'lead', label: 'Prospects', tools: 'YouTube content · website course · Telegram community', manual: 'Answer every question <24h; 1–2 community posts', automationKeys: ['email.onboarding_seq'], kpiKeys: ['web.course_starts'], checklistKeys: ['community_touch'] },
  { key: 'course_user', label: 'Qualified Leads (course-engaged)', tools: 'Free course · AI chatbot · email rails', manual: 'Stall nudge at 14 days stuck on the same lesson', automationKeys: ['email.onboarding_seq'], kpiKeys: ['web.course_starts'], checklistKeys: [] },
  { key: 'ib_client', label: 'Verified Trading Accounts', tools: 'WhatsApp personal conversation — never a funnel blast', manual: 'The IB ask at trust-triggers only; one honest check-in if registered-no-deposit', automationKeys: [], kpiKeys: ['clients.registrations', 'clients.activation_rate'], checklistKeys: ['ib_conversation'] },
  { key: 'active_trader', label: 'Active Traders', tools: 'Journal · weekly live class · community · milestone ladder', manual: 'Day-1 voice note same-day; milestone touches; slow down desperation, never exploit it', automationKeys: ['retention.milestone_due', 'retention.at_risk_flags'], kpiKeys: ['clients.activations', 'retention.survival_90d'], checklistKeys: ['day1_voice_note', 'retention_touch'] },
  { key: 'loyal', label: 'Active IB Clients', tools: 'Live class ritual · discipline recognition boards', manual: 'Fresh challenges at boredom drift; public recognition (consent)', automationKeys: [], kpiKeys: ['retention.60d'], checklistKeys: [] },
  { key: 'vip', label: 'High-value IB Clients', tools: 'WhatsApp 1:1 · VIP program (educational benefits only)', manual: 'Quarterly 15-minute 1:1 — listen; personal attention <48h on responsiveness drop', automationKeys: [], kpiKeys: ['commission.per_client'], checklistKeys: [] },
  { key: 'advocate', label: 'Long-term Retained Clients', tools: 'Referral moments at pride milestones · annual honors', manual: 'One soft referral line at day-90/completion — never campaigns', automationKeys: [], kpiKeys: ['commission.monthly'], checklistKeys: [] },
];

function renderFunnel(data) {
  const el = document.getElementById('pb-funnel');
  const lifecycle = Object.fromEntries((data.playbooks?.['lifecycle-rule'] || []).map((l) => [l.title, l.content]));
  const checklists = Object.fromEntries((data.playbooks?.['execution-checklist'] || []).map((c) => [c.title, c.content]));
  const registry = Object.fromEntries((data.automation || []).map((a) => [a.key, a]));
  const kpiByKey = Object.fromEntries((data.kpis || []).map((k) => [k.key, k]));
  if (Object.keys(lifecycle).length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Lifecycle seeds nahin mile.</p></div>';
    return;
  }
  el.innerHTML = FUNNEL_MAP.map((stage, i) => {
    const p = parsePlaybookFields(lifecycle[stage.key] || '');
    const automations = stage.automationKeys.map((k) => registry[k]).filter(Boolean);
    const kpis = stage.kpiKeys.map((k) => kpiByKey[k]).filter(Boolean);
    return `
      ${i > 0 ? '<div style="text-align: center; color: var(--ceo-text-muted); margin: var(--ceo-space-2) 0;">↓</div>' : ''}
      <div class="ceo-card">
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
          <h4 style="margin: 0;">${i + 1}. ${esc(stage.label)}</h4>
          <span class="ceo-badge ceo-badge-neutral">${esc(stage.key.replace(/_/g, ' '))}</span>
        </div>
        ${p.fields.OBJECTIVE ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: var(--ceo-space-2) 0;"><strong>Objective:</strong> ${esc(p.fields.OBJECTIVE)}</p>` : ''}
        <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3);">
          ${chip('Tools', stage.tools)}
          ${chip('Founder manual work', stage.manual)}
          ${chip('Automation', automations.length ? automations.map((a) => `${a.label} — ${MATRIX_LABEL[a.matrix_class] || a.matrix_class}${a.is_active ? '' : ' (inactive: founder manual today)'}`).join(' · ') : 'None — this stage is founder-manual by design (trust moments are never delegated)')}
          ${chip('KPIs', kpis.length ? kpis.map((k) => k.label).join(' · ') : null)}
          ${chip('Success criteria', p.fields.EXIT || p.fields.SUCCESS)}
          ${chip('Warning sign', splitWarning(p.fields.WARNING).trigger)}
          ${chip('Recovery action', splitWarning(p.fields.WARNING).recovery)}
        </div>
        ${stage.checklistKeys.filter((k) => checklists[k]).map((k) => `
          <details style="margin-top: var(--ceo-space-3);">
            <summary class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); cursor: pointer;">Checklist: ${esc(k.replace(/_/g, ' '))}</summary>
            <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);">${esc(checklists[k])}</p>
          </details>`).join('')}
      </div>`;
  }).join('');

  // 100,000 → 5,000 volume framing — HONEST: no conversion rates are seeded
  // or invented. The funnel shape is real; the multipliers between stages are
  // exactly what the founder's own cohort data will reveal (the first tracked
  // cohort calibrates them — same rule as the Home execution plan).
  const volumeNote = `
    <div class="ceo-card" style="margin-top: var(--ceo-space-6); background: var(--ceo-surface-raised); box-shadow: none;">
      <h4 style="margin: 0 0 var(--ceo-space-2) 0;">100,000 → 5,000: the volume view</h4>
      <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: 0;">Reaching 5,000 <em>active retained</em> clients means feeding the top of this same funnel at scale — but the drop-off between each stage is <strong>not yet known and is not invented here</strong>. Your first tracked cohort produces the real stage-to-stage rates; until then, the leverage is the bottleneck stage, not a projected number. Bottlenecks and their prevention are below.</p>
    </div>`;

  // "Why IB clients leave" → prevention checklist, straight from the seeded
  // recovery-rule rows (causes + detection). No new advice authored here.
  const recovery = Object.fromEntries((data.playbooks?.['recovery-rule'] || []).map((r) => [r.title, r.content]));
  const preventionCard = (recovery.causes || recovery.detection) ? `
    <div class="ceo-card" style="margin-top: var(--ceo-space-4);">
      <h4 style="margin: 0 0 var(--ceo-space-2) 0;">Why IB clients leave — prevention checklist</h4>
      ${recovery.causes ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);"><strong>Causes (most common first):</strong> ${esc(recovery.causes)}</p>` : ''}
      ${recovery.detection ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);"><strong>Early-warning signals to watch:</strong> ${esc(recovery.detection)}</p>` : ''}
      ${recovery.ethics ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);"><strong>Never:</strong> ${esc(recovery.ethics)}</p>` : ''}
      <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-bottom: 0;">These fire automatically on the Growth → Retention segments (sleeping / inactive / milestone) — this is the reasoning behind them.</p>
    </div>`
    : '';

  el.innerHTML += volumeNote + preventionCard;
}
const MATRIX_LABEL = {
  full: 'Fully Automated',
  ai_assisted: 'Semi-Automated — AI drafts, founder approves',
  human_approval: 'Semi-Automated — queued for founder approval',
  human_only: 'Founder Manual — never automated',
};
const VERDICT_BADGE = { adopt: 'ceo-badge-success', trial: 'ceo-badge-warning', defer: 'ceo-badge-neutral', reject: 'ceo-badge-critical' };

let playbooksCache = null;
let notesCache = {};

export async function initPlaybooksPage() {
  const countriesEl = document.getElementById('pb-countries');
  try {
    const [data, notesResp] = await Promise.all([
      getJson('/api/ceo/playbooks'),
      getJson('/api/ceo/notes').catch(() => ({ notes: {} })),
    ]);
    playbooksCache = data;
    notesCache = notesResp.notes || {};
    renderCountries(data);
    renderLanguages(data);
    renderPlatforms(data);
    renderFunnel(data);
    renderPhysical(data);
    renderTools(data);
    renderRoadmap(data);
    renderAutomation(data);
    wireCompletePlanButtons();
  } catch (err) {
    countriesEl.innerHTML = `<div class="ceo-alert ceo-alert-critical">Playbooks load fail: ${esc(err.message)}</div>`;
  }
}

// Complete Plan viewer (Refinement Patch 2/3/4) — a built-in document view,
// not a PDF: reuses the shared modal component and the EXACT HTML each tab
// already rendered (no second fetch of research/countries/languages/etc —
// nothing there is re-fetched or duplicated). Two things ARE genuinely
// editable inside it, saved with no SQL and live on the very next fetch:
// Founder Notes (every domain, via notes.js -> knowledge_base) and, on the
// Physical domain only, the area/region execution order itself (via
// institutes.js's edit_queue). Everything else (research, verdicts, KPIs,
// automation classes) stays read-only — it's either locked research or
// computed data, never hand-edited (the project's standing integrity rule).
function wireCompletePlanButtons() {
  document.querySelectorAll('[data-complete-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sourceId = btn.getAttribute('data-complete-plan');
      const source = document.getElementById(sourceId);
      const title = btn.getAttribute('data-plan-title') || 'Plan';
      const domain = sourceId.replace(/^pb-/, '');
      const existingNote = notesCache[domain]?.content || '';
      const queue = domain === 'physical' ? (playbooksCache?.physical?.areaQueue || []) : null;

      openModal(`
        <div class="ceo-flex ceo-justify-between ceo-items-center" style="margin-bottom: var(--ceo-space-4); position: sticky; top: 0; background: var(--ceo-surface-raised); padding-bottom: var(--ceo-space-2); z-index: 1;">
          <h2 style="margin: 0;">${esc(title)} — Complete Plan</h2>
          <button class="ceo-btn ceo-btn-secondary" id="ceo-plan-close">Close</button>
        </div>
        ${queue ? `
          <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
            <h3 style="margin-top: 0;">Execution order <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">— one area per line, in the order you want them run. Add a new area by typing its name on a new line; remove one by deleting its line. Save updates the live plan immediately — Home, the Growth page, and the roadmap all read this same order on their next load.</span></h3>
            <textarea class="ceo-input" id="ceo-plan-queue" rows="${Math.min(20, Math.max(6, queue.length))}" style="width: 100%; font-family: inherit;">${esc(queue.join('\n'))}</textarea>
            <button class="ceo-btn ceo-btn-primary" id="ceo-plan-queue-save" style="margin-top: var(--ceo-space-3);">Save order</button>
          </div>` : ''}
        ${source ? source.innerHTML : '<p class="ceo-text-muted">Nothing rendered yet.</p>'}
        <div class="ceo-card" style="margin-top: var(--ceo-space-4);">
          <h3 style="margin-top: 0;">Founder Notes</h3>
          <textarea class="ceo-input" id="ceo-plan-note" rows="4" style="width: 100%; font-family: inherit;" placeholder="Your own notes on this plan...">${esc(existingNote)}</textarea>
          <button class="ceo-btn ceo-btn-primary" id="ceo-plan-note-save" style="margin-top: var(--ceo-space-3);">Save note</button>
        </div>
      `);
      document.querySelector('.ceo-modal')?.classList.add('ceo-modal-doc');
      document.getElementById('ceo-plan-close')?.addEventListener('click', closeModal);

      document.getElementById('ceo-plan-note-save')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          const content = document.getElementById('ceo-plan-note').value;
          await postJson('/api/ceo/notes', { domain, content });
          notesCache[domain] = { content };
          showToast('Note saved.', 'success');
        } catch (err) {
          showToast('Save fail: ' + err.message, 'critical');
        } finally {
          e.target.disabled = false;
        }
      });

      document.getElementById('ceo-plan-queue-save')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          const areas = document.getElementById('ceo-plan-queue').value.split('\n');
          const resp = await postJson('/api/ceo/institutes', { action: 'edit_queue', areas });
          if (playbooksCache?.physical) playbooksCache.physical.areaQueue = resp.cycle?.queue || areas;
          showToast('Execution order saved — live everywhere now.', 'success');
          closeModal();
          renderPhysical(playbooksCache);
        } catch (err) {
          showToast('Save fail: ' + err.message, 'critical');
        } finally {
          e.target.disabled = false;
        }
      });
    });
  });
}

function researchByTitle(data) {
  return Object.fromEntries((data.research || []).map((r) => [r.title, r]));
}

function renderCountries(data) {
  const el = document.getElementById('pb-countries');
  const rows = data.playbooks?.['country-playbook'] || [];
  const platformRows = Object.fromEntries((data.playbooks?.['platform-playbook'] || []).map((p) => [p.title, parsePlaybookFields(p.content)]));
  const lifecycle = (data.playbooks?.['lifecycle-rule'] || []).map((l) => l.title);
  const funnel = LIFECYCLE_FUNNEL.filter((s) => lifecycle.includes(s)).map((s) => s.replace(/_/g, ' ')).join(' → ');
  const research = researchByTitle(data);
  if (rows.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Country playbook seeds nahin mile.</p></div>';
    return;
  }
  // Seed order isn't priority order — render by the priority stated in each
  // row's own intro ("PRIORITY 1" / "1.5" / "2"), gates and rejects last.
  const ranked = rows
    .map((r) => ({ ...r, parsed: parsePlaybookFields(r.content) }))
    .sort((a, b) => priorityOf(a.parsed.intro) - priorityOf(b.parsed.intro));

  el.innerHTML = ranked.map((row) => {
    const p = row.parsed;
    const verdicts = (COUNTRY_RESEARCH[row.title] || []).map((t) => research[t]).filter(Boolean);
    const whyRank = verdicts.map((v) => v.summary).join(' ');
    const confidence = verdicts.map((v) => `${v.title}: ${v.verdict} (${v.confidence})`).join(' · ');
    const platforms = p.fields.PLATFORMS || null;
    const frequency = platforms
      ? Object.entries(PLATFORM_TOKEN)
          .filter(([, token]) => platforms.includes(token))
          .map(([key]) => platformRows[key]?.fields?.CADENCE ? `${cap(key)}: ${platformRows[key].fields.CADENCE}` : null)
          .filter(Boolean)
          .join(' · ')
      : null;
    return `
      <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
          <h3 style="margin: 0;">${esc(COUNTRY_LABEL[row.title] || row.title)}</h3>
          ${verdicts.map((v) => `<span class="ceo-badge ${VERDICT_BADGE[v.verdict] || 'ceo-badge-neutral'}">${esc(v.verdict)} · ${esc(v.confidence)}</span>`).join('')}
        </div>
        <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: var(--ceo-space-2) 0;">${esc(p.intro)}</p>
        <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3);">
          ${chip('Language', p.fields.LANG)}
          ${chip('Platforms', platforms)}
          ${chip('Audience', p.fields.AUDIENCE || 'See audience playbooks (seeded per segment)')}
          ${chip('Content style', p.fields.CONTENT)}
          ${chip('Posting frequency', frequency)}
          ${chip('Funnel', funnel)}
          ${chip('Difficulty', difficultyOf(verdicts, p.intro))}
          ${chip('Broker', p.fields.BROKER)}
          ${chip('Next review due', nextReviewDue(verdicts[0]?.reviewed_at))}
        </div>
        ${guardrails(p.fields)}
        ${whyRank ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-3);"><strong>Why this rank:</strong> ${esc(whyRank)} <span class="ceo-text-muted">(${esc(confidence)})</span></p>` : ''}
      </div>`;
  }).join('');
}

function priorityOf(intro) {
  const m = /PRIORITY\s+([\d.]+)/.exec(intro || '');
  if (m) return parseFloat(m[1]);
  if (/GATES/i.test(intro || '')) return 90;
  return 99; // rejected/deferred sinks to the bottom
}

function difficultyOf(verdicts, intro) {
  if (verdicts.some((v) => v.verdict === 'reject')) return 'Blocked — rejected by research';
  if (verdicts.some((v) => v.verdict === 'defer')) return 'Blocked — deferred, re-check scheduled';
  if (verdicts.some((v) => v.verdict === 'trial')) return 'Gated trial — gate must pass first';
  if (/active/i.test(intro || '')) return 'Operational now';
  return 'Gated — opens per growth stage';
}

function guardrails(fields) {
  const items = [
    fields.WORKS ? `<span class="ceo-badge ceo-badge-success">Works</span> ${esc(fields.WORKS)}` : null,
    fields.FAILS ? `<span class="ceo-badge ceo-badge-warning">Fails</span> ${esc(fields.FAILS)}` : null,
    fields.NEVER ? `<span class="ceo-badge ceo-badge-critical">Never</span> ${esc(fields.NEVER)}` : null,
    fields.CAUTION ? `<span class="ceo-badge ceo-badge-warning">Caution</span> ${esc(fields.CAUTION)}` : null,
    fields.WATCH ? `<span class="ceo-badge ceo-badge-neutral">Watch</span> ${esc(fields.WATCH)}` : null,
  ].filter(Boolean);
  if (items.length === 0) return '';
  return `<div style="margin-top: var(--ceo-space-3); font-size: var(--ceo-font-size-sm);">${items.map((i) => `<p style="margin: var(--ceo-space-1) 0;">${i}</p>`).join('')}</div>`;
}

// Founder Tools — the founder's real assets joined to the seed rows that
// govern when/how each is used for IB growth. Locked-seed joins again, not
// invented advice: "when to use" text comes from cadence/checklist/playbook
// rows; the KPI each tool moves comes from kpi_definitions. Chatbot,
// assessment tools, and trading bots read their usage from the seeded
// physical-funnel rows (seed-04) — one home per fact.
const FOUNDER_TOOLS = [
  { name: 'Trading website', playbookKey: 'website', checklistKey: 'geo_refresh', kpiKey: 'web.ai_referrals' },
  { name: 'Weekly professional trading class', cadenceKey: 'weekly.live_class', checklistKey: 'live_class', kpiKey: 'community.members' },
  { name: 'Trading journal', cadenceKey: 'daily.core_block', checklistKey: null, kpiKey: 'trading.journal_streak', link: '/ai-ceo-os/src/presentation/trading/index.html' },
  { name: 'AI CEO OS daily loop', cadenceKey: 'daily.shutdown', checklistKey: null, kpiKey: 'founder.critical_completion', link: '/ai-ceo-os/src/presentation/command-center/index.html' },
  { name: 'AI chatbot', physicalKey: 'ai_chatbot' },
  { name: 'Assessment tools', physicalKey: 'assessment' },
  { name: 'Trading bots (EAs)', physicalKey: 'trading_bot' },
];

function renderTools(data) {
  const el = document.getElementById('pb-tools');
  const platform = Object.fromEntries((data.playbooks?.['platform-playbook'] || []).map((p) => [p.title, p.content]));
  const cadence = Object.fromEntries((data.playbooks?.['cadence-template'] || []).map((c) => [c.title, c.content]));
  const checklists = Object.fromEntries((data.playbooks?.['execution-checklist'] || []).map((c) => [c.title, c.content]));
  const physical = Object.fromEntries((data.playbooks?.['physical-funnel'] || []).map((p) => [p.title, p.content]));
  const kpiByKey = Object.fromEntries((data.kpis || []).map((k) => [k.key, k]));
  el.innerHTML = FOUNDER_TOOLS.map((tool) => {
    if (tool.physicalKey) {
      const row = physical[tool.physicalKey];
      if (!row) {
        return `
          <div class="ceo-card" style="margin-bottom: var(--ceo-space-4); opacity: 0.85;">
            <div class="ceo-flex ceo-items-center ceo-gap-3"><h4 style="margin: 0;">${esc(tool.name)}</h4><span class="ceo-badge ceo-badge-neutral">Pending seed</span></div>
            <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);">Usage guidance for this tool hasn't been added yet.</p>
          </div>`;
      }
      const p = parsePlaybookFields(row);
      return `
        <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
          <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;"><h4 style="margin: 0;">${esc(tool.name)}</h4></div>
          <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3); margin-top: var(--ceo-space-2);">
            ${chip('When to use', p.fields.FOUNDER)}
            ${chip('Automation', p.fields.AUTO)}
            ${chip('Manual work', p.fields.MANUAL)}
            ${chip('KPI it moves', p.fields.KPI)}
          </div>
        </div>`;
    }
    const pb = tool.playbookKey ? parsePlaybookFields(platform[tool.playbookKey] || '') : null;
    const cad = tool.cadenceKey ? cadence[tool.cadenceKey] : null;
    const cadRule = cad ? cad.split('|').slice(3).join('|').trim() : null;
    const cadTime = cad ? (cad.split('|')[1] || '').trim() : null;
    const kpi = kpiByKey[tool.kpiKey];
    return `
      <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
          <h4 style="margin: 0;">${esc(tool.name)}</h4>
          ${tool.link ? `<a class="ceo-btn ceo-btn-secondary" href="${tool.link}">Open</a>` : ''}
        </div>
        <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3); margin-top: var(--ceo-space-2);">
          ${chip('Role', pb?.fields?.ROLE || cadRule)}
          ${chip('When to use', pb?.fields?.CADENCE || (cadTime ? `${cadTime} — ${cadRule || ''}` : null))}
          ${chip('Founder time', pb?.fields?.TIME || cadTime)}
          ${chip('KPI it moves', kpi ? `${kpi.label} — ${kpi.description || ''}` : null)}
        </div>
        ${tool.checklistKey && checklists[tool.checklistKey] ? `
          <details style="margin-top: var(--ceo-space-3);">
            <summary class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); cursor: pointer;">How to use it (checklist)</summary>
            <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);">${esc(checklists[tool.checklistKey])}</p>
          </details>` : ''}
      </div>`;
  }).join('');
}

// Physical IB Expansion tab — area playbooks in rotation order, sales
// pipeline templates, the physical student funnel, and local-marketing /
// paid-ads rules. Everything renders from seed-04 rows; area cards name
// institute TYPES and search methods, never specific institutes (none were
// invented — the founder ground-verifies each area before its cycle).
const PHYSICAL_FUNNEL_ORDER = ['free_session', 'trading_course', 'trading_journal', 'trading_bot', 'ai_chatbot', 'assessment', 'live_class', 'ib_registration', 'retention', 'referral'];

function renderPhysical(data) {
  const el = document.getElementById('pb-physical');
  const areas = data.playbooks?.['area-playbook'] || [];
  const sales = data.playbooks?.['sales-template'] || [];
  const funnel = Object.fromEntries((data.playbooks?.['physical-funnel'] || []).map((p) => [p.title, p.content]));
  const marketing = data.playbooks?.['marketing-rule'] || [];
  if (areas.length === 0 && sales.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><h3>Physical Expansion isn\'t set up yet</h3><p>This is a one-time setup step — ask whoever manages your Founder OS account to turn it on. Nothing here needs any action from you until then.</p></div>';
    return;
  }
  // Rotation order comes from the physical.area_queue setting; area rows are
  // matched by normalized title so a future queue edit reorders this page
  // with zero code change.
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_');
  const queue = (data.physical?.areaQueue || []).map(norm);
  const orderedAreas = areas.slice().sort((a, b) => {
    const ia = queue.indexOf(norm(a.title)); const ib = queue.indexOf(norm(b.title));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const areaCards = orderedAreas.map((a, i) => {
    const p = parsePlaybookFields(a.content);
    return `
      <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
          <h4 style="margin: 0;">${i + 1}. ${esc(cap(a.title.replace(/_/g, ' ')))}</h4>
          <span class="ceo-badge ceo-badge-neutral">${esc(data.physical?.city || 'Lahore')}</span>
        </div>
        <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3); margin-top: var(--ceo-space-2);">
          ${chip('Why this area', p.fields.WHY)}
          ${chip('Suggested institute categories', p.fields.TYPES)}
          ${chip('Suggested search keywords', p.fields.SEARCH)}
          ${chip('Proposal / pitch angle', p.fields.PITCH)}
        </div>
      </div>`;
  }).join('');

  const salesByTitle = Object.fromEntries(sales.map((s) => [s.title, s.content]));
  const salesCards = sales.map((s) => `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
      <h4 style="margin: 0 0 var(--ceo-space-2) 0;">${esc(cap(s.title.replace(/_/g, ' ')))}</h4>
      <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: 0;">${esc(s.content)}</p>
    </div>`).join('');

  // Meeting/Negotiation checklists — reformatted from the SAME seeded sales
  // rules above (negotiation's numbered clauses, proposal's structure),
  // never new advice. splitNumberedList reads the founder's own text.
  const negotiationItems = splitNumberedList(salesByTitle.negotiation);
  const checklistCard = (heading, items) => items.length === 0 ? '' : `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
      <h4 style="margin: 0 0 var(--ceo-space-2) 0;">${esc(heading)}</h4>
      ${items.map((it) => `<div class="ceo-checklist-item"><input type="checkbox" disabled /><span>${esc(it)}</span></div>`).join('')}
    </div>`;
  const meetingItems = [
    'Bring the track record link — let them verify, never assert',
    salesByTitle.proposal ? 'One-page proposal ready (what institute gets, what founder gets — full disclosure)' : null,
    'Confirm logistics: projector, 1.5h slot, batch size 15-40',
    'Do not mention IB, revenue, or urgency unless asked',
  ].filter(Boolean);
  const checklistsHtml = checklistCard('Meeting checklist', meetingItems) + checklistCard('Negotiation checklist', negotiationItems);

  const funnelCards = PHYSICAL_FUNNEL_ORDER.filter((k) => funnel[k]).map((k, i) => {
    const p = parsePlaybookFields(funnel[k]);
    return `
      ${i > 0 ? '<div style="text-align: center; color: var(--ceo-text-muted); margin: var(--ceo-space-2) 0;">↓</div>' : ''}
      <div class="ceo-card">
        <h4 style="margin: 0;">${i + 1}. ${esc(cap(k.replace(/_/g, ' ')))}</h4>
        <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3); margin-top: var(--ceo-space-2);">
          ${chip('Founder action', p.fields.FOUNDER)}
          ${chip('Manual', p.fields.MANUAL)}
          ${chip('Automation', p.fields.AUTO)}
          ${chip('Tool', p.fields.TOOL)}
          ${chip('KPI', p.fields.KPI)}
          ${chip('Exit', p.fields.EXIT)}
        </div>
      </div>`;
  }).join('');

  const marketingCards = marketing.map((m) => `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
      <h4 style="margin: 0 0 var(--ceo-space-2) 0;">${esc(cap(m.title.replace(/_/g, ' ')))}</h4>
      <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: 0;">${esc(m.content)}</p>
    </div>`).join('');

  el.innerHTML = `
    <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm);">15-day rolling system: one area per cycle — research institutes → contact → proposal → negotiate → run classes → finish batch → next area automatically. The live cycle state and Institute CRM are on the <a href="/ai-ceo-os/src/presentation/growth/index.html">Growth page</a>; this tab is the playbook.</p>
    <h3>Areas — rotation order (${esc(data.physical?.city || 'Lahore')})</h3>
    ${areaCards || '<div class="ceo-empty-state"><p>No area playbooks yet.</p></div>'}
    <h3 style="margin-top: var(--ceo-space-6);">Founder sales pipeline</h3>
    <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">Cold contact → proposal → meeting → negotiation → accepted → classes running → batch complete. Stages tracked per institute in the CRM.</p>
    ${salesCards}
    ${checklistsHtml}
    <h3 style="margin-top: var(--ceo-space-6);">Physical student funnel</h3>
    ${funnelCards}
    <h3 style="margin-top: var(--ceo-space-6);">Local marketing & paid ads</h3>
    ${marketingCards}`;
}

function renderLanguages(data) {
  const el = document.getElementById('pb-languages');
  const research = (data.research || []).filter((r) => r.domain === 'language');
  const countries = (data.playbooks?.['country-playbook'] || []).map((c) => ({ title: c.title, parsed: parsePlaybookFields(c.content) }));
  if (research.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Language research seeds nahin mile.</p></div>';
    return;
  }
  const ordered = LANGUAGE_ORDER.map((t) => research.find((r) => r.title === t)).filter(Boolean)
    .concat(research.filter((r) => !LANGUAGE_ORDER.includes(r.title)));
  el.innerHTML = ordered.map((lang, i) => {
    const token = LANGUAGE_TOKEN[lang.title];
    const usedBy = token
      ? countries.filter((c) => (c.parsed.fields.LANG || '').split('+').map((s) => s.trim()).includes(token)).map((c) => COUNTRY_LABEL[c.title] || c.title)
      : [];
    const register = token === 'ur' ? data.registers?.register_ur : token === 'en' ? data.registers?.register_en : null;
    return `
      <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
          <h3 style="margin: 0;">${i + 1}. ${esc(lang.title)}</h3>
          <span class="ceo-badge ${VERDICT_BADGE[lang.verdict] || 'ceo-badge-neutral'}">${esc(lang.verdict)} · ${esc(lang.confidence)}</span>
        </div>
        <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3); margin-top: var(--ceo-space-2);">
          ${chip('Countries using it', usedBy.length ? usedBy.join(' · ') : 'Gated — no active market yet (see verdict)')}
          ${chip('Execution order', i === 0 ? '#1 — active now' : i === 1 ? '#2 — second engine (Wk 11+ / 300-client gate)' : `#${i + 1} — gated trial`)}
          ${chip('Content & CTA style', register || 'No register defined yet — written when this language’s localization trial passes')}
          ${chip('Next review due', nextReviewDue(lang.reviewed_at))}
        </div>
        <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-3);"><strong>Why:</strong> ${esc(lang.summary)}</p>
      </div>`;
  }).join('');
}

// Finds the research_library platform verdict for a playbook key by matching
// the key against the tokens of each platform verdict's title — so "telegram"
// and "whatsapp" both resolve to the seeded "Telegram + WhatsApp" verdict,
// and any platform research added later links automatically. Exported pure
// for QA. No key→title map is hardcoded anywhere.
export function findPlatformVerdict(key, research) {
  const k = String(key || '').toLowerCase();
  return (research || []).find(
    (r) => r.domain === 'platform' && r.title.toLowerCase().split(/[^a-z]+/).filter(Boolean).includes(k)
  ) || null;
}

// Classifies a platform for display purely from its stored verdict — never a
// hardcoded approval. adopt/trial → recommended; reject/defer → not
// recommended; no verdict → supporting (the seed playbook describes a role
// but research hasn't ruled on it). The 'rejected' seed row is itself a
// stored rejection statement; 'posting_times_note' is a meta note.
export function platformClass(key, verdict) {
  if (key === 'posting_times_note') return 'note';
  if (key === 'rejected') return 'not_recommended';
  if (verdict && (verdict.verdict === 'reject' || verdict.verdict === 'defer')) return 'not_recommended';
  if (verdict && (verdict.verdict === 'adopt' || verdict.verdict === 'trial')) return 'recommended';
  return 'supporting';
}

function renderPlatforms(data) {
  const el = document.getElementById('pb-platforms');
  const all = data.playbooks?.['platform-playbook'] || [];
  if (all.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Platform playbook seeds nahin mile.</p></div>';
    return;
  }
  const orderIdx = (k) => { const i = PLATFORM_ORDER.indexOf(k); return i === -1 ? 999 : i; };
  const enriched = all
    .map((p) => {
      const verdict = findPlatformVerdict(p.title, data.research);
      return { key: p.title, content: p.content, verdict, cls: platformClass(p.title, verdict) };
    })
    .sort((a, b) => orderIdx(a.key) - orderIdx(b.key));

  const note = enriched.find((e) => e.cls === 'note');
  const groups = [
    ['Recommended platforms', enriched.filter((e) => e.cls === 'recommended'), platformCard],
    ['Supporting platforms', enriched.filter((e) => e.cls === 'supporting'), platformCard],
    ['Currently Not Recommended', enriched.filter((e) => e.cls === 'not_recommended'), notRecommendedCard],
  ];

  el.innerHTML =
    groups
      .filter(([, items]) => items.length > 0)
      .map(([heading, items, renderer]) =>
        `<h3 style="margin-top: var(--ceo-space-2);">${heading}</h3>` + items.map(renderer).join('')
      )
      .join('') +
    (note ? `<p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-4);">${esc(note.content)}</p>` : '');
}

function platformCard(e) {
  const p = parsePlaybookFields(e.content);
  return `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
        <h4 style="margin: 0;">${esc(cap(e.key))}</h4>
        ${e.verdict
          ? `<span class="ceo-badge ${VERDICT_BADGE[e.verdict.verdict] || 'ceo-badge-neutral'}">${esc(e.verdict.verdict)} · ${esc(e.verdict.confidence)}</span>`
          : '<span class="ceo-badge ceo-badge-neutral">supporting role</span>'}
      </div>
      ${p.intro ? `<p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: var(--ceo-space-2) 0;">${esc(p.intro)}</p>` : ''}
      <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-3);">
        ${chip('Role', p.fields.ROLE)}
        ${chip('Cadence', p.fields.CADENCE)}
        ${chip('CTA', p.fields.CTA)}
        ${chip('Entry', p.fields.ENTRY)}
        ${chip('KPI', p.fields.KPI)}
        ${chip('Founder time', p.fields.TIME)}
        ${chip('Rule', p.fields.RULE)}
        ${chip('Times', p.fields.TIMES)}
        ${chip('Next review due', nextReviewDue(e.verdict?.reviewed_at))}
      </div>
    </div>`;
}

// Rejected/deferred platforms — the reason is the stored research summary if a
// verdict exists, otherwise the seed row's own text ('rejected' names the
// platforms and why). Never a reason written into this file.
function notRecommendedCard(e) {
  const p = parsePlaybookFields(e.content);
  const reason = e.verdict ? e.verdict.summary : (p.intro || e.content);
  return `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-4); opacity: 0.9;">
      <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
        <h4 style="margin: 0;">${esc(e.key === 'rejected' ? 'Other channels' : cap(e.key))}</h4>
        <span class="ceo-badge ceo-badge-critical">Currently Not Recommended</span>
        ${e.verdict ? `<span class="ceo-badge ceo-badge-neutral">${esc(e.verdict.verdict)} · ${esc(e.verdict.confidence)}</span>` : ''}
      </div>
      <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);"><strong>Why:</strong> ${esc(reason)}</p>
      <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">If founder-approved research changes this verdict, this platform moves to Recommended automatically — no code change.</p>
    </div>`;
}

// Lower bound of a growth-stage title ("stage_300_500" -> 300, "stage_2000_plus"
// -> 2000) so the roadmap renders in true client-count order, not seed order.
// Exported pure for QA.
export function stageLowerBound(title) {
  const m = /stage_(\d+)/.exec(String(title || ''));
  return m ? Number(m[1]) : 0;
}

// Extracts the founder DECISION this stage gates, read from the seeded stage
// text — never authored here. Returns [] when the stage gates no structural
// decision (pure execution stage). Exported pure for QA.
export function stageDecisionTags(content) {
  const c = String(content || '').toLowerCase();
  const tags = [];
  if (/\bhire|delegate|first hire\b/.test(c)) tags.push('When to hire');
  if (/automation|systemi/.test(c)) tags.push('When to automate');
  if (/gate opens|paid|probe|cac/.test(c)) tags.push('When to expand / start paid ads');
  return tags;
}

function renderRoadmap(data) {
  const el = document.getElementById('pb-roadmap');
  const cadence = data.playbooks?.['cadence-template'] || [];
  const stages = data.playbooks?.['growth-stage'] || [];
  if (cadence.length === 0 && stages.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Roadmap seeds nahin mile.</p></div>';
    return;
  }

  // The single founder execution roadmap: growth stages in client-count order,
  // each with its objective, focus, exit criteria, and the structural decision
  // it gates (hire / automate / expand / paid). All from the seed rows.
  const orderedStages = stages.slice().sort((a, b) => stageLowerBound(a.title) - stageLowerBound(b.title));
  const lastStage = orderedStages[orderedStages.length - 1];
  const milestoneNote = lastStage ? `
    <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: 0 0 var(--ceo-space-3) 0;">
      North-star: <strong>5,000+ active retained clients.</strong> The seeded gates below use 100 / 300 / 500 / 1,000 / 2,000 client breakpoints (not round numbers like 250 or 2,500) — each stage's upper bound is the practical milestone. The last seeded gate is "${esc(lastStage.title.replace('stage_', '').replace(/_/g, '–').replace('–plus', '+'))}" (portfolio stage); reaching 5,000 means repeating that stage's playbook — quarterly kill/scale per market — at greater scale, not a new undiscovered stage.
    </p>` : '';
  const roadmapHtml = orderedStages.length === 0 ? '' : `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-6);">
      <h3>Founder execution roadmap <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">— one path, first → last; what never to delay, and when each big decision unlocks</span></h3>
      ${milestoneNote}
      ${orderedStages.map((s, i) => {
        const p = parsePlaybookFields(s.content);
        const tags = stageDecisionTags(s.content);
        const range = s.title.replace('stage_', '').replace(/_/g, '–').replace('–plus', '+');
        return `
          ${i > 0 ? '<div style="text-align:center; color: var(--ceo-text-muted);">↓</div>' : ''}
          <div style="padding: var(--ceo-space-3) 0; border-bottom: 1px solid var(--ceo-border);">
            <div class="ceo-flex ceo-items-center ceo-gap-3" style="flex-wrap: wrap;">
              <strong>${i + 1}. ${esc(range)} clients</strong>
              ${tags.map((t) => `<span class="ceo-badge ceo-badge-warning">${esc(t)}</span>`).join('')}
            </div>
            <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap; row-gap: var(--ceo-space-2); margin-top: var(--ceo-space-1);">
              ${chip('Objective', p.fields.OBJECTIVE)}
              ${chip('Focus', p.fields.FOCUS)}
              ${chip('Never delay', p.fields.RISK)}
              ${chip('Exit to next', p.fields.EXIT)}
            </div>
          </div>`;
      }).join('')}
      <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); margin: var(--ceo-space-3) 0 0 0;">City expansion order (when to move to the next city) is on the Countries tab; the operating rhythm (daily → quarterly) is below.</p>
    </div>`;

  // 30/90/365-day view — REAL scheduled decision_log.review_date rows only.
  // No day-by-day plan is invented; this is honestly just "what's actually
  // on the calendar in each window," which is the only truthful answer this
  // system can give without fabricating dates.
  const windows = bucketByWindow(data.decisions || []);
  const windowCard = (title, items) => {
    if (items.length === 0) return '';
    return `
      <div style="flex: 1; min-width: 220px;">
        <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">${title}</div>
        ${items.map((d) => `<div style="font-size: var(--ceo-font-size-sm); padding: 2px 0;">${d.daysUntil < 0 ? `<span class="ceo-badge ceo-badge-critical" style="font-size: 0.7em;">overdue</span> ` : ''}${esc(d.title)}<span class="ceo-text-muted"> — ${esc(d.review_date)}</span></div>`).join('')}
      </div>`;
  };
  const anyWindowItems = windows.within30.length || windows.within90.length || windows.within365.length;
  const checkpointsHtml = !anyWindowItems ? '' : `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-6);">
      <h3>Real checkpoints — 30 / 90 / 365 days <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);" title="Scheduled decision re-checks (decision_log.review_date) — not an invented calendar">ⓘ</span></h3>
      <div class="ceo-flex ceo-gap-4" style="flex-wrap: wrap;">
        ${windowCard('Next 30 days', windows.within30)}
        ${windowCard('31–90 days', windows.within90)}
        ${windowCard('91–365 days', windows.within365)}
      </div>
    </div>`;
  const groups = { daily: [], weekly: [], monthly: [], quarterly: [] };
  for (const c of cadence) {
    const prefix = c.title.split('.')[0];
    if (groups[prefix]) groups[prefix].push(c);
  }
  const cadenceHtml = Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([period, items]) => `
      <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
        <h3>${cap(period)}</h3>
        ${items.map((item) => {
          const [tier, time] = item.content.split('|').map((s) => s.trim());
          const rule = item.content.split('|').slice(3).join('|').trim();
          const badge = tier === 'CRITICAL' ? 'ceo-badge-critical' : tier === 'IMPORTANT' ? 'ceo-badge-warning' : 'ceo-badge-neutral';
          return `
            <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
              <span class="ceo-badge ${badge}">${esc(tier || '')}</span>
              <strong style="min-width: 11em;">${esc(item.title.split('.')[1].replace(/_/g, ' '))}</strong>
              <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">${esc(time || '')}</span>
              <span class="ceo-text-secondary" style="flex: 1; font-size: var(--ceo-font-size-sm);">${esc(rule)}</span>
            </div>`;
        }).join('')}
      </div>`).join('');
  // roadmapHtml (ordered stages + decision gates) replaces the former flat
  // "growth-stage gates" list — same rows, now sequenced with triggers.
  const rhythmHeading = cadenceHtml ? `<h3 style="margin-top: var(--ceo-space-2);">Operating rhythm — daily → quarterly</h3>` : '';
  el.innerHTML = roadmapHtml + checkpointsHtml + rhythmHeading + cadenceHtml;
}

function renderAutomation(data) {
  const el = document.getElementById('pb-automation');
  const rows = data.automation || [];
  if (rows.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Automation registry khali hai — sab kaam founder-manual hai.</p></div>';
    return;
  }
  const anyActive = rows.some((r) => r.is_active);
  el.innerHTML = `
    ${anyActive ? '' : '<div class="ceo-alert ceo-alert-warning" style="margin-bottom: var(--ceo-space-4);">All registered automations are inactive (Module Gate) — today, every activity is Founder Manual. Each row shows what it becomes once activated.</div>'}
    <div class="ceo-card">
      ${rows.map((r) => `
        <div class="ceo-flex ceo-items-center ceo-gap-3" style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border); flex-wrap: wrap;">
          <span class="ceo-badge ${r.is_active ? 'ceo-badge-success' : 'ceo-badge-neutral'}">${r.is_active ? 'Active' : 'Inactive'}</span>
          <strong style="min-width: 13em;">${esc(r.label)}</strong>
          <span class="ceo-badge ${r.matrix_class === 'full' ? 'ceo-badge-success' : r.matrix_class === 'human_only' ? 'ceo-badge-critical' : 'ceo-badge-warning'}">${esc(MATRIX_LABEL[r.matrix_class] || r.matrix_class)}</span>
          <span class="ceo-text-secondary" style="flex: 1; font-size: var(--ceo-font-size-sm);">${esc(r.description || '')}</span>
        </div>`).join('')}
    </div>`;
}

function chip(label, value) {
  if (!value) return '';
  return `
    <div style="flex: 1; min-width: 200px;">
      <div class="ceo-text-muted" style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;">${label}</div>
      <div style="font-size: var(--ceo-font-size-sm);">${esc(value)}</div>
    </div>`;
}

function cap(s) {
  s = String(s || '');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
