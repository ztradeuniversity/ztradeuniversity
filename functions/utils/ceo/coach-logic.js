// functions/utils/ceo/coach-logic.js
//
// Pure coaching joins for the AI Founder Mentor layer (Business Execution
// patch). These translate REAL rows (institute stages, mission tiers) into
// the next concrete action — they carry no data of their own, invent no
// numbers, and every string either restates a seeded rule or names which
// seeded template to show. Exported pure so QA drives them directly.

// Institute pipeline → the single next action + which seeded sales-template
// rows coach it. Text is a short imperative; the FULL guidance is the seed
// row named in templateKeys (never duplicated here). Mirrors migration 032's
// stage set exactly.
const INSTITUTE_NEXT = {
  cold_contact:    { label: 'Contact & pitch the free session (walk-in or call, Urdu respect register)', phase: 'outreach', templateKeys: ['cold_contact'] },
  proposal_sent:   { label: 'Follow up at day 3; prep the meeting — objections + closing', phase: 'negotiation', templateKeys: ['proposal', 'negotiation', 'objections', 'follow_up'] },
  meeting:         { label: 'Run the meeting value-first (no revenue talk); book the next step', phase: 'negotiation', templateKeys: ['negotiation', 'objections'] },
  negotiation:     { label: 'Close — accept 2–3 institutes max; defer revenue-share to after the first batch', phase: 'negotiation', templateKeys: ['negotiation'] },
  accepted:        { label: 'Schedule classes and set the batch end date', phase: 'delivery', templateKeys: [] },
  classes_running: { label: 'Run the batch — push journal adoption + live-class invite; keep batch end date current', phase: 'delivery', templateKeys: [] },
  batch_complete:  { label: 'Convert engaged students (ib_conversation checklist); re-visit this institute at cohort day-90', phase: 'convert', templateKeys: [] },
  follow_up_later: { label: 'Parked — a follow-up is scheduled; never chase past two follow-ups (the 15-day clock rules)', phase: 'parked', templateKeys: ['follow_up'] },
  rejected:        { label: 'Log the lesson and move on — re-approach only if a future round schedules this area again', phase: 'closed', templateKeys: [] },
};

export function instituteNextStep(stage) {
  return INSTITUTE_NEXT[stage] || { label: 'Review this institute', phase: 'unknown', templateKeys: [] };
}

// Pipeline summary for the current 15-day area: real stage counts + the
// single phase the founder should push on now (earliest non-empty active
// stage — you can't chase meetings before proposals exist). No invented
// "today" deltas — the schema has no per-day stage history, so this reports
// standing counts honestly, not fabricated daily throughput.
const ACTIVE_ORDER = ['cold_contact', 'proposal_sent', 'meeting', 'negotiation', 'accepted', 'classes_running'];

export function pipelineSummary(institutes, currentArea) {
  const inArea = (institutes || []).filter((i) => !currentArea || i.area === currentArea);
  const counts = {};
  for (const i of inArea) counts[i.stage] = (counts[i.stage] || 0) + 1;
  const focusStage = ACTIVE_ORDER.find((s) => counts[s] > 0) || null;
  return {
    area: currentArea || null,
    total: inArea.length,
    counts,
    focusStage,
    focus: focusStage ? instituteNextStep(focusStage) : null,
    // The hand-holding question set, answered from real counts.
    questions: [
      { q: 'Institutes in this area', a: inArea.length },
      { q: 'At cold contact', a: counts.cold_contact || 0 },
      { q: 'Proposals sent', a: counts.proposal_sent || 0 },
      { q: 'Meetings booked', a: counts.meeting || 0 },
      { q: 'In negotiation', a: counts.negotiation || 0 },
      { q: 'Accepted / running', a: (counts.accepted || 0) + (counts.classes_running || 0) },
    ],
  };
}

// Delay-cost LABEL (never a fabricated number) for a mission item — a
// function of its locked tier and whether it's already overdue. Critical
// work compounds when delayed; optional work does not.
export function delayCostLabel(tierRank, isOverdue) {
  if (tierRank === 0) return isOverdue ? 'Severe — compounding loss every day it slips' : 'High — protect this slot';
  if (tierRank === 1) return isOverdue ? 'High — was due already' : 'Medium';
  return 'Low — safe to defer';
}

// Automation status LABEL from the REAL automation_registry rows that touch
// an activity — never a hardcoded Manual/Semi/Full guess. No matching rows
// = Founder Manual by design (a trust moment, never delegated). A matching
// row that exists but is inactive = Future AI Automation (built, not yet
// switched on) — distinct from Manual, since the founder already designed
// the automation, just hasn't activated it (Module Gate).
export function automationStatusLabel(matchingRows) {
  if (!matchingRows || matchingRows.length === 0) return 'Founder Manual';
  const active = matchingRows.filter((r) => r.is_active);
  if (active.length === 0) {
    return `Future AI Automation — ${matchingRows.map((r) => r.label).join(', ')} (not yet active)`;
  }
  const names = active.map((r) => r.label).join(', ');
  return active.every((r) => r.matrix_class === 'full') ? `Fully Automated — ${names}` : `Semi-Automated — ${names}`;
}
