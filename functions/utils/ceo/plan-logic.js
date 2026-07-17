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

// Phase gates from the blueprint (§2) — METRIC-triggered, not date-triggered.
// The day ranges are planning windows only; a gate advances on hitting its
// exit metric (or holds/fixes if missed by >50% for two quarters — never
// skip a gate by spending more). Numbers are the blueprint's honest ones,
// which REPLACE the OS's prior over-optimistic targets (it had 1,000 actives
// by month 12; the real benchmark is 100 by month 9).
const PHASES = [
  {
    untilDay: 270, // ~Month 9
    stage: 'Phase 1 — Proof (Months 1–9): Pakistan ONLY, prove the funnel',
    countries: 'Pakistan only (native language + trust, zero localization cost). Gulf-expat tagging begins Month 3 on the SAME content.',
    language: 'Urdu (with English trading terms)',
    budget: '$100–150/mo, organic-first. Paid stays $0 until the exit gate.',
    target: 'EXIT GATE: 100 actives + $1,000/mo commission run-rate. Ship short-form daily + weekly long-form/live without a miss.',
  },
  {
    untilDay: 540, // ~Month 18
    stage: 'Phase 2 — Pakistan engine (Months 9–18): systemize + first hire',
    countries: 'Pakistan deepened + Gulf-expat VIP tracking. English content track begins repurposing top-30 videos late-phase.',
    language: 'Urdu (English prep)',
    budget: 'Paid ON from reinvested commission, ≤50% of trailing month; SEO 30 pages; referral + rebate programs.',
    target: 'EXIT GATE: 500 actives + $5,000/mo + funnel metrics at benchmark. First hire (video editor ~$150–250) at ~$1.5K/mo.',
  },
  {
    untilDay: 900, // ~Month 30
    stage: 'Phase 3 — English expansion + sub-IB launch (Months 18–30)',
    countries: 'Nigeria (first), then South Africa (FSCA trust) + Kenya (M-Pesa) — only after PK hits its gate. Sub-IB program launches with first partners from your own community.',
    language: 'Urdu + English',
    budget: 'Paid scales per-market on commission; community manager + Nigeria-based creator + partner manager hired.',
    target: 'EXIT GATE: 2,500 actives + $25,000/mo + 25 producing sub-IBs.',
  },
  {
    untilDay: 1440, // ~Month 48
    stage: 'Phase 4 — Localized expansion (Months 30–48): native hires',
    countries: 'Indonesia + Vietnam (native in-market content leads hired, funnels cloned+localized); Arabic/Egypt scoping. One language = one dedicated hire.',
    language: 'Urdu + English + Bahasa/Vietnamese (behind hires)',
    budget: 'Multi-market paid engine, per-market P&L reviewed monthly; sub-IB network 100–150 producing partners.',
    target: 'EXIT GATE: 10,000 actives.',
  },
  {
    untilDay: PLAN_TOTAL_DAYS, // ~Month 60
    stage: 'Phase 5 — Partner-network scale (Months 42–60): the 50K engine',
    countries: 'White-label ecosystem for vetted community leaders across Africa/SEA/MENA/LATAM (master-IB override); 400+ partners produce the majority of volume.',
    language: 'Per-market via partners',
    budget: 'Governance layer: compliance officer, data analyst, country managers. Per-market P&L discipline.',
    target: '25,000–40,000 actives expected; 50,000 = BEST case (expected reaches it ~Year 6–7). Every intermediate state is itself a strong business.',
  },
];

function phaseForDay(dayNumber) {
  return PHASES.find((p) => dayNumber <= p.untilDay) || PHASES[PHASES.length - 1];
}

// Live phase context for the Executive Overview (Section 1) — the current
// plan day, its phase, and that phase's monthly-ish target. dayNumber is
// derived by the endpoint from plan.start_date; activeClients is the real
// CRM count. Pure so the endpoint stays a thin fetch+assemble.
export function currentPhaseContext(dayNumber, activeClients) {
  const phase = phaseForDay(Math.max(1, dayNumber || 1));
  return {
    currentDay: Math.max(1, dayNumber || 1),
    totalDays: PLAN_TOTAL_DAYS,
    currentPhase: phase.stage,
    monthlyTarget: phase.target,
    activeClients: activeClients || 0,
    progressPct: Math.round((10000 * (activeClients || 0)) / 50000) / 100,
  };
}

