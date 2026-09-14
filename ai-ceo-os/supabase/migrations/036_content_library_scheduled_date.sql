-- 036_content_library_scheduled_date.sql
-- AI CEO OS — Social Engagement Poll Planning
--
-- content_library has no due/scheduled date (it's a kanban, not a calendar) —
-- the one genuine gap for planning poll posts against specific days. This
-- adds ONE nullable column, following the Database Engineering Constitution's
-- "a correction/addition is always a new migration" rule (see migrations
-- README, 031's precedent) rather than repurposing an existing text field.
-- Nullable and additive: every existing row (video/article ideas) is
-- unaffected, and content_type stays free text (025_content_library.sql) so
-- 'poll' needs no enum change. RLS is unchanged — policies apply per-row,
-- not per-column, so 025's existing owner policies already cover this column.

alter table public.content_library
  add column scheduled_date date;

-- Certain access pattern: "what's due today / this week / this plan-year" —
-- the poll planner's core query (content_type='poll' AND scheduled_date
-- between X and Y), and a plain kanban read (scheduled_date is null) is
-- unaffected by this index.
create index content_library_owner_type_scheduled_idx
  on public.content_library (owner_user_id, content_type, scheduled_date);
