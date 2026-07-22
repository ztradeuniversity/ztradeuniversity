// functions/utils/ceo/founder-success.js
//
// Pure logic for the Founder Success Bar (the Daily Planner's primary
// execution indicator). Same honesty contract as funnel-intelligence.js and
// performance-logic.js: every number derives from real rows or from a
// PLANNING CONSTANT THE ENGINE ALREADY DECLARES — nothing is invented here.
//
// Specifically, this module owns NO new business logic:
//   • the 50,000 target + 5-year horizon come from plan-logic.js FEASIBILITY
//   • per-channel roles/reasons come from plan-logic.js SOCIAL_STRATEGY
//   • national/international/language come from plan-logic.js COUNTRY_STRATEGY
//   • execution / consistency / trajectory stay owned by performance-logic.js
//     and funnel-intelligence.js (analytics.js passes their output in)
//   • actual members are real ib_clients rows (activated+engaged+retained —
//     the same 3-stage "Active IB Clients" definition the whole OS uses)
// A source with no CRM rows behind it returns expected=null so the UI can say
// "not tracked yet" instead of printing a fabricated forecast.

import { FEASIBILITY, SOCIAL_STRATEGY, COUNTRY_STRATEGY, PLAN_TOTAL_DAYS, currentPhaseContext, PHASES } from './plan-logic.js';
import { EXECUTION_KITS } from './execution-kits.js';
import { parseExecTag } from './db.js';

const DAY_MS = 86400000;

// Partial credit: daily_activities.status has no 'partial' member (it is
// DB status 'pending' + an exec tag — see db.js), and no planned-minutes
// column exists to prorate against, so a partial counts as half a completed
// task. Documented flat weight, never a guessed percentage.
const PARTIAL_WEIGHT = 0.5;

// --- 1) Today's plan progress -------------------------------------------
// Completed = 1, partial = 0.5, skipped/pending = 0. Shutdown notes are
// ad-hoc rows, not planned work (same exclusion performance-logic.js makes).
export function computeDailyProgress({ activities, today }) {
  const rows = (activities || []).filter(
    (a) => a.activity_date === today && a.activity_type !== 'daily.shutdown_note'
  );
  let completed = 0, partial = 0, skipped = 0, pending = 0;
  for (const a of rows) {
    const state = a.status === 'completed' ? 'completed'
      : a.status === 'skipped' ? 'skipped'
      : parseExecTag(a.description).state === 'partial' ? 'partial'
      : 'pending';
    if (state === 'completed') completed += 1;
    else if (state === 'partial') partial += 1;
    else if (state === 'skipped') skipped += 1;
    else pending += 1;
  }
  const total = rows.length;
  const credit = completed + PARTIAL_WEIGHT * partial;
  const progressPct = total > 0 ? Math.round((100 * credit) / total) : 0;
  return {
    total,
    completed,
    partial,
    skipped,
    pending,
    progressPct,
    remainingPct: total > 0 ? 100 - progressPct : 0,
  };
}

// --- 1b) The real acquisition curve (NOT a straight line) ----------------
// A straight line (target × day ÷ horizon) is wrong: it implies ~27 active
// IB clients on Day 1, which no funnel can produce. Active clients accrue at
// the BACK of the plan, gated by the phase exit criteria the planning engine
// already declares (Phase 1: 100 actives by ~M9 · Phase 2: 500 · Phase 3:
// 2,500 · Phase 4: 10,000 · Phase 5: the 50,000 goal). These are the single
// source of truth; here we only read them and interpolate BETWEEN the gates.

