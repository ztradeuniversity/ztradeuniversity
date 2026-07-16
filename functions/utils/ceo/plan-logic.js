// functions/utils/ceo/plan-logic.js
//
// Pure generators for the two "See Complete Plan" roadmaps (IB Growth Master
// Plan + Physical IB Expansion). Follows physical-logic.js's philosophy:
// the yearly plan is DERIVED — date math over the week rhythm, the locked
// research verdicts (platform/country playbooks, growth-stage seeds), and
// the founder's own settings — never 365 stored rows. Deterministic from
// plan.start_date, so Reset Plan (start_date = today) regenerates the whole
// roadmap with zero writes, and leave days shift every future day forward
// automatically (a leave date is skipped WITHOUT consuming a plan day).
//
// Every verdict encoded here traces to seeded research, not invention:
// platforms/cadence/times from the platform-playbook rows (seed-02 §4),
// countries/languages from the country-playbook rows (seed-02 §5), stage
// objectives and the paid-marketing gate from the growth-stage rows
// (seed-02 §7) and mission-rule 'ignore_today' ("paid pre-stage-3").

const DAY_MS = 86400000;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const PLAN_TOTAL_DAYS = 365;

// Growth stages projected onto the year (growth-stage seeds; client-count
// gates shown honestly as gates, the day ranges are planning windows only).
const PHASES = [
  {
    untilDay: 84,
    stage: 'Stage 1 — Prove the funnel (0→10 activated)',
    countries: 'Pakistan (Priority 1) + GCC (rides PK assets)',
    language: 'Urdu / Roman-Urdu (+EN titles for GCC)',
    budget: 'PKR 0 — organic only (paid is GATED until the 300-client stage)',
  },
  {
    untilDay: 168,
    stage: 'Stage 2 — Repeatability (10→50): course→IB conversion',
    countries: 'Pakistan + GCC',
    language: 'Urdu / Roman-Urdu (+EN titles for GCC)',
    budget: 'PKR 0 — organic only (paid still gated)',
  },
  {
    untilDay: 252,
    stage: 'Stage 3 — Retention proof + community energy (50→300)',
    countries: 'Pakistan + GCC — existing clients over new',
    language: 'Urdu / Roman-Urdu (+EN titles for GCC)',
    budget: 'PKR 0 — organic only (at-risk list is Critical tier, not ads)',
  },
  {
    untilDay: 336,
    stage: 'Stage 4 — Second engine (300→500): EN gate opens',
    countries: 'PK + GCC; Nigeria/Kenya open AT the 300-activated-client gate (EN mirrors of proven winners only)',
    language: 'Urdu + English',
    budget: 'Organic + capped-CAC paid probes (opens at this gate; cap set at the gate review)',
  },
  {
    untilDay: PLAN_TOTAL_DAYS,
    stage: 'Stage 5 — Systemized machine (500→1000): founder hours flat',
    countries: 'PK + GCC + EN markets (NG/KE); BD/EG stay content-gated trials',
    language: 'Urdu + English (BD/EG localization only if trials pass)',
    budget: 'Paid probes continue only while CAC target holds',
  },
];

function phaseForDay(dayNumber) {
  return PHASES.find((p) => dayNumber <= p.untilDay) || PHASES[PHASES.length - 1];
}

