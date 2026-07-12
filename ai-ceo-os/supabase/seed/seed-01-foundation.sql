-- seed-01-foundation.sql
-- AI CEO OS — Seed Batch 1: Foundation (KPIs, settings, verdicts, decisions, risks, broker rules)
-- Source: approved Prompt 5-7 outputs. RUN ONCE in the Supabase SQL Editor.
-- Re-run: first run the ROLLBACK block at the bottom, then this file again.
--
-- FOUNDER: confirm the email below matches your admin account before running.
-- The 11 KPI category names below are PROPOSED (2C locked the categories
-- conceptually; the literal strings were never fixed) — edit them here if you
-- prefer different names. This file is where that standing decision closes.

-- ============================================================
-- 1) KPI DEFINITIONS (admin catalog — no owner). 25 rows, 11 categories.
-- ============================================================
insert into public.kpi_definitions (key, label, category, unit, target_direction, description) values
  ('commission.monthly',        'Monthly IB commission',            'commission_revenue',   'usd',   'higher_is_better', 'Total Exness commission received this month. The lagging north-star.'),
  ('commission.per_client',     'Commission per active client',     'commission_revenue',   'usd',   'higher_is_better', 'Monthly commission / active clients. Quality over volume.'),
  ('clients.activations',       'Client activations',               'client_acquisition',   'count', 'higher_is_better', 'Registered clients who deposited AND traded this month. THE ladder metric.'),
  ('clients.registrations',     'IB registrations',                 'client_acquisition',   'count', 'higher_is_better', 'Accounts opened via IB link this month.'),
  ('clients.activation_rate',   'Registration→activation rate',     'client_acquisition',   'percent','higher_is_better', 'Weekly headline number until cohorts mature.'),
  ('retention.survival_90d',    '90-day survival rate',             'client_retention',     'percent','higher_is_better', 'Cohort % still trading at day 90. The single number that predicts the business (3B).'),
  ('retention.60d',             '60-day retention',                 'client_retention',     'percent','higher_is_better', 'Stage-gate criterion for 50→100.'),
  ('retention.at_risk_recovery','At-risk recovery rate',            'client_retention',     'percent','higher_is_better', 'Flagged clients re-engaged within 30 days. Instrument first, target later.'),
  ('content.videos_published',  'Weekly videos published',          'content_engine',       'count', 'higher_is_better', 'The compounding asset. Target: 1/week, never 0 two weeks running.'),
  ('content.watch_time',        'Average watch-time %',             'content_engine',       'percent','higher_is_better', 'Quality proxy. Views are vanity; watch-time is truth.'),
  ('content.chain_completion',  'Publish-chain completion',         'content_engine',       'percent','higher_is_better', 'Video→article→clips→distribution completed within 48h.'),
  ('web.ai_referrals',          'AI-search referrals',              'website_seo_growth',   'count', 'higher_is_better', 'Sessions from LLM/AI-search sources. The compounding GEO layer.'),
  ('web.course_starts',         'Course starts',                    'website_seo_growth',   'count', 'higher_is_better', 'Email-gated course lesson-1 starts.'),
  ('community.members',         'Telegram members (net)',           'community_health',     'count', 'higher_is_better', 'Net joins this week.'),
  ('community.reply_rate',      'Community reply rate',             'community_health',     'percent','higher_is_better', 'Member replies per founder post. Culture pulse.'),
  ('community.response_time',   'Founder response time',            'community_health',     'hours', 'lower_is_better',  'Time to answer member questions. <24h is the law.'),
  ('trading.journal_streak',    'Journal streak',                   'trading_discipline',   'days',  'higher_is_better', 'Founder credibility spine. Also the client-side churn predictor.'),
  ('trading.violations',        'Rule violations (week)',           'trading_discipline',   'count', 'lower_is_better',  'Falling violation rate is the discipline metric — never P&L.'),
  ('founder.critical_completion','Critical-tier completion',        'founder_execution',    'percent','higher_is_better', 'Daily Critical tasks completed. 50% of CEO Score.'),
  ('founder.core_block_streak', 'Core block streak',                'founder_execution',    'days',  'higher_is_better', 'Consecutive days core block completed. Burnout telemetry input.'),
  ('automation.run_success',    'Automation success rate',          'automation_health',    'percent','higher_is_better', 'Successful runs / total runs, weekly.'),
  ('automation.silent_failures','Silent failures caught',           'automation_health',    'count', 'lower_is_better',  'Expected-run monitor catches. Any >0 is a Warning.'),
  ('mentor.acceptance_rate',    'Mentor acceptance rate',           'ai_quality',           'percent','higher_is_better', 'Recommendations accepted (incl. edited). The AI''s own KPI.'),
  ('mentor.grounded_rate',      'Mentor grounded-answer rate',      'ai_quality',           'percent','higher_is_better', 'Answers with named evidence rows / total. Must stay ~100%.'),
  ('learning.weekly_slot',      'Learning slots taken',             'founder_learning',     'count', 'higher_is_better', 'Optional tier — 1/week average is healthy.')
