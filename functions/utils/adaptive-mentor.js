// functions/utils/adaptive-mentor.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 29 — ADAPTIVE MENTOR (personalize to the trader)
// Adds the two pieces the existing personalization stack doesn't already cover:
//   • learning SPEED (fast / slow / confused / steady), inferred from the existing
//     cognition + profile signals, and
//   • ONE weak-area-targeted SMART RECOMMENDATION (practice / concept / mission /
//     article / exam) chosen from the student's ACTUAL weak area + level + speed.
//
// Adaptive depth (short vs deep), stance (protective/analytical/challenging), and
// the "why" (AI Coach) are already delivered by earlier phases and reused as-is —
// this never duplicates them. The mentor IDENTITY never changes; only emphasis and
// the recommendation do (STEP 3). Pure (no I/O). Language-Lock safe.
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// ── LEARNING SPEED (STEP 2) ───────────────────────────────────────────────────
// Heuristic over signals earlier phases already compute — no new storage.
export function detectLearningSpeed({ cognition = {}, profile = {}, traderContext = {}, messages = [] } = {}) {
  const tone = cognition.emotionalTone;
  if (tone === 'confused' || tone === 'overwhelmed') return 'confused';

  const level = profile.trader_level || traderContext.level || cognition.userLevel || 'beginner';
  const convs = profile.conversation_count ?? traderContext.conversations ?? 0;

  // Fast: advanced phrasing/level with real engagement depth.
  if ((cognition.userLevel === 'advanced' || level === 'advanced') && convs >= 3) return 'fast';

  // Slow: lots of conversations but still anchored at beginner (not progressing) or
  // repeatedly anxious — a sign the pace should ease, not accelerate.
  if (level === 'beginner' && convs >= 12) return 'slow';
  if (tone === 'anxious' && level === 'beginner') return 'slow';

  return 'steady';
}

// ── ADAPTIVE STANCE (STEP 3) — emphasis only, never a new identity. ────────────
export function adaptiveStance({ level = 'beginner', learnerState = '', emotion = 'neutral', speed = 'steady' } = {}) {
  if (learnerState === 'Struggling Trader' || ['frustrated', 'anxious', 'overwhelmed'].includes(emotion) || speed === 'confused') return 'supportive';
  if (level === 'advanced' || speed === 'fast') return 'challenging';
  if (level === 'intermediate') return 'analytical';
  return 'protective';
}

// ── SMART RECOMMENDATION (STEP 4 + 5) ─────────────────────────────────────────
// ONE natural recommendation, anchored to the student's REAL weak area, choosing the
// content type that fits their speed/stance. Returns '' when there is no weak area
// (no spam) or on the gated-silent turns. Reuses the existing analytics/memory inputs.
const REC = {
  // action → localized "do X on <area>" sentence builder
  practice: {
    en: a => `\n\n💡 Since **${a}** keeps coming up for you, a focused **practice drill** on it would move you forward faster than new material right now.`,
    ur: a => `\n\n💡 چونکہ **${a}** بار بار سامنے آ رہا ہے، اسی پر ایک مرکوز **مشق** نئی چیزوں سے زیادہ مددگار ہوگی۔`,
    'ur-roman': a => `\n\n💡 Chunke **${a}** baar baar saamne aa raha hai, isi par ek markooz **practice** nayi cheezon se zyada madadgaar hogi.`,
    ar: a => `\n\n💡 بما أن **${a}** يتكرّر معك، فإن **تمريناً مركّزاً** عليه سيدفعك للأمام أسرع من مادة جديدة الآن.`,
  },
  concept: {
    en: a => `\n\n💡 It's worth **solidifying the fundamentals of ${a}** before moving on — that's the gap that's costing you most.`,
    ur: a => `\n\n💡 آگے بڑھنے سے پہلے **${a} کی بنیادی باتیں** مضبوط کرنا بہتر ہے — یہی سب سے بڑی کمی ہے۔`,
    'ur-roman': a => `\n\n💡 Aage badhne se pehle **${a} ki bunyadi baatein** mazboot karna behtar hai — yahi sab se badi kami hai.`,
    ar: a => `\n\n💡 يستحق الأمر **ترسيخ أساسيات ${a}** قبل المضي قدماً — هذه هي الثغرة الأكبر.`,
  },
  mission: {
    en: a => `\n\n💡 A small **mission** on **${a}** — applying it to your last few trades — would turn this from theory into a habit.`,
    ur: a => `\n\n💡 **${a}** پر ایک چھوٹا **mission** — اسے اپنی پچھلی ٹریڈز پر لگانا — اسے نظریے سے عادت بنا دے گا۔`,
    'ur-roman': a => `\n\n💡 **${a}** par ek chhota **mission** — ise apni pichli trades par lagana — ise nazariye se aadat bana dega.`,
    ar: a => `\n\n💡 **مهمة** صغيرة حول **${a}** — بتطبيقها على صفقاتك الأخيرة — ستحوّلها من نظرية إلى عادة.`,
  },
  challenge: {
    en: a => `\n\n💡 You're ready to **push ${a} further** — try a harder case and see where your reasoning holds or breaks.`,
    ur: a => `\n\n💡 آپ **${a} کو مزید آگے** لے جانے کے لیے تیار ہیں — ایک مشکل صورت آزمائیں اور دیکھیں آپ کی سوچ کہاں ٹکتی ہے۔`,
    'ur-roman': a => `\n\n💡 Aap **${a} ko mazeed aage** le jaane ke liye tayyar hain — ek mushkil soorat aazmayein aur dekhein aap ki soch kahan tikti hai.`,
    ar: a => `\n\n💡 أنت جاهز **للتعمّق أكثر في ${a}** — جرّب حالة أصعب وانظر أين يصمد تفكيرك أو ينهار.`,
  },
};

// Map speed/stance → the most useful action type for this student right now.
function pickAction(speed, stance, level) {
  if (speed === 'confused' || stance === 'supportive') return 'practice';
  if (speed === 'fast' || stance === 'challenging' || level === 'advanced') return 'challenge';
  if (level === 'intermediate' || stance === 'analytical') return 'mission';
  return 'concept';
}

function seedHash(seed) {
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function smartRecommendation({ weakArea = '', level = 'beginner', speed = 'steady', stance = 'protective', lang = 'en', seed = '' } = {}) {
  if (!weakArea) return '';                                  // no real need → no recommendation
  if (seedHash(seed + 'rec') % 2 !== 0) return '';           // occasional, never every turn
  const action = pickAction(speed, stance, level);
  const m = REC[action] || REC.concept;
  const fn = m[lang] || m.en;
  return (typeof fn === 'function') ? fn(String(weakArea)) : '';
}
