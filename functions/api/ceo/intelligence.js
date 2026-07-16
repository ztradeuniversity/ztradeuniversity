// functions/api/ceo/intelligence.js  ->  GET /api/ceo/intelligence[?month=YYYY-MM]
//
// The Monthly AI Review + Growth Intelligence Report (Sections 5 + 8):
// progress %, trajectory vs expected, target score, 50k probability
// (labeled model estimate), the 7-stage funnel with conversion/drop-off,
// Pareto top-20%/reduce lists, dimension performance (brokers, platforms,
// content types), and the "what should I focus on next month" executive
// summary. Deterministic from real rows — generating it twice for the same
// month gives the same report, so it is computed on demand (opened from the
// Complete Plan page) rather than stored. Reuses computePerformance for
// execution quality/consistency and funnel-intelligence.js for the rest.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { computePerformance } from '../../utils/ceo/performance-logic.js';
import { computePareto, computeFunnel, computeTrajectory, computeDimensions, buildExecutiveSummary } from '../../utils/ceo/funnel-intelligence.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of month
  const prevStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  return { start, end, prevStart };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  const url = new URL(request.url);
  const month = MONTH_RE.test(url.searchParams.get('month') || '')
    ? url.searchParams.get('month')
    : new Date().toISOString().slice(0, 7);
  const { start, end, prevStart } = monthRange(month);

  try {
    const [monthActivities, clients, transitions, touches, kpiRows, content, allActivities] = await Promise.all([
      db.select('daily_activities', `select=activity_type,description,status,activity_date&owner_user_id=eq.${uid}&activity_date=gte.${start}&activity_date=lte.${end}&limit=1000`),
      db.select('ib_clients', `select=id,stage,broker,referral_source&owner_user_id=eq.${uid}&limit=1000`),
      db.select('lead_pipeline', `select=to_stage,occurred_at&owner_user_id=eq.${uid}&to_stage=eq.activated&occurred_at=gte.${prevStart}&limit=1000`),
      db.select('client_touches', `select=ib_client_id,occurred_at&owner_user_id=eq.${uid}&occurred_at=gte.${start}&occurred_at=lte.${end}T23:59:59Z&limit=1000`),
      db.select('kpi_history', `select=value,recorded_for,kpi_id&order=recorded_for.desc&limit=50`),
      db.select('content_library', `select=pillar,status&owner_user_id=eq.${uid}&limit=200`),
      // 30-day window for computePerformance's execution/consistency scores.
      db.select('daily_activities', `select=activity_type,description,status,activity_date&owner_user_id=eq.${uid}&activity_date=gte.${prevStart}&limit=2000`),
    ]);

    // KPI values need their keys — one more small lookup, only when any exist.
    const kpiByKey = {};
    if (kpiRows.length > 0) {
      const defs = await db.select('kpi_definitions', 'select=id,key');
      const keyById = Object.fromEntries(defs.map((d) => [d.id, d.key]));
      for (const row of kpiRows) {
        const key = keyById[row.kpi_id];
        if (key && kpiByKey[key] === undefined) kpiByKey[key] = row.value; // newest first
      }
    }

    const stageCounts = {};
    for (const c of clients) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    const touchedClients = new Set(touches.map((t) => t.ib_client_id)).size;

    const perf = computePerformance({ activities: allActivities, clients, transitions: [], tradingRecords: [], kpiSnapshots: [] });

    const inMonth = (iso) => { const d = String(iso).slice(0, 10); return d >= start && d <= end; };
    const activationsThisMonth = transitions.filter((t) => inMonth(t.occurred_at)).length;
    const activationsLastMonth = transitions.length - activationsThisMonth;

    const pareto = computePareto(monthActivities);
    const funnel = computeFunnel({ stageCounts, touchedClients, kpiByKey });
    const trajectory = computeTrajectory({
      activeClients: (stageCounts.activated || 0) + (stageCounts.engaged || 0) + (stageCounts.retained || 0),
      activationsThisMonth,
      activationsLastMonth,
      executionQuality30: perf.executionQuality.last30,
      consistency30: perf.consistency.last30,
    });
    const dimensions = computeDimensions({ clients, content });
    const executiveSummary = buildExecutiveSummary({ funnel, pareto, trajectory });

    return json({
      month,
      generatedAt: new Date().toISOString(),
      trajectory,
      executionQuality30: perf.executionQuality.last30,
      consistency30: perf.consistency.last30,
      funnel: funnel.stages,
      biggestLeak: funnel.biggestLeak,
      pareto,
      dimensions,
      executiveSummary,
    });
  } catch (err) {
    return json({ error: 'intelligence_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
