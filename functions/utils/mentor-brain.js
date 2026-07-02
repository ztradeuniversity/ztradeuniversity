// functions/utils/mentor-brain.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 14 — AI PERSONAL MENTOR BRAIN
// Central mentor decision engine. Determines: learner state, mentor action,
// human prefix phrases, post-answer decision, proactive guidance.
// Additive — never modifies existing pipeline outputs directly.
// Pure (no I/O). Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// ── CONSTANTS ────────────────────────────────────────────────────────────────
// Intents that are market data, operational, or conversational — mentor brain
// stays silent for these (no prefix/tail added).
const SILENT_INTENTS  = new Set(['signal', 'chart', 'setcountry', 'smalltalk', 'greeting', 'offtopic', 'lotsize']);
const MARKET_INTENTS  = new Set(['gold', 'btc', 'macro', 'brief', 'mood', 'events', 'session']);
const REFLECT_INTENTS = new Set(['assess', 'psychology', 'whylosing', 'stuck', 'selfassess']);

// ── LEARNER STATE DETECTION ───────────────────────────────────────────────────
export const LEARNER_STATES = Object.freeze([
  'New Student', 'Active Learner', 'Improving Trader',
  'Struggling Trader', 'Consistent Trader', 'Advanced Trader',
]);

// profile = memoryData?.profile || {}
// traderContext = mergedTraderContext || {}
// sessionMem = buildSessionMemory(...)
export function detectLearnerState(profile = {}, traderContext = {}, sessionMem = {}) {
  const level = profile.trader_level || traderContext.level || null;
  const convs  = Math.max(profile.conversation_count ?? 0, traderContext.conversations ?? 0);

  // Psychology flags from Supabase scores
  const hasPsychFlag = (profile.fomo_score ?? 0) > 2 ||
                       (profile.fear_score ?? 0) > 2 ||
                       (profile.revenge_score ?? 0) > 2 ||
                       (profile.overtrading_score ?? 0) > 2;
  const weaknesses = Array.isArray(traderContext.weaknesses) ? traderContext.weaknesses.length : 0;
  const isStruggling = hasPsychFlag || weaknesses >= 2 || sessionMem.recentLoss === true;

  if (!level && convs <= 2)                               return 'New Student';
  if (level === 'advanced' && convs >= 10)                return 'Advanced Trader';
  if (level === 'advanced' || convs >= 12)                return 'Consistent Trader';
  if (isStruggling)                                       return 'Struggling Trader';
  if (level === 'intermediate' || convs >= 5)             return 'Improving Trader';
  if (convs >= 3)                                         return 'Active Learner';
  return 'New Student';
}

// ── MENTOR ACTION ─────────────────────────────────────────────────────────────
// Returns ONE of: Teach | Clarify | Encourage | Practice | Challenge |
//                 Reflect | Recommend | StaySilent
export function decideMentorAction({
  cognition, learnerState, sessionMem = {}, intent,
  hasKbAnswer = false, clarifying = false,
} = {}) {
  if (clarifying) return 'Clarify';

  // Never add mentor framing to market data, operational, or conversational turns
  if (SILENT_INTENTS.has(intent) || MARKET_INTENTS.has(intent)) return 'StaySilent';

  const tone = cognition?.emotionalTone || 'neutral';

  // 1. Struggling trader with emotional signal → Encourage first
  if (learnerState === 'Struggling Trader' &&
      ['frustrated', 'anxious', 'overwhelmed'].includes(tone)) return 'Encourage';

  // 2. Post-assessment / psychology → Reflect
  if (REFLECT_INTENTS.has(intent)) return 'Reflect';

  // 3. Advanced/Consistent traders with a KB answer → Challenge their thinking
  if (['Advanced Trader', 'Consistent Trader'].includes(learnerState) &&
      hasKbAnswer && !sessionMem.recentChallenge) return 'Challenge';

  // 4. Active Learner on a known topic without recent practice → Practice
  if (learnerState === 'Active Learner' &&
      sessionMem.lastTopic && !sessionMem.lastPractice) return 'Practice';

  // 5. Improving/Consistent on a known path → Recommend next step
  if (['Improving Trader', 'Consistent Trader'].includes(learnerState) &&
      sessionMem.currentPath) return 'Recommend';

  // 6. New Student or any KB answer → Teach
  if (learnerState === 'New Student' || hasKbAnswer) return 'Teach';

  return 'StaySilent';
}

