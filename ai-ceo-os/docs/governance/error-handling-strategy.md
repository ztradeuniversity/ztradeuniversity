---
id: error-handling-strategy
type: governance
title: Error Handling Strategy
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Error categories, logging rules, recovery rules, and diagnostics for this project — fail loud, degrade soft.
---

# Error Handling Strategy

**Governing principle (from the Technical Architecture): fail loud, degrade soft.** Integrations
and background jobs can fail without taking the system down; silence is itself treated as a
failure (the expected-run monitor watches for jobs that *should* have run and didn't).

## Error categories

| Category | Examples | Handling |
|---|---|---|
| **Validation error** | bad input to a Function, a constraint violation attempt | rejected at the boundary, honest message returned, logged at Info level — this is normal operation, not a failure |
| **Authorization denial** | RLS blocks a query, an unauthenticated request | denied cleanly, logged to the Security log class, never treated as "no data" |
| **External adapter failure** | ZTU read-only pull fails, AI provider unreachable | the affected feature degrades (shows stale/cached data, labeled as such); the OS itself never blocks |
| **Automation job failure** | a scheduled job errors or doesn't run | logged to `automation_run_ledger`; 2 consecutive failures pause the job automatically |
| **Data integrity issue** | an unexpected constraint failure, an orphaned reference | Critical — investigated immediately, never silently worked around |
| **Unhandled exception** | anything not anticipated | logged with full context, surfaced as a generic honest error to the UI, never a stack trace shown to the founder |

## Logging rules (the seven log classes, per the Infrastructure & Operations Blueprint)

System · Security · AI · Automation · Business (the event log) · Audit (append-only, immutable,
permanent) · Error. Every log entry includes enough context to start the relevant runbook without
re-deriving state — a timestamp and a class alone are not enough.

## Recovery rules

- A validation error never needs recovery — it's expected behavior.
- An external adapter failure recovers automatically on the next scheduled pull; no founder action
  needed unless it's been failing for multiple cycles (escalates to Warning, then Critical).
- An automation failure pauses the specific job, not the system; recovery is a founder-reviewed
  fix-and-resume, documented per the incident severity it reached.
- A data integrity issue recovers via a corrective migration (never a history rewrite) or, if
  severe, a restore from backup.

## Debug strategy (development)

Errors are verbose and full-context in Internal Development; the same code path in Production
returns honest-but-generic messages to the UI while still logging full context server-side. No
separate "debug mode" branch in the code — the verbosity difference is environment configuration,
not a code fork.

## Founder diagnostics

Every error the founder-facing UI shows carries enough plain-language context to know *what to do
next* (retry, wait, or it's already logged and being watched) — never a raw error dumped with no
guidance. System Health (the utility cluster, per the Dashboard Blueprint) is where the founder
looks first when something feels wrong.

## Incident logging

Every incident, regardless of severity, produces a Knowledge Base entry: what warned us, what
worked, what changes. See `docs/architecture/production-readiness-blueprint.md` §8 for severity
classification (Critical/High/Medium/Low) and response times.
