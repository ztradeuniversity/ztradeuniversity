// playbooks-page.js — Playbooks as execution surfaces (Founder OS Restructure
// Step 4). Renders GET /api/ceo/playbooks — the seeded country/platform
// playbooks, research verdicts, cadence roadmap, and automation registry —
// as cards that answer WHAT/WHERE/WHO/WHY, not informational dumps. The seed
// rows are the single source of truth; the only knowledge in this file is
// HOW to parse their locked "FIELD: value." text format and which locked
// titles join to which (same precedent as mission.js's ACTIVITY_META).

import { getJson } from '../shared/api.js';

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
          ${chip('Warning sign', p.fields.WARNING)}
        </div>
        ${stage.checklistKeys.filter((k) => checklists[k]).map((k) => `
          <details style="margin-top: var(--ceo-space-3);">
            <summary class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm); cursor: pointer;">Checklist: ${esc(k.replace(/_/g, ' '))}</summary>
            <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);">${esc(checklists[k])}</p>
          </details>`).join('')}
      </div>`;
  }).join('');
}
const MATRIX_LABEL = {
  full: 'Fully Automated',
  ai_assisted: 'Semi-Automated — AI drafts, founder approves',
  human_approval: 'Semi-Automated — queued for founder approval',
  human_only: 'Founder Manual — never automated',
};
const VERDICT_BADGE = { adopt: 'ceo-badge-success', trial: 'ceo-badge-warning', defer: 'ceo-badge-neutral', reject: 'ceo-badge-critical' };

export async function initPlaybooksPage() {
  const countriesEl = document.getElementById('pb-countries');
  try {
    const data = await getJson('/api/ceo/playbooks');
    renderCountries(data);
    renderLanguages(data);
    renderPlatforms(data);
    renderFunnel(data);
    renderPhysical(data);
    renderTools(data);
    renderRoadmap(data);
    renderAutomation(data);
  } catch (err) {
    countriesEl.innerHTML = `<div class="ceo-alert ceo-alert-critical">Playbooks load fail: ${esc(err.message)}</div>`;
  }
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
            <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-top: var(--ceo-space-2);">Usage rules arrive with seed-04-physical.sql (physical-funnel rows) — nothing is shown until the seed row exists.</p>
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
    el.innerHTML = '<div class="ceo-empty-state"><h3>Physical seeds not loaded</h3><p>Run migration <code>032_institutes.sql</code> and <code>seed-04-physical.sql</code> — the area playbooks, sales templates, and physical funnel render from those rows.</p></div>';
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
          ${chip('Institute types to search', p.fields.TYPES)}
          ${chip('How to search', p.fields.SEARCH)}
          ${chip('Pitch angle', p.fields.PITCH)}
        </div>
      </div>`;
  }).join('');

  const salesCards = sales.map((s) => `
    <div class="ceo-card" style="margin-bottom: var(--ceo-space-4);">
      <h4 style="margin: 0 0 var(--ceo-space-2) 0;">${esc(cap(s.title.replace(/_/g, ' ')))}</h4>
      <p class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin: 0;">${esc(s.content)}</p>
    </div>`).join('');

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
    ${areaCards || '<div class="ceo-empty-state"><p>Area playbooks arrive with seed-04.</p></div>'}
    <h3 style="margin-top: var(--ceo-space-6);">Founder sales pipeline</h3>
    <p class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">Cold contact → proposal → meeting → negotiation → accepted → classes running → batch complete. Stages tracked per institute in the CRM.</p>
    ${salesCards}
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

function renderRoadmap(data) {
  const el = document.getElementById('pb-roadmap');
  const cadence = data.playbooks?.['cadence-template'] || [];
  const stages = data.playbooks?.['growth-stage'] || [];
  if (cadence.length === 0 && stages.length === 0) {
    el.innerHTML = '<div class="ceo-empty-state"><p>Roadmap seeds nahin mile.</p></div>';
    return;
  }
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
  const stagesHtml = stages.length === 0 ? '' : `
    <div class="ceo-card">
      <h3>Growth-stage gates <span class="ceo-text-muted" style="font-size: var(--ceo-font-size-sm);">— what opens (and stays closed) at each client count</span></h3>
      ${stages.map((s) => `
        <div style="padding: var(--ceo-space-2) 0; border-bottom: 1px solid var(--ceo-border);">
          <strong>${esc(s.title.replace('stage_', '').replace(/_/g, '–').replace('–plus', '+'))}</strong>
          <span class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm); margin-left: var(--ceo-space-2);">${esc(s.content)}</span>
        </div>`).join('')}
    </div>`;
  el.innerHTML = cadenceHtml + stagesHtml;
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
