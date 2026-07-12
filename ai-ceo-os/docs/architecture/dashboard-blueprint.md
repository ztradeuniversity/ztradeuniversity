---
id: dashboard-blueprint
type: architecture
title: Master AI CEO Dashboard & Founder Experience Blueprint
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: [DEC-001-initialization, database-blueprint]
summary: UI/UX architecture for the seven-module dashboard — navigation, screens, AI coaching presentation, KPI Center, notifications. No HTML/CSS/JS yet.
---

# Master AI CEO Dashboard & Founder Experience Blueprint

Full content delivered in chat during Prompt 1, Step 3 (2026-07-11). This file is the permanent
on-disk reference pointer. Key facts:

## Navigation (7 modules + 1 utility cluster — unchanged from Frontend Constitution §2)

| Destination | Working views |
|---|---|
| M1 — Command Center | Home overview, KPI Center |
| M2 — Trading Discipline | Today, Journal, Review, Rules, Improvement plan |
| M3 — IB Client Engine | Pipeline board, Client list/detail, Commission, Retention, Funnel, Referral |
| M4 — Growth Engine | Content Intelligence, Website Growth/SEO, Calendar, Marketing/Campaigns |
| M5 — Intelligence Center | Research, Knowledge, Decisions, Risk, Prompt Library |
| M6 — Automation Center | Registry/health, Approval queue |
| M7 — Review & Accountability | Daily loop, Weekly/Monthly/Quarterly/Annual reviews, Reports |
| Utility cluster (persistent, not a nav destination) | Settings, Notifications, Audit Center, System Health |

## Key design decisions

- **3-recommendation cap** (Step 8 §14) preserved — Home screen's "priority list" = always-present
  Core-loop items + up to 3 capped AI recommendation slots, never more.
- **Performance Score**: transparent derived composite (never stored), always shown with its four
  components (HIGH-value time share, discipline adherence, cadence adherence, KPI-threshold hit
  rate) — deliberately designed to not become a vanity metric.
- **KPI Center** groups map onto the locked 11 2C KPI categories — no new category created.
  "AI Quality" nests under AI Automation as an advice-acceptance sub-metric.
- **Content Intelligence** module is placeholder-heavy by instruction — no Domain 2/3/4 research
  performed yet, only the receiving screens designed. 300+ topic framework reuses `content_library`
  (status=idea), no new table.
- **Pine Script integration** and **WhatsApp reminders**: both Future/L7-adapter-gated
  placeholders, zero functionality, labeled disabled slots only.
- Global search, command-palette quick actions, and pinned/favorites are new UX additions — all
  read-only or stored in existing `settings` (scope=user), no schema changes.

## Open items (unchanged, still blocking real code)

- [ ] Deployment topology confirmation
- [ ] Framework assumption confirmation (no framework vs. a framework)

Full screen-by-screen detail is in the Step-3 chat transcript.
