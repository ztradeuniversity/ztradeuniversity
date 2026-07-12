-- 006_kpi_definitions.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- The KPI catalog (M1 Command Center). A metric describes the business, not any
-- one person, so — unlike the personal-record tables that follow in this wave —
-- this table has no owner_user_id and is managed like `roles`: a small global
-- catalog, admin-write-only.
--
-- No `category` enum: the Master Output Framework (2C) locked 11 KPI categories
-- during Prompt 0, but the literal category strings were never captured on disk
-- (database-blueprint.md is a pointer doc; the full spec lived only in that
-- chat transcript). Inventing a fixed enum from memory would risk locking in
-- wrong values — the same mistake the original `001_enums.sql` front-loading
-- plan made and was corrected for. `category` stays free text until the
-- authoritative 11-name list is transcribed into a doc; whoever adds it can
-- convert this column to an enum in a later migration without data loss.

create table public.kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  category text not null,
  unit text not null,
  target_direction text not null check (target_direction in ('higher_is_better', 'lower_is_better')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kpi_definitions enable row level security;

create policy kpi_definitions_admin_select
  on public.kpi_definitions for select
  using (public.is_admin());

create policy kpi_definitions_admin_insert
  on public.kpi_definitions for insert
  with check (public.is_admin());

create policy kpi_definitions_admin_update
  on public.kpi_definitions for update
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy for any role (no-hard-deletes rule). Retiring a metric is
-- `is_active = false`, never a row removal — `kpi_history` may still reference it.