// One planned calendar date -> the day's platform + activity block, from the
// same week rhythm mission.js instantiates (production/publish/review/class/
// community) + the seeded platform cadences (FB reposts 2-3x/wk, monthly
// transparency report, monthly content audit, quarterly gates).
function dayContent(dayNumber, dateStr, weekdayName, opts) {
  const { productionDay, publishDay, reviewDay, classDay } = opts;
  const activities = [];
  let platform = 'Telegram + WhatsApp';
  let expected = 'All member questions answered <24h · ~2 qualified conversations';

  if (weekdayName === productionDay) {
    platform = 'YouTube (+ Telegram daily)';
    activities.push('Film weekly long-form video — ONE take, imperfect fine (3h)');
    expected = '1 long-form filmed · watch-time >40% target';
  } else if (weekdayName === publishDay) {
    platform = 'Website/GEO (+ clips to TG/FB/IG)';
    activities.push('Publish chain: transcript → GEO article + 3–5 clips (2h)');
    expected = 'Article live ≤48h after video · one effort, six surfaces';
  } else if (weekdayName === reviewDay) {
    platform = 'Founder OS (+ Telegram daily)';
    activities.push('Weekly review + KPI entry + email digest (1.5h)');
    expected = 'Review complete · next week’s Focus picked · no KPI gaps';
  }
  if (weekdayName === classDay) {
    platform = 'Live class (YouTube/TG) + community';
    activities.push('Live class: 30m teach + 15m honest market review + 15m Q&A (1.5h)');
    expected = 'Attendance + replay views — the weekly conversion moment';
  }

  // The daily non-negotiables (cadence templates, seed-02 §1 + seed-07).
  activities.push('Telegram community touch: 1–2 posts, all questions <24h (20m)');
  activities.push('Technical analysis post — levels/structure, education never signals (20m)');
  activities.push('Retention due-list touches (15m) + IB follow-ups (15m)');

  // Facebook is a discovery skim — 2-3 clip reposts/wk (platform playbook).
  if (['tuesday', 'thursday', 'saturday'].includes(weekdayName)) {
    activities.push('Facebook groups: 2–3 clip reposts into PK groups (10m)');
  }

  // Monthly anchors on a 28-day planning rhythm; quarterly gate every 91 days.
  if (dayNumber % 28 === 21) {
    activities.push('Monthly transparency report — wins AND losses, identical format (1h). The moat.');
  }
  if (dayNumber % 28 === 0) {
    activities.push('Monthly content audit: kill/double from data + broker/regulatory pulse (1.5h)');
  }
  if (dayNumber % 91 === 0) {
    activities.push('QUARTERLY GATE REVIEW: expansion gates (EN? probes? localization?) decided on data, not mood');
  }
  if (dayNumber === 77) {
    activities.push('GATE CHECK: Nigeria/Kenya EN engine opens only at 300 activated clients — verify count, do not force by calendar');
  }

  return { platform, activities, expected };
}

// Rotating honest guidance notes — every line is a seeded playbook rule.
const NOTES = [
  'CTA: free course, never deposit. 1/3 of posts carry NO ask.',
  'Post in PK evenings 7–11pm PKT — serves GCC 8–11pm GST with the same upload.',
  'Losses stay private, recognition stays public — never reversed (PK/GCC culture rule).',
  'No DMs-for-signals — instant ban. This IS the positioning.',
  'Never guaranteed-profit language; never ignore halal questions; never urgency tactics.',
  'Broker: Exness (PK), Exness Islamic — lead with it (GCC).',
  'TikTok/Instagram: auto-repost only, zero native minutes (locked verdict).',
];

// Generate roadmap rows [offset, offset+count). Leave dates are skipped
// WITHOUT consuming a plan day — that is the "shift forward" rule: a 3-day
// leave pushes every later plan day 3 calendar days into the future.
export function generateGrowthDays(startDateStr, offset, count, opts = {}) {
  const start = Date.parse(startDateStr);
  if (!Number.isFinite(start)) return { days: [], hasMore: false };
  const leave = Array.isArray(opts.leavePeriods) ? opts.leavePeriods : [];
  const inLeave = (d) => leave.some((p) => p && p.start <= d && d <= p.end);
  const o = {
    productionDay: opts.productionDay || 'monday',
    publishDay: opts.publishDay || 'tuesday',
    reviewDay: opts.reviewDay || 'friday',
    classDay: opts.classDay || 'saturday',
  };

  const days = [];
  let dayNumber = 0;
  // Walk calendar dates from the start; each non-leave date is a plan day.
  // Bounded: 365 plan days + leave span (cap the walk at 500 calendar days).
  for (let cal = 0; cal < PLAN_TOTAL_DAYS + 135 && dayNumber < offset + count; cal++) {
    const date = new Date(start + cal * DAY_MS);
    const dateStr = date.toISOString().slice(0, 10);
    if (inLeave(dateStr)) continue;
    dayNumber += 1;
    if (dayNumber > PLAN_TOTAL_DAYS) break;
    if (dayNumber <= offset) continue;
    const weekdayName = DAY_NAMES[date.getUTCDay()];
    const phase = phaseForDay(dayNumber);
    const content = dayContent(dayNumber, dateStr, weekdayName, o);
    days.push({
      day: dayNumber,
      date: dateStr,
      weekday: weekdayName,
      stage: phase.stage,
      country: phase.countries,
      language: phase.language,
      budget: phase.budget,
      platform: content.platform,
      activities: content.activities,
      expectedResult: content.expected,
      note: NOTES[(dayNumber - 1) % NOTES.length],
    });
  }
  return { days, hasMore: days.length > 0 && days[days.length - 1].day < PLAN_TOTAL_DAYS, totalDays: PLAN_TOTAL_DAYS };
}

