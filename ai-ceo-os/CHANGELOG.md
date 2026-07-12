# Changelog

All notable changes to this project are recorded here, newest first. Ties to the Decision Log
(`docs/decisions/`) for the reasoning behind each entry — this file is the *what*, the Decision
Log is the *why*.

## Unreleased

### Added — Implementation Batches 2-6: Mission Engine, Dashboard, Growth, Retention, Mentor wiring
- Seven new Cloudflare Functions under `functions/api/ceo/`: `mission.js` (Today's Mission engine —
  instantiates daily_activities from seeded cadence templates once per day, ranks tier→time,
  computes needs-attention + headline KPI + mentor morning line), `activities.js` (complete/skip
  with reason taxonomy + shutdown note + coaching responses), `trading.js` (journal + rules +
  violations), `clients.js` (directory, touches, stage transitions with lead_pipeline history),
  `retention.js` (daily due-list: milestone ladder, at-risk silence flags, dormant checkpoints),
  `growth.js` (content kanban + campaigns), `kpis.js` (definitions + manual entry with correction
  semantics). Plus `functions/utils/ceo/db.js` — shared REST helper; all data ops run under the
  USER's token so RLS enforces exactly as designed (service_role stays allowlist-check-only).
- Frontend wiring: `shared/api.js` (authenticated fetch wrapper), Home rebuilt as Today's Mission
  (PX Constitution fixed order: warnings→banner→Top 3→core block→attention→KPI→shutdown) via new
  `command-center/home.js`; `trading/trading-page.js`, `clients/clients-page.js` (includes the
  Retention Today panel), `growth/growth-page.js` wired into the existing Wave-4 tab shells.
- Mentor floor delivered through the mission payload (day-type morning templates) + coaching
  lines on every complete/skip — deterministic, grounded in seeded rules; LLM phrasing remains
  the dormant seam by design.
- Skip reasons stored by appending `| skipped:<reason>` to the activity description (schema
  frozen — no new column; documented parse contract).
- QA fixes during implementation: toast levels corrected to the component's real API
  (`critical`, not `danger`); CSS classes reconciled to the actual design system
  (`ceo-badge-critical`, `ceo-alert-critical`, `ceo-field`; selects use `ceo-input`).
- Honest scope notes: trading review/psychology tabs, approval queue, and automation execution
  remain designed empty states (Batches 7-8 per the roadmap — reviews and automation were not in
  this batch set and were not faked).

### Added — Implementation Batch 1: Seed files (Final Implementation, Batch 1)
- Three founder-reviewable seed files in `supabase/seed/`: `seed-01-foundation.sql` (25 KPI
  definitions across 11 proposed categories — the standing category-naming decision closes at
  founder review; 15 settings keys; 15 research verdicts; 10 locked decisions; 10 risks; 5 broker
  rules), `seed-02-operations.sql` (15 cadence templates, 7 mission rules, 12 execution
  checklists, 10 platform playbooks, 5 country playbooks, 12 audience cards, 8 growth-stage
  rules, 10 automation registry entries — all inactive, 8 founder trading rules, 40 content
  ideas), `seed-03-retention-mentor.sql` (10 lifecycle rules, 15 retention templates, 15
  VIP/recovery/referral/recognition/leadership rules, 15 mentor scenario rules, 20 conversation
  templates, 25 mental models, 6 mentor config rules).
- ~250 rows total, all into existing tables — zero schema changes (the freeze holds through
  implementation). Every file: run-once semantics, inline verification queries, commented
  rollback block, founder-email parameter at top.
- Zero demo/client/trade data anywhere (2C §7). All automation entries seeded `is_active=false`
  (Module Gate). Not executed — founder reviews then runs in the Supabase SQL Editor.

### Fixed — Database Production Readiness Review, corrective migration 031 (Prompt 4, Step 4)
- Full audit of migrations `001`-`030`: numbering, dependencies, foreign keys, RLS, indexes,
  constraints, naming, enum usage, soft-delete compliance — one real finding.
- **`031_settings_remove_delete_policy.sql`**: `004_settings.sql` (Wave 1, already live) shipped
  `settings_admin_delete`, the only DELETE policy across all 30 prior migrations — a leftover from
  before the no-hard-deletes rule was enforced with zero exceptions starting Wave 2a. Corrected via
  a new migration, not a rewrite of the applied file. No other issues found: all 30 tables have RLS,
  all 6 enums are used and match their source-of-truth (locked docs or already-built UI), no dead
  tables, no duplicated schema, indexes all tied to a named certain access pattern.
- Database layer is now considered feature-complete and internally consistent through migration
  `031`. See the Database Completion Report (chat, Prompt 4 Step 4) for the full readiness score.

