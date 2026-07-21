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
import { computePareto, computeFunnel, computeTrajectory, buildLessonsAndImprovements } from '../../utils/ceo/funnel-intelligence.js';
import { computePerformance } from '../../utils/ceo/performance-logic.js';
import { computeTrends, detectPatterns, buildRecommendations, applyDecisions, buildPerformanceSummary, planHealth, DAILY_METRICS } from '../../utils/ceo/growth-analytics.js';
import { computeDailyProgress, computeExpectedMembers, compareExpectedActual, buildSourceBreakdown, buildRemainingWork } from '../../utils/ceo/founder-success.js';

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
    // Honor the founder's most recent Plan Reset (activities.js action
    // 'reset_plan' upserts growth.reset_date). Nothing is deleted — the
    // floor these reads start from just moves forward, so trends,
    // observation patterns, and the recommendation queue read only rows
    // from the new plan while old growth_daily/growth_signal rows stay on
    // record (no-hard-deletes rule).
    // plan.start_date rides along in the same lookup — the Founder Success Bar
    // measures goal pace against the plan's own start anchor (reset_plan moves
    // both, so a reset restarts the bar at zero automatically).
    const settingRows = await db.select('settings', `select=key,value&scope=eq.global&key=in.(growth.reset_date,plan.start_date)`);
    const settingByKey = Object.fromEntries((settingRows || []).map((r) => [r.key, r.value]));
    const resetDate = settingByKey['growth.reset_date'] || null;
    const planStartDate = settingByKey['plan.start_date'] || null;
    const dailyFloor = resetDate && resetDate > since30 ? resetDate : since30;
    // Pareto/funnel (do-more, remove, leak recs) are sourced from this
    // month's daily_activities — same reset floor applies so a leak or a
    // top activity from before the reset never leaks into the new cycle's
    // recommendations. The separate /api/ceo/intelligence Monthly Review
    // read-only block is untouched — it stays calendar-month scoped by design.
    const activityFloor = resetDate && resetDate > monthStart ? resetDate : monthStart;

    const [dailyRows, signalRows, todayRow, monthActivities, clients, perfActivities, overdueRows, transitions] = await Promise.all([
      db.select('growth_daily', `select=entry_date,metrics,wins,problems,observation&owner_user_id=eq.${uid}&entry_date=gte.${dailyFloor}&order=entry_date.desc`),
      db.select('growth_signal', `select=rec_key,status,remind_on&owner_user_id=eq.${uid}${resetDate ? `&updated_at=gte.${resetDate}` : ''}`),
      db.select('growth_daily', `select=*&owner_user_id=eq.${uid}&entry_date=eq.${today}`),
      db.select('daily_activities', `select=activity_type,description,status&owner_user_id=eq.${uid}&activity_date=gte.${activityFloor}&limit=1000`),
      db.select('ib_clients', `select=stage,referral_source&owner_user_id=eq.${uid}&limit=2000`),
      // Founder Decision Dashboard: reused computePerformance/computeTrajectory
      // need a rolling activity window — same reset floor as growth_daily so a
      // prior plan's execution never influences the new cycle's scores.
      db.select('daily_activities', `select=activity_type,description,status,activity_date&owner_user_id=eq.${uid}&activity_date=gte.${dailyFloor}&limit=2000`),
      db.select('daily_activities', `select=id&owner_user_id=eq.${uid}&status=eq.pending&activity_date=lt.${today}&limit=500`),
      db.select('lead_pipeline', `select=to_stage,occurred_at&owner_user_id=eq.${uid}&to_stage=eq.activated&occurred_at=gte.${dailyFloor}&limit=1000`),
    ]);

    // Reused Monthly-Review computations (no new engine): Pareto + funnel leak.
    const pareto = computePareto(monthActivities);
    const stageCounts = {};
    for (const c of clients) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    const funnel = computeFunnel({ stageCounts, touchedClients: 0, kpiByKey: {} });

    // Reused performance/trajectory engine (funnel-intelligence.js +
    // performance-logic.js — the exact functions intelligence.js uses for
    // the Monthly AI Review), fed the reset-floored rows above so a founder's
    // execution score, consistency score, and 50k trajectory start clean.
    const perf = computePerformance({ activities: perfActivities, clients, transitions, tradingRecords: [], kpiSnapshots: [] });
    const trajectory = computeTrajectory({
      activeClients: perf.funnel.activeClients,
      activationsThisMonth: perf.activations.thisMonth,
      activationsLastMonth: perf.activations.lastMonth,
      executionQuality30: perf.executionQuality.last30,
      consistency30: perf.consistency.last30,
    });
    const overdueCount = overdueRows.length;

    // --- Founder Success Bar (Daily Planner) ---------------------------
    // Composed entirely from values already computed above plus the plan's
    // own declared target/horizon — no second analytics engine, no new query
    // beyond referral_source riding along on the existing ib_clients read.
    const daily = computeDailyProgress({ activities: perfActivities, today });
    const goal = computeExpectedMembers({ planStartDate, today, actualMembers: trajectory.activeClients });
    const pace = compareExpectedActual({ expectedMembers: goal.expectedMembers, actualMembers: trajectory.activeClients });
    const activityTypes = [...new Set(perfActivities.map((a) => a.activity_type))];

    const health = planHealth({ targetScore: trajectory.targetScore, overdueCount, paceStatus: pace.status });

    const decided = perfActivities.filter((a) => a.activity_type !== 'daily.shutdown_note');
    const completedCount = decided.filter((a) => a.status === 'completed').length;
    const skippedCount = decided.filter((a) => a.status === 'skipped').length;
    const pendingCount = decided.filter((a) => a.status === 'pending').length;
    const totalCount = completedCount + skippedCount + pendingCount;
    const completionPct = totalCount > 0 ? Math.round((100 * completedCount) / totalCount) : 0;
    const remainingPct = totalCount > 0 ? 100 - completionPct : 0;

    // Never invent analytics from a handful of rows: Pareto/leak-derived
    // recommendations and the performance summary's highest-impact lens only
    // see real Pareto data once there's a meaningful decided sample since the
    // reset. Every other threshold (trend enoughData, pattern count>=2/3,
    // per-type rate/frequency mins in buildPerformanceSummary) already gates
    // itself — this just closes the one gap where Pareto's own "top 20%" can
    // surface off a single completed activity.
    const hasEnoughData = completedCount + skippedCount >= 5;
    const effectivePareto = hasEnoughData ? pareto : { top: [], low: [], totalTypes: pareto.totalTypes };
    const effectiveLeak = hasEnoughData ? funnel.biggestLeak : null;

    // New learning layer.
    const trends = computeTrends(dailyRows, today);
    const patterns = detectPatterns(dailyRows, today);
    const allRecs = buildRecommendations({ trends, patterns, pareto: effectivePareto, biggestLeak: effectiveLeak });
    const { active, accepted } = applyDecisions(allRecs, signalRows, today);
    const performanceSummary = buildPerformanceSummary({ activities: perfActivities, pareto: effectivePareto, today });
    const { lessons, improvements } = buildLessonsAndImprovements({
      funnel: { ...funnel, biggestLeak: effectiveLeak },
      pareto: effectivePareto,
      trajectory,
    });

    return json({
      today,
      metricDefs: DAILY_METRICS,
      todayEntry: todayRow[0] || null,
      recentDaily: dailyRows,
      trends,
      patterns,
      recommendations: active,
      accepted,
      notEnoughData: !hasEnoughData,
      progress: {
        completionPct,
        remainingPct,
        executionScore: trajectory.targetScore,
        consistencyScore: perf.consistency.last30,
        health: health.label,
        healthStatus: health.status,
        goal: {
          activeClients: trajectory.activeClients,
          target: trajectory.target,
          progressPct: trajectory.progressPct,
          probability50k: trajectory.probability50k,
          trendPct: trajectory.trendPct,
          monthsTo50kAtCurrentRate: trajectory.monthsTo50kAtCurrentRate,
        },
      },
      execution: {
        completed: completedCount,
        skipped: skippedCount,
        pending: pendingCount,
        overdue: overdueCount,
        completionRate: completionPct,
        consistencyRate: perf.consistency.last30,
        executionScore: trajectory.targetScore,
      },
      performanceSummary,
      lessons,
      improvements,
      biggestLeak: effectiveLeak,
      // The Daily Planner's Founder Success Bar. `daily` is live from day one
      // (today's rows are always post-reset); the goal/score fields carry
      // notEnoughData so the bar shows "Not enough data" instead of a number
      // until the new cycle has real execution behind it.
      successBar: {
        notEnoughData: !hasEnoughData,
        daily,
        executionScore: trajectory.targetScore,
        consistencyScore: perf.consistency.last30,
        health: health.label,
        healthStatus: health.status,
        goal: { ...goal, pace, probability50k: trajectory.probability50k },
        sources: buildSourceBreakdown({ clients, activityTypes, expectedMembers: goal.expectedMembers }),
        remainingWork: buildRemainingWork({ remainingMembers: goal.remainingMembers, activityTypes }),
        // Reused, never regenerated: the same honest recommendation queue the
        // Growth Analytics page shows, so "AI improvement" advice has exactly
        // one source of truth.
        recommendations: active.slice(0, 3),
      },
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
