-- 029_prompt_archive.sql
-- AI CEO OS — Cross-cutting
--
-- Indexes `docs/prompts/` files (M5 Intelligence Center's Prompt Library
-- view) — a pointer table, not a content store: `file_path` references the
-- real markdown file on disk, per the Database Blueprint's explicit note
-- that this table "doesn't duplicate text." Keeps the archive searchable
-- without a second copy of every prompt's full content drifting out of sync
-- with the actual file.

create table public.prompt_archive (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  phase text not null,
  step text,
  title text not null,
  file_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Prompt Library browses in phase order.
create index prompt_archive_owner_phase_idx
  on public.prompt_archive (owner_user_id, phase);

alter table public.prompt_archive enable row level security;

create policy prompt_archive_owner_select
  on public.prompt_archive for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy prompt_archive_owner_insert
  on public.prompt_archive for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy prompt_archive_owner_update
  on public.prompt_archive for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — the archive index is permanent,
-- matching the underlying files' own append-only history.
