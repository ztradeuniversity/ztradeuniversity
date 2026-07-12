-- 025_content_library.sql
-- AI CEO OS — Wave 3b, Growth
--
-- The M4 Growth Engine's content pipeline table. `status` values were taken
-- directly from the already-built Wave 4 UI kanban
-- (src/presentation/growth/index.html): Idea, Production, Published,
-- Evergreen, Retired — schema matches the UI that already committed to this
-- taxonomy, same discipline as `client_lifecycle_stage` in Wave 2b. The
-- Prompt 3 300-topic content framework reuses this same table at
-- `status = 'idea'`, exactly as that UI's own caption already states — no
-- separate topics table.

create type public.content_status as enum ('idea', 'production', 'published', 'evergreen', 'retired');

create table public.content_library (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  pillar text,
  content_type text,
  status public.content_status not null default 'idea',
  target_audience text,
  published_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Content kanban groups everything by status.
create index content_library_owner_status_idx
  on public.content_library (owner_user_id, status);

alter table public.content_library enable row level security;

create policy content_library_owner_select
  on public.content_library for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy content_library_owner_insert
  on public.content_library for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy content_library_owner_update
  on public.content_library for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a dropped idea is `status =
-- 'retired'`, not a row removal; the OS never auto-publishes to the live
-- ZTU site regardless of status (unchanged from the Integration Blueprint).
