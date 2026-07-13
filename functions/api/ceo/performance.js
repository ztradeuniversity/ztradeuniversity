// functions/api/ceo/performance.js  ->  GET /api/ceo/performance
//
// The Performance Engine feed (Founder OS Step 5): execution quality,
// consistency, funnel counts, and weekly/monthly activation progress — all
// computed from real rows by utils/ceo/performance-logic.js, plus the
// latest manually-entered values for the weekly-review KPI strip
// (90-day survival / watch-time / community members — the seeded
// weekly_review_template's numbers). Read-only; no vanity metrics; a metric
// with no data comes back null, never estimated.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { computePerformance } from '../../utils/ceo/performance-logic.js';

// The manual-entry KPIs the weekly review template names. Locked seed keys
// (same precedent as mission.js's ACTIVITY_META).
const SNAPSHOT_KEYS = ['retention.survival_90d', 'content.watch_time', 'community.members', 'trading.journal_streak'];

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const since62 = new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10);
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

    const [activities, clients, transitions, tradingRecords, kpiDefs] = await Promise.all([
      db.select('daily_activities', `select=activity_date,activity_type,description,status&owner_user_id=eq.${uid}&activity_date=gte.${since62}&limit=1000`),
      db.select('ib_clients', `select=stage&owner_user_id=eq.${uid}&limit=1000`),
      db.select('lead_pipeline', `select=occurred_at&owner_user_id=eq.${uid}&to_stage=eq.activated&occurred_at=gte.${since62}&limit=500`),
      db.select('trading_records', `select=opened_at&owner_user_id=eq.${uid}&opened_at=gte.${since7}&limit=200`),
      db.select('kpi_definitions', `select=id,key,label,unit&key=in.(${SNAPSHOT_KEYS.join(',')})`),
    ]);

    let kpiSnapshots = [];
    if (kpiDefs.length > 0) {
      const hist = await db.select(
        'kpi_history',
        `select=kpi_id,value,recorded_for&owner_user_id=eq.${uid}&kpi_id=in.(${kpiDefs.map((d) => d.id).join(',')})&order=recorded_for.desc&limit=24`
      );
      kpiSnapshots = kpiDefs.map((d) => {
        const values = hist.filter((h) => h.kpi_id === d.id);
        return { key: d.key, label: d.label, unit: d.unit, latest: values[0] ?? null, previous: values[1] ?? null };
      });
    }

    return json(computePerformance({ activities, clients, transitions, tradingRecords, kpiSnapshots }));
  } catch (err) {
    return json({ error: 'performance_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
