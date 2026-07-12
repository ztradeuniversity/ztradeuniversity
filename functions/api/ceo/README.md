# functions/api/ceo/

Cloudflare Pages Functions for the private AI CEO Operating System, namespaced under the
existing ZTU repository's single required `functions/` root (Cloudflare Pages recognizes exactly
one `functions/` directory per project — this is a platform constraint, confirmed against the
existing `functions/api/*.js` files already deployed here).

**Rules:**
- Files here map to routes: `functions/api/ceo/foo.js` → `/api/ceo/foo`.
- **Thin routing only.** Validate the request, call into `ai-ceo-os/src/application/` (or
  `src/ai/`, `src/automation/`, `src/integration/`) for the real logic, return the response. No
  business logic lives here.
- **Never modify any existing file outside this `ceo/` subfolder** — `functions/api/admin-auth.js`
  and every other existing ZTU function are untouched by this project.
- Every environment variable these files read uses the `CEO_` prefix (see
  `ai-ceo-os/docs/governance/naming-standards.md`) to avoid colliding with ZTU's existing
  variables in the same project-wide variable pool.
- Authentication here is completely separate from `functions/utils/admin-session.js` — see
  `ai-ceo-os/docs/architecture/authentication-foundation.md`.

Empty until Wave 2 (auth) and Wave 4+ (per-module endpoints) — see
`ai-ceo-os/docs/architecture/implementation-roadmap.md` for the build order.

Full topology decision: `ai-ceo-os/docs/decisions/DEC-002-cloudflare-shared-project.md`.