// Per-campaign execution detail for every channel activity a plan day can
// schedule. This is what makes the DAY row self-sufficient: the founder never
// has to cross-reference the Social Strategy table to know who to target,
// in which language, on what budget, with which CTA and KPI. Audience
// interests are the concrete researched targeting sets from the seeded
// audience-playbook + country-playbook rows (not generic labels).
const CHANNEL_PLAYBOOK = {
  telegram_community: {
    activity: 'Telegram community touch', platform: 'Telegram', country: 'Pakistan + GCC',
    audience: 'Interests: XAUUSD/gold trading, forex beginners, Exness/broker verification, halal investing, scam awareness, prop-firm challenges · PK+GCC, 22–45, mobile-first, Roman-Urdu readers',
    language: 'Urdu / Roman-Urdu', mode: 'Organic', budget: '$0',
    duration: 'Daily, continuous (20m/day)',
    cta: 'Free course link — never a deposit ask; 1 in 3 posts carries NO ask',
    kpi: 'Reply-rate; every question answered <24h; 1–2 IB-ready members flagged',
    expected: '~2 qualified conversations/day',
  },
  technical_analysis: {
    activity: 'Technical analysis post', platform: 'Telegram (repost: Facebook)', country: 'Pakistan + GCC',
    audience: 'Interests: gold/XAUUSD levels, BTC structure, support/resistance, price action · active traders 25–45',
    language: 'Urdu / Roman-Urdu', mode: 'Organic', budget: '$0',
    duration: 'Daily, continuous (20m/day)',
    cta: '"Levels nikalna seekhein — free course lesson 4" (education, never a signal)',
    kpi: '1 authority post/day; saves & forwards; replies answered',
    expected: 'Authority positioning — "yeh banda market samajhta hai"',
  },
  retention_touches: {
    activity: 'Retention due-list touches', platform: 'WhatsApp', country: 'Pakistan + GCC',
    audience: 'Segment-matched: Day-1 activations, milestone hitters, 14d-silent at-risk clients, high-equity VIPs',
    language: 'Urdu (voice notes)', mode: 'Organic', budget: '$0',
    duration: 'Daily, continuous (15m/day)',
    cta: 'No CTA — retention touches build the relationship; the ladder converts on its own',
    kpi: 'Due-list cleared; Day-7 activity of welcomed clients ↑; churn saves',
    expected: 'Zero silent clients — retention is the 50k engine',
  },
  ib_followups: {
    activity: 'IB follow-ups', platform: 'WhatsApp (personal)', country: 'Pakistan + GCC',
    audience: 'Trust-triggered only: course completed + community-active + a real broker question, OR ~30 days engaged',
    language: 'Urdu', mode: 'Organic', budget: '$0',
    duration: 'Daily, continuous (15m/day)',
    cta: '"Jab tayyar hon, batayein" — verification + supervision framing, never pressure',
    kpi: '1 conversation advanced a stage; zero trust cost',
    expected: 'Steady lead→activated conversion without urgency tactics',
  },
  physical_outreach: {
    activity: 'Physical IB Expansion outreach', platform: 'In-person / phone', country: 'Pakistan (current cycle area)',
    audience: 'Computer academies, freelancing institutes, AI/skill centres, universities, technical colleges — decision-makers (principal/owner)',
    language: 'Urdu', mode: 'Organic (travel cost only)', budget: '$0 (local travel)',
    duration: 'Daily within the area\'s 15-day cycle (30m/day)',
    cta: 'Free demo class for their students — zero cost to the institute',
    kpi: '1–2 institutes contacted; every contact logged with a follow-up date',
    expected: 'Institute batches → community → IB clients',
  },
  facebook_groups: {
    activity: 'Facebook group clip reposts', platform: 'Facebook (groups)', country: 'Pakistan',
    audience: 'Interests: PK trading/investing groups, gold rate watchers, freelancing & side-income communities, forex beginners',
    language: 'Urdu / Roman-Urdu', mode: 'Organic', budget: '$0',
    duration: '2–3× per week (10m each)',
    cta: 'Usually none (trust post); occasionally free course',
    kpi: 'Referral traffic only — never vanity engagement',
    expected: 'Discovery skim into the funnel; zero native production',
  },
  youtube_video: {
    activity: 'Weekly long-form video (PRIORITY 2)', platform: 'YouTube', country: 'Pakistan + Gulf expats (EN repurpose in Phase 3)',
    audience: 'Search intent: "forex kya hai", "MT5 kaise use karen", "$100 se trading", "Exness deposit Pakistan", "scam broker pehchan" · the first 20 videos ARE the free course',
    language: 'Urdu (Roman-Urdu title targeting Urdu search queries)', mode: 'Organic', budget: '$0 (~$30 one-time mic)',
    duration: '1–2/wk, 8–15 min',
    cta: '"Poora seekhna hai to free course — link description mein" (never deposit); Telegram + IB link with disclosure',
    kpi: 'Watch-time ≥40%; 10K subs by M9',
    expected: 'Authority + evergreen search; playlist = course = lead magnet (zero extra production)',
  },
  publish_chain: {
    activity: 'Publish chain (article + clips)', platform: 'Website/GEO + Telegram/Facebook/Instagram', country: 'All (search is borderless)',
    audience: 'Search + AI-search intent (the same questions the video answers) + social browsers',
    language: 'Urdu content, EN title/meta', mode: 'Organic', budget: 'in tooling (hosting)',
    duration: 'Weekly, every publish day (2h)',
    cta: 'In-article: free course + related lessons',
    kpi: 'Article live ≤48h after the video; 3–5 clips queued; AI-search referrals',
    expected: 'One effort, six surfaces — the compounding half',
  },
  live_class: {
    activity: 'Weekly live class', platform: 'Live (YouTube/Telegram)', country: 'Pakistan + GCC (Gulf-evening friendly)',
    audience: 'Community members + course-completers (the conversion-ready pool)',
    language: 'Urdu', mode: 'Organic', budget: '$0',
    duration: 'Weekly fixed slot (1.5h)',
    cta: '"Course complete karne wale mujhse personal baat kar sakte hain"',
    kpi: 'Attendance + replay views',
    expected: 'The weekly ritual + conversion moment',
  },
  // PRIORITY 1 acquisition channel (blueprint §6.1) — short-form video is the
  // ONLY channel where $0 buys mass reach. This REPLACES the prior "TikTok
  // never / IG auto-repost only" verdict, which was the single biggest
  // strategic error: TikTok/Shorts/Reels are the growth engine, not a shelf.
  shortform_video: {
    activity: 'Short-form video — batch-record & post to your market\'s best platforms', platform: 'Per-country mix (see Short-form Platform Mix): PK = Facebook Reels + YouTube Shorts primary (TikTok unreliable in PK); Africa/SEA = TikTok-led', country: 'Pakistan + Gulf expats (Urdu)',
    audience: 'Never-traded + beginners (70%+ of views): "is trading real/halal/risky", 3-mistakes videos, gold chart breakdowns, signal-seller myth-busting, MT5/JazzCash how-tos',
    language: 'Urdu with English trading terms (natural code-switching)',
    mode: 'Organic (PRIORITY 1) — $30–50/mo boosts the single best Reel only',
    budget: '$0 (phone + free CapCut); optional $30–50/mo Reel boost',
    duration: 'Batch-record 2 days/wk; 1 short/day/platform (same asset, native re-uploads)',
    cta: 'Telegram link in bio/comments — every video',
    kpi: '30 shorts/mo · viewer→profile CTR ≥1.5% · ≥15 Telegram joins/10K views · 100K+ views/mo by M6',
    expected: 'Mass top-of-funnel reach at $0 — the primary lead engine',
  },
  facebook_ads: {
    activity: 'Facebook/Meta Ads (DEFERRED — opens only at $1,000/mo commission run-rate, ~Phase 1 exit / Month 9)', platform: 'Facebook/Meta Ads', country: 'Pakistan first (then Nigeria in Phase 3)',
    region: 'PK: Lahore, Karachi, Islamabad/Rawalpindi, Faisalabad + nationwide broad; NG (Phase 3): Lagos, Abuja',
    objective: 'Lead generation (instant forms) → Telegram bot; NOT traffic or engagement',
    audience: 'Broad 18–35, let the creative target; + retargeting: course-starters who stalled & video viewers 50%+',
    interests: 'Forex/gold trading, Exness, MT4/MT5, investing, financial literacy, freelancing/side-income, XAUUSD; exclude existing leads',
    language: 'Urdu (EN for NG later)', mode: 'PAID (accelerant, never the backbone)',
    budget: '$0 until the gate. WHY DELAYED (evidence): Meta needs ~50 conversions/wk to optimize (~$2,000/wk); at $150/mo, ads = donating to Meta. Once open: spend ≤50% of trailing-month commission. NOTE: $30–50/mo Reel BOOSTS of proven organic clips are allowed from day 1 (that is not a campaign).',
    duration: 'Rolling 2-week test cycles; kill any ad-set with CPL >$5 after $50 spend',
    cta: 'Free course lead form — never a deposit ask',
    kpi: 'Target CPL $1.50–3.00; paid spend ≤50% of trailing commission',
    expected: 'Paid accelerant — only after organic + commission prove the funnel',
  },
};

