// functions/api/ceo/mission.js  ->  GET /api/ceo/mission
//
// The Founder Mission Center engine (Founder OS Restructure Step 3, built on
// Step 2's Today's Mission). One endpoint answers "what should I do today"
// across both execution pillars: Section 1 enriches the existing ranked
// mission list (focus/priority/expected outcome/why, on top of Step 2's
// tier->staleness->time-fit ranking, UNCHANGED); Section 2 is a Self Trading
// mentor check-in built from trading_rules/trading_records/rule_violations;
// Section 3 is IB Growth split into Acquisition/Retention, built from
// ib_clients/client_touches/content_library/growth_tasks and the shared
// retention computation (utils/ceo/retention-logic.js — the same one
// GET /api/ceo/retention uses, not a duplicate). Research surfacing reads the
// already-seeded research_library/knowledge_base rows by their exact, locked
// title — it does not invent a rotation or re-run research.
//
// No new tables, no new columns, no new endpoints — every query below hits a
// table that already existed before this step.

import { rest, json, requireFounder, parseExecTag, stripExecTag } from '../../utils/ceo/db.js';
import { computeRetention } from '../../utils/ceo/retention-logic.js';
import { delayCostLabel, automationStatusLabel } from '../../utils/ceo/coach-logic.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIER_ORDER = { CRITICAL: 0, IMPORTANT: 1, OPTIONAL: 2 };
const TIER_LABEL = ['Critical', 'Important', 'Optional'];
const IMPACT_LABEL = ['high', 'medium', 'low'];
const IMPACT_RANK = { high: 0, medium: 1, low: 2 };
// Class day is Saturday, review day Friday by convention (documented in the
// cadence templates); production day comes from settings, publish = day after.
const CLASS_DAY = 'saturday';
const REVIEW_DAY = 'friday';

// Section 1 enrichment — maps each cadence activity to the KPI it moves and
// the seeded execution-checklist entry (WHY/STEPS/KPI/MISTAKES) that explains
// it, where one exists. Grounded in the real key sets seeded in seed-01/02 —
// not every activity has a checklist counterpart, and that's shown honestly
// (falls back to the activity's own embedded rule text) rather than invented.
// automationKeys join to automation_registry.key — which real automations
// touch this activity, if any (empty = Founder Manual by design, e.g. trust
// moments like community_touch/ib_followups/live_class are never delegated).
const ACTIVITY_META = {
  'daily.core_block': { kpiKey: 'trading.journal_streak', checklistKey: null, automationKeys: [] },
  'daily.community_touch': { kpiKey: 'community.reply_rate', checklistKey: 'community_touch', automationKeys: [] },
  'daily.retention_touches': { kpiKey: 'retention.at_risk_recovery', checklistKey: 'retention_touch', automationKeys: ['retention.milestone_due', 'retention.at_risk_flags'] },
  'daily.ib_followups': { kpiKey: 'clients.activation_rate', checklistKey: 'ib_conversation', automationKeys: [] },
  'daily.shutdown': { kpiKey: 'founder.core_block_streak', checklistKey: null, automationKeys: [] },
  'daily.technical_analysis': { kpiKey: 'content.chain_completion', checklistKey: null, automationKeys: [] },
  'daily.physical_outreach': { kpiKey: null, checklistKey: null, automationKeys: [] },
  'weekly.film_video': { kpiKey: 'content.videos_published', checklistKey: 'weekly_video', automationKeys: [] },
  'weekly.live_class': { kpiKey: 'community.members', checklistKey: 'live_class', automationKeys: [] },
  'weekly.publish_chain': { kpiKey: 'content.chain_completion', checklistKey: 'publish_chain', automationKeys: ['content.transcript_draft', 'content.clip_queue'] },
  'weekly.review': { kpiKey: 'founder.critical_completion', checklistKey: 'weekly_review', automationKeys: ['mentor.review_prefill'] },
  'weekly.kpi_entry': { kpiKey: null, checklistKey: 'kpi_entry', automationKeys: ['kpi.weekly_snapshot'] },
  'weekly.email_digest': { kpiKey: null, checklistKey: null, automationKeys: ['email.weekly_digest'] },
  'weekly.learning_slot': { kpiKey: 'learning.weekly_slot', checklistKey: null, automationKeys: [] },
  'monthly.transparency_report': { kpiKey: 'retention.survival_90d', checklistKey: 'transparency_report', automationKeys: [] },
  'monthly.content_audit': { kpiKey: 'content.watch_time', checklistKey: 'monthly_audit', automationKeys: [] },
  'quarterly.review_gates': { kpiKey: null, checklistKey: null, automationKeys: [] },
};

