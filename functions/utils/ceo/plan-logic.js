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
// Feasibility audit verdict (see FEASIBILITY below): 365 days cannot carry
// a 50,000-active-client funnel — the practical horizon is 5 phased years.
export const PLAN_TOTAL_DAYS = 1825;

// Growth phases projected onto the 5-year horizon. Year 1 keeps the seeded
// growth-stage discipline; the founder's directive moves EN markets up to
// day 91 (was: the 300-client research gate) — recorded as a FOUNDER
// DECISION over the prior gate, with the risk stated, not silently blended.
const PHASES = [
  {
    untilDay: 90,
    stage: 'Phase 1 (Day 1–90) — Foundation: prove the funnel (0→50 activated)',
    countries: 'Pakistan + GCC dual-launch (one Urdu content engine serves both from day 1)',
    language: 'Urdu / Roman-Urdu (+EN titles for GCC)',
    budget: 'PKR 0 — organic only (paid stays gated until 300 activated clients)',
  },
  {
    untilDay: 365,
    stage: 'Phase 2 (Day 91–365) — Multi-market ignition (50→1,000): EN mirrors begin',
    countries: 'PK + GCC + Nigeria/Kenya EN mirrors from day 91 (FOUNDER DECISION — earlier than the researched 300-client gate; mirror only proven PK winners to contain the risk)',
    language: 'Urdu + English',
    budget: 'Organic; capped-CAC paid probes open at 300 activated clients',
  },
  {
    untilDay: 730,
    stage: 'Phase 3 (Year 2) — Scale the engines (1,000→5,000): first hire',
    countries: 'PK + GCC + NG/KE full cadence; South Africa EN added (~day 540) if NG/KE CAC holds',
    language: 'Urdu + English',
    budget: 'Paid scales while CAC ≤ target; editing/clips delegated (never voice or trust-touches)',
  },
  {
    untilDay: 1095,
    stage: 'Phase 4 (Year 3) — Systemized growth (5,000→15,000): team executes',
    countries: 'All active markets + BD (Bengali) / EG (Arabic) IF their content trials passed',
    language: 'Urdu + English (+Bengali/Arabic behind their gates)',
    budget: 'Multi-market paid engine, per-market CAC lines reviewed monthly',
  },
  {
    untilDay: 1460,
    stage: 'Phase 5 (Year 4) — Compounding (15,000→30,000): retention economics lead',
    countries: 'Portfolio of proven markets — quarterly kill/scale per market',
    language: 'Per-market as proven',
    budget: 'Reinvest commission into the winning-market ads; kill losers on data',
  },
  {
    untilDay: PLAN_TOTAL_DAYS,
    stage: 'Phase 6 (Year 5) — The 50k push (30,000→50,000)',
    countries: 'Scaled portfolio; new markets only with dedicated per-market owners',
    language: 'Per-market',
    budget: 'Per-market P&L discipline — transparency spine and No-Advice line never change',
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

  // The daily non-negotiables (cadence templates, seed-02 §1 + seed-07) —
  // the online engine AND the physical engine run together every day.
  activities.push('Telegram community touch: 1–2 posts, all questions <24h (20m)');
  activities.push('Technical analysis post — levels/structure, education never signals (20m)');
  activities.push('Retention due-list touches (15m) + IB follow-ups (15m)');
  activities.push('Physical IB Expansion: today\'s area outreach — visit/call/proposal (30m, see Physical tab)');
  activities.push('Personal trading: 5-question check-in + journal (15m)');

  // Facebook is a discovery skim — 2-3 clip reposts/wk (platform playbook);
  // TikTok/IG are auto-repost shelves (zero native minutes, locked verdict).
  if (['tuesday', 'thursday', 'saturday'].includes(weekdayName)) {
    activities.push('Facebook groups: 2–3 clip reposts into PK groups (10m)');
  }
  if (weekdayName === publishDay) {
    activities.push('Auto-repost clips to TikTok + Instagram (one-click only — zero native effort by locked verdict)');
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
  if (dayNumber === 84) {
    activities.push('EN ENGINE PREP: Nigeria/Kenya mirrors begin day 91 (founder decision) — pick the 5 proven PK winners to mirror first; if fewer than 5 winners exist yet, that is the risk signal to slow down');
  }
  if (dayNumber === 540) {
    activities.push('SOUTH AFRICA GATE: add SA EN market only if NG/KE CAC is at or under target — check the Monthly AI Review first');
  }

  return { platform, activities, expected, estimatedLoad: estimateLoad(activities) };
}

// Practical-day guard: sum the durations embedded in the activity lines
// ("(20m)", "(3h)", "(1.5h)") so every plan day carries its honest workload
// — the founder sees at a glance that the day fits, and an overloaded day
// is visible instead of silently impossible.
function estimateLoad(activities) {
  let minutes = 0;
  const re = /\((\d+(?:\.\d+)?)\s*(h|m)\b/g;
  for (const a of activities) {
    let m;
    while ((m = re.exec(a)) !== null) {
      minutes += m[2] === 'h' ? Math.round(parseFloat(m[1]) * 60) : parseInt(m[1], 10);
    }
    re.lastIndex = 0;
  }
  if (minutes === 0) return null;
  const h = Math.floor(minutes / 60), mm = minutes % 60;
  return `≈${h ? h + 'h ' : ''}${mm}m planned${minutes > 330 ? ' — heavy day: move one Optional item if needed' : ' — fits a founder day'}`;
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

function normalizeOpts(opts) {
  return {
    productionDay: opts.productionDay || 'monday',
    publishDay: opts.publishDay || 'tuesday',
    reviewDay: opts.reviewDay || 'friday',
    classDay: opts.classDay || 'saturday',
  };
}

function buildDayRow(dayNumber, dateStr, weekdayName, o, opts) {
  const phase = phaseForDay(dayNumber);
  const content = dayContent(dayNumber, dateStr, weekdayName, o);
  // Self-optimizing layer (Section 6): the caller passes the 28-day
  // learned winners/losers from real completion history; future days get
  // annotated so the plan visibly re-weights itself — never rewritten,
  // always explained.
  const todayStr = opts.todayStr || null;
  if (todayStr && dateStr > todayStr) {
    if (opts.focusLabel) {
      content.activities.unshift(`FOCUS (auto-learned): ${opts.focusLabel} — your highest-completing, highest-impact activity; do it first`);
    }
    if (opts.reduceLabel) {
      content.activities.push(`REDUCE (auto-learned): ${opts.reduceLabel} — high skip-rate in your history; halve its slot or fix its template`);
    }
  }
  return {
    day: dayNumber,
    totalDays: PLAN_TOTAL_DAYS,
    date: dateStr,
    weekday: weekdayName,
    estimatedLoad: content.estimatedLoad,
    stage: phase.stage,
    country: phase.countries,
    language: phase.language,
    budget: phase.budget,
    platform: content.platform,
    activities: content.activities,
    expectedResult: content.expected,
    note: NOTES[(dayNumber - 1) % NOTES.length],
  };
}

// Generate roadmap rows [offset, offset+count). Leave dates are skipped
// WITHOUT consuming a plan day — that is the "shift forward" rule: a 3-day
// leave pushes every later plan day 3 calendar days into the future.
export function generateGrowthDays(startDateStr, offset, count, opts = {}) {
  const start = Date.parse(startDateStr);
  if (!Number.isFinite(start)) return { days: [], hasMore: false };
  const leave = Array.isArray(opts.leavePeriods) ? opts.leavePeriods : [];
  const inLeave = (d) => leave.some((p) => p && p.start <= d && d <= p.end);
  const o = normalizeOpts(opts);

  const days = [];
  let dayNumber = 0;
  // Walk calendar dates from the start; each non-leave date is a plan day.
  // Bounded: PLAN_TOTAL_DAYS + a 135-day leave allowance caps the walk.
  for (let cal = 0; cal < PLAN_TOTAL_DAYS + 135 && dayNumber < offset + count; cal++) {
    const date = new Date(start + cal * DAY_MS);
    const dateStr = date.toISOString().slice(0, 10);
    if (inLeave(dateStr)) continue;
    dayNumber += 1;
    if (dayNumber > PLAN_TOTAL_DAYS) break;
    if (dayNumber <= offset) continue;
    days.push(buildDayRow(dayNumber, dateStr, DAY_NAMES[date.getUTCDay()], o, opts));
  }
  return { days, hasMore: days.length > 0 && days[days.length - 1].day < PLAN_TOTAL_DAYS, totalDays: PLAN_TOTAL_DAYS };
}

// The single plan day scheduled on a specific calendar DATE (Section 1,
// date-first execution): same walk, same leave-shifting, so picking Day 2 or
// Day 250 in the Home date picker shows exactly what the roadmap holds for
// that date. Returns null when the date is before Day 1, past the final plan
// day, or an approved leave day (callers show the leave banner instead).
export function planDayForDate(startDateStr, targetDateStr, opts = {}) {
  const start = Date.parse(startDateStr);
  if (!Number.isFinite(start) || !targetDateStr || targetDateStr < startDateStr) return null;
  const leave = Array.isArray(opts.leavePeriods) ? opts.leavePeriods : [];
  const inLeave = (d) => leave.some((p) => p && p.start <= d && d <= p.end);
  if (inLeave(targetDateStr)) return null;
  const o = normalizeOpts(opts);
  let dayNumber = 0;
  for (let cal = 0; cal < PLAN_TOTAL_DAYS + 135; cal++) {
    const date = new Date(start + cal * DAY_MS);
    const dateStr = date.toISOString().slice(0, 10);
    if (inLeave(dateStr)) continue;
    dayNumber += 1;
    if (dayNumber > PLAN_TOTAL_DAYS) return null;
    if (dateStr === targetDateStr) {
      return buildDayRow(dayNumber, dateStr, DAY_NAMES[date.getUTCDay()], o, opts);
    }
    if (dateStr > targetDateStr) return null;
  }
  return null;
}

// --- Feasibility model (the audit that sized this roadmap) ---------------
//
// Backward funnel from the founder-defined 50,000-active target. Each stage
// states its basis: FOUNDER GOAL (given), PLANNING ASSUMPTION (conservative
// mid-range figure, replaced by real funnel data as the Monthly AI Review
// accumulates it), or VERIFIED RANGE (industry-typical band for niche
// education content). Verdict: 365 days cannot carry ~67M cumulative reach
// on one founder's organic output — the practical horizon is 5 phased years
// with EN markets, paid probes behind their CAC gate, and delegation of
// non-trust work from Year 2.
export const FEASIBILITY = {
  target: 50000,
  horizonDays: PLAN_TOTAL_DAYS,
  verdict: '365 days is NOT enough. The funnel below needs ~67M cumulative reach; a single-founder organic engine peaks near ~1M reach/month even when mature. Practical horizon: 5 years (1,825 days), phased — Year 1 proves the machine, Years 2–3 scale it with EN markets + gated paid + a first hire, Years 4–5 compound it.',
  stages: [
    { stage: 'Total Audience Reached', required: '~67,000,000 (cumulative)', basis: 'Derived — from the chain below', note: 'Across all markets and 5 years; ≈1.1M/month average, weighted toward later years' },
    { stage: 'Engaged Users', required: '~4,000,000', basis: 'VERIFIED RANGE', note: '6% reach→engaged (niche education content typically 3–8%)' },
    { stage: 'Qualified Leads', required: '~323,000', basis: 'PLANNING ASSUMPTION', note: '8% engaged→qualified (course start / community join)' },
    { stage: 'Broker Account Opens', required: '~113,000', basis: 'PLANNING ASSUMPTION', note: '35% qualified→open — education-first funnels convert warm, not wide' },
    { stage: 'IB Registrations', required: '~96,000', basis: 'PLANNING ASSUMPTION', note: '85% of opens complete registration under the IB link' },
    { stage: 'Active Traders', required: '~77,000', basis: 'PLANNING ASSUMPTION', note: '80% of registrations place trades' },
    { stage: 'Active IB Clients', required: '50,000', basis: 'FOUNDER GOAL', note: '65% of traders stay active — retention economics carry the last mile' },
  ],
  assumptionNote: 'Every percentage above is a planning assumption or verified band, not a promise — the Monthly AI Review recalibrates this model against your real funnel every month.',
};

// --- Country strategy (Section 3: the multi-country master table) --------
//
// One row per market, every verdict from the seeded country playbooks
// (broker, language, platform, content, culture rules) and growth-stage
// gates. Conversion/CAC figures are PLANNING ASSUMPTIONS — clearly labeled,
// conservative, and replaced by real funnel numbers as the Monthly AI Review
// accumulates data (the ASSUMPTION_NOTE ships with the payload so the UI
// must show it).
export const ASSUMPTION_NOTE = 'Conversion/CAC figures are conservative planning assumptions — the Monthly AI Review replaces them with your real funnel numbers as data accumulates.';

export const COUNTRY_STRATEGY = [
  {
    country: 'Pakistan', priority: 'P1 — active', broker: 'Exness',
    language: 'Urdu / Roman-Urdu', platform: 'YouTube + Telegram + WhatsApp + FB groups',
    contentType: 'Gold-led education, scam-anatomy, halal series, honest small-account math',
    audience: 'Beginners, small accounts, gold traders, jewellers, business owners',
    postingFrequency: '1 long-form + 1 live class + 3–5 clips/wk; TG 1–2 posts daily',
    promotion: 'Organic-first; FB Ads capped-CAC probes only after the 300-client gate',
    organicStrategy: 'The trust machine: YT engine → free course → TG community → WA circle; FB groups as discovery skim',
    paidStrategy: 'FB Ads only, only after 300 activated clients, proven organic creatives as ads, hard CAC cap',
    expectedConversion: '~1–2% viewer→course, ~10–15% course→IB (planning assumption)',
    expectedCac: 'PKR 0 organic; probe target <PKR 1,500/activated client when paid opens',
    expectedGrowth: 'Primary engine — majority of the first 1,000 activated clients',
  },
  {
    country: 'GCC (UAE/KSA/Qatar/Oman/Kuwait/Bahrain expats)', priority: 'P1 — dual-launch with Pakistan: international from day 1', broker: 'Exness Islamic — lead with it',
    language: 'Urdu + English', platform: 'YouTube + WhatsApp (Gulf evenings 8–11pm GST)',
    contentType: 'Halal-clarity (scholarly views, never verdicts), remittance-vs-investing, Eid/Ramadan gold timing',
    audience: 'Expat professionals 28–45, time-poor, highest LTV segment',
    postingFrequency: 'Same PK uploads timed for Gulf evenings (+1h/wk extra)',
    promotion: 'Organic only — trust-first segment; paid never leads here',
    organicStrategy: 'PK content Gulf-timed + WA inner circles + halal-clarity series + Ramadan/Eid rhythm',
    paidStrategy: 'None by design — paid never leads a trust-first, highest-LTV segment',
    expectedConversion: 'Higher per-lead value, lower volume (planning assumption)',
    expectedCac: '≈PKR 0 (marginal — rides Pakistan content)',
    expectedGrowth: 'Highest-LTV layer on the PK engine',
  },
  {
    country: 'Nigeria + Kenya', priority: 'P2 — EN mirrors from Day 91 (FOUNDER DECISION; researched gate was 300 clients — mirror only proven winners to contain the risk)', broker: 'Exness + Vantage trial in parallel (both accept PK-based partners for these markets)',
    language: 'English', platform: 'YouTube EN + WhatsApp-heavy (KE), faster pace than ur market',
    contentType: 'EN mirrors of PROVEN winners only — small-account truth, prop-firm reality',
    audience: 'Young mobile-first traders; small accounts',
    postingFrequency: 'Start 1 EN mirror/wk at day 91; full cadence when 5+ winners are mirrored',
    promotion: 'Capped-CAC probes still wait for the 300-client gate',
    organicStrategy: 'EN mirrors of proven winners + WhatsApp-heavy community (KE) + prop-firm/small-account lanes',
    paidStrategy: 'Capped-CAC probes from the 300-client gate; NG first (larger market), KE follows on data',
    expectedConversion: 'Faster funnel, lower LTV than GCC (planning assumption)',
    expectedCac: 'Probe target set at gate review; watch regulatory tightening both markets',
    expectedGrowth: 'The second engine — scales the path from 1,000 toward 10,000+',
  },
  {
    country: 'South Africa', priority: 'P3 — enters ~Day 540, ONLY if NG/KE CAC holds (planning assumption, verify broker terms first)', broker: 'Exness (verify SA partner acceptance at the gate); alternative: Vantage',
    language: 'English', platform: 'YouTube EN (rides the NG/KE library), FB groups',
    contentType: 'Same EN library + SA-specific broker/regulatory clarity (FSCA-aware framing)',
    audience: 'Retail forex traders — one of Africa\'s largest regulated retail markets',
    postingFrequency: 'No new production — EN library + 1 SA-specific piece/month',
    promotion: 'Paid probes from entry (market is paid-mature), same CAC discipline',
    organicStrategy: 'EN library reuse + FSCA-aware broker-clarity content + FB groups',
    paidStrategy: 'Probes from entry (paid-mature market); budget from NG/KE actuals',
    expectedConversion: 'Between NG/KE and GCC (planning assumption)',
    expectedCac: 'Set from NG/KE actuals at the gate',
    expectedGrowth: 'Third engine — Year 2–3 scale layer',
  },
  {
    country: 'India', priority: 'DEFERRED — RBI hostility to forex IB models (verified research); re-check yearly', broker: 'None practical from Pakistan today',
    language: '—', platform: '—', contentType: '—',
    audience: 'Largest Urdu/Hindi-understanding audience — the content already serves diaspora viewers organically',
    postingFrequency: '—', promotion: 'Zero minutes; organic diaspora views are free upside, never a target',
    expectedConversion: '—', expectedCac: '—',
    expectedGrowth: 'None until the regulatory picture changes',
  },
  {
    country: 'Bangladesh', priority: 'GATE — Bengali AI-localization trial first', broker: 'Exness (verify partner terms at trial)',
    language: 'Bengali (trial: 5–10 pieces, native QC must pass)', platform: 'Decided by trial',
    contentType: 'Localized mirrors of proven winners', audience: 'TBD by trial',
    postingFrequency: '—', promotion: 'None before the content gate passes',
    expectedConversion: 'Unknown — that is what the trial measures', expectedCac: '—',
    expectedGrowth: 'Never build an audience you cannot yet serve — content gate first',
  },
  {
    country: 'Egypt', priority: 'GATE — Exness client-acceptance verification FIRST', broker: 'Verify before ANY minutes spent',
    language: 'Arabic (MSA-vs-dialect decided inside trial)', platform: 'Decided by trial',
    contentType: '"Protect what you have" framing (devaluation trauma) — never "grow what you have"',
    audience: 'TBD by trial', postingFrequency: '—', promotion: 'None before verification',
    expectedConversion: '—', expectedCac: '—',
    expectedGrowth: 'Zero minutes before broker verification — locked rule',
  },
  {
    country: 'Rejected/Deferred', priority: 'Malaysia REJECT (Exness structural) · Indonesia DEFER 2027-07 · India DEFER (RBI) · EU/UK/US/AU REJECT (regulatory)',
    broker: '—', language: '—', platform: '—', contentType: '—', audience: '—',
    postingFrequency: '—', promotion: 'Zero minutes by locked verdict — re-read the opportunity-cost analysis if tempted',
    expectedConversion: '—', expectedCac: '—', expectedGrowth: '—',
  },
];

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