// One planned calendar date -> the day's platform + activity block, from the
// same week rhythm mission.js instantiates (production/publish/review/class/
// community) + the seeded platform cadences (FB reposts 2-3x/wk, monthly
// transparency report, monthly content audit, quarterly gates). campaignKeys
// mirror the pushed activities so every day row carries full per-campaign
// execution detail (country/audience/language/mode/budget/duration/CTA/KPI).
function dayContent(dayNumber, dateStr, weekdayName, opts) {
  const { productionDay, publishDay, reviewDay, classDay } = opts;
  const activities = [];
  const campaignKeys = [];
  let platform = 'Telegram + WhatsApp';
  let expected = 'All member questions answered <24h · ~2 qualified conversations';

  if (weekdayName === productionDay) {
    platform = 'YouTube (+ Telegram daily)';
    activities.push('Film weekly long-form video — ONE take, imperfect fine (3h)');
    campaignKeys.push('youtube_video');
    expected = '1 long-form filmed · watch-time >40% target';
  } else if (weekdayName === publishDay) {
    platform = 'Website/GEO (+ clips to TG/FB/IG)';
    activities.push('Publish chain: transcript → GEO article + 3–5 clips (2h)');
    campaignKeys.push('publish_chain');
    expected = 'Article live ≤48h after video · one effort, six surfaces';
  } else if (weekdayName === reviewDay) {
    platform = 'Founder OS (+ Telegram daily)';
    activities.push('Weekly review + KPI entry + email digest (1.5h)');
    expected = 'Review complete · next week’s Focus picked · no KPI gaps';
  }
  if (weekdayName === classDay) {
    platform = 'Live class (YouTube/TG) + community';
    activities.push('Live class: 30m teach + 15m honest market review + 15m Q&A (1.5h)');
    campaignKeys.push('live_class');
    expected = 'Attendance + replay views — the weekly conversion moment';
  }

  // The daily non-negotiables (cadence templates, seed-02 §1 + seed-07) —
  // the online engine AND the physical engine run together every day.
  // PRIORITY 1 (blueprint §6.1): 1 short-form video/day/platform — the $0
  // mass-reach lead engine. Batch-recorded 2 days/wk, posted daily.
  activities.push('Short-form video: post 1 short to YT Shorts + TikTok + FB/IG Reels — CTA → Telegram (15m; batch-record 2 days/wk)');
  campaignKeys.push('shortform_video');
  activities.push('Telegram community touch: 1–2 posts, all questions <24h (20m)');
  campaignKeys.push('telegram_community');
  activities.push('Technical analysis post — levels/structure, education never signals (20m)');
  campaignKeys.push('technical_analysis');
  activities.push('Retention due-list touches (15m) + IB follow-ups (15m)');
  campaignKeys.push('retention_touches', 'ib_followups');
  activities.push('Physical IB Expansion: today\'s area outreach — visit/call/proposal (30m, see Physical tab)');
  campaignKeys.push('physical_outreach');
  activities.push('Personal trading: 5-question check-in + journal (15m)');

  // Facebook groups — genuine participation (answer questions, never spam
  // links), profile funnels to Telegram. 15m/day cap (blueprint §6.5).
  if (['tuesday', 'thursday', 'saturday'].includes(weekdayName)) {
    activities.push('Facebook groups: answer questions genuinely in PK forex groups, profile → Telegram (15m cap)');
    campaignKeys.push('facebook_groups');
  }
  // Paid is gate-conditional ($1,000/mo commission run-rate ≈ Phase 1 exit,
  // ~Month 9 / day 270 — blueprint §6.6), never calendar-forced. It surfaces
  // as a planned spec from ~Month 6 so the founder sees the full gate before
  // it opens, and never spends before commission funds it.
  if (dayNumber > 150) campaignKeys.push('facebook_ads');

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
  if (dayNumber === 255) {
    activities.push('PHASE 1 EXIT CHECK (~Month 9): are you at 100 actives + $1,000/mo commission? If yes, open paid ads (≤50% of trailing commission) + hire a video editor. If <50% of gate for 2 quarters, STOP scaling and fix the funnel (do not spend more).');
  }
  if (dayNumber === 525) {
    activities.push('PHASE 2 EXIT / ENGLISH-EXPANSION GATE (~Month 18): only if 500 actives + $5K/mo — begin English by repurposing your top-30 videos, Nigeria first. Do NOT expand before the PK engine hits its gate.');
  }

  return {
    platform, activities, expected,
    estimatedLoad: estimateLoad(activities),
    campaigns: campaignKeys.map((k) => CHANNEL_PLAYBOOK[k]).filter(Boolean),
  };
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
    campaigns: content.campaigns,
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
// Backward funnel from the founder-defined 50,000-active target, using the
// blueprint's VERIFIED education-first / emerging-market benchmarks (§2).
// Each stage states its basis: FOUNDER GOAL (given) or VERIFIED RANGE
// (industry-typical band). Verdict: 50K is the BEST case from a $150/mo solo
// start (expected ~Year 6–7); ~80% of it must come from a sub-IB partner
// network in Years 3–5. Gates are metric-triggered, never date-triggered.
export const FEASIBILITY = {
  target: 50000,
  horizonDays: PLAN_TOTAL_DAYS,
  verdict: 'HONEST MATH (blueprint §2): 50,000 actives is the BEST case from a $150/mo solo start — reached in Year 5 only if the content flywheel + sub-IB network compound early. The EXPECTED case reaches it in ~Year 6–7 (20K–35K by Y5). No solo founder gets there directly: ~80% of the 50K must come from a sub-IB partner network in Years 3–5. Gates are metric-triggered, never date-triggered — every intermediate state (2K, 5K, 20K actives) is itself a strong business.',
  stages: [
    { stage: 'Short-form views', required: '~250M–500M cumulative', basis: 'VERIFIED RANGE', note: '~1 active per 5,000–10,000 views — the $0 top of funnel' },
    { stage: 'Community leads (TG/WA/email)', required: '~4,000,000+', basis: 'VERIFIED RANGE', note: '1–3% of engaged viewers → lead; ~1 active per 80–120 leads' },
    { stage: 'Exness registrations (under IB link)', required: '~500,000–900,000', basis: 'VERIFIED RANGE', note: '8–12% lead→registration' },
    { stage: 'First deposits (FTD)', required: '~150,000+', basis: 'VERIFIED RANGE', note: '20–30% registration→FTD (WhatsApp deposit-assist pushes the top of this range)' },
    { stage: 'Active at month 3', required: '~65,000–75,000', basis: 'VERIFIED RANGE', note: '40–50% FTD→90-day active — the churn danger zone is weeks 0–12' },
    { stage: 'Active IB Clients (net of churn)', required: '50,000', basis: 'FOUNDER GOAL', note: 'At 6%/mo churn you replace ~3,000/mo just to stand still — retention is where the 50K is won or lost' },
  ],
  assumptionNote: 'Benchmarks are the blueprint\'s verified education-first / emerging-market funnel ranges ($10/active/mo, 6% churn). Not a promise — the Monthly AI Review recalibrates against your real funnel monthly. The two model sensitivities are ARPU/active and churn.',
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
    language: 'Urdu / Roman-Urdu', platform: 'Short-form (P1): Facebook Reels + YouTube Shorts (TikTok when available) · YT long-form · Telegram · WhatsApp · FB groups',
    contentType: 'Gold-led education, scam-anatomy, halal series, honest small-account math',
    audience: 'Beginners, small accounts, gold traders, jewellers, business owners',
    postingFrequency: '1 short/day (Shorts+TikTok+Reels) + 1–2 long-form/wk + daily TG note; live Q&A Sat',
    promotion: 'Organic-first; Meta Ads deferred until $1,000/mo commission run-rate (≈M9)',
    organicStrategy: 'Short-form video (P1) → Telegram + YouTube free course → WhatsApp deposit-assist → IB-gated VIP → survival-path retention',
    paidStrategy: 'Meta Ads only after $1,000/mo commission; ≤50% of trailing commission; CPL $1.50–3.00; kill CPL >$5',
    expectedConversion: '1–3% viewer→lead · 8–12% lead→registration · 20–30% reg→FTD · 40–50% FTD→90d-active (verified benchmarks)',
    expectedCac: '$0 organic; ~1 active per 80–120 leads or ~5–10K short-form views',
    expectedGrowth: 'Primary engine, Months 1–9 ONLY — proving ground to 100 actives ($1K/mo). ARPU low ($5–10) accepted here',
  },
  {
    country: 'Gulf expats (UAE/KSA/Qatar/Oman/Kuwait/Bahrain)', priority: 'MULTIPLIER — from Month 3, NOT a separate launch', broker: 'Exness (swap-free/Islamic accounts)',
    language: 'Urdu (the SAME content)', platform: 'Same uploads, tagged + community-segmented for Gulf viewers',
    contentType: 'No separate production — identify & VIP-track Gulf-based Pakistani viewers of existing Urdu content',
    audience: '9M+ overseas Pakistanis; deposits 5–10× domestic — disproportionately land in the high-value segment',
    postingFrequency: 'Zero extra — expat-focused tags + Gulf-evening timing on existing content',
    promotion: 'Organic only — a near-free LTV upgrade on content you already make',
    organicStrategy: 'Community segmentation to surface Gulf viewers → VIP track → founder relationship (highest LTV)',
    paidStrategy: 'None — never a separate ad spend; it rides the Pakistan engine',
    expectedConversion: 'Higher per-lead value, lower volume',
    expectedCac: '≈$0 (marginal — rides Pakistan content)',
    expectedGrowth: 'The ARPU multiplier that absorbs low PK deposit sizes (blueprint expat multiplier)',
  },
  {
    country: 'Nigeria + South Africa + Kenya', priority: 'P2 — ENGLISH EXPANSION, Phase 3 (Months 18–30) — ONLY after the PK engine hits its gate (500 actives/$5K/mo)', broker: 'Exness FIRST (FSCA-licensed in SA, CMA-licensed in KE = strongest local trust). Vantage/FP Markets/HFM as backup only',
    language: 'English (reuses ~70% of the library)', platform: 'YouTube EN + short-form; WhatsApp-heavy (KE, M-Pesa rails)',
    contentType: 'EN repurpose of PROVEN winners — small-account truth, prop-firm reality, gold affinity',
    audience: 'Largest African retail forex market (NG); mature higher-LTV base (SA); high-quality small market (KE)',
    postingFrequency: 'Repurpose top-30 videos EN first; dedicated channels once a market is producing',
    promotion: 'Paid from reinvested commission, PK-proven creatives; NG first (largest, lowest CPMs)',
    organicStrategy: 'Repurpose proven library + local payment/regulatory trust messaging (FSCA in SA, M-Pesa in KE)',
    paidStrategy: 'Commission-funded, same ≤50%-of-trailing rule; highest volume-per-dollar expansion available',
    expectedConversion: 'Faster funnel, lower LTV than Gulf (English benchmarks)',
    expectedCac: '$0 organic; commission-funded paid, CPL set from PK actuals',
    expectedGrowth: 'The second engine — scales toward 2,500 actives ($25K/mo) + first sub-IBs. NOT before Phase 3',
  },
  {
    country: 'Sub-IB / partner network', priority: 'THE 50K ENGINE — Phase 3 onward (Months 18+)', broker: 'Exness sub-partner structure (verify current override terms before Phase 3)',
    language: 'Per partner\'s market', platform: 'Partner\'s own channels — you provide the toolkit',
    contentType: 'White-label: your course + tools + funnel playbook + landing page + training',
    audience: 'Your best students/helpers first (loyal, credible), then micro-influencers (1K–50K followers) in target markets',
    postingFrequency: 'Partner Telegram group + monthly performance calls + co-marketing assets',
    promotion: 'Commission override on partner volume — NOT your ad budget',
    organicStrategy: 'Recruit from your community, graduated split (trial on first 10 referrals → full toolkit at 10+ actives)',
    paidStrategy: 'None — partners fund their own; you take a master-IB override',
    expectedConversion: 'P3: 25 producing sub-IBs · P4: 150 · P5: 400+ (60–100 actives each)',
    expectedCac: '≈$0 to you — partners produce the majority of Year 3–5 volume',
    expectedGrowth: 'Direct acquisition ceilings at ~5–10K actives; sub-IBs produce the remaining 80% toward 50K',
  },
  {
    country: 'Indonesia + Vietnam', priority: 'P4 — Phase 4 (Months 30–48), GATED on a native-language in-market hire', broker: 'Exness (verify per-market acceptance at the hire gate)',
    language: 'Bahasa Indonesia / Vietnamese — one language = one dedicated native hire, never translation',
    platform: 'Localized funnel cloned per market (payments, platform mix, compliance review)',
    contentType: 'Largest SEA opportunities; funnel cloned + localized only after a native content lead is hired',
    audience: 'Huge SEA retail demand — cannot be served solo from Pakistan',
    postingFrequency: 'Set by the in-market hire', promotion: 'Commission-funded, per-market',
    organicStrategy: 'Clone the proven PK/EN funnel with a native lead; never machine-translate',
    paidStrategy: 'Per-market from commission', expectedConversion: 'Set by localized funnel',
    expectedCac: 'Set at market entry', expectedGrowth: 'Phase 4 scale layer toward 10,000 actives',
  },
  {
    country: 'India', priority: 'EXCLUDED — never (this plan). RBI Alert List / FEMA penal risk to CLIENTS makes an IB business here unethical + unsustainable', broker: 'None — do not refer Indian clients to Exness',
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
    country: 'Excluded markets', priority: 'EXNESS RESTRICTED — exclude from ALL targeting: USA, UK, EU, Canada, Australia, Iran, North Korea. Plus India (RBI/FEMA client risk)',
    broker: 'Exness cannot serve these — no funnel, no ad targeting, ever',
    language: '—', platform: '—', contentType: 'UK/US Urdu VIEWERS still grow the channel, but must NEVER be onboarded to Exness',
    audience: '—', postingFrequency: '—',
    promotion: 'Zero minutes; exclude in every ad-targeting geo filter (verified restriction)',
    expectedConversion: '—', expectedCac: '—', expectedGrowth: '—',
  },
  {
    country: 'Later optionality (Phase 5)', priority: 'After 10,000 actives: Egypt (Arabic hire), Bangladesh, Philippines, Morocco, Turkey; LATAM only via white-label partners, never first-party',
    broker: 'Per-market at the gate', language: 'Native hires only', platform: 'Partner/localized',
    contentType: 'Optionality, not a Year 1–4 target', audience: '—', postingFrequency: '—',
    promotion: 'None before 10,000 actives', expectedConversion: '—', expectedCac: '—',
    expectedGrowth: 'Optionality layer once the network engine is proven',
  },
];

