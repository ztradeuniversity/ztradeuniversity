---
id: database-blueprint
type: architecture
title: Master Database Architecture & Supabase Implementation Blueprint
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: [DEC-001-initialization]
summary: Full ~33-table schema design against the real Supabase project (ikttrcfutkdycpajswua.supabase.co) — architecture only, no SQL yet.
---

# Master Database Architecture & Supabase Implementation Blueprint

Full content delivered in chat during Prompt 1, Step 2 (2026-07-11). This file is the permanent
on-disk reference pointer. Key facts:

- Supabase project: `https://ikttrcfutkdycpajswua.supabase.co` (Internal Development)
- ~33 tables across 6 migration waves (see roadmap below)
- 12 Postgres enum types used in place of lookup tables for stable classification values
- Feature flags live inside `settings`, not a separate table
- Storage: 3 buckets by sensitivity class (`content-assets`, `documents`, `backups`), provisioned
  only at Wave 3b (lazy-provisioning rule)
- Edge Functions: not used — Cloudflare Pages Functions serve that role exclusively
- Realtime: not used at launch
- RLS: enabled on every table in its creating migration, zero exceptions, zero broad-allow policies

## Migration wave order

1. **Core Spine** — `001_users.sql` .. `005_audit_log.sql` — users, roles, user_roles,
   admin_allowlist, settings, audit_log — **applied** (Prompt 2, Step 3)
2. **Accountability Spine (2a)** — `006`..`013` — kpi_definitions, kpi_history, goals (+
   `cadence_type` enum), daily_activities, reviews (one table, reuses `cadence_type`),
   trading_rules, trading_records, rule_violations — **written, not yet applied** (Prompt 4,
   Step 1). Every table carries `owner_user_id` except `kpi_definitions` (business-wide catalog,
   admin-managed like `roles`). See `../../supabase/WAVE-2A-CHECKLIST.md`.
3. **Relationship & Memory (2b)** — `014`..`020` — ib_clients (+ `client_lifecycle_stage` enum,
   matches the Wave 4 UI kanban exactly), lead_pipeline, client_touches, decision_log,
   research_library (+ `verdict_type` enum), knowledge_base, risk_register — **written, not yet
   applied** (Prompt 4, Step 2). All seven carry `owner_user_id`. See
   `../../supabase/WAVE-2B-CHECKLIST.md`.
4. **Mentor Memory (2c)** — `021` — coaching_memory (service-role-only, zero RLS policies) —
   **written, not yet applied**
5. **Automation (3a)** — `022`..`024` — automation_registry (+ `automation_matrix_class` enum,
   matches the Wave 4 UI's Matrix-3 labels exactly), automation_run_ledger, approval_queue —
   **written, not yet applied**
6. **Growth (3b)** — `025`..`027` — content_library (+ `content_status` enum, matches the Wave 4
   UI kanban), growth_tasks, marketing_campaigns — **written, not yet applied**
7. **Cross-cutting** — `028`..`029` — notifications (+ `notification_class` enum, matches the
   Settings UI's 5-class text), prompt_archive — **written, not yet applied**
8. **Future stub (gated)** — `030` — external_id_map (empty until D1 broker-API research
   activates it) — **written, not yet applied**

All migrations `001`-`030` from this blueprint are now written to `supabase/migrations/`. See
`../../supabase/WAVE-2C-3-CHECKLIST.md` for 021-030's execution/verification procedure.

## Open items blocking SQL execution

Both resolved: framework per `DEC-001-initialization.md` (plain HTML/CSS/JS), deployment topology
per `DEC-002-cloudflare-shared-project.md` (shared ZTU Cloudflare Pages project — **this document's
database design is completely unaffected**, since Supabase remains fully separate either way).

Full table-by-table specification (purpose, relationships, indexes, RLS strategy, retention,
owner module, KPIs) is in the Step-2 chat transcript — to be expanded into this file in full once
Wave-1 SQL is authorized (Prompt 1, Step 3+).
