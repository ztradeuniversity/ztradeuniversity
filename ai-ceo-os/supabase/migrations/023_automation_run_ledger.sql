-- 023_automation_run_ledger.sql
-- AI CEO OS — Wave 3a, Automation
--
-- The append-only execution trail behind the Automation module's Job
-- History / Execution Status views (M6) — same immutable-ledger pattern as
-- `audit_log`: written only by server-side code via the service_role key,
-- never through an authenticated-user INSERT/UPDATE/DELETE policy.
-- `owner_user_id` is nullable (matching `audit_log.actor_user_id`) since a
-- scheduled system job may run without a specific human context.

create table public.automation_run_ledger (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automation_registry (id) on delete cascade,
  owner_user_id uuid references public.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'success', 'failure', 'skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  output jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

-- Certain access pattern: Job History is always "this automation's recent
-- runs, most recent first."
create index automation_run_ledger_automation_started_idx
  on public.automation_run_ledger (automation_id, started_at desc);

alter table public.automation_run_ledger enable row level security;

create policy automation_run_ledger_admin_select
  on public.automation_run_ledger for select
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for any authenticated role — entries are
-- written exclusively by the automation runner using the service_role key
-- (same reasoning as audit_log). Append-only, permanently.