// --- Executive Overview (Section 1) — the complete business picture ------
//
// Budgets are the blueprint's real $100–150/mo constraint (USD), gated so
// paid is only ever funded from earned commission (never savings). Commission
// is WORKING CAPITAL, not income, until Phase 2 exit. Live fields (progress,
// current phase, monthly target) are computed via currentPhaseContext().
export const EXECUTIVE_OVERVIEW = {
  durationLabel: '5-year plan · 50K = BEST case in Y5, expected ~Y6–7 (metric-gated, not date-gated)',
  budget: {
    organicMonthly: '$100–150/mo total: $20 AI assistant · $10 domain+Cloudflare+link page · $0 email/bot (free tiers) · $40 best-Reel boost · $30–80 buffer (mic, thumbnails, tools). The engine is founder TIME, not cash.',
    paidGate: 'Paid = $0 until commission run-rate ≥ $1,000/mo (~Phase 1 exit, Month 9). Reason: Meta needs ~50 conversions/wk (~$2,000/wk) to optimize — at $150/mo, ads = donating to Meta.',
    paidMonthlyWhenActive: 'Once open: paid spend ≤ 50% of trailing-month commission; kill any ad-set with CPL >$5 after $50 spend.',
    totalEstimated: 'Year 1 is ~$150/mo from savings; from the first commission dollar the reinvestment rule takes over — paid is self-funding, never from savings.',
    monthlyEnvelope: 'Reinvestment rule: 60% marketing · 20% product/tools · 10% reserve (3-mo runway) · 10% founder (rises to 30% only after reserve funded + phase gate met).',
  },
  countryBudget: [
    { country: 'Pakistan (Months 1–9, ONLY)', spend: 'Bulk of organic time; first Reel boosts; first paid at the $1K/mo gate', note: 'Native language + trust, $0.5–1.2 CPMs, JazzCash/Easypaisa rails — the proving ground' },
    { country: 'Gulf expats (from Month 3)', spend: '≈$0 marginal — SAME Urdu content, tagged for expat viewers', note: 'Deposit sizes 5–10× Pakistan — a near-free LTV multiplier, NOT a separate market' },
    { country: 'Nigeria / South Africa / Kenya (Phase 3, M18–30)', spend: 'English content reuses ~70% of library; paid from reinvested commission', note: 'English expansion only after PK engine hits gate' },
    { country: 'Indonesia / Vietnam / Egypt (Phase 4+)', spend: 'Gated on native-language hires — one language = one dedicated hire', note: 'Never translation agencies' },
    { country: 'Sub-IB partner network (Phase 3+)', spend: 'Commission override, not ad budget', note: 'The real path from ~10K → 50K actives' },
  ],
  platformBudget: [
    { platform: 'Short-form video (YT Shorts/TikTok/Reels)', spend: '$0 + optional $30–50/mo best-Reel boost', note: 'PRIORITY 1 — the $0 mass-reach lead engine' },
    { platform: 'YouTube long-form', spend: '$0 (~$30 one-time mic)', note: 'Authority + evergreen search; the playlist IS the free course' },
    { platform: 'Telegram / WhatsApp', spend: '$0', note: 'Community hub + the conversion/deposit-assist floor' },
    { platform: 'Facebook (page + groups, then Ads)', spend: '$0 organic; paid only post-$1K/mo gate', note: 'Ads reuse proven organic creatives' },
    { platform: 'Website / GEO / SEO', spend: '$10/mo (domain + Cloudflare free)', note: 'Phase 2+ compounding SEO asset' },
  ],
  expected: {
    reach: '~5,000–10,000 short-form views ≈ 1 active (blueprint funnel math)',
    leads: '~1 active per 80–120 community leads',
    activeClients: '50,000 active funded traders (BEST case Y5; expected ~Y6–7)',
  },
  paidCampaigns: [
    { platform: 'Facebook/Meta Ads (DEFERRED)', country: 'Pakistan first', audience: 'Broad 18–35, let creative target; UGC screen-recording creatives', language: 'Urdu', budget: '$0 until $1,000/mo commission gate; then ≤50% of trailing commission', duration: 'Lead-gen forms → Telegram bot; kill CPL >$5 after $50', expected: 'Target CPL $1.50–3.00 — accelerant, not backbone' },
    { platform: 'Facebook/Meta Ads (retargeting)', country: 'Pakistan', audience: 'Course-starters who stalled + 50%+ video viewers', language: 'Urdu', budget: 'Smallest line first', duration: 'Always-on once opened', expected: 'Cheapest conversions in the account' },
    { platform: 'Facebook/Meta Ads', country: 'Nigeria (Phase 3)', audience: 'Young mobile-first small accounts', language: 'English', budget: 'From reinvested commission', duration: '2-week test cycles', expected: 'CPL set from PK actuals' },
  ],
  assumptionNote: 'Budget follows the blueprint\'s real $100–150/mo solo-founder constraint. Commission is working capital, not income, until Phase 2 exit — the Monthly AI Review replaces these with your real spend/CAC as data accumulates.',
};

