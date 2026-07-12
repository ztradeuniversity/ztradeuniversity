-- 019_knowledge_base.sql
-- AI CEO OS — Wave 2b, Relationship & Memory
--
-- The L5 Knowledge/Memory layer's durable-fact store (M5) — distinct from
-- `research_library` (a dated finding with a verdict) and from ZTU's own
-- public-facing knowledge graph (a separate system, integrated read-only
-- elsewhere): this table holds the OS's own operational knowledge —
-- conclusions, patterns, and reusable facts the founder or the AI Mentor
-- has confirmed, referenced going forward without re-deriving them each
-- time. `research_id` is an optional link back to the finding that produced
-- an entry, not a requirement — some knowledge comes from lived experience,
-- not a formal research pass.

create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  category text not null,
  title text not null,
  content text not null,
  source_type text not null default 'experience' check (source_type in ('research', 'experience', 'external')),
  research_id uuid references public.research_library (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Knowledge Library's default view browses by
-- category.
create index knowledge_base_owner_category_idx
  on public.knowledge_base (owner_user_id, category);

alter table public.knowledge_base enable row level security;

create policy knowledge_base_owner_select
  on public.knowledge_base for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy knowledge_base_owner_insert
  on public.knowledge_base for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy knowledge_base_owner_update
  on public.knowledge_base for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — outdated knowledge is
-- `is_active = false`, kept for the Learning Engine's history rather than
-- erased.
