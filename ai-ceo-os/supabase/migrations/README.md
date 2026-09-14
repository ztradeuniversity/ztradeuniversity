# migrations

SQL migration files, sequential, one logical change per file. RLS ships in the same file as the
table it protects — no exceptions.

**Wave 2 (Core Spine) — applied, see `../WAVE-2-CHECKLIST.md`:**

- `001_users.sql` — profile table extending `auth.users`
- `002_roles.sql` — roles + user_roles + the `is_admin()` helper function
- `003_admin_allowlist.sql` — the structural privacy gate, Human-only writes
- `004_settings.sql` — runtime config + feature flags (15 seeded, all OFF)
- `005_audit_log.sql` — append-only mutation trail

**Wave 2a (Accountability Spine) — written, not yet applied, see `../WAVE-2A-CHECKLIST.md`:**

- `006_kpi_definitions.sql` — KPI catalog (M1), admin-managed, no owner scoping
- `007_kpi_history.sql` — per-founder KPI time series
- `008_goals.sql` — `cadence_type` enum + goals (M7)
- `009_daily_activities.sql` — Daily Loop checklist (M7)
- `010_reviews.sql` — one table, all cadences (M7), reuses `cadence_type`
- `011_trading_rules.sql` — trading discipline rule set (M2), owner-scoped
- `012_trading_records.sql` — the OS's own trading journal (M2), system-of-record
- `013_rule_violations.sql` — links `trading_records` to `trading_rules`

Every table in this wave carries `owner_user_id` except `kpi_definitions` (a business-wide catalog,
like `roles`) — matches the Technical Architecture's "user_id + role on all records day one"
scalability rule. Zero DELETE policies anywhere in this wave (no-hard-deletes rule, zero exceptions).

**Wave 2b (Relationship & Memory) — written, not yet applied, see `../WAVE-2B-CHECKLIST.md`:**

- `014_ib_clients.sql` — `client_lifecycle_stage` enum + master client record (M3), matches the
  Wave 4 UI kanban exactly
- `015_lead_pipeline.sql` — stage-transition history for `ib_clients`
- `016_client_touches.sql` — interaction log
- `017_decision_log.sql` — Decision Engine output records (M5)
- `018_research_library.sql` — `verdict_type` enum + research findings (M5)
- `019_knowledge_base.sql` — durable operational knowledge (M5)
- `020_risk_register.sql` — living risk register (M5)

All seven carry `owner_user_id`. Zero DELETE policies (no-hard-deletes rule, unchanged from every
prior wave).

**Migrations 021-030 (Mentor Memory / Automation / Growth / Cross-cutting / Future stub) — written,
not yet applied, see `../WAVE-2C-3-CHECKLIST.md`:**

- `021_coaching_memory.sql` — service-role-only, zero policies (not even admin-select)
- `022_automation_registry.sql` — `automation_matrix_class` enum, admin catalog
- `023_automation_run_ledger.sql` — append-only, admin-select-only
- `024_approval_queue.sql` — the Automation Line enforcement point
- `025_content_library.sql` — `content_status` enum, matches the Wave 4 UI kanban
- `026_growth_tasks.sql`
- `027_marketing_campaigns.sql`
- `028_notifications.sql` — `notification_class` enum, matches the Settings UI's 5-class text
- `029_prompt_archive.sql` — pointer index, no content duplication
- `030_external_id_map.sql` — structurally complete, inert until the D1 broker-API gate clears

This closes the entire `001`-`030` schema batch from the Database Blueprint.

**`031_settings_remove_delete_policy.sql`** — corrective migration (Prompt 4, Step 4 audit
finding): drops `settings_admin_delete`, the one DELETE policy that existed anywhere in
`001`-`030` (a Wave 1 leftover predating the no-hard-deletes rule's zero-exception enforcement).
No other migration was modified — per the Database Engineering Constitution, a correction is
always a new migration, never a rewrite of an applied one.

**`036_content_library_scheduled_date.sql`** — Social Engagement Poll Planning: adds one nullable
`scheduled_date date` column (+ index) to `content_library`. Polls are `content_library` rows
(`content_type = 'poll'`) like any other content idea — this was the one genuine gap (a kanban has
no due/calendar date). Additive and backward-compatible: every existing video/article row is
unaffected, RLS is unchanged (policies are per-row, already covering the new column).

Nothing further is scheduled until a genuinely new requirement is approved.
