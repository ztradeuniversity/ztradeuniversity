---
id: DEC-002-cloudflare-shared-project
type: decision
title: Cloudflare topology correction — shared Pages project, not a separate one
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: [DEC-001-initialization]
summary: Supersedes DEC-001's "separate Cloudflare Pages project" resolution. The OS deploys inside the existing ZTU Pages project as an isolated private admin area. Supabase separation is unaffected.
---

## Decision

1. The AI CEO OS does **not** get its own Cloudflare Pages project. It deploys inside the existing
   Z Trade University Pages project as a private admin area at the `/ai-ceo-os/*` path.
2. The Supabase project (`https://ikttrcfutkdycpajswua.supabase.co`) remains fully separate —
   unchanged. Its own database, its own auth, its own migrations, its own storage, its own
   environment variables. Nothing about Supabase isolation is affected by this decision.
3. Every OS-specific Cloudflare Function lives under the shared repository's single
   `functions/api/ceo/` directory (Cloudflare Pages recognizes exactly one `functions/` root per
   project — this is a platform constraint, not a preference). Shared OS-only utilities, if
   needed, live under `functions/utils/ceo/` — existing ZTU utility files are never modified.
4. Every OS environment variable is renamed with a `CEO_` prefix to avoid colliding with existing
   ZTU variables in the same project-wide variable pool.
5. Authentication stays structurally separate despite sharing infrastructure: a distinct login
   route, a distinct session cookie name, and authentication logic that never touches or shares
   state with the existing `functions/utils/admin-session.js` / `admin-store.js` system.
6. `_headers` and `_redirects` are not duplicated — OS-specific rules (routes marked `noindex`,
   any OS-specific security headers) are appended to the existing root files as scoped additions.
7. Deployment pipeline is unchanged from ZTU's existing one: Desktop Workspace → GitHub → the
   existing Cloudflare Pages project. No second pipeline is created.

## Context

`DEC-001-initialization.md` recorded "separate Cloudflare Pages project" as the founder-confirmed
answer at the Prompt 1 Step 6 checkpoint. The founder subsequently asked for a rigorous technical
re-validation of that recommendation against the actual ZTU repository and the Cloudflare Pages
platform's real constraints, then explicitly directed this correction after reviewing the
tradeoffs.

## Alternatives considered

- Separate Cloudflare Pages project (the original DEC-001 answer) — provides platform-enforced
  environment-variable isolation (no shared secret pool) and independent build/deploy blast
  radius. Rejected as unnecessary complexity for this project's actual risk profile; the founder
  prioritized operational simplicity (one pipeline, one project to manage) over that marginal
  isolation gain.
- A standalone Cloudflare Worker bound to a specific route (rather than Pages Functions in either
  project) — would have preserved secret isolation without a second Pages project. Not adopted;
  out of scope for this correction, which the founder scoped explicitly to "only these
  adjustments."

## Evidence

Direct inspection of the live ZTU repository (T4): `functions/api/` already contains 17+ files
including `admin-auth.js`; `functions/utils/` already contains `admin-session.js` and
`admin-store.js` (an existing, separate admin authentication system) and `ai-supabase.js` (ZTU's
own Supabase client). `_headers` and `_redirects` already exist at the repository root with
established rules. These confirmed both the Functions-root collision (Finding A) and the
env-var-pool sharing mechanism (Finding B) as real, not hypothetical.

## Reasoning

The residual risk of a shared environment-variable pool (a compromised or buggy ZTU public
function theoretically gaining access to the OS's Supabase service-role key) is real but
low-probability — it requires an actual code-level vulnerability in the higher-traffic public
codebase to matter, not just the fact of co-location. Weighed against genuine, ongoing operational
simplicity for a solo founder (one deploy pipeline, one project to manage, zero extra Cloudflare
project to provision and maintain), the founder judged the tradeoff acceptable, with the naming
and structural mitigations in this decision's items 3-6 in place.

## Expected impact

No KPI impact — this is infrastructure. Unblocks Wave 1's Cloudflare configuration work using the
corrected structure.

## Risks

Shared environment-variable pool means a security incident in ZTU's public codebase has a larger
blast radius than it would with full project separation (see Reasoning). Mitigated by: CEO_
prefix preventing accidental variable collision, functions/api/ceo/ and functions/utils/ceo/
keeping OS code namespaced and easy to audit separately, and the existing security review cadence
(quarterly, per the Infrastructure & Operations Blueprint) now explicitly covering this shared
surface.

Shared deploy pipeline means a build failure in either codebase can block the other's deploy.
Accepted as a low-cost risk given neither codebase uses a build step.

## Review date

At the next Structural change to this decision, or if the risk profile changes materially (e.g.,
ZTU's public-facing attack surface grows significantly, or the OS begins handling data sensitive
enough to warrant revisiting this tradeoff) — whichever comes first.
