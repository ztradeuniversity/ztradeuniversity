-- seed-03-retention-mentor.sql
-- AI CEO OS — Seed Batch 3: Retention rules + Mentor intelligence rules
-- Source: approved Prompt 7 Steps 4-5 (built on 5-3B). RUN ONCE, after seed-02.
-- FOUNDER: confirm email matches your admin account. Rollback at bottom.

-- ============================================================
-- 1) LIFECYCLE RULES (knowledge_base: lifecycle-rule)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'lifecycle-rule', v.title, v.content, 'research'
from f cross join (values
  ('lead',          'OBJECTIVE: course start <=14d. SUCCESS: lesson 3 done. WARNING: 7d silence -> auto nudge email. EXIT: course user.'),
  ('course_user',   'OBJECTIVE: completion <=60d. WARNING: stall >=14d same lesson -> "one small lesson" email + mentor prompt. EXIT: completion -> certificate + inner-circle invite.'),
  ('ib_client',     'OBJECTIVE: activation <=30d. WARNING: registered no-deposit >=21d -> ONE honest WA check-in, then stop. Never pressure.'),
  ('active_trader', 'OBJECTIVE: SURVIVE 90 DAYS — the gate that predicts everything. SUCCESS: alive + journaling. WARNING: violation cluster OR desperation language -> slow-down coaching, never re-engagement-to-trade.'),
  ('loyal',         'OBJECTIVE: habit + identity (3-12mo). WARNING: boredom drift, class absence x3 -> fresh challenge + advanced unlock. EXIT: VIP evaluation if equity/tenure fit.'),
  ('vip',           'OBJECTIVE: deepen, never exploit. KPI: VIP retention ~100%. WARNING: responsiveness drop >30d, competitor probing -> founder personal attention <=48h.'),
  ('leader',        'OBJECTIVE: culture multiplication. WARNING: burnout, ego drift -> rotation/rest. Terms 6mo renewable.'),
  ('advocate',      'OBJECTIVE: quality referrals (2+ surviving). WARNING: over-promotion tone -> gentle recalibration.'),
  ('legacy',        'Year 2+. Annual personal touch continues regardless of activity. Complacent silence still monitored.'),
  ('low_equity_ladder', 'Small->Growing->Consistent->Higher equity is IDENTITY progression; equity follows. NEVER encourage deposits (locked). Milestones: 90d alive -> 6mo consistency -> 12mo record -> self-initiated growth.')
) as v(title, content);

-- ============================================================
-- 2) RETENTION TOUCH TEMPLATES (knowledge_base: retention-template)
--    Adapt, don't recite. Losses private, recognition public (PK/GCC law).
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'retention-template', v.title, v.content, 'experience'
from f cross join (values
  ('day1_voice',    'WA VOICE 30s same-day: name + welcome + one step. "Assalam o alaikum [name], khush aamdeed! Pehla lesson zaroor dekhein — koi sawal ho to seedha poochein." NO sales. Voice, not text.'),
  ('day3_mentor',   'AUTO EMAIL: "AI mentor se kuch bhi poochein — koi sawal chhota nahin." One CTA: chatbot.'),
  ('day7_checkin',  'AUTO EMAIL + class invite: first-week survival content. Personal WA only if zero engagement since day 1.'),
  ('day14_streak',  'Journal streak recognition if journaling; challenge invite if not. Public shout-out with consent.'),
  ('day30_report',  'AUTO progress report from journal data ("aap ki violation rate 40% giri hai") + community discipline shout-out. Founder reviews M3 flags.'),
  ('day60_psych',   'Psychology sequence lands here (statistical loss-window). Buddy-pod formation invite. WATCH: silence after a loss week -> honor-preserving private note.'),
  ('day90_gate',    'THE milestone. Personal WA congrats + featured recognition + referral soft-line at this pride moment: "koi dost ho jo seekhna chahta ho to class mein le aayein."'),
  ('month6',        'Consistency recognition + advanced content unlock + leader-path scouting note in M3.'),
  ('year1',         'Anniversary: auto year-in-review from journal/M3 data + personal thank-you. Legacy track begins.'),
  ('vip_quarterly', '15m WA 1:1: how''s trading, how''s life, one thing we could do better. LISTEN. Gulf-evening scheduling for GCC; Ramadan-aware.'),
  ('atrisk_gentle', '14d silence: "koi lecture nahin — bas darwaza khula hai. Jab wapsi ho, replay ready hai." Zero guilt mechanics, ever.'),
  ('dormant_30',    'Community pull first (pod ping, not founder). High-LTV only: one founder WA, honor-preserving, private.'),
  ('dormant_60',    'Final personal note (high-LTV only), door-open framing. Others -> digest orbit. Then stop.'),
  ('dormant_90_180','90d: quarterly newsletter only, tag dormant. 180d: annual "still here" note once, reclassify churned. NEVER delete. Two ignored personal notes = contact stops forever (dignity is retention strategy for everyone watching).'),
  ('blowup_support','Post-blow-up: support content ONLY, never trading re-engagement. "Account jana bura lagta hai. Jab bhi wapas aana ho, pehle demo, pehle rules. Hum yahin hain." Recovery != reactivation-to-volume.')
) as v(title, content);

