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

// SOP layer (Hand-Holding Mode): every kit is merged with its SOP block
// below — objective, targeting, quality/completion checklists, risks (with
// how to avoid each), and the next action. Merged at export time so
// mission.js keeps reading EXECUTION_KITS[key] unchanged.
const SOP = {
  'daily.community_touch': {
    objective: 'Keep the community alive and surface 1–2 IB-ready members',
    platform: 'Telegram (+ WhatsApp circle)', country: 'Pakistan + GCC', language: 'Urdu / Roman-Urdu',
    quality: ['Har sawal ka jawab hua (<24h)', 'Post mein 1 concrete example/chart tha', 'Tone: ustaad, salesman nahin'],
    completion: ['1–2 posts published', 'Replies cleared', 'Interested members noted for follow-up'],
    nextAction: 'Flagged members → IB follow-up list (kal ke daily.ib_followups mein)',
    risks: ['Spam risk: 1/3 posts NO-ask rule todna — CTA har post mein daalne se group mute hota hai', 'Low engagement: sirf broadcast — sawal poochein, jawab par reply karein', 'Compliance: signal-jaisi language — sirf education framing'],
  },
  'daily.technical_analysis': {
    objective: 'Daily authority proof — "yeh banda market samajhta hai"',
    platform: 'Telegram (repost: FB)', country: 'Pakistan + GCC', language: 'Urdu / Roman-Urdu',
    quality: ['Levels chart par khud dikhte hain', 'Explicit "signal nahin" line shamil', '2 lines se lamba nahin'],
    completion: ['Post live with chart', 'Replies answered'],
    nextAction: 'Confused reply = kal ke explainer post ka topic',
    risks: ['Compliance risk: prediction language ("target pakka") — hamesha probability framing', 'Wrong timing: session ke baad post — 6–8pm PKT window rakhein'],
  },
  'daily.retention_touches': {
    objective: 'Zero silent clients — retention IS the 50k engine',
    platform: 'WhatsApp', country: 'Pakistan + GCC', language: 'Urdu (voice notes)',
    quality: ['Har touch personal tha (template adapt hua, recite nahin)', 'Day-1 voice notes same-day'],
    completion: ['Due-list empty', 'Har touch CRM mein logged'],
    nextAction: 'At-risk jawab na de → 3 din baad ek aur value-touch, phir founder review',
    risks: ['Audience mismatch: high-equity client ko beginner template — segment check pehle', 'Culture risk: public loss mention — losses PRIVATE hamesha'],
  },
  'daily.ib_followups': {
    objective: 'Move 1 trust-ready conversation one stage forward',
    platform: 'WhatsApp personal', country: 'Pakistan + GCC', language: 'Urdu',
    quality: ['Trigger verified pehle (course done + active + broker question)', 'Koi pressure line nahin'],
    completion: ['Conversation logged with stage transition (ya honest "not ready")'],
    nextAction: 'Stage badla → Day-1 onboarding voice note schedule karein',
    risks: ['Trust detonation: urgency tactics — "koi jaldi nahin" hamesha available rakhein', 'Weak CTA: broker pehli line mein — pehle verification framing'],
  },
  'daily.physical_outreach': {
    objective: 'Convert today\'s area into logged institute relationships',
    platform: 'In-person / phone', country: 'Pakistan (current cycle area)', language: 'Urdu',
    quality: ['Contact person ka naam+number mila', 'Free-class offer diya, deposit ka zikr nahin'],
    completion: ['Har visit CRM mein with next follow-up date'],
    nextAction: 'Warm institute → proposal same week; Plan page par visit log karein',
    risks: ['Execution delay: follow-up date ke bina visit — date lazmi', 'Wrong audience: sirf reception se baat — decision-maker tak pahunchein'],
  },
  'weekly.film_video': {
    objective: 'The compounding asset — one video feeds six surfaces',
    platform: 'YouTube', country: 'Pakistan + GCC', language: 'Urdu (Roman-Urdu title)',
    quality: ['Ek topic, ek take', 'Title = audience ka asal sawal', 'Thumbnail = question text'],
    completion: ['Uploaded + scheduled', 'Topic backlog se laya gaya (demand signal ke sath)'],
    nextAction: 'Kal publish chain: transcript → article + clips',
    risks: ['Budget waste (time): polish-perfectionism — ONE take rule', 'Audience mismatch: 3 topics 1 video — ek sawal ek video'],
  },
  'weekly.publish_chain': {
    objective: 'Multiply yesterday\'s video into 6 surfaces',
    platform: 'Website (GEO) + TG/FB/IG/TikTok reposts', country: 'Pakistan + GCC', language: 'Urdu + EN title/meta',
    quality: ['Article founder-polished (raw AI draft kabhi nahin)', 'FAQ schema check'],
    completion: ['Article live ≤48h', '3–5 clips queued', 'TikTok/IG auto-repost fired'],
    nextAction: 'Digest mention likhein (review day)',
    risks: ['SEO waste: article skip karke sirf clips — compounding half article hai'],
  },
  'weekly.live_class': {
    objective: 'The weekly ritual + conversion moment',
    platform: 'Live (YouTube/TG)', country: 'Pakistan + GCC (Gulf evening timing)', language: 'Urdu',
    quality: ['Track-record review honest tha (losses same format)', 'Q&A mein har sawal ka jawab'],
    completion: ['Class hui + replay TG par pinned', 'Attendance noted'],
    nextAction: '2+ attendance + course done wale → IB follow-up trigger list',
    risks: ['Trust risk: sirf wins dikhana — format symmetry hi credibility hai', 'Poor timing: slot badalna — fixed slot ritual hai'],
  },
  'weekly.review': {
    objective: 'The accountability spine — plan learns from the week',
    platform: 'Founder OS', country: '—', language: '—',
    quality: ['Numbers strip dekha, andaza nahin', 'Focus 3 options mein se chuna'],
    completion: ['Review marked complete', 'Next week Focus locked'],
    nextAction: 'Focus item ko agle hafte ke Top-3 mein pehla rakhein',
    risks: ['Execution delay: bure hafte par skip — wohi hafta sab se zaroori hai'],
  },
  'weekly.kpi_entry': {
    objective: 'No KPI gaps — the Monthly AI Review runs on these numbers',
    platform: 'Founder OS', country: '—', language: '—',
    quality: ['Values checked, estimated nahin'], completion: ['Is hafte ki har manual KPI darj'],
    nextAction: 'Threshold red ho → usi waqt review note likhein',
    risks: ['Data risk: estimate — jhooti trend future planning kharab karti hai'],
  },
  'weekly.email_digest': {
    objective: 'Retention rails: one founder paragraph, sequences do the rest',
    platform: 'Email', country: 'Pakistan + GCC', language: 'Urdu-English mix',
    quality: ['Ek insight, ek paragraph', 'Replay link shamil'], completion: ['Digest queued'],
    nextAction: 'Open-rate agle review mein check',
    risks: ['Spam risk: sales letter banana — ek insight rule'],
  },
  'weekly.learning_slot': {
    objective: 'One applied insight per week — founder ki growth bhi system hai',
    platform: 'Reading queue (M5)', country: '—', language: '—',
    quality: ['Note actionable hai (kya BADLEGA is se)'], completion: ['1 note saved'],
    nextAction: 'Applicable note → agle review mein test karein',
    risks: ['Time waste: 30m se zyada — freely skippable, guilt nahin'],
  },
};

