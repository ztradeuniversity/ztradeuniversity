-- seed-02-operations.sql
-- AI CEO OS — Seed Batch 2: Operations (cadence, tasks, checklists, playbooks,
-- audiences, content tranche, growth stages, automation registry, trading rules)
-- Source: approved Prompt 7 Steps 2-3. RUN ONCE, after seed-01. Rollback at bottom.
-- FOUNDER: confirm email matches your admin account.

-- ============================================================
-- 1) CADENCE / DAY-TYPE TEMPLATES (knowledge_base: cadence-template)
--    content format: TIER | TIME | freq | rule
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'cadence-template', v.title, v.content, 'experience'
from f cross join (values
  ('daily.core_block',        'CRITICAL | 15m | daily | Journal entry + trading-prep glance + decision/automation glance. The non-negotiables. Never skip — it is 15 minutes.'),
  ('daily.community_touch',   'CRITICAL | 20m | daily | Answer all TG/WA questions <24h; 1-2 TG posts. Culture is presence. Max one skip/week.'),
  ('daily.retention_touches', 'IMPORTANT | 15m | daily | Work the M3 due-list (milestone ladder). Defer max 24h. Day-1 voice notes same-day, always.'),
  ('daily.ib_followups',      'IMPORTANT | 15m | daily | Advance flagged conversations only (trust-trigger gated). No one qualifying today = normal, skip.'),
  ('daily.shutdown',          'CRITICAL | 5m | daily | Check off tasks, one-line note, skip-reasons honestly. Feeds tomorrow''s plan + burnout telemetry.'),
  ('weekly.film_video',       'CRITICAL | 3h | weekly (production day) | The compounding asset. Never skip 2 weeks running — hard rule. Missed week recovery: film a 10-min small video.'),
  ('weekly.live_class',       'CRITICAL | 1.5h | weekly (fixed slot) | 30m teach + 15m honest market review vs track record + 15m Q&A. Illness = announce, never silent.'),
  ('weekly.publish_chain',    'CRITICAL | 2h | weekly (publish day) | Transcript -> GEO article (<=48h after video) + 3-5 clips + distribution. One effort, six surfaces.'),
  ('weekly.review',           'CRITICAL | 1h | weekly (fixed day) | Complete the pre-filled M7 draft; pick next week''s Focus. Never skip 2 weeks running.'),
  ('weekly.kpi_entry',        'IMPORTANT | 10m | weekly | Enter the week''s manual KPI values. No gaps in kpi_history.'),
  ('weekly.email_digest',     'IMPORTANT | 15m | weekly | Write the one founder paragraph; sequences do the rest.'),
  ('weekly.learning_slot',    'OPTIONAL | 30m | weekly | M5 reading queue. Freely skippable.'),
  ('monthly.transparency_report', 'CRITICAL | 1h | monthly | Calls + outcomes, losses in identical format to wins, one "what I got wrong" segment. The moat, maintained. The month it feels skippable is the month it matters most.'),
  ('monthly.content_audit',   'IMPORTANT | 1h | monthly | Kill/double list from data. Deleting work is the feature. Also: broker/regulatory/platform pulse check (30m).'),
  ('quarterly.review_gates',  'CRITICAL | 1day | quarterly | M7 quarterly + risk register + expansion gates (EN? probes? localization?) on data, not mood.')
) as v(title, content);

