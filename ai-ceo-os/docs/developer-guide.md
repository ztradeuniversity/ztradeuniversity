---
id: developer-guide
type: governance
title: Developer Guide
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Orientation for anyone (founder or a fresh AI session) picking up this codebase cold.
---

# Developer Guide

## Start here

1. Read `README.md` for the one-page orientation.
2. Read `docs/architecture/README.md` for the index of every architecture document — the "why"
   behind everything in this repo lives there, not in code comments.
3. Read `docs/architecture/implementation-roadmap.md` for the current wave and what's next.
4. Check `docs/decisions/` for the latest `DEC-*.md` entries — recent decisions you need to know.

## Where things live

| Looking for... | Go to |
|---|---|
| Business rules for a module | `docs/architecture/database-blueprint.md` (entities) + the Business/Technical Architecture reference |
| A specific screen's design | `docs/architecture/dashboard-blueprint.md` |
| AI mentor behavior | `docs/architecture/intelligence-blueprint.md` |
| How this connects to the ZTU site | `docs/architecture/integration-blueprint.md` |
| Naming a new file/table/variable | `docs/governance/naming-standards.md` |
| "Can I do X without asking?" | `docs/governance/contribution-standards.md`'s four tiers |
| A past decision's reasoning | `docs/decisions/DEC-*.md` |
| What research justified a strategy call | `docs/research/` |
| Frontend folder structure, components, nav map | `docs/architecture/wave-3-frontend-guide.md` |
| How auth actually works client/server-side | `docs/decisions/DEC-003-auth-implementation.md` |

## Local setup

1. Copy `.env.example` to `.env.local`, fill with real values per
   `config/env/supabase-checklist.md` and `config/env/cloudflare-checklist.md`.
2. Never commit `.env.local` — `.gitignore` already excludes it.
3. This project has no build step — open and edit files directly. Two ways to preview:
   - **Static only** (fast, no Functions): any static file server rooted at the repo root
     (`D:\website\`), e.g. `python -m http.server`. Pages render correctly but anything calling
     `/api/ceo/*` will 404 and gracefully redirect to the 500 error page — useful for verifying
     layout/theme/content, not for testing real auth.
   - **Full stack** (Functions + real Supabase): `wrangler pages dev`, with real `CEO_`-prefixed
     values in a local `.dev.vars` file (never committed) — needed to test the actual login/
     session/allowlist flow end to end.

## Before writing any code

Check `docs/architecture/implementation-roadmap.md` — is the wave you're about to work in actually
unblocked? Are its dependencies (prior waves) done? A wave started out of order is exactly the risk
the roadmap exists to prevent.

## Testing

Every wave has a testing table in `docs/architecture/production-readiness-blueprint.md` §3. Run
the rows relevant to what you built before calling anything done.
