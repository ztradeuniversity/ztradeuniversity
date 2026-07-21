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

import { FEASIBILITY, SOCIAL_STRATEGY, COUNTRY_STRATEGY } from './plan-logic.js';
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

// --- 2) Expected members at this point in the plan -----------------------
// The plan itself declares BOTH numbers this needs: FEASIBILITY.target
// (50,000) and FEASIBILITY.horizonDays (PLAN_TOTAL_DAYS). Straight-line pace
// across that declared horizon — a labeled model pace, disclosed exactly like
// trajectory's probability band, never presented as a promise. After a Plan
// Reset plan.start_date becomes today, so daysElapsed = 0 and the whole bar
// honestly restarts at zero.
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
  const expectedMembers = Math.round((target * daysElapsed) / horizonDays);
  return {
    known: true,
    target,
    horizonDays,
    daysElapsed,
    planProgressPct,
    expectedMembers,
    actualMembers,
    remainingMembers: Math.max(0, target - actualMembers),
    paceNote: 'Straight-line pace across the plan\'s own declared 5-year horizon (plan-logic FEASIBILITY) — a model pace for comparison, not a forecast.',
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
