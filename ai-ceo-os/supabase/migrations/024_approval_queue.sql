-- 024_approval_queue.sql
-- AI CEO OS — Wave 3a, Automation
--
-- The structural Automation-Line enforcement point (M6) — the Wave 4 UI
-- already states it plainly: "no code path skips it for client-facing
-- output." `automation_id` is nullable because not every approval item
-- originates from a registered automation (a founder-drafted outreach
-- message can queue here too). `payload` is jsonb — the draft content itself
-- varies by `item_type`, so one flexible column instead of speculative
-- per-type columns this wave doesn't have evidence to design yet.

create table public.approval_queue (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  automation_id uuid references public.automation_registry (id) on delete set null,
  item_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Certain access pattern: the Queue Monitor tab is always "pending items."
create index approval_queue_owner_status_idx
  on public.approval_queue (owner_user_id, status);

alter table public.approval_queue enable row level security;

create policy approval_queue_owner_select
  on public.approval_queue for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy approval_queue_owner_insert
  on public.approval_queue for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

-- UPDATE is the approval action itself (pending -> approved/rejected,
-- setting reviewed_by/reviewed_at) — not a correction, the actual mechanism
-- this table exists for.
create policy approval_queue_owner_update
  on public.approval_queue for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a rejected item is `status =
-- 'rejected'`, kept as a permanent record of what the Automation Line blocked.
