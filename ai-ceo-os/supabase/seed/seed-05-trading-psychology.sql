-- seed-05-trading-psychology.sql
-- AI CEO OS — Seed Batch 5: Trading Psychology rules (OPTIONAL, founder-reviewable)
-- Source: Final Execution Engine patch (Step 6). RUN ONLY if the founder
-- wants these three questions in the daily check-in. Rollback at bottom.
-- FOUNDER: confirm the email below matches your admin account.
--
-- WHY THIS FILE EXISTS: Step 6 asked the check-in to cover FOMO, overtrading,
-- and emotional decisions. "No revenge trading" already exists (seed-02) and
-- is already asked. FOMO/overtrading/emotional-pause have NO seeded rule —
-- adding them as fabricated psychology SCORES (a 1-10 "stress level" with no
-- real telemetry) was explicitly forbidden this step. The honest fix is the
-- SAME mechanism the founder already uses and already reviewed once (seed-04
-- added 4 discipline rules the identical way): a yes/no trading_rule, logged
-- as a violation exactly like the other 8 — real data, not an invented score.
-- These are OPTIONAL and is_active so the founder can flip them off from the
-- Trading page's rules list without any code change if unwanted.

with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.trading_rules (owner_user_id, title, description, category)
select f.id, v.title, v.descr, v.cat
from f cross join (values
  ('No FOMO entries',           'Entering a move already in progress because "it might run without me" is a violation, even if it wins. If the setup wasn''t pre-planned, it wasn''t a trade — it was FOMO.', 'psychology'),
  ('No overtrading',            'A hard cap on trades per session (set in the session plan). Trade six because five is boring, or because the plan failed, are both violations — the cap exists for exactly that moment.', 'psychology'),
  ('Pause on emotional decisions', 'Any entry or exit driven by frustration, excitement, boredom, or "getting it back" is logged as a violation regardless of outcome — the discipline metric is the decision, never the P&L.', 'psychology')
) as v(title, descr, cat);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select count(*) from public.trading_rules where category = 'psychology'; -- expect 4 (1 existing + 3 new)

-- ============================================================
-- ROLLBACK
-- ============================================================
-- delete from public.trading_rules where title in ('No FOMO entries','No overtrading','Pause on emotional decisions');