### Added — Migrations 021-030: Mentor Memory, Automation, Growth, Cross-cutting, Future stub (Prompt 4, Step 3)
- Ten SQL migrations closing the full `001`-`030` schema batch from the Database Blueprint:
  `021_coaching_memory.sql`, `022_automation_registry.sql` (+ `automation_matrix_class` enum),
  `023_automation_run_ledger.sql`, `024_approval_queue.sql`, `025_content_library.sql` (+
  `content_status` enum), `026_growth_tasks.sql`, `027_marketing_campaigns.sql`,
  `028_notifications.sql` (+ `notification_class` enum), `029_prompt_archive.sql`,
  `030_external_id_map.sql`.
- Three new enums' literal values were taken directly from already-built Wave 4 UI text rather
  than re-derived from memory: `automation_matrix_class` (Full/AI-assisted/Human-approval/
  Human-only, confirmed in `automation/index.html`), `content_status` (Idea/Production/Published/
  Evergreen/Retired, confirmed in `growth/index.html`), `notification_class` (Info/Reminder/
  Warning/Critical/Approval-Required, confirmed in `settings/index.html`).
- **Design decision:** `coaching_memory` (021) ships with RLS enabled but zero policies of any
  kind — not even admin-select — the strict reading of "service-role-only" from the Database
  Blueprint. `automation_run_ledger` and `notifications` similarly have no authenticated INSERT
  policy — both are written exclusively by server-side service-role code.
- `verification-queries-wave-2c-3.sql` and `WAVE-2C-3-CHECKLIST.md` — same SQL-Editor-safe /
  authenticated-app-only split as Wave 2a/2b.
- Not executed against the real Supabase project — founder action.

### Added — Wave 2b: Relationship & Memory (Prompt 4, Step 2)
- Seven SQL migrations in `supabase/migrations/`: `014_ib_clients.sql` (introduces the
  `client_lifecycle_stage` enum), `015_lead_pipeline.sql`, `016_client_touches.sql`,
  `017_decision_log.sql`, `018_research_library.sql` (introduces the `verdict_type` enum),
  `019_knowledge_base.sql`, `020_risk_register.sql`. RLS shipped in every file, zero DELETE
  policies (no-hard-deletes rule, unchanged).
- **Design decision:** `client_lifecycle_stage`'s seven values (lead/qualified/onboarding/
  activated/engaged/at_risk/retained) were taken directly from the Wave 4 UI's already-built
  Status Workflow kanban (`src/presentation/clients/index.html`) rather than re-derived — the
  schema matches the UI that already committed to that taxonomy, instead of the two drifting apart.
- **Design decision:** `verdict_type` (adopt/trial/defer/reject/unknown) is a real enum, unlike
  `kpi_definitions.category` in Wave 2a — these five values are explicitly locked in the Research
  Governance Document and used consistently across every research output in this project, so
  encoding them doesn't risk the same "guessed enum" mistake that table avoided.
- `lead_pipeline` is a stage-transition history, not a duplicate of `ib_clients` — avoids two
  tables both claiming to hold "current stage."
- `supabase/verification-queries-wave-2b.sql` and `supabase/WAVE-2B-CHECKLIST.md` — same
  SQL-Editor-safe/authenticated-app-only split adopted after Wave 2a's verification correction.
- Not executed against the real Supabase project — founder action, tracked in
  `docs/founder-checklist.md`.

### Added — Wave 2a: Accountability Spine (Prompt 4, Step 1)
- Eight SQL migrations in `supabase/migrations/`: `006_kpi_definitions.sql`, `007_kpi_history.sql`,
  `008_goals.sql` (introduces the `cadence_type` enum), `009_daily_activities.sql`,
  `010_reviews.sql` (one table, all cadences, reuses `cadence_type`), `011_trading_rules.sql`,
  `012_trading_records.sql`, `013_rule_violations.sql`. RLS shipped in every file, zero DELETE
  policies anywhere in this wave (no-hard-deletes rule).
- Every personal-record table carries `owner_user_id` (Technical Architecture §8 scalability
  rule); `kpi_definitions` stays a global admin-managed catalog, like `roles`.
- **Design decision:** `kpi_definitions.category` is free text, not an enum — the 11 KPI
  categories were locked conceptually in Prompt 0 (2C) but the literal category strings were
  never transcribed to a doc on disk. Guessing a fixed enum risked repeating the exact mistake
  `001_enums.sql` made (front-loading types without a confirmed literal set). Convertible to an
  enum later without data loss once the authoritative list exists in writing.
- `supabase/verification-queries-wave-2a.sql` and `supabase/WAVE-2A-CHECKLIST.md` — same pattern
  as Wave 2's equivalents, scoped to this wave.
