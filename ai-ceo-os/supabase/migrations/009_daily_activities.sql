-- 009_daily_activities.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- The Daily Loop's Core-block + rotating-Focus-item checklist (M7/Functional
-- Spec §"13-item menu"). `status` replaces a plain boolean so a skipped item
-- has a legitimate state that isn't a deleted row — no-hard-deletes applies
-- even to a one-day checklist entry, since the Learning Engine's burnout
-- signature (loop-overrun + skipped-shutdowns) reads history, not just today.

create table public.daily_activities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  activity_date date not null,
  activity_type text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Certain access pattern: "today's checklist" and "recent history" are the
-- only two ways this table is ever queried.
create index daily_activities_owner_date_idx
  on public.daily_activities (owner_user_id, activity_date desc);

alter table public.daily_activities enable row level security;

create policy daily_activities_owner_select
  on public.daily_activities for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy daily_activities_owner_insert
  on public.daily_activities for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy daily_activities_owner_update
  on public.daily_activities for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule).
