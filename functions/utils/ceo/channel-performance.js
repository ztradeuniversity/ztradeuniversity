// functions/utils/ceo/channel-performance.js
//
// Result-driven channel comparison + Pareto auto-prioritization for the
// Monthly AI Review. Pure logic, same honesty contract as funnel-
// intelligence.js: every number derives from REAL rows (ib_clients attributed
// by referral_source, marketing_campaigns budgets, growth_daily spend). No new
// table, no new column — and the channel taxonomy is imported from
// founder-success.js MEMBER_SOURCES so there is ONE channel list, never a
// second copy.

import { MEMBER_SOURCES } from './founder-success.js';

// The CRM stage vocabulary, mapped to funnel positions (the same 3-stage
// "active" definition the whole OS uses: activated/engaged/retained).
const ACTIVE = ['activated', 'engaged', 'retained'];
const REGISTERED = ['onboarding', 'activated', 'engaged', 'retained', 'at_risk'];
const FUNDED = ['activated', 'engaged', 'retained', 'at_risk'];

// referral_source (or a campaign's channel label) -> a MEMBER_SOURCES key.
function channelOf(src) {
  const s = String(src || '').toLowerCase().trim();
  if (!s) return null;
  const hit = MEMBER_SOURCES.find((m) => m.match.some((x) => s.includes(x)));
  return hit ? hit.key : null;
}

// Per-channel funnel: Lead Volume, Registration/Funding/Active/Retention rates,
// Cost Per Lead, Cost Per Active, ROI — from real CRM attribution + real spend.
export function computeChannelPerformance({ clients = [], dailyRows = [], campaigns = [] }) {
  // Spend per channel: marketing_campaigns.budget by channel + growth_daily
  // fb_spend (the one paid line the daily capture tracks).
  const spendByChannel = {};
  for (const c of campaigns) {
    const key = channelOf(c.channel) || (/ad|boost|paid/i.test(String(c.channel || '')) ? 'paid_ads' : null);
    if (key) spendByChannel[key] = (spendByChannel[key] || 0) + (Number(c.budget) || 0);
  }
  const fbSpend = dailyRows.reduce((s, r) => s + (Number(r.metrics?.fb_spend) || 0), 0);
  if (fbSpend > 0) spendByChannel.paid_ads = (spendByChannel.paid_ads || 0) + fbSpend;

  const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : null);

  const rows = MEMBER_SOURCES.map((src) => {
    const mine = clients.filter((c) => channelOf(c.referral_source) === src.key);
    const leads = mine.length;
    const registered = mine.filter((c) => REGISTERED.includes(c.stage)).length;
    const funded = mine.filter((c) => FUNDED.includes(c.stage)).length;
    const active = mine.filter((c) => ACTIVE.includes(c.stage)).length;
    const retained = mine.filter((c) => c.stage === 'retained').length;
    const spend = spendByChannel[src.key] || 0;
    return {
      key: src.key,
      label: src.label,
      leads,
      registered,
      funded,
      active,
      retained,
      registrationRate: pct(registered, leads),
      fundingRate: pct(funded, registered),
      activeRate: pct(active, funded),
      retentionRate: pct(retained, active),
      spend,
      // Organic channels ($0 spend) report CPL/CPA as 0; paid channels only
      // once there's a denominator, else null ("no data yet").
      costPerLead: spend === 0 ? 0 : (leads > 0 ? Math.round((100 * spend) / leads) / 100 : null),
      costPerActive: spend === 0 ? 0 : (active > 0 ? Math.round((100 * spend) / active) / 100 : null),
      // ROI honest: organic is time-based (no cash in); paid reports actives
      // per dollar rather than an invented revenue multiple.
      roi: spend === 0 ? 'Organic — time-based' : (active > 0 ? `${active} active per $${spend}` : 'No return yet'),
      hasData: leads > 0,
    };
  });
  return rows.sort((a, b) => b.active - a.active || b.leads - a.leads);
}

// Pareto: the ~20% of channels producing ~80% of active clients, plus the
// 80/20 EFFORT allocation. Never removes a channel — low performers keep ~20%
// of effort for testing and diversification (the prompt's explicit rule).
export function channelPareto(channelRows) {
  const withData = channelRows.filter((c) => c.hasData);
  const totalActive = withData.reduce((s, c) => s + c.active, 0);
  if (totalActive === 0) {
    return {
      enoughData: false,
      top: [],
      low: [],
      effort: [],
      note: 'Not enough active-client data yet — keep testing every channel evenly until the winners separate.',
    };
  }
  const ranked = [...withData].sort((a, b) => b.active - a.active);
  const top = [];
  let cum = 0;
  for (const c of ranked) {
    top.push({ key: c.key, label: c.label, active: c.active, share: Math.round((100 * c.active) / totalActive) });
    cum += c.active;
    if (cum >= 0.8 * totalActive) break; // the 20% producing 80%
  }
  const topKeys = new Set(top.map((t) => t.key));
  const low = ranked
    .filter((c) => !topKeys.has(c.key))
    .map((c) => ({ key: c.key, label: c.label, active: c.active, share: Math.round((100 * c.active) / totalActive) }));

  // 80% of future effort split across the top by their share of it; 20% spread
  // evenly across the rest — never zero (diversification + testing).
  const effort = [
    ...top.map((t) => ({ key: t.key, label: t.label, band: 'scale', effortPct: Math.round((80 * t.active) / cum) })),
    ...low.map((l) => ({ key: l.key, label: l.label, band: 'test', effortPct: low.length ? Math.round(20 / low.length) : 0 })),
  ];
  return {
    enoughData: true,
    top,
    low,
    effort,
    note: 'Scale the top 20% (≈80% of effort); keep ≈20% on the rest for testing — never drop a channel entirely.',
  };
}

// Data-driven decision fill for the Daily Planner (plan-logic dayContent).
// When the system already knows the answer — next Idea Bank topic, best
// channel by CRM attribution, stable referral targets — the planned day
// STATES it instead of asking the founder to choose. A field is null when no
// reliable data exists, and the planner falls back to its ask-the-founder
// wording (the "only ask when no data" rule).
export function buildPlannerRecs({ clients = [], nextIdeaTitle = null }) {
  const perf = computeChannelPerformance({ clients, dailyRows: [], campaigns: [] });
  const par = channelPareto(perf);
  const top = par.enoughData ? par.top[0] : null;
  // "Stable" = the same engaged/retained definition retention logic uses.
  const stable = clients.filter((c) => ['engaged', 'retained'].includes(c.stage)).length;
  return {
    nextIdeaTitle: nextIdeaTitle || null,
    bestChannel: top ? { label: top.label, sharePct: top.share } : null,
    referralTargets: stable > 0 ? stable : null,
  };
}

// Join the plan's own campaign schedule (when each starts, expected KPIs) with
// the measured actuals per channel, so the Monthly Review shows expected vs
// actual + completion status without a second scheduling source.
export function attachActuals(schedule, channelRows) {
  const byKey = Object.fromEntries(channelRows.map((c) => [c.key, c]));
  const CHANNEL_FOR = {
    referral: 'referrals', facebook_ads: 'paid_ads', seo: 'seo', youtube: 'youtube',
    sub_ib: 'referrals', telegram: 'telegram', webinar: 'community', shortform: 'organic',
  };
  return (schedule || []).map((c) => {
    const chKey = CHANNEL_FOR[c.key] || null;
    const actual = chKey ? byKey[chKey] : null;
    return {
      ...c,
      actual: actual
        ? { leads: actual.leads, active: actual.active, activeRate: actual.activeRate, costPerActive: actual.costPerActive }
        : null,
    };
  });
}
