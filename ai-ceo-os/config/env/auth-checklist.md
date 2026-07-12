---
id: auth-checklist
type: checklist
title: Authentication Preparation Checklist
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Founder actions needed before Wave 2 builds real authentication. See docs/architecture/authentication-foundation.md for the flow this prepares.
---

# Authentication Preparation Checklist

This checklist prepares for Wave 2's auth build — it does not implement anything itself.

## Prerequisites (from other checklists)

- [ ] `supabase-checklist.md`'s Authentication settings section complete
- [ ] `cloudflare-checklist.md`'s `CEO_SITE_ADMIN_EMAIL` variable set
- [ ] Confirmed: this login is completely separate from the existing ZTU admin login
      (`functions/utils/admin-session.js`) — different route, different session cookie, different
      logic, per `docs/decisions/DEC-002-cloudflare-shared-project.md`

## Founder decisions needed before Wave 2

- [ ] Confirm the email address that will be the founder's login (this becomes both the Supabase
      Auth account and the `admin_allowlist` entry — they must match exactly)
- [ ] Decide whether to enable MFA now or later (recommendation: later — see
      `authentication-foundation.md`'s reasoning; zero cost to defer)

## What Wave 2 will need from you, listed now so there's no surprise later

- Your chosen admin email (see above)
- A password you set directly in Supabase Auth (never generated or seen by the AI)
- One manual action: inserting your email into `admin_allowlist` after the migration creating that
  table applies — this row is never created automatically, by design

## Verification (performed at Wave 2's exit, listed here for visibility now)

See `docs/architecture/authentication-foundation.md`'s "Authentication verification checklist" —
the same seven checks, referenced here so this file doesn't duplicate them.