on conflict (key) do nothing;

-- ============================================================
-- 2) SETTINGS (global config — scorecard weights, mission config, widgets)
-- ============================================================
insert into public.settings (scope, key, value) values
  ('global', 'scorecard.weight.critical',      '0.5'),
  ('global', 'scorecard.weight.important',     '0.3'),
  ('global', 'scorecard.weight.streaks',       '0.2'),
  ('global', 'mission.max_top_items',          '3'),
  ('global', 'mission.max_day_items',          '7'),
  ('global', 'mission.tie_break_order',        '"tier,staleness,time_fit"'),
  ('global', 'mentor.max_proactive_per_day',   '2'),
  ('global', 'mentor.max_recommendations',     '3'),
  ('global', 'retention.at_risk_silence_days', '14'),
  ('global', 'retention.max_daily_touches',    '5'),
  ('global', 'retention.dormant_checkpoints',  '[7,30,60,90,180]'),
  ('global', 'dashboard.headline_kpi',         '"clients.activation_rate"'),
  ('global', 'dashboard.retention_widgets',    '["touches_due","at_risk","dormant_checkpoint","milestones","recognition","referral_moments","community_alerts","kpi_strip"]'),
  ('global', 'shutdown.skip_reasons',          '["no_time","blocked","avoided","not_relevant"]'),
  ('global', 'week.production_day',            '"monday"');

-- ============================================================
-- 3) RESEARCH VERDICTS (research_library — owner-scoped)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.research_library (owner_user_id, title, domain, verdict, confidence, evidence_tier, summary, reviewed_at)
select f.id, v.title, v.domain, v.verdict::public.verdict_type, v.conf, v.tier, v.summary, '2026-07-12'::date
from f cross join (values
  ('Pakistan — launch market',            'country',  'adopt',  'high',   't4', 'Founder home advantage, Urdu moat, gold culture, scam-saturated market rewards transparency. Launch #1.'),
  ('GCC diaspora cluster (UAE/KSA lead)', 'country',  'adopt',  'high',   't3', 'Exness accepts all GCC w/ Islamic accounts; high-equity Urdu-speaking expats; served by PK content at ~zero marginal cost. Wave 1.5.'),
  ('Nigeria',                             'country',  'adopt',  'medium', 't5', '200k+ active traders, English, mobile-first. Wave 2, opens at 300-client gate.'),
  ('Kenya',                               'country',  'adopt',  'medium', 't5', '100k+ active traders, mobile-money rails, English. Wave 2 with Nigeria.'),
  ('Bangladesh',                          'country',  'trial',  'low',    't6', 'No reliable market-size data after 3 research passes. Bengali AI-quality gate must pass first.'),
  ('Egypt',                               'country',  'trial',  'medium', 't3', 'Largest Arab population, devaluation-driven demand, gold culture. GATES: Exness acceptance verification + Arabic localization trial.'),
  ('Indonesia',                           'country',  'defer',  'high',   't2', 'BAPPEBTI ISP-blocks unlicensed brokers; Exness not BAPPEBTI-licensed. Re-check in 12 months (2027-07).'),
  ('Malaysia',                            'country',  'reject', 'high',   't1', 'Exness accepts neither Malaysian clients nor Malaysian-resident partners. Structural reject.'),
  ('Urdu / Roman-Urdu',                   'language', 'adopt',  'high',   't4', 'One language, three markets (PK+GCC+UK diaspora). Highest ROI per content hour.'),
  ('English',                             'language', 'adopt',  'high',   't4', 'NG/KE/GCC-professional/global SEO. Second engine at Wk 11+.'),
  ('Arabic',                              'language', 'trial',  'low',    't6', 'Unlocks Egypt+GCC nationals. Gate: 5-10 AI-localized pieces + native QC. MSA-vs-dialect decision inside the trial.'),
  ('Bengali',                             'language', 'trial',  'low',    't6', 'Gate: AI-localization quality test, native-speaker judged.'),
  ('YouTube',                             'platform', 'adopt',  'high',   't3', 'Core engine. Consistency beats production value (verified twice).'),
  ('Telegram + WhatsApp',                 'platform', 'adopt',  'high',   't3', 'TG = conversion square, WA = inner circle. Where the market already lives.'),
  ('TikTok',                              'platform', 'reject', 'high',   't1', 'Platform-wide branded-content ban on forex/crypto (policy shift confirmed 2026-07). Auto-repost only, zero native minutes.')
) as v(title, domain, verdict, conf, tier, summary);

