// functions/utils/ceo/funnel-intelligence.js
//
// Pure monthly Growth Intelligence computation (Monthly AI Review + AI
// Funnel Intelligence). Same honesty contract as performance-logic.js:
// every number derives from real rows; a stage the founder has not
// instrumented yet says so ("not tracked yet") instead of inventing a
// count; the 50k probability is a labeled model estimate, never a promise.
// Exported pure for QA — the endpoint fetches rows, this computes.

const TARGET = 50000;
const TIER_WEIGHT = { CRITICAL: 3, IMPORTANT: 2, OPTIONAL: 1 };

const label = (key) => String(key || '').replace(/^(daily|weekly|monthly|quarterly)\./, '').replace(/_/g, ' ');

function tierOf(description) {
  const t = String(description || '').trim().split('|')[0].trim();
  return TIER_WEIGHT[t] ? t : 'IMPORTANT';
}

// activities: month's daily_activities rows (activity_type, description,
// status, activity_date). Returns Pareto lists from real completion history.
export function computePareto(activities) {
  const byType = {};
  for (const a of activities) {
    if (a.activity_type === 'daily.shutdown_note') continue;
    const t = (byType[a.activity_type] ||= { key: a.activity_type, completed: 0, skipped: 0, pending: 0, weight: TIER_WEIGHT[tierOf(a.description)] });
    if (a.status === 'completed') t.completed += 1;
    else if (a.status === 'skipped') t.skipped += 1;
    else t.pending += 1;
  }
  const rows = Object.values(byType).map((t) => ({
    ...t,
    label: label(t.key),
    decisions: t.completed + t.skipped,
    impactScore: t.completed * t.weight,
  }));
  const ranked = rows.filter((r) => r.impactScore > 0).sort((a, b) => b.impactScore - a.impactScore);
  const totalImpact = ranked.reduce((s, r) => s + r.impactScore, 0);
  const topCount = Math.max(1, Math.ceil(ranked.length * 0.2));
  const top = ranked.slice(0, topCount).map((r) => ({
    key: r.key, label: r.label, completed: r.completed,
    share: totalImpact ? Math.round((100 * r.impactScore) / totalImpact) : 0,
  }));
  const low = rows
    .filter((r) => r.decisions >= 3 && r.skipped > r.completed)
    .sort((a, b) => b.skipped - a.skipped)
    .slice(0, 3)
    .map((r) => ({ key: r.key, label: r.label, skipped: r.skipped, completed: r.completed }));
  return { top, low, totalTypes: rows.length };
}

// The seven-stage IB acquisition funnel, each stage mapped to the most
// honest data source that exists today. kpiByKey: latest kpi_history value
// per key (or undefined). touchedClients: distinct clients touched in month.
export function computeFunnel({ stageCounts, touchedClients, kpiByKey }) {
  const val = (v) => (v === undefined || v === null ? null : Number(v));
  const audience = val(kpiByKey['community.members']);
  const stages = [
    { stage: 'Total Audience Reached', count: audience, source: audience === null ? 'Not tracked yet — enter community.members via the weekly KPI task' : 'KPI: community members (manual weekly entry)' },
    { stage: 'Engaged Users', count: touchedClients + (stageCounts.engaged || 0), source: 'Clients touched this month + engaged-stage clients' },
    { stage: 'Qualified Leads', count: stageCounts.qualified || 0, source: 'CRM stage: qualified' },
    { stage: 'Broker Account Opens', count: stageCounts.onboarding || 0, source: 'CRM stage: onboarding' },
    { stage: 'IB Registrations', count: (stageCounts.activated || 0) + (stageCounts.engaged || 0) + (stageCounts.retained || 0) + (stageCounts.at_risk || 0), source: 'CRM: ever-activated (activated + engaged + retained + at-risk)' },
    { stage: 'Active Traders', count: (stageCounts.engaged || 0) + (stageCounts.activated || 0), source: 'CRM stages: activated + engaged' },
    { stage: 'Active IB Clients', count: (stageCounts.activated || 0) + (stageCounts.engaged || 0) + (stageCounts.retained || 0), source: 'CRM stages: activated + engaged + retained' },
  ];
  for (let i = 0; i < stages.length; i++) {
    const prev = i > 0 ? stages[i - 1].count : null;
    const cur = stages[i].count;
    stages[i].conversionRate = prev && cur !== null && prev > 0 ? Math.round((100 * cur) / prev) : null;
    stages[i].dropOffRate = stages[i].conversionRate === null ? null : Math.max(0, 100 - stages[i].conversionRate);
    stages[i].estimatedCost = 'PKR 0 — organic (no paid spend recorded)';
    stages[i].estimatedRoi = 'N/A until paid opens — organic ROI is time-based';
  }
  // Biggest leak: the largest drop-off among stages with real numbers on
  // both sides (skip the audience stage when uninstrumented).
  const leaks = stages.filter((s) => s.dropOffRate !== null && s.count !== null);
  const biggestLeak = leaks.sort((a, b) => b.dropOffRate - a.dropOffRate)[0] || null;
  return { stages, biggestLeak };
}

