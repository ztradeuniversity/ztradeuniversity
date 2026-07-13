-- 032_institutes.sql
-- AI CEO OS — Physical IB Expansion patch (post-Step-5)
--
-- THE ONE migration this patch adds, per the schema-freeze rule ("no schema
-- changes without a failed impact review", decision seeded in seed-01).
-- IMPACT REVIEW (failed — hence this table):
--   * ib_clients cannot hold institutes: it is a PERSON pipeline whose stage
--     enum (client_lifecycle_stage) is frozen and semantically wrong for an
--     organization sales pipeline (cold contact → proposal → meeting →
--     negotiation → accepted → classes running → batch complete).
--   * knowledge_base cannot hold them: no queryable date columns — "which
--     institutes have a follow-up due today" and "which batch ends this
--     week" are the two core daily queries of this feature.
--   * growth_tasks cannot: no entity identity, no stage, no area grouping.
-- One table only. Stage transitions are recorded in `notes` + updated_at for
-- v1; a dedicated history table is deferred until real usage proves the need
-- (lazy-until-measured). Stage is a CHECK constraint, not an enum — this
-- pipeline is brand-new and untested in the field, so the value set may be
-- corrected after the first real cycle (settings.scope precedent).

create table public.institutes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  institute_type text,          -- e.g. computer academy / freelancing academy / AI institute / skill center
  city text not null,
  area text not null,           -- e.g. Johar Town — matches the 15-day area queue entries
  contact_name text,
  contact_phone text,
  stage text not null default 'cold_contact' check (stage in (
    'cold_contact', 'proposal_sent', 'meeting', 'negotiation',
    'accepted', 'rejected', 'classes_running', 'batch_complete', 'follow_up_later'
  )),
  next_follow_up date,
  batch_end_date date,
  students_registered integer,  -- headcount from a running/finished batch; null until known
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access patterns: "everything in the current area" and "follow-ups
-- due" are the two ways this table is read every day.
create index institutes_owner_area_idx
  on public.institutes (owner_user_id, city, area);
create index institutes_owner_followup_idx
  on public.institutes (owner_user_id, next_follow_up);

alter table public.institutes enable row level security;

create policy institutes_owner_select
  on public.institutes for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy institutes_owner_insert
  on public.institutes for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy institutes_owner_update
  on public.institutes for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — a rejected institute is
-- stage='rejected' and stays on record: "never repeat an area unless
-- scheduled" only works if past contacts stay queryable forever.