-- ============================================================
-- 2) MISSION RULES (knowledge_base: mission-rule)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'mission-rule', v.title, v.content, 'experience'
from f cross join (values
  ('ranking', 'Rank: tier (Critical>Important>Optional) -> staleness (overdue first) -> time-fit (fits remaining day). Show exactly 3 top items; full day <=7. Overflow rolls forward with "deferred by engine" note.'),
  ('day_types', 'Week has day-types, not identical days: Production (film), Publish (chain), Community (default), Review (weekly review day). Day-type sets which Critical items appear.'),
  ('ignore_today', 'Never surface: Future-gated items (paid pre-stage-3, EN pre-Wk11, localization pre-gate, API pre-portal), rejected platforms, anything whose gate is closed. The ignore list is the engine''s most important output.'),
  ('warnings_first', 'Critical warnings render above the mission only when present. Empty = hidden, never "no warnings" noise.'),
  ('time_estimate', 'Show per-task time and day total ("aaj ~2h 15m"). Correct estimates weekly from shutdown actuals.'),
  ('deep_link', 'Every mission item deep-links into its module pre-focused on the exact card/form. The founder never starts from the sidebar.'),
  ('conversion_mix', 'Every month''s content mix must include >=2 conversion-proximate pieces and >=1 trust piece. Never zero, never all.')
) as v(title, content);

-- ============================================================
-- 3) EXECUTION CHECKLISTS (knowledge_base: execution-checklist)
--    11-field format compressed: WHY|TIME|DIFF|PREP|STEPS|EXAMPLE|KPI|MISTAKES|RECOVERY|STOP|ESCALATE
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'execution-checklist', v.title, v.content, 'experience'
from f cross join (values
  ('weekly_video', 'WHY: the compounding engine; everything else distributes this. TIME: 3h. DIFF: med. PREP: topic card (ranked in backlog), 10-bullet outline, phone+quiet room. STEPS: pick card -> outline 20m -> film ONE take (imperfect fine) 60m -> trim ends only 30m -> thumbnail = question text 15m -> upload+schedule 15m. EXAMPLE: "Kya $100 se trading shuru ho sakti hai? | Sach". KPI: watch-time >40%. MISTAKES: re-recording for polish; 3 topics in 1 video. RECOVERY: missed week -> 10-min small video. STOP: never. ESCALATE: 8 straight weeks declining watch-time -> early content audit.'),
  ('live_class', 'WHY: ritual + conversion moment. TIME: 1.5h. DIFF: low after week 3. PREP: this week''s pillar topic, replay link ready. STEPS: 30m teach -> 15m market review vs public track record -> 15m Q&A -> post replay to TG. KPI: attendance + replay views. MISTAKES: performance claims; running long. RECOVERY: missed -> announce + double replay push. STOP: never. ESCALATE: attendance falling 4 weeks -> survey the community.'),
  ('publish_chain', 'WHY: 6 surfaces from 1 effort. TIME: 2h. DIFF: low (pipeline-assisted). STEPS: transcript -> article draft (GEO: 2500-4000w pillar or cluster) -> founder polish -> publish -> cut 3-5 clips -> queue TG/FB/IG -> digest mention. KPI: article live <=48h after video. MISTAKES: skipping the article (the compounding half); publishing unpolished AI draft. RECOVERY: late -> ship article alone, clips next day.'),
  ('community_touch', 'WHY: culture is presence; unanswered questions kill trust. TIME: 20m. STEPS: answer everything <24h -> 1 insight/clip post -> (2-3x/wk) engagement question. RULE: 1/3 of posts have NO ask. KPI: reply rate, response time <24h. MISTAKES: broadcast-only mode; arguing publicly. ESCALATE: hostile member -> private first, rules-restate public if needed.'),
  ('day1_voice_note', 'WHY: highest-ROI 30 seconds in the system. TIME: 2m. STEPS: M3 shows activation -> WA voice note 30s: name, welcome, one next step ("pehla lesson dekh lein"), NO sales -> log touch. MISTAKES: texting instead of voice; adding a pitch. KPI: Day-7 activity of welcomed vs not.'),
  ('transparency_report', 'WHY: the moat, maintained monthly. TIME: 1h. STEPS: pull month''s calls+outcomes -> wins AND losses identical format -> "what I got wrong" segment -> film 10m -> pin to TG. MISTAKES: softening losses (format symmetry IS credibility); delaying a bad month. STOP: never. ESCALATE: tempted to skip = the signal it matters most.'),
  ('retention_touch', 'WHY: scheduled trust (3B ladder). TIME: 2-5m each. STEPS: open due item -> use segment-matched template (adapt, don''t recite) -> send personal -> log touch. MISTAKES: copy-paste sameness; public loss references (PK/GCC: losses private, recognition public — never reversed).'),
  ('ib_conversation', 'WHY: right-time asks convert; early asks burn trust. PREP: trigger = course done + community-active + real broker question, OR ~30 days engaged. STEPS: WA personal -> frame as verification+supervision ("jahan hum khud trade karte hain") -> answer objections from audience card -> never pressure -> log stage transition. MISTAKES: funnel-blasting the ask; urgency tactics (instant trust detonation). STOP: any hesitation -> "koi jaldi nahin" and wait.'),
  ('weekly_review', 'WHY: the accountability spine. TIME: 1h -> 6m once drafts pre-fill. STEPS: read draft -> confirm/edit wins+problems -> check numbers strip -> pick next week Focus (from offered 3) -> mark complete. MISTAKES: skipping on a bad week (that''s the week it works). '),
  ('geo_refresh', 'WHY: <=90-day content gets ~2x AI citations. TIME: 45m monthly. STEPS: pick top page due -> update data/examples -> refresh date -> re-verify FAQ schema. KPI: AI-referral trend.'),
  ('kpi_entry', 'WHY: no gaps = honest trends. TIME: 10m weekly. STEPS: M1 -> enter manual values (source=manual) -> glance threshold states. MISTAKES: estimating instead of checking.'),
  ('monthly_audit', 'WHY: 80/20 enforcement — deleting work is the feature. TIME: 1h. STEPS: bottom-20% content by watch-time -> kill or rework decision each -> double the top performer''s angle -> log decisions in M5.')
) as v(title, content);

