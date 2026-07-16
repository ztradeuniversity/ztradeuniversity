// functions/utils/ceo/execution-kits.js
//
// Ready-to-execute guidance per cadence activity (Section 2, "the founder
// never invents content"). Each kit ships concrete questions, messages,
// scripts, CTAs, follow-ups, and mistakes-to-avoid — written in the system's
// own working voice (Roman-Urdu + English, matching the seeded templates)
// and grounded in the seeded playbooks: CTA rules ("free course, never
// deposit", 1/3 posts no-ask), culture rules (losses private / recognition
// public, aap register, no urgency), and the No-Advice line (education,
// never signals). Static by design — this is curated copy, not generated
// text, so it can be audited line-by-line like any other seed content.

export const EXECUTION_KITS = {
  'daily.community_touch': {
    questions: [
      '"Aaj gold ne London open par kya kiya — kisi ne notice kiya? Kyun hua yeh move?"',
      '"Aap ka sab se bara trading dar kya hai: loss, ya galat waqt par entry?"',
      '"Ek beginner ko aap sirf EK cheez sikha saktay to kya sikhatay?"',
    ],
    message: 'Educational post template: "📊 [Aaj ka lesson]: <1 concept, 3 lines, ek chart ya misaal>. Sawal? Neeche poochein — har sawal ka jawab milta hai." (1/3 posts mein koi ask nahin — sirf value.)',
    cta: 'Free course link — deposit ka zikr KABHI nahin. Interested member ko: "Pehle free course dekh lein, phir baat karte hain."',
    followUp: 'Jo member 2+ sawal pooche ya course complete kare → WhatsApp personal message (IB follow-up list mein le jayein).',
    mistakes: 'Broadcast-only mode; publicly behas karna; signal maangne par oblige karna (re-anchor to education); reply 24h se late.',
    timing: 'Evening 7–11pm PKT — PK aur GCC dono peak.',
    expected: '~2 qualified conversations; reply-rate up; culture = presence.',
  },
  'daily.technical_analysis': {
    message: 'Post template: "🔍 Gold (XAUUSD) aaj: <level 1> support / <level 2> resistance. Structure: <1 line>. Yeh analysis hai, signal NAHIN — apna risk khud manage karein." Chart screenshot ke saath.',
    script: 'Levels kaise chunein: pichle session ka high/low + daily open. Sirf woh 2-3 levels jo khud chart par saaf dikhein.',
    cta: '"Yeh levels kaise nikaltay hain? Free course ke lesson 4 mein pura tareeqa."',
    followUp: 'Jis reply mein genuine confusion ho → us concept ka ek chhota explainer agle din ke post ka topic ban jaye.',
    mistakes: 'Prediction/signal language ("buy now", "target pakka"); 5+ levels (noise); dusron ke analysis par tanqeed.',
    timing: 'Session overlap 6–8pm PKT — gold sab se active.',
    expected: '1 authority post; saved/forwarded replies; "yeh banda samajhta hai" positioning.',
  },
  'daily.retention_touches': {
    message: 'Day-1 voice note (30 sec): "Assalam-o-alaikum <naam>, welcome! Main khud available hoon — pehla lesson dekh lein, koi sawal ho to seedha poochein." Koi sales line NAHIN.',
    script: 'Milestone touches: due-list kholein → segment-matched template uthayein → apne lafzon mein adapt karein (recite nahin) → personal bhejein → touch log karein.',
    cta: 'Koi CTA nahin — retention touch ka maqsad rishta hai, conversion nahin. (Ladder khud conversion laata hai.)',
    followUp: 'At-risk (14d+ silent): "Kaafi din ho gaye — sab theek? Koi cheez atak gayi ho to batayein, bina jhijhak."',
    mistakes: 'Copy-paste sameness; public mein kisi ke loss ka zikr (losses PRIVATE, recognition PUBLIC — kabhi ulta nahin); touch defer karna 24h se zyada.',
    timing: 'Community block ke foran baad — warm hands se.',
    expected: 'Due-list clear; Day-7 activity of welcomed clients measurably higher.',
  },
  'daily.ib_followups': {
    script: 'Trigger check pehle: course done + community-active + real broker question, YA ~30 din engaged. Trigger nahin = message NAHIN. Phir WA personal: "Aap ne course complete kar liya — agla qadam chahen to jahan hum khud trade karte hain, wahan verified setup mil sakta hai. Koi jaldi nahin, sawal ho to poochein."',
    cta: '"Jab tayyar hon, batayein — main setup verify karwa doonga." (Frame: verification + supervision, kabhi pressure nahin.)',
    followUp: 'Hesitation dikhe → "koi jaldi nahin" likh kar WAIT karein. 7 din baad sirf value-touch (koi ask nahin).',
    mistakes: 'Funnel-blast; urgency tactics (instant trust detonation); pehli baat mein broker ka naam; objection par behas (audience card ka jawab use karein).',
    timing: 'Evening 8–10pm — decision conversations raat ko landti hain.',
    expected: '1 flagged conversation ek stage aage; trust intact chahe jawab "na" ho.',
  },
  'daily.physical_outreach': {
    script: 'Visit script: (1) Intro — "Z Trade University — hum gold/crypto ki education dete hain, [area] mein free class offer kar rahe hain." (2) Free class offer — institute ke students ke liye, unki jagah par. (3) Warm ho to proposal same visit mein hand-over. (4) Contact person ka naam+number lein.',
    message: 'Follow-up call: "Assalam-o-alaikum <naam> sahab, pichle hafte proposal diya tha — koi sawal ho to main aa kar demo class bhi kara sakta hoon, bilkul free."',
    cta: 'Free demo class — institute ke liye zero cost, unke students ke liye value. Deposit/trading ka zikr pehli meeting mein kabhi nahin.',
    followUp: 'Har visit ke baad USI din CRM mein log + next follow-up date set. Bina date ke visit = adhoora visit.',
    mistakes: 'Bina appointment bara institute; pehli meeting mein commission structure; follow-up date miss; ek area chhor kar doosre mein bhaagna (cycle ka order follow karein).',
    timing: '10am–1pm — institute office hours, decision-makers available.',
    expected: '1–2 institutes contacted; har contact CRM mein with follow-up date.',
  },
  'weekly.film_video': {
    script: 'Structure (10-bullet outline pehle): Hook (sawal jo title hai) → 3 teaching points → ek real chart example → recap → CTA. EK take, imperfect fine — polish > consistency ka dushman hai.',
    cta: '"Poora seekhna hai to free course — link description mein." Kabhi deposit CTA nahin.',
    followUp: 'Upload ke foran baad: title/thumbnail = wohi sawal jo target audience Google/YouTube par likhta hai.',
    mistakes: 'Re-recording for polish; 3 topics 1 video mein; income-claim thumbnail (trust detonation); missed week par give-up (recovery: 10-min chhota video).',
    timing: 'Morning deep-work block — messages khulne se pehle.',
    expected: '1 long-form filmed; watch-time >40% target.',
  },
  'weekly.publish_chain': {
    script: 'Chain: transcript → GEO article draft (2500–4000w pillar ya cluster) → founder polish (AI draft ko kabhi raw publish nahin) → publish → 3–5 clips cut → TG/FB/IG queue → digest mention.',
    cta: 'Article ke andar: free course + related lessons ke internal links.',
    followUp: 'Agla din check: article indexed? Clips posted? Ek bhi surface missed to aaj poora karein.',
    mistakes: 'Article skip karke sirf clips (compounding half wohi hai); unpolished AI draft publish karna.',
    timing: 'Production day ke agle morning.',
    expected: 'Article live ≤48h after video; ek effort, chhe surfaces.',
  },
  'weekly.live_class': {
    script: 'Format fixed: 30m teach (is hafte ka pillar topic) → 15m honest market review vs PUBLIC track record (losses bhi, same format) → 15m Q&A → replay TG par pin.',
    cta: 'Class ke end par: "Agla step free course hai — jinhon ne complete kar liya, woh mujhse personal baat kar sakte hain."',
    followUp: 'Attendance list se: jo 2+ classes aya + course done → IB follow-up trigger list.',
    mistakes: 'Performance claims; time se zyada lambi class; illness par silent skip (announce karein, kabhi silent nahin).',
    timing: 'Saturday evening fixed slot — ritual hi retention hai.',
    expected: 'Attendance + replay views; weekly conversion moment.',
  },
  'weekly.review': {
    script: 'Draft parhein → wins/problems confirm ya edit karein → numbers strip check → agle hafte ka Focus chunein (offered 3 mein se) → complete mark karein.',
    followUp: 'Jo problem 2 hafte repeat ho woh agle hafte ka Focus banna chahiye — automatic.',
    mistakes: 'Bure hafte par skip (wohi hafta hai jab yeh sab se zyada kaam karta hai).',
    timing: 'Friday close of day.',
    expected: 'Review complete; next week Focus locked.',
  },
  'weekly.kpi_entry': {
    script: 'M1 kholein → is hafte ki manual values enter karein (source=manual) → threshold states par nazar.',
    mistakes: 'Andaza lagana bajaye check karne ke — estimated KPI jhooti trend banati hai.',
    timing: 'Review block ke andar.',
    expected: 'kpi_history mein koi gap nahin — Monthly AI Review inhi numbers se chalta hai.',
  },
  'weekly.email_digest': {
    message: 'Founder paragraph template: "Is hafte maine <1 cheez jo seekhi/dekhi>. <2 lines>. Is hafte ki class ka replay: <link>."',
    mistakes: 'Digest ko sales letter banana — ek paragraph, ek insight, bas.',
    timing: 'Review block ke andar.',
    expected: 'Opens + class attendance from email.',
  },
  'weekly.learning_slot': {
    script: 'Reading queue kholein → 30 focused minutes → EK applicable note save karein (M5).',
    timing: 'Koi bhi low-energy slot — freely movable.',
    expected: '1 applied insight per week.',
  },
};

// Gated/rejected channels (paid promotion, TikTok) — the kit states the gate
// honestly instead of pretending the channel is active. Surfaced on roadmap
// days that mention them.
export const GATED_CHANNEL_KITS = {
  paid_promotion: {
    script: 'GATE: paid opens at the 300-activated-clients stage review, capped-CAC probes only. Tab tak: PKR 0. Jab khule: ek platform (FB Ads PK), ek audience (course-completers lookalike), chhota daily cap, CAC target pehle likhein — phir campaign.',
    mistakes: 'Gate se pehle paid chalana (organic trust engine ko bypass karta hai aur CAC ka koi baseline nahin hota).',
  },
  tiktok: {
    script: 'Locked verdict: TikTok native = REJECT. Auto-repost at literally zero effort ya kuch nahin. Paid kabhi nahin (category banned).',
    mistakes: 'TikTok par native content banana — opportunity-cost analysis parhein pehle.',
  },
};
