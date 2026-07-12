# src/application/auth/

L2 business logic for authentication and authorization. Empty until Wave 2.

Will hold: session validation helpers, allowlist-check logic, role-check logic — all called from
`functions/api/ceo/` routing entrypoints (the shared repo's single Functions root, namespaced
under `ceo/` — see `docs/decisions/DEC-002-cloudflare-shared-project.md`), never containing
routing itself. This code is completely separate from the existing ZTU admin auth system
(`functions/utils/admin-session.js`) — no shared imports, no shared session cookie. See
`docs/architecture/authentication-foundation.md` for the full flow this implements.
