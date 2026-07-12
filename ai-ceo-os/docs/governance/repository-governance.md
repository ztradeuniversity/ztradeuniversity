---
id: repository-governance
type: governance
title: Repository Governance
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: How changes to this repository's structure and standards are controlled — prevents drift over years of development.
---

# Repository Governance

## Document hierarchy (highest wins on conflict)

Business Foundation → Technical/Business Architecture → Engineering Constitutions (this document's
family) → Implementation Blueprints → phase-level documents (this repo's own docs). A lower
document never silently contradicts a higher one — a conflict is a Structural change, resolved
explicitly, never patched around.

## Change tiers

- **Trivial** — typo, formatting, non-behavioral. Fix directly, one-line note in the relevant
  file's own history (git log is sufficient — no separate ceremony).
- **Standard** — a task within already-approved scope. Full contribution-standards.md review
  cycle, no separate approval ceremony beyond that.
- **Structural** — touches the folder architecture, naming standards, a locked rubric, a permanent
  line, or an already-shipped module's contract. Requires: a change record (reason, expected
  benefit, expected risk, dependencies affected, rollback strategy, validation method,
  documentation updates needed) **plus explicit founder approval**, recorded as a Decision Log
  entry, before any change is made.

## What's permanent vs. what evolves

**Permanent (Structural-change-only):** the folder tree, naming standards, the module boundaries
(the seven modules + L0), the four permanent lines (Client-Outcome, No-Advice, Automation,
Compliance), the locked scoring rubric weights.

**Evolves normally:** feature flags, content, KPI targets (once real baselines exist), the
implementation wave's internal task list, non-structural documentation.

## Anti-drift rules

- Three Standard changes to the same file/module in one wave forces a stop-and-replan — the
  original task was mis-scoped, not in need of a fourth patch.
- A rejected recommendation re-enters only via new evidence through the Decision Log, never
  through an unrelated "change."
- Superseded documents are never deleted — status flips to `superseded`, with a pointer forward.
  The audit trail is the point.

## Traceability

Every Structural change and every major technical decision gets a `docs/decisions/DEC-<seq>.md`
entry, using `docs/decisions/_template.md`. If it isn't in the Decision Log, it isn't a decision —
it's an assumption, and assumptions get corrected on sight.