function parseActivesGate(phaseTargetText) {
  const m = String(phaseTargetText).match(/([\d,]+)\s*actives/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// [{day, actives}] anchors, straight from PHASES' own exit gates. The final
// anchor is the tracked 50,000 goal (Phase 5's gate text is a range).
export const EXPECTED_MILESTONES = (() => {
  const anchors = [{ day: 0, actives: 0 }];
  PHASES.forEach((p, i) => {
    const isLast = i === PHASES.length - 1;
    const a = isLast ? FEASIBILITY.target : parseActivesGate(p.target);
    if (a != null) anchors.push({ day: p.untilDay, actives: a });
  });
  return anchors;
})();

// Expected ACTIVE IB CLIENTS at a plan day — piecewise-linear between the
// gate anchors above. Back-loaded exactly as the real funnel compounds:
// day 1 ≈ 0, most of the 50,000 arrives in Years 4–5 via the sub-IB network.
export function expectedActivesAt(day) {
  const ms = EXPECTED_MILESTONES;
  if (day <= 0) return 0;
  for (let i = 1; i < ms.length; i++) {
    const a = ms[i - 1], b = ms[i];
    if (day <= b.day) {
      const t = (day - a.day) / (b.day - a.day);
      return Math.round(a.actives + (b.actives - a.actives) * t);
    }
  }
  return ms[ms.length - 1].actives;
}

// --- 1c) The upstream funnel, from FEASIBILITY's own totals --------------
// Every multiplier is one of the plan's stated required volumes ÷ the 50,000
// target, using the UPPER bound of each range so the funnel is conservative,
// never optimistic. Nothing here is invented — it is FEASIBILITY.stages read
// back out per-active.
function parseRequiredUpper(s) {
  const str = String(s).toLowerCase().replace(/,/g, '');
  const re = /(\d+(?:\.\d+)?)\s*([mk]?)/g;
  let max = 0, m;
  while ((m = re.exec(str))) {
    const mult = m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1;
    max = Math.max(max, Number(m[1]) * mult);
  }
  return max || null;
}
function stageRequired(needle) {
  const s = FEASIBILITY.stages.find((x) => x.stage.toLowerCase().includes(needle));
  return s ? parseRequiredUpper(s.required) : null;
}
// Engaged→lead rate: the MIDPOINT of the range stated in the leads stage note
// ("1–3% of engaged viewers → lead" → 2%). Derived from the plan's own stated
// rate, not invented; null (engaged omitted) if the note has no percentage.
function engagedRate() {
  const s = FEASIBILITY.stages.find((x) => x.stage.toLowerCase().includes('lead'));
  if (!s) return null;
  const note = String(s.note);
  // A range like "1–3%" writes the % once, so read both bounds first.
  const range = note.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*%/);
  if (range) return ((Number(range[1]) + Number(range[2])) / 2) / 100;
  const single = note.match(/(\d+(?:\.\d+)?)\s*%/);
  return single ? Number(single[1]) / 100 : null;
}

export const FUNNEL_PER_ACTIVE = (() => {
  const t = FEASIBILITY.target;
  const views = stageRequired('view');
  const leads = stageRequired('lead');
  const regs = stageRequired('registration');
  const ftd = stageRequired('deposit');
  const rate = engagedRate();
  const per = (v) => (v == null ? null : v / t);
  return {
    reach: per(views),
    // engaged = leads ÷ (engaged→lead rate); still a subset of reach.
    engaged: leads != null && rate ? per(leads / rate) : null,
    leads: per(leads),
    registrations: per(regs),
    funded: per(ftd),
    active: 1,
  };
})();

// The whole funnel required to SUPPORT a given active-client count.
export function funnelForActives(activeCount) {
  const f = FUNNEL_PER_ACTIVE;
  const mul = (r) => (r == null ? null : Math.round(activeCount * r));
  return {
    reach: mul(f.reach),
    engaged: mul(f.engaged),
    leads: mul(f.leads),
    registrations: mul(f.registrations),
    funded: mul(f.funded),
    active: activeCount,
  };
}

// --- 2) Expected members at this point in the plan -----------------------
// Reads the milestone curve above (the plan's own phase gates) — never a
// straight line. FEASIBILITY.target / horizonDays still bound it. After a
// Plan Reset plan.start_date becomes today, so daysElapsed = 0 and the whole
// bar honestly restarts at zero.
export function computeExpectedMembers({ planStartDate, today, actualMembers }) {
  const target = FEASIBILITY.target;
  const horizonDays = FEASIBILITY.horizonDays;
  const start = planStartDate ? Date.parse(planStartDate) : NaN;
  const now = Date.parse(today);
  const daysElapsed = Number.isFinite(start) && Number.isFinite(now)
    ? Math.max(0, Math.min(horizonDays, Math.floor((now - start) / DAY_MS)))
    : null;
  if (daysElapsed === null) {
    return { known: false, target, horizonDays, daysElapsed: null, planProgressPct: 0, expectedMembers: null, actualMembers, remainingMembers: Math.max(0, target - actualMembers) };
  }
  const planProgressPct = Math.round((10000 * daysElapsed) / horizonDays) / 100;
  // Realistic, funnel-gated projection from the plan's phase milestones.
  const expectedMembers = expectedActivesAt(daysElapsed);
  return {
    known: true,
    target,
    horizonDays,
    daysElapsed,
    planProgressPct,
    expectedMembers,
    expectedFunnel: funnelForActives(expectedMembers),
    actualMembers,
    remainingMembers: Math.max(0, target - actualMembers),
    paceNote: 'Projected along the plan\'s own phase-gate milestones (100 → 500 → 2,500 → 10,000 → 50,000 active clients), not a straight line — active clients accrue at the back of the plan as the funnel and sub-IB network compound. A model pace for comparison, not a forecast.',
  };
}

// --- 3) Expected vs actual ----------------------------------------------
export function compareExpectedActual({ expectedMembers, actualMembers }) {
  if (expectedMembers === null || expectedMembers === undefined) {
    return { status: 'unknown', label: 'Not enough data', gap: null };
  }
  const gap = actualMembers - expectedMembers;
  // A ±10% band around the model pace counts as "on track" — the pace is an
  // estimate, so a hairline miss must not read as failure.
  const band = Math.max(1, Math.round(expectedMembers * 0.1));
  if (expectedMembers === 0 && actualMembers === 0) return { status: 'on_track', label: 'On Track', gap: 0 };
  if (gap >= band) return { status: 'ahead', label: 'Ahead', gap };
  if (gap <= -band) return { status: 'behind', label: 'Behind', gap };
  return { status: 'on_track', label: 'On Track', gap };
}

// --- 4) Member sources ---------------------------------------------------
// Every source the founder asked to see. `match` matches real
// ib_clients.referral_source values (lowercased substring); `activities`
// lists the real activity_type keys that feed it; `reason` is quoted from the
// planning engine's own declaration for that channel wherever one exists.
const socialResult = (needle) => {
  const row = SOCIAL_STRATEGY.find((s) => s.platform.toLowerCase().includes(needle));
  return row ? row.result : null;
};

export const MEMBER_SOURCES = [
  { key: 'facebook', label: 'Facebook', match: ['facebook', 'fb', 'meta'], activities: ['weekly.publish_chain', 'weekly.film_video', 'daily.community_touch'], reason: socialResult('facebook page') || 'Discovery + the eventual paid accelerant' },
  { key: 'youtube', label: 'YouTube', match: ['youtube', 'yt', 'shorts'], activities: ['weekly.film_video', 'weekly.publish_chain'], reason: socialResult('youtube long-form') || 'Authority + evergreen search that converts' },
  { key: 'telegram', label: 'Telegram', match: ['telegram', 'tg'], activities: ['daily.community_touch', 'weekly.email_digest'], reason: socialResult('telegram') || 'The community hub + conversion midpoint' },
  { key: 'whatsapp', label: 'WhatsApp', match: ['whatsapp', 'wa'], activities: ['daily.ib_followups', 'daily.retention_touches'], reason: socialResult('whatsapp') || 'Where registrations become funded' },
  { key: 'seo', label: 'Website SEO', match: ['seo', 'website', 'google', 'search', 'organic search'], activities: ['weekly.publish_chain', 'monthly.content_audit'], reason: socialResult('website') || 'Compounding free-at-margin traffic' },
  { key: 'institutes', label: 'Institutes', match: ['institute', 'academy', 'college', 'university', 'campus'], activities: ['daily.physical_outreach'], reason: 'Physical IB Expansion: institute outreach converts a whole room at once — the highest-trust top of funnel.' },
  { key: 'seminars', label: 'Seminars', match: ['seminar', 'workshop', 'event'], activities: ['daily.physical_outreach', 'weekly.live_class'], reason: 'Live rooms compress the trust curve — one seminar can seed a full area cycle.' },
  { key: 'community', label: 'Community', match: ['community', 'group', 'forum'], activities: ['daily.community_touch', 'weekly.live_class', 'weekly.email_digest'], reason: 'Culture is presence — unanswered questions kill trust, answered ones compound into referrals.' },
  { key: 'referrals', label: 'Referrals', match: ['referral', 'referred', 'word of mouth', 'friend'], activities: ['daily.retention_touches', 'daily.ib_followups'], reason: 'Retained clients recruit — the cheapest active you will ever add.' },
  { key: 'organic', label: 'Organic', match: ['organic', 'direct'], activities: ['weekly.film_video', 'weekly.publish_chain', 'daily.community_touch'], reason: 'The blueprint is organic-first: paid stays gated until $1,000/mo commission run-rate.' },
  { key: 'paid_ads', label: 'Paid Ads', match: ['paid', 'ad', 'ads', 'boost', 'campaign'], activities: ['weekly.publish_chain'], reason: 'Meta Ads deferred to the $1,000/mo commission gate, then capped at 50% of trailing commission.' },
  { key: 'national', label: 'National campaigns', match: ['pakistan', 'pk', 'national', 'domestic'], activities: ['daily.physical_outreach', 'daily.community_touch', 'weekly.film_video'], reason: (COUNTRY_STRATEGY[0] && COUNTRY_STRATEGY[0].expectedGrowth) || 'Primary engine — the proving ground.' },
  { key: 'international', label: 'International campaigns', match: ['gulf', 'uae', 'ksa', 'qatar', 'oman', 'kuwait', 'bahrain', 'expat', 'international', 'nigeria', 'kenya'], activities: ['weekly.publish_chain', 'weekly.email_digest'], reason: (COUNTRY_STRATEGY[1] && COUNTRY_STRATEGY[1].audience) || 'Expat multiplier — deposits far above domestic, on content you already make.' },
  { key: 'languages', label: 'Different languages', match: ['urdu', 'english', 'roman', 'hindi', 'arabic'], activities: ['weekly.film_video', 'weekly.publish_chain'], reason: 'Language split becomes measurable when the EN gate opens (300 activated clients).' },
];

// Actual members per source from REAL CRM rows; expected per source is that
// source's share of the founder's own measured mix applied to the model pace.
// With no active clients yet there is no mix to measure, so expected is null
// and the UI says "not tracked yet" — the computeDimensions honesty pattern.
export function buildSourceBreakdown({ clients, activityTypes, expectedMembers }) {
  const activeStages = ['activated', 'engaged', 'retained'];
  const active = (clients || []).filter((c) => activeStages.includes(c.stage));
  const present = new Set(activityTypes || []);

  const counts = {};
  let matchedTotal = 0;
  for (const c of active) {
    const src = String(c.referral_source || '').toLowerCase().trim();
    if (!src) continue;
    const hit = MEMBER_SOURCES.find((s) => s.match.some((m) => src.includes(m)));
    if (!hit) continue;
    counts[hit.key] = (counts[hit.key] || 0) + 1;
    matchedTotal += 1;
  }

  return MEMBER_SOURCES.map((s) => {
    const actual = counts[s.key] || 0;
    const share = matchedTotal > 0 ? actual / matchedTotal : null;
    return {
      key: s.key,
      label: s.label,
      actualMembers: actual,
      // Only projectable once the founder's own mix is measurable.
      expectedMembers: share !== null && expectedMembers !== null && expectedMembers !== undefined
        ? Math.round(expectedMembers * share)
        : null,
      sharePct: share !== null ? Math.round(100 * share) : null,
      reason: s.reason,
      supportingActivities: s.activities.filter((k) => present.has(k)).map(label),
    };
  });
}

// --- 5) Remaining work ---------------------------------------------------
// The remaining-to-50,000 catalog, organised into the founder's categories.
// Each category lists only the activity types that ACTUALLY exist in the
// founder's plan rows, and states why it moves the remaining number.
export const REMAINING_CATEGORIES = [
  { key: 'national', label: 'National', activities: ['daily.physical_outreach', 'daily.community_touch', 'weekly.film_video'], why: 'Pakistan is the P1 proving ground — every active here funds the next market.' },
  { key: 'international', label: 'International', activities: ['weekly.publish_chain', 'weekly.email_digest'], why: 'Gulf expats deposit 5–10× domestic on the SAME Urdu content — pure LTV upgrade, zero extra production.' },
  { key: 'language', label: 'Language', activities: ['weekly.film_video', 'weekly.publish_chain'], why: 'Urdu/Roman-Urdu carries Phase 1–2; the EN engine unlocks the non-PK majority at the 300-active gate.' },
  { key: 'marketing', label: 'Marketing', activities: ['weekly.publish_chain', 'weekly.film_video'], why: 'Short-form is the $0 mass-reach lead engine — ~1 active per 5,000–10,000 views.' },
  { key: 'physical', label: 'Physical Expansion', activities: ['daily.physical_outreach'], why: 'Area-by-area physical outreach converts whole rooms — the highest-trust acquisition the plan has.' },
  { key: 'content', label: 'Content', activities: ['weekly.film_video', 'weekly.publish_chain', 'monthly.content_audit'], why: 'The content library is the compounding asset: one video becomes 6 surfaces and keeps converting for years.' },
  { key: 'community', label: 'Community', activities: ['daily.community_touch', 'weekly.live_class'], why: '1–3% of engaged viewers become leads, and ~1 active per 80–120 leads — community is the conversion midpoint.' },
  { key: 'automation', label: 'Automation', activities: ['weekly.email_digest', 'monthly.transparency_report'], why: 'A solo founder only reaches 50,000 if follow-up runs without manual effort.' },
  { key: 'sales', label: 'Sales', activities: ['daily.ib_followups'], why: 'Assisted deposit help lifts registration→FTD from ~15% to ≥25% — the single biggest funnel lever.' },
  { key: 'followup', label: 'Follow-up', activities: ['daily.ib_followups', 'daily.retention_touches'], why: 'At 6%/mo churn you must replace ~3,000/mo just to stand still — retention is where 50,000 is won or lost.' },
  { key: 'training', label: 'Training', activities: ['weekly.learning_slot', 'weekly.live_class'], why: 'Educated clients survive; survivors stay active and refer.' },
  { key: 'institutes', label: 'Institute Expansion', activities: ['daily.physical_outreach'], why: 'Institutes are the repeatable room — the path from solo outreach to a sub-IB partner network.' },
];

export function buildRemainingWork({ remainingMembers, activityTypes }) {
  const present = new Set(activityTypes || []);
  return {
    remainingMembers,
    categories: REMAINING_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      why: c.why,
      activities: c.activities.filter((k) => present.has(k)).map(label),
    })),
    note: FEASIBILITY.assumptionNote,
  };
}

