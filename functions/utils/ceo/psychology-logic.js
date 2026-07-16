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
