---
id: feature-flags
type: governance
title: Feature Flag Catalog
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: Every feature flag this project will use, classified, all default OFF. Stored as scoped keys in the `settings` table (no separate table) once Wave 2 ships it.
---

# Feature Flag Catalog

## Storage

Flags live inside the `settings` table (`scope='global'`, keyed `module.capability`), not a
separate table — per the Database Engineering Constitution's "one designed home" rule. This
document is the catalog; the table is where the live values actually sit.

## Classification

| Class | Meaning |
|---|---|
| **Core** | infrastructure-level toggles controlling fundamental system behavior once live (rare) |
| **Experimental** | built and shipped, currently being validated before wider trust |
| **Future** | named and designed, not yet built — the Module Gate mechanism |
| **Disabled** | built, tested, deliberately kept off (distinct from Future — the code exists) |

**Every flag defaults OFF.** A module activates only through a deliberate, logged change — never
by a flag silently defaulting on when its code ships.

## Catalog

| Flag key | Module | Class | Default | Notes |
|---|---|---|---|---|
| `core.maintenance-mode` | X1 | Core | OFF | when ON, non-critical routes show a maintenance message; escape hatch for incident response |
| `core.read-only-mode` | X1 | Core | OFF | blocks all writes while investigating a data issue |
| `m1.kpi-center` | M1 | Future | OFF | full KPI Center screen — Wave 4 |
| `m2.trading-discipline` | M2 | Future | OFF | Wave 4 |
| `m3.ib-client-engine` | M3 | Future | OFF | manual mode — Wave 4 |
| `m3.exness-api-sync` | M3 | Future | OFF | gated separately on the founder's Exness portal verification — do not enable until that Wave-0 item closes |
| `m4.growth-engine` | M4 | Future | OFF | Wave 7 |
| `m5.intelligence-center` | M5 | Future | OFF | Wave 4 (as real tables, not just markdown) |
| `m6.automation-center` | M6 | Future | OFF | Wave 6 |
| `m7.daily-loop` | M7 | Future | OFF | Wave 4 |
| `m7.full-cadence` | M7 | Future | OFF | monthly/quarterly/annual reviews — Wave 8, also calendar-gated |
| `l3.ai-mentor` | L3 | Future | OFF | Wave 5 |
| `l7.ztu-readonly-adapter` | L7 | Future | OFF | Wave 7 |
| `l7.whatsapp-channel` | L7 | Future | OFF | gated on D8 research/founder decision, per the Integration Blueprint |
| `l7.elevenlabs-dubbing` | L7 | Future | OFF | TRIAL-gated per Step 7 research |

## Rule

Before any wave marks a flag as ready to flip on, the corresponding Wave Transition Gate
(`implementation-roadmap.md` §7) must have passed. Flipping a flag on is itself a Standard change
under `repository-governance.md` — logged, not silent.
