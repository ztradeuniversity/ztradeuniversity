-- seed-04-physical.sql
-- AI CEO OS — Seed Batch 4: Physical IB Expansion (Pakistan) + Trading Discipline v2
-- Source: Physical Expansion patch (post-Step-5). RUN ONCE, after seed-01..03
-- AND after migration 032_institutes.sql. Rollback at bottom.
-- FOUNDER: confirm the email below matches your admin account.
--
-- RESEARCH LABELING (per the patch's rule — never mixed):
--   * Sections 1, 2, 3, 4, 5 = GAP RESEARCH — desk-level (t5/t6), confidence
--     low/medium, produced for this patch. Area rows name institute TYPES and
--     search methods, NEVER specific institute names (none were invented).
--     The founder ground-verifies every area before its 15-day cycle starts.
--   * Where a row restates an already-locked decision (paid-ads gate), it
--     cites the EXISTING research/decision — nothing is re-derived.
--   * Section 6 (settings) and Section 7 (trading rules) are configuration
--     and founder data entry, not research.

-- ============================================================
-- 1) CITY VERDICTS (research_library, domain='city') — GAP RESEARCH
--    Execution order for the physical class engine. All desk-level: the
--    founder's on-ground knowledge outranks these rows and corrections
--    belong here, not in code.
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.research_library (owner_user_id, title, domain, verdict, confidence, evidence_tier, summary, reviewed_at)
select f.id, v.title, 'city', v.verdict::public.verdict_type, v.conf, v.tier, v.summary, '2026-07-13'::date
from f cross join (values
  ('Lahore',       'adopt', 'medium', 't5', 'START HERE. Founder home city — zero travel cost, ground knowledge, Urdu heartland, dense education/academy market. The physical model is proven or killed here before any other city gets a rupee.'),
  ('Rawalpindi',   'adopt', 'low',    't6', 'Wave 2 with Islamabad (twin cities, one trip). Dense academy market around Saddar/Commercial Market. Opens only after 2+ successful Lahore cycles.'),
  ('Islamabad',    'adopt', 'low',    't6', 'Wave 2 with Rawalpindi. Higher-income students, IT/freelancing academies in Blue Area/G-sectors. Same trip as RWP.'),
  ('Faisalabad',   'adopt', 'low',    't6', 'Wave 3. Industrial city with strong freelancing-academy culture; day-trip from Lahore. Business-owner audience angle (seeded audience card applies).'),
  ('Gujranwala',   'trial', 'low',    't6', 'Wave 3 candidate — close to Lahore, trader/business culture. Trial one cycle before committing.'),
  ('Multan',       'trial', 'low',    't6', 'Wave 4 — southern Punjab hub. Overnight logistics; needs proven repeatable playbook first.'),
  ('Sargodha',     'trial', 'low',    't6', 'Satellite city — bundle with a Faisalabad or Multan trip, never a dedicated cycle initially.'),
  ('Sahiwal',      'trial', 'low',    't6', 'Satellite city — same bundling rule as Sargodha.'),
  ('Bahawalpur',   'trial', 'low',    't6', 'Satellite city — southern bundle with Multan.'),
  ('Peshawar',     'trial', 'low',    't6', 'Wave 5 — real market, distinct culture; enter only with a locally-referred institute contact.'),
  ('Karachi',      'trial', 'medium', 't6', 'Largest market in the country, farthest logistics from Lahore. Deliberately NOT first — enter at Wave 5+ with the fully-proven model, possibly via a trained local partner instead of founder travel.'),
  ('Hyderabad',    'trial', 'low',    't6', 'Pairs with Karachi wave only — never independent.'),
  ('Quetta',       'defer', 'low',    't6', 'Deferred — travel/logistics burden highest, market size unverified. Re-check after Karachi wave.')
) as v(title, verdict, conf, tier, summary);

