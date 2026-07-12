---
id: contribution-standards
type: governance
title: Contribution Standards (Founder + AI Collaboration)
version: 1.0
status: accepted
created: 2026-07-11
updated: 2026-07-11
summary: This is a solo-founder, private project — "contribution" means how the founder and Claude collaborate on the codebase, not an open-source process.
---

# Contribution Standards

This project has exactly two contributors: the founder and Claude (across sessions with no shared
memory except this document set). "Contribution standards" here means the authority tiers that
govern who does what — distilled from the Development Constitution.

## The four tiers

| Tier | Scope | What it means |
|---|---|---|
| **AI may complete independently** | scaffolding within an approved module boundary, business logic strictly in-scope, documentation, tests, self-QA | no checkpoint required before the work exists, but it still passes review before being "done" |
| **AI drafts, founder reviews** | anything touching money, client data, or trading rules; anything an already-shipped module's contract changes | presented as a draft with reasoning and risk stated explicitly — not "done" until reviewed |
| **Founder approval mandatory** | schema migrations before they run for real, anything deploying to Production, secrets, RLS policy changes, Structural changes | AI prepares everything up to the approval step and stops |
| **Founder-only decisions** | architectural calls, accepting a defect instead of fixing it, anything trading a security/recovery objective for convenience | AI lays out options and evidence; the decision itself isn't the AI's to make |

## How Claude must behave

- **Explain reasoning** — every non-trivial change cites which document it implements and why.
- **Preserve architecture** — a change that would require reshaping the locked architecture is
  flagged as Structural *before* work begins, never absorbed silently.
- **Avoid scope creep** — a task's stated scope is its scope. Adjacent improvements are named and
  logged, not bundled into the current diff.
- **Avoid hidden assumptions** — anything inferred rather than read from an approved document is
  labeled as an assumption.
- **Detect conflicts** — a new instruction that conflicts with existing architecture or a prior
  Decision Log entry is surfaced before proceeding.
- **Report risks** — every "AI drafts, founder reviews" item carries its own risk assessment and
  confidence label.
- **Ask only when truly blocked** — proceed on reasonable, stated assumptions for reversible,
  in-scope decisions; stop only for irreversible, out-of-scope, or genuinely unspecified calls.

## Review

Every deliverable is reviewed against the severity framework: Critical (blocks absolutely) / Major
(blocks or founder-accepted with a repair date) / Minor (logged, batched) / Improvement (feeds the
Knowledge Base, never blocks). AI-authored work gets no exemption from this — authorship doesn't
change the bar.

## Change control

Trivial (typo-level) → make it, log one line. Standard (in-scope task) → full review cycle above.
Structural (touches locked architecture, a permanent line, or an already-shipped module's
contract) → full change record + explicit founder approval, no code written until approved.
