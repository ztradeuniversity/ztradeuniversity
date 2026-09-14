// functions/api/ceo/growth.js  ->  GET/POST/PATCH-via-POST /api/ceo/growth
//
// M4 wiring: content kanban (content_library), campaigns table. Publishing to
// the live ZTU site remains a founder action through the warehouse workflow —
// this endpoint only tracks status (the locked Integration Blueprint boundary).

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { CONTENT_IDEA_BANK } from '../../utils/ceo/content-ideas.js';
import { generatePollSchedule, parsePollNotes } from '../../utils/ceo/poll-bank.js';

const STATUSES = ['idea', 'production', 'published', 'evergreen', 'retired'];
// Section 4/5: the annual floor and the 5-year minimum this plan is audited
// against. targetPerYear (used only when generating a NEW schedule) is set
// above the floor so a quiet stretch never risks falling under 200.
const POLL_ANNUAL_TARGET = 200;
const POLL_ANNUAL_SEED_RATE = 210;
const POLL_PLAN_YEARS = 5;
const DAY_MS = 86400000;

function dateDiffDays(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS); }
function addDays(dateStr, n) { return new Date(Date.parse(dateStr) + n * DAY_MS).toISOString().slice(0, 10); }

// Which plan-year (1-5) a calendar date falls in, from the SAME plan.start_date
// Reset Plan already writes (activities.js) — deliberately NOT plan-logic.js's
// leave-aware planDayForDate: that walk is built for the master roadmap's
// day-by-day activity generation, and a poll's plan-year bucket for reporting
// doesn't need leave-shifting precision — a plain calendar-day count keeps
// this addition small and self-contained. Falls back to the earliest poll's
// own date, then today, mirroring plan.js's own fallback order (§25).
function resolvePlanStart(settingByKey, polls, todayStr) {
  const fromSettings = settingByKey['plan.start_date'];
  if (fromSettings) return String(fromSettings).replace(/"/g, '');
  const dates = polls.map((p) => p.scheduled_date).filter(Boolean).sort();
  return dates[0] || todayStr;
}
function planYearOf(startDate, dateStr) {
  const day = dateDiffDays(startDate, dateStr);
  if (day < 0) return 1;
  return Math.min(POLL_PLAN_YEARS, Math.floor(day / 365) + 1);
}
function yearBounds(startDate, year) {
  return { from: addDays(startDate, (year - 1) * 365), to: addDays(startDate, year * 365 - 1) };
}

// Poll summary block (Section 23/26/29): today's poll, this week's count,
// the annual Target/Planned/Completed/Remaining, and the full 5-year audit.
// Pure — reads the same rows the GET handler already fetched, computes
// nothing that isn't directly backed by real content_library rows.
function buildPollSummary(pollRows, settingByKey, todayStr) {
  const startDate = resolvePlanStart(settingByKey, pollRows, todayStr);
  const currentYear = planYearOf(startDate, todayStr);

  const todayPoll = pollRows.find((p) => p.scheduled_date === todayStr) || null;
  const weekEnd = addDays(todayStr, 6);
  const thisWeek = pollRows.filter((p) => p.scheduled_date >= todayStr && p.scheduled_date <= weekEnd);
  const overdue = pollRows.filter((p) => p.scheduled_date && p.scheduled_date < todayStr && p.status === 'idea');

  const perYear = [];
  let totalPlanned = 0, totalCompleted = 0;
  for (let y = 1; y <= POLL_PLAN_YEARS; y++) {
    const { from, to } = yearBounds(startDate, y);
    const inYear = pollRows.filter((p) => p.scheduled_date >= from && p.scheduled_date <= to);
    const completed = inYear.filter((p) => p.status === 'published' || p.status === 'evergreen').length;
    const planned = inYear.length;
    totalPlanned += planned; totalCompleted += completed;
    perYear.push({ year: y, from, to, target: POLL_ANNUAL_TARGET, planned, completed, remaining: Math.max(0, POLL_ANNUAL_TARGET - completed) });
  }
  const minimum = POLL_ANNUAL_TARGET * POLL_PLAN_YEARS;
  const status = totalPlanned >= minimum ? 'above_minimum' : totalPlanned === minimum ? 'on_minimum' : 'below_minimum';

  return {
    planStartDate: startDate,
    currentYear,
    today: todayPoll ? { ...todayPoll, ...parsePollNotes(todayPoll.notes) } : null,
    thisWeek: thisWeek.map((p) => ({ ...p, ...parsePollNotes(p.notes) })),
    overdueCount: overdue.length,
    annual: perYear[currentYear - 1],
    fiveYear: { years: perYear, totalPlanned, totalCompleted, minimum, status },
    seeded: pollRows.length > 0,
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const [content, campaigns, tasks, pollRows, settingRows] = await Promise.all([
      db.select('content_library', `select=id,title,pillar,content_type,status,target_audience,published_url,notes&owner_user_id=eq.${uid}&order=created_at.asc&limit=300`),
      db.select('marketing_campaigns', `select=id,name,channel,status,budget,start_date&owner_user_id=eq.${uid}&order=created_at.desc&limit=50`),
      db.select('growth_tasks', `select=id,title,status,due_date&owner_user_id=eq.${uid}&status=neq.done&order=due_date.asc.nullslast&limit=50`),
      // Polls are content_library rows too (content_type='poll') — a separate,
      // uncapped select (limit=300 above would truncate a 1,000+ row 5-year
      // poll plan) rather than folding polls into the generic kanban query.
      db.select('content_library', `select=id,title,pillar,content_type,status,target_audience,scheduled_date,notes&owner_user_id=eq.${uid}&content_type=eq.poll&order=scheduled_date.asc&limit=2000`),
      db.select('settings', `select=key,value&scope=eq.global&key=eq.plan.start_date`),
    ]);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, []]));
    for (const c of content) (byStatus[c.status] || byStatus.idea).push(c);
    const settingByKey = Object.fromEntries((settingRows || []).map((r) => [r.key, r.value]));
    const polls = buildPollSummary(pollRows, settingByKey, today);
    return json({ content: byStatus, campaigns, tasks, polls });
  } catch (err) {
    return json({ error: 'growth_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  try {
    // Load the 300+ curated idea bank into the pipeline (Task 1). Inserts
    // ONLY titles not already present (case-insensitive) so it coexists with
    // founder ideas and never duplicates — safe to run more than once.
    if (body.action === 'seed_ideas') {
      const existing = await db.select('content_library', `select=title&owner_user_id=eq.${uid}&limit=2000`);
      const have = new Set(existing.map((c) => String(c.title || '').trim().toLowerCase()));
      const toAdd = CONTENT_IDEA_BANK.filter((i) => !have.has(i.title.toLowerCase()));
      if (toAdd.length === 0) return json({ ok: true, added: 0, total: existing.length, message: 'Idea bank already loaded — no duplicates added.' });
      // Insert in chunks to keep each request small.
      let added = 0;
      for (let i = 0; i < toAdd.length; i += 100) {
        const chunk = toAdd.slice(i, i + 100).map((idea) => ({
          owner_user_id: uid,
          title: idea.title.slice(0, 200),
          pillar: idea.pillar,
          content_type: 'video+article',
          status: 'idea',
          notes: '#BANK#',
        }));
        const rows = await db.insert('content_library', chunk);
        added += rows.length;
      }
      return json({ ok: true, added });
    }

    if (body.action === 'move') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ''))) return json({ error: 'invalid_id' }, 400);
      if (!STATUSES.includes(body.status)) return json({ error: 'invalid_status' }, 400);
      const patch = { status: body.status, updated_at: new Date().toISOString() };
      if (body.status === 'published' && body.published_url) {
        patch.published_url = String(body.published_url).slice(0, 300);
      }
      const rows = await db.update('content_library', `id=eq.${body.id}&owner_user_id=eq.${uid}`, patch);
      return json({ ok: true, item: rows[0] || null });
    }

    // Edit a content idea (title / pillar / type / audience / notes). notes
    // carries the meta tag the frontend builds (language, country, platform,
    // hook, CTA, and manual priority via `prio`), so priority and all other
    // fields round-trip through this one field without a schema change.
    if (body.action === 'edit') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ''))) return json({ error: 'invalid_id' }, 400);
      const patch = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) {
        const t = String(body.title || '').trim().slice(0, 200);
        if (!t) return json({ error: 'title_required' }, 400);
        patch.title = t;
      }
      if (body.pillar !== undefined) patch.pillar = String(body.pillar || '').slice(0, 40);
      if (body.content_type !== undefined) patch.content_type = String(body.content_type || '').slice(0, 40);
      if (body.target_audience !== undefined) patch.target_audience = String(body.target_audience || '').slice(0, 60) || null;
      if (body.notes !== undefined) patch.notes = String(body.notes || '').slice(0, 500) || null;
      if (body.scheduled_date !== undefined) {
        const d = String(body.scheduled_date || '');
        patch.scheduled_date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
      }
      const rows = await db.update('content_library', `id=eq.${body.id}&owner_user_id=eq.${uid}`, patch);
      if (!rows || rows.length === 0) return json({ error: 'not_found' }, 404);
      return json({ ok: true, item: rows[0] });
    }

    // Generate the 5-year Social Engagement poll plan (Section 4/5/6/7) —
    // constrained-randomized, category-balanced, duplicate-safe (poll-bank.js).
    // Dedupes on (title, scheduled_date) against whatever is already stored so
    // this is safe to re-run (e.g. after adding founder-created polls, or to
    // top up a partially-seeded plan) — same "safe to run more than once"
    // guarantee seed_ideas already gives the content idea bank.
    if (body.action === 'seed_polls') {
      const existing = await db.select(
        'content_library',
        `select=title,pillar,scheduled_date&owner_user_id=eq.${uid}&content_type=eq.poll&limit=3000`
      );
      if (existing.length > 0) {
        return json({ ok: true, added: 0, total: existing.length, message: 'Poll plan already seeded — no duplicates added. Use the poll list to add or reschedule individual polls.' });
      }
      const today = new Date().toISOString().slice(0, 10);
      const settingRows = await db.select('settings', `select=key,value&scope=eq.global&key=eq.plan.start_date`);
      const planStart = (settingRows[0] && String(settingRows[0].value).replace(/"/g, '')) || today;
      const seed = Number(String(body.seed || '').replace(/\D/g, '')) || 20260101;
      const schedule = generatePollSchedule({ startDate: planStart, totalDays: 1825, targetPerYear: POLL_ANNUAL_SEED_RATE, seed });
      let added = 0;
      for (let i = 0; i < schedule.length; i += 200) {
        const chunk = schedule.slice(i, i + 200).map((p) => ({ ...p, owner_user_id: uid }));
        const rows = await db.insert('content_library', chunk);
        added += rows.length;
      }
      return json({ ok: true, added, planStart, years: 5, annualTarget: POLL_ANNUAL_TARGET });
    }

    // Default: new idea (or a founder-added poll, when content_type='poll' —
    // scheduled_date is only meaningful there; harmless/null otherwise).
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return json({ error: 'title_required' }, 400);
    const scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.scheduled_date || '')) ? body.scheduled_date : null;
    const rows = await db.insert('content_library', [{
      owner_user_id: uid,
      title,
      pillar: String(body.pillar || 'fundamentals').slice(0, 40),
      content_type: String(body.content_type || 'video+article').slice(0, 40),
      status: 'idea',
      target_audience: String(body.target_audience || '').slice(0, 60) || null,
      notes: String(body.notes || '').slice(0, 500) || null,
      scheduled_date: scheduledDate,
    }]);
    return json({ ok: true, item: rows[0] });
  } catch (err) {
    return json({ error: 'growth_write_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
