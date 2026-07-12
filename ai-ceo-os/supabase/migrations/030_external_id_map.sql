-- 030_external_id_map.sql
-- AI CEO OS — Future stub (gated)
--
-- The Database Blueprint stages this table empty until D1 (broker-API
-- research) activates it — Exness partner-portal API access is still an
-- outstanding founder verification item (docs/founder-checklist.md).
-- Creating the table now (structurally complete, functionally inert) matches
-- this project's lazy-provisioning pattern elsewhere (storage buckets,
-- Realtime): the shape is ready, nothing writes to it until that gate clears.
-- No feature flag is added for it in this migration — flag catalog changes
-- are out of this step's scope, and `l7.ztu-readonly-adapter` already exists
-- as the nearest related flag for when that work actually begins.

create table public.external_id_map (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  external_system text not null,
  external_id text not null,
  internal_entity_type text not null,
  internal_entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (external_system, external_id)
);

alter table public.external_id_map enable row level security;

create policy external_id_map_owner_select
  on public.external_id_map for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy external_id_map_owner_insert
  on public.external_id_map for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy external_id_map_owner_update
  on public.external_id_map for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule). No index beyond the unique
-- constraint's implicit one and the primary key — no certain access pattern
-- exists yet for a table with zero real rows.
