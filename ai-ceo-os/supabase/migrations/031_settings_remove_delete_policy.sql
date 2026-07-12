-- 031_settings_remove_delete_policy.sql
-- AI CEO OS — Corrective migration (Prompt 4, Step 4 audit finding)
--
-- 004_settings.sql (Wave 1, applied and live) shipped `settings_admin_delete`
-- — the one DELETE policy anywhere in migrations 001-030, predating the
-- no-hard-deletes rule being applied with zero exceptions from Wave 2a
-- onward. A deleted global setting/feature-flag row is a silent app-breaking
-- gap (code checking a flag that no longer exists), and nothing in this
-- project's design ever relies on hard-deleting a setting — flags are
-- toggled via UPDATE, never removed. Per the Database Engineering
-- Constitution §8, a correction is a new migration, never a rewrite of
-- 004_settings.sql itself (already applied to the real project).

drop policy if exists settings_admin_delete on public.settings;

-- No replacement policy — settings now has zero DELETE policy, consistent
-- with every table built from Wave 2a onward. A retired setting is handled
-- at the application layer (stop reading/writing that key), never a row
-- removal.
