-- 003_admin_allowlist.sql
-- AI CEO OS — Wave 2, Core Spine
--
-- The structural privacy gate (Technical Architecture §6): being authenticated
-- is necessary, never sufficient. An authenticated user must also appear here
-- before any protected Function grants access.

create table public.admin_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  added_at timestamptz not null default now(),
  added_by text
);

alter table public.admin_allowlist enable row level security;

create policy admin_allowlist_admin_select
  on public.admin_allowlist for select
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for any authenticated role, including admin.
-- This table is managed exclusively via the service_role key, by the founder,
-- directly in the Supabase dashboard/SQL editor — Human-only by design
-- (Founder Operating Rules: "You are the only writer of admin_allowlist — I
-- will never propose automating that row"). There is deliberately no code path,
-- anywhere in this system, that can write to this table.
