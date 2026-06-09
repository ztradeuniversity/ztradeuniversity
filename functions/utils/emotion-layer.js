// functions/utils/emotion-layer.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 17 — HUMAN MENTOR EMOTION LAYER
// Extends (never replaces) the Phase 10.5 keyword tone-detector. It catches the
// emotional states that detector scores as "neutral" — overconfidence, impatience,
// disappointment, burnout, confusion, fear — plus the READING-BETWEEN-THE-LINES
// cases ("nothing is working", "maybe trading isn't for me") — and offers ONE
// calm, professional acknowledgment that redirects to the trading PROCESS.
//
// A trading mentor, never a therapist: every line steers back to the craft, stays
// understated, and is varied + often silent so it never sounds scripted (STEP 6/7).
// Pure (no I/O). Language-Lock safe (en / ur / ur-roman / ar).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// New emotional states, checked in priority order (most actionable first).
const STATES = [
  ['burnout',        /\b(burned out|burnt out|exhausted|so tired of|sick of (this|trading|losing)|no energy|drained|can'?t do this anymore|fed up with (this|trading))\b/i],
  ['overconfidence', /\b(easy money|can'?t lose|cannot lose|i'?m always right|guaranteed|100% sure|sure thing|this always works|i never lose|free money|too easy|nothing can go wrong)\b/i],
  ['impatience',     /\b(in a rush|how fast can|how quickly|quick money|fast money|need money now|right now|asap|can'?t wait|cant wait|too slow|hurry|speed (this )?up|make money fast)\b/i],
  ['disappointment', /\b(disappointed|let down|thought i'?d be better|expected more|so close but|gutted|deflated)\b/i],
  ['fear',           /\b(scared to lose|what if i lose everything|terrified|too scared|afraid to (enter|trade|lose|click)|fear of losing|petrified)\b/i],
  ['confusion',      /\b(confused|i'?m lost|makes no sense|don'?t (get|understand) (it|this|any)|so confusing|nothing makes sense|head spinning|over my head)\b/i],
  ['excitement',     /\b(so excited|can'?t wait to|let'?s go|pumped|this is amazing|i love this|finally getting it|on fire)\b/i],
];

// Map the existing keyword tone → a Phase 17 state (fallback only).
const TONE_MAP = { frustrated: 'frustration', anxious: 'fear', overwhelmed: 'confusion', excited: 'excitement' };

export function detectEmotion(text, { cognition = {}, profile = {} } = {}) {
  const s = String(text || '');
  for (const [state, re] of STATES) if (re.test(s)) return { state };
  const mapped = TONE_MAP[cognition?.emotionalTone];
  if (mapped) return { state: mapped };
  return { state: 'neutral' };
}

// ── READING BETWEEN THE LINES (STEP 3) ────────────────────────────────────────
// Quiet signals of defeat / giving up. Inferred need is educational (re-frame the
// process), NOT a dramatic rescue.
const DEFEAT = /nothing[\s\w']{0,10}work|maybe (trading|this) (isn'?t|is not|aint) for me|not cut out for|\bi give up\b|should i (just )?quit|thinking of quitting|want to quit|ready to quit|\bhopeless\b|\bno point\b|what'?s the point|i'?m done with|losing hope|never going to (make|work|win|be)|can'?t do this/i;

export function readBetweenLines(text) {
  const s = String(text || '');
  if (DEFEAT.test(s)) return { defeated: true, need: 'reframe' };
  return { defeated: false, need: null };
}

// ── CALM ACKNOWLEDGMENT LEADS (STEP 2 / 4) ────────────────────────────────────
// Each is a natural human reaction + a redirect to the process. Multiple variants
// per language so consecutive turns don't repeat (STEP 7).
const LEAD = {
  defeated: {
    en: [
      "I hear you — plenty of solid traders have stood exactly where you are. It usually means the process needs a tweak, not that you're not built for this. Let's find what's actually breaking.",
      "That's a hard place to be, and it's more common than you'd think. When everything feels stuck, it's almost always one fixable link in the chain — let's look at it together.",
    ],
    ur: ["میں سمجھتا ہوں — بہت سے اچھے traders بھی اسی مقام پر رہے ہیں۔ عموماً مسئلہ process میں ایک چھوٹی تبدیلی کا ہوتا ہے، یہ نہیں کہ آپ اس کے لیے نہیں بنے۔ آئیے دیکھتے ہیں اصل میں کیا رک رہا ہے۔"],
    'ur-roman': ["Main samajhta hoon — bahut se achhe traders bhi isi muqaam par rahe hain. Umooman masla process mein ek chhoti tabdeeli ka hota hai, ye nahi ke aap is ke liye nahi bane. Aayiye dekhte hain asal mein kya ruk raha hai."],
    ar: ["أتفهّمك — كثير من المتداولين الجيدين وقفوا حيث أنت تماماً. غالباً يحتاج الأمر تعديلاً بسيطاً في الأسلوب، لا أنك غير مؤهّل. لنجد ما يتعطّل فعلاً."],
  },
  burnout: {
    en: [
      "Sounds like you're running on empty — stepping back for a bit is part of the craft, not quitting. When you're fresh, we'll rebuild it simply.",
      "Burnout is real, and trading tired is how good traders make sloppy mistakes. Rest first; the setups will still be there.",
    ],
    ur: ["لگتا ہے آپ تھک چکے ہیں — تھوڑا وقفہ لینا اسی فن کا حصہ ہے، ہار ماننا نہیں۔ تازہ دم ہو کر سادگی سے دوبارہ شروع کریں گے۔"],
    'ur-roman': ["Lagta hai aap thak chuke hain — thoda waqfa lena isi fan ka hissa hai, haar maanna nahi. Taaza dam ho kar saadgi se dobara shuru karenge."],
    ar: ["يبدو أنك مُنهَك — أخذ استراحة جزء من الحرفة، لا استسلام. عُد بنشاط ونعيد البناء ببساطة."],
  },
  overconfidence: {
    en: [
      "Confidence is good — just keep one eye on what could go wrong. The market humbles certainty fast, so let's pressure-test the idea rather than assume it.",
      "I like the conviction — the best traders pair it with a clear 'what if I'm wrong?' plan. Where would this idea break?",
    ],
    ur: ["اعتماد اچھی چیز ہے — مگر ایک نظر اس پر رکھیں کہ کیا غلط ہو سکتا ہے۔ مارکیٹ یقین کو جلد جھکا دیتی ہے، تو آئیے خیال کو پرکھتے ہیں۔"],
    'ur-roman': ["Aitmaad achhi cheez hai — magar ek nazar is par rakhein ke kya ghalat ho sakta hai. Market yaqeen ko jald jhuka deti hai, to aayiye khayaal ko parakhte hain."],
    ar: ["الثقة جيدة — لكن أبقِ عيناً على ما قد يسوء. السوق يُذلّ اليقين سريعاً، فلنختبر الفكرة بدل افتراض صحتها."],
  },
  impatience: {
    en: [
      "I get the urgency — but rushing is the fastest way to hand the account back. Let's channel that energy into one clean setup instead of ten quick ones.",
      "The hurry is understandable, though the market pays the patient. Slowing down a notch usually speeds up the results.",
    ],
    ur: ["جلدی کی کیفیت سمجھ آتی ہے — مگر جلد بازی اکاؤنٹ گنوانے کا تیز ترین راستہ ہے۔ آئیے اس توانائی کو ایک صاف setup میں لگاتے ہیں۔"],
    'ur-roman': ["Jaldi ki kaifiyat samajh aati hai — magar jald baazi account ganwane ka tez tareen rasta hai. Aayiye is tawanai ko ek saaf setup mein lagate hain."],
    ar: ["أتفهّم العجلة — لكن التسرّع أسرع طريق لخسارة الحساب. لنوجّه هذه الطاقة إلى إعداد نظيف واحد بدل عشرة سريعة."],
  },
  disappointment: {
    en: [
      "That stings, I know — but a result falling short usually points to one fixable gap, not a dead end. What did the trade actually tell you?",
      "Disappointment means you cared and you had a standard — both good signs. Let's turn it into the one adjustment that moves you forward.",
    ],
    ur: ["یہ تکلیف دہ ہے، میں جانتا ہوں — مگر نتیجہ کم رہنا عموماً ایک قابلِ اصلاح کمی کی طرف اشارہ ہے، اختتام نہیں۔ trade نے آپ کو کیا سکھایا؟"],
    'ur-roman': ["Ye takleef deh hai, main jaanta hoon — magar nateeja kam rehna umooman ek qabil-e-islah kami ki taraf ishara hai, ikhtitam nahi. Trade ne aap ko kya sikhaya?"],
    ar: ["هذا مؤلم، أعلم — لكن النتيجة الأقل تشير غالباً إلى ثغرة قابلة للإصلاح، لا طريق مسدود. ماذا أخبرتك الصفقة فعلاً؟"],
  },
  fear: {
    en: [
      "That fear is actually useful — it means you respect the risk. Let's turn it into rules instead of hesitation, so the decision is made before the candle moves.",
      "Nervousness around losing is healthy in small doses. The fix isn't courage — it's a position size small enough that the fear quiets down.",
    ],
    ur: ["یہ خوف دراصل مفید ہے — اس کا مطلب ہے آپ خطرے کا احترام کرتے ہیں۔ آئیے اسے ہچکچاہٹ کے بجائے اصولوں میں بدلتے ہیں۔"],
    'ur-roman': ["Ye khauf dar asal mufeed hai — is ka matlab hai aap khatre ka ihtraam karte hain. Aayiye ise hichkichahat ke bajaye usoolon mein badalte hain."],
    ar: ["هذا الخوف مفيد فعلاً — يعني أنك تحترم المخاطرة. لنحوّله إلى قواعد بدل التردد، فيُتّخذ القرار قبل تحرّك الشمعة."],
  },
  confusion: {
    en: [
      "Totally fair to feel confused here — this part trips up almost everyone. Let's slow down and clear it up one piece at a time.",
      "No shame in it being murky — it means we've found the exact spot to focus. Let's untangle it step by step.",
    ],
    ur: ["یہاں الجھن محسوس کرنا بالکل فطری ہے — یہ حصہ تقریباً سب کو الجھاتا ہے۔ آئیے رفتار کم کر کے ایک ایک کر کے واضح کرتے ہیں۔"],
    'ur-roman': ["Yahan uljhan mehsoos karna bilkul fitri hai — ye hissa taqreeban sab ko uljhata hai. Aayiye raftaar kam kar ke ek ek kar ke waazeh karte hain."],
    ar: ["من الطبيعي أن تشعر بالحيرة هنا — هذا الجزء يربك الجميع تقريباً. لنتمهّل ونوضّحه قطعة قطعة."],
  },
  excitement: {
    en: [
      "Love the energy — let's keep it disciplined so it lasts longer than one good week.",
      "Great to see the spark. The trick now is letting the process, not the excitement, pick the trades.",
    ],
    ur: ["یہ جوش بہت اچھا ہے — آئیے اسے نظم کے ساتھ رکھیں تاکہ یہ دیرپا رہے۔"],
    'ur-roman': ["Ye josh bahut achha hai — aayiye ise nazm ke saath rakhein taake ye derpa rahe."],
    ar: ["أحب هذه الحماسة — لنبقِها منضبطة كي تدوم أطول من أسبوع جيد واحد."],
  },
  // frustration falls through to the existing Phase 11 emotionalLead; no duplicate here.
};

// Returns ONE calm, redirecting acknowledgment, or '' (states without a lead, or
// when the gentle "stay quiet" path is chosen). `seed` varies the phrasing.
export function emotionLead(state, { lang = 'en', seed = '' } = {}) {
  const m = LEAD[state];
  if (!m) return '';
  const arr = m[lang] || m.en;
  return vary(arr, seed || state);
}

// Dedicated entry for the between-the-lines defeated case (STEP 3).
export function betweenLinesLead(btl, lang = 'en', seed = '') {
  if (!btl || !btl.defeated) return '';
  const arr = LEAD.defeated[lang] || LEAD.defeated.en;
  return vary(arr, seed || 'defeated');
}