// ── MENTOR PREFIX PHRASES ─────────────────────────────────────────────────────
// Humanized, varied, non-robotic. '' when action = StaySilent.
// Rotated deterministically by seed so consecutive messages never repeat.
const PREFIX = {
  Teach: {
    en: [
      "Here's what matters most at this stage —",
      "Before we go further, the key foundation here is:",
      "Let's make sure this is solid before we build on it:",
    ],
    ur: [
      "اس مرحلے پر سب سے اہم بات یہ ہے —",
      "آگے بڑھنے سے پہلے، یہ بنیاد ضروری ہے:",
    ],
    'ur-roman': [
      "Is marhale par sabse ahem baat ye hai —",
      "Aage badhne se pehle, ye bunyaad zaroori hai:",
    ],
    ar: [
      "إليك أهم ما يجب معرفته في هذه المرحلة —",
      "قبل المضي قدماً، الأساس المهم هنا هو:",
    ],
  },
  Encourage: {
    en: [
      "You're asking exactly the right questions — that already puts you ahead.",
      "This is one of the hardest phases of trading. Noticing it means you're growing.",
      "Every consistent trader went through exactly what you're describing. Keep going.",
    ],
    ur: [
      "آپ بالکل درست سوال پوچھ رہے ہیں — یہی آپ کو آگے رکھتا ہے۔",
      "ہر کامیاب trader نے یہی مرحلہ عبور کیا ہے۔ جاری رہیں۔",
    ],
    'ur-roman': [
      "Aap bilkul durust sawal pooch rahe hain — yahi aap ko aage rakhta hai.",
      "Har kamyaab trader ne yahi marhala uboor kiya hai. Jaari rahein.",
    ],
    ar: [
      "أنت تطرح بالضبط الأسئلة الصحيحة — هذا يضعك خطوة للأمام.",
      "كل متداول ناجح مرّ بما تصفه. استمر.",
    ],
  },
  Practice: {
    en: [
      "A common mistake at this stage is skipping the practice side of this —",
      "The best way to lock this in is through repetition. Try this:",
      "Before moving to the next topic, one useful exercise is:",
    ],
    ur: [
      "اس مرحلے پر عام غلطی یہ ہوتی ہے کہ practice نظرانداز کی جاتی ہے —",
      "اگلے topic سے پہلے، ایک مفید مشق یہ ہے:",
    ],
    'ur-roman': [
      "Is marhale par aam ghalti ye hoti hai ke practice nazar andaaz ki jaati hai —",
      "Agle topic se pehle, ek mufeed drill ye hai:",
    ],
    ar: [
      "الخطأ الشائع في هذه المرحلة هو تجاهل الجانب التطبيقي —",
      "قبل الانتقال للموضوع التالي، إليك تمرين مفيد:",
    ],
  },
  Challenge: {
    en: [
      "Since you have the foundation, let me push your thinking a bit further —",
      "You seem ready for a more advanced angle on this:",
      "Here's a question that separates good traders from great ones:",
    ],
    ur: [
      "چونکہ آپ کی بنیاد مضبوط ہے، ایک قدم آگے بڑھتے ہیں —",
    ],
    'ur-roman': [
      "Chunke aap ki bunyaad mazboot hai, ek qadam aage badhte hain —",
    ],
    ar: [
      "بما أن لديك الأساس، دعني أدفع تفكيرك خطوة أبعد —",
    ],
  },
  Reflect: {
    en: [
      "Based on what you've been learning, it's worth pausing here to reflect —",
      "Before moving to the next step, one question worth sitting with is:",
      "The pattern worth noticing in yourself here:",
    ],
    ur: [
      "جو آپ سیکھ رہے ہیں، اس کی روشنی میں ایک لمحہ سوچنے کی بات ہے —",
    ],
    'ur-roman': [
      "Jo aap seekh rahe hain, us ki roshni mein ek lamha sochne ki baat hai —",
    ],
    ar: [
      "استناداً إلى ما تعلّمته، يستحق الأمر التوقف للتأمل —",
    ],
  },
  Recommend: {
    en: [
      "Based on where you are in your learning, the next useful step is:",
      "Given what you've been working on, a natural next milestone would be:",
      "I think the next exercise that would genuinely help is:",
    ],
    ur: [
      "آپ کی learning کی بنیاد پر، اگلا قدم یہ ہونا چاہیے:",
    ],
    'ur-roman': [
      "Aap ki learning ki bunyaad par, agla qadam ye hona chahiye:",
    ],
    ar: [
      "بناءً على مستوى تعلّمك، أعتقد أن الخطوة التالية المفيدة هي:",
    ],
  },
};

export function getMentorPrefix(action, _state, lang = 'en', seed = '') {
  const map = PREFIX[action];
  if (!map) return '';
  const arr = map[lang] || map.en || [];
  if (!arr.length) return '';
  return vary(arr, seed || action + lang);
}