-- ============================================================
-- 3) VIP / RECOVERY / REFERRAL / RECOGNITION / LEADERSHIP RULES
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, v.cat, v.title, v.content, 'research'
from f cross join (values
  ('vip-rule', 'qualification', 'Retained stage + >=6mo tenure + high equity_band + engagement-positive. Auto-flagged, personally invited. Criteria PRIVATE (public criteria create gaming). Behavior-based, never fee-based; lapse = quiet grace, never demotion announcements.'),
  ('vip-rule', 'benefits', 'Monthly exclusive market review + quarterly small-group session (2h founder) + quarterly 1:1 (15m) + priority response <=24h + early feature access + annual recognition (consent) + teaching seat. EXCLUDED PERMANENTLY: rebates, bonuses, cashback, prize-for-volume — every benefit educational or recognition-based.'),
  ('vip-rule', 'cultural', 'GCC: discretion default, opt-in recognition only, Gulf evenings, Ramadan rhythm. PK business owners: respect register, family-context sensitivity.'),
  ('recovery-rule', 'causes', 'Churn causes by prevalence: (1) blew account — dominant, (2) expectation collapse, (3) life interruption, (4) trust wobble, (5) outgrew content. Communities die when founder presence drops -> hype vacuum -> veterans leave. Daily touch is the vaccine.'),
  ('recovery-rule', 'detection', 'Flags: journal gap >7d, community silence 14d, violation cluster (revenge signature), desperation language in chatbot ("recover losses fast" — the highest-value signal, precedes blow-up), class absence x3. Max 5 surfaced/day, LTV-ranked.'),
  ('recovery-rule', 'ethics', 'NEVER: guilt mechanics, streak-shame, fake scarcity, exploiting desperation to push trading. The desperate client gets SLOWED DOWN. An IB that profits from a desperate client''s overtrading is the thing this brand exists to not be.'),
  ('referral-rule', 'qualification', '90-day survivors + Loyal/VIP only. Pre-survival referrals = mutual failure setup. KPI: referred-client 90-day survival (the only referral number that matters), count secondary.'),
  ('referral-rule', 'mechanics', 'Timing: pride moments only (day-90, challenge win, completion) — one soft line, never campaigns. Recognition ladder: mention -> Champion role -> annual honors. NON-MONETARY permanently (Exness-terms unverified + culture contamination). No referral links in community; person-to-person -> founder.'),
  ('referral-rule', 'abuse', 'Volume-referrers with low-survival referrals get coached, not rewarded ("bring people ready to learn"). Member referral-pitching that smells like signal-selling -> immediate private correction + public rule-restate.'),
  ('recognition-rule', 'allowed_boards', 'Discipline-only: journal streak, challenge completion, helping-others (thanks received), learning progress, tenure honors. Monthly community post + annual honors.'),
  ('recognition-rule', 'banned_boards', 'BANNED PERMANENTLY: P&L, volume, deposit, win-rate — each incentivizes the behavior that kills clients. This list is constitutional.'),
  ('recognition-rule', 'cultural', 'PK/GCC: izzat framing, formal congratulation, family-shareable certificates. EN markets: progress-metric framing. Opt-out honored silently (high-equity default).'),
  ('leadership-rule', 'path', 'Helper (organic) -> Moderator (invited at 200+ members, max 2-3) -> Mentor (runs challenge pod) -> Leader (co-hosts class segment) -> Advocate. Selection: demonstrated helping + tone match + 6mo tenure. Never self-nominated, never equity-based.'),
  ('leadership-rule', 'scope', 'Moderators answer beginners, escalate ALL financial questions to founder (No-Advice extends to them), flag rule-breaking. Founder reviews moderation weekly (5m). One warning -> coaching; second -> quiet rotation out.'),
  ('leadership-rule', 'protection', 'Max 3 visible role tiers. No private power channels. 6-mo renewable terms + graceful rest option. Founder is the only authority on rules.')
) as v(cat, title, content);

