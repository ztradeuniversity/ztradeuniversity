---
id: coding-standards
type: governance
title: Coding Standards
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Engineering standards for this project — plain HTML/CSS/JS, no build step, no framework. Distills the Development Constitution into a working reference.
---

# Coding Standards

Distilled from the Development Constitution for day-to-day use. This is the reference a coding
session should actually consult — the full constitution has the reasoning, this has the rules.

## Stack

Plain HTML/CSS/JS, no framework, no build step, served by Cloudflare Pages (static) + Cloudflare
Pages Functions (server logic). Confirmed in `docs/decisions/DEC-001-initialization.md`.

## Priority order when rules conflict

Correctness → clarity → brevity. Never trade the first two for the third.

## Layer boundaries (non-negotiable)

- `functions/` is routing only — validate, delegate to `src/`, respond. No business logic here.
- `src/presentation/` never talks to the database directly — only through `src/application/`.
- `src/application/` is the only writer to Supabase. Every other layer reads through it or via
  events.
- `src/ai/` never writes business state — advice objects only, stored via `src/application/`.
- `src/automation/` acts only through `src/application/`'s logic — no direct DB writes.
- `src/integration/` is the only place external HTTP calls happen. One file per adapter.
- A module's owned tables are written only by that module's logic — never reached into from
  another module.

## Rules

- **No comments explaining WHAT** — names should already say that. Comment only the non-obvious
  WHY (a workaround, a constraint, a subtle invariant).
- **No premature abstraction** — a pattern is extracted to `src/shared/` only after it's needed a
  third time, not anticipated.
- **No new dependency** unless it replaces meaningfully more custom code than it costs in
  maintenance surface, and never for something Cloudflare/Supabase already provides.
- **Every external call has an explicit timeout and failure path.** A failure is logged (see
  `error-handling-strategy.md`) before being surfaced or swallowed — never silently absorbed.
- **Soft-delete only.** No table's rows are ever hard-deleted from application code — status flags
  and archiving, per the Database Engineering Constitution. Exception: genuinely transient
  technical rows (expired session tokens), never business data.
- **Every new setting** goes into the `settings` table at the correct scope — no ad-hoc config
  reads scattered through logic.
- **Every automated job** is idempotent, writes a run-ledger entry, and is safe to re-run.

## AI-authored code

Claude is the primary builder. Every non-trivial change states which architecture document it
implements. Scope creep is flagged, not silently absorbed. See `contribution-standards.md` for the
full authority tiers.

## Definition of Done (task level)

Functional completion · architecture compliance · documentation updated · tested per the relevant
wave's testing table · security verified (RLS/auth where applicable) · no open Critical findings ·
Governance Gate passed for anything touching a business rule.
