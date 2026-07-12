-- 014_ib_clients.sql
-- AI CEO OS — Wave 2b, Relationship & Memory
--
-- The master client relationship record (M3 IB Client Engine). Introduces
-- `client_lifecycle_stage` — already committed to on disk by the Wave 4 UI
-- (src/presentation/clients/index.html's Status Workflow kanban), so this
-- migration's job is to match that UI exactly, not design a new taxonomy:
-- the seven columns already built are Lead, Qualified, Onboarding, Activated,
-- Engaged, At Risk, Retained.
--
-- owner_user_id follows the same personal-record pattern as Wave 2a (not the
-- kpi_definitions catalog exception) — a client relationship belongs to
-- whichever team member owns it, per the Technical Architecture's day-one
-- scalability rule.

create type public.client_lifecycle_stage as enum (
  'lead', 'qualified', 'onboarding', 'activated', 'engaged', 'at_risk', 'retained'
);

create table public.ib_clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  full_name text not null,
  contact_email text,
  contact_phone text,
  broker text,
  broker_account_id text,
  stage public.client_lifecycle_stage not null default 'lead',
  equity_band text,
  referral_source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Status Workflow kanban groups clients by stage.
create index ib_clients_owner_stage_idx
  on public.ib_clients (owner_user_id, stage);

alter table public.ib_clients enable row level security;

create policy ib_clients_owner_select
  on public.ib_clients for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy ib_clients_owner_insert
  on public.ib_clients for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy ib_clients_owner_update
  on public.ib_clients for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a lost/churned relationship is
-- `stage = 'at_risk'` or a dormant `retained` row, never a row removal;
-- `lead_pipeline` and `client_touches` both hold history that references this row.