// Trajectory + 50k model. activationsThisMonth/lastMonth: real transitions
// to 'activated' in each calendar month; activeClients: current count.
export function computeTrajectory({ activeClients, activationsThisMonth, activationsLastMonth, executionQuality30, consistency30 }) {
  const progressPct = Math.round((10000 * activeClients) / TARGET) / 100;
  const trend = activationsLastMonth > 0
    ? Math.round((100 * (activationsThisMonth - activationsLastMonth)) / activationsLastMonth)
    : (activationsThisMonth > 0 ? 100 : 0);
  const monthsTo50k = activationsThisMonth > 0
    ? Math.ceil((TARGET - activeClients) / activationsThisMonth)
    : null;
  // Target achievement score: execution (40%) + consistency (30%) + funnel
  // momentum (30%, trend clamped to ±100). A documented formula, not vibes.
  const momentum = Math.max(-100, Math.min(100, trend));
  const score = Math.max(0, Math.min(100, Math.round(
    0.4 * (executionQuality30 ?? 0) + 0.3 * (consistency30 ?? 0) + 0.3 * ((momentum + 100) / 2)
  )));
  // Probability band (model estimate): grows with score and with an actual
  // compounding trajectory; floored/capped so it never reads as certainty.
  let probability;
  if (activeClients === 0 && activationsThisMonth === 0) probability = 5;
  else if (monthsTo50k !== null && monthsTo50k <= 60 && trend >= 0) probability = Math.min(75, 35 + Math.round(score / 3));
  else if (trend > 0) probability = Math.min(55, 20 + Math.round(score / 3));
  else probability = Math.max(5, Math.round(score / 4));
  return {
    progressPct,
    activeClients,
    target: TARGET,
    activationsThisMonth,
    activationsLastMonth,
    trendPct: trend,
    monthsTo50kAtCurrentRate: monthsTo50k,
    currentTrajectory: activationsThisMonth > 0
      ? `${activationsThisMonth} activation${activationsThisMonth === 1 ? '' : 's'} this month (${trend >= 0 ? '+' : ''}${trend}% vs last month) — linear path: ~${monthsTo50k} months to 50k at this rate`
      : 'No activations recorded this month — the model needs its first tracked cohort',
    expectedTrajectory: 'Compounding path: content library + retention ladder should raise the monthly rate each quarter; the gate plan (EN engine at 300 clients, paid probes after) exists to bend this curve',
    targetScore: score,
    probability50k: probability,
    probabilityNote: 'Model estimate from execution quality, consistency, and activation momentum — recalibrates every month; not a forecast.',
  };
}

// Dimension performance from the real columns that exist: brokers and
// referral sources live on ib_clients; content pillars on content_library.
// Country/language split honestly reports the single-market phase.
export function computeDimensions({ clients, content }) {
  const active = (c) => ['activated', 'engaged', 'retained'].includes(c.stage);
  const rank = (field) => {
    const m = {};
    for (const c of clients) {
      const k = (c[field] || '').trim();
      if (!k) continue;
      (m[k] ||= { name: k, total: 0, active: 0 });
      m[k].total += 1;
      if (active(c)) m[k].active += 1;
    }
    return Object.values(m).sort((a, b) => b.active - a.active || b.total - a.total).slice(0, 5);
  };
  const pillars = {};
  for (const c of content || []) {
    if (c.status !== 'published') continue;
    (pillars[c.pillar] ||= { name: c.pillar, published: 0 });
    pillars[c.pillar].published += 1;
  }
  return {
    brokers: rank('broker'),
    platforms: rank('referral_source'),
    contentTypes: Object.values(pillars).sort((a, b) => b.published - a.published),
    countries: [{ name: 'Pakistan + GCC', note: 'Single-market phase by locked research — per-country split starts when the EN gate opens (300 activated clients)' }],
    languages: [{ name: 'Urdu / Roman-Urdu (+EN titles GCC)', note: 'Language split becomes measurable with the EN engine' }],
    dimensionNote: 'Brokers and platforms rank by ACTIVE clients from real CRM rows (broker / referral_source fields) — fill them on every client for sharper ranking.',
  };
}

// The executive summary: one practical, measurable focus for next month.
export function buildExecutiveSummary({ funnel, pareto, trajectory }) {
  const parts = [];
  if (funnel.biggestLeak && funnel.biggestLeak.dropOffRate >= 50) {
    parts.push(`Biggest leak: "${funnel.biggestLeak.stage}" loses ${funnel.biggestLeak.dropOffRate}% — that stage is next month's #1 priority.`);
  } else if (!funnel.stages[0].count) {
    parts.push('The top of the funnel is not instrumented — enter community.members in the weekly KPI task so next month\'s review can measure reach.');
  }
  if (pareto.top.length > 0) {
    parts.push(`Double down on: ${pareto.top.map((t) => t.label).join(', ')} (top 20% of activities = ${pareto.top.reduce((s, t) => s + t.share, 0)}% of completed impact).`);
  }
  if (pareto.low.length > 0) {
    parts.push(`Reduce: ${pareto.low.map((l) => l.label).join(', ')} — skipped more than done; halve the slot or fix the template.`);
  }
  if (trajectory.activationsThisMonth === 0) {
    parts.push('Zero activations this month — next month\'s measurable target: 3 activated clients through the IB follow-up trigger list.');
  } else {
    parts.push(`Measurable target next month: ${Math.max(trajectory.activationsThisMonth + 1, Math.ceil(trajectory.activationsThisMonth * 1.2))} activations (beat this month by 20%).`);
  }
  return parts.join(' ');
}