function label(key) {
  return String(key || '').replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');
}

// --- 6) Interactive roadmap ---------------------------------------------
// The Founder Success Bar's roadmap mode. Every value here is READ from the
// planning engine — the 5 metric-gated phases and their exit gates come from
// plan-logic.js currentPhaseContext(), the horizon from PLAN_TOTAL_DAYS, the
// target from FEASIBILITY. No phase, milestone, or member number is authored
// in this file.

export const HORIZONS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'month', label: 'This Month', days: 30 },
  { key: 'm6', label: '6 Months', days: 182 },
  { key: 'y1', label: '1 Year', days: 365 },
  { key: 'y2', label: '2 Years', days: 730 },
  { key: 'y3', label: '3 Years', days: 1095 },
  { key: 'y4', label: '4 Years', days: 1460 },
  { key: 'y5', label: '5 Years', days: 1825 },
  { key: 'complete', label: 'Complete Plan', days: PLAN_TOTAL_DAYS },
];

// Which work each phase switches ON, quoted from that phase's own gate text
// in plan-logic.js PHASES (Phase 1 organic PK-only; Phase 2 turns paid on and
// starts SEO/referral + English prep; Phase 3 opens English + new countries;
// Phase 4 adds native-hire languages; Phase 5 is the partner network).
// Categories reuse REMAINING_CATEGORIES above — one category vocabulary.
// Derived from PHASES itself — never a second copy of the gate days.
const PHASE_BOUNDARIES = PHASES.map((p) => p.untilDay);
const PHASE_CATEGORY_KEYS = [
  ['daily', 'content', 'community', 'physical', 'institutes', 'national', 'followup', 'training'],
  ['marketing', 'sales', 'automation'],
  ['international', 'language'],
  ['language', 'international'],
  ['automation', 'international'],
];

