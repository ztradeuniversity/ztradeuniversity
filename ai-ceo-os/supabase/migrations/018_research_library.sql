-- 018_research_library.sql
-- AI CEO OS — Wave 2b, Relationship & Memory
--
-- Indexes research findings (M5), per the Research Governance Document's
-- 5-verdict taxonomy and evidence-tier discipline. `verdict_type` is a real
-- enum (not a CHECK) because — unlike KPI categories — its five values were
-- explicitly locked in Prompt 0 and are named consistently everywhere in
-- this project's research output: ADOPT, TRIAL, DEFER, REJECT, UNKNOWN.
-- `evidence_tier` stays a CHECK against T1-T6, the same tier labels used
-- throughout the project's live research (broker docs, regulator registers,
-- search-demand signals, competitor analysis, etc.) — a small closed set,
-- not worth a dedicated type per the `settings.scope` precedent.

create type public.verdict_type as enum ('adopt', 'trial', 'defer', 'reject', 'unknown');

create table public.research_library (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  domain text not null,
  verdict public.verdict_type not null default 'unknown',
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  evidence_tier text check (evidence_tier in ('t1', 't2', 't3', 't4', 't5', 't6')),
  summary text,
  source_url text,
  reviewed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Research Center's default view filters by
-- verdict (e.g. "everything currently ADOPT").
create index research_library_owner_verdict_idx
  on public.research_library (owner_user_id, verdict);

alter table public.research_library enable row level security;

create policy research_library_owner_select
  on public.research_library for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy research_library_owner_insert
  on public.research_library for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy research_library_owner_update
  on public.research_library for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — the Knowledge Base's
-- failed-experiments rule ("never repeat without new evidence") only works
-- if a REJECTed finding stays on record permanently.
