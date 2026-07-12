---
id: wave-2-checklist
type: checklist
title: Wave 2 — Core Database Foundation Execution Checklist
version: 1.0
status: accepted
created: 2026-07-11
summary: Everything needed to apply migrations 001-005 to the real Supabase project, who does each step, and how to verify and roll back.
---

# Wave 2 Execution Checklist

## 1. Claude-generated files (already written, ready to run)

| File | Creates |
|---|---|
| `supabase/migrations/001_users.sql` | `public.users` table, RLS, auth-sync trigger |
| `supabase/migrations/002_roles.sql` | `public.roles`, `public.user_roles`, `is_admin()` function, seeded `admin` role, admin-visibility policy on `users` |
| `supabase/migrations/003_admin_allowlist.sql` | `public.admin_allowlist` table, RLS (admin-read-only, no write policy at all) |
| `supabase/migrations/004_settings.sql` | `public.settings` table, RLS, 15 seeded feature flags (all `false`) |
| `supabase/migrations/005_audit_log.sql` | `public.audit_log` table, RLS, one index, append-only (no UPDATE/DELETE policy for any role) |
| `supabase/verification-queries.sql` | copy/paste verification + RLS cross-user test queries |

**Storage:** zero buckets created — none required until Wave 7, per the lazy-provisioning rule. Nothing to do here at Wave 2.

## 2. Migration execution order (strict — never out of order)

`001` → `002` → `003` → `004` → `005`, each fully applied and verified (§5 below) before the next starts. `002` depends on `001` (foreign keys to `users`); `003`–`005` depend on `002`'s `is_admin()` function.

## 3. Manual SQL run order (how to actually apply them)

Run each file's contents in the Supabase SQL Editor (Dashboard → SQL Editor → New query), in order, one at a time:

1. Paste and run `001_users.sql`. Confirm no errors.
2. Paste and run `002_roles.sql`. Confirm no errors.
3. Paste and run `003_admin_allowlist.sql`. Confirm no errors.
4. Paste and run `004_settings.sql`. Confirm no errors — this one inserts 15 rows, expect "15 rows affected" or similar on the final INSERT.
5. Paste and run `005_audit_log.sql`. Confirm no errors.

(If your workflow uses the Supabase CLI instead of the dashboard SQL Editor, the same five files apply in the same order via `supabase db push` or equivalent — the SQL itself doesn't change.)

## 4. Founder actions (Human-only — no code path does these)

- [ ] After `003_admin_allowlist.sql` applies: insert your own email into `admin_allowlist` directly via the SQL Editor:
  ```sql
  insert into public.admin_allowlist (email, added_by) values ('your-email@example.com', 'founder, manual, Wave 2');
  ```
- [ ] Create your Supabase Auth account (Dashboard → Authentication → Users → Add user, or via the eventual login page once Wave 3 builds it) using **the same email** as the allowlist row above.
- [ ] After your auth account exists: assign yourself the `admin` role:
  ```sql
  insert into public.user_roles (user_id, role_id)
  select u.id, r.id
  from auth.users u, public.roles r
  where u.email = 'your-email@example.com' and r.name = 'admin';
  ```
- [ ] Run `is_admin()` as yourself (once logged in via the app, or by setting the SQL Editor's role context) to confirm it returns `true`.

## 5. Cloudflare actions (separate from Supabase — see `config/env/cloudflare-checklist.md`)

- [ ] Add the four `CEO_`-prefixed environment variables to the existing ZTU Cloudflare Pages project (Production and Preview) — `CEO_APP_ENV` is **not** one of them; it was removed by design.
- [ ] No Cloudflare Functions exist yet at Wave 2's SQL stage — those come with Wave 2's auth *code* (a separate, later step; this checklist covers schema only, per this prompt's explicit scope).

## 6. Supabase actions (dashboard configuration, not SQL)

- [ ] Confirm Authentication → Providers → Email → "Confirm email" is ON (per `config/env/supabase-checklist.md` — should already be done; re-verify here since real users are about to be created)
- [ ] No storage buckets — confirmed not needed yet (§1 above)

## 7. Verification checklist

Run every query in `supabase/verification-queries.sql`, in the order it's written, matching each block to the migration that just applied. The final block (full RLS coverage check) must show `rowsecurity = true` for all six tables before Wave 2 is considered done — this is the single most important line in the whole file.

- [ ] All six tables exist
- [ ] `is_admin()` function exists and returns `false` for a non-existent user
- [ ] `admin` role seeded (exactly one row)
- [ ] 15 feature flags seeded, all `false`
- [ ] `admin_allowlist` empty until the founder manually adds their own row (§4)
- [ ] Every cross-user RLS test in the verification file returns empty/denied, **not** an error and **not** data
- [ ] The founder's own account, once created and role-assigned, can read what `is_admin()`-gated policies allow
- [ ] Full RLS coverage check: all six tables show `rowsecurity = true`

## 8. Rollback order (if something needs undoing — reverse of application order)

Per the Database Engineering Constitution §8: rollback is a **new corrective migration**, never a rewrite of these five files (once any of them has touched the real project, it's permanent history). If a rollback is genuinely needed before Production exists, the corrective migrations would run in this order:

1. Drop policies and table from `005` (`audit_log`) — safest to reverse first, nothing depends on it
2. Drop policies and table from `004` (`settings`) — check nothing has written real config yet
3. Drop policies and table from `003` (`admin_allowlist`) — **do this only after confirming you still have another way to log in**, since this table gates access
4. Drop `is_admin()`, then policies and tables from `002` (`user_roles`, `roles`)
5. Drop the trigger and function from `001`, then the `users` table itself, then confirm `auth.users` (Supabase-managed) is untouched — it always is, since nothing here modifies it directly

No corrective migration files are pre-written — per the Constitution, they're written only if this is actually needed, at that time, against the real state.

## Definition of Done for this checklist

Every box above checked, `supabase/verification-queries.sql`'s full RLS coverage check passes, and the founder can confirm `is_admin()` returns `true` for their own account. Only then does Wave 2's Core Spine count as done — Wave 3 (dashboard shell) depends on this being genuinely complete, not just "the SQL ran."
