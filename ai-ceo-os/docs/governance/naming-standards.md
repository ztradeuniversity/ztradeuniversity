---
id: naming-standards
type: governance
title: Naming Standards
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Literal naming conventions for every object type in this project. Fixed once, held permanently — a rename is a Structural change.
---

# Naming Standards

Fixed literally per the Master Project Initialization blueprint (§8) and the Database Engineering
Constitution's naming rules (§3). These are not suggestions — a violation is a QA finding, and
renaming a shipped object is a Structural change (see `repository-governance.md`).

| Object | Convention | Example |
|---|---|---|
| Folders | kebab-case | `client-engine/` |
| Files (JS/HTML/CSS/MD) | kebab-case | `client-list.html`, `kpi-card.js` |
| JS functions | camelCase, verb-first | `computeRetentionCohort()` |
| JS classes/constructors (rare — see coding-standards.md's low-abstraction bias) | PascalCase | `ApprovalQueue` |
| Database tables | plural, snake_case, module-scoped where ambiguous | `ib_clients`, `trading_records` |
| Database columns | snake_case | `owner_user_id`, `created_at` |
| RLS policies | `<table>_<role>_<operation>` | `ib_clients_admin_select` |
| Migration files | `NNN_description.sql`, zero-padded sequence | `001_enums.sql` |
| Environment variables | `SCREAMING_SNAKE_CASE`, **always `CEO_`-prefixed** (shared Cloudflare project with ZTU — see `DEC-002-cloudflare-shared-project.md`) | `CEO_SUPABASE_SERVICE_ROLE_KEY` |
| Feature flags | `module.capability` | `m4.growth-engine` |
| Documentation files | `<seq>-<TYPE>-<slug>-v<ver>.md` (long-form) or descriptive kebab-case (working docs) | `010-RES-broker-evaluation-v1.0.md` |
| Prompt archive files | `prompt-<phase>-<step>-<slug>.md` | `prompt-1-step2-database.md` |
| Decision Log entries | `DEC-<seq>-<slug>.md` | `DEC-001-initialization.md` |
| Reports | `<cadence>-<date>.md` | `weekly-2026-07-13.md` |
| Cloudflare Function routes | every OS route lives under the shared repo's `functions/api/ceo/` (never a second `functions/` root — see `DEC-002`) | `functions/api/ceo/clients.js` → `/api/ceo/clients` |

## Rules

- No abbreviations that aren't immediately obvious (`cfg` no, `config` yes — clarity beats brevity).
- No two objects in the same category differing only by a synonym (`client` vs `customer` — pick
  one term per concept, project-wide; this project uses **client** for IB relationships,
  **founder** for the system's single user, never "admin" or "owner" as a stand-in for either).
- A name should tell you which layer/module owns it without opening the file — this is the whole
  point of the convention, and the test for whether a new name is good enough.
