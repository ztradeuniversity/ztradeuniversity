-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — SIGNAL HISTORY & PERFORMANCE TRACKER
-- Additive migration only. Creates ONE new table for the public signal
-- transparency tracker. It does NOT touch any existing table, column,
-- policy, RLS, or auth flow. (Journal / AI / Library / Mentor are untouched.)
--
-- Lives in the AI / "ZTU Chatbot" Supabase project — the SAME project that
-- already holds ai_articles (env: AI_SUPABASE_URL / AI_SUPABASE_SERVICE_KEY).
-- Public reads go through the server API (service key, server-side only);
-- the explicit anon SELECT policy below is defensive so the table is never
-- left open for writes while still allowing published rows to be read.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ──────────────────────────────────────────────────────────────────────
-- signal_history — one row per published ZTU signal + its real result.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.signal_history (
  id             uuid primary key default gen_random_uuid(),
  signal_date    date not null,
  market         text not null,                         -- XAUUSD, BTCUSD, ...
  signal_type    text not null check (signal_type in ('BUY','SELL')),
  entry_price    numeric,
  stop_loss      numeric,
  take_profit    numeric,
  status         text not null default 'Running'
                   check (status in ('Win','Loss','Breakeven','Running')),
  result_summary text,
  mentor_notes   text,
  is_published   boolean not null default true,         -- admin draft/publish toggle
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_signal_history_date
  on public.signal_history(signal_date desc);
create index if not exists idx_signal_history_pub
  on public.signal_history(is_published, signal_date desc);

drop trigger if exists trg_signal_history_updated_at on public.signal_history;
create trigger trg_signal_history_updated_at before update on public.signal_history
  for each row execute function public.set_updated_at();

-- ── RLS: published rows are publicly readable; NO public writes ──
alter table public.signal_history enable row level security;

drop policy if exists "signal_history_select_published" on public.signal_history;
create policy "signal_history_select_published" on public.signal_history
  for select using (is_published = true);
-- (no insert/update/delete policy → all writes go through the service-role
--  admin API, which bypasses RLS. Anon/auth users can never write.)

-- ════════════════════════════════════════════════════════════════════════
-- SELF-CHECK:
--   select relname, relrowsecurity from pg_class where relname = 'signal_history';  -- true
--   select policyname, cmd from pg_policies where tablename = 'signal_history';
-- OPTIONAL seed (delete after testing):
--   insert into public.signal_history
--     (signal_date, market, signal_type, entry_price, stop_loss, take_profit, status, result_summary)
--   values
--     ('2026-06-10','XAUUSD','BUY', 2310.0, 2298.0, 2346.0, 'Win',  'TP hit, +3R clean trend continuation.'),
--     ('2026-06-12','BTCUSD','SELL', 69000, 70200, 65400, 'Loss', 'SL hit on news spike.'),
--     ('2026-06-18','XAUUSD','BUY', 2330.0, 2322.0, 2354.0, 'Running', 'In progress, partial at 1R.');
-- ════════════════════════════════════════════════════════════════════════
