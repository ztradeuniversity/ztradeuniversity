-- 026_growth_tasks.sql
-- AI CEO OS — Wave 3b, Growth
--
-- General M4 execution tasks that aren't a content item or a campaign
-- (e.g. an SEO fix, a distribution-channel setup step). Kept deliberately
-- generic rather than three near-duplicate per-workstream task tables.

create table public.growth_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text,
  task_type text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'blocked')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the default view is "what's not done yet."
create index growth_tasks_owner_status_idx
  on public.growth_tasks (owner_user_id, status);

alter table public.growth_tasks enable row level security;

create policy growth_tasks_owner_select
  on public.growth_tasks for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy growth_tasks_owner_insert
  on public.growth_tasks for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy growth_tasks_owner_update
  on public.growth_tasks for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — an abandoned task is `status =
-- 'blocked'` with a note, or left `done` with no further action.
