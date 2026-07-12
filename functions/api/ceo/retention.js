// functions/api/ceo/retention.js  ->  GET /api/ceo/retention
//
// The daily retention due-list (7-4 Task 8), computed from real M3 data +
// seeded rules. Milestone schedule: days since the client entered 'activated'
// (from lead_pipeline history) checked against the 3B ladder checkpoints.
// At-risk: silence > threshold. Dormant checkpoints: 30/60/90/180.
// Everything returned is actionable: client, action type, template key.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';

const MILESTONES = [
  { day: 1, key: 'day1_voice', label: 'Day-1 welcome voice note' },
  { day: 7, key: 'day7_checkin', label: 'Day-7 check-in' },
  { day: 14, key: 'day14_streak', label: 'Day-14 streak recognition' },
  { day: 30, key: 'day30_report', label: 'Day-30 progress recognition' },
  { day: 60, key: 'day60_psych', label: 'Day-60 psychology touch' },
  { day: 90, key: 'day90_gate', label: 'Day-90 survival recognition' },
];
const DORMANT = [30, 60, 90, 180];

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const [clients, transitions, touches, settings, templates] = await Promise.all([
      db.select('ib_clients', `select=id,full_name,stage,equity_band&owner_user_id=eq.${uid}&limit=300`),
      db.select('lead_pipeline', `select=ib_client_id,to_stage,occurred_at&owner_user_id=eq.${uid}&to_stage=eq.activated&order=occurred_at.asc&limit=500`),
      db.select('client_touches', `select=ib_client_id,summary,occurred_at&owner_user_id=eq.${uid}&order=occurred_at.desc&limit=1000`),
      db.select('settings', `select=key,value&scope=eq.global&key=in.(retention.at_risk_silence_days,retention.max_daily_touches)`),
      db.select('knowledge_base', `select=title,content&owner_user_id=eq.${uid}&category=eq.retention-template`),
    ]);

    const silenceDays = Number((settings.find((s) => s.key === 'retention.at_risk_silence_days') || {}).value || 14);
    const maxTouches = Number((settings.find((s) => s.key === 'retention.max_daily_touches') || {}).value || 5);
    const templateByKey = Object.fromEntries(templates.map((t) => [t.title, t.content]));

    const activatedAt = {};
    for (const t of transitions) if (!activatedAt[t.ib_client_id]) activatedAt[t.ib_client_id] = t.occurred_at;
    const lastTouch = {};
    const touchSummaries = {};
    for (const t of touches) {
      if (!lastTouch[t.ib_client_id]) lastTouch[t.ib_client_id] = t.occurred_at;
      (touchSummaries[t.ib_client_id] ||= []).push(t.summary || '');
    }
    const now = Date.now();
    const daysSince = (iso) => Math.floor((now - new Date(iso).getTime()) / 86400000);

    const due = [];
    const atRisk = [];
    const dormant = [];

    for (const c of clients) {
      // Milestones (activated clients only): due if the checkpoint passed within
      // the last 3 days and no touch mentioning it was logged.
      if (activatedAt[c.id]) {
        const age = daysSince(activatedAt[c.id]);
        for (const m of MILESTONES) {
          if (age >= m.day && age <= m.day + 3) {
            const alreadyDone = (touchSummaries[c.id] || []).some((s) => s.includes(m.key));
            if (!alreadyDone) {
              due.push({
                clientId: c.id, name: c.full_name, stage: c.stage,
                action: m.key, label: m.label,
                template: templateByKey[m.key] || null,
              });
            }
          }
        }
      }
      // At-risk / dormant by silence.
      const silent = lastTouch[c.id] ? daysSince(lastTouch[c.id]) : daysSince(activatedAt[c.id] || new Date().toISOString());
      if (silent >= silenceDays && silent < DORMANT[0]) {
        atRisk.push({
          clientId: c.id, name: c.full_name, stage: c.stage, silentDays: silent,
          equity: c.equity_band, template: templateByKey['atrisk_gentle'] || null,
        });
      }
      for (const d of DORMANT) {
        if (silent === d) {
          dormant.push({
            clientId: c.id, name: c.full_name, checkpoint: d,
            template: templateByKey[`dormant_${d === 180 ? '90_180' : d}`] || templateByKey['dormant_90_180'] || null,
          });
        }
      }
    }

    // Rank at-risk by equity (high first) then silence, cap the daily list.
    atRisk.sort((a, b) => (b.equity === 'high') - (a.equity === 'high') || b.silentDays - a.silentDays);

    return json({
      due: due.slice(0, maxTouches),
      atRisk: atRisk.slice(0, maxTouches),
      dormant,
      counts: { due: due.length, atRisk: atRisk.length, dormant: dormant.length },
    });
  } catch (err) {
    return json({ error: 'retention_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
