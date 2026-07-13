// functions/utils/ceo/physical-logic.js
//
// Pure 15-day rolling-area math for the Physical IB Expansion engine.
// The queue and cycle length live in settings (physical.area_queue,
// physical.cycle_days, physical.start_date) — this computes which area is
// live today, which are done, and which remain. Deterministic from the
// start date: "move automatically to the next area" is date math, not a
// mutable pointer, so it can never drift or double-advance. The queue never
// wraps — when exhausted, the founder schedules the next round explicitly
// ("never repeat an area unless scheduled"). Exported pure for QA.

const DAY_MS = 86400000;

export function currentAreaAssignment(queue, startDate, cycleDays = 15, now = Date.now()) {
  const q = Array.isArray(queue) ? queue : [];
  if (!startDate || q.length === 0) {
    return { started: false, exhausted: false, current: null, index: null, daysLeft: null, done: [], remaining: q };
  }
  const start = Date.parse(startDate);
  if (!Number.isFinite(start) || start > now) {
    return { started: false, exhausted: false, current: null, index: null, daysLeft: null, done: [], remaining: q };
  }
  const totalDays = Math.floor((now - start) / DAY_MS);
  const index = Math.floor(totalDays / cycleDays);
  if (index >= q.length) {
    return { started: true, exhausted: true, current: null, index: null, daysLeft: null, done: q.slice(), remaining: [] };
  }
  const daysIntoCycle = totalDays - index * cycleDays;
  return {
    started: true,
    exhausted: false,
    current: q[index],
    index,
    daysLeft: cycleDays - daysIntoCycle,
    done: q.slice(0, index),
    remaining: q.slice(index + 1),
  };
}
