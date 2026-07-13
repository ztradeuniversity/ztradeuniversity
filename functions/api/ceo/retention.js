// functions/api/ceo/retention.js  ->  GET /api/ceo/retention
//
// The daily retention due-list (7-4 Task 8). Computation lives in
// utils/ceo/retention-logic.js (Founder OS Restructure Step 3) so mission.js
// can surface the same list on Home without a second endpoint — this file
// still owns the one public route and its settings lookup.

import { rest, json, requireFounder } from '../../utils/ceo/db.js';
import { computeRetention } from '../../utils/ceo/retention-logic.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireFounder(request, env);
  if (auth.response) return auth.response;
  const db = rest(env, auth.token);
  const uid = auth.user.id;
  try {
    const settings = await db.select(
      'settings',
      `select=key,value&scope=eq.global&key=in.(retention.at_risk_silence_days,retention.max_daily_touches)`
    );
    const silenceDays = Number((settings.find((s) => s.key === 'retention.at_risk_silence_days') || {}).value || 14);
    const maxTouches = Number((settings.find((s) => s.key === 'retention.max_daily_touches') || {}).value || 5);

    const result = await computeRetention(db, uid, { silenceDays, maxTouches });
    return json(result);
  } catch (err) {
    return json({ error: 'retention_load_failed', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
