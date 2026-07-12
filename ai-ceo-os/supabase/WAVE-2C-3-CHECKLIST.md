---
id: wave-2c-3-checklist
type: checklist
title: Migrations 021-030 Execution Checklist (Mentor Memory, Automation, Growth, Cross-cutting, Future Stub)
version: 1.0
status: accepted
created: 2026-07-11
summary: Everything needed to apply migrations 021-030 to the real Supabase project — closes the full Wave-2/3 schema batch (001-030).
---

# Migrations 021-030 Execution Checklist

**Status: NOT applied.** Written and ready; running SQL is always a founder action.

## 1. Files created

| File | Creates |
|---|---|
| `021_coaching_memory.sql` | `public.coaching_memory` — service-role-only, zero policies |
| `022_automation_registry.sql` | `automation_matrix_class` enum + `public.automation_registry` (admin catalog) |
| `023_automation_run_ledger.sql` | `public.automation_run_ledger` — append-only, admin-select-only |
| `024_approval_queue.sql` | `public.approval_queue` — the Automation Line enforcement point |
| `025_content_library.sql` | `content_status` enum + `public.content_library` — matches the Wave 4 UI kanban |
| `026_growth_tasks.sql` | `public.growth_tasks` |
| `027_marketing_campaigns.sql` | `public.marketing_campaigns` |
| `028_notifications.sql` | `notification_class` enum + `public.notifications` — matches the Settings UI's 5-class text exactly |
| `029_prompt_archive.sql` | `public.prompt_archive` — pointer index, no content duplication |
| `030_external_id_map.sql` | `public.external_id_map` — structurally complete, functionally inert until the D1 broker-API gate clears |
| `verification-queries-wave-2c-3.sql` | Section A (SQL Editor safe) + Section B (authenticated-app-only) |

## 2. Execution order (strict)

`021` → `022` → `023` → `024` → `025` → `026` → `027` → `028` → `029` → `030`.

Dependencies: `023` and `024` both depend on `022` (`automation_id` FK). All others depend only on
Wave 2's `001`/`002`. `030` has no dependency on `022`-`029` but keeps its numbered position per
the roadmap.

## 3. Founder actions

- [ ] Run `021`-`030` in order via the Supabase SQL Editor.
- [ ] Run Section A of `verification-queries-wave-2c-3.sql` there.
- [ ] Run Section B only via the app or an authenticated Supabase client — never the SQL Editor.
- [ ] Confirm `coaching_memory` returns nothing even for the founder's own authenticated session
      (§B2) — this is the one table that should stay unreachable through the normal app client.
- [ ] No new allowlist/role/account steps.
- [ ] Feature flags: no new flags added this step (out of scope) — existing `m6.automation-center`
      and `m4.growth-engine` (seeded `false` in Wave 2) gate this batch's UI when flipped.

## 4. Cloudflare / Supabase actions

None — schema-only batch, no new Functions, no new env vars, no new storage or auth config.

## 5. Verification checklist

### Section A
- [ ] All 10 tables exist
- [ ] `automation_matrix_class`, `content_status`, `notification_class` enums exist with the
      expected values (verified against the already-built Wave 4 UI, not re-derived)
- [ ] Full RLS coverage: all 10 tables `rowsecurity = true` (including `coaching_memory`)
- [ ] `coaching_memory` has zero policies of any kind
- [ ] `automation_run_ledger` and `notifications` have no authenticated INSERT policy
- [ ] Foreign keys resolve correctly
- [ ] Zero DELETE policies anywhere in the batch

### Section B (never in the SQL Editor)
- [ ] Self-access smoke test for owner-scoped tables
- [ ] `coaching_memory` unreachable even for the founder's own session
- [ ] Cross-user denial (may defer until a second test account exists; must close before Production)

## 6. Rollback order (reverse of application)

`030` → `029` → `028` (+ `notification_class` enum) → `027` → `026` → `025` (+ `content_status`
enum) → `024` → `023` → `022` (+ `automation_matrix_class` enum) → `021`. Per the Database
Engineering Constitution §8: a new corrective migration, never a rewrite of these files.

## Definition of Done

Section A fully checked, `coaching_memory`'s zero-policy status confirmed, self-access smoke test
passed. This closes the entire production schema batch (`001`-`030`) planned in the Database
Blueprint — everything from here is UI/logic wiring against already-migrated tables, not new schema,
until a genuinely new requirement is approved.
