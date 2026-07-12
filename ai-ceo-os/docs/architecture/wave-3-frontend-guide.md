---
id: wave-3-frontend-guide
type: architecture
title: Wave 3 Frontend Implementation Guide
version: 1.0
status: accepted
created: 2026-07-11
depends_on: [dashboard-blueprint, DEC-001-initialization, DEC-002-cloudflare-shared-project, DEC-003-auth-implementation]
summary: Folder structure, component reference, navigation map, and UI standards for everything built in Wave 3.
---

# Wave 3 Frontend Implementation Guide

## Folder structure (as built)

```
ai-ceo-os/src/presentation/
  shared/
    styles/
      theme.css        — design tokens (colors, spacing, type, radius, shadow)
      base.css          — resets, app-shell grid, nav styles, utility classes
      components.css     — the eleven shared component categories
    components/
      toast.js            — showToast(message, level, durationMs)
      modal.js              — openModal(html) / closeModal()
      confirm-dialog.js      — confirmDialog({title, message, ...}) -> Promise<boolean>
      tabs.js                  — initTabs(containerSelector)
    supabase-client.js          — lazy SDK init, fetches config from /api/ceo/config
    session-guard.js              — guardPage(): verifies session+allowlist, reveals body or redirects
  layout/
    layout.js                       — initLayout(activeKey): injects sidebar/header/footer, wires logout
  auth/
    login.html / login.js              — sign-in
    reset-password.html / reset-password.js — request + confirm, one page two modes
  command-center/index.html                — M1 Home (real shell, empty states pending Wave 4+)
  trading/index.html                         — M2 placeholder (Wave 4)
  clients/index.html                           — M3 placeholder (Wave 4)
  growth/index.html                              — M4 placeholder (Wave 7)
  intelligence/index.html                          — M5 placeholder (Wave 4)
  automation/index.html                              — M6 placeholder (Wave 6)
  review/index.html                                    — M7 placeholder (Wave 4)
  settings/index.html                                    — utility cluster (Settings/Notifications/Audit/Health)
  errors/
    401.html / 403.html / 404.html / 500.html / maintenance.html / session-expired.html

functions/api/ceo/
  config.js                — GET /api/ceo/config (public-safe Supabase URL + anon key)
  auth/session.js            — GET /api/ceo/auth/session (session + allowlist check)
functions/utils/ceo/
  verify-session.js            — shared verification logic, reused by future Wave 4+ Functions
```

## Component reference

| Component | File | Usage |
|---|---|---|
| Card | CSS class `.ceo-card` | any KPI/content block |
| Button | `.ceo-btn` + `.ceo-btn-primary` / `-secondary` / `-destructive` | no fourth tier |
| Badge | `.ceo-badge` + `-success` / `-warning` / `-critical` / `-info` / `-neutral` | status pills, module-wave tags |
| Table | `.ceo-table` | any list view |
| Form field | `.ceo-field` / `.ceo-label` / `.ceo-input` | consistent labeling/validation styling |
| Alert | `.ceo-alert` + `-info` / `-warning` / `-critical` | inline, persistent messages |
| Tabs | `.ceo-tabs` / `.ceo-tab` / `.ceo-tab-panel` + `tabs.js` | **panels must be inside the same container passed to `initTabs()`** — see `settings/index.html` for the correct pattern |
| Progress | `.ceo-progress` / `.ceo-progress-bar` | fixed-width inner bar via inline `style="width: X%"` |
| Empty state | `.ceo-empty-state` | every placeholder page uses this |
| Skeleton loader | `.ceo-skeleton` + `-text` / `-card` | pure CSS, no JS |
| Modal | `modal.js` | chrome never varies, only injected content does |
| Confirm dialog | `confirm-dialog.js` | wraps modal.js; use for Heavy-weight/approval-adjacent actions only |
| Toast | `toast.js` | transient, non-blocking messages |

## Navigation map

Seven module destinations + one utility cluster, unchanged from the Dashboard Blueprint:

| Nav item | Path | Status |
|---|---|---|
| Home (M1) | `/ai-ceo-os/src/presentation/command-center/index.html` | active shell, empty states |
| Trading Discipline (M2) | `/ai-ceo-os/src/presentation/trading/index.html` | placeholder, Wave 4 |
| IB Client Engine (M3) | `/ai-ceo-os/src/presentation/clients/index.html` | placeholder, Wave 4 |
| Growth Engine (M4) | `/ai-ceo-os/src/presentation/growth/index.html` | placeholder, Wave 7 |
| Intelligence Center (M5) | `/ai-ceo-os/src/presentation/intelligence/index.html` | placeholder, Wave 4 |
| Automation Center (M6) | `/ai-ceo-os/src/presentation/automation/index.html` | placeholder, Wave 6 |
| Reviews (M7) | `/ai-ceo-os/src/presentation/review/index.html` | placeholder, Wave 4 |
| Settings (utility, header icon) | `/ai-ceo-os/src/presentation/settings/index.html` | placeholder tabs |

## UI standards applied

- **Auth guard pattern:** every protected page's `<body>` starts with class `ceo-auth-pending`
  (hidden via CSS), revealed only after `session-guard.js` confirms authorization — no
  flash-of-protected-content, ever.
- **Layout injection:** `layout.js` generates sidebar/header/footer HTML in JS rather than
  fetching static partials — simpler, avoids an extra network round-trip, handles dynamic state
  (active nav, user email, wave badges) without template-string hacks.
- **Status-color vocabulary:** the same five values (success/warning/critical/info/neutral) mean
  the same thing everywhere — badges, alerts, toasts.
- **Desktop-first:** the app shell collapses the sidebar below 768px (mobile is read-mostly per
  the Frontend Constitution); no off-canvas toggle yet — a Wave 8 refinement, not required now.

## Known limitation from this wave's own verification

Live auth flow (real login → real session → real allowlist check) could not be tested in this
environment — it requires deployed Cloudflare Functions with real Supabase credentials, which
only the founder holds. What **was** verified: every page renders with correct theme/layout/
content, and the failure path (backend unreachable) correctly redirects to the 500 error page
rather than hanging — confirmed via a static-file-server preview showing all expected network
requests and the correct redirect behavior. Full end-to-end verification happens once the founder
deploys with real environment variables (see the Verification Checklist in the chat response).