-- ============================================================
-- 4) DECISION LOG (locked decisions — owner-scoped)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.decision_log (owner_user_id, title, context, decision, rationale, confidence, action_class, status, review_date)
select f.id, v.title, v.ctx, v.decision, v.why, v.conf, v.ac, 'open', v.review::date
from f cross join (values
  ('Exness is Priority-1 broker',          'Broker research P0-S7 + P5-S1', 'Exness default in all markets', 'Lifetime revshare, daily payouts, accepts PK/GCC/BD/NG/KE, Islamic accounts, API path. No verifiable superior alternative exists publicly.', 'high', 'act_now', '2026-10-12'),
  ('Pakistan-first launch',                'Country research + opportunity cost analysis', 'PK is launch market #1; GCC rides the same content', 'Founder advantage + language moat + gold culture. GCC-first and Nigeria-first both examined and rejected.', 'high', 'act_now', '2027-01-12'),
  ('Organic-first, paid gated',            'Growth OS 5-3A', 'No paid acquisition until organic conversion proven + retention >50% + commission covers probes', 'Ads amplify a working funnel; they cannot create one. Scam-saturated cold traffic converts ~zero.', 'high', 'postpone', '2026-12-12'),
  ('TikTok downgraded to repost-only',     'P3-S2 policy finding', 'Zero native TikTok production', 'Platform banned forex/crypto branded content. Verdict recorded in research_library.', 'high', 'eliminate', '2027-01-12'),
  ('Transparency is the moat — never traded for growth', 'Entire strategy stack', 'Public track record, format-symmetric losses, honest limitations everywhere', 'Unfakeable by competitors (time-gated). Also the retention mechanism.', 'high', 'act_now', null),
  ('No monetary referral rewards',         '5-3B P13 + 7-4', 'Status-based recognition only', 'Imports signal-seller culture + Exness-terms compliance unverified. Revisit only with portal evidence.', 'medium', 'postpone', '2026-10-12'),
  ('Discipline-only leaderboards',         '5-3B P8', 'P&L/volume/deposit boards banned permanently', 'Profit boards display survivor bias and induce risk — the anti-client metric.', 'high', 'act_now', null),
  ('No deposit encouragement, ever',       'Retention constitution', 'OS never generates deposit-push messages', 'Survival = revenue. Equity growth is a byproduct tracked, never a target pursued.', 'high', 'act_now', null),
  ('Language-split (not country-split) communities', '5-3A P8', 'ur-TG and en-TG when EN engine starts', 'PK+GCC share Urdu; NG+KE share English. Fewer rooms, denser culture.', 'high', 'sequence', '2026-12-12'),
  ('Database frozen at migration 031',     'Prompt 4 S4 + six impact reviews', 'No schema changes without a failed impact review', 'Entire Prompt 5-7 stack landed with zero schema changes — the freeze is proven.', 'high', 'act_now', null)
) as v(title, ctx, decision, why, conf, ac, review);

