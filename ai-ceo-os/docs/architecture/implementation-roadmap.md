---
id: implementation-roadmap
type: architecture
title: Master Implementation Execution Plan
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: [DEC-001-initialization, database-blueprint, dashboard-blueprint, intelligence-blueprint, integration-blueprint, production-readiness-blueprint]
summary: The mandatory execution guide for every coding prompt going forward — 8 waves mapped onto the locked 3C/4C build order. Last pure-planning document; real code starts next.
---

# Master Implementation Execution Plan

Full content delivered in chat during Prompt 2, Step 1 (2026-07-11). Permanent on-disk pointer.

## The central reconciliation

The prompt's "Wave 2 = Database Implementation" does **not** mean building all ~33 tables in one
block. That would violate the Supabase Implementation Blueprint's rule that schema construction
never leads or lags the feature work consuming it — and this prompt's own stated philosophy
("no unfinished dependencies," "build only one layer at a time"). **Wave 2 = Core Spine only**
(6 tables: users, roles, user_roles, admin_allowlist, settings, audit_log). The remaining ~27
tables build incrementally across Waves 4, 5, 6, and 7, exactly where the Supabase blueprint
already staged them (S4a/S4b/S5/S6/S7).

## 8-Wave → 3C-Phase map

| Wave | Maps to | Content |
|---|---|---|
| W1 Foundation | P0+P1 (infra) | repo, Supabase init, auth foundation, Cloudflare config |
| W2 Core Spine DB | P1 (DB slice) | 6 core tables, `001`-`005` |
| W3 Core Dashboard | P1 (UI slice) | shell, nav, auth UI, components |
| W4 Core Founder Modules | P2+P3 combined | M2, M3 (manual), M7-core, M1 KPI Center — `006`-`020` |
| W5 AI Intelligence | P4 | Decision/Priority/Pareto/Recommendation/Behavior/Learning engines — `021` |
| W6 Automation Layer | P5 (M6-first) | approval queue, notifications, email — `022`-`024`, `028` |
| W7 Growth + Integration | P5 (M4-slice) + Integration Blueprint | content pipeline, all read-only ZTU adapters — `025`-`027`, `029` |
| W8 Hardening + Go-Live | P6 (folds in) + P7 | production migration, full checklist |

One sequencing refinement (not a redesign): W6 (automation infra) now precedes W7 (growth
features) — safer than the original P5 bundling, since the approval-queue exists and is tested
before growth automation gets wired through it.

## New mechanism this step added

**Wave Transition Gate** — the wave-granular instance of the Execution Standard's six-condition
Phase Transition Rule: previous wave's DoD met, testing rows run, founder approval recorded,
documentation current, rollback verified. No wave skips a condition.

## Timeline honesty

No calendar dates are invented. Sequencing is fixed (this document); literal duration stays
anchored to the still-outstanding Domain-0 baseline session — the Execution Playbook's 18h/week
figure remains a placeholder until that session happens.

## Status

This is the last pure-planning document in the sequence. Every subsequent prompt is expected to
produce implementation-ready output, starting with Wave 1 (repository/Supabase/Cloudflare/auth
setup) and Wave 2 (the first real SQL migrations, `001`-`005`).

Full section-by-section detail (14 sections) is in the Step-1 chat transcript.
