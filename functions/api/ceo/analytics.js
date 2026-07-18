// functions/api/ceo/analytics.js  ->  GET/POST /api/ceo/analytics
//
// The Growth Analytics Dashboard's backend — the intelligence LAYER, not a
// second analytics engine. It owns only what is genuinely new:
//   • daily lightweight metric capture (growth_daily)
//   • the founder's free-text observations + wins/problems
//   • observation-pattern learning + daily-trend detection
//   • an approval-tracked recommendation queue (growth_signal:
//     accept / reject / remind_later — nothing ever auto-applies)
// The funnel / Pareto / dimensions stay owned by intelligence.js; this
// endpoint REUSES the same pure computations (funnel-intelligence.js) to
// source the do-more / stop recommendations — it never duplicates the tables
// or the planning engine.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { computePareto, computeFunnel } from '../../utils/ceo/funnel-intelligence.js';
import { computeTrends, detectPatterns, buildRecommendations, applyDecisions, DAILY_METRICS } from '../../utils/ceo/growth-analytics.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REC_KEY_RE = /^[a-z0-9_.:]{1,80}$/i;

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  try {
    const [dailyRows, signalRows, todayRow, monthActivities, clients] = await Promise.all([
      db.select('growth_daily', `select=entry_date,metrics,wins,problems,observation&owner_user_id=eq.${uid}&entry_date=gte.${since30}&order=entry_date.desc`),
      db.select('growth_signal', `select=rec_key,status,remind_on&owner_user_id=eq.${uid}`),
      db.select('growth_daily', `select=*&owner_user_id=eq.${uid}&entry_date=eq.${today}`),
      db.select('daily_activities', `select=activity_type,description,status&owner_user_id=eq.${uid}&activity_date=gte.${monthStart}&limit=1000`),
      db.select('ib_clients', `select=stage&owner_user_id=eq.${uid}&limit=2000`),
    ]);

    // Reused Monthly-Review computations (no new engine): Pareto + funnel leak.
    const pareto = computePareto(monthActivities);
    const stageCounts = {};
    for (const c of clients) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    const funnel = computeFunnel({ stageCounts, touchedClients: 0, kpiByKey: {} });

    // New learning layer.
    const trends = computeTrends(dailyRows, today);
    const patterns = detectPatterns(dailyRows, today);
    const allRecs = buildRecommendations({ trends, patterns, pareto, biggestLeak: funnel.biggestLeak });
    const { active, accepted } = applyDecisions(allRecs, signalRows, today);

    return json({
      today,
      metricDefs: DAILY_METRICS,
      todayEntry: todayRow[0] || null,
      recentDaily: dailyRows,
      trends,
      patterns,
      recommendations: active,
      accepted,
    });
  } catch (err) {
    return json({ error: 'analytics_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  try {
    // Save (upsert) today's — or a chosen date's — daily capture + observation.
    if (body.action === 'save_daily') {
      const date = DATE_RE.test(String(body.date || '')) ? body.date : new Date().toISOString().slice(0, 10);
      const metrics = {};
      for (const m of DAILY_METRICS) {
        const v = body.metrics?.[m.key];
        if (v !== undefined && v !== '' && v !== null) {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) metrics[m.key] = n;
        }
      }
      const patch = {
        metrics,
        wins: String(body.wins || '').slice(0, 1000) || null,
        problems: String(body.problems || '').slice(0, 1000) || null,
        observation: String(body.observation || '').slice(0, 2000) || null,
        updated_at: new Date().toISOString(),
      };
      const existing = await db.select('growth_daily', `select=id&owner_user_id=eq.${uid}&entry_date=eq.${date}`);
      let row;
      if (existing.length > 0) {
        row = (await db.update('growth_daily', `id=eq.${existing[0].id}`, patch))[0];
      } else {
        row = (await db.insert('growth_daily', [{ owner_user_id: uid, entry_date: date, ...patch }]))[0];
      }
      return json({ ok: true, entry: row });
    }

    // Founder decision on a recommendation (accept / reject / remind_later).
    // Upsert by rec_key so a decision is stable and re-decidable.
    if (body.action === 'decide') {
      const recKey = String(body.rec_key || '');
      if (!REC_KEY_RE.test(recKey)) return json({ error: 'invalid_rec_key' }, 400);
      const status = ['accepted', 'rejected', 'remind_later', 'pending'].includes(body.status) ? body.status : null;
      if (!status) return json({ error: 'invalid_status' }, 400);
      // Remind later defaults to 3 days out unless the founder passes a date.
      const remindOn = status === 'remind_later'
        ? (DATE_RE.test(String(body.remind_on || '')) ? body.remind_on : new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))
        : null;
      const patch = { status, remind_on: remindOn, updated_at: new Date().toISOString() };
      const existing = await db.select('growth_signal', `select=id&owner_user_id=eq.${uid}&rec_key=eq.${encodeURIComponent(recKey)}`);
      if (existing.length > 0) {
        await db.update('growth_signal', `id=eq.${existing[0].id}`, patch);
      } else {
        await db.insert('growth_signal', [{ owner_user_id: uid, rec_key: recKey, ...patch }]);
      }
      return json({ ok: true, rec_key: recKey, status });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    return json({ error: 'analytics_write_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
