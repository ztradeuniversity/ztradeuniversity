-- 010_reviews.sql
-- AI CEO OS — Wave 2a, Accountability Spine
--
-- One table for every cadence of review (M7), typed by `cadence_type` (defined
-- in 008_goals.sql, reused here rather than duplicated) instead of four
-- near-identical tables — the explicit design decision recorded in the
-- Supabase Implementation Blueprint. Weekly/monthly/quarterly/annual reviews
-- share the same shape; a `daily` review is a valid value of the same enum
-- but this project's daily cadence lives in `daily_activities`, not here — the
-- type is shared for consistency, not because `reviews` is expected to use
-- every value.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  cadence public.cadence_type not null,
  period_start date not null,
  period_end date not null,
  summary text,
  wins text,
  gaps text,
  action_items text,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, cadence, period_start)
);

-- Certain access pattern: "latest review for this cadence" drives the
-- Reviews & Accountability module's default view.
create index reviews_owner_cadence_period_idx
  on public.reviews (owner_user_id, cadence, period_start desc);

alter table public.reviews enable row level security;

create policy reviews_owner_select
  on public.reviews for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy reviews_owner_insert
  on public.reviews for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy reviews_owner_update
  on public.reviews for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a review is a permanent record
-- for the Decision Log / Learning Engine to reference later.