// --- Social Media Strategy (Section 5) — only practically useful channels -
export const SOCIAL_STRATEGY = [
  { platform: 'Short-form video — YT Shorts + TikTok + FB/IG Reels (PRIORITY 1)', country: 'PK + Gulf expats', language: 'Urdu + EN trading terms', audience: 'Never-traded + beginners (70% of views): myth-busting, 3-mistakes, gold breakdowns, MT5/JazzCash how-tos', organic: 'PRIMARY channel — batch-record 2 days/wk; 1 short/day/platform (same asset, native re-uploads); CTA → Telegram', paid: '$30–50/mo boosts the single best Reel only', budget: '$0 + optional $30–50/mo boost', duration: 'Daily', kpi: '30 shorts/mo · CTR ≥1.5% · ≥15 TG joins/10K views · 100K views/mo by M6', result: 'The $0 mass-reach lead engine — where growth actually comes from' },
  { platform: 'YouTube long-form (PRIORITY 2)', country: 'PK + Gulf expats', language: 'Urdu', audience: 'Search intent + beginners', organic: '1–2 videos/wk, 8–15 min; first 20 videos ARE the free course (playlist = course = lead magnet); Urdu search-query titles', paid: 'None', budget: '$0 (one-time ~$30 mic)', duration: 'Continuous', kpi: 'Watch-time ≥40%; 10K subs by M9', result: 'Authority + evergreen search that converts' },
  { platform: 'Telegram (PRIORITY 3)', country: 'PK + Gulf expats', language: 'Urdu / Roman-Urdu', audience: 'Community members, warm leads', organic: '1 public channel (daily gold note, 2–3 posts/day, NO signals) + 1 VIP group (IB-gated); Sat voice-chat Q&A', paid: 'None', budget: '$0 (free bot)', duration: 'Continuous', kpi: '30-day retention ≥60%; member→verified-Exness ≥5% by M6; DAU/MAU ≥25%', result: 'The community hub + conversion midpoint' },
  { platform: 'WhatsApp (PRIORITY 4)', country: 'PK + Gulf expats', language: 'Urdu', audience: 'Registrants, funded, active clients', organic: 'WhatsApp Business: labels = pipeline stages; every registrant gets a personal deposit-assist onboarding; segmented broadcasts ≤3–4/wk', paid: 'None', budget: '$0', duration: 'Continuous', kpi: 'Registration→FTD ≥25% (assisted vs ~15%); response <2h daytime', result: 'The solo founder\'s sales floor — where registrations become funded' },
  { platform: 'Facebook page + groups (PRIORITY 5)', country: 'PK (NG in Phase 3)', language: 'Urdu (EN later)', audience: 'Group members; cold interest (paid, deferred)', organic: 'Genuine participation in PK forex groups (answer, never spam); profile → Telegram; 15m/day cap', paid: 'Meta Ads DEFERRED to $1,000/mo commission gate; then ≤50% of trailing commission, CPL $1.50–3.00', budget: '$0 organic; commission-funded paid post-gate', duration: 'Organic continuous; paid in 2-week cycles', kpi: 'Telegram joins attributed FB (organic); CPL (paid)', result: 'Discovery + the eventual paid accelerant' },
  { platform: 'Website / GEO + SEO', country: 'All (free upside)', language: 'Urdu + EN meta', audience: 'High-intent search ("Exness deposit JazzCash", "MT5 Exness Pakistan")', organic: 'Phase 2: 20–30 long-tail high-intent pages with embedded videos; Phase 3: programmatic live-gold-price pages', paid: '$10/mo (domain + Cloudflare free tier)', duration: 'Phase 2+', kpi: 'Phase 2 exit 5K visits/mo; Phase 3 30K/mo', result: 'Compounding free-at-margin traffic' },
];