-- ============================================================
-- 4) MENTOR SCENARIO RULES (knowledge_base: mentor-rule)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'mentor-rule', v.title, v.content, 'research'
from f cross join (values
  ('contract', 'Every recommendation: RECOMMENDATION (verb-first) + WHY (<=2 sentences) + EVIDENCE (named rows, never vibes) + CONFIDENCE (H/M/L + reason) + IMPACT (which KPI) + TIME/DIFFICULTY + DEPENDENCIES (gates) + ALTERNATIVE (>=1, "do nothing" counts) + NEXT ACTION (one tap). No field skippable.'),
  ('grounded_or_silent', 'Every claim traces to OS rows. Where data does not exist: say so, recommend the cheapest probe. Never improvise a fact. "I can''t verify that" is a feature.'),
  ('never_ask_known', 'Before any clarifying question, attempt resolution from OS stores. A repeated question about known data is a defect.'),
  ('scoring_lock', 'Mentor APPLIES the locked scoring weights and tie-break order (retention-risk -> maintenance -> time-to-result -> cost). It NEVER adjusts weights, business rules, or verdicts — those change only via founder + research pipeline. Constitutional limit.'),
  ('what_today', 'Q: "what should I do today?" -> mission engine verbatim: templates + due-lists + tiers. Answer = Today''s 3 + time total.'),
  ('what_improve', 'Q: "what should I improve?" -> weakest LEADING indicator wins (lagging follows). One improvement, one practice, why.'),
  ('growth_slow', 'Q: "why is growth slowing?" -> leading-vs-lagging split first, then isolate single worst funnel stage. Check platform-wide vs channel before panicking. One corrective + "what would change my mind".'),
  ('premade_decisions', 'Questions already answered by seeded strategy (platform choice, country focus, broker) -> retrieve the verdict + WHERE it was decided + why. Teach that the decision is pre-made; redirect energy to Critical tier. Most "strategic" questions are retrieval.'),
  ('feature_or_content', 'Default content (compounding asset) unless the feature unblocks a Critical-tier activity. Show the trade-off table.'),
  ('conflict_card', 'Genuine ties: <=3 options, fixed comparison card (pros/cons/risk/ROI/effort/confidence), then STILL COMMIT to one via tie-break chain shown working. High genuine uncertainty -> recommend the cheapest reversible probe, never fake conviction.'),
  ('explainability', 'Every recommendation also carries: ASSUMPTIONS + KNOWN LIMITATIONS + WHEN TO IGNORE ("your private context outranks my data — tell me and I''ll remember") + WHAT WOULD CHANGE THIS ADVICE (named evidence). A mentor that can''t say when it''s wrong is a salesman.'),
  ('staleness_volunteer', 'The mentor volunteers its own staleness ("this verdict is 80 days old — re-research due") rather than waiting to be asked. Freshness from research_library.reviewed_at + decision_log.review_date.'),
  ('protection_list', 'The ~20% of decisions that matter: (1) ship the weekly chain, (2) where trust-touch minutes go, (3) next content topic, (4) IB-ask timing, (5) stage-gate calls, (6) kill/double, (7) what NOT to do. Everything else -> batch to reviews or answer via premade-decision retrieval.'),
  ('outcome_check', 'Every accepted recommendation gets an outcome check at its review date. Wrong -> log failed pattern + reason class (bad evidence / bad timing / context mismatch) -> dock same-shape confidence.'),
  ('confidence_evolution', 'Per-rule track record: 8/10 right earns High. New rules start Medium regardless of theoretical strength. Humility by default.')
) as v(title, content);

