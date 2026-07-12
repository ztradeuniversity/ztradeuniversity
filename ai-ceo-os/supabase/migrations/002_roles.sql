-- 002_roles.sql
-- AI CEO OS — Wave 2, Core Spine
--
-- Role catalog + assignment join table, built as one migration because a roles
-- system has no meaning without its assignment mechanism (Database Engineering
-- Constitution §5: default to the simplest structure that's honest about the
-- relationship). Only one role exists today (admin); the schema supports more
-- from day one so a future team member is a new row, never a schema change.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;

-- Required seed data (2C §7 rule: minimal system scaffolding, never demo data).
-- The only role this system uses at launch.
insert into public.roles (name) values ('admin');

-- SECURITY DEFINER helper — the one deliberate exception to "avoid functions"
-- (Database Engineering Constitution §3/§13 Decision Rule 4: last resort, no
-- simpler mechanism exists). RLS policies on user_roles cannot query user_roles
-- itself to check admin status without infinite recursion; this function runs
-- with elevated privilege for exactly that one narrow check, nothing else.
create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = check_user_id and r.name = 'admin'
  );
$$;

create policy roles_admin_select
  on public.roles for select
  using (public.is_admin());

create policy user_roles_self_select
  on public.user_roles for select
  using (user_id = auth.uid() or public.is_admin());

-- No INSERT/UPDATE/DELETE policy on roles or user_roles for authenticated/anon.
-- Role assignment is a Human-only action performed directly via the
-- service_role key (Supabase SQL editor), never exposed through the app API —
-- matching the Founder Onboarding checklist in authentication-foundation.md.

-- Now that is_admin() exists, grant admin-wide read visibility on users
-- (001_users.sql intentionally left this out — is_admin() didn't exist yet
-- when that file ran).
create policy users_admin_select
  on public.users for select
  using (public.is_admin());