// Day-type -> the platform whose cadence is active today (Business Architecture
// M4 + the seeded platform-playbook rows: production day films for YouTube,
// publish day writes the GEO article for the website, community day works
// Telegram/WhatsApp).
const DAY_PLATFORM = { production: 'youtube', publish: 'website', community: 'telegram', review: 'youtube' };
const ACQUISITION_STAGES = ['lead', 'qualified', 'onboarding'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Per-activity execution guidance (Section 1, "complete hand-holding").
// Steps come FIRST from the seeded execution-checklist STEPS field where one
// exists (parsed in enrichActivity); GUIDE_STEPS only fills the few cadence
// keys that have no checklist. Best times trace to the seeded platform
// playbooks (PK evenings 7-11pm PKT serves GCC same upload) — defaults, not
// rules, per the seeded posting_times_note.
const BEST_TIME = {
  'daily.core_block': 'First 15 minutes of the work day',
  'daily.community_touch': 'Evening 7–11pm PKT (peak PK + GCC hours)',
  'daily.retention_touches': 'Right after the community block',
  'daily.ib_followups': 'Evening 8–10pm (decision conversations land at night)',
  'daily.technical_analysis': 'Session overlap 6–8pm PKT (gold most active)',
  'daily.physical_outreach': '10am–1pm (institute office hours)',
  'weekly.film_video': 'Morning deep-work block, before messages open',
  'weekly.publish_chain': 'Morning after production day',
  'weekly.live_class': 'Saturday evening fixed slot',
  'weekly.review': 'Friday, close of day',
  'weekly.kpi_entry': 'Inside the review block',
  'weekly.email_digest': 'Inside the review block',
  'weekly.learning_slot': 'Any low-energy slot — freely movable',
};
const GUIDE_STEPS = {
  'daily.technical_analysis': [
    'Open the gold (XAUUSD) or BTC chart',
    "Mark today's key levels and structure",
    'Post a 2-line educational read on Telegram — analysis, never a signal',
    'Answer replies; point serious questioners to the free course',
  ],
  'daily.physical_outreach': [
    "Check the current cycle area (Physical IB Expansion section)",
    'Pick 1–2 institutes from the CRM — or add ones you found today',
    'Visit or call: intro → free-class offer → proposal if warm',
    'Log the visit + set the follow-up date in the CRM',
  ],
  'weekly.email_digest': ['Write the one founder paragraph', 'Queue the digest — sequences do the rest'],
  'weekly.learning_slot': ['Open the reading queue', '30 focused minutes; save one applicable note'],
};
// Concrete outcome line per activity (target, not a promise) — shown as
// "Expected outcome" alongside the KPI it moves.
const OUTCOME_LINE = {
  'daily.community_touch': '~2 qualified conversations; every question answered <24h',
  'daily.retention_touches': "Today's due-list cleared; Day-1 voice notes same-day",
  'daily.ib_followups': '1 flagged conversation advanced a stage',
  'daily.technical_analysis': '1 authority post with real replies',
  'daily.physical_outreach': '1–2 institutes contacted; every contact logged with a follow-up date',
  'weekly.film_video': '1 long-form filmed; watch-time >40% target',
  'weekly.publish_chain': 'Article live ≤48h after the video + 3–5 clips queued',
  'weekly.live_class': 'Attendance + replay views — the weekly conversion moment',
  'weekly.review': "Review complete; next week's Focus picked",
};

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  const realToday = new Date().toISOString().slice(0, 10);
  // Date-first Home: the founder picks a date before the day's plan loads.
  // Cadence instantiation (below) still only ever fires for the REAL today —
  // viewing a past/future date must never create daily_activities rows.
  const reqUrl = new URL(request.url);
  const viewDate = DATE_RE.test(reqUrl.searchParams.get('date') || '') ? reqUrl.searchParams.get('date') : realToday;
  const dayName = DAY_NAMES[new Date(viewDate + 'T00:00:00Z').getDay()];

  try {
    const settings = await db.select('settings', 'select=key,value&scope=eq.global');
    const setting = (k, fallback) => {
      const row = settings.find((s) => s.key === k);
      return row ? row.value : fallback;
    };
    const productionDay = String(setting('week.production_day', 'monday')).replace(/"/g, '');
    const publishDay = DAY_NAMES[(DAY_NAMES.indexOf(productionDay) + 1) % 7];

    // Approved leave periods (written by activities.js submit_leave). A day
    // inside a leave period gets no activities instantiated and can never
    // surface as overdue — the plan shifts forward instead (plan-logic.js
    // skips leave dates without consuming a plan day).
    const leavePeriods = asLeaveArray(setting('leave.periods', []));
    const inLeave = (d) => leavePeriods.some((p) => p && p.start <= d && d <= p.end);
    const onLeave = inLeave(viewDate);

    const dayType =
      dayName === productionDay ? 'production'
      : dayName === publishDay ? 'publish'
      : dayName === REVIEW_DAY ? 'review'
      : 'community';

    // 1) Instantiate today's activities from templates, once per day. This
    // query stays scoped to viewDate=eq — a separate query below (1c) fetches
    // any still-open activity from EARLIER dates, so a missed day/week/month
    // stays visible as Overdue instead of silently vanishing (Founder OS
    // Refinement Patch 1 — "nothing disappears automatically").
    let activities = await db.select(
      'daily_activities',
      `select=id,activity_type,description,status&owner_user_id=eq.${uid}&activity_date=eq.${viewDate}&order=created_at.asc`
    );
    // Never auto-create rows for a past/future date merely being VIEWED —
    // instantiation only fires when the picker is on the real today, and
    // never on an approved leave day.
    if (activities.length === 0 && viewDate === realToday && !onLeave) {
      const templates = await db.select(
        'knowledge_base',
        `select=title,content&owner_user_id=eq.${uid}&category=eq.cadence-template&is_active=eq.true`
      );
      const wanted = templates.filter((t) => {
        if (t.title.startsWith('daily.')) return true;
        if (t.title === 'weekly.film_video') return dayType === 'production';
        if (t.title === 'weekly.publish_chain') return dayType === 'publish';
        if (t.title === 'weekly.review') return dayType === 'review';
        if (t.title === 'weekly.live_class') return dayName === CLASS_DAY;
        if (t.title === 'weekly.kpi_entry' || t.title === 'weekly.email_digest' || t.title === 'weekly.learning_slot')
          return dayType === 'review'; // batched onto review day
        return false; // monthly/quarterly surface via review flow, not the daily list
      });
      if (wanted.length > 0) {
        activities = await db.insert(
          'daily_activities',
          wanted.map((t) => ({
            owner_user_id: uid,
            activity_date: viewDate,
            activity_type: t.title,
            description: t.content,
            status: 'pending',
          }))
        );
      }
    }

    // 1b) Section 1 enrichment sources — KPI labels + execution-checklist WHY
    // text, fetched once and joined onto every parsed item below.
    const neededKpiKeys = [...new Set(Object.values(ACTIVITY_META).map((m) => m.kpiKey).filter(Boolean))];
    const [kpiDefs, checklistDocs, automationRows, overdueRows] = await Promise.all([
      neededKpiKeys.length
        ? db.select('kpi_definitions', `select=key,label&key=in.(${neededKpiKeys.join(',')})`)
        : Promise.resolve([]),
      db.select('knowledge_base', `select=title,content&owner_user_id=eq.${uid}&category=eq.execution-checklist`),
      // Fetched once here (ALL rows, active or not) and reused by both the
      // parsed mission items below and computeAcquisition — one query, not
      // a second copy of the same registry read.
      db.select('automation_registry', 'select=key,label,matrix_class,is_active'),
      // 1c) Overdue — still-pending activities from BEFORE today, any age.
      // Capped at 500 (a technical bound only, never a business rule — oldest
      // sorts first via the owner_date index, so a founder who somehow has
      // 500+ backlog rows still sees the most urgent ones first).
      db.select('daily_activities', `select=id,activity_type,description,status,activity_date&owner_user_id=eq.${uid}&activity_date=lt.${realToday}&status=eq.pending&order=activity_date.asc&limit=500`),
    ]);
    const kpiLabelByKey = Object.fromEntries(kpiDefs.map((k) => [k.key, k.label]));
    const checklistByKey = Object.fromEntries(checklistDocs.map((c) => [c.title, c.content]));
    const automationByKey = Object.fromEntries(automationRows.map((a) => [a.key, a]));

    // 2) Parse + enrich + rank: tier -> time (shorter first among equals keeps
    // momentum). enrichActivity is shared with the overdue backlog below so
    // both get identical why/expectedOutcome/automationStatus treatment —
    // one enrichment path, not a second copy.
    const enrichActivity = (a, isOverdue) => {
      const execMeta = parseExecTag(a.description);
      const base = stripExecTag(a.description);
      const [tierStr, time] = (base || '').split('|').map((s) => s.trim());
      const tierRank = TIER_ORDER[tierStr] ?? 1;
      const meta = ACTIVITY_META[a.activity_type] || {};
      const rule = (base || '').split('|').slice(3).join('|').trim();
      // Micro-steps: the seeded checklist's STEPS field where one exists,
      // else the GUIDE_STEPS fallback for checklist-less cadence keys.
      const checklistSteps = meta.checklistKey
        ? extractChecklistField(checklistByKey[meta.checklistKey], 'STEPS')
        : '';
      const steps = checklistSteps
        ? checklistSteps.split(/\s*->\s*/).map((s) => s.trim()).filter(Boolean)
        : GUIDE_STEPS[a.activity_type] || [];
      const kpiTarget = meta.checklistKey
        ? extractChecklistField(checklistByKey[meta.checklistKey], 'KPI')
        : '';
      return {
        steps,
        bestTime: BEST_TIME[a.activity_type] || null,
        outcomeLine: OUTCOME_LINE[a.activity_type] || kpiTarget || null,
        id: a.id,
        key: a.activity_type,
        status: a.status,
        execState: execMeta.state === 'not_started' && a.status !== 'pending' ? a.status : execMeta.state,
        realMinutes: execMeta.realMinutes,
        note: execMeta.note,
        tierRank,
        priority: TIER_LABEL[tierRank],
        impact: IMPACT_LABEL[tierRank],
        minutes: parseMinutes(time),
        rule,
        expectedOutcome: meta.kpiKey ? kpiLabelByKey[meta.kpiKey] || null : null,
        why: (meta.checklistKey && extractChecklistField(checklistByKey[meta.checklistKey], 'WHY')) || rule || null,
        // Delay cost is a LABEL derived from the locked tier (+ whether it's
        // already overdue), never a fabricated number.
        delayCost: delayCostLabel(tierRank, isOverdue),
        automationStatus: automationStatusLabel((meta.automationKeys || []).map((k) => automationByKey[k]).filter(Boolean)),
        ...(isOverdue ? { activityDate: a.activity_date, daysOverdue: Math.floor((Date.now() - new Date(a.activity_date).getTime()) / 86400000) } : {}),
      };
    };
    const parsed = activities.map((a) => enrichActivity(a, false));
    const core = parsed.filter((p) => p.key === 'daily.core_block' || p.key === 'daily.shutdown');
    const rankable = parsed
      .filter((p) => !core.includes(p) && p.status === 'pending')
      .sort((a, b) => a.tierRank - b.tierRank || a.minutes - b.minutes);
    const done = parsed.filter((p) => p.status !== 'pending' && !core.includes(p));
    const maxTop = Number(setting('mission.max_top_items', 3));
    const totalMinutes = parsed.filter((p) => p.status === 'pending').reduce((s, p) => s + p.minutes, 0);
    const focus = rankable[0] || null;

    // Overdue backlog — ranked oldest-and-most-critical first (Patch 1's
    // "Overdue" priority tier). Never merged into today's rankable list, so
    // today's own tier ranking (and the 80/20 focus) stays exactly as before.
    // Rows dated inside an approved leave period are excluded — leave days
    // never become pending (submit_leave also skips them at write time; this
    // covers periods approved from another device before that patch ran).
    const overdue = overdueRows
      .filter((a) => !inLeave(a.activity_date))
      .map((a) => enrichActivity(a, true))
      .sort((a, b) => b.daysOverdue - a.daysOverdue || a.tierRank - b.tierRank);

    // 3) Needs attention (silence-based, all clients — unchanged from Step 2).
    const silenceDays = Number(setting('retention.at_risk_silence_days', 14));
    const maxTouches = Number(setting('retention.max_daily_touches', 5));
    const attention = await computeAttention(db, uid, silenceDays);

    // 4) Headline KPI.
    const headlineKey = String(setting('dashboard.headline_kpi', '"clients.activation_rate"')).replace(/"/g, '');
    const headline = await computeHeadline(db, headlineKey);

    // 5) Mentor morning line (seeded template for this day type).
    const tmpl = await db.select(
      'knowledge_base',
      `select=content&owner_user_id=eq.${uid}&category=eq.mentor-template&title=eq.morning_${dayType}`
    );
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const timeStr = `${hours ? hours + 'h ' : ''}${mins}m`;
    const mentorMessage = (tmpl[0]?.content || 'Salaam. Aaj ka plan tayyar hai.')
      .replace('[time]', timeStr)
      .replace('[topic]', rankable[0]?.key?.replace(/^weekly\.|^daily\./, '').replace(/_/g, ' ') || '')
      .replace('[n]', String(attention.length))
      .replace('[next]', '')
      .replace('[highlight]', 'retention');

    // 6) Section 2 — Self Trading mentor check-in.
    const trading = await computeTradingCheckin(db, uid, viewDate);

    // 7) Section 3 — IB Growth: Acquisition + Retention.
    const [acquisition, retention] = await Promise.all([
      computeAcquisition(db, uid, dayType, automationRows),
      computeRetention(db, uid, { silenceDays, maxTouches }),
    ]);

    // 8) Research surfacing — the locked #1 priority row per domain, read by
    // its exact seeded title (decision_log: "Pakistan-first launch"), not a
    // rotation or new lookup.
    const research = await computeResearchFocus(db, uid);

    const leavePeriod = onLeave ? leavePeriods.find((p) => p.start <= viewDate && viewDate <= p.end) : null;
    return json({
      date: viewDate,
      dayType,
      leave: onLeave
        ? { onLeave: true, start: leavePeriod.start, end: leavePeriod.end, reason: leavePeriod.reason || '' }
        : { onLeave: false },
      estimatedMinutes: totalMinutes,
      mentorMessage,
      focus,
      overdue,
      top: rankable.slice(0, maxTop),
      rest: rankable.slice(maxTop),
      done,
      coreBlock: core,
      attention,
      headlineKpi: headline,
      trading,
      growth: { acquisition, retention },
      research,
    });
  } catch (err) {
    return json({ error: 'mission_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}

// settings.value arrives as parsed jsonb, but rows written through the REST
// helper may hold a JSON-encoded string — accept both.
function asLeaveArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

function parseMinutes(str) {
  if (!str) return 30;
  const h = /([\d.]+)\s*h/i.exec(str);
  const m = /(\d+)\s*m/i.exec(str);
  const d = /(\d+)\s*day/i.exec(str);
  let total = 0;
  if (h) total += Math.round(parseFloat(h[1]) * 60);
  if (m) total += parseInt(m[1], 10);
  if (d) total += parseInt(d[1], 10) * 480;
  return total || 30;
}

// Extracts one "FIELD: text" segment out of the seeded execution-checklist
// rows (format: "WHY: ... TIME: ... DIFF: ... PREP: ... STEPS: ..." etc,
// fields separated by ". " and named in caps).
function extractChecklistField(content, field) {
  if (!content) return '';
  const re = new RegExp(`${field}:\\s*(.*?)(?:\\s+[A-Z][A-Z ]{1,15}:|$)`);
  const m = re.exec(content);
  return m ? m[1].trim().replace(/\.$/, '') : '';
}

async function computeAttention(db, uid, silenceDays) {
  const clients = await db.select(
    'ib_clients',
    `select=id,full_name,stage&owner_user_id=eq.${uid}&order=updated_at.desc&limit=100`
  );
  if (clients.length === 0) return [];
  const touches = await db.select(
    'client_touches',
    `select=ib_client_id,occurred_at&owner_user_id=eq.${uid}&order=occurred_at.desc&limit=500`
  );
  const lastTouch = {};
  for (const t of touches) if (!lastTouch[t.ib_client_id]) lastTouch[t.ib_client_id] = t.occurred_at;
  const cutoff = Date.now() - silenceDays * 86400000;
  return clients
    .filter((c) => {
      const lt = lastTouch[c.id] ? new Date(lastTouch[c.id]).getTime() : 0;
      return lt < cutoff;
    })
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      name: c.full_name,
      stage: c.stage,
      lastTouch: lastTouch[c.id] || null,
      reason: lastTouch[c.id] ? `${silenceDays}+ din se koi touch nahin` : 'Abhi tak koi touch log nahin hua',
    }));
}

async function computeHeadline(db, key) {
  const defs = await db.select('kpi_definitions', `select=id,key,label,unit&key=eq.${key}`);
  if (defs.length === 0) return null;
  const hist = await db.select(
    'kpi_history',
    `select=value,recorded_for&kpi_id=eq.${defs[0].id}&order=recorded_for.desc&limit=2`
  );
  return {
    key,
    label: defs[0].label,
    unit: defs[0].unit,
    value: hist[0]?.value ?? null,
    previous: hist[1]?.value ?? null,
    recordedFor: hist[0]?.recorded_for ?? null,
  };
}

// Section 2 — Self Trading mentor check-in. Daily questions come from the
// founder's OWN seeded trading_rules ("Did you follow: <rule>?"), not a fixed
// literal question set — that's the only honest source that exists without
// new schema. journaledToday and repeatedMistake are both computed from real
// rows (trading_records, rule_violations), closing the mistake-correction
// loop flagged as a gap in the Step 1 blueprint.
async function computeTradingCheckin(db, uid, today) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const [rules, todayRecords, recentViolations] = await Promise.all([
    db.select('trading_rules', `select=id,title,category&owner_user_id=eq.${uid}&is_active=eq.true&order=created_at.asc`),
    db.select('trading_records', `select=id&owner_user_id=eq.${uid}&opened_at=gte.${today}`),
    db.select('rule_violations', `select=trading_rule_id,severity,created_at&owner_user_id=eq.${uid}&created_at=gte.${twoWeeksAgo}&order=created_at.desc&limit=200`),
  ]);
  const violByDay = {};
  const countByRule = {};
  for (const v of recentViolations) {
    const day = String(v.created_at).slice(0, 10);
    (violByDay[day] ||= new Set()).add(v.trading_rule_id);
    countByRule[v.trading_rule_id] = (countByRule[v.trading_rule_id] || 0) + 1;
  }
  const yesterdaySet = violByDay[yesterday] || new Set();
  const todaySet = violByDay[today] || new Set();
  const repeatedId = [...todaySet].find((id) => yesterdaySet.has(id));
  const repeatedMistake = repeatedId
    ? { ruleId: repeatedId, ruleTitle: rules.find((r) => r.id === repeatedId)?.title || 'rule' }
    : null;

  // Coaching from history: the most-broken rule over the last 14 days —
  // only when it's an actual pattern (2+), never noise from a single slip.
  const [topId, topCount] = Object.entries(countByRule).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const topViolated = topId && topCount >= 2
    ? { ruleId: topId, ruleTitle: rules.find((r) => r.id === topId)?.title || 'rule', count: topCount }
    : null;

  return {
    rulesCheckin: rules.map((r) => ({ id: r.id, title: r.title, category: r.category })),
    journaledToday: todayRecords.length > 0,
    repeatedMistake,
    topViolated,
  };
}

// Section 3a — Acquisition. Follow-ups come from real ib_clients silence (same
// pattern as computeAttention, scoped to pre-activation stages); content
// actions come from real content_library/growth_tasks rows; the platform
// suggestion is looked up from the seeded platform-playbook row for today's
// already-known day type — no random task generation.
async function computeAcquisition(db, uid, dayType, automationRows) {
  const [clients, touches, content, tasks, platformDocs] = await Promise.all([
    db.select('ib_clients', `select=id,full_name,stage&owner_user_id=eq.${uid}&stage=in.(${ACQUISITION_STAGES.join(',')})&limit=200`),
    db.select('client_touches', `select=ib_client_id,occurred_at&owner_user_id=eq.${uid}&order=occurred_at.desc&limit=500`),
    db.select('content_library', `select=id,title,status,pillar,target_audience&owner_user_id=eq.${uid}&status=in.(idea,production)&order=created_at.asc&limit=20`),
    db.select('growth_tasks', `select=id,title,due_date&owner_user_id=eq.${uid}&status=neq.done&order=due_date.asc.nullslast&limit=10`),
    db.select('knowledge_base', `select=title,content&owner_user_id=eq.${uid}&category=eq.platform-playbook`),
  ]);
  // Manual-vs-Automated classification for the execution plan: the honest
  // answer comes from the registry's is_active flags, never hardcoded — reuses
  // the ONE registry fetch already made by the caller, not a second query.
  const registry = (automationRows || []).filter((r) => r.is_active);

  const lastTouch = {};
  for (const t of touches) if (!lastTouch[t.ib_client_id]) lastTouch[t.ib_client_id] = t.occurred_at;
  const now = Date.now();
  const daysSince = (iso) => Math.floor((now - new Date(iso).getTime()) / 86400000);
  const STAGE_IMPACT = { onboarding: 'high', qualified: 'medium', lead: 'medium' };
  const followUps = clients
    .filter((c) => !lastTouch[c.id] || daysSince(lastTouch[c.id]) >= 3)
    .map((c) => ({
      clientId: c.id,
      name: c.full_name,
      stage: c.stage,
      label: c.stage === 'lead' ? 'Contact prospect' : 'Follow up warm lead',
      lastTouch: lastTouch[c.id] || null,
      impact: STAGE_IMPACT[c.stage] || 'medium',
    }))
    .sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact])
    .slice(0, 5);

  const nextIdea = content.find((c) => c.status === 'idea');
  const inProduction = content.filter((c) => c.status === 'production');
  const todayStr = new Date().toISOString().slice(0, 10);

  const platformByKey = Object.fromEntries(platformDocs.map((p) => [p.title, p.content]));
  const platformKey = DAY_PLATFORM[dayType] || 'youtube';

  return {
    followUps,
    nextIdea: nextIdea
      ? { id: nextIdea.id, title: nextIdea.title, pillar: nextIdea.pillar, audience: nextIdea.target_audience || null, impact: 'medium' }
      : null,
    inProduction: inProduction.map((c) => ({ id: c.id, title: c.title, audience: c.target_audience || null, impact: 'high' })),
    tasks: tasks
      .map((t) => ({ id: t.id, title: t.title, dueDate: t.due_date, impact: t.due_date && t.due_date < todayStr ? 'high' : 'medium' }))
      .sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]),
    suggestedPlatform: { key: platformKey, note: platformByKey[platformKey] || null },
    activeAutomations: registry.map((r) => ({ key: r.key, label: r.label })),
  };
}

// Research surfacing — reads the specific, already-locked #1 verdict per
// domain (decision_log: "Pakistan-first launch", "Language-split... Urdu",
// platform research_library row for YouTube). If the founder's research
// changes these later, updating the title lookup below is a one-line change;
// nothing here re-derives or re-scores the verdicts.
async function computeResearchFocus(db, uid) {
  const [country, language, platform] = await Promise.all([
    db.select('research_library', `select=title,verdict,confidence,summary&owner_user_id=eq.${uid}&domain=eq.country&title=eq.${encodeURIComponent('Pakistan — launch market')}`),
    db.select('research_library', `select=title,verdict,confidence,summary&owner_user_id=eq.${uid}&domain=eq.language&title=eq.${encodeURIComponent('Urdu / Roman-Urdu')}`),
    db.select('research_library', `select=title,verdict,confidence,summary&owner_user_id=eq.${uid}&domain=eq.platform&title=eq.YouTube`),
  ]);
  return {
    country: country[0] || null,
    language: language[0] || null,
    platform: platform[0] || null,
  };
}
