---
id: cloudflare-checklist
type: checklist
title: Cloudflare Foundation Checklist
version: 1.1
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Manual founder actions to prepare the shared Cloudflare Pages project for the AI CEO OS. No deployment happens from this checklist — only preparation.
---

# Cloudflare Foundation Checklist

Per `docs/decisions/DEC-002-cloudflare-shared-project.md`: the OS deploys inside the **existing**
Z Trade University Cloudflare Pages project, as a private admin area at `/ai-ceo-os/*`. No new
Pages project is created. (This supersedes the earlier `DEC-001` topology answer — see that
document's audit trail if you're wondering why this changed.)

## Project setup

- [ ] Confirm the existing ZTU Cloudflare Pages project is the deploy target — no new project
- [ ] Confirm the repository's Functions root is `D:\website\functions\` (the existing one) — the
      OS's Function files live at `functions/api/ceo/*.js`, never in a second `functions/` folder
- [ ] Confirm `ai-ceo-os/src/presentation/` static files are served automatically at
      `/ai-ceo-os/*` since that folder already sits inside the deployed project root — no
      relocation needed for static assets

## Build settings

- [ ] Build command: **none** — unchanged, matches the existing ZTU site's own buildless setup
- [ ] Output directory / root directory: unchanged from whatever the existing ZTU project already
      uses — no reconfiguration needed

## Environment variables (Cloudflare Pages → Settings → Environment Variables)

**Every OS variable uses the `CEO_` prefix** to avoid colliding with ZTU's existing variables in
the same project-wide pool (Cloudflare Pages does not scope env vars per path — this is a
platform constraint, not a choice; see `DEC-002` §Evidence). Set for both Production and Preview.

| Variable | Purpose | Source | Marked Secret? |
|---|---|---|---|
| `CEO_SUPABASE_URL` | DB connection | `supabase-checklist.md` | no |
| `CEO_SUPABASE_ANON_KEY` | client-safe key | `supabase-checklist.md` | no |
| `CEO_SUPABASE_SERVICE_ROLE_KEY` | server-side privileged key | `supabase-checklist.md` | **yes** |
| `CEO_SITE_ADMIN_EMAIL` | seeds the Wave-2 allowlist | the founder's own email | no |

**No `CEO_APP_ENV` or any other environment-marker variable.** Intentionally removed — Cloudflare
Pages already distinguishes Production from Preview natively (`CF_PAGES_BRANCH` /
`CF_PAGES_URL` are provided automatically), and every environment-specific value this project
needs (which Supabase project, which admin email) is itself an explicit variable above — nothing
needs a separate flag to say which environment it's in. **Do not recreate `CEO_APP_ENV`; if code
ever needs to branch on environment, use Cloudflare's built-in variables or a sensible default,
never a custom marker.**

- [ ] Before adding these, check the existing ZTU project's variable list for any name collision
      even with the prefix (unlikely, but a 30-second check now avoids a silent overwrite later)

## Secrets checklist

- [ ] `CEO_SUPABASE_SERVICE_ROLE_KEY` is marked as a Secret/encrypted variable, not plain text
- [ ] No secret value has ever been pasted into a chat, a committed file, or a non-Cloudflare
      location
- [ ] Understood and accepted: because this is a shared project, `CEO_SUPABASE_SERVICE_ROLE_KEY`
      is technically readable by any Function in the project, including ZTU's existing ones — this
      is the accepted tradeoff recorded in `DEC-002`, not an oversight

## Functions structure

- [ ] Confirm `functions/api/ceo/` and `functions/utils/ceo/` exist at the repository root
      (already created) — this is where every OS Function lives, namespaced away from ZTU's
      existing `functions/api/*.js` and `functions/utils/*.js` files
- [ ] Confirm no existing ZTU function file has been modified — the OS adds files, it never edits
      ZTU's own
- [ ] No OS Functions exist yet — Wave 2 adds the first ones (auth-related), at
      `functions/api/ceo/auth-*.js`

## Routing preparation

- [ ] Confirm the OS's private area will be reachable at `<existing-ztu-domain>/ai-ceo-os/*`
- [ ] Confirm no public page anywhere on the ZTU site links to `/ai-ceo-os/*` — it stays unlisted

## Security settings

- [ ] Access policy: if Cloudflare Access is available on the plan, consider adding it as a second
      edge-level gate specifically on the `/ai-ceo-os/*` path — optional, not required, since
      application-level auth (Wave 2) is the primary gate, but recommended given the shared-project
      tradeoff accepted in `DEC-002`
- [ ] Confirm `/ai-ceo-os/*` is marked `noindex` (see the `_headers` update below)

## Cache preparation

- [ ] Default Cloudflare edge caching is acceptable for static assets — no custom cache rules
      needed at launch
- [ ] Confirm `/api/ceo/*` responses are not cached at the edge (dynamic by default — verify no
      project-wide cache-everything rule accidentally applies to them)

## Headers & redirects (merge into existing files — never create separate ones)

- [ ] Add a scoped rule to the existing root `_headers` file:
      ```
      /ai-ceo-os/*
        X-Robots-Tag: noindex, nofollow
      ```
      appended after the existing rules, never replacing them
- [ ] `_redirects` — no OS-specific redirect is needed at Wave 1; add one later only if a real
      need arises (e.g., `/ai-ceo-os` → `/ai-ceo-os/index.html`), following the existing file's
      301 convention

## Deployment preparation

- [ ] Confirm the deploy flow stays exactly as-is: Desktop Workspace → GitHub → the existing
      Cloudflare Pages project — no second pipeline
- [ ] Understood: a build/Functions failure anywhere in the shared project (OS or ZTU code) can
      block the other's next deploy — accepted per `DEC-002`
- [ ] **Do not deploy yet** — this checklist prepares the project; first real OS-specific deploy
      happens once Wave 2/3 have something to show at `/ai-ceo-os/*`

## Verification checklist

- [ ] Environment variables (`CEO_`-prefixed) are set for both Production and Preview, no
      collision with existing ZTU variables
- [ ] `/ai-ceo-os/*` returns `noindex` in response headers
- [ ] A test file placed at `ai-ceo-os/src/presentation/` (once Wave 3 creates one) is reachable at
      `/ai-ceo-os/...` without any project reconfiguration
- [ ] Existing ZTU pages and functions are completely unaffected — spot-check one existing route
      after this checklist is complete