// ── POST-ANSWER MENTOR DECISION ───────────────────────────────────────────────
// Fires AT MOST once per turn, only for Reflect action, only when there is a
// KB answer (educational content) and the conversation is English.
// Rotates among: Reflection question, Mission suggestion, Nothing.
const DECISION_LINES = {
  Reflection: {
    en: "🧭 **Reflection:** what would you do differently on your last trade, knowing what you know now?",
    ur: "🧭 **سوچیں:** آخری trade میں آپ کیا مختلف کرتے، اگر آپ کو اب جتنا پتہ ہے؟",
    'ur-roman': "🧭 **Sochaein:** aakhri trade mein aap kya mukhtalif karte, agar aap ko ab jitna pata hai?",
    ar: "🧭 **تأمل:** ماذا كنت ستفعل بشكل مختلف في آخر صفقة، مع ما تعرفه الآن؟",
  },
  Mission: {
    en: "📋 **Your next mission:** open your trading journal and write down your last 3 trades — entry reason, result, and lesson. Patterns will emerge.",
    ur: "📋 **اگلا mission:** trading journal میں آخری 3 trades لکھیں — entry reason، result، اور lesson۔",
    'ur-roman': "📋 **Agla mission:** trading journal mein aakhri 3 trades likhein — entry reason, result, aur lesson.",
    ar: "📋 **مهمتك التالية:** افتح يوميات تداولك واكتب آخر 3 صفقات مع السبب والنتيجة والدرس.",
  },
};

// Rotation: Reflect action → Reflection | Mission | Nothing (2 : 1 : 3 out of 6 slots)
const REFLECT_ROTATION = ['Reflection', 'Nothing', 'Mission', 'Nothing', 'Reflection', 'Nothing'];

export function buildMentorDecision(action, _state, _intent, lang = 'en', seed = '') {
  if (action !== 'Reflect') return { type: 'Nothing', text: '' };

  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const type = REFLECT_ROTATION[h % REFLECT_ROTATION.length];

  if (type === 'Nothing') return { type: 'Nothing', text: '' };
  const line = DECISION_LINES[type];
  if (!line) return { type: 'Nothing', text: '' };
  return { type, text: '\n\n' + (line[lang] || line.en) };
}

// ── PROACTIVE GUIDANCE ────────────────────────────────────────────────────────
// Only fires for Recommend action AND specific learner states.
// Returns '' most of the time — the mentor is never spammy.
const PROACTIVE = {
  'New Student': {
    en: "\n\n💡 **Since you're getting started:** the most valuable first step is learning proper risk per trade (the 1–2% rule) before focusing on any strategy.",
    ur: "\n\n💡 **چونکہ آپ نئے ہیں:** سب سے پہلے ہر trade میں risk (1–2% rule) سمجھنا سب سے اہم ہے — strategy بعد میں۔",
    'ur-roman': "\n\n💡 **Chunke aap naye hain:** pehle har trade mein risk (1-2% rule) samajhna zaroori hai — strategy baad mein.",
    ar: "\n\n💡 **بما أنك مبتدئ:** أهم خطوة أولى هي فهم المخاطرة لكل صفقة (قاعدة 1–2%) قبل التركيز على أي استراتيجية.",
  },
  'Struggling Trader': {
    en: "\n\n💡 **A pattern worth noticing:** many traders in this phase improve dramatically just by halving their position size for 30 days — the pressure lifts and decision-making clears.",
    ur: "\n\n💡 **ایک اہم pattern:** اس مرحلے میں بہت سے traders نے position size آدھی کر کے 30 دن لگائے — pressure کم ہوا اور فیصلے بہتر ہوئے۔",
    'ur-roman': "\n\n💡 **Ek ahem pattern:** is marhale mein bahut se traders ne position size aadhi kar ke 30 din lagaye — pressure kam hua aur faislay behtar hue.",
    ar: "\n\n💡 **نمط يستحق الملاحظة:** كثير من المتداولين في هذه المرحلة يتحسّنون بشكل ملحوظ فقط بتقليص حجم المركز إلى النصف لمدة 30 يوماً.",
  },
  'Improving Trader': {
    en: "\n\n💡 **At your stage:** the next real improvement usually comes from journal review, not more strategies. Patterns in your own data are worth more than any new system.",
    ur: "\n\n💡 **آپ کے اس مرحلے میں:** اگلی بڑی ترقی journal review سے آتی ہے — نئی strategies سے نہیں۔",
    'ur-roman': "\n\n💡 **Aap ke is marhale mein:** agli bari taraqqi journal review se aati hai — nayi strategies se nahi.",
    ar: "\n\n💡 **في مرحلتك:** التحسّن التالي عادةً يأتي من مراجعة اليوميات، لا من استراتيجيات جديدة.",
  },
};

export function buildProactiveGuidance(action, state, lang = 'en') {
  if (action !== 'Recommend') return '';
  const m = PROACTIVE[state];
  if (!m) return '';
  return m[lang] || m.en || '';
}