-- ============================================================
-- 4) PLATFORM PLAYBOOKS (knowledge_base: platform-playbook)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'platform-playbook', v.title, v.content, 'research'
from f cross join (values
  ('youtube',   'ROLE: core engine. CADENCE: 1 long-form + 1 live + 3-5 clips weekly; monthly top-5 title/thumbnail review; quarterly audit. CTA: free course, never deposit. TIMES: PK evenings 7-11pm PKT (serves GCC 8-11pm GST same upload). KPI: watch-time, course CTR. TIME: 5-6h/wk.'),
  ('telegram',  'ROLE: conversion square. CADENCE: 1-2 posts daily, all questions <24h; weekly review thread; monthly transparency pin. CTA rotates, 1/3 no-ask. KPI: members, reply rate, join->course. TIME: 25m/day. RULE: no DMs-for-signals — instant ban (this IS the positioning).'),
  ('whatsapp',  'ROLE: inner circle. ENTRY: course completion or 30 active days. CADENCE: as-triggered touches; groups capped 50; founder present. Sending stays human always. KPI: activation, response rate. TIME: 15m/day.'),
  ('facebook',  'ROLE: PK discovery skim. CADENCE: 2-3 clip reposts/wk into 2-3 groups; monthly group-list refresh. KPI: referral traffic only. TIME: 10m x3/wk. Zero native production.'),
  ('website',   'ROLE: compounding GEO asset. CADENCE: 1-2 articles/wk from transcripts; monthly 1 GEO refresh (<=90d rule) + FAQ schema check; quarterly coverage audit. KPI: AI-search referrals, course starts. TIME: 1.5h/wk.'),
  ('instagram', 'ROLE: repost shelf. CADENCE: auto-reposts only; quarterly keep/kill. TIME: ~0. If reposting is not one-click, do not do it.'),
  ('email',     'ROLE: retention rails. CADENCE: sequences 100% automated; founder writes 1 digest paragraph/wk; monthly sequence performance check; quarterly rewrite weakest email. KPI: opens, class attendance from email. TIME: 15m/wk.'),
  ('tiktok',    'ROLE: none (verdict: reject for native). Auto-repost at literally zero effort or nothing. No paid ever (category banned).'),
  ('rejected',  'LinkedIn, X, Reddit, Discord: zero minutes by verdict. If tempted, re-read the opportunity-cost analysis before spending a minute.'),
  ('posting_times_note', 'All times are general-guidance defaults — real analytics beat them within 6 weeks. Engine treats them as defaults, not rules.')
) as v(title, content);

