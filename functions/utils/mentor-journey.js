// functions/utils/mentor-journey.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 15 — LONG-TERM AI MENTOR RELATIONSHIP LAYER
// A read-only SYNTHESIZER over existing memory (ai_user_profiles, session-memory,
// recentRecap, learning-path, user-journey). It does NOT store anything and does
// NOT duplicate memory — it answers: where the student started, what was recently
// studied, what remains, the current weak area, and the next milestone — so the
// mentor can guide naturally over weeks/months.
//
// Reuses (never modifies): learning-path.LEARNING_PATHS/buildLearningPath,
// user-journey.inferJourneyStage/stageFocus, humanize.vary. Pure (no I/O).
// Language-Lock safe (en / ur / ur-roman / ar).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';
import { buildLearningPath, LEARNING_PATHS } from './learning-path.js';
import { inferJourneyStage, stageFocus } from './user-journey.js';

// ── GOAL INFERENCE (STEP 3) ───────────────────────────────────────────────────
// Infer the student's goal from conversation text — never asked, never stored.
const GOALS = [
  ['prop-challenge', /\b(prop ?firm|funded|ftmo|the5ers|evaluation|payout|pass (the|my|a) (challenge|eval)|drawdown limit)\b/i, 'passing a prop/funded challenge'],
  ['profitability',  /\b(become profitable|be profitable|make money consistently|consistent profit|trade for a living|profitable trader|make it back|grow my account)\b/i, 'becoming consistently profitable'],
  ['reduce-losses',  /\b(stop losing|reduce (my )?loss|cut my losses|losing less|stop blowing|protect my capital|stop the bleeding)\b/i, 'reducing losses and protecting capital'],
  ['psychology',     /\b(control my emotions|trading psychology|discipline|stop revenge|beat fomo|patience|stop overtrading|mindset)\b/i, 'mastering trading psychology'],
  ['learn-gold',     /\b(learn (to trade )?gold|gold trading|master gold|trade xau|understand gold)\b/i, 'learning to trade Gold'],
  ['learn-btc',      /\b(learn (to trade )?(btc|bitcoin)|bitcoin trading|trade crypto)\b/i, 'learning to trade Bitcoin'],
  ['get-funded',     /\b(quit my job|financial freedom|trading career|full ?time trader|live off trading)\b/i, 'building a trading career'],
];

export function inferGoal({ messages = [], recentRecap = [], profile = {} } = {}) {
  // Combine the most recent user text + cross-session recap (reuse conversations).
  const userText = (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.role === 'user').slice(-6).map(m => String(m.content || '')).join(' ');
  const recap = (Array.isArray(recentRecap) ? recentRecap : []).join(' ');
  const goalFact = profile.goal || profile.ai_goal || '';
  const hay = `${userText} ${recap} ${goalFact}`;
  for (const [key, re, label] of GOALS) if (re.test(hay)) return { key, label };
  return null;
}

// ── TOPIC EXTRACTION (local, lean — for recap strings only) ───────────────────
// session-memory already provides lastTopic; this only enriches the cross-session
// recap array. Kept minimal — not a second topic system.
const TOPICS = [
  [/\b(risk|stop ?loss|position siz|lot size|drawdown)\b/i, 'risk management'],
  [/\b(psychology|emotion|fomo|revenge|discipline|patience)\b/i, 'trading psychology'],
  [/\b(market structure|support|resistance|trend|swing)\b/i, 'market structure'],
  [/\b(liquidity|order block|smc|smart money|order flow|fvg|imbalance)\b/i, 'smart-money concepts'],
  [/\b(strategy|setup|entry|confluence|system)\b/i, 'strategy building'],
  [/\b(gold|xau)\b/i, 'Gold trading'],
  [/\b(btc|bitcoin)\b/i, 'Bitcoin trading'],
  [/\b(macro|dxy|yields|cpi|fomc|nfp)\b/i, 'macro context'],
  [/\b(journal|review|backtest)\b/i, 'journaling & review'],
];
function topicsFromRecap(recap = []) {
  const found = [];
  for (const r of recap) {
    for (const [re, label] of TOPICS) {
      if (re.test(String(r || '')) && !found.includes(label)) { found.push(label); break; }
    }
  }
  return found;
}