// "Daily Planner" is the recurring cadence itself — the only category whose
// members are the daily.* activity types rather than a strategic workstream.
const DAILY_PLANNER_CATEGORY = {
  key: 'daily',
  label: 'Daily Planner',
  activities: ['daily.core_block', 'daily.community_touch', 'daily.technical_analysis', 'daily.ib_followups', 'daily.retention_touches', 'daily.physical_outreach', 'daily.shutdown'],
  why: 'The daily cadence is the engine every other category runs on — consistency is what compounds into actives.',
};

const CATEGORY_BY_KEY = Object.fromEntries(
  [DAILY_PLANNER_CATEGORY, ...REMAINING_CATEGORIES].map((c) => [c.key, c])
);

export function buildRoadmap({ planStartDate, today, actualMembers, activityTypes, hasRealData }) {
  const target = FEASIBILITY.target;
  const horizonDays = PLAN_TOTAL_DAYS;
  const present = new Set(activityTypes || []);
  const start = planStartDate ? Date.parse(planStartDate) : NaN;
  const now = Date.parse(today);
  const currentDay = Number.isFinite(start) && Number.isFinite(now)
    ? Math.max(0, Math.min(horizonDays, Math.floor((now - start) / DAY_MS)))
    : 0;

  // Phases straight from the planning engine's own PHASES rows — name,
  // markets, language, budget and exit gate are quoted, never restated.
  // expectedAt is the milestone curve (phase gates), NOT a straight line.
  const expectedAt = (day) => expectedActivesAt(day);
  let from = 1;
  const phases = PHASE_BOUNDARIES.map((untilDay, i) => {
    const p = PHASES[i];
    const ctx = currentPhaseContext(untilDay, actualMembers);
    const fromDay = from;
    from = untilDay + 1;
    const cats = PHASE_CATEGORY_KEYS[i]
      .map((k) => CATEGORY_BY_KEY[k])
      .filter(Boolean)
      .map((c) => ({
        key: c.key,
        label: c.label,
        why: c.why,
        // Activity keys only — the notes live once in activityNotes below so
        // the payload never repeats a kit per phase.
        activities: (c.activities || []).filter((k) => present.has(k)).map((k) => ({ key: k, label: label(k) })),
      }));

    // Figures the plan states in its own gate/budget text. Absent ones stay
    // null so the UI can say "not separately tracked" instead of guessing.
    const gate = String(p.target || '');
    const revenue = (gate.match(/\$[\d,]+(?:[–-]\$?[\d,]+)?\s*\/mo/) || [])[0] || null;
    const statedActives = (gate.match(/([\d,]+(?:[–-][\d,]+)?)\s+actives/i) || [])[1] || null;
    const team = /hire|hired|manager|officer|analyst|creator/i.test(String(p.budget || '')) ? p.budget : null;
    const [namePart, ...restOfStage] = String(p.stage).split(':');

    return {
      index: i,
      fromDay,
      untilDay,
      pctFrom: Math.round((10000 * (fromDay - 1)) / horizonDays) / 100,
      pctTo: Math.round((10000 * untilDay) / horizonDays) / 100,
      stage: ctx.currentPhase,
      milestone: ctx.monthlyTarget,
      // --- Executive detail (all quoted from PHASES) -------------------
      name: namePart.trim(),
      objective: restOfStage.join(':').trim() || namePart.trim(),
      why: p.countries,          // the markets rationale IS the "why here"
      language: p.language,
      budget: p.budget,
      exitCriteria: p.target,    // the gate is the success criterion
      expectedRevenue: revenue,
      expectedActivesStated: statedActives,
      expectedTeam: team,
      expectedSystems: p.budget,
      expectedMembersAtEnd: expectedAt(untilDay),
      membersAddedInPhase: expectedAt(untilDay) - expectedAt(fromDay - 1),
      // The upstream funnel that must be true for this phase's actives to
      // exist — reach → engaged → leads → registrations → funded → active.
      funnel: funnelForActives(expectedAt(untilDay)),
      categories: cats,
    };
  });

  // Implementation notes, once per activity type the founder's plan actually
  // contains — read straight from EXECUTION_KITS (the same SOP the Daily
  // Planner's "Full SOP" disclosure already shows).
  const NOTE_FIELDS = ['objective', 'platform', 'audience', 'kpi', 'timing', 'expected', 'cta', 'script', 'message', 'questions', 'followUp', 'mistakes', 'risks', 'quality', 'completion', 'nextAction'];
  const activityNotes = {};
  for (const key of present) {
    const kit = EXECUTION_KITS[key];
    if (!kit) continue;
    const out = {};
    for (const f of NOTE_FIELDS) if (kit[f]) out[f] = kit[f];
    if (Object.keys(out).length) activityNotes[key] = out;
  }

  return {
    target,
    horizonDays,
    currentDay,
    currentPct: Math.round((10000 * currentDay) / horizonDays) / 100,
    actualMembers,
    horizons: HORIZONS.map((h) => ({
      key: h.key,
      label: h.label,
      days: Math.min(h.days, horizonDays),
      pct: Math.round((10000 * Math.min(h.days, horizonDays)) / horizonDays) / 100,
    })),
    phases,
    activityNotes,
    // The milestone anchors the client interpolates for scrubbing — the ONE
    // source of the expected-actives curve, shared by server and client.
    milestones: EXPECTED_MILESTONES,
    // The per-active upstream funnel (from FEASIBILITY) + the funnel needed
    // for the whole 50,000 goal, so the roadmap shows the real journey.
    funnelPerActive: FUNNEL_PER_ACTIVE,
    goalFunnel: funnelForActives(target),
    funnelNote: 'Reach → engaged → leads → registrations → funded → active. Volumes are FEASIBILITY\'s own required totals (conservative upper bound), so active clients are only projected once the upstream funnel could realistically support them.',
    // Why the plan is phased at all — the planning engine's own verdict.
    planVerdict: FEASIBILITY.verdict,
    // Honesty flag the UI must surface whenever the curve is doing the talking
    // instead of the founder's own execution history.
    modelOnly: !hasRealData,
    modelNote: 'Projected using the current planning model.',
  };
}
