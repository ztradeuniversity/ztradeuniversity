---
id: wave-2a-checklist
type: checklist
title: Wave 2a — Accountability Spine Execution Checklist
version: 1.0
status: accepted
created: 2026-07-11
summary: Everything needed to apply migrations 006-013 to the real Supabase project, who does each step, and how to verify and roll back.
---

# Wave 2a Execution Checklist

**Status (2026-07-11): NOT applied.** Verification confirmed none of the 8 tables exist in the
real database yet — the SQL below was written to `supabase/migrations/` but has never been
executed. Migrations 006-013 are ready to run; running them is the founder's next action (§3).

## 1. Claude-generated files (already written, ready to run)

| File | Creates |
|---|---|
| `supabase/migrations/006_kpi_definitions.sql` | `public.kpi_definitions` — the KPI catalog (M1), admin-managed, no owner scoping |
| `supabase/migrations/007_kpi_history.sql` | `public.kpi_history` — per-founder KPI time series, owner-scoped RLS |
| `supabase/migrations/008_goals.sql` | `public.cadence_type` enum + `public.goals` (M7) |
| `supabase/migrations/009_daily_activities.sql` | `public.daily_activities` — the Daily Loop checklist (M7) |
| `supabase/migrations/010_reviews.sql` | `public.reviews` — one table, all cadences (M7), reuses `cadence_type` |
| `supabase/migrations/011_trading_rules.sql` | `public.trading_rules` (M2), owner-scoped |
| `supabase/migrations/012_trading_records.sql` | `public.trading_records` — the OS's own trading journal (M2), system-of-record per the Integration Blueprint |
| `supabase/migrations/013_rule_violations.sql` | `public.rule_violations` — links `trading_records` to `trading_rules` |
| `supabase/verification-queries-wave-2a.sql` | copy/paste verification + RLS cross-user test queries for this wave |

**Storage:** zero buckets — still not required until Wave 7 (unchanged from Wave 2).

## 2. Migration execution order (strict — never out of order)

`006` → `007` → `008` → `009` → `010` → `011` → `012` → `013`.

Dependency notes: `007` depends on `006` (`kpi_id` FK). `008` depends on `006` (`kpi_id` FK, optional) and defines `cadence_type`, which `010` depends on. `013` depends on `011` and `012`. All eight depend on `002_roles.sql` (`is_admin()`) and `001_users.sql` (`public.users`), already live from Wave 2.

## 3. Manual SQL run order

Run each file's contents in the Supabase SQL Editor, in order, one at a time — same procedure as Wave 2. Confirm no errors after each before moving to the next. None of these insert seed data (no `INSERT` statements to watch for — unlike Wave 2's `004_settings.sql`).

## 4. Founder actions (Human-only)

- [ ] Run all 8 migrations in order via the Supabase SQL Editor.
- [ ] No allowlist/role/account steps needed — this wave adds no new identities, only business-data tables scoped to the existing founder account from Wave 2.
- [ ] Once migrations 006-013 are applied, flip the relevant feature flags to `true` in `public.settings` when ready to expose each module's UI to real data (`m1.kpi-center`, `m2.trading-discipline`, `m7.daily-loop`, `m7.full-cadence` — all already seeded `false` in Wave 2, no new flags required this wave).

## 5. Cloudflare actions

None. This wave is schema-only — no new Functions, no new env vars.

## 6. Supabase actions (dashboard configuration, not SQL)

None beyond what Wave 2 already required. No new storage, no new auth configuration.

## 7. Verification checklist

**Important — read before running anything:** the Supabase SQL Editor executes as the `postgres`
role, which bypasses Row Level Security entirely. That means SQL Editor queries can confirm a
policy *exists*, but can never prove it actually *denies* anyone — every row comes back regardless
of policy. This is exactly what caused the original verification file's INSERT test to fail with a
foreign-key error (23503) instead of an RLS denial: it was run in the SQL Editor against a
synthetic UUID that didn't exist in `public.users`, so the FK check fired before RLS ever got a
chance to run. `verification-queries-wave-2a.sql` is now split into two sections for this reason —
**do not run Section B in the SQL Editor.**

### Section A — SQL Editor Verification (safe to paste into the Supabase SQL Editor)
- [ ] All 8 tables exist
- [ ] `cadence_type` enum exists
- [ ] Full RLS coverage check: all 8 tables show `rowsecurity = true`
- [ ] Foreign keys resolve to the expected parent tables
- [ ] Policy inventory (A4) shows the expected `using`/`with check` expressions
      (`owner_user_id = auth.uid() or public.is_admin()` for owner-scoped tables;
      `public.is_admin()` for `kpi_definitions`)
- [ ] Zero DELETE policies exist across all 8 tables (no-hard-deletes rule)

### Section B — Authenticated Application / RLS Tests (never in the SQL Editor)
Run only via the deployed app once logged in, or a Supabase client using the **anon key** signed
in as a real user — never as `postgres`.
- [ ] Self-access smoke test: founder's own session can read their own `goals`/`trading_records`/`reviews`
- [ ] Cross-user denial test: a **second real Supabase Auth user** (not a synthetic UUID) cannot
      read the founder's rows, and cannot insert a row claiming the founder's `owner_user_id`
- [ ] Non-admin cannot write `kpi_definitions`
- [ ] If no second test account exists yet, this section is deferred — but must be completed with
      a real second account before Production go-live (see `production-readiness-blueprint.md`)

## 8. Rollback order (reverse of application order)

Per the Database Engineering Constitution §8: rollback is a new corrective migration, never a rewrite of these eight files once any has touched the real project.

1. Drop policies + table from `013` (`rule_violations`) — nothing depends on it
2. Drop policies + table from `012` (`trading_records`)
3. Drop policies + table from `011` (`trading_rules`)
4. Drop policies + table from `010` (`reviews`)
5. Drop policies + table from `009` (`daily_activities`)
6. Drop the `cadence_type` enum + policies + table from `008` (`goals`) — only after confirming `010` is already dropped, since `reviews` depends on this enum
7. Drop policies + table from `007` (`kpi_history`)
8. Drop policies + table from `006` (`kpi_definitions`) — only after confirming `007` and `008` are already dropped, since both hold FKs to it

No corrective migration files are pre-written — per the Constitution, they're written only if this is actually needed, against the real state.

## Definition of Done for this checklist

Every box above checked, `verification-queries-wave-2a.sql`'s full RLS coverage check passes, and at least one manual read/write through the founder's own session confirms owner-scoped access works as designed. Only then does Wave 2a count as done — the Wave-4 UI shells (already built) depend on this being genuinely complete before they can be wired to real data.