// Map a weakness key/label to a human-readable area.
const WEAK_LABEL = {
  revenge: 'revenge trading', fomo: 'FOMO', overtrading: 'overtrading',
  hesitation: 'hesitation', fear: 'fear of pulling the trigger',
  'no-stop-loss': 'using a stop loss', 'poor-risk': 'risk sizing', 'no-patience': 'patience',
};
function normalizeWeakArea(sessionMem, profile, traderContext) {
  const raw = sessionMem?.lastWeakArea ||
              (Array.isArray(profile?.weaknesses) && profile.weaknesses[0]) ||
              (Array.isArray(traderContext?.weaknesses) && traderContext.weaknesses[0]) ||
              traderContext?.topWeakness || null;
  if (!raw) return null;
  return WEAK_LABEL[raw] || String(raw);
}

// Stage → index into the 5-step learning path (where the student is now).
const STAGE_INDEX = {
  greeting: 0, beginner: 0, learning: 1, strategy: 2,
  execution: 3, assessment: 3, consistency: 4, profitability: 4,
};

// ── JOURNEY BUILDER (STEP 1) ──────────────────────────────────────────────────
export function buildMentorJourney({
  profile = {}, traderContext = {}, sessionMem = {}, recentRecap = [], messages = [], returning = false,
} = {}) {
  const currentLevel = profile.trader_level || traderContext.level || 'beginner';
  const stage = inferJourneyStage(profile, traderContext);
  const weakArea = normalizeWeakArea(sessionMem, profile, traderContext);

  // Reuse the existing learning path; weight by the active weakness when known.
  const weaknessKey = (Array.isArray(profile.weaknesses) && profile.weaknesses[0]) || traderContext.topWeakness || null;
  const path = buildLearningPath(currentLevel, weaknessKey);

  const idx = STAGE_INDEX[stage] ?? 0;
  const steps = path.steps || [];
  const nextMilestone = steps[Math.min(idx, steps.length - 1)] || null;
  const remaining = steps.slice(Math.min(idx + 1, steps.length));

  // Recently studied = within-thread topic (session-memory) + cross-session recap.
  const recentlyStudied = [];
  if (sessionMem.lastTopic) recentlyStudied.push(String(sessionMem.lastTopic).toLowerCase());
  for (const t of topicsFromRecap(recentRecap)) if (!recentlyStudied.includes(t)) recentlyStudied.push(t);

  const activeGoal = inferGoal({ messages, recentRecap, profile });

  return {
    startLevel: 'beginner',          // honest origin; we don't store history
    currentLevel,
    stage,
    focus: stageFocus(stage),
    path: { title: path.title, focus: path.focus },
    recentlyStudied: recentlyStudied.slice(0, 3),
    weakArea,
    nextMilestone,
    remaining: remaining.slice(0, 3),
    activeGoal,
    returning: !!returning,
    achievements: dedupeAchievements(profile, traderContext),
  };
}

function dedupeAchievements(profile, traderContext) {
  const out = [];
  const add = (x) => { if (x && !out.includes(x)) out.push(x); };
  (Array.isArray(traderContext?.improved) ? traderContext.improved : []).forEach(i => add(`improved ${i}`));
  (Array.isArray(profile?.strengths) ? profile.strengths : []).forEach(s => add(s));
  (Array.isArray(traderContext?.strengths) ? traderContext.strengths : []).forEach(s => add(s));
  return out.slice(0, 4);
}

// ── MENTOR TONE (STEP 4) — adapts emphasis, never switches personality ─────────
export function mentorToneDirective(level = 'beginner') {
  if (level === 'advanced')     return { stance: 'challenging',  note: 'challenge assumptions, deeper thinking' };
  if (level === 'intermediate') return { stance: 'analytical',   note: 'analytical, practice-focused' };
  return { stance: 'protective', note: 'simple, protective, confidence-building' };
}