-- ============================================================
-- 5) COUNTRY PLAYBOOKS — operating version (knowledge_base: country-playbook)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'country-playbook', v.title, v.content, 'research'
from f cross join (values
  ('pakistan', 'PRIORITY 1, active. LANG: ur. BROKER: Exness. PLATFORMS: YT / TG+WA+FB-groups. CONTENT: gold-led, scam-anatomy, halal series. WORKS: transparency-proof, Roman-ur titles, WA intimacy, live ritual. FAILS: English-first, polish>consistency, income-claim thumbnails, paid-before-trust. NEVER: guaranteed-profit language, ignoring halal, urgency tactics. CAUTION: SBP rails — never advise circumvention. CULTURE: respect register (aap), religious calendar, family financial dignity — losses = private, recognition = public, never reversed. WATCH: Exness withdrawal-complaint chatter weekly; SBP enforcement rhetoric.'),
  ('gcc',      'PRIORITY 1.5, active (rides PK assets +1h/wk). LANG: ur+en. BROKER: Exness Islamic — lead with it. AUDIENCE: expat professionals 28-45, time-poor not attention-rich. CONTENT: +halal-clarity (scholarly views, never verdicts), remittance-vs-investing, Eid/Ramadan gold timing. TIMES: Gulf evenings 8-11pm GST. NEVER: visa/financial-status implications, blanket halal verdicts. WATCH: UAE CMA retail-marketing rules quarterly.'),
  ('nigeria_kenya', 'PRIORITY 2, opens at 300-client gate (~Wk11+). LANG: en. BROKER: Exness + Vantage trial parallel. CONTENT: EN mirrors of proven winners only — never guess; small-account truth ("what $100 can/can''t do"), prop-firm reality. PACE: faster than ur market. KE: WhatsApp heavier than TG. NEVER: income-doubling framing; Urdu-market pacing. WATCH: regulatory tightening both markets.'),
  ('bangladesh_egypt', 'GATES, not markets yet. BD: Bengali AI-localization trial (5-10 pieces, native QC) must pass. EG: Exness client-acceptance verification FIRST (zero minutes before), then Arabic trial (MSA-vs-dialect decision inside trial). RULE: never build an audience you cannot yet serve — content gate first, community second. EG culture note: "protect what you have" > "grow what you have" (devaluation trauma).'),
  ('rejected_deferred', 'Malaysia: REJECT (Exness accepts neither clients nor partners — structural). Indonesia: DEFER, re-check 2027-07 (BAPPEBTI blocks). India: DEFER (RBI hostility). EU/UK/US/AU: REJECT (regulatory). Zero operating rules exist for these by design — do not create them.')
) as v(title, content);