// --- Physical IB Expansion geography -----------------------------------
//
// Province/Division mapping for every entry the seeded queue can contain
// (seed-04 Lahore areas + seed-06 city continuation). A queue entry that is
// a Lahore area maps through Lahore; a city entry maps directly. Anything
// the founder adds later that isn't listed falls back honestly to
// 'Punjab (confirm)' rather than inventing a province.
import { regionForQueueEntry } from './physical-logic.js';

const CITY_GEOGRAPHY = {
  Lahore: { province: 'Punjab', division: 'Lahore Division' },
  Faisalabad: { province: 'Punjab', division: 'Faisalabad Division' },
  Rawalpindi: { province: 'Punjab', division: 'Rawalpindi Division' },
  Islamabad: { province: 'Islamabad Capital Territory', division: 'Islamabad' },
  Multan: { province: 'Punjab', division: 'Multan Division' },
  Sargodha: { province: 'Punjab', division: 'Sargodha Division' },
  Sahiwal: { province: 'Punjab', division: 'Sahiwal Division' },
  Gujranwala: { province: 'Punjab', division: 'Gujranwala Division' },
  Peshawar: { province: 'Khyber Pakhtunkhwa', division: 'Peshawar Division' },
  Karachi: { province: 'Sindh', division: 'Karachi Division' },
  Hyderabad: { province: 'Sindh', division: 'Hyderabad Division' },
  Quetta: { province: 'Balochistan', division: 'Quetta Division' },
};

export function geographyForQueueEntry(entry) {
  const city = regionForQueueEntry(entry);
  const geo = CITY_GEOGRAPHY[city] || { province: 'Punjab (confirm)', division: city };
  return {
    country: 'Pakistan',
    province: geo.province,
    division: geo.division,
    city,
    area: city === entry ? '(city-wide — areas researched when the cycle reaches it)' : entry,
  };
}

// The queue window [offset, offset+count) as roadmap rows, each with its
// projected 15-day window (start_date + index*cycleDays — same arithmetic
// as currentAreaAssignment, so the two can never disagree).
export function buildPhysicalRows(queue, startDateStr, cycleDays, offset, count, now = Date.now()) {
  const q = Array.isArray(queue) ? queue : [];
  const start = startDateStr ? Date.parse(startDateStr) : NaN;
  const rows = q.slice(offset, offset + count).map((entry, i) => {
    const index = offset + i;
    let windowStart = null, windowEnd = null, state = 'not scheduled';
    if (Number.isFinite(start)) {
      const ws = start + index * cycleDays * DAY_MS;
      const we = ws + (cycleDays - 1) * DAY_MS;
      windowStart = new Date(ws).toISOString().slice(0, 10);
      windowEnd = new Date(we).toISOString().slice(0, 10);
      state = now > we ? 'done' : now >= ws ? 'current' : 'upcoming';
    }
    return { index, entry, ...geographyForQueueEntry(entry), windowStart, windowEnd, state };
  });
  return { rows, hasMore: offset + count < q.length, totalEntries: q.length };
}
