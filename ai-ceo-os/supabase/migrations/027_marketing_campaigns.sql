-- 027_marketing_campaigns.sql
-- AI CEO OS — Wave 3b, Growth
--
-- Tracks a marketing push across a channel (M4). `channel` stays free text
-- rather than an enum: the research verdicts (YouTube=core,
-- WhatsApp/Telegram=community, Facebook=organic, TikTok=caution/organic-only,
-- LinkedIn=reject) are strategic guidance, not a formally locked closed set
-- the way `verdict_type` or `client_lifecycle_stage` are — a new channel
-- verdict changing (as TikTok's already has once) shouldn't require a schema
-- migration.

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  channel text not null,
  campaign_type text,
  status text not null default 'planned' check (status in ('planned', 'active', 'paused', 'completed')),
  budget numeric,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certain access pattern: the Marketing Dashboard's default view is "active
-- campaigns by channel."
create index marketing_campaigns_owner_status_idx
  on public.marketing_campaigns (owner_user_id, status);

alter table public.marketing_campaigns enable row level security;

create policy marketing_campaigns_owner_select
  on public.marketing_campaigns for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy marketing_campaigns_owner_insert
  on public.marketing_campaigns for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

create policy marketing_campaigns_owner_update
  on public.marketing_campaigns for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- No DELETE policy (no-hard-deletes rule) — an ended campaign is `status =
-- 'completed'`, kept for ROI history ("Leads sourced" column in the Growth UI).
