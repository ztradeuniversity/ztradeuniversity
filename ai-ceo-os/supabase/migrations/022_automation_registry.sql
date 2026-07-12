-- 022_automation_registry.sql
-- AI CEO OS — Wave 3a, Automation
--
-- The catalog of defined automations (M6) — global and admin-managed, like
-- `kpi_definitions` and `roles`, not owner-scoped: an automation belongs to
-- the business, not to whoever registered it. `matrix_class` is a real enum
-- because its four values are directly confirmed by the already-built Wave 4
-- Automation module UI ("Every entry carries a Matrix-3 classification: Full
-- / AI-assisted / Human-approval / Human-only, Technical Architecture §7") —
-- not guessed, so encoding it now doesn't risk the mistake Wave 2a's
-- `kpi_definitions.category` avoided by staying free text.

create type public.automation_matrix_class as enum ('full', 'ai_assisted', 'human_approval', 'human_only');

create table public.automation_registry (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  module text,
  matrix_class public.automation_matrix_class not null,
  trigger_type text not null default 'manual' check (trigger_type in ('cron', 'event', 'manual')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_registry enable row level security;

create policy automation_registry_admin_select
  on public.automation_registry for select
  using (public.is_admin());

create policy automation_registry_admin_insert
  on public.automation_registry for insert
  with check (public.is_admin());

create policy automation_registry_admin_update
  on public.automation_registry for update
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a retired automation is
-- `is_active = false`; `automation_run_ledger` may still reference it.
