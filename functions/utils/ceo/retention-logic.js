// functions/utils/ceo/retention-logic.js
//
// Shared retention computation — extracted from retention.js (Founder OS
// Restructure Step 3) so mission.js can surface the same due/at-risk/dormant
// list on Home without a second HTTP endpoint or a duplicated copy of the
// milestone ladder. retention.js still owns the one public
// GET /api/ceo/retention route; this is the pure computation both it and
// mission.js call against already-fetched rows.

const MILESTONES = [
  { day: 1, key: 'day1_voice', label: 'Day-1 welcome voice note' },
  { day: 7, key: 'day7_checkin', label: 'Day-7 check-in' },
  { day: 14, key: 'day14_streak', label: 'Day-14 streak recognition' },
  { day: 30, key: 'day30_report', label: 'Day-30 progress recognition' },
  { day: 60, key: 'day60_psych', label: 'Day-60 psychology touch' },
  { day: 90, key: 'day90_gate', label: 'Day-90 survival recognition' },
];
const DORMANT = [30, 60, 90, 180];

// Milestones that are genuine celebration/recognition moments — when they
// land on a high-equity client, the due-list item is also a "congratulate a
// top performer" moment (Step 3, Retention examples). Real data (equity_band
// + the existing milestone ladder), not a separate invented computation.
const RECOGNITION_MILESTONES = new Set(['day30_report', 'day60_psych', 'day90_gate']);

export async function computeRetention(db, uid, { silenceDays = 14, maxTouches = 5 } = {}) {
  const [clients, transitions, touches, templates] = await Promise.all([
    db.select('ib_clients', `select=id,full_name,stage,equity_band&owner_user_id=eq.${uid}&limit=300`),
    db.select('lead_pipeline', `select=ib_client_id,to_stage,occurred_at&owner_user_id=eq.${uid}&to_stage=eq.activated&order=occurred_at.asc&limit=500`),
    db.select('client_touches', `select=ib_client_id,summary,occurred_at&owner_user_id=eq.${uid}&order=occurred_at.desc&limit=1000`),
    db.select('knowledge_base', `select=title,content&owner_user_id=eq.${uid}&category=eq.retention-template`),
  ]);

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
              equity: c.equity_band || null,
              isTopPerformer: c.equity_band === 'high' && RECOGNITION_MILESTONES.has(m.key),
            });
          }
        }
      }
    }
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

  atRisk.sort((a, b) => (b.equity === 'high') - (a.equity === 'high') || b.silentDays - a.silentDays);
  due.sort((a, b) => b.isTopPerformer - a.isTopPerformer);

  return {
    due: due.slice(0, maxTouches),
    atRisk: atRisk.slice(0, maxTouches),
    dormant,
    counts: { due: due.length, atRisk: atRisk.length, dormant: dormant.length },
  };
}