-- ============================================================
-- 2) LAHORE AREA PLAYBOOKS (knowledge_base: area-playbook) — GAP RESEARCH
--    Order here = the 15-day rotation queue order (settings, section 6).
--    TYPES: institute types to search. SEARCH: how to find them (maps
--    queries + on-ground). PITCH: the angle for that area's audience.
--    NO institute names anywhere — the founder finds and verifies them.
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'area-playbook', v.title, v.content, 'research'
from f cross join (values
  ('johar_town',  'WHY: highest academy density in Lahore — IT/freelancing/Amazon institutes cluster near main boulevards and university belt. TYPES: computer academies, freelancing academies, Amazon/e-commerce institutes, AI training centers, software houses with student programs. SEARCH: maps queries "computer academy Johar Town", "freelancing course Johar Town", "Amazon course Lahore" + walk the main commercial blocks; academies stack vertically in plazas — check building directories. PITCH: career-skill upgrade — trading as a serious skill next to freelancing, not a shortcut.'),
  ('gulberg',     'WHY: premium commercial hub — professional training centers, established institutes, corporate audience nearby. TYPES: professional development institutes, stock/investment training centers, established computer academies. SEARCH: "training institute Gulberg", "academy Main Boulevard Gulberg"; Liberty–Main Market corridor. PITCH: professional register — discipline and risk management for people with real incomes.'),
  ('model_town',  'WHY: the Link Road academy row is a known coaching/academy strip; educated middle-class catchment. TYPES: computer academies, coaching centers adding skill courses, freelancing academies. SEARCH: "academy Model Town Link Road" + walk Link Road end to end once. PITCH: family-dignity framing (seeded culture rule) — a respectable skill, losses private, learning public.'),
  ('township',    'WHY: College Road corridor — dense student traffic, affordable academies. TYPES: computer/vocational academies, skill centers, matric/inter coaching centers adding IT wings. SEARCH: "academy College Road Township". PITCH: small-account honesty ("$100 truth" seeded anchor) — this audience has more time than capital; demo-first doctrine applies hard.'),
  ('iqbal_town',  'WHY: large residential-commercial mix, established academy market on main roads. TYPES: computer academies, freelancing institutes. SEARCH: "computer academy Allama Iqbal Town". PITCH: same as Township — beginner-heavy, risk-first.'),
  ('wapda_town',  'WHY: planned community with commercial hubs; families + young professionals. TYPES: skill centers, computer academies. SEARCH: "academy Wapda Town Lahore". PITCH: professional/family register.'),
  ('dha',         'WHY: highest-equity catchment in the city; fewer academies but premium ones + software houses. TYPES: premium training institutes, software houses with internal training, business incubators. SEARCH: "training center DHA Lahore", Y-block/CCA commercial areas. PITCH: high-equity audience card applies — discretion, track record first, never chase. One good DHA institute outranks three Township ones on lifetime value.'),
  ('garhi_shahu', 'WHY: old-city commercial belt near railway station; traditional business community. TYPES: vocational centers, computer academies, business-community contacts (jewellery lane adjacency). SEARCH: "computer academy Garhi Shahu / Allama Iqbal Road". PITCH: businessman-to-businessman register (seeded audience card) + the jewellery/gold wedge — paper-gold literacy for physical-gold families.'),
  ('baghbanpura', 'WHY: dense traditional neighborhood near Shalimar; underserved by premium institutes — first-mover advantage. TYPES: small computer academies, vocational/skill centers. SEARCH: "academy Baghbanpura", GT Road stretch. PITCH: accessibility framing — the free session IS the product here; trust-building is slower, izzat framing essential.'),
  ('shalimar',    'WHY: pairs with Baghbanpura (same trip); GT Road commercial. TYPES: vocational centers, computer academies. SEARCH: "academy Shalimar Lahore / GT Road". PITCH: same as Baghbanpura — bundle these two areas into one cycle if institute count is low. VERIFY-ON-GROUND rule applies doubly here: desk confidence is lowest for old-city areas.')
) as v(title, content);

-- ============================================================
-- 3) FOUNDER SALES TEMPLATES (knowledge_base: sales-template) — GAP RESEARCH
--    (applies the LOCKED strategy — transparency moat, education-first,
--     no-pressure — to the physical channel)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'sales-template', v.title, v.content, 'research'
from f cross join (values
  ('cold_contact',   'WALK-IN or CALL, Urdu respect register (aap). Script skeleton: apna taaruf (trader + educator, [n] saal ka public track record) -> offer: aap ke students ke liye MUFT trading-awareness session (1.5h) — scam-pehchan, risk ki haqeeqat, halal clarity -> institute ko kya milta hai: value-add session, students ke liye certificate, zero cost -> ask: 15-minute meeting with principal/owner. NEVER on first contact: IB mention, revenue talk, urgency. Log in Institute CRM same day.'),
  ('proposal',       'ONE PAGE only. Contains: who (track record link — khud verify karein), what (free 2-3 session workshop: session 1 awareness/scams, session 2 risk & demo-first, session 3 live class invite + Q&A), what institute gets (student value, certificate session, zero fee), what founder gets (HONEST: "main IB/education model se kamata hoon — students par kabhi deposit pressure nahin, education pehle" — the transparency moat IS the differentiator, in writing), logistics (projector, 1.5h slot, batch size 15-40). Attach nothing else.'),
  ('negotiation',    'RULES: (1) never PAY for access in cycle 1 — free value is the offer; (2) if institute asks for revenue share: defer — "pehla batch chala lein, phir baat karte hain" (no numbers exist yet to share honestly); (3) institute wants credibility + student results — sell THAT; (4) accept 2-3 institutes max per area cycle (founder time is the constraint); (5) any institute pushing guaranteed-profit marketing language = walk away — brand contamination costs more than a batch.'),
  ('follow_up',      'CADENCE: proposal -> follow-up once after 3 days -> if silent, once more at day 7 -> then stage=follow_up_later with next_follow_up set to next area rotation. NEVER chase past two follow-ups (15-day clock rules the calendar, not hope). Meetings booked = advance stage same day.'),
  ('objections',     'Q "hamein kya faida?" -> student value + certificate + zero cost + aap ki credibility. Q "yeh scam to nahin?" -> track record link, khud verify karein — never argue (seeded beginner-card rule). Q "fees kitni?" -> free session; aage ka course bhi free online hai — kamai ka model IB hai, full disclosure. Q "guarantee kya hai?" -> koi guarantee nahin — that honesty is the pitch (format-symmetry moat).')
) as v(title, content);

