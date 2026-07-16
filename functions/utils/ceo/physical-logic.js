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

// Lahore's 10 seeded areas (seed-04) — everything else in the queue is a
// city-level entry appended by seed-06 (Refinement Patch 5). No new data
// structure needed: a city name simply IS its own queue entry, so this one
// lookup is enough to tell "which region does this queue entry belong to."
const LAHORE_AREAS = new Set(['Johar Town', 'Gulberg', 'Model Town', 'Township', 'Iqbal Town', 'Wapda Town', 'DHA', 'Garhi Shahu', 'Baghbanpura', 'Shalimar']);

export function regionForQueueEntry(entry) {
  return LAHORE_AREAS.has(entry) ? 'Lahore' : entry;
}

// Current/next/remaining REGIONS (cities) + an honestly-computed timeline —
// pure arithmetic on real config (cycleDays * entries left), never a
// fabricated projection. Exported pure for QA.
export function regionSummary(queue, assignment, cycleDays = 15) {
  const q = Array.isArray(queue) ? queue : [];
  const regionOf = regionForQueueEntry;
  const uniqueRegionsInOrder = (entries) => {
    const seen = new Set();
    const out = [];
    for (const e of entries) {
      const r = regionOf(e);
      if (!seen.has(r)) { seen.add(r); out.push(r); }
    }
    return out;
  };
  const currentRegion = assignment.current ? regionOf(assignment.current) : null;
  // "Next region" = the next queue entry whose region differs from the
  // current one (skips remaining areas still inside the current region).
  const remaining = assignment.remaining || [];
  const nextRegion = currentRegion
    ? (remaining.map(regionOf).find((r) => r !== currentRegion) || null)
    : (uniqueRegionsInOrder(remaining)[0] || null);
  // Excludes the current region itself — a region with areas still left
  // inside it is "in progress" (shown as currentRegion), not "remaining".
  const remainingRegions = uniqueRegionsInOrder(remaining).filter((r) => r !== currentRegion);
  const estimatedDaysRemaining = assignment.exhausted
    ? 0
    : (assignment.daysLeft || 0) + remaining.length * cycleDays;
  return {
    currentRegion,
    nextRegion,
    remainingRegions,
    estimatedDaysRemaining,
  };
}
