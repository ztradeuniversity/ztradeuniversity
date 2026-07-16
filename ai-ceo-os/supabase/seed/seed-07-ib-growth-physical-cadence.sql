-- seed-07-ib-growth-physical-cadence.sql
-- AI CEO OS — Home dashboard simplification: 2 new daily cadence keys.
-- Source: Home 3-section rebuild (IB Growth + Physical Activity). RUN ONCE,
-- after seed-02 (which seeded the original cadence-template rows this file
-- extends). Rollback at bottom.
--
-- daily.technical_analysis: the one genuinely-missing high-value IB Growth
-- habit worth adding as its own tracked item (content-authority, distinct
-- from the weekly long-form video) — added per the founder's "only add
-- genuinely high-impact missing activities, Pareto 80/20" instruction, not
-- to force any fixed task count.
-- daily.physical_outreach: gives the Physical Activity section a trackable
-- Not-Started/Partial/Complete row (today's area outreach action) using the
-- SAME daily_activities/exec-tag pipeline every other cadence item already
-- uses — no bespoke status logic needed.

with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'cadence-template', v.title, v.content, 'experience'
from f cross join (values
  ('daily.technical_analysis', 'IMPORTANT | 20m | daily | Post one technical read (levels/structure) on the active platform. An authority habit, distinct from the weekly long-form video.'),
  ('daily.physical_outreach',  'IMPORTANT | 30m | daily | Work today''s Physical IB Expansion area: a visit, call, or proposal follow-up in the current cycle area. See the Physical Growth Engine for the full institute pipeline.')
) as v(title, content);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select title from public.knowledge_base where category = 'cadence-template'
--   and title in ('daily.technical_analysis', 'daily.physical_outreach');
--   expect: both rows present, exactly once each.

-- ============================================================
-- ROLLBACK
-- ============================================================
-- delete from public.knowledge_base where category = 'cadence-template'
--   and title in ('daily.technical_analysis', 'daily.physical_outreach');