-- ============================================================
-- 4) PHYSICAL STUDENT FUNNEL (knowledge_base: physical-funnel) — GAP RESEARCH
--    Stage rules for students entering via institutes. Also the single
--    source for how each founder TOOL is used (Playbooks Founder Tools
--    reads these rows — one home per fact).
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'physical-funnel', v.title, v.content, 'research'
from f cross join (values
  ('free_session',   'FOUNDER: run the 1.5h awareness session (scam-anatomy, risk truth, demo-first). MANUAL: everything — this is a trust moment, never delegated. AUTO: none. TOOL: none (projector + track record). KPI: attendees -> course starts. EXIT: student starts the free course (register with WhatsApp number on the spot).'),
  ('trading_course', 'FOUNDER: nothing per-student — the website course carries it. AUTO: email onboarding sequence (registry: email.onboarding_seq, activate when volume justifies). TOOL: Trading Website (free course = the funnel spine). KPI: web.course_starts, lesson-3 completion. EXIT: course completion -> inner-circle invite (existing lifecycle rule).'),
  ('trading_journal','FOUNDER: journal adoption push in session 2 + community shout-outs for streaks. MANUAL: recognition posts. AUTO: none yet. TOOL: Trading Journal (the discipline hook — "journal streak" is the identity metric, never P&L). KPI: trading.journal_streak adoption among cohort. EXIT: student journals 7 consecutive days.'),
  ('trading_bot',    'FOUNDER: demo the EA as an EDUCATIONAL instrument (how automation enforces discipline) — NEVER as a profit machine, no performance claims ever (No-Advice line applies structurally). MANUAL: demo only in live class. AUTO: none. TOOL: Trading Bots (ZTU EAs — delivery stays ZTU-side). KPI: none yet (honest: bot engagement is not instrumented). EXIT: n/a — supporting tool, not a gate.'),
  ('ai_chatbot',     'FOUNDER: introduce in session 1 ("24/7 sawal poochein"). AUTO: fully automated — the ZTU chatbot answers; its query logs are free demand research (seeded opportunity_demand template). TOOL: AI Chatbot. KPI: student question volume (demand signal), not chat count vanity. EXIT: n/a — supporting tool.'),
  ('assessment',     'FOUNDER: point students to practice/exams after course sections. AUTO: fully automated (ZTU practice + exam system exists). TOOL: Assessment Tools. KPI: completion feeds "qualified" judgment — a student who passed assessments + journals is IB-conversation-ready. EXIT: assessments passed.'),
  ('live_class',     'FOUNDER: the weekly pro class IS the conversion ritual (existing cadence weekly.live_class — physical students join the same class, no separate class). MANUAL: teach + honest market review. AUTO: replay distribution. TOOL: Weekly Pro Trading Class. KPI: physical-cohort attendance. EXIT: 30 days engaged OR real broker question -> IB conversation (existing ib_conversation checklist, trust-trigger gated).'),
  ('ib_registration','FOUNDER: the existing ib_conversation checklist applies unchanged — WA personal, verification framing, never pressure. MANUAL: entirely. AUTO: none (human-only by design). TOOL: Institute CRM notes which institute sourced the student (ib_clients.referral_source = institute name). KPI: clients.registrations, clients.activation_rate per institute. EXIT: activated (deposit + first trade).'),
  ('retention',      'Existing Retention OS applies unchanged (milestone ladder, at-risk flags, segments). Physical-cohort extra: students from the same institute form a natural buddy pod (seeded day60_psych pod rule) — use it. KPI: retention.survival_90d per institute cohort.'),
  ('referral',       'Existing referral rules apply unchanged (90-day survivors, pride moments, non-monetary). Physical extra: a surviving student inside an institute is the walking proposal for the NEXT batch at that institute — schedule institute re-visit at first cohort day-90 (batch_end + 90d = next_follow_up on the institute row). KPI: referred-client 90-day survival (the only referral number that matters, seeded).')
) as v(title, content);

