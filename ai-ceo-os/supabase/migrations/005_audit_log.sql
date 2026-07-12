-- 005_audit_log.sql
-- AI CEO OS — Wave 2, Core Spine
--
-- Append-only mutation and auth trail (Infrastructure & Operations Blueprint
-- §6): permanent, immutable, no exceptions. This is why it's built now, before
-- any feature exists — every login, denial, and future mutation is captured
-- from the very first real user action onward.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- The one justified index at this wave: audit review is always "recent
-- events first" (lazy-until-measured still applies — this is a named,
-- certain access pattern, not a speculative one).
create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_admin_select
  on public.audit_log for select
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated/anon roles at all — entries
-- are written exclusively by server-side code using the service_role key
-- (L2 application logic, which bypasses RLS by design for this one table).
-- No UPDATE or DELETE policy exists for ANY role, including admin: this table
-- is append-only, permanently, matching the immutable-ledger rule.
