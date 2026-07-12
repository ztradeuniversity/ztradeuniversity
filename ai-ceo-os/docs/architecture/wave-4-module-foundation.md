---
id: wave-4-module-foundation
type: architecture
title: Wave 4 Module Foundation
version: 1.0
status: accepted
created: 2026-07-11
depends_on: [wave-3-frontend-guide, database-blueprint, implementation-roadmap]
summary: Operational UI shells for all seven modules — no business logic, no live data calls, since the underlying tables aren't migrated yet.
---

# Wave 4 Module Foundation

## The scope reconciliation this wave required

Several requested workspaces (Client Directory, Research Library, Content Workspace, Automation
List, Reviews) would naturally read from database tables that don't exist yet. Per the
Implementation Roadmap, only the Wave 2 Core Spine (`users`, `roles`, `user_roles`,
`admin_allowlist`, `settings`, `audit_log`) is actually migrated. The tables these features need
(`trading_records`, `ib_clients`, `research_library`, `content_library`, `automation_registry`,
`reviews`, etc.) are staged for later migrations (`006`-`030`) that haven't run.

**Resolution:** every workspace built this wave is a real, structured UI shell with zero live data
calls — no new Cloudflare Functions, no new queries. Each demonstrates a genuine loading→empty
state transition (a brief simulated skeleton, then an honest empty state) via the new
`operational-section.js` helper — which is exactly the correct behavior for a freshly-migrated-
but-still-empty table. Nothing here needs rework once the real migrations land; the empty states
just start returning real rows.

## New reusable components

| File | Purpose |
|---|---|
| `shared/components/operational-section.js` | `initOperationalSection()` / `initAllOperationalSections()` — the skeleton-then-reveal pattern, avoiding 35 duplicated markup blocks across seven modules |
| `shared/styles/components.css` (extended) | Added kanban (`.ceo-kanban*`), timeline (`.ceo-timeline*`), checklist (`.ceo-checklist-item`), and generic list (`.ceo-list*`) primitives — same design tokens, no new palette |

## Module → tabs map

| Module | Tabs built |
|---|---|
| Command Center (extended) | KPI grid, Notifications, Activity Timeline, Quick Actions (added to Wave 3's existing north-star/core-loop/AI-recommendations/module-status/performance-score sections) |
| Trading Discipline | Journal, Trade Review, Psychology, Rules Checklist, Session Review |
| IB Client Engine | Client Directory, Client Profile, IB Overview, Approval Queue, Status Workflow (kanban, mirrors `client_lifecycle_stage` exactly) |
| Intelligence Center | Research, Knowledge Library, Prompt Archive, Decision Archive, Research History |
| Growth Engine | Content Workspace (kanban, mirrors `content_library.status`), Campaign Workspace, Social Publishing, Video Planning, Marketing Dashboard |
| Automation Center | Automation List, Job History, Queue Monitor, Execution Status, Scheduler |
| Reviews | Weekly, Monthly, Quarterly, Founder Notes, Action Tracker |

## Verification performed

The real pages (behind the auth guard) correctly redirect to the 500 error page in this
environment — same expected behavior as Wave 3, confirming no new console errors were introduced.
Because the guard blocks execution before any new tab/operational-section JS runs, the two new
interactive components were verified in isolation: a temporary test page (created inside the
project tree, deleted immediately after) confirmed `initTabs()` correctly toggles panel visibility
on click, and `initAllOperationalSections()` correctly reveals the real empty-state markup after
its simulated loading delay. Both passed every assertion.

## What's explicitly still not built

AI decision engines, analytics, automation logic, trading logic, CRM logic, SEO logic, report
generation — all per this wave's explicit scope. No SQL migrations were written this wave (the
prompt's own IMPLEMENT list named UI elements only). The next real increment is wiring these
shells to actual data once their migrations land, per the Implementation Roadmap's wave order.
