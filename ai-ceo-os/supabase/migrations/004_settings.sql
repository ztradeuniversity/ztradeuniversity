-- 004_settings.sql
-- AI CEO OS — Wave 2, Core Spine
--
-- The one designed home for runtime configuration and feature flags (Database
-- Engineering Constitution §5: configuration tables are never scattered per
-- module). A global setting has owner_user_id = null; a per-founder setting
-- (e.g. pinned modules) is scoped to that user. No ENUM type for `scope` —
-- a two-value CHECK constraint is simpler and easier to extend than a
-- dedicated Postgres enum for something this small (lazy-until-measured
-- applies to type choices too, not just indexes).

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global' check (scope in ('global', 'user')),
  owner_user_id uuid references public.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_scope_owner_check check (
    (scope = 'global' and owner_user_id is null) or
    (scope = 'user' and owner_user_id is not null)
  ),
  unique (scope, owner_user_id, key)
);

alter table public.settings enable row level security;

create policy settings_select
  on public.settings for select
  using (
    scope = 'global' or owner_user_id = auth.uid() or public.is_admin()
  );

-- Global settings (including every feature flag) are admin-write-only. A
-- founder can write their own user-scoped settings (e.g. pinned modules) —
-- this is what lets Wave 8's UI-preference features work without a schema
-- change later.
create policy settings_insert
  on public.settings for insert
  with check (
    public.is_admin() or (scope = 'user' and owner_user_id = auth.uid())
  );

create policy settings_update
  on public.settings for update
  using (
    public.is_admin() or (scope = 'user' and owner_user_id = auth.uid())
  )
  with check (
    public.is_admin() or (scope = 'user' and owner_user_id = auth.uid())
  );

create policy settings_admin_delete
  on public.settings for delete
  using (public.is_admin());

-- Required seed data (2C §7 rule) — every feature flag from
-- config/feature-flags.md, all default OFF, per the Module Gate mechanism.
insert into public.settings (scope, key, value) values
  ('global', 'core.maintenance-mode', 'false'),
  ('global', 'core.read-only-mode', 'false'),
  ('global', 'm1.kpi-center', 'false'),
  ('global', 'm2.trading-discipline', 'false'),
  ('global', 'm3.ib-client-engine', 'false'),
  ('global', 'm3.exness-api-sync', 'false'),
  ('global', 'm4.growth-engine', 'false'),
  ('global', 'm5.intelligence-center', 'false'),
  ('global', 'm6.automation-center', 'false'),
  ('global', 'm7.daily-loop', 'false'),
  ('global', 'm7.full-cadence', 'false'),
  ('global', 'l3.ai-mentor', 'false'),
  ('global', 'l7.ztu-readonly-adapter', 'false'),
  ('global', 'l7.whatsapp-channel', 'false'),
  ('global', 'l7.elevenlabs-dubbing', 'false');
