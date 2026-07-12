# ZTU AI CEO Operating System

Private, admin-only operating system for maximizing sustainable IB commission through disciplined founder execution, automation, and AI-assisted decision-making.

**This is not part of the public ZTU website.** It is developed in isolation inside this folder and deploys as a private admin area (`/ai-ceo-os/*`, `noindex`) inside the existing ZTU Cloudflare Pages project — sharing the deploy pipeline, but using a **fully separate, dedicated Supabase project** for all data, auth, and migrations. See `docs/decisions/DEC-002-cloudflare-shared-project.md` for why, and `docs/architecture/` for the rest.

## Status

Planning complete (Prompt 0, Steps 1–8; Prompt 1, Steps 1–6; Prompt 2, Step 1). Wave 1 foundation complete. **Wave 2 (Core Database Foundation) complete and verified against the real Supabase project.** **Wave 3 (Founder Authentication, Dashboard Shell, Core UI Foundation) complete.** **Wave 4 (Core Module Foundation) complete** — all seven modules now have real, tabbed operational UI shells (Trading, Clients, Intelligence, Growth, Automation, Reviews) with proper loading/empty states, reusing Wave 3's shared components. See `docs/architecture/wave-4-module-foundation.md`. No business logic, AI engines, or live data calls exist yet — every workspace is a real shell with zero queries, since the underlying tables (beyond the Wave 2 Core Spine) aren't migrated.

## Orientation

- `docs/architecture/README.md` — **start here** — the index of every architecture document, in reading order
- `docs/architecture/implementation-roadmap.md` — the current build wave and what's next
- `docs/foundation/` — the Prompt 0 planning stack (mission, governance, functional spec, research, execution playbook)
- `docs/governance/` — naming, coding, contribution, and repository-governance standards
- `docs/decisions/` — the permanent Decision Log
- `docs/research/` — the Research Library (evidence-tiered findings)
- `docs/prompts/` — verbatim archive of every instruction that shaped this project
- `docs/founder-checklist.md` — everything only the founder can do, in one place
- `config/env/` — Supabase/Cloudflare/Auth setup checklists (no secrets, names and sources only)
- `config/feature-flags.md` — every flag, all default OFF
- `supabase/migrations/` — schema history: `001`-`005` applied (Core Spine — users, roles, admin_allowlist, settings, audit_log)
- `../functions/api/ceo/` and `../functions/utils/ceo/` — Cloudflare Pages Functions, namespaced inside the *shared repo's* single Functions root (`D:\website\functions\`, not inside this folder — see `docs/decisions/DEC-002-cloudflare-shared-project.md`)
- `src/presentation/` — dashboard shell, auth pages, error pages, shared components (Wave 3) + all seven module operational shells (Wave 4) — see `docs/architecture/wave-3-frontend-guide.md` and `wave-4-module-foundation.md`

## Rules that govern everything here

1. Nothing deploys to Production without explicit founder approval, every time.
2. No secret is ever invented — real values come only from the founder, from a named dashboard, into a named location.
3. Schema changes always follow the full migration methodology (see `docs/architecture/database-blueprint.md`).
4. The OS never writes to any existing ZTU system — every integration is read-only, one direction.
5. This README and the folder structure it describes are Structural — changed only deliberately, never by accretion.

Full context: `docs/architecture/README.md`.
