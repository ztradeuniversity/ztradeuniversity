-- 021_coaching_memory.sql
-- AI CEO OS — Wave 2c, Mentor Memory
--
-- The L3 AI Mentor's own memory store — service-role-only, by design (Database
-- Blueprint §"Mentor Memory (2c)"). Unlike every other table so far, this one
-- gets RLS enabled with ZERO policies: not even an admin-select policy. RLS
-- enabled + no policies = deny-all for the `anon`/`authenticated` roles; only
-- `service_role` (which bypasses RLS entirely) can read or write it. The
-- Mentor engine runs server-side under that key — the founder never queries
-- this table directly through the normal app client, even as admin.
--
-- `value` is jsonb (same flexible-payload pattern as `settings.value`) since
-- memory entries vary in shape (a preference, a recalled pattern, a
-- relationship fact). `memory_type` stays free text — the 10 L5 memory
-- domains were named conceptually in the Technical Architecture but never
-- transcribed to a literal fixed list on disk, so this follows the same
-- caution as `kpi_definitions.category` in Wave 2a rather than guessing.

create table public.coaching_memory (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  memory_type text not null,
  key text not null,
  value jsonb not null,
  confidence text check (confidence in ('high', 'medium', 'low')),
  last_reinforced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, memory_type, key)
);

alter table public.coaching_memory enable row level security;

-- No policies at all, for any role or operation — this is the whole point
-- of "service-role-only." Do not add an admin-select policy here later
-- without re-checking the Mentor Memory design decision first.
