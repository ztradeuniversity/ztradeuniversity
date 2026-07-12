---
id: supabase-checklist
type: checklist
title: Supabase Foundation Checklist
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Manual founder actions to prepare the dedicated Supabase project. No SQL runs from this checklist — schema comes in Wave 2.
---

# Supabase Foundation Checklist

Project: `https://ikttrcfutkdycpajswua.supabase.co` — the dedicated Internal Development project
for this OS. Never the ZTU production schema.

## Required project settings

- [ ] Confirm the project region is set (cannot be changed later without migration — verify it
      matches where the founder/primary users actually are, for latency)
- [ ] Confirm the project is on a plan tier that supports the expected table/row volume (free tier
      is sufficient at founder scale per the Technical Architecture's cost analysis)

## Authentication settings (Dashboard → Authentication)

- [ ] Providers → Email → **enabled**
- [ ] Providers → Email → **"Confirm email" → ON** (mandatory verification, non-negotiable)
- [ ] URL Configuration → Site URL → set to `<existing-ztu-domain>/ai-ceo-os/` once that path is
      live (shared-project topology, per `DEC-002` — not a separate domain)
- [ ] URL Configuration → Redirect URLs → add the `/ai-ceo-os/auth/callback`-style path once built
- [ ] Policies → Password policy → review the default, no change needed unless a specific reason
      emerges
- [ ] MFA → **left disabled** at launch (single-founder system, proportionate risk — can be
      enabled later with zero schema impact)

## Storage preparation

- [ ] **No buckets created yet** — deferred to Wave 7 (Content Library assets), per the lazy-
      provisioning rule in the Database Engineering Constitution §11. Do not create buckets early.

## RLS preparation checklist (applies starting Wave 2)

- [ ] Confirm you understand: **every table gets RLS in the same migration that creates it** — no
      table will ever exist unprotected, even briefly
- [ ] Confirm you understand: the `service_role` key is never used client-side, only in Cloudflare
      Functions server-side code

## Database preparation checklist

- [ ] No tables exist yet — this is expected. Wave 2 creates the first six (`001`-`005`).
- [ ] Confirm no other project/schema assumptions are being carried over from the ZTU Supabase
      project — this project starts from zero.

## Required environment variables

**All `CEO_`-prefixed** — this project shares a Cloudflare Pages project with the existing ZTU
site (see `docs/decisions/DEC-002-cloudflare-shared-project.md`), so every variable needs a
distinct name to avoid colliding with ZTU's own.

| Variable | Purpose | Where to obtain it | Where to add it |
|---|---|---|---|
| `CEO_SUPABASE_URL` | connects the app to this project | already known: `https://ikttrcfutkdycpajswua.supabase.co` | `.env.local` + Cloudflare Pages env vars |
| `CEO_SUPABASE_ANON_KEY` | public-safe client key (RLS is the real gate) | Dashboard → Project Settings → API → `anon` `public` key | same as above |
| `CEO_SUPABASE_SERVICE_ROLE_KEY` | server-side privileged access | Dashboard → Project Settings → API → `service_role` secret | Cloudflare Pages env vars **only**, marked Secret — never `.env.local` if this machine is shared, never in any committed file |

## Manual founder actions (this checklist's actual to-do list)

- [ ] Enable email confirmation (above)
- [ ] Retrieve the `anon` key and the `service_role` key from the dashboard
- [ ] Hold onto both keys for `cloudflare-checklist.md`'s env var setup — do not paste them
      anywhere in this repository's tracked files

## Verification checklist

- [ ] A test connection using the `anon` key can reach the project (will return empty/RLS-denied
      results until Wave 2 creates tables — that's the expected, correct behavior)
- [ ] The `service_role` key is **not** present in any file tracked by git (`git status` shows
      clean before ever committing)