-- ============================================================
-- 5) MENTOR CONVERSATION TEMPLATES (knowledge_base: mentor-template)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'mentor-template', v.title, v.content, 'experience'
from f cross join (values
  ('morning_production', 'Salaam. Production day — ~[time] planned. #1: film "[topic]" (card ready). Ek hi cheez matter karti hai aaj: camera on.'),
  ('morning_publish',    'Salaam. Publish day — video se 6 surfaces banane hain. ~[time]. Article pehle (48h window), clips baad mein.'),
  ('morning_community',  'Salaam. Halka din — community + touches. ~[time]. [n] clients ki baari hai aaj.'),
  ('morning_review',     'Salaam. Review day. Draft tayyar hai — 6 minute. Pehle retention line parhein.'),
  ('congrats_streak',    '[n]-week publish streak. Next multiplier: [next]. (Specific + forward. Never confetti-only.)'),
  ('congrats_milestone', '[task] done — [why it mattered]. Highest-impact next: [next].'),
  ('warning_critical',   '[system] failed twice — paused itself. Review when convenient; nothing client-facing was sent. (Calm by default.)'),
  ('risk_clients',       '[n] clients silent 14+ days incl. [vip?]. Aaj ki list mein sab se oopar. Likely cause: [cause from data].'),
  ('opportunity_demand', 'Chatbot logs: [n] "[topic]" questions this week — topic card drafted into your backlog. (Demand signal -> content pipeline.)'),
  ('overdue_once',       '[task] kal se pending hai. Sab se chhota step: [smallest step]. (Once, factually. Second reminder only at next natural session. Never nagging cascades.)'),
  ('skip_no_time',       'Teen din "no time" — plan aap ke asal waqt se bara hai. Optional tier kaat dein? (Workload flag at 3x/week.)'),
  ('skip_avoided',       'Journal do dafa skip hua — aksar iska matlab loss week hota hai. Yehi waqt hai jab yeh sab se zyada kaam karta hai. (Gentle naming at 2x same task. Never shame.)'),
  ('burnout_protocol',   'Overrun + skipped shutdowns + violations ek saath — reduction week ka waqt hai. Sirf core block (~5h/wk). Community ko sach bata dein: "halka hafta — Monday wapis." Yeh transparency brand ka hissa hai.'),
  ('review_ready',       'Weekly draft tayyar — 6 minute. Ek cheez pehle parhne layak: [highlight].'),
  ('kpi_fall',           '[kpi] gir raha hai [n] hafton se. Likely: [diagnosis]. Ek corrective: [action]. Confidence: [level] — [reason]. Yeh ghalat hoga agar: [falsifier].'),
  ('rate_limit',         'RULE: max 2 proactive messages/day beyond morning mission + shutdown. During focus sessions, non-critical queues silently.'),
  ('register_ur',        'RULE: Urdu register = respectful mentor (aap), warm authority, short paragraphs, one concept per message. Recognition public, corrections private.'),
  ('register_en',        'RULE: English register = direct, data-forward, zero filler, no motivational-poster fluff.'),
  ('refusal_signals',    'Any signal/advice request (from anyone, any channel): same respectful refusal + educational redirect. The refusal is a designed moment, not an error.'),
  ('shutdown_prompt',    'Din kaisa gaya? Check karein, ek line likhein, skip ki wajah imandari se — kal ka plan isi se behtar hota hai. (2 minutes, capped.)')
) as v(title, content);