const KIT_BASE = {
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

// Target Audience + Expected KPI per activity (Section 3) — the two SOP
// fields not already in the base/SOP layers. Kept as a compact map so the
// merge stays one line rather than editing every entry.
const SOP_EXTRA = {
  'daily.community_touch': { audience: 'Community members + warm leads (beginners, small accounts)', kpi: 'Reply-rate ↑, response <24h, 1–2 IB-ready members flagged' },
  'daily.technical_analysis': { audience: 'Gold + crypto traders', kpi: '1 authority post/day; saves & forwards' },
  'daily.retention_touches': { audience: 'Activated + at-risk clients (segment-matched)', kpi: 'Due-list cleared; Day-7 activity of welcomed clients ↑' },
  'daily.ib_followups': { audience: 'Trust-ready members (course done + active + broker question)', kpi: '1 stage advance; zero trust cost' },
  'daily.physical_outreach': { audience: 'Institutes/academies in the current cycle area', kpi: '1–2 institutes contacted, each logged with a follow-up date' },
  'weekly.film_video': { audience: 'Cold + warm (search-intent titles)', kpi: 'Watch-time >40%; course CTR' },
  'weekly.publish_chain': { audience: 'Search intent + social browsers', kpi: 'Article live ≤48h; 3–5 clips queued' },
  'weekly.live_class': { audience: 'Community + course-completers', kpi: 'Attendance + replay views' },
  'weekly.review': { audience: 'Founder (accountability)', kpi: 'Review complete; next-week Focus locked' },
  'weekly.kpi_entry': { audience: 'Founder', kpi: 'No gaps in kpi_history' },
  'weekly.email_digest': { audience: 'Email list', kpi: 'Opens; class attendance from email' },
  'weekly.learning_slot': { audience: 'Founder', kpi: '1 applied insight per week' },
};

// Merge the SOP layers onto each base kit — one export, unchanged consumer
// contract (mission.js reads EXECUTION_KITS[key]).
export const EXECUTION_KITS = Object.fromEntries(
  Object.entries(KIT_BASE).map(([key, kit]) => [key, { ...kit, ...(SOP[key] || {}), ...(SOP_EXTRA[key] || {}) }])
);

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