// ── NATURAL PROGRESS RECALL (STEP 2) ──────────────────────────────────────────
// Occasional, varied, human. Returns '' often so it never feels forced/robotic.
const RECALL = {
  topic: {
    en: [
      t => `You've been working on ${t} recently — let's keep that momentum.`,
      t => `Last time we were on ${t}. Picking up from there:`,
      t => `Good to continue — ${t} is exactly where you've been focused.`,
    ],
    ur: [
      t => `آپ حال ہی میں ${t} پر کام کر رہے تھے — اسی رفتار کو جاری رکھتے ہیں۔`,
      t => `پچھلی بار ہم ${t} پر تھے۔ وہیں سے آگے:`,
    ],
    'ur-roman': [
      t => `Aap haal hi mein ${t} par kaam kar rahe the — isi raftaar ko jaari rakhte hain.`,
      t => `Pichli baar hum ${t} par the. Wahin se aage:`,
    ],
    ar: [
      t => `كنت تعمل مؤخراً على ${t} — لنواصل هذا الزخم.`,
      t => `آخر مرة كنا عند ${t}. لنكمل من هناك:`,
    ],
  },
  progress: {
    en: [
      a => `You're making real progress on ${a} — it shows.`,
      a => `I've noticed your ${a} is steadier than when we started.`,
    ],
    ur: [a => `${a} میں آپ کی واضح بہتری نظر آ رہی ہے۔`],
    'ur-roman': [a => `${a} mein aap ki waazeh behtari nazar aa rahi hai.`],
    ar: [a => `أرى تقدّماً حقيقياً في ${a} لديك.`],
  },
};

export function progressRecall(journey = {}, lang = 'en', seed = '') {
  const topic = journey.recentlyStudied && journey.recentlyStudied[0];
  // Rotate: roughly 1-in-2 turns stays silent so it's never repetitive.
  let h = 0; const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  if (h % 2 === 0) return '';                       // stay quiet — let the answer breathe
  if (!topic) return '';
  const arr = (RECALL.topic[lang] || RECALL.topic.en);
  const fn = vary(arr, seed || topic);
  return (typeof fn === 'function') ? fn(topic) : '';
}

// ── INTELLIGENT STUDY CONTINUATION (STEP 5) ───────────────────────────────────
// For a returning student: continue the thread instead of restarting from zero.
const CONTINUE = {
  en: [
    (t, n) => `Welcome back. We were building your understanding of ${t}${n ? ` — your next logical step is ${n.toLowerCase()}` : ''}.`,
    (t, n) => `Good to see you again. Last we worked on ${t}${n ? `, so a natural next step is ${n.toLowerCase()}` : ''}.`,
  ],
  ur: [
    (t, n) => `خوش آمدید۔ ہم ${t} پر آپ کی سمجھ بنا رہے تھے${n ? ` — اگلا منطقی قدم: ${n}` : ''}۔`,
  ],
  'ur-roman': [
    (t, n) => `Khush aamdeed. Hum ${t} par aap ki samajh bana rahe the${n ? ` — agla mantiqi qadam: ${n}` : ''}.`,
  ],
  ar: [
    (t, n) => `أهلاً بعودتك. كنا نبني فهمك لـ ${t}${n ? ` — خطوتك التالية المنطقية هي ${n}` : ''}.`,
  ],
};

export function studyContinuation(journey = {}, lang = 'en', seed = '') {
  if (!journey.returning) return '';
  const topic = (journey.recentlyStudied && journey.recentlyStudied[0]) ||
                (journey.path && journey.path.focus) || null;
  if (!topic) return '';
  const next = journey.nextMilestone ? String(journey.nextMilestone).replace(/\*\*/g, '').split(':')[0].slice(0, 60) : '';
  const arr = (CONTINUE[lang] || CONTINUE.en);
  const fn = vary(arr, seed || topic);
  return (typeof fn === 'function') ? fn(topic, next) : '';
}

// ── DASHBOARD PROJECTION (STEP 7) ─────────────────────────────────────────────
// Structured, presentational shape for the EXISTING dashboard (no second build).
export function journeyDashboard(journey = {}) {
  if (!journey) return null;
  return {
    level:          journey.currentLevel || 'beginner',
    path:           journey.path?.title || null,
    pathFocus:      journey.path?.focus || null,
    stage:          journey.stage || null,
    activeGoal:     journey.activeGoal?.label || null,
    weakArea:       journey.weakArea || null,
    nextMilestone:  journey.nextMilestone ? String(journey.nextMilestone).replace(/\*\*/g, '') : null,
    recentlyStudied: journey.recentlyStudied || [],
    achievements:   journey.achievements || [],
  };
}
