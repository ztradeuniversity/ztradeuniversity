---
id: founder-checklist
type: checklist
title: Founder Checklist
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: The master list of everything only the founder can do, across all open items in this project. One place to look.
---

# Founder Checklist

Everything in this project that requires the founder personally — consolidated from every
checklist scattered across `docs/` and `config/`, so there's one place to check.

## Outstanding from Prompt 0 (Wave-0 gate, unrelated to infra setup)

- [ ] Verify Exness partner-portal terms, current tier, and API access personally (Step 8 Wave 0)
- [ ] Domain-0 baseline capture session — current commission, client counts, declared daily time
      budget (unblocks every KPI threshold in the system)

## Wave 1 infrastructure setup

- [ ] Supabase: complete `config/env/supabase-checklist.md`
- [ ] Cloudflare: complete `config/env/cloudflare-checklist.md` — **note: this now configures the
      existing shared ZTU Pages project, not a new one** (see `docs/decisions/DEC-002-cloudflare-shared-project.md`)
- [ ] Auth: complete `config/env/auth-checklist.md`'s pre-Wave-2 decisions

## Wave 2 — Core Database Foundation

**Confirmed complete by you** — all 5 migrations executed successfully, RLS verified. No further
action here.

## Wave 2a — Accountability Spine (written, not yet applied)

- [ ] Run migrations `006`-`013` in the Supabase SQL Editor, in order — see
      `supabase/WAVE-2A-CHECKLIST.md` for the exact procedure
- [ ] Run every query in `supabase/verification-queries-wave-2a.sql`; confirm the full RLS
      coverage check shows all 8 tables `rowsecurity = true` and zero DELETE policies exist
- [ ] No new allowlist/role/account steps — this wave adds no new identities
- [ ] When ready to expose real data in the UI shells already built: flip `m1.kpi-center`,
      `m2.trading-discipline`, `m7.daily-loop`, `m7.full-cadence` to `true` in `public.settings`
      (all already seeded `false` in Wave 2, no new flags needed)

## Wave 2b — Relationship & Memory (written, not yet applied)

- [ ] Run migrations `014`-`020` in the Supabase SQL Editor, in order — see
      `supabase/WAVE-2B-CHECKLIST.md` for the exact procedure
- [ ] Run Section A of `supabase/verification-queries-wave-2b.sql` in the SQL Editor; run Section B
      only via the app or an authenticated Supabase client, **never** the SQL Editor (it runs as
      `postgres` and bypasses RLS)
- [ ] No new allowlist/role/account steps
- [ ] When ready: flip `m3.ib-client-engine` and `m5.intelligence-center` to `true` in
      `public.settings`

## Migrations 021-030 — Mentor Memory, Automation, Growth, Cross-cutting, Future stub

- [ ] Run migrations `021`-`030` in order — see `supabase/WAVE-2C-3-CHECKLIST.md`
- [ ] Run Section A of `supabase/verification-queries-wave-2c-3.sql` in the SQL Editor; Section B
      only via the app or an authenticated client, never the SQL Editor
- [ ] Confirm `coaching_memory` is unreachable even for your own founder session (by design)
- [ ] This closes the full `001`-`030` schema batch — no further migrations are scheduled

## Migration 031 — corrective (Database Production Readiness audit)

- [ ] Run `031_settings_remove_delete_policy.sql` in the Supabase SQL Editor — drops
      `settings_admin_delete`, a Wave 1 leftover that violated the no-hard-deletes rule enforced
      everywhere from Wave 2a onward. Safe: nothing in this project deletes a setting row by design.
- [ ] Verify: `select policyname from pg_policies where tablename = 'settings' and cmd = 'DELETE';`
      returns zero rows.

## Wave 3 — Founder Authentication, Dashboard Shell & Core UI Foundation (built, awaiting deploy)

- [ ] Deploy the shared Cloudflare Pages project with the four `CEO_`-prefixed environment
      variables set (per `config/env/cloudflare-checklist.md`) — Wave 3's real HTML/CSS/JS exists
      on disk but has not been deployed or tested against live Supabase yet
- [ ] After deploy: visit `/ai-ceo-os/src/presentation/auth/login.html`, sign in with your admin
      account (created in Wave 2), confirm you land on Home without a 401/403
- [ ] Confirm logout actually ends the session (sign back in should require credentials again)
- [ ] Test the "forgot password" flow once, end to end, from the real deployed site
- [ ] Spot-check that an existing ZTU page/function is completely unaffected by this deploy

## Implementation Batches 1-6 (seeds + wiring) — built, awaiting your actions

- [ ] Review + run the three seed files in the Supabase SQL Editor, in order:
      `supabase/seed/seed-01-foundation.sql` (confirm the 11 KPI category names + your email at
      the top of each file), `seed-02-operations.sql`, `seed-03-retention-mentor.sql` — each file
      ends with its verification queries
- [ ] After the production deploy: log in → Home should show Today's Mission generated from the
      seeds (day type, Top 3, core block, mentor line)
- [ ] Walk one full loop once: complete a task → see the coaching toast → log a journal entry in
      Trading → add one real client in Clients → complete shutdown with a one-line note
- [ ] No new environment variables and no new Supabase config are needed — the wiring reuses the
      four existing `CEO_` vars

## Every wave, standing rule

- [ ] Nothing deploys to Production without your explicit approval — recorded in the Decision Log
- [ ] Every wave's Founder Acceptance Testing means genuine daily use, not a demo click-through

## Where to look for more

`docs/architecture/production-readiness-blueprint.md` §6 has the full Go-Live checklist (relevant
starting Wave 8, not yet). This document is the running list until then.
