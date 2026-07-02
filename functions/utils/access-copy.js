// functions/utils/access-copy.js
// ════════════════════════════════════════════════════════════════════════════
// ACCESS COPY (Phase 9) — localized, conversion-focused messaging shown ONLY
// when a visitor hits the free limit, plus identity-flow status messages.
// All CTAs use AI_IB_JOIN_URL (configurable — never hardcoded). Every limit
// surface states clearly: this is NOT paid; unlimited is FREE for active IB.
// ════════════════════════════════════════════════════════════════════════════

// Reuse the SAME Join-IB page the Library uses (license-request.html) when the
// AI_IB_JOIN_URL var is not set — never a new onboarding page.
export function joinUrl(env) { return (env && env.AI_IB_JOIN_URL) || 'license-request.html'; }

const FREE_NOTICE = {
  en:         'This is not a paid subscription. There are no AI fees — unlimited access is free for active IB members.',
  ur:         'یہ کوئی پیڈ سبسکرپشن نہیں ہے۔ کوئی AI فیس نہیں — unlimited رسائی active IB members کے لیے مفت ہے۔',
  'ur-roman': 'Yeh koi paid subscription nahi hai. Koi AI fees nahi — unlimited access active IB members ke liye free hai.',
  ar:         'هذا ليس اشتراكاً مدفوعاً. لا توجد رسوم — الوصول غير المحدود مجاني لأعضاء IB النشطين.',
};
const pick = (m, lang) => m[lang] || m.en;

// ── LIMIT REACHED (structured card the client renders) ───────────────────────
export function limitReachedPayload(env, lang = 'en') {
  const url = joinUrl(env);
  const T = {
    en: {
      title: 'You have reached the free message limit',
      headline: 'Unlimited AI access is available FREE for active IB members.',
      benefits: ['Unlimited conversations', 'Advanced memory across sessions', 'Advanced chart intelligence', 'Future premium AI features'],
      steps: ['Step 1 — Create your trading account through our IB.', 'Step 2 — Become an active IB member.', 'Step 3 — Verify your account using Account Number + Email OTP.'],
      afterNote: 'After verification, unlimited AI access is unlocked automatically.',
      ctaLabel: 'Create your IB account', verifyLabel: "I'm already an active IB member — verify now",
    },
    ur: {
      title: 'آپ مفت پیغامات کی حد تک پہنچ گئے ہیں',
      headline: 'Unlimited AI رسائی active IB members کے لیے مفت دستیاب ہے۔',
      benefits: ['لامحدود گفتگو', 'سیشنز میں ایڈوانس میموری', 'ایڈوانس chart intelligence', 'مستقبل کے premium AI فیچرز'],
      steps: ['مرحلہ 1 — ہمارے IB کے ذریعے اپنا trading اکاؤنٹ بنائیں۔', 'مرحلہ 2 — active IB member بنیں۔', 'مرحلہ 3 — Account Number + Email OTP سے اپنا اکاؤنٹ verify کریں۔'],
      afterNote: 'verify کے بعد unlimited AI رسائی خود بخود کھل جاتی ہے۔',
      ctaLabel: 'IB اکاؤنٹ بنائیں', verifyLabel: 'میں پہلے سے active IB member ہوں — ابھی verify کریں',
    },
    'ur-roman': {
      title: 'Aap free message limit tak pahunch gaye hain',
      headline: 'Unlimited AI access active IB members ke liye FREE hai.',
      benefits: ['Unlimited conversations', 'Advanced memory', 'Advanced chart intelligence', 'Future premium AI features'],
      steps: ['Step 1 — Hamare IB ke zariye apna trading account banayein.', 'Step 2 — Active IB member banein.', 'Step 3 — Account Number + Email OTP se account verify karein.'],
      afterNote: 'Verify ke baad unlimited AI access khud-ba-khud unlock ho jati hai.',
      ctaLabel: 'IB account banayein', verifyLabel: 'Main pehle se active IB member hoon — abhi verify karein',
    },
    ar: {
      title: 'لقد وصلت إلى حد الرسائل المجانية',
      headline: 'الوصول غير المحدود إلى الذكاء الاصطناعي مجاني لأعضاء IB النشطين.',
      benefits: ['محادثات غير محدودة', 'ذاكرة متقدمة عبر الجلسات', 'ذكاء متقدم للرسوم البيانية', 'مزايا ذكاء اصطناعي مستقبلية'],
      steps: ['الخطوة 1 — أنشئ حساب التداول عبر IB الخاص بنا.', 'الخطوة 2 — كن عضو IB نشطاً.', 'الخطوة 3 — وثّق حسابك عبر رقم الحساب + رمز البريد (OTP).'],
      afterNote: 'بعد التوثيق، يُفتح الوصول غير المحدود تلقائياً.',
      ctaLabel: 'أنشئ حساب IB', verifyLabel: 'أنا بالفعل عضو IB نشط — وثّق الآن',
    },
  };
  const t = T[lang] || T.en;
  return {
    gated: true, tier: 'visitor', lang,
    title: t.title, headline: t.headline, benefits: t.benefits, steps: t.steps,
    afterNote: t.afterNote, freeNotice: pick(FREE_NOTICE, lang),
    cta: { label: t.ctaLabel, url }, verifyCta: { label: t.verifyLabel, action: 'open_identity_modal' },
    telegram: 'https://t.me/ztradeuniversity', whatsapp: 'https://wa.me/17189730347',
  };
}