-- ============================================================
-- 5) LOCAL MARKETING + PAID ADS (knowledge_base: marketing-rule)
--    Local channels = GAP RESEARCH. Paid-ads gate = EXISTING RESEARCH
--    restated (decision_log: "Organic-first, paid gated") + gap-level
--    guidance on sequencing. NO ROI, NO conversion numbers — none exist.
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'marketing-rule', v.title, v.content, 'research'
from f cross join (values
  ('local_channels', 'GAP RESEARCH. Priority order for physical acquisition: (1) institute partnerships (THIS patch — highest trust-per-hour, warm audience, zero ad spend), (2) university seminars — AFTER 2+ successful institute cycles (bigger rooms, colder trust, needs the polished session), (3) own paid workshops — only after retention proof (they cost money before trust exists), (4) trading communities — existing TG/WA channels serve this already, (5) referral systems — existing rules; physical cohorts amplify them naturally. NEVER: paying institutes for access in cycle 1, paid lead lists, cold DMs.'),
  ('paid_ads_gate',  'EXISTING RESEARCH restated — decision_log "Organic-first, paid gated" (locked): NO paid acquisition until (a) organic conversion proven, (b) retention >50% at 60d, (c) commission covers probe budgets. Nothing in this patch changes that decision.'),
  ('paid_ads_plan',  'GAP RESEARCH (sequencing only — activates ONLY after paid_ads_gate clears): countries PK first then GCC (existing country verdicts); languages ur then en (existing verdicts); platforms YouTube + Facebook only (adopted/supporting — TikTok category-banned per stored verdict, no paid ever there). Budget: honest answer — no number can be recommended without D0 baselines; rule instead: smallest spend that produces >=3 weeks of decision-grade data (three_week_rule), funded from real commission, never savings. Scaling: kill/double per the monthly_audit checklist; never scale on <3 weeks of data; CAC per activated client (not per click/lead) is the only number that matters. NO ROI PROJECTIONS EXIST — first probe creates the baseline.')
) as v(title, content);

-- ============================================================
-- 6) PHYSICAL ENGINE SETTINGS (configuration, not research)
--    Queue order matches section 2. start_date is NOT seeded — the founder
--    starts the first cycle from the Growth page, which writes it.
-- ============================================================
insert into public.settings (scope, key, value) values
  ('global', 'physical.city',       '"Lahore"'),
  ('global', 'physical.cycle_days', '15'),
  ('global', 'physical.area_queue', '["Johar Town","Gulberg","Model Town","Township","Iqbal Town","Wapda Town","DHA","Garhi Shahu","Baghbanpura","Shalimar"]');

-- ============================================================
-- 7) TRADING DISCIPLINE RULES v2 (founder data entry, not research)
--    The Home check-in renders ALL active rules dynamically, so these four
--    make the OS ask the weekly/daily analysis + zones questions verbatim.
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.trading_rules (owner_user_id, title, description, category)
select f.id, v.title, v.descr, v.cat
from f cross join (values
  ('Weekly analysis & zones',  'Before the week''s first session: full weekly analysis done AND weekly zones marked on the chart. No weekly zones = no trading week.', 'discipline'),
  ('Weekly bias review',       'Weekly bias written down before Monday. Mid-week bias flips require a journal note explaining what changed.', 'discipline'),
  ('Daily analysis & zones',   'Before each session: daily analysis done AND daily zones marked. Zones marked during a trade do not count.', 'discipline'),
  ('Trade only pre-marked zones', 'Entries only at zones marked BEFORE the session, with confirmation. A trade outside pre-marked zones is a violation even if it wins.', 'discipline')
) as v(title, descr, cat);

-- ============================================================
-- VERIFICATION (run after)
-- ============================================================
-- select count(*) from public.research_library where domain='city';        -- expect 13
-- select count(*) from public.knowledge_base where category='area-playbook';    -- expect 10
-- select count(*) from public.knowledge_base where category='sales-template';   -- expect 5
-- select count(*) from public.knowledge_base where category='physical-funnel';  -- expect 10
-- select count(*) from public.knowledge_base where category='marketing-rule';   -- expect 3
-- select count(*) from public.settings where key like 'physical.%';             -- expect 3
-- select count(*) from public.trading_rules;                                    -- expect 12 (8 + 4)

-- ============================================================
-- ROLLBACK (uncomment and run to remove this batch)
-- ============================================================
-- delete from public.trading_rules where title in ('Weekly analysis & zones','Weekly bias review','Daily analysis & zones','Trade only pre-marked zones');
-- delete from public.settings where scope='global' and key like 'physical.%';
-- delete from public.knowledge_base where category in ('area-playbook','sales-template','physical-funnel','marketing-rule');
-- delete from public.research_library where domain='city';
