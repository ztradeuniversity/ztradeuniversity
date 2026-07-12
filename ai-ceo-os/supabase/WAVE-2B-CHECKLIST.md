---
id: wave-2b-checklist
type: checklist
title: Wave 2b — Relationship & Memory Execution Checklist
version: 1.0
status: accepted
created: 2026-07-11
summary: Everything needed to apply migrations 014-020 to the real Supabase project, who does each step, and how to verify and roll back.
---

# Wave 2b Execution Checklist

**Status (2026-07-11): NOT applied.** Written and ready, per the same pattern as every prior wave —
running SQL against the real database is always a founder action, never something done automatically
during implementation.

## 1. Claude-generated files (already written, ready to run)

| File | Creates |
|---|---|
| `supabase/migrations/014_ib_clients.sql` | `public.client_lifecycle_stage` enum + `public.ib_clients` (M3) — matches the Wave 4 UI's kanban exactly |
| `supabase/migrations/015_lead_pipeline.sql` | `public.lead_pipeline` — stage-transition history for `ib_clients` |
| `supabase/migrations/016_client_touches.sql` | `public.client_touches` — interaction log |
| `supabase/migrations/017_decision_log.sql` | `public.decision_log` (M5) — Decision Engine output records |
| `supabase/migrations/018_research_library.sql` | `public.verdict_type` enum + `public.research_library` (M5) |
| `supabase/migrations/019_knowledge_base.sql` | `public.knowledge_base` (M5) — durable operational knowledge |
| `supabase/migrations/020_risk_register.sql` | `public.risk_register` (M5) — living risk register |
| `supabase/verification-queries-wave-2b.sql` | Section A (SQL Editor safe) + Section B (authenticated-app-only) verification |

**Storage:** zero buckets — still not required until Wave 7.

## 2. Migration execution order (strict — never out of order)

`014` → `015` → `016` → `017` → `018` → `019` → `020`.

Dependency notes: `015` and `016` both depend on `014` (`ib_client_id` FK, and `015` also reuses
`014`'s `client_lifecycle_stage` enum). `019` depends on `018` (`research_id` FK, nullable). `017`
and `020` depend only on Wave 2's `001`/`002` (`public.users`, `is_admin()`) — no dependency on
each other or on `014`-`016`, so they could technically run in any order relative to those, but the
numbered order above is the one to follow.

## 3. Manual SQL run order

Same procedure as Waves 2 and 2a: paste each file into the Supabase SQL Editor, in order, confirm
no errors before the next. No seed data in any of these seven files.

## 4. Founder actions (Human-only)

- [ ] Run all 7 migrations (`014`-`020`) in order via the Supabase SQL Editor.
- [ ] Run Section A of `verification-queries-wave-2b.sql` in the SQL Editor.
- [ ] Run Section B only via the app or an authenticated Supabase client — **never in the SQL
      Editor** (it runs as `postgres` and bypasses RLS, so it cannot prove a denial).
- [ ] No new allowlist/role/account steps — this wave adds no new identities.
- [ ] When ready to expose real data: flip `m3.ib-client-engine` and `m5.intelligence-center` to
      `true` in `public.settings` (already seeded `false` in Wave 2, no new flags needed).

## 5. Cloudflare actions

None. Schema-only wave.

## 6. Supabase actions

None beyond running the migrations.

## 7. Verification checklist

### Section A — SQL Editor Verification
- [ ] All 7 tables exist
- [ ] `client_lifecycle_stage` and `verdict_type` enums exist
- [ ] `client_lifecycle_stage` values exactly match the Wave 4 UI kanban: lead, qualified,
      onboarding, activated, engaged, at_risk, retained
- [ ] Full RLS coverage: all 7 tables show `rowsecurity = true`
- [ ] Foreign keys resolve to the expected parent tables
- [ ] Zero DELETE policies across all 7 tables

### Section B — Authenticated Application / RLS Tests (never in the SQL Editor)
- [ ] Self-access smoke test: founder's own session reads their own `ib_clients`/`decision_log`/`risk_register`
- [ ] Cross-user denial test (requires a second real test account — may be deferred, must close before Production)

## 8. Rollback order (reverse of application order)

Per the Database Engineering Constitution §8: rollback is a new corrective migration, never a
rewrite of these seven files once any has touched the real project.

1. Drop policies + table from `020` (`risk_register`)
2. Drop policies + table from `019` (`knowledge_base`) — depends on `018`'s FK
3. Drop the `verdict_type` enum + policies + table from `018` (`research_library`) — only after `019` is dropped
4. Drop policies + table from `017` (`decision_log`)
5. Drop policies + table from `016` (`client_touches`)
6. Drop policies + table from `015` (`lead_pipeline`)
7. Drop the `client_lifecycle_stage` enum + policies + table from `014` (`ib_clients`) — only after `015` and `016` are dropped, since both hold FKs to it

## Definition of Done for this checklist

Every box in Section A checked, plus Section B's self-access smoke test confirmed. Cross-user
denial may be deferred until a second test account exists, but must close before Production
go-live — same standing exception as Wave 2a.