-- ============================================================
-- 5) RISK REGISTER (owner-scoped)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.risk_register (owner_user_id, title, description, category, impact, likelihood, status, mitigation_plan, review_date)
select f.id, v.title, v.descr, v.cat, v.imp, v.lik, 'open', v.mit, '2026-10-12'::date
from f cross join (values
  ('Single revenue-type concentration', '100% of revenue is IB commission.', 'business', 'high', 'high', 'Broker diversification trials (XM/Vantage) hedge broker risk, not revenue-type risk. Alternative revenue types = future research only.'),
  ('D0 baselines uncaptured', 'Every KPI threshold and time budget runs on placeholders.', 'business', 'high', 'high', 'One founder session: current commission, client counts, real weekly time budget. Blocks calibration of the entire OS.'),
  ('Exness tier/API assumptions unverified', 'Tier numbers Medium-confidence; API access unconfirmed. Gates M3 automation, VIP compliance, referral design.', 'business', 'medium', 'medium', '30-minute partner-portal session. The cheapest high-value action in the plan.'),
  ('SBP payment-rail friction (PK)', 'Deposit/withdrawal rails are the operational risk in the home market.', 'market', 'high', 'medium', 'Never advise circumvention. GCC segment partially hedges. Monitor withdrawal-complaint chatter weekly.'),
  ('Broker policy change', 'Lifetime revshare is contractual policy, not law.', 'business', 'medium', 'low', 'Diversification trials exist for this. Tripwire: partner-terms monitoring quarterly.'),
  ('Regulatory tightening in Wave-2 markets', 'NG/KE tightening; Indonesia showed how fast a market closes.', 'market', 'medium', 'medium', 'Quarterly regulatory pulse check (seeded as monthly task). Geographic revenue spread at scale.'),
  ('Founder consistency through months 1-3', 'The 50-500 despair valley: long enough to doubt, too early to see compounding.', 'execution', 'high', 'medium', 'Pre-committed 12-week minimum; M7 cadence as external spine; burnout protocol pre-committed.'),
  ('Blow-up-driven churn, months 1-3 of every cohort', 'Structural to the industry.', 'retention', 'high', 'high', 'Risk-first onboarding, journal adoption push, desperation-language detection. Mitigated, never eliminated.'),
  ('Automation quality erosion at scale', 'Silent decay of automated output quality.', 'technical', 'medium', 'medium', 'Monthly random-sample audit (seeded task). Expected-run monitor + 2-failure auto-pause.'),
  ('Platform policy volatility', 'TikTok shifted mid-project; others can too.', 'market', 'medium', 'medium', 'Monthly broker/regulatory/platform pulse check. Never build load-bearing on one distribution channel.')
) as v(title, descr, cat, imp, lik, mit);

-- ============================================================
-- 6) BROKER RULES (knowledge_base — owner-scoped)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'broker-rule', v.title, v.content, 'research'
from f cross join (values
  ('Exness default — all markets', 'Exness is the default recommendation everywhere it accepts clients (PK, GCC, BD, NG, KE). Lifetime revshare, daily payouts, $10 min withdrawal, Islamic accounts, Partnership API exists (T1). Never recommend switching without portal-verified numbers.'),
  ('Vantage — NG/KE trial only', 'Run alongside (not instead of) Exness in Nigeria/Kenya when Wave 2 opens. 50% revshare claim unverified. Purpose: diversification hedge + Africa presence. Kill if 2 quarters underperform.'),
  ('XM — PK/South-Asia second option', 'Trial only after Exness baseline revenue exists. Up to $80/lot lifetime claim unverified. Strong South Asia presence.'),
  ('Egypt broker gate', 'NO broker recommendation for Egypt until Exness client-acceptance is confirmed in the partner portal. Zero content minutes before this gate clears.'),
  ('Rejected brokers', 'QuoMarkets/Valetax (75-85% revshare): REJECT on durability + client-trust gates. IC Markets/Pepperstone/FP/AvaTrade: no verifiable IB economics exist publicly — portal-only data; not candidates until evidence exists.')
) as v(title, content);

-- ============================================================
-- VERIFICATION (run after)
-- ============================================================
-- select count(*) from public.kpi_definitions;                          -- expect 25
-- select count(*) from public.settings where scope='global';           -- expect 15 (flags) + 15 (new) = 30
-- select count(*) from public.research_library;                        -- expect 15
-- select count(*) from public.decision_log;                            -- expect 10
-- select count(*) from public.risk_register;                           -- expect 10
-- select count(*) from public.knowledge_base where category='broker-rule'; -- expect 5

-- ============================================================
-- ROLLBACK (uncomment and run to remove this batch)
-- ============================================================
-- delete from public.knowledge_base where category = 'broker-rule';
-- delete from public.risk_register;      -- only safe while these are the sole rows
-- delete from public.decision_log;       -- only safe while these are the sole rows
-- delete from public.research_library;   -- only safe while these are the sole rows
-- delete from public.settings where scope='global' and key like any (array['scorecard.%','mission.%','mentor.%','retention.%','dashboard.%','shutdown.%','week.%']);
-- delete from public.kpi_definitions;    -- only safe while these are the sole rows