// --- Short-form platform mix BY COUNTRY -----------------------------------
// Short-form video is the Priority-1 acquisition engine, but the best
// PLATFORM is not the same everywhere — no single platform is the permanent
// priority. Practical research per market (penetration + reliability):
//   • Pakistan: TikTok is repeatedly BANNED/unstable → do NOT depend on it;
//     Facebook Reels + YouTube Shorts are the reliable primary.
//   • Africa (NG/KE): TikTok + Facebook are dominant.
//   • South Africa: more YouTube/Instagram-mature.
//   • SEA (Indonesia/Vietnam): TikTok-dominant markets.
// Same asset, re-uploaded natively to each market's best platforms first.
export const SHORTFORM_MIX = [
  { market: 'Pakistan', primary: 'Facebook Reels + YouTube Shorts', secondary: 'TikTok (only when available — PK bans it repeatedly), Instagram Reels', why: 'TikTok is unreliable in PK (recurring bans); Facebook has massive PK reach; Shorts rides your YouTube channel.' },
  { market: 'Gulf expats (UAE/KSA/Qatar…)', primary: 'YouTube Shorts + Instagram Reels', secondary: 'TikTok (strong in Gulf), Facebook Reels', why: 'Gulf audiences skew YouTube/Instagram; same Urdu asset, Gulf-evening timing.' },
  { market: 'Nigeria', primary: 'TikTok + Facebook Reels', secondary: 'YouTube Shorts', why: 'TikTok and Facebook are the largest short-form surfaces in Nigeria; very low CPMs.' },
  { market: 'Kenya', primary: 'TikTok + Facebook Reels', secondary: 'YouTube Shorts (WhatsApp-heavy market for conversion)', why: 'TikTok/Facebook for reach; conversion leans WhatsApp (M-Pesa rails).' },
  { market: 'South Africa', primary: 'YouTube Shorts + TikTok', secondary: 'Instagram Reels', why: 'More YouTube/Instagram-mature, higher-LTV base.' },
  { market: 'Indonesia', primary: 'TikTok (dominant) + Instagram Reels', secondary: 'YouTube Shorts', why: 'One of TikTok’s largest global markets — TikTok-led (Phase 4, native hire).' },
  { market: 'Vietnam', primary: 'TikTok + YouTube Shorts', secondary: 'Facebook Reels', why: 'TikTok-first market (Phase 4, native hire).' },
];

