// functions/utils/ceo/performance-logic.js
//
// Pure performance computation (Founder OS Step 5) — every number derives
// from real rows the founder already produced (daily_activities,
// ib_clients, lead_pipeline, trading_records) or from manually-entered KPI
// history. Nothing is projected, extrapolated, or estimated: a metric with
// no underlying rows returns null and the UI says "no data yet". Deliberately
// excluded: traffic, followers, views — no vanity metrics have a home here.
// Exported pure (endpoint fetches rows, this computes) for QA, same pattern
// as retention-logic.js.

const DAY_MS = 86400000;

export function computePerformance({ activities = [], clients = [], transitions = [], tradingRecords = [], kpiSnapshots = [] }, now = Date.now()) {
  const dayStr = (t) => new Date(t).toISOString().slice(0, 10);
  const since = (n) => dayStr(now - n * DAY_MS);
  const inLast = (dateStr, n) => dateStr >= since(n - 1);

  // Mission rows only — shutdown notes are ad-hoc completed rows, not planned
  // work, so they'd inflate completion if counted.
  const planned = activities.filter((a) => a.activity_type !== 'daily.shutdown_note');
  const isCritical = (a) => String(a.description || '').trim().startsWith('CRITICAL');
  const isDone = (a) => a.status === 'completed';

  function executionQuality(days) {
    const crit = planned.filter((a) => inLast(a.activity_date, days) && isCritical(a));
    if (crit.length === 0) return null;
    return Math.round((100 * crit.filter(isDone).length) / crit.length);
  }

  // Consistency = share of days the daily anchor happened (core block or
  // shutdown completed). Measured over the full window — a young system
  // honestly scores low rather than being graded on a curve.
  function consistency(days) {
    if (planned.length === 0) return null;
    const anchors = new Set(
      activities
        .filter((a) => inLast(a.activity_date, days) && isDone(a)
          && (a.activity_type === 'daily.core_block' || a.activity_type === 'daily.shutdown' || a.activity_type === 'daily.shutdown_note'))
        .map((a) => a.activity_date)
    );
    return Math.round((100 * anchors.size) / days);
  }

  const journalDays7 = new Set(
    tradingRecords.filter((r) => r.opened_at && inLast(String(r.opened_at).slice(0, 10), 7)).map((r) => String(r.opened_at).slice(0, 10))
  ).size;

  const stageCounts = {};
  for (const c of clients) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
  const qualifiedLeads = stageCounts.qualified || 0;
  const activeClients = (stageCounts.activated || 0) + (stageCounts.engaged || 0) + (stageCounts.retained || 0);
  const atRisk = stageCounts.at_risk || 0;

  // Activation progress from the real lead_pipeline history (to_stage =
  // activated), fixed 7/30-day windows vs the window before.
  const activationDays = transitions.map((t) => String(t.occurred_at).slice(0, 10));
  // Windows are [fromDaysAgo-1 .. toDaysAgo] inclusive in calendar days, so
  // adjacent windows (thisWeek/lastWeek) tile with no gap and no overlap.
  const countBetween = (fromDaysAgo, toDaysAgo) => {
    const lo = since(fromDaysAgo - 1);
    return activationDays.filter((d) => d >= lo && (toDaysAgo === 0 || d < since(toDaysAgo - 1))).length;
  };
  const activations = {
    thisWeek: countBetween(7, 0),
    lastWeek: countBetween(14, 7),
    thisMonth: countBetween(30, 0),
    lastMonth: countBetween(60, 30),
  };

  return {
    executionQuality: { last7: executionQuality(7), last30: executionQuality(30) },
    consistency: { last7: consistency(7), last30: consistency(30) },
    journalDays7,
    funnel: { qualifiedLeads, activeClients, atRisk, stageCounts },
    activations,
    // Manually-entered KPI values (weekly kpi_entry task) passed through
    // untouched — the retention rate lives here until cohorts mature.
    kpiSnapshots,
  };
}