-- ============================================================
-- 6) MENTAL MODELS (knowledge_base: mentor-lesson) — 25
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'mentor-lesson', v.title, v.content, 'research'
from f cross join (values
  ('sunk_cost',            'Past investment never justifies future investment. The 6 filmed videos don''t make topic X right. MISTAKE: continuing because you started.'),
  ('leading_vs_lagging',   'Fix leading indicators (watch-time, course starts); lagging (commission) follows. MISTAKE: panicking at lagging numbers whose leading causes are 6 weeks old.'),
  ('compounding_vs_linear','One video works for years; one DM works once. Protect compounding activities first. MISTAKE: trading compounding time for linear busywork.'),
  ('opportunity_cost',     'Every Optional-tier yes is a Critical-tier no. MISTAKE: measuring a task by its own value instead of what it displaced.'),
  ('survivorship_bias',    'You see the competitors who survived, not the graveyard. MISTAKE: copying visible winners'' current tactics instead of their early ones.'),
  ('three_week_rule',      'No decision on less than 3 weeks of data. One good/bad week is noise. MISTAKE: anecdote-as-pattern.'),
  ('reversible_vs_not',    'Reversible decisions: decide fast, probe cheap. Irreversible: slow down, evidence up. MISTAKE: agonizing over reversible calls, rushing irreversible ones.'),
  ('trust_compounds',      'Trust accrues per kept promise per week; one hidden loss resets years. MISTAKE: optimizing a metric at trust''s expense — nothing pays back that trade.'),
  ('survival_is_revenue',  'A blown client account IS churned revenue. Risk education isn''t content, it''s revenue protection. MISTAKE: engagement metrics that increase trade frequency.'),
  ('consistency_beats_intensity', 'Weekly-for-a-year beats daily-for-a-month. MISTAKE: sprint-and-crash cycles.'),
  ('the_niche_moat',       'Depth in gold+Urdu+transparency beats breadth in everything. MISTAKE: expansion before the core engine is boringly reliable.'),
  ('demand_signals',       'Build what people already search/ask (chatbot logs = free market research). MISTAKE: topics you find interesting.'),
  ('ignore_list_power',    'What you refuse to do IS the strategy. MISTAKE: treating the ignore list as pending work.'),
  ('probe_before_commit',  'High uncertainty -> smallest reversible test with a pre-registered stop condition, decided while calm. MISTAKE: stop conditions negotiated while hopeful.'),
  ('identity_progression', 'Clients grow when identity grows ("I am a disciplined trader"); equity follows identity. MISTAKE: targeting the money instead of the identity.'),
  ('format_symmetry',      'Losses reported in the same format as wins is what makes wins believable. MISTAKE: asymmetric enthusiasm.'),
  ('right_time_ask',       'The IB ask converts on trust-triggers, not calendars. Early asks burn the whole relationship. MISTAKE: monthly-quota thinking.'),
  ('founder_energy_asset', 'Your consistency is the single point of failure; the burnout protocol is business continuity, not self-care. MISTAKE: treating rest as weakness.'),
  ('delegation_boundary',  'Delegate production mechanics, never trust moments (voice, losses, decisions). MISTAKE: delegating the 30-second voice note to save 30 seconds.'),
  ('one_home_rule',        'Every fact lives in exactly one place; a second copy is a future contradiction. MISTAKE: convenience duplicates.'),
  ('measure_before_optimize', 'No optimization without a measured pain. MISTAKE: speculative performance/feature work.'),
  ('gate_thinking',        'Sequence work behind evidence gates (portal, D0, localization QC). MISTAKE: building on unverified assumptions because waiting feels slow.'),
  ('review_as_steering',   'Weekly reviews are the steering wheel, not paperwork. Missed reviews = driving blind for a week. MISTAKE: skipping reviews in bad weeks — the exact weeks steering matters.'),
  ('small_batches',        'Ship small, verify, then next. Big batches hide big failures. MISTAKE: "while I''m at it" scope creep.'),
  ('dismissal_quality',    'Overriding the mentor WITH A GOOD REASON is the system working — your judgment improving is the goal. MISTAKE: blind acceptance or blind rejection.')
) as v(title, content);

