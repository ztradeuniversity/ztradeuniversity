-- 007_kpi_history.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- Time-series values behind every KPI card (M1). Carries owner_user_id even
-- though today there is exactly one founder — Technical Architecture §8's
-- scalability rule ("user_id + role on all records day one") applies to every
-- personal/operational record table in this wave, so a future second trader's
-- metrics are a new row, never a schema change.
--
-- `source` uses a CHECK constraint, not an enum, matching the `settings.scope`
-- precedent from Wave 2 (004_settings.sql): a stable two-value set doesn't earn
-- a dedicated Postgres type. `automated` rows are written by scheduled L4 jobs
-- via the service_role key (bypasses RLS by design, same as audit_log inserts).

create table public.kpi_history (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  kpi_id uuid not null references public.kpi_definitions (id) on delete cascade,
  recorded_for date not null,
  value numeric not null,
  source text not null default 'manual' check (source in ('manual', 'automated')),
  notes text,
  created_at timestamptz not null default now(),
  unique (owner_user_id, kpi_id, recorded_for, source)
);

-- The one justified index: KPI cards always chart "this metric, most recent
-- period first" — a named, certain access pattern, not a speculative one.
create index kpi_history_owner_kpi_recorded_idx
  on public.kpi_history (owner_user_id, kpi_id, recorded_for desc);

alter table public.kpi_history enable row level security;

create policy kpi_history_owner_select
  on public.kpi_history for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy kpi_history_owner_insert
  on public.kpi_history for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

-- UPDATE allowed (not DELETE): correcting a mis-entered manual value is a
-- legitimate edit of that day's fact, not a new fact — matches how `users`
-- and `settings` handle correction via UPDATE rather than delete-and-reinsert.
create policy kpi_history_owner_update
  on public.kpi_history for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy for any role (no-hard-deletes rule) — this is the ledger
-- KPI trend lines are drawn from.
