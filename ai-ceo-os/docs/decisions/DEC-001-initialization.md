---
id: DEC-001-initialization
type: decision
title: Project initialization — folder skeleton, Supabase project, deployment topology
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: []
resolved: 2026-07-11 (Prompt 1, Step 6) — both open items confirmed by founder, no changes to the original recommendations
summary: First implementation-phase decisions — where the project lives, which Supabase project is authoritative, and the open topology question.
---

## Decision

1. The AI CEO OS lives at `D:\website\ai-ceo-os\`, isolated from the existing ZTU codebase and untouched by `.warehouse-sync.json`.
2. The dedicated Supabase project `https://ikttrcfutkdycpajswua.supabase.co` is confirmed as the Internal Development database for this project (never the ZTU production schema).
3. Default technical assumption: no frontend framework, no build step — plain HTML/CSS/JS + Cloudflare Pages Functions, matching the existing ZTU admin panel's pattern and the "boring technology" principle (Technical Architecture §0).

## Context

Prompt 1 Step 1 began the implementation phase after Prompt 0's full planning stack (Foundation through the Execution Playbook) was completed with zero code written. A real Supabase project URL was provided, resolving part of the Wave-0 gating requirement.

## Alternatives considered

- Bundling admin routes into the existing public ZTU Cloudflare Pages project — rejected in favor of a separate project (still pending final sign-off, see Open Items) because it weakens "private by structure" (Technical Architecture §9.6): one routing bug in a shared deploy target becomes a public incident, not a private one.
- Adopting a JS framework (React/Vue) now — deferred; nothing in the architecture mandated one, and introducing one would violate the dependency-minimization rule (Development Constitution §9) without a demonstrated need.

## Evidence

First-party (T4): the Supabase URL supplied directly by the founder. Existing ZTU repository structure (`admin/*.html`, `admin/js/`, `admin/css/`) observed directly as precedent for the framework-free default.

## Reasoning

Isolation and reversibility were prioritized — everything above is either free to change (framework choice) or already the documented safest option (separate deploy target) — so no other candidate was scored beyond a plain comparison against these two alternatives.

## Expected impact

Unblocks folder-level implementation work in Prompt 1 Step 2+. No KPI moves yet — this is infrastructure, not a business action.

## Risks

If the founder wants a frontend framework or a bundled deployment topology instead, both are cheap to reverse right now and expensive later — hence flagged explicitly rather than assumed silently.

## Review date

At the next Structural change to this decision, or at OS Phase 0 build start, whichever comes first — see Open Items below.

## Open items — RESOLVED 2026-07-11 (Prompt 1, Step 6)

- [x] ~~Deployment topology: separate Cloudflare Pages project~~ — **SUPERSEDED, see
  `DEC-002-cloudflare-shared-project.md`.** Confirmed at Step 6, then reversed after a rigorous
  technical re-validation surfaced real platform constraints (Functions-root collision, shared
  env-var pool) that the founder weighed and decided to accept via a shared-project topology with
  explicit mitigations. DEC-002 is the current authority on this point — this entry is kept for
  the audit trail, not as active guidance.
- [x] Framework assumption: **plain HTML/CSS/JS, no build step** — confirmed by founder, unchanged
  and still current.

The framework confirmation still holds. The topology confirmation was overtaken by DEC-002 — read
that document for the current, correct Cloudflare architecture.
