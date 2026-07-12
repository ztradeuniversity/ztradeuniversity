-- 015_lead_pipeline.sql
-- AI CEO OS — Wave 2b, Relationship & Memory
--
-- The funnel: a stage-transition history for `ib_clients`, not a duplicate of
-- it. `ib_clients.stage` already holds the CURRENT stage — recording every
-- transition here (rather than adding a second mutable "current stage" copy)
-- is what makes conversion-time-per-stage and drop-off analysis possible
-- later without redesigning either table. `from_stage` is nullable for the
-- first row of a client's history (their initial entry into the pipeline).

create table public.lead_pipeline (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  ib_client_id uuid not null references public.ib_clients (id) on delete cascade,
  from_stage public.client_lifecycle_stage,
  to_stage public.client_lifecycle_stage not null,
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

-- Certain access pattern: a client's full stage history, chronological.
create index lead_pipeline_owner_client_occurred_idx
  on public.lead_pipeline (owner_user_id, ib_client_id, occurred_at desc);

alter table public.lead_pipeline enable row level security;

create policy lead_pipeline_owner_select
  on public.lead_pipeline for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy lead_pipeline_owner_insert
  on public.lead_pipeline for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No UPDATE, no DELETE — a transition record is a historical fact once
-- written (same immutable-ledger reasoning as audit_log); a wrong entry is
-- corrected by writing a new transition row, not editing history.