- **Bug found and fixed:** `docs/architecture/database-blueprint.md`'s migration wave order still
  referenced `001_enums.sql` as the first Core Spine file — a stale reference never updated after
  Wave 2 (Prompt 2, Step 3) dropped that file in favor of per-migration enum creation. Corrected
  to `001_users.sql`.
- Not executed against the real Supabase project — per this project's standing pattern (see Wave
  2), running the migrations is a founder action, tracked in `docs/founder-checklist.md`.

### Fixed — Wave 5: Production-readiness audit (Prompt 2, Step 6)
- `layout.js`: removed stale per-module "Wave 4/6/7" sidebar badges that had drifted out of sync
  with Home's Module Status card (which already said "UI ready, data pending" for all modules as
  of Wave 4). Data-readiness status now has exactly one home.
- Full audit performed: env var prefixing, TODO/debugger markers, stylesheet link order (15
  pages), internal link resolution, folder/naming consistency, no service-role key in client code
  — all clean. See chat for the full report.

### Added — Wave 4: Core Module Foundation, no business logic (Prompt 2, Step 5)
- New reusable component: `shared/components/operational-section.js` — the loading→empty pattern
  every module workspace uses, avoiding duplicated markup across seven modules.
- Extended `components.css` with kanban, timeline, checklist, and generic-list primitives (same
  design tokens, no new palette).
- All seven module pages rebuilt as real tabbed operational workspaces (Command Center extended
  with KPI grid/notifications/activity timeline/quick actions; Trading, Clients, Intelligence,
  Growth, Automation, and Reviews each got five real tabs matching the prompt's spec).
- **Scope reconciliation documented in `docs/architecture/wave-4-module-foundation.md`:** several
  requested workspaces would naturally read from tables that aren't migrated yet (only the Wave 2
  Core Spine exists). Every workspace is a real UI shell with zero live data calls — no new
  Functions, no new queries — showing the same honest empty state a freshly-migrated table would
  actually have.
- No SQL migrations were written this wave — the prompt's own scope listed UI elements only.
- Verified: real pages behind the auth guard show no new console errors (same expected
  backend-unreachable redirect as Wave 3); the two new interactive components (`initTabs()`,
  `initAllOperationalSections()`) were verified via an isolated test page (built inside the
  project tree, deleted immediately after) — all 5 assertions passed (tab-switching visibility
  toggling, skeleton-to-real-content reveal).

### Added — Wave 3: Founder Authentication, Dashboard Shell & Core UI Foundation (Prompt 2, Step 4)
- Two new technical decisions recorded in `docs/decisions/DEC-003-auth-implementation.md`: client
  auth via the official Supabase JS SDK (ESM CDN import, no build step); server-side Functions via
  raw `fetch()` to Supabase's HTTP API instead of the SDK.
- Cloudflare Functions: `functions/api/ceo/config.js` (public config endpoint), `functions/utils/
  ceo/verify-session.js` (shared auth+allowlist check), `functions/api/ceo/auth/session.js` (thin
  wrapper). Login/logout/password-reset handled entirely client-side — no server proxy needed.
- Dark-luxury theme system: `theme.css` (design tokens), `base.css` (resets, app-shell grid, nav),
  `components.css` (the eleven shared component categories — cards, buttons, badges, tables,
  forms, alerts, tabs, progress, empty states, skeleton loaders, modals, toasts).
- Shared JS: `supabase-client.js`, `session-guard.js` (flash-of-protected-content prevention via
  a body-hidden-until-verified pattern), `layout.js` (generates sidebar/header/footer in JS,
  avoids markup duplication without a build step), `toast.js`, `modal.js`, `confirm-dialog.js`,
  `tabs.js`.
- Auth pages: `login.html`/`login.js`, `reset-password.html`/`reset-password.js` (one page, two
  modes — request and confirm).
- Seven module pages: Home (M1, real shell + honest empty states) and six placeholder stubs
  (M2–M7), each stating its actual activation wave.
- Utility page: `settings/index.html` (Settings/Notifications/Audit Center/System Health as tabs,
  not separate nav destinations, per the Dashboard Blueprint).
- Six error pages: 401, 403, 404, 500, maintenance, session-expired.
- `docs/architecture/wave-3-frontend-guide.md` — folder structure, component reference,
  navigation map.
- **Bug caught and fixed before shipping:** `tabs.js` searches for `.ceo-tab-panel` elements
  inside the container passed to `initTabs()` — `settings/index.html` originally had the panels
  as siblings outside the tabs wrapper, which would have silently found zero panels. Fixed by
  wrapping both in a shared parent (`#ceo-settings-tabs-group`).
- Removed the unused `src/presentation/layout/partials/` folder created mid-build once `layout.js`
  was redesigned to generate HTML in JS instead of fetching static fragments.