-- ============================================================
-- 6) AUDIENCE CARDS (knowledge_base: audience-playbook)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'audience-playbook', v.title, v.content, 'research'
from f cross join (values
  ('beginner',        'PAIN: scam fear, jargon. TRUST: public track record. PLATFORM: YT+TG ur. CTA: free course. OBJECTION "is this a scam like the others?" -> don''t argue; hand the track record ("khud verify karein"). WARNING: repeated signal requests -> re-anchor to education, never oblige. RETENTION: milestones, community identity.'),
  ('small_account',   'PAIN: impatience, blow-up risk. TRUST: "$100 truth" honesty. CTA: risk-first framing. OBJECTION "can $100 make me rich?" -> the honest-math lesson answers it. WARNING: deposit-stretching talk -> actively slow them down (ethics + survival economics). RETENTION: survival design; celebrate discipline never profit.'),
  ('medium_consistent','PAIN: plateau. TRUST: journal evidence. PLATFORM: class ur+en. CTA: live class. CONTENT: psychology, entries/exits. RETENTION: monthly reviews, recognition. This pool feeds Champions.'),
  ('high_equity',     'PAIN: trust deficit, privacy. TRUST: discretion + months of visible history — they audit before they ask; the public archive is the sales team. PLATFORM: WA direct. CTA: personal conversation only, never funnel-blast. OBJECTION "why trust an online educator?" -> track record + never chase. WARNING: comparison-shopping other IBs = normal, stay excellent. RETENTION: VIP program.'),
  ('gcc_professional','PAIN: halal certainty, remittance guilt, time poverty. TRUST: Islamic-account clarity + diaspora identity. PLATFORM: YT+WA ur+en, Gulf evenings. CTA: halal-first sequence. RETENTION: Ramadan/Eid rhythm, home-connection. Highest LTV segment.'),
  ('business_owner',  'PAIN: distrust of "employees'' games". TRUST: businessman-to-businessman register. PLATFORM: WA ur. CTA: trading as a business unit. OBJECTION "your edge over my bank guy?" -> education + transparency + gold specialization. RETENTION: quarterly business-review framing. UPSELL: none — depth (VIP), not products.'),
  ('jewellery',       'PAIN: paper-gold illiteracy despite physical-gold expertise. TRUST: gold-native credibility. ENTRY: association/referral (in-person-style trust). OBJECTION "we already know gold" -> agree; position as paper-gold literacy for physical-gold experts. WARNING: hedging misconceptions -> dedicated content lane. Highest untapped LTV.'),
  ('working_professional', 'PAIN: time poverty. TRUST: efficiency respect. PLATFORM: email+replays. CONTENT: compressed, summaries. RETENTION: async everything, never punish absence.'),
  ('student',         'PAIN: no capital. STRATEGY: don''t convert — invest. Demo-first doctrine. PLATFORM: TG+shorts. RETENTION: patience — today''s student = Year-3 client. Never push deposits they can''t afford.'),
  ('gold_trader',     'CORE segment. TRUST: founder''s gold moat. PLATFORM: YT ur. CONTENT: session/driver analysis, pillar 4. RETENTION: gold-cycle content rhythm.'),
  ('crypto_trader',   'PAIN: volatility scars. TRUST: risk honesty about crypto. CONTENT: spot-vs-CFD clarity. RETENTION: volatility-event coaching.'),
  ('professional_trader', 'PAIN: commoditized content. TRUST: peer-level respect. PLATFORM: advanced en content. CTA: community role + tools, not education. RETENTION: status + leader track.')
) as v(title, content);

-- ============================================================
-- 7) GROWTH-STAGE RULES (knowledge_base: growth-stage)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'growth-stage', v.title, v.content, 'research'
from f cross join (values
  ('stage_0_10',    'OBJECTIVE: prove funnel. KPI: activated clients traceable to content. FOCUS: production consistency. IGNORE: everything Wave-2+ (EN, paid, localization, referrals). EXIT: 10 activated + path known. RISK: silence-phase quit -> pre-committed 12-week minimum.'),
  ('stage_10_50',   'OBJECTIVE: repeatability. KPI: course->IB conversion. FOCUS: funnel completion (course, email, WA circle, GCC titling). IGNORE: new platforms, feature ideas. EXIT: 2nd cohort converts without push. RISK: anecdote-as-pattern -> 3-week data minimum for decisions.'),
  ('stage_50_100',  'OBJECTIVE: retention proof. KPI: 60-day retention >50%. FOCUS: existing clients over new. IGNORE: growth-hacking urges. EXIT: retention target + commission covers tools. RISK: churn ignored chasing new -> at-risk list is Critical tier.'),
  ('stage_100_300', 'OBJECTIVE: community self-energy. KPI: member-to-member activity. FOCUS: culture + veteran promotion. IGNORE: paid still. EXIT: organic referrals appearing. RISK: hype-culture drift -> weekly tone resets.'),
  ('stage_300_500', 'OBJECTIVE: second engine. KPI: EN activations. FOCUS: PK on rails + EN mirrors. GATE OPENS: NG/KE + capped CAC probes. RISK: split attention -> PK chain untouchable.'),
  ('stage_500_1000','OBJECTIVE: systemized machine. KPI: founder hours flat <=18. FOCUS: automation quality. RISK: silent decay -> monthly random-sample audit.'),
  ('stage_1000_2000','OBJECTIVE: first hire. KPI: founder hours DOWN. FOCUS: delegate non-trust work (editing, clips, scheduling). NEVER delegate: voice, trust touches, decisions. RISK: wrong hire -> 30-day paid trial.'),
  ('stage_2000_plus','OBJECTIVE: portfolio. KPI: per-market P&L lines. FOCUS: quarterly kill/scale per market. NEVER CHANGES AT ANY STAGE: transparency spine, No-Advice line, education-first funnel, human trust-touches, approval queue.')
) as v(title, content);

