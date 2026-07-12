// functions/api/ceo/mission.js  ->  GET /api/ceo/mission
//
// The Today's Mission engine (interim, rule-based — L3's deterministic floor).
// On the first call of a day it instantiates daily_activities rows from the
// seeded cadence templates; on every call it returns the ranked mission:
// day type, top-3, remaining items, core block, needs-attention, headline KPI
// and the mentor's morning line. Ranking: tier -> staleness -> time-fit
// (seeded mission-rule 'ranking').

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIER_ORDER = { CRITICAL: 0, IMPORTANT: 1, OPTIONAL: 2 };
// Class day is Saturday, review day Friday by convention (documented in the
// cadence templates); production day comes from settings, publish = day after.
const CLASS_DAY = 'saturday';
const REVIEW_DAY = 'friday';

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const dayName = DAY_NAMES[new Date().getDay()];

  try {
    const settings = await db.select('settings', 'select=key,value&scope=eq.global');
    const setting = (k, fallback) => {
      const row = settings.find((s) => s.key === k);
      return row ? row.value : fallback;
    };
    const productionDay = String(setting('week.production_day', 'monday')).replace(/"/g, '');
    const publishDay = DAY_NAMES[(DAY_NAMES.indexOf(productionDay) + 1) % 7];

    const dayType =
      dayName === productionDay ? 'production'
      : dayName === publishDay ? 'publish'
      : dayName === REVIEW_DAY ? 'review'
      : 'community';

    // 1) Instantiate today's activities from templates, once per day.
    let activities = await db.select(
      'daily_activities',
      `select=id,activity_type,description,status&owner_user_id=eq.${uid}&activity_date=eq.${today}&order=created_at.asc`
    );
    if (activities.length === 0) {
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
            activity_date: today,
            activity_type: t.title,
            description: t.content,
            status: 'pending',
          }))
        );
      }
    }

    // 2) Rank: tier -> time (shorter first among equals keeps momentum).
    const parsed = activities.map((a) => {
      const [tier, time] = (a.description || '').split('|').map((s) => s.trim());
      return {
        id: a.id,
        key: a.activity_type,
        status: a.status,
        tier: TIER_ORDER[tier] === undefined ? 1 : tier,
        tierRank: TIER_ORDER[tier] ?? 1,
        minutes: parseMinutes(time),
        rule: (a.description || '').split('|').slice(3).join('|').trim(),
      };
    });
    const core = parsed.filter((p) => p.key === 'daily.core_block' || p.key === 'daily.shutdown');
    const rankable = parsed
      .filter((p) => !core.includes(p) && p.status === 'pending')
      .sort((a, b) => a.tierRank - b.tierRank || a.minutes - b.minutes);
    const done = parsed.filter((p) => p.status !== 'pending' && !core.includes(p));
    const maxTop = Number(setting('mission.max_top_items', 3));
    const totalMinutes = parsed.filter((p) => p.status === 'pending').reduce((s, p) => s + p.minutes, 0);

    // 3) Needs attention: clients with no touch in N days (max 3, oldest first).
    const silenceDays = Number(setting('retention.at_risk_silence_days', 14));
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

    return json({
      date: today,
      dayType,
      estimatedMinutes: totalMinutes,
      mentorMessage,
      top: rankable.slice(0, maxTop),
      rest: rankable.slice(maxTop),
      done,
      coreBlock: core,
      attention,
      headlineKpi: headline,
    });
  } catch (err) {
    return json({ error: 'mission_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
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
