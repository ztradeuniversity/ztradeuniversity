-- 016_client_touches.sql
-- AI CEO OS — Wave 2b, Relationship & Memory
--
-- The interaction log (M3): every call/message/meeting with a client,
-- independent of stage changes (that's `lead_pipeline`). Drives the
-- Directory's "Last touch" column (`max(occurred_at)` per client).
-- `touch_type` is a CHECK, not an enum — a small, stable set, matching the
-- `settings.scope` / `kpi_history.source` precedent from Wave 2/2a.

create table public.client_touches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  ib_client_id uuid not null references public.ib_clients (id) on delete cascade,
  touch_type text not null default 'note' check (touch_type in ('call', 'message', 'meeting', 'email', 'note')),
  summary text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Certain access pattern: "this client's touch history, most recent first"
-- — the same query drives both the detail view and the Directory's
-- last-touch column.
create index client_touches_owner_client_occurred_idx
  on public.client_touches (owner_user_id, ib_client_id, occurred_at desc);

alter table public.client_touches enable row level security;

create policy client_touches_owner_select
  on public.client_touches for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy client_touches_owner_insert
  on public.client_touches for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy client_touches_owner_update
  on public.client_touches for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a mis-logged touch is corrected
-- via UPDATE, never removed.
