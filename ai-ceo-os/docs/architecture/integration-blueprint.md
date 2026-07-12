---
id: integration-blueprint
type: architecture
title: Master System Integration & Ecosystem Blueprint
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
depends_on: [DEC-001-initialization, database-blueprint, dashboard-blueprint, intelligence-blueprint]
summary: How the OS connects to the existing ZTU ecosystem and external services — read-only in every direction, zero shared credentials, zero new tables.
---

# Master System Integration & Ecosystem Blueprint

Full content delivered in chat during Prompt 1, Step 5 (2026-07-11). Permanent on-disk pointer.

## The one rule that governs this entire document

**The OS never writes to any existing ZTU system.** Every integration is read-only, one direction
(ZTU → OS), via HTTPS calls to ZTU's existing Cloudflare Functions API layer — never a direct
connection to any ZTU Supabase project. Zero ZTU database credentials ever exist inside the OS.

## Resolutions of the prompt's most tempting write-implying asks

- **Trading Journal**: already decided in Technical Architecture §5 — OS's own M2 is system of
  record going forward; existing ZTU journal is a one-time historical import only, never a live
  sync (two live journals = duplicated truth, forbidden).
- **Content publishing**: OS tracks planning/production status (`content_library`); the actual
  live-site push stays a founder-executed action through the existing warehouse→publish workflow.
  The OS never auto-publishes.
- **IB Verification**: same anti-dual-source-of-truth resolution as the trading journal — M3,
  driven by the Exness Partnership API, is the system of record going forward.
- **EA Delivery**: OS observes delivery status read-only; triggering delivery stays ZTU-side.

## New decisions this step made

1. **WhatsApp provider**: live-researched (2026-07-11) — recommend **WhatsApp Cloud API direct**,
   not Twilio. Twilio's $0.005/msg markup buys infrastructure convenience this project doesn't
   need (already fully Cloudflare-Functions-native). Still Future/gated — Email remains Native
   and sufficient today.
2. **Transactional email provider** (new, Required): Supabase Auth's built-in email is for
   verification only, not general notifications. A dedicated provider (e.g. Resend) is needed for
   the Reminder/Warning/Critical notification classes.
3. **No new database tables** — every ZTU-sourced integration lands in existing Step-2 tables
   (`kpi_history` via `source='automated'`, `research_library`, `knowledge_base`).

## Correction (Prompt 2, Step 2 follow-up — 2026-07-11)

The "two-Cloudflare-project map" this document's §2/§11 originally assumed is **superseded** —
see `docs/decisions/DEC-002-cloudflare-shared-project.md`. The OS shares the existing ZTU
Cloudflare Pages project; only the Supabase project remains separate. The read-only,
one-direction integration rule (§1 above) is completely unaffected by this — it was always about
data access, never about Cloudflare project count.

Open items: both resolved — deployment topology per `DEC-002` (shared project), framework per
`DEC-001` (plain HTML/CSS/JS, unchanged).

Full section-by-section detail (16 sections) is in the Step-5 chat transcript — read its
Cloudflare Integration section (§11) alongside `DEC-002`, not in isolation.