// --- Proven funnel workflow (Section 6) — the founder's own model, refined -
export const PROVEN_WORKFLOW = {
  title: 'The proven IB funnel — short-form reach to sub-IB scale (blueprint §8)',
  note: 'Education-first, everything free, monetized ONLY through Exness IB commission. Trust before ask, free-course CTA, IB-gated VIP. Every daily task feeds one of these stages.',
  steps: [
    { stage: 'Short-form video (discover) — PRIORITY 1', detail: 'YT Shorts + TikTok + FB/IG Reels pull cold audience at $0. Every video CTA → Telegram link in bio/comments. Never a cold-traffic-to-broker link — always education first.' },
    { stage: 'Telegram + YouTube course (engage)', detail: 'New contacts join the public Telegram; the YouTube playlist IS the free course. Every question answered <24h. Email captured at course signup (portable asset if a platform dies).' },
    { stage: 'IB-gate VIP unlock (convert)', detail: 'Free tier builds trust → VIP requires opening an Exness account via your IB link + min deposit ($10–50 cent account is fine) → user submits Exness account ID → you verify it in the partner dashboard → unlock VIP Telegram, journal, WhatsApp concierge. This gate IS the conversion device.' },
    { stage: 'WhatsApp deposit-assist (fund)', detail: 'Every registrant gets a personal WhatsApp onboarding: account choice, JazzCash/Easypaisa deposit walkthrough, first-trade risk rules. Assisted registration→FTD ≥25% vs ~15% unassisted.' },
    { stage: 'Survival path (retain weeks 0–12)', detail: 'Risk-module gate before first live trade, cent-account start, 0.5%-risk rule, first-trade-together, survival-streak gamification (discipline, not profit). Most churn happens in the first 90 days — this is where the 50K is won or lost.' },
    { stage: 'Referral + Sub-IB (scale — the real 50K engine)', detail: 'Direct acquisition ceilings at ~5–10K actives. The remaining 80% comes from equipping OTHER community leaders (Phase 3+): recruit your best students, then micro-influencers in target markets — give them your white-label toolkit + training + a commission split, take a master-IB override on their volume.' },
  ],
};

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
