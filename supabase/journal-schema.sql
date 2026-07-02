-- ════════════════════════════════════════════════════════════════════════
-- Z TRADE UNIVERSITY — TRADING JOURNAL
-- Dedicated Supabase project schema ("ZTU Journal")
--
-- Run this ENTIRE file once in your new Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- This project must be SEPARATE from the AI / Library / Automation /
-- EA Supabase projects already used elsewhere on this site.
--
-- Auth: uses Supabase's built-in `auth.users` (email + password).
-- public.users is a profile table that mirrors auth.users 1:1 so the
-- app has a normal "users" table to query/join against, exactly as
-- required by spec, without duplicating password handling.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────
-- 1. users  (profile row, 1:1 with auth.users)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-create a public.users row whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ──────────────────────────────────────────────────────────────────────
-- generic updated_at trigger (reused by every table below)
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 2. journal_trades
--    User enters only: pair, direction, entry, stop_loss, take_profit,
--    pnl (realised profit/loss), trade_reason.
--    Everything else (trade_id, timestamp, date, status, rr_ratio) is
--    AUTO-GENERATED — never entered manually.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.journal_trades (
  id          uuid primary key default gen_random_uuid(),
  trade_seq   bigint generated always as identity,
  trade_id    text unique,                          -- auto: 'ZTU-000123'
  user_id     uuid not null references public.users(id) on delete cascade,

  -- user-entered fields
  pair         text not null,
  direction    text not null check (direction in ('BUY','SELL')),
  entry_price  numeric(18,6) not null check (entry_price > 0),
  stop_loss    numeric(18,6) not null check (stop_loss > 0),
  take_profit  numeric(18,6) check (take_profit is null or take_profit > 0),
  pnl          numeric(18,2) not null default 0,     -- realised $ result
  trade_reason text,

  -- auto-generated fields (never written by the client)
  status     text generated always as (
               case when pnl > 0 then 'WIN'
                    when pnl < 0 then 'LOSS'
                    else 'BREAKEVEN' end
             ) stored,
  rr_ratio   numeric(10,4) generated always as (
               case when abs(entry_price - stop_loss) = 0 or take_profit is null then null
                    else round(abs(take_profit - entry_price) / abs(entry_price - stop_loss), 4)
               end
             ) stored,
  trade_date date generated always as (created_at::date) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_journal_trades_user      on public.journal_trades(user_id);
create index if not exists idx_journal_trades_user_date  on public.journal_trades(user_id, created_at);
create index if not exists idx_journal_trades_pair       on public.journal_trades(user_id, pair);

-- Auto-generate the human-readable Trade ID (ZTU-000001, ZTU-000002, ...)
create or replace function public.set_trade_id()
returns trigger
language plpgsql
as $$
begin
  if new.trade_id is null then
    new.trade_id := 'ZTU-' || lpad(new.trade_seq::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journal_trades_trade_id on public.journal_trades;
create trigger trg_journal_trades_trade_id
  before insert on public.journal_trades
  for each row execute function public.set_trade_id();

drop trigger if exists trg_journal_trades_updated_at on public.journal_trades;
create trigger trg_journal_trades_updated_at
  before update on public.journal_trades
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 3. trade_tags  (many tags per trade, e.g. "breakout", "FOMC", "revenge")
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.trade_tags (
  id         uuid primary key default gen_random_uuid(),
  trade_id   uuid not null references public.journal_trades(id) on delete cascade,
  tag        text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade_id, tag)
);

create index if not exists idx_trade_tags_trade on public.trade_tags(trade_id);

drop trigger if exists trg_trade_tags_updated_at on public.trade_tags;
create trigger trg_trade_tags_updated_at
  before update on public.trade_tags
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 4. journal_settings  (one row per user — starting balance, currency, etc.)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.journal_settings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.users(id) on delete cascade,
  starting_balance  numeric(18,2) not null default 0,
  account_currency  text not null default 'USD',
  default_lot_size  numeric(10,4),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_journal_settings_updated_at on public.journal_settings;
create trigger trg_journal_settings_updated_at
  before update on public.journal_settings
  for each row execute function public.set_updated_at();

-- Auto-create a default settings row whenever a user signs up.
create or replace function public.handle_new_user_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.journal_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_public_user_created on public.users;
create trigger on_public_user_created
  after insert on public.users
  for each row execute function public.handle_new_user_settings();

-- ──────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY — every user can only ever see/touch their own data
-- ──────────────────────────────────────────────────────────────────────
alter table public.users            enable row level security;
alter table public.journal_trades   enable row level security;
alter table public.trade_tags       enable row level security;
alter table public.journal_settings enable row level security;

-- users: read/update own profile only
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- journal_trades: full CRUD, own rows only
drop policy if exists "trades_select_own" on public.journal_trades;
create policy "trades_select_own" on public.journal_trades
  for select using (auth.uid() = user_id);

drop policy if exists "trades_insert_own" on public.journal_trades;
create policy "trades_insert_own" on public.journal_trades
  for insert with check (auth.uid() = user_id);

drop policy if exists "trades_update_own" on public.journal_trades;
create policy "trades_update_own" on public.journal_trades
  for update using (auth.uid() = user_id);

drop policy if exists "trades_delete_own" on public.journal_trades;
create policy "trades_delete_own" on public.journal_trades
  for delete using (auth.uid() = user_id);

-- trade_tags: scoped via the parent trade's user_id (no user_id column here)
drop policy if exists "tags_select_own" on public.trade_tags;
create policy "tags_select_own" on public.trade_tags
  for select using (
    exists (select 1 from public.journal_trades t
            where t.id = trade_tags.trade_id and t.user_id = auth.uid())
  );

drop policy if exists "tags_insert_own" on public.trade_tags;
create policy "tags_insert_own" on public.trade_tags
  for insert with check (
    exists (select 1 from public.journal_trades t
            where t.id = trade_tags.trade_id and t.user_id = auth.uid())
  );

drop policy if exists "tags_delete_own" on public.trade_tags;
create policy "tags_delete_own" on public.trade_tags
  for delete using (
    exists (select 1 from public.journal_trades t
            where t.id = trade_tags.trade_id and t.user_id = auth.uid())
  );

-- journal_settings: own row only
drop policy if exists "settings_select_own" on public.journal_settings;
create policy "settings_select_own" on public.journal_settings
  for select using (auth.uid() = user_id);

drop policy if exists "settings_upsert_own" on public.journal_settings;
create policy "settings_upsert_own" on public.journal_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "settings_update_own" on public.journal_settings;
create policy "settings_update_own" on public.journal_settings
  for update using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
-- Done. Next steps:
--   1. Project Settings → API → copy the Project URL and anon public key.
--   2. Authentication → Providers → ensure Email is enabled.
--      (Optional) Authentication → Settings → disable "Confirm email" for
--      instant sign-up during testing, re-enable for production.
--   3. Wire JOURNAL_SUPABASE_URL / JOURNAL_SUPABASE_ANON_KEY into journal.html
--      (see deployment instructions).
-- ════════════════════════════════════════════════════════════════════════