-- ============================================================
-- 8) AUTOMATION REGISTRY (admin catalog — all INACTIVE)
-- ============================================================
insert into public.automation_registry (key, label, description, module, matrix_class, trigger_type, is_active) values
  ('kpi.weekly_snapshot',    'Weekly KPI snapshot',        'Computes derived weekly KPI rows (source=automated).', 'm1', 'full',           'cron',  false),
  ('mission.daily_generate', 'Daily mission generation',   'Instantiates today''s daily_activities from cadence templates on first login.', 'm1', 'full', 'event', false),
  ('email.onboarding_seq',   'Onboarding email sequence',  'D1/D3/D7 course emails (Resend).', 'm3', 'full',           'event', false),
  ('email.weekly_digest',    'Weekly digest send',         'Sends digest incl. founder paragraph.', 'm4', 'human_approval', 'cron',  false),
  ('retention.at_risk_flags','At-risk flag computation',   '14-day-silence + violation-cluster detection -> founder alerts.', 'm3', 'full', 'cron', false),
  ('retention.milestone_due','Milestone due-list builder', 'Builds daily touch list from 3B ladder rules.', 'm3', 'full',  'cron',  false),
  ('content.transcript_draft','Transcript->article draft', 'Drafts GEO article from video transcript. Founder polishes + publishes manually always.', 'm4', 'ai_assisted', 'event', false),
  ('content.clip_queue',     'Clip distribution queue',    'Queues cut clips to TG/FB/IG.', 'm4', 'human_approval', 'event', false),
  ('mentor.review_prefill',  'Weekly review pre-fill',     'Drafts M7 weekly review from week''s data.', 'm7', 'ai_assisted', 'cron', false),
  ('monitor.expected_runs',  'Expected-run monitor',       'Detects silent automation failures; 2 consecutive failures auto-pause a job.', 'm6', 'full', 'cron', false)
on conflict (key) do nothing;

-- ============================================================
-- 9) FOUNDER TRADING RULES (M2 — owner-scoped starter set)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.trading_rules (owner_user_id, title, description, category)
select f.id, v.title, v.descr, v.cat
from f cross join (values
  ('Max risk per trade',       'Never risk more than the fixed % per trade set in the plan. No exceptions for "certainty".', 'risk'),
  ('Stop-loss before entry',   'Every position has a stop defined BEFORE entry. No stop = no trade.', 'risk'),
  ('No revenge trading',       'After a loss: minimum 1-hour break before any new position. Two losses = done for the session.', 'psychology'),
  ('Journal before close of day','Every trade journaled same day: setup, reason, outcome, emotion. Unjournaled trade = violation.', 'discipline'),
  ('Session plan first',       'Trade only setups named in the session plan written before the session. Unplanned setup = pass.', 'discipline'),
  ('No news-candle entries',   'No entries within the volatility window around red-folder news. Watch, don''t chase.', 'risk'),
  ('Weekly max drawdown halt', 'Hit the weekly drawdown cap -> stop trading until next week''s review. Non-negotiable.', 'risk'),
  ('Public record integrity',  'Every educational call is logged to the public track record before outcome is known. Never retro-edit; annotate only.', 'integrity')
) as v(title, descr, cat);