// ── IDENTITY-FLOW STATUS MESSAGES ────────────────────────────────────────────
export function accountNotFoundMsg(lang = 'en') {
  return pick({
    en:         'Your account is not currently in the Active IB Members list. To receive unlimited AI access, please become an active IB member.',
    ur:         'آپ کا اکاؤنٹ فی الحال Active IB Members لسٹ میں نہیں ہے۔ unlimited AI رسائی کے لیے براہِ کرم active IB member بنیں۔',
    'ur-roman': 'Aap ka account filhal Active IB Members list mein nahi hai. Unlimited AI access ke liye active IB member banein.',
    ar:         'حسابك غير موجود حالياً في قائمة أعضاء IB النشطين. للحصول على وصول غير محدود، يرجى أن تصبح عضو IB نشطاً.',
  }, lang);
}
export function inactiveMsg(lang = 'en') {
  return pick({
    en:         'You are currently not an active IB member. Please become active and try again.',
    ur:         'آپ فی الحال active IB member نہیں ہیں۔ براہِ کرم active ہو کر دوبارہ کوشش کریں۔',
    'ur-roman': 'Aap filhal active IB member nahi hain. Active ho kar dobara koshish karein.',
    ar:         'أنت لست عضو IB نشطاً حالياً. يرجى أن تصبح نشطاً وحاول مرة أخرى.',
  }, lang);
}
export function emailMissingMsg(lang = 'en') {
  return pick({
    en:         'Your account is active but no email address is linked. Please contact support or update your email address to activate AI access.',
    ur:         'آپ کا اکاؤنٹ active ہے لیکن کوئی ای میل لنک نہیں۔ براہِ کرم سپورٹ سے رابطہ کریں یا اپنا ای میل اپڈیٹ کریں تاکہ AI رسائی فعال ہو۔',
    'ur-roman': 'Aap ka account active hai lekin koi email linked nahi. Support se rabta karein ya apna email update karein.',
    ar:         'حسابك نشط لكن لا يوجد بريد إلكتروني مرتبط. يرجى التواصل مع الدعم أو تحديث بريدك لتفعيل الوصول.',
  }, lang);
}
export function revalidationRemovedMsg(lang = 'en') {
  return pick({
    en:         'Your account is no longer in the Active IB Members list.\n\nPossible reasons:\n• Account became inactive\n• IB relationship changed\n• Verification status changed\n\nPlease reactivate your account to restore unlimited AI access.',
    ur:         'آپ کا اکاؤنٹ اب Active IB Members لسٹ میں نہیں ہے۔\n\nممکنہ وجوہات:\n• اکاؤنٹ غیر فعال ہو گیا\n• IB تعلق تبدیل ہوا\n• verification اسٹیٹس بدل گیا\n\nunlimited AI رسائی بحال کرنے کے لیے اپنا اکاؤنٹ دوبارہ فعال کریں۔',
    'ur-roman': 'Aap ka account ab Active IB Members list mein nahi hai.\n\nMumkin wajoohat:\n• Account inactive ho gaya\n• IB relationship badla\n• Verification status badla\n\nUnlimited AI access bahaal karne ke liye account dobara active karein.',
    ar:         'لم يعد حسابك في قائمة أعضاء IB النشطين.\n\nأسباب محتملة:\n• أصبح الحساب غير نشط\n• تغيّرت علاقة IB\n• تغيّرت حالة التوثيق\n\nيرجى إعادة تفعيل حسابك لاستعادة الوصول غير المحدود.',
  }, lang);
}
export function freeNotice(lang = 'en') { return pick(FREE_NOTICE, lang); }
