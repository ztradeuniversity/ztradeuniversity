# functions/utils/ceo/

Shared utilities used only by the AI CEO OS's Cloudflare Functions (`functions/api/ceo/`).

**Never overwrite or modify any existing file in `functions/utils/` outside this `ceo/`
subfolder** — `admin-session.js`, `admin-store.js`, `ai-supabase.js`, and every other existing ZTU
utility are untouched by this project, per
`ai-ceo-os/docs/decisions/DEC-002-cloudflare-shared-project.md`.

If a utility here would duplicate something already in `functions/utils/` (e.g., a Supabase
client helper), it is still a **separate** file connecting to the **separate** OS Supabase project
— never a shared instance with ZTU's own client.

Empty until Wave 2+, and only if a genuine cross-endpoint need arises (not created speculatively,
per the project's anti-premature-abstraction rule).