-- ============================================================
-- 10) CONTENT TRANCHE — first 40 ideas (content_library, status=idea)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.content_library (owner_user_id, title, pillar, content_type, status, target_audience, notes)
select f.id, v.title, v.pillar, v.ctype, 'idea', v.aud, v.notes
from f cross join (values
  -- Pillar 3: Fundamentals (12 — 30%)
  ('Trading kya hai? Bilkul zero se',                    'fundamentals', 'video+article', 'beginner-pk',  'ur | discover | journey-1 opener'),
  ('Kya $100 se trading shuru ho sakti hai? Sach',       'fundamentals', 'video+article', 'small-account','ur | discover | honest-math anchor piece'),
  ('Demo account: pehle 30 din kya karein',              'fundamentals', 'video+article', 'beginner-pk',  'ur | trust | demo-first doctrine'),
  ('Lot size aur risk: aasan hisaab',                    'fundamentals', 'video+article', 'beginner-pk',  'ur | trust | calculator embed'),
  ('Stop loss kya hai aur kyun zaroori hai',             'fundamentals', 'video+article', 'beginner-pk',  'ur | trust'),
  ('Leverage: dost ya dushman?',                         'fundamentals', 'video+article', 'small-account','ur | trust'),
  ('Spread, pips, margin: 10 minute mein',               'fundamentals', 'video+article', 'beginner-pk',  'ur | discover'),
  ('Pehla trade kaise karein (step by step)',            'fundamentals', 'video+article', 'beginner-pk',  'ur | convert | course feeder'),
  ('Trading sessions: kab trade karein Pakistan se',     'fundamentals', 'video+article', 'beginner-pk',  'ur | discover'),
  ('Candlestick basics: chart parhna seekhein',          'fundamentals', 'video+article', 'beginner-pk',  'ur | discover | playlist anchor'),
  ('Risk management: account bachane ke 5 rules',        'fundamentals', 'video+article', 'small-account','ur | trust | survival design'),
  ('Trading plan kaise banayein',                        'fundamentals', 'video+article', 'medium',       'ur | retain'),
  -- Pillar 4: Gold/BTC (10 — 25%)
  ('Gold (XAUUSD) trading: mukammal beginner guide',     'gold_btc',     'video+article', 'gold-trader',  'ur | discover | pillar page'),
  ('Gold kis waqt sab se zyada move karta hai',          'gold_btc',     'video+article', 'gold-trader',  'ur | discover'),
  ('Gold aur dollar ka rishta: DXY samjhein',            'gold_btc',     'video+article', 'gold-trader',  'ur | trust'),
  ('Eid/shaadi season aur gold price: haqeeqat',         'gold_btc',     'video+article', 'jewellery',    'ur | discover | seasonal + jewellery lane'),
  ('Physical gold vs paper gold: jewellers ke liye',     'gold_btc',     'video+article', 'jewellery',    'ur | convert | industry lane opener'),
  ('Gold mein stop loss kahan rakhein',                  'gold_btc',     'video+article', 'gold-trader',  'ur | retain'),
  ('Bitcoin spot vs futures: farq samjhein',             'gold_btc',     'video+article', 'crypto',       'ur | trust'),
  ('BTC volatility: crypto mein risk kaise sambhalein',  'gold_btc',     'video+article', 'crypto',       'ur | trust'),
  ('Gold weekly outlook format (educational)',           'gold_btc',     'video',         'gold-trader',  'ur | retain | recurring format, no signals'),
  ('Central banks gold kyun khareed rahe hain',          'gold_btc',     'article',       'medium',       'ur+en | discover | GEO piece'),
  -- Pillar 5: Risk/Psychology (6 — 15%)
  ('Revenge trading: account ka qatil',                  'psychology',   'video+article', 'small-account','ur | retain'),
  ('Loss ke baad kya karein (aur kya nahin)',            'psychology',   'video+article', 'all',          'ur | retain | Day-60 sequence anchor'),
  ('Overtrading ki nishaniyan',                          'psychology',   'video+article', 'all',          'ur | retain'),
  ('Trading journal: discipline ka sab se bara tool',    'psychology',   'video+article', 'all',          'ur | retain | journal adoption push'),
  ('FOMO aur greed: market ke 2 jaal',                   'psychology',   'video+article', 'beginner-pk',  'ur | trust'),
  ('Trading aur ghar walon ka pressure',                 'psychology',   'video',         'beginner-pk',  'ur | trust | family-dignity piece, PK-unique'),
  -- Pillar 1: Legitimacy/Trust (6 — 15%)
  ('Scam broker pehchanne ke 7 tareeqe',                 'legitimacy',   'video+article', 'beginner-pk',  'ur | trust | scam-anatomy anchor'),
  ('Fake trading apps: Pakistan mein taaza scams',       'legitimacy',   'video+article', 'beginner-pk',  'ur | trust | FMU-sourced'),
  ('Signal seller ka sach: agar signals itne acchay hain to...', 'legitimacy', 'video+article', 'all',    'ur | trust | the positioning piece'),
  ('Withdrawal problems: broker verify kaise karein',    'legitimacy',   'video+article', 'all',          'ur | trust'),
  ('Hamara track record khud verify karein',             'legitimacy',   'video+article', 'all',          'ur | convert | track-record walkthrough'),
  ('IB kya hota hai? Hum kaise kamate hain (full disclosure)', 'legitimacy', 'video+article', 'all',      'ur | convert | the disclosure piece'),
  -- Pillar 6: Comparison/Broker (4 — 10%)
  ('Exness account kholne ka mukammal tareeqa',          'comparison',   'video+article', 'convert-ready','ur | convert | IB walkthrough companion'),
  ('Islamic account kya hota hai: gold CFD aur scholarly views', 'comparison', 'video+article', 'gcc',    'ur | convert | halal-clarity anchor — views not verdicts'),
  ('MT4 vs MT5: kaunsa use karein',                      'comparison',   'video+article', 'beginner-pk',  'ur | discover'),
  ('Broker comparison page: PK se accessible brokers',   'comparison',   'article',       'all',          'ur+en | convert | GEO comparison magnet'),
  -- Advanced/Retention (2 — 5%)
  ('Prop firm challenge: haqeeqat aur tayyari',          'advanced',     'video+article', 'medium',       'ur | retain'),
  ('Apna pehla saal review kaise karein',                'advanced',     'video+article', 'medium',       'ur | retain | Year-1 anniversary content')
) as v(title, pillar, ctype, aud, notes);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select category, count(*) from public.knowledge_base group by category order by 1;
--   expect: audience-playbook 12, broker-rule 5, cadence-template 15, country-playbook 5,
--           execution-checklist 12, growth-stage 8, mission-rule 7, platform-playbook 10
-- select count(*) from public.automation_registry;                 -- expect 10, all is_active=false
-- select count(*) from public.automation_registry where is_active; -- expect 0
-- select count(*) from public.trading_rules;                       -- expect 8
-- select pillar, count(*) from public.content_library group by pillar; -- 12/10/6/6/4/2 = 40
-- select count(*) from public.knowledge_base where content like '%CRITICAAL_FIX%'; -- expect 0

-- ============================================================
-- ROLLBACK
-- ============================================================
-- delete from public.content_library where status = 'idea';
-- delete from public.trading_rules;
-- delete from public.automation_registry;
-- delete from public.knowledge_base where category in
--   ('cadence-template','mission-rule','execution-checklist','platform-playbook',
--    'country-playbook','audience-playbook','growth-stage');
