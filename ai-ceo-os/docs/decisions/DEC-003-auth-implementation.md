---
id: DEC-003-auth-implementation
type: decision
title: Auth implementation split — Supabase SDK client-side, raw fetch server-side
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: [DEC-001-initialization, DEC-002-cloudflare-shared-project]
summary: Client-side auth uses the official Supabase JS SDK via ESM CDN import. Server-side Cloudflare Functions use raw fetch() to Supabase's HTTP API instead. Both are no-build-step compatible.
---

## Decision

1. **Client-side (browser) code** uses the official `@supabase/supabase-js` SDK, loaded via a
   native ES module import from a CDN (`https://esm.sh/@supabase/supabase-js@2`) — no npm
   install, no build step, the browser fetches it directly like any other module.
2. **Server-side Cloudflare Functions** (`functions/api/ceo/`, `functions/utils/ceo/`) do **not**
   import the SDK. They make raw `fetch()` calls directly to Supabase's REST (PostgREST) and Auth
   HTTP APIs.
3. Login, logout, and password reset are handled **entirely client-side** via the SDK
   (`signInWithPassword`, `signOut`, `resetPasswordForEmail`) — no server-side proxy Function
   exists for any of these. Supabase's own `signOut()` already invalidates the session
   server-side as part of the SDK call.
4. The browser never hardcodes `CEO_SUPABASE_URL` / `CEO_SUPABASE_ANON_KEY` into a committed
   file — it fetches them once from `GET /api/ceo/config`, a public Function that reads the
   Cloudflare environment variables server-side and returns them as JSON.

## Context

Wave 3 is the first real authentication code in the project. The no-framework, no-build-step
decision (`DEC-001`) meant the standard `npm install @supabase/supabase-js` + bundler pattern
wasn't available, and a decision was needed on how to reach Supabase from both the browser and
Cloudflare Functions without one.

## Alternatives considered

- Hand-rolling all auth HTTP calls (login, session refresh, token storage) from scratch in the
  browser — rejected. Session/token/refresh logic is exactly the class of security-sensitive code
  where a well-tested library should own the complexity, not custom code (Development
  Constitution §9 Decision Rule 3 — a dependency is justified when it replaces meaningfully more
  custom code than it costs in maintenance surface).
- Importing the SDK via bare specifier (`import { createClient } from '@supabase/supabase-js'`)
  in Cloudflare Functions — rejected. This requires Cloudflare's build system to resolve
  `node_modules`, which typically needs a `package.json` + npm install step, contradicting the
  no-build-step decision. Raw `fetch()` avoids any dependency resolution at all and is simple
  enough server-side (a handful of well-documented HTTP calls) that hand-writing it doesn't
  reinvent something complex.
- A server-side login proxy Function — rejected as unnecessary. Supabase Auth is designed for the
  browser to talk to it directly using the anon key; RLS and the allowlist check are the actual
  security boundary, not a proxy layer.

## Evidence

Supabase's own documentation confirms the anon key is designed for direct browser use (T3).
`esm.sh` is a standard, widely-used ESM CDN for exactly this pattern (T5). Cloudflare Pages
Functions support relative imports between files in `functions/` without a build step (T3,
platform documentation) — used for `functions/api/ceo/auth/session.js` importing
`functions/utils/ceo/verify-session.js`.

## Reasoning

Splitting the implementation by trust boundary — full SDK where the browser already trusts the
anon key and benefits from the SDK's session management, raw HTTP where server-side code needs
the service-role key for exactly one narrow allowlist check — keeps both sides as simple as they
can be without introducing a build step anywhere.

## Expected impact

Unblocks Wave 3's login/session/reset-password implementation. Sets the pattern every future
Function reuses: import `verifySession()` from `functions/utils/ceo/verify-session.js`, never
duplicate the check.

## Risks

The ESM CDN (`esm.sh`) is a third-party dependency for delivering the client library — if it's
ever unreachable, login breaks. Low risk in practice (it's a mature, widely-relied-upon service),
and mitigated by the fact that Cloudflare's own edge caching will serve a cached copy after first
load in most cases. Revisit only if this becomes an observed problem, per Technical Decision
Rule 6 (no optimization without a measured need).

## Review date

At the next Structural change to the authentication architecture, or if `esm.sh` reliability
becomes a measured problem.
