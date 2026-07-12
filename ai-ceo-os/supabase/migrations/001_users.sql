-- 001_users.sql
-- AI CEO OS — Wave 2, Core Spine
--
-- Profile extension of Supabase's own auth.users. Never duplicates auth fields
-- (email, password, verification status live in auth.users; this table only holds
-- app-specific profile data). One row per authenticated user.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- A user can read and update their own profile row. No policy grants access to
-- other users' rows here — admin-wide visibility is added in 002_roles.sql once
-- is_admin() exists, avoiding a forward reference to a function that doesn't
-- exist yet in this file.
create policy users_self_select
  on public.users for select
  using (auth.uid() = id);

create policy users_self_update
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No INSERT policy for authenticated/anon: rows are created only by the trigger
-- below, which runs as the table owner (security definer) in response to a real
-- Supabase Auth signup. No DELETE policy: profiles are never deleted directly:
-- if an auth user is ever removed, `on delete cascade` above removes the profile
-- as a side effect of that deliberate, separate action.

-- Justified use of a trigger (Database Engineering Constitution §3: last resort,
-- no simpler mechanism achieves the same guarantee). Without this, every future
-- signup path would need to remember to insert a matching profile row by hand —
-- fragile and easy to silently break. This is the standard Supabase pattern for
-- keeping a profile table in lockstep with auth.users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