- Verified via a static-file-server preview: every page renders with correct theme/layout/content;
  the auth-guard's failure path (backend unreachable) correctly redirects to the 500 page rather
  than hanging. Full end-to-end login/session/allowlist flow requires a real deploy with live
  Cloudflare Functions and Supabase credentials — not testable in this environment.

### Added — Wave 2: Core Database Foundation (Prompt 2, Step 3)
- Five real SQL migrations in `supabase/migrations/`: `001_users.sql`, `002_roles.sql` (incl. the
  `is_admin()` SECURITY DEFINER helper), `003_admin_allowlist.sql`, `004_settings.sql` (15
  feature flags seeded, all OFF), `005_audit_log.sql` — RLS shipped in every file, zero broad
  policies, zero write path to `admin_allowlist` or `audit_log` from any role.
- `supabase/verification-queries.sql` — copy/paste verification incl. RLS cross-user denial tests
  and a full RLS-coverage check across all six tables.
- `supabase/WAVE-2-CHECKLIST.md` — execution order, founder actions, rollback order, Definition of
  Done for this wave.
- **Removed `CEO_APP_ENV` from the architecture** (founder-directed, implementation note ahead of
  this step) — Cloudflare's built-in Production/Preview distinction is sufficient; no custom
  environment-marker variable exists or should be recreated. Updated `.env.example` and
  `cloudflare-checklist.md` accordingly.
- Corrected an internal inconsistency in the original migration plan: enum types are no longer
  front-loaded in a single `001_enums.sql` (10 of 12 had no Wave-2 consumer, which would have
  violated the "schema never leads features" rule). `settings.scope` uses a CHECK constraint
  instead of a dedicated enum; the other 11 named enum types will be created alongside the
  migration that first needs them, exactly where the Supabase Implementation Blueprint originally
  staged each one.

### Corrected — Cloudflare topology (Prompt 2, Step 2 follow-up)
- **Reversed**: the OS no longer gets its own Cloudflare Pages project. It deploys inside the
  existing ZTU Pages project at `/ai-ceo-os/*`. Supabase remains fully separate, unchanged.
- Recorded as `docs/decisions/DEC-002-cloudflare-shared-project.md`, superseding that one point in
  `DEC-001-initialization.md` (kept, not deleted, per the audit-trail rule).
- Relocated: removed `ai-ceo-os/functions/` (would have been invisible to Cloudflare Pages, which
  recognizes only one `functions/` root); created `functions/api/ceo/` and `functions/utils/ceo/`
  at the shared repository root instead.
- Renamed every environment variable with a `CEO_` prefix (`CEO_SUPABASE_URL`,
  `CEO_SUPABASE_ANON_KEY`, `CEO_SUPABASE_SERVICE_ROLE_KEY`, `CEO_SITE_ADMIN_EMAIL`, `CEO_APP_ENV`)
  to avoid colliding with ZTU's existing variables in the shared project-wide pool.
- Added a scoped `noindex`/private-cache rule for `/ai-ceo-os/*` to the existing root `_headers`
  file (no separate file created).
- Updated: `cloudflare-checklist.md`, `supabase-checklist.md`, `auth-checklist.md`,
  `naming-standards.md`, `.env.example`, `authentication-foundation.md` (distinct session cookie
  and login route, separate from `functions/utils/admin-session.js`), `src/application/auth/README.md`,
  `deployment-guide.md`, root `README.md`, `founder-checklist.md`, `database-blueprint.md`,
  `integration-blueprint.md`, `production-readiness-blueprint.md`.

### Added — Wave 1 (Prompt 2, Step 2)
- Repository governance docs: naming standards, coding standards, contribution standards,
  repository governance, error handling strategy (`docs/governance/`)
- Authentication foundation documentation (`docs/architecture/authentication-foundation.md`)
- Deployment guide and developer guide (`docs/`)
- Templates: decision log, prompt archive, research, weekly review, monthly review
- Infrastructure checklists: Supabase, Cloudflare, Auth (`config/env/`)
- Feature flag catalog (`config/feature-flags.md`)
- `functions/` directory (Cloudflare Pages Functions routing convention)
- `src/application/auth/` placeholder

### Added — Prompt 1 (Steps 1-6)
- Full folder skeleton, `.env.example`, `.gitignore`, root `README.md`
- Six architecture blueprints: database, dashboard, intelligence, integration,
  production-readiness, implementation-roadmap (all in `docs/architecture/`)
- `DEC-001-initialization.md` — topology and framework decisions (resolved 2026-07-11)

### Added — Prompt 0 (Steps 1-8)
- Business Foundation, Research Governance, Business/Technical Architecture, Development/Database/
  Frontend Constitutions, Functional Specification, live market research, Execution Playbook —
  the full business and governance planning stack. No code.

## Format going forward

Each wave's completion adds one entry here, dated, linking to its Decision Log record.
