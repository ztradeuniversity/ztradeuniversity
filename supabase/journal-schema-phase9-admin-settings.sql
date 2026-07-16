-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL — PHASE 9 (ADDITIVE MIGRATION)
-- Admin Mentor Mode (Manual Mentor vs AI Mentor) — singleton settings row
--
-- Read/written ONLY server-side via the service-role key
-- (functions/api/journal-admin.js get-mentor-mode/set-mentor-mode,
-- functions/api/journal-analyze.js reads it to decide whether to
-- auto-create an AI Mentor review). No browser RLS access needed or
-- granted — this is an admin-only control.
--
-- 100% ADDITIVE + IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.journal_admin_settings (
  id          smallint primary key default 1 check (id = 1),  -- singleton row
  mentor_mode text not null default 'MANUAL' check (mentor_mode in ('MANUAL','AI')),
  updated_at  timestamptz not null default now()
);

insert into public.journal_admin_settings (id, mentor_mode)
values (1, 'MANUAL')
on conflict (id) do nothing;

drop trigger if exists trg_journal_admin_settings_updated_at on public.journal_admin_settings;
create trigger trg_journal_admin_settings_updated_at
  before update on public.journal_admin_settings
  for each row execute function public.set_updated_at();

-- RLS enabled with NO policies = zero browser access (service role bypasses
-- RLS entirely, which is the only way this table is ever read or written).
alter table public.journal_admin_settings enable row level security;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if needed):
--   drop trigger if exists trg_journal_admin_settings_updated_at on public.journal_admin_settings;
--   drop table if exists public.journal_admin_settings;
-- ════════════════════════════════════════════════════════════════════════
