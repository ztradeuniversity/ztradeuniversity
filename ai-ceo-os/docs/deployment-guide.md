---
id: deployment-guide
type: governance
title: Deployment Guide
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: How code moves from local development to Production, step by step. No deployments have happened yet.
---

# Deployment Guide

## Environments

Per `docs/decisions/DEC-002-cloudflare-shared-project.md`: the Cloudflare Pages project is
**shared** with the existing ZTU site; only Supabase is separate.

| Environment | What it is | Credentials |
|---|---|---|
| Local / Internal Development | this machine + the founder's Supabase project (`ikttrcfutkdycpajswua.supabase.co`) + the **existing, shared** ZTU Cloudflare Pages project, at `/ai-ceo-os/*` | `.env.local`, `CEO_`-prefixed, never committed |
| Staging | Internal Development at its most-recently-validated state — not separate infrastructure | same as above |
| Production | a **separate Supabase project**, provisioned at Wave 8. Cloudflare stays the same shared project (Production and Preview environment variable sets, both `CEO_`-prefixed) | separate Supabase credentials; same Cloudflare project, different variable values |

## Deploy flow (once Wave 1 infra exists)

1. Code change made locally, reviewed against `coding-standards.md`.
2. Pushed to the repository's working branch — the same repository and branch ZTU's public site
   already deploys from. A push can carry ZTU changes, OS changes, or both.
3. Cloudflare Pages auto-deploys the shared project to its preview URL, `/ai-ceo-os/*` included.
4. Smoke test: login → Home screen → one action per live module.
5. If a schema change is involved: the full Database Engineering Constitution's nine-stage
   migration methodology runs first, against a scratch copy, then Internal Development.
6. Founder reviews the deployed preview.
7. **Explicit founder approval** — recorded in the Decision Log — before anything promotes toward
   Production. This never happens automatically, at any wave, for any reason.
8. Production promotion (Wave 8 only, until then there is no Production to promote to): merge to
   the production branch, following the same warehouse→publish pattern already proven for the
   ZTU site — this is now the literal same pipeline, not an analogous separate one.

**Shared-pipeline risk, accepted per `DEC-002`:** a build or Functions failure anywhere in the
project (ZTU code or OS code) can block the other's next deploy. There is no independent OS-only
deploy target to fall back on.

## Migration order

See `docs/architecture/database-blueprint.md` §3 and `implementation-roadmap.md` §4 — migrations
apply in strict numeric sequence, one logical change per file, never out of order, never skipped.

## Rollback

See `docs/architecture/production-readiness-blueprint.md` §5 — the Rollback Decision Framework.
Short version: Critical/security issues roll back immediately and always; UI-only bugs are fixed
forward, never rolled back; data issues get a corrective migration, never a history rewrite.

## Post-deployment validation

The smoke test (step 4 above) runs after **every** deploy, every wave, forever — cheap insurance
against the class of failure where a deploy "succeeds" but breaks something.

## Current status

No deployment has occurred. This guide describes the process Wave 1's Cloudflare project creation
(see `config/env/cloudflare-checklist.md`) will make real.
