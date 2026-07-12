# Architecture Index

Every document here is permanent (Structural-change-only) and builds on the ones before it. Read
in this order if you're new to the project:

1. **[database-blueprint.md](database-blueprint.md)** — ~33 tables, 6 migration waves, RLS strategy
2. **[dashboard-blueprint.md](dashboard-blueprint.md)** — navigation, screens, AI coaching UI
3. **[intelligence-blueprint.md](intelligence-blueprint.md)** — the AI Brain: decision engine,
   priority engine, twelve domain lenses across four registers
4. **[integration-blueprint.md](integration-blueprint.md)** — how this connects to the existing
   ZTU ecosystem (read-only, always, one direction)
5. **[production-readiness-blueprint.md](production-readiness-blueprint.md)** — go-live checklist,
   readiness scoring, rollback framework
6. **[implementation-roadmap.md](implementation-roadmap.md)** — the 8-wave build order every
   coding prompt follows
7. **[authentication-foundation.md](authentication-foundation.md)** — the auth flow Wave 2/3 built
8. **[wave-3-frontend-guide.md](wave-3-frontend-guide.md)** — folder structure, component
   reference, and navigation map for everything Wave 3 actually built
9. **[wave-4-module-foundation.md](wave-4-module-foundation.md)** — operational UI shells for all
   seven modules, the scope reconciliation behind them, and how they were verified

**Decisions superseding or extending the above** (read alongside, not instead of):
`docs/decisions/DEC-002-cloudflare-shared-project.md` (shared Cloudflare Pages topology) and
`docs/decisions/DEC-003-auth-implementation.md` (Supabase SDK client-side, raw fetch server-side).

## Related, not architecture

- `docs/governance/` — naming, coding, contribution, and repository-governance standards (how to
  build, not what to build)
- `docs/decisions/` — the Decision Log (why specific calls were made)
- `docs/research/` — the Research Library (evidence behind strategy calls)

## The one rule that ties all of this together

Every document above is subordinate to the Business Foundation and superior to any single coding
task. If a coding prompt ever conflicts with something here, this wins — and the conflict gets
flagged as a Structural change, never silently resolved either direction.
