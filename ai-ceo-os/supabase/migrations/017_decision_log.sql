-- 017_decision_log.sql
-- AI CEO OS — Wave 2b, Relationship & Memory
--
-- The Decision Engine's output record (M5), per the Intelligence & Decision
-- Engine Blueprint's 9-step pipeline. `action_class` and `confidence` use
-- CHECK constraints against value sets that ARE explicitly locked in that
-- blueprint (six action classes; high/medium/low confidence, the same scale
-- used throughout this project's research discipline) — unlike
-- `kpi_definitions.category` in Wave 2a, these literal values are confirmed,
-- not guessed, so a CHECK/enum here doesn't risk locking in the wrong thing.
--
-- No polymorphic foreign key: `linked_entity_type`/`linked_entity_id` are
-- plain text/uuid, deliberately without a real FK constraint, because a
-- decision can reference a goal, a client, a research entry, or nothing at
-- all — a single real FK can't point at four different tables, and adding
-- four nullable FK columns for a "maybe" reference would be speculative
-- schema this wave doesn't need yet.

create table public.decision_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  context text,
  decision text not null,
  rationale text,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  action_class text not null check (
    action_class in ('act_now', 'sequence', 'automate', 'delegate', 'postpone', 'eliminate')
  ),
  status text not null default 'open' check (status in ('open', 'closed', 'superseded')),
  linked_entity_type text,
  linked_entity_id uuid,
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: "open decisions" is the standard Intelligence
-- Center view; closed/superseded decisions are looked up by search, not
-- listed by default.
create index decision_log_owner_status_idx
  on public.decision_log (owner_user_id, status);

alter table public.decision_log enable row level security;

create policy decision_log_owner_select
  on public.decision_log for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy decision_log_owner_insert
  on public.decision_log for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy decision_log_owner_update
  on public.decision_log for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — the Decision Log record format
-- is "traceable, reopened only by new evidence"; a reversed decision is
-- `status = 'superseded'` plus a new row, never a removal.
