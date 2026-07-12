---
id: authentication-foundation
type: architecture
title: Authentication Foundation
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: [database-blueprint, production-readiness-blueprint]
summary: Preparation for Wave 2's real auth build — flow documentation, session strategy, roles, onboarding. No code here.
---

# Authentication Foundation

Documents the auth flow before Wave 2 implements it. This is preparation, not the build itself —
no authentication code exists yet.

## Login flow (as it will work)

1. Founder navigates to `<existing-ztu-domain>/ai-ceo-os/login` — a route that lives inside the
   shared ZTU Cloudflare Pages project (per `DEC-002-cloudflare-shared-project.md`) but is
   structurally and visually distinct from `/admin/` (the existing ZTU admin panel's own login).
2. Supabase Auth email+password form. No signup UI is ever exposed — the founder's account is
   created once, manually, as part of Wave 2 setup, and no self-registration path exists for
   anyone else.
3. On success, Supabase issues a session (JWT access token + refresh token), stored under a
   **distinctly named session cookie** — never the same name or storage key as the existing ZTU
   admin session (`functions/utils/admin-session.js`). Suggested name: `ceo_os_session` (fixed
   literally when Wave 2 writes the actual code).
4. Every subsequent request to a `functions/api/ceo/*` Function validates that session
   server-side — the client is never trusted with an authorization decision. This validation logic
   is entirely separate code from `functions/utils/admin-session.js` / `admin-store.js` — no
   shared functions, no shared imports, no shared state between the two auth systems.
5. The Function additionally checks the `admin_allowlist` table (in the OS's own Supabase
   project) — being authenticated is necessary, never sufficient. An authenticated user not on the
   allowlist is denied, logged as a Security event.
6. On success, the dashboard shell (Wave 3) loads at `/ai-ceo-os/`.

## Session strategy

Short-lived access tokens with refresh, per Supabase defaults, re-validated on every
`functions/api/ceo/*` call. Explicit logout kills the session server-side. Idle timeout per
Supabase's configurable setting (left at platform default at launch — revisited only on a measured
need). Sessions are revocable on demand from the founder's own session list (a Wave 8 refinement,
not required at Wave 2). **Never shares a cookie name, storage key, or validation function with
the existing ZTU admin session system** — the two are structurally separate despite living in the
same deployed project, per `DEC-002` item 5.

## Email verification

Mandatory before any session is considered valid — configured as a Supabase Dashboard setting
(see `config/env/auth-checklist.md`), not custom code. An unverified account cannot reach any
protected route.

## Password reset

Supabase's native reset flow. Tested end-to-end as part of Wave 2's exit criteria before anything
else is built on top of the auth foundation.

## Roles and permissions

`roles` and `user_roles` tables (Wave 2 migration `002`) support multiple roles from day one, even
though `admin` is the only role assigned to anyone today. Adding a future team-member role later is
a Standard change (a new row), never a schema change.

## Founder onboarding checklist (performed once, manually, at Wave 2)

- [ ] Sign up via Supabase Auth (or create the user directly in the Supabase dashboard)
- [ ] Verify the email
- [ ] Insert the founder's email into `admin_allowlist` (Human-only — never automated)
- [ ] Assign the `admin` role via `user_roles`
- [ ] Confirm login succeeds and reaches the dashboard shell (once Wave 3 exists)

## Authentication verification checklist (Wave 2 exit criteria)

- [ ] Unauthenticated request to any protected Function returns a clean denial
- [ ] Unverified account cannot log in
- [ ] Verified, allowlisted account logs in successfully
- [ ] Verified, non-allowlisted account is denied and the denial is logged
- [ ] Password reset flow completes end-to-end
- [ ] Logout actually invalidates the session server-side (not just client-side token discard)
- [ ] `audit_log` captures every login, logout, and denial event