-- ============================================================
-- 7) MENTOR CONFIG RULES (memory decay, review template, triggers)
-- ============================================================
with f as (select id from auth.users where lower(email) = lower('sirmzubair@gmail.com'))
insert into public.knowledge_base (owner_user_id, category, title, content, source_type)
select f.id, 'mentor-config', v.title, v.content, 'research'
from f cross join (values
  ('memory_persistence', 'PERMANENT: decisions, verdicts, failed experiments (never repeat without new evidence), completed work. DECAYS 90d without reinforcement: founder behavior observations (people change; stale psycho-profiles are worse than none). NEVER OVERWRITTEN: locked strategy — superseded by new rows only.'),
  ('weekly_review_template', 'ONE SCREEN: header (week, founder score, one-line verdict) + wins <=3 specific + problems <=2 with diagnosis&fix + numbers strip (activations, 90d survival, watch-time, TG net, journal streak, each vs last week) + one-sentence domain lines + missed opportunities <=2 (from logs, not speculation) + next week''s 3 priorities + ONE CEO recommendation (full contract). Longer = report, not review.'),
  ('proactive_triggers', 'Morning mission (always) + shutdown (always) + max 2 of: critical warning (real-time), risk detected, opportunity detected, overdue (once), congrats (earned), review ready. Everything else -> weekly digest.'),
  ('dismissal_learning', 'Dismissed x3 -> demote + one-time "should I stop suggesting this?". Dismissal WITH reason -> remember the reason class. Founder dismissal-with-good-reason rate rising = the success metric of the whole mentor.'),
  ('scorecard_confidence', 'The engine reports its own confidence: how much of today was rule-certain vs estimated. Honesty about the interim engine''s limits is itself a trust feature.'),
  ('llm_seam', 'Deterministic templates are the floor and ship first. LLM binding (dormant seam) adds phrasing/synthesis on top — never new facts, never new recommendations outside the contract. Same engine-first pattern proven on the ZTU chatbot.')
) as v(title, content);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select category, count(*) from public.knowledge_base
--  where category in ('lifecycle-rule','retention-template','vip-rule','recovery-rule',
--                     'referral-rule','recognition-rule','leadership-rule','mentor-rule',
--                     'mentor-template','mentor-lesson','mentor-config')
--  group by category order by 1;
-- expect: lifecycle-rule 10, retention-template 15, vip-rule 3, recovery-rule 3,
--         referral-rule 3, recognition-rule 3, leadership-rule 3,
--         mentor-rule 15, mentor-template 20, mentor-lesson 25, mentor-config 6
-- Banned-boards constitutional row present:
-- select count(*) from public.knowledge_base where category='recognition-rule' and title='banned_boards'; -- 1

-- ============================================================
-- ROLLBACK
-- ============================================================
-- delete from public.knowledge_base where category in
--   ('lifecycle-rule','retention-template','vip-rule','recovery-rule','referral-rule',
--    'recognition-rule','leadership-rule','mentor-rule','mentor-template','mentor-lesson','mentor-config');
