# seed

Required seed data definitions only. Never demo or test data — see governance rules.

**Empty by design, not by omission.** Wave 2's seed data (the `admin` role, the 15 feature flags)
is written directly inside the migration that creates its table (`002_roles.sql`,
`004_settings.sql`) rather than as separate files here — seed data changes follow the same
migration discipline as schema changes (Supabase Implementation Blueprint §7), so keeping it
inline with its table's creation is the simpler, equally-correct choice. This folder stays
reserved for the rare case of seed data large or reusable enough to warrant its own file.
