// functions/utils/ceo/growth-analytics.js
//
// Pure logic for the Growth Analytics Dashboard's learning layer. Same
// honesty contract as funnel-intelligence.js: every recommendation derives
// from real rows (the founder's daily captures + observations), states its
// reason, and never overreacts to a single data point. Deterministic — no
// randomness, no LLM — so the same data yields the same recommendations, and
// a founder decision (accept/reject/remind) is stable across reloads.

const DAY_MS = 86400000;

// The minimum daily metrics captured (jsonb keys). Kept here so the trend
// engine and the UI agree on one list.
export const DAILY_METRICS = [
  { key: 'leads', label: 'Leads', kind: 'up' },
  { key: 'registrations', label: 'Exness registrations', kind: 'up' },
  { key: 'active', label: 'Active clients', kind: 'up' },
  { key: 'revenue', label: 'Revenue ($)', kind: 'up' },
  { key: 'physical_visits', label: 'Physical visits', kind: 'up' },
  { key: 'institute_meetings', label: 'Institute meetings', kind: 'up' },
  { key: 'fb_spend', label: 'Facebook spend ($)', kind: 'cost' },
  { key: 'content_published', label: 'Content published', kind: 'up' },
  { key: 'whatsapp', label: 'WhatsApp conversations', kind: 'up' },
  { key: 'telegram_growth', label: 'Telegram growth', kind: 'up' },
  { key: 'youtube_views', label: 'YouTube views', kind: 'up' },
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Sum a metric over rows whose date is within [fromDaysAgo, toDaysAgo).
function windowSum(rows, key, fromDaysAgo, toDaysAgo, todayStr) {
  const today = Date.parse(todayStr);
  return rows.reduce((s, r) => {
    const age = Math.round((today - Date.parse(r.entry_date)) / DAY_MS);
    if (age >= toDaysAgo && age < fromDaysAgo) return s + num(r.metrics?.[key]);
    return s;
  }, 0);
}

// Last-7 vs prior-7 per metric + a simple paid ROI (registrations per $ FB
// spend). Honest: with <7 days of data, deltas are marked "not enough data".
export function computeTrends(rows, todayStr) {
  const has14 = rows.filter((r) => (Date.parse(todayStr) - Date.parse(r.entry_date)) / DAY_MS < 14).length;
  const metrics = DAILY_METRICS.map((m) => {
    const last7 = windowSum(rows, m.key, 7, 0, todayStr);
    const prev7 = windowSum(rows, m.key, 14, 7, todayStr);
    const deltaPct = prev7 > 0 ? Math.round((100 * (last7 - prev7)) / prev7) : (last7 > 0 ? 100 : 0);
    return { key: m.key, label: m.label, kind: m.kind, last7, prev7, deltaPct };
  });
  const fb7 = windowSum(rows, 'fb_spend', 7, 0, todayStr);
  const reg7 = windowSum(rows, 'registrations', 7, 0, todayStr);
  const rev7 = windowSum(rows, 'revenue', 7, 0, todayStr);
  const paidCostPerReg = fb7 > 0 && reg7 > 0 ? Math.round((fb7 / reg7) * 100) / 100 : null;
  return {
    enoughData: has14 >= 4,
    metrics,
    paid: { fbSpend7: fb7, registrations7: reg7, revenue7: rev7, costPerRegistration: paidCostPerReg },
  };
}

// Observation-pattern detection. The founder writes free text; we count how
// often known GROWTH THEMES recur across observations + wins over the last 14
// days. A theme seen 3+ times is "a pattern" (never overreact to one). Purely
// deterministic keyword matching — the codebase's dormant-LLM-safe approach.
const THEMES = [
  { key: 'institute', label: 'Institute / physical outreach', words: ['institute', 'academy', 'college', 'university', 'seminar', 'visit', 'principal', 'campus'] },
  { key: 'facebook_ads', label: 'Facebook ads / boosts', words: ['facebook ad', 'fb ad', 'boost', 'meta ad', 'ad set', 'campaign'] },
  { key: 'community', label: 'Business / community groups', words: ['community', 'group', 'business community', 'whatsapp group', 'fb group'] },
  { key: 'content_format', label: 'A content format', words: ['reel', 'short', 'tiktok', 'video format', 'format performed', 'went viral', 'this format'] },
  { key: 'whatsapp', label: 'WhatsApp conversion', words: ['whatsapp', 'wa message', 'voice note', 'deposit assist'] },
  { key: 'telegram', label: 'Telegram engagement', words: ['telegram', 'tg post', 'tg group', 'channel'] },
  { key: 'referral', label: 'Referrals / word of mouth', words: ['referral', 'referred', 'word of mouth', 'friend brought'] },
  { key: 'live_class', label: 'Free class / live session', words: ['free class', 'live class', 'webinar', 'live session'] },
];

export function detectPatterns(rows, todayStr) {
  const recent = rows.filter((r) => (Date.parse(todayStr) - Date.parse(r.entry_date)) / DAY_MS < 14);
  const out = [];
  for (const theme of THEMES) {
    let count = 0;
    const dates = [];
    for (const r of recent) {
      const text = `${r.observation || ''} ${r.wins || ''}`.toLowerCase();
      if (theme.words.some((w) => text.includes(w))) { count += 1; dates.push(r.entry_date); }
    }
    if (count >= 2) out.push({ key: theme.key, label: theme.label, count, dates, isPattern: count >= 3 });
  }
  return out.sort((a, b) => b.count - a.count);
}

// Build the recommendation list (each with a stable rec_key, a plain reason,
// and a category answering one of: do-more / stop / test / recurring /
// remove). Sources: the daily-trend engine, observation patterns, and the
// REUSED Monthly-Review intelligence (pareto top/low, biggest funnel leak) —
// passed in, never recomputed here. Nothing auto-applies; the founder decides.
export function buildRecommendations({ trends, patterns, pareto, biggestLeak }) {
  const recs = [];
  const add = (key, category, title, detail, reason) => recs.push({ rec_key: key, category, title, detail, reason });

  // Observation patterns → "make it recurring" (only when it's a real pattern).
  for (const p of patterns) {
    if (p.isPattern) {
      add(`pattern:${p.key}`, 'recurring',
        `Make "${p.label}" a standard recurring activity`,
        'Add it to your Daily/Weekly plan as a repeating task. Review after 2 weeks.',
        `You noted this ${p.count}× in the last 14 days (${p.dates.slice(0, 3).join(', ')}${p.dates.length > 3 ? '…' : ''}) — it is now a pattern, not a one-off.`);
    } else {
      add(`watch:${p.key}`, 'test',
        `Keep testing "${p.label}"`,
        'Do it a couple more times and log the result before committing it to the plan.',
        `Seen ${p.count}× recently — promising, but not yet enough evidence to standardize (needs 3+).`);
    }
  }

  // Trend engine → do-more / stop / test.
  if (trends.enoughData) {
    for (const m of trends.metrics) {
      if (m.kind === 'up' && m.deltaPct >= 40 && m.last7 > 0) {
        add(`trend_up:${m.key}`, 'do_more',
          `Do more of what is lifting ${m.label}`,
          `Identify this week's driver of ${m.label} and repeat it deliberately next week.`,
          `${m.label} is up ${m.deltaPct}% (last 7d ${m.last7} vs prior 7d ${m.prev7}).`);
      }
      if (m.kind === 'up' && m.deltaPct <= -40 && m.prev7 > 0) {
        add(`trend_down:${m.key}`, 'test',
          `Diagnose the drop in ${m.label}`,
          `Check what changed vs last week; run one corrective test before scaling anything else.`,
          `${m.label} fell ${Math.abs(m.deltaPct)}% (last 7d ${m.last7} vs prior 7d ${m.prev7}).`);
      }
    }
    const p = trends.paid;
    if (p.fbSpend7 > 0 && (p.registrations7 === 0 || (p.costPerRegistration !== null && p.costPerRegistration > 5))) {
      add('stop:fb_ads_inefficient', 'stop',
        'Pause or re-test Facebook ads',
        'Kill the current ad-set and re-test one proven organic clip; keep spend ≤50% of trailing commission.',
        p.registrations7 === 0
          ? `$${p.fbSpend7} spent on FB in 7 days produced 0 registrations.`
          : `Cost per registration is $${p.costPerRegistration} — above the ~$3 target.`);
    }
  }

  // Reused Monthly-Review Pareto → do-more (top 20%) / remove (skip-heavy).
  for (const t of (pareto?.top || []).slice(0, 2)) {
    add(`pareto_top:${t.key}`, 'do_more',
      `Protect your top-20% activity: ${t.label}`,
      'Schedule it first, before anything reactive — it is your highest-impact work.',
      `It produced ${t.share}% of this month's completed impact (${t.completed}× done).`);
  }
  for (const l of (pareto?.low || []).slice(0, 2)) {
    add(`pareto_low:${l.key}`, 'remove',
      `Reduce or fix: ${l.label}`,
      'Halve its slot in the plan or rewrite its template — it keeps getting skipped.',
      `Skipped ${l.skipped}× vs done ${l.completed}× this month.`);
  }
  if (biggestLeak && biggestLeak.dropOffRate >= 50) {
    add(`leak:${slug(biggestLeak.stage)}`, 'test',
      `Fix the biggest funnel leak: ${biggestLeak.stage}`,
      'Point one weekly Focus at this stage next month and re-measure.',
      `${biggestLeak.dropOffRate}% of people drop off at "${biggestLeak.stage}".`);
  }

  return recs;
}

function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

// Filter the generated recommendations against the founder's stored decisions:
// hide rejected; hide accepted (they move to an "accepted" list); hide
// remind_later until its remind_on date; everything else is pending/active.
export function applyDecisions(recs, signalRows, todayStr) {
  const byKey = Object.fromEntries((signalRows || []).map((s) => [s.rec_key, s]));
  const active = [];
  const accepted = [];
  for (const r of recs) {
    const sig = byKey[r.rec_key];
    if (!sig || sig.status === 'pending') { active.push(r); continue; }
    if (sig.status === 'rejected') continue;
    if (sig.status === 'accepted') { accepted.push({ ...r, status: 'accepted' }); continue; }
    if (sig.status === 'remind_later') {
      if (!sig.remind_on || sig.remind_on <= todayStr) active.push(r); // due again
    }
  }
  return { active, accepted };
}
