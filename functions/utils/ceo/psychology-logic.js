// functions/utils/ceo/psychology-logic.js
//
// Pure logic for the Personal Trading 5-question daily check-in's
// recurring-weakness detection — mirrors the existing per-module *-logic.js
// files (physical-logic.js, retention-logic.js). Given the last N days of
// trading_checkin rows, flags when the SAME weakness has been named more
// than once — a pattern, not a one-off — so Home can surface a short
// coaching line instead of the founder re-discovering it manually.

export function normalizeWeakness(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// rows: trading_checkin rows (any order) from the lookback window, each with
// a `weakness` field. currentText: the weakness just submitted (or already
// stored) for the viewed date. Returns { text, count } when the normalized
// text appears 2+ times in the window (including the current one), else null.
export function detectRecurringWeakness(rows, currentText) {
  const norm = normalizeWeakness(currentText);
  if (!norm) return null;
  const count = (rows || []).reduce((n, r) => n + (normalizeWeakness(r.weakness) === norm ? 1 : 0), 0);
  return count >= 2 ? { text: norm, count } : null;
}

// Short mentor lines built from the check-in history (rows: the 14-day
// lookback window incl. today; today: the viewed date's row or null).
// Patterns only — a single slip never generates noise; ≤2 lines so the
// coaching stays read, not skimmed. Known founder weaknesses (early entries,
// no confirmation, inconsistent execution, weak chart observation) surface
// here through the history itself, not a hardcoded lecture.
export function buildCoaching(rows, today) {
  const lines = [];
  const win = rows || [];
  const rec = today?.weakness ? detectRecurringWeakness(win, today.weakness) : null;
  if (rec) {
    lines.push(`"${rec.text}" — ${rec.count}× in 14 din. Yeh pattern hai, hadsa nahin: kal entry se pehle iska ek written counter-check rakhein (pehle confirmation, phir entry).`);
  }
  const ruleBreakDays = win.filter((r) => r.followed_rules === false).length;
  if (ruleBreakDays >= 3) {
    lines.push(`Rules ${ruleBreakDays} din toote pichhle 2 hafton mein — aaj sirf ek rule pakka karein: stop-loss entry se PEHLE, warna trade pass.`);
  }
  if (lines.length < 2 && today && today.avoided_repeat === false) {
    lines.push('Aaj wohi weakness dohrai gayi — note ho gayi, sharm nahin. Kal isko #1 watch rakhein; ek din ka conscious avoid hi streak ki shuruat hai.');
  }
  const noChartDays = win.filter((r) => r.analyzed_chart === false).length;
  if (lines.length < 2 && noChartDays >= 3) {
    lines.push(`Chart analysis ${noChartDays} din miss hui — kamzor chart observation isi se aati hai. Roz 10 minute ka fixed chart slot rakhein, trade ho ya na ho.`);
  }
  if (lines.length === 0 && today && today.followed_rules === true) {
    lines.push('Discipline qaim — yehi asal edge hai. Aaj ka green din streak mein jama ho gaya.');
  }
  return lines.slice(0, 2);
}
