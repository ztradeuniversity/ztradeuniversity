// functions/utils/trade-rescue/result-i18n.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU RESCUE — LOCALIZED RESULT RENDERING (en / ur / ar)
//
// This is a rendering layer, not a translation layer. It does not translate
// English strings produced elsewhere — it independently expresses the SAME
// verified facts and the SAME direction-relative judgement analysis.js already
// makes, in whichever language the trader selected, by reading the identical
// source values (verified price, session range, yields, regime, VIX, the
// trader's own case fields, the verified OHLC range/invalidation candidate).
//
// analysis.js, position.js, meters.js and evidence.js are NOT modified and NOT
// imported for their English strings here — this module mirrors their
// DECISION LOGIC (which stance a fact takes relative to the trader's direction,
// which branch fires) so a result in Urdu or Arabic reaches the exact same
// judgement as the English one, expressed natively rather than translated.
// Every number is read from the same objects analysis.js reads; none is
// recomputed or guessed.
//
// Deliberately scoped to what functions/api/rescue-assess.js actually renders
// (Technical, Fundamental, Sentiment, News, Risk, Behaviour, Market Direction,
// Position Summary, Trade Management Options, Final Mentor View) — the
// structured endpoint never surfaces layerTradeContext, layerScenarios or
// layerCrypto, so those are out of scope here too.
// ════════════════════════════════════════════════════════════════════════════

export const SUPPORTED = ['en', 'ur', 'ar'];
export const normLang = (l) => {
  const v = String(l || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(v) ? v : 'en';
};

const r2 = (n) => Math.round(n * 100) / 100;
const pct = (a, b) => (b ? r2((a / b) * 100) : null);
const pick = (lang, obj) => obj[normLang(lang)];

// ── STATIC LABELS / HEADINGS ────────────────────────────────────────────────
// English trading terminology (Stop Loss, Take Profit, VIX, XAU/USD, FRED,
// TwelveData …) is kept in every language deliberately — that is how traders
// read their own platforms, and translating it would reduce clarity.
export function headings(lang) {
  return pick(lang, {
    en: { position: 'Position Summary', marketDirection: 'Market Direction', currentMarket: 'Current Market',
      technical: 'Technical', fundamental: 'Fundamental', sentiment: 'Sentiment', news: 'General News',
      upcomingData: 'Upcoming Economic Data',
      supports: 'What Supports Your Trade', against: 'What Works Against It', risk: 'Risk',
      strength: 'Your Strength', weakness: 'Your Main Weakness', options: 'Trade Management Options',
      finalView: 'Final Mentor Review', layerByLayer: 'Layer by layer — which part of the book is helping and which is hurting:',
      overallEvidence: 'Overall Evidence', readOverview: 'Read Overview of the Market',
      fiveFactorOverview: 'Evidence Snapshot', overallRead: 'Overall Read' },
    ur: { position: 'Position کا خلاصہ', marketDirection: 'مارکیٹ کا رجحان', currentMarket: 'موجودہ Market',
      technical: 'تکنیکی تجزیہ', fundamental: 'بنیادی تجزیہ', sentiment: 'مارکیٹ کا موڈ', news: 'عمومی خبریں',
      upcomingData: 'آنے والا Economic Data',
      supports: 'آپ کی Trade کو کیا Support کر رہا ہے', against: 'آپ کی Trade کے خلاف کیا جا رہا ہے', risk: 'خطرہ',
      strength: 'آپ کی Strength', weakness: 'آپ کی اہم Weakness', options: 'Trade Management کے آپشنز',
      finalView: 'حتمی Mentor Review', layerByLayer: 'Layer بہ Layer — کون سا حصہ مدد کر رہا ہے اور کون سا نقصان دے رہا ہے:',
      overallEvidence: 'مجموعی Evidence', readOverview: 'مارکیٹ کا تفصیلی جائزہ پڑھیں',
      fiveFactorOverview: 'Evidence کا خلاصہ', overallRead: 'مجموعی رائے' },
    ar: { position: 'ملخص المركز', marketDirection: 'اتجاه السوق', currentMarket: 'السوق الحالي',
      technical: 'التحليل الفني', fundamental: 'التحليل الأساسي', sentiment: 'المعنويات', news: 'الأخبار العامة',
      upcomingData: 'البيانات الاقتصادية القادمة',
      supports: 'ما يدعم صفقتك', against: 'ما يعمل ضدها', risk: 'المخاطر',
      strength: 'نقطة قوتك', weakness: 'أبرز نقاط ضعفك', options: 'خيارات إدارة الصفقة',
      finalView: 'مراجعة الموجّه النهائية', layerByLayer: 'طبقة بطبقة — أي جزء من المركز يساعد وأيها يضر:',
      overallEvidence: 'الأدلة الإجمالية', readOverview: 'اقرأ نظرة عامة على السوق',
      fiveFactorOverview: 'لقطة الأدلة', overallRead: 'القراءة الإجمالية' },
  });
}
export function labels(lang) {
  return pick(lang, {
    en: { supportsYour: (d) => `Supports your ${d}`, worksAgainst: (d) => `Works against your ${d}`, contextOnly: 'Context only',
      layer: 'Layer', side: 'Side', size: 'Size', entry: 'Entry', result: 'Result', helping: 'helping', hurting: 'hurting', flat: '—',
      what: 'What', why: 'Why / Reason', trigger: 'Trigger to watch', risk: 'Risk', option: 'Option',
      unavailable: 'Unavailable', degraded: 'This review was composed from the verified data without the AI reasoning layer, which was briefly unavailable. Every figure and source shown is unaffected.',
      disclaimer: '_This is decision-support based on the evidence available right now — not a guaranteed outcome, and not financial advice. Market conditions can change at any time, and the decision on your own position is always yours._',
      readReason: 'Read the reason below.', overallEvidenceScoreLabel: 'Overall Evidence Score',
      deleteHistory: 'Delete', deleteHistoryAria: 'Delete this assessment from history',
      deleteHistoryConfirm: 'Remove this assessment from your history? This only clears it from this browser — it does not affect the assessment itself.',
      howMeasured: 'How this is measured', evidenceExplainAria: 'Why this evidence has this score',
      managementFit: 'Management Fit', managementFitNote: 'How defensible this approach is given the evidence right now — not a probability of success.',
      strongestSupport: 'Strongest support', strongestRisk: 'Biggest risk',
      eventLabel: 'Event', whenLabel: 'When', whatItMeans: 'What this means', possibleBullish: 'If stronger than expected',
      possibleBearish: 'If weaker than expected', tradeRelevance: 'Trade relevance', impactLabel: 'Impact', impactReason: 'Why / Reason', tradeEffect: 'Trade effect' },
    ur: { supportsYour: (d) => `آپ کی ${d} کو Support کرتا ہے`, worksAgainst: (d) => `آپ کی ${d} کے خلاف جاتا ہے`, contextOnly: 'صرف Context',
      layer: 'Layer', side: 'Side', size: 'Size', entry: 'Entry', result: 'نتیجہ', helping: 'مدد گار', hurting: 'نقصان دہ', flat: '—',
      what: 'کیا', why: 'کیوں / وجہ', trigger: 'کس چیز پر نظر رکھیں', risk: 'Risk', option: 'آپشن',
      unavailable: 'دستیاب نہیں', degraded: 'یہ review verified data سے تیار کیا گیا ہے؛ AI reasoning layer عارضی طور پر دستیاب نہیں تھی۔ تمام figures اور sources بدستور درست ہیں۔',
      disclaimer: '_یہ اس وقت دستیاب evidence کی بنیاد پر decision-support ہے — کوئی guaranteed نتیجہ نہیں، اور نہ ہی financial advice۔ Market حالات کسی بھی وقت بدل سکتے ہیں، اور آپ کی اپنی position کا فیصلہ ہمیشہ آپ کا ہے۔_',
      readReason: 'نیچے وجہ پڑھیں۔', overallEvidenceScoreLabel: 'مجموعی Evidence Score',
      deleteHistory: 'Delete', deleteHistoryAria: 'اس assessment کو history سے حذف کریں',
      deleteHistoryConfirm: 'اس assessment کو آپ کی history سے ہٹا دیں؟ یہ صرف اس browser سے ہٹتا ہے — اصل assessment متاثر نہیں ہوتا۔',
      howMeasured: 'یہ کیسے ناپا جاتا ہے', evidenceExplainAria: 'یہ evidence یہ score کیوں رکھتی ہے',
      managementFit: 'Management Fit', managementFitNote: 'موجودہ evidence کو دیکھتے ہوئے یہ approach کتنی قابل دفاع ہے — کامیابی کی probability نہیں۔',
      strongestSupport: 'سب سے مضبوط Support', strongestRisk: 'سب سے بڑا خطرہ',
      eventLabel: 'Event', whenLabel: 'کب', whatItMeans: 'اس کا مطلب', possibleBullish: 'اگر توقع سے مضبوط ہو',
      possibleBearish: 'اگر توقع سے کمزور ہو', tradeRelevance: 'Trade سے تعلق', impactLabel: 'Impact', impactReason: 'کیوں / وجہ', tradeEffect: 'Trade Effect' },
    ar: { supportsYour: (d) => `يدعم صفقة ${d} الخاصة بك`, worksAgainst: (d) => `يعمل ضد صفقة ${d} الخاصة بك`, contextOnly: 'سياق فقط',
      layer: 'طبقة', side: 'الجهة', size: 'الحجم', entry: 'الدخول', result: 'النتيجة', helping: 'يساعد', hurting: 'يضر', flat: '—',
      what: 'ماذا', why: 'لماذا / السبب', trigger: 'ما يجب مراقبته', risk: 'المخاطرة', option: 'خيار',
      unavailable: 'غير متاح', degraded: 'بُنيت هذه المراجعة من البيانات الموثقة دون طبقة الاستدلال بالذكاء الاصطناعي، التي كانت غير متاحة مؤقتاً. جميع الأرقام والمصادر غير متأثرة.',
      disclaimer: '_هذا دعم لاتخاذ القرار بناءً على الأدلة المتاحة الآن — وليس نتيجة مضمونة ولا نصيحة مالية. ظروف السوق قد تتغير في أي وقت، والقرار بشأن مركزك يبقى قرارك أنت._',
      readReason: 'اقرأ السبب أدناه.', overallEvidenceScoreLabel: 'درجة الأدلة الإجمالية',
      deleteHistory: 'حذف', deleteHistoryAria: 'حذف هذا التقييم من السجل',
      deleteHistoryConfirm: 'إزالة هذا التقييم من سجلك؟ هذا يزيله من هذا المتصفح فقط — لا يؤثر على التقييم نفسه.',
      howMeasured: 'كيف يُقاس هذا', evidenceExplainAria: 'لماذا حصل هذا الدليل على هذه الدرجة',
      managementFit: 'ملاءمة الإدارة', managementFitNote: 'مدى إمكانية الدفاع عن هذا النهج بناءً على الأدلة الحالية — وليس احتمال النجاح.',
      strongestSupport: 'أقوى دعم', strongestRisk: 'أكبر خطر',
      eventLabel: 'الحدث', whenLabel: 'الموعد', whatItMeans: 'ماذا يعني هذا', possibleBullish: 'إذا كانت أقوى من المتوقع',
      possibleBearish: 'إذا كانت أضعف من المتوقع', tradeRelevance: 'صلته بصفقتك', impactLabel: 'التأثير', impactReason: 'لماذا / السبب', tradeEffect: 'تأثير الصفقة' },
  });
}

const dirWord = (lang, direction) => {
  const d = String(direction || '').toUpperCase();
  return pick(lang, { en: d, ur: d, ar: d === 'BUY' ? 'شراء (BUY)' : d === 'SELL' ? 'بيع (SELL)' : d });
};
function tag(lang, stance, direction) {
  const L = labels(lang);
  const d = dirWord(lang, direction);
  if (stance === 'supportive') return L.supportsYour(d);
  if (stance === 'opposing') return L.worksAgainst(d);
  return L.contextOnly;
}

// ── INSTRUMENT-LEVEL IMPACT (bullish/bearish/neutral) ───────────────────────
// `stance` is already computed everywhere in this file RELATIVE TO THE
// TRADER'S OWN DIRECTION ('supportive'/'opposing'/'neutral' — see `tag()`
// above). The instrument's own bullish/bearish/neutral reading is simply that
// same judgement with the direction un-applied — this is a pure inversion of
// logic that already exists, not a new financial claim: a fact that is
// 'supportive' of a BUY is by definition bullish for the instrument; one that
// is 'supportive' of a SELL is by definition bearish for it, and so on. When
// direction is unknown (e.g. an instrument-only note with no trader side
// attached) this can't be inferred and reports 'neutral' rather than guessing.
export function instrumentImpact(stance, direction) {
  if (stance !== 'supportive' && stance !== 'opposing') return 'neutral';
  const buy = direction === 'buy', sell = direction === 'sell';
  if (stance === 'supportive') return buy ? 'bullish' : sell ? 'bearish' : 'neutral';
  return buy ? 'bearish' : sell ? 'bullish' : 'neutral';
}
export function impactLabel(lang, impact) {
  return pick(lang, {
    en: { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral / Context' }[impact] || 'Neutral / Context',
    ur: { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral / Context' }[impact] || 'Neutral / Context',
    ar: { bullish: 'صاعد', bearish: 'هابط', neutral: 'محايد / سياق' }[impact] || 'محايد / سياق',
  });
}
const INSTRUMENT_NAME = { 'XAU/USD': { en: 'Gold', ur: 'Gold', ar: 'الذهب' }, 'BTC/USD': { en: 'Bitcoin', ur: 'Bitcoin', ar: 'بيتكوين' } };
export function instrumentDisplayName(lang, instrument) {
  const n = INSTRUMENT_NAME[instrument];
  return n ? pick(lang, n) : (instrument || pick(lang, { en: 'the instrument', ur: 'اس instrument', ar: 'هذه الأداة' }));
}

// `reason` is optional and, when supplied, marks a bullet as an INSTRUMENT-
// LEVEL directional fact eligible for the compact impact badge (FACT → IMPACT
// → REASON → TRADE EFFECT). Bullets that describe something specific to the
// trader's own entry (not a general market reading — e.g. price vs YOUR
// entry) intentionally omit `reason` and keep their existing text-only
// rendering, because labelling personal P&L as "instrument impact" would
// misrepresent it as a market signal nobody else could read the same way.
const bullet = (text, stance, basis, lang, direction, reason) => {
  const b = { text, stance, basis, tag: tag(lang, stance, direction) };
  if (reason) {
    b.impact = instrumentImpact(stance, direction);
    b.impactLabel = impactLabel(lang, b.impact);
    b.reason = reason;
  }
  return b;
};

// ── TECHNICAL ────────────────────────────────────────────────────────────────
// Mirrors layerTechnical()'s branches exactly (entry distance, session
// position, session change, verified range + invalidation), for the fields
// the structured endpoint's aggregated case can actually carry.
export function technicalSection(lang, c, ev, range, invalidation) {
  const out = { facts: [], evidence: [], uncertainty: [] };
  if (ev.priceStatus !== 'verified') {
    out.uncertainty.push(pick(lang, {
      en: `No verified live price for ${c.instrument || 'this instrument'}, so distance to entry cannot be measured here.`,
      ur: `${c.instrument || 'اس instrument'} کے لیے کوئی verified live price نہیں، اس لیے entry سے فاصلہ یہاں نہیں ناپا جا سکتا۔`,
      ar: `لا يوجد سعر حي موثق لـ ${c.instrument || 'هذه الأداة'}، لذا لا يمكن قياس المسافة من الدخول هنا.`,
    }));
    return out;
  }
  const price = ev.price;
  out.facts.push(pick(lang, {
    en: `Current price ${price} (retrieved ${ev.priceAt}).`,
    ur: `موجودہ price ${price} (${ev.priceAt} کو حاصل کیا گیا)۔`,
    ar: `السعر الحالي ${price} (تم الجلب في ${ev.priceAt}).`,
  }));

  if (c.entry != null) {
    const diff = r2(price - c.entry);
    const inFavour = c.direction === 'buy' ? diff > 0 : diff < 0;
    const move = Math.abs(diff);
    const p = pct(move, c.entry);
    out.facts.push(pick(lang, {
      en: `Price is ${move} ${inFavour ? 'in favour of' : 'against'} your entry at ${c.entry} (${p}% of entry price).`,
      ur: `Price آپ کی entry ${c.entry} کے ${inFavour ? 'حق میں' : 'خلاف'} ${move} ہے (entry price کا ${p}%)۔`,
      ar: `السعر ${inFavour ? 'في صالح' : 'ضد'} دخولك عند ${c.entry} بمقدار ${move} (${p}% من سعر الدخول).`,
    }));
    out.evidence.push(bullet(
      pick(lang, {
        en: inFavour ? `Price is currently beyond your entry in your direction (${c.entry} → ${price}).` : `Price is currently against your entry by ${move} (${c.entry} → ${price}).`,
        ur: inFavour ? `Price اس وقت آپ کی entry سے آپ کی سمت میں آگے ہے (${c.entry} → ${price})۔` : `Price اس وقت آپ کی entry کے خلاف ${move} ہے (${c.entry} → ${price})۔`,
        ar: inFavour ? `السعر حالياً أبعد من دخولك في اتجاهك (${c.entry} ← ${price}).` : `السعر حالياً ضد دخولك بمقدار ${move} (${c.entry} ← ${price}).`,
      }),
      inFavour ? 'supportive' : 'opposing',
      pick(lang, { en: 'verified current price vs your stated entry', ur: 'verified موجودہ price بمقابلہ آپ کی بتائی گئی entry', ar: 'السعر الحالي الموثق مقابل سعر دخولك المذكور' }),
      lang, c.direction));
  }

  if (ev.session && ev.session.high != null && ev.session.low != null) {
    const { high, low } = ev.session;
    const span = high - low;
    const posPct = span > 0 ? r2(((price - low) / span) * 100) : null;
    out.facts.push(pick(lang, {
      en: `Session range ${low} – ${high}; price is sitting ${posPct != null ? posPct + '% up that range' : 'inside that range'}.`,
      ur: `Session range ${low} – ${high}; price اس range میں ${posPct != null ? posPct + '% اوپر' : 'کے اندر'} ہے۔`,
      ar: `نطاق الجلسة ${low} – ${high}؛ يقع السعر عند ${posPct != null ? posPct + '% أعلى هذا النطاق' : 'داخل هذا النطاق'}.`,
    }));
    const basisRange = pick(lang, { en: "position within today's verified session range", ur: 'آج کی verified session range کے اندر position', ar: 'الموقع ضمن نطاق الجلسة الموثق اليوم' });
    if (posPct != null) {
      if (posPct >= 70) {
        const up = r2(100 - posPct);
        out.evidence.push(bullet(
          pick(lang, { en: `Price is in the upper ${up}% of today's range${c.direction === 'sell' ? ', against a short' : ''}.`,
            ur: `Price آج کی range کے اوپری ${up}% میں ہے${c.direction === 'sell' ? '، جو short کے خلاف ہے' : ''}۔`,
            ar: `السعر ضمن أعلى ${up}% من نطاق اليوم${c.direction === 'sell' ? '، وهذا ضد صفقة البيع' : ''}.` }),
          c.direction === 'buy' ? 'supportive' : 'opposing', basisRange, lang, c.direction,
          pick(lang, { en: "Price sitting near the top of today's range often reflects short-term buying pressure.",
            ur: 'آج کی range کی چوٹی کے قریب price اکثر short-term خریداری کے دباؤ کو ظاہر کرتا ہے۔',
            ar: 'وقوف السعر قرب أعلى نطاق اليوم غالباً ما يعكس ضغط شراء قصير المدى.' })));
      } else if (posPct <= 30) {
        out.evidence.push(bullet(
          pick(lang, { en: `Price is in the lower ${posPct}% of today's range${c.direction === 'buy' ? ', against a long' : ''}.`,
            ur: `Price آج کی range کے نچلے ${posPct}% میں ہے${c.direction === 'buy' ? '، جو long کے خلاف ہے' : ''}۔`,
            ar: `السعر ضمن أدنى ${posPct}% من نطاق اليوم${c.direction === 'buy' ? '، وهذا ضد صفقة الشراء' : ''}.` }),
          c.direction === 'sell' ? 'supportive' : 'opposing', basisRange, lang, c.direction,
          pick(lang, { en: "Price sitting near the bottom of today's range often reflects short-term selling pressure.",
            ur: 'آج کی range کے نچلے حصے کے قریب price اکثر short-term فروخت کے دباؤ کو ظاہر کرتا ہے۔',
            ar: 'وقوف السعر قرب أسفل نطاق اليوم غالباً ما يعكس ضغط بيع قصير المدى.' })));
      } else {
        out.evidence.push(bullet(
          pick(lang, { en: "Price is mid-range for the session — no directional edge from range position.",
            ur: 'Price سیشن کی درمیانی range میں ہے — range کی بنیاد پر کوئی directional فائدہ نہیں۔',
            ar: 'السعر في منتصف نطاق الجلسة — لا ميزة اتجاهية من موقعه ضمن النطاق.' }),
          'neutral', basisRange, lang, c.direction,
          pick(lang, { en: "Price is neither near today's high nor low, so this alone doesn't lean either way.",
            ur: 'Price نہ آج کی high کے قریب ہے نہ low کے — اس لیے یہ اکیلے کسی سمت کا اشارہ نہیں دیتا۔',
            ar: 'السعر ليس قرب أعلى اليوم ولا أدناه، لذا هذا وحده لا يميل لأي جهة.' })));
      }
    }
    if (ev.session.changePct != null) {
      const cp = ev.session.changePct;
      const withUs = (c.direction === 'buy' && cp > 0) || (c.direction === 'sell' && cp < 0);
      const flat = Math.abs(cp) < 0.15;
      const basisChange = pick(lang, { en: 'verified daily change from the market provider', ur: 'market provider سے verified روزانہ change', ar: 'التغير اليومي الموثق من مزود السوق' });
      const changeReason = flat
        ? pick(lang, { en: 'A near-flat move gives no meaningful directional signal today.',
            ur: 'تقریباً flat move آج کوئی معنی خیز directional اشارہ نہیں دیتا۔',
            ar: 'حركة شبه ثابتة لا تعطي إشارة اتجاهية ذات معنى اليوم.' })
        : cp > 0
        ? pick(lang, { en: 'A positive move on the day reflects more buying than selling pressure right now.',
            ur: 'دن میں مثبت move موجودہ وقت میں فروخت سے زیادہ خریداری کے دباؤ کو ظاہر کرتا ہے۔',
            ar: 'الحركة الإيجابية خلال اليوم تعكس ضغط شراء أكبر من ضغط البيع حالياً.' })
        : pick(lang, { en: 'A negative move on the day reflects more selling than buying pressure right now.',
            ur: 'دن میں منفی move موجودہ وقت میں خریداری سے زیادہ فروخت کے دباؤ کو ظاہر کرتا ہے۔',
            ar: 'الحركة السلبية خلال اليوم تعكس ضغط بيع أكبر من ضغط الشراء حالياً.' });
      out.evidence.push(bullet(
        pick(lang, { en: `Today's move (${cp}%) is ${flat ? 'effectively flat' : withUs ? 'in your direction' : 'against your direction'}.`,
          ur: `آج کا move (${cp}%) ${flat ? 'تقریباً flat ہے' : withUs ? 'آپ کی سمت میں ہے' : 'آپ کی سمت کے خلاف ہے'}۔`,
          ar: `حركة اليوم (${cp}%) ${flat ? 'شبه ثابتة' : withUs ? 'في اتجاهك' : 'ضد اتجاهك'}.` }),
        flat ? 'neutral' : withUs ? 'supportive' : 'opposing', basisChange, lang, c.direction, changeReason));
    }
  }

  const hasRange = !!range;
  if (!hasRange) {
    out.uncertainty.push(pick(lang, {
      en: 'No support or resistance level is available. Our market feed provides price and session range only — not candle history — so this system cannot compute structural levels, and it will not invent them.',
      ur: 'کوئی support یا resistance level دستیاب نہیں۔ ہمارا market feed صرف price اور session range دیتا ہے — candle history نہیں — اس لیے یہ system structural levels compute نہیں کر سکتا، اور انہیں بنائے گا بھی نہیں۔',
      ar: 'لا يتوفر مستوى دعم أو مقاومة. يوفر مصدر السوق لدينا السعر ونطاق الجلسة فقط — دون تاريخ الشموع — لذا لا يمكن لهذا النظام حساب مستويات هيكلية، ولن يخترعها.',
    }));
    return out;
  }
  out.facts.push(pick(lang, {
    en: `Verified trading range over the last ${range.sessions} sessions: ${range.low} – ${range.high} (TwelveData /time_series).`,
    ur: `پچھلے ${range.sessions} sessions پر verified trading range: ${range.low} – ${range.high} (TwelveData /time_series)۔`,
    ar: `نطاق التداول الموثق خلال آخر ${range.sessions} جلسات: ${range.low} – ${range.high} (TwelveData /time_series).`,
  }));
  if (invalidation && invalidation.ok) {
    const sideWord = pick(lang, {
      en: invalidation.side, ur: invalidation.side === 'above' ? 'اوپر' : 'نیچے', ar: invalidation.side === 'above' ? 'أعلى' : 'أدنى',
    });
    out.evidence.push(bullet(
      pick(lang, {
        en: `Verified range ${range.low}–${range.high} over ${range.sessions} sessions; a break ${invalidation.side} ${invalidation.level} would invalidate the range.`,
        ur: `${range.sessions} sessions پر verified range ${range.low}–${range.high}؛ ${invalidation.level} سے ${sideWord} break اس range کو invalidate کر دے گا۔`,
        ar: `النطاق الموثق ${range.low}–${range.high} خلال ${range.sessions} جلسات؛ كسر ${sideWord} ${invalidation.level} سيبطل هذا النطاق.`,
      }), 'neutral',
      pick(lang, { en: 'TwelveData /time_series — verified daily closes', ur: 'TwelveData /time_series — verified روزانہ closes', ar: 'TwelveData /time_series — إغلاقات يومية موثقة' }),
      lang, c.direction,
      pick(lang, { en: "This states the boundaries of the recently verified range — a reference level, not a directional signal on its own.",
        ur: 'یہ حال ہی میں verified range کی حدود بتاتا ہے — ایک reference level ہے، خود کوئی directional اشارہ نہیں۔',
        ar: 'هذا يحدد حدود النطاق الموثق مؤخراً — مستوى مرجعي، وليس إشارة اتجاهية بحد ذاته.' })));
  } else if (invalidation) {
    out.uncertainty.push(invalidationRefusalText(lang, invalidation));
  }
  return out;
}

// ── FUNDAMENTAL ──────────────────────────────────────────────────────────────
export function fundamentalSection(lang, c, ev) {
  const out = { facts: [], evidence: [], uncertainty: [] };
  if (!ev.regime && !ev.yields) {
    out.uncertainty.push(pick(lang, { en: 'No verified macro data was available for this analysis.', ur: 'اس تجزیے کے لیے کوئی verified macro data دستیاب نہیں تھا۔', ar: 'لا تتوفر بيانات كلية موثقة لهذا التحليل.' }));
    return out;
  }
  if (ev.regime) out.facts.push(pick(lang, {
    en: `Market regime reads ${ev.regime.label} (VIX ${ev.regime.vix_level}).`,
    ur: `Market regime ${ev.regime.label} دکھا رہا ہے (VIX ${ev.regime.vix_level})۔`,
    ar: `يشير نظام السوق إلى ${ev.regime.label} (VIX ${ev.regime.vix_level}).`,
  }));
  if (ev.yields) {
    if (ev.yields.us10y != null) out.facts.push(pick(lang, {
      en: `US 10Y nominal yield ${ev.yields.us10y}% (FRED, as of ${ev.yields.us10y_date || 'n/a'}).`,
      ur: `US 10Y nominal yield ${ev.yields.us10y}% (FRED، بمطابق ${ev.yields.us10y_date || 'n/a'})۔`,
      ar: `عائد 10 سنوات الاسمي للولايات المتحدة ${ev.yields.us10y}% (FRED، بتاريخ ${ev.yields.us10y_date || 'غير متاح'}).`,
    }));
    if (ev.yields.real10y != null) out.facts.push(pick(lang, {
      en: `US 10Y real yield ${ev.yields.real10y}% (FRED, as of ${ev.yields.real10y_date || 'n/a'}).`,
      ur: `US 10Y real yield ${ev.yields.real10y}% (FRED، بمطابق ${ev.yields.real10y_date || 'n/a'})۔`,
      ar: `عائد 10 سنوات الحقيقي للولايات المتحدة ${ev.yields.real10y}% (FRED، بتاريخ ${ev.yields.real10y_date || 'غير متاح'}).`,
    }));
    if (ev.yields.breakeven != null) out.facts.push(pick(lang, {
      en: `Breakeven inflation ${ev.yields.breakeven}%.`, ur: `Breakeven inflation ${ev.yields.breakeven}%۔`, ar: `توقعات التضخم التعادلية ${ev.yields.breakeven}%.`,
    }));
  }

  if (c.instrument === 'XAU/USD' && ev.yields && ev.yields.real10y != null) {
    const rr = ev.yields.real10y;
    out.facts.push(pick(lang, {
      en: `Real yields at ${rr}% are a structural headwind for gold at the higher end and a tailwind at the lower end, because gold pays no yield. This is a cross-cycle tendency, not a same-day rule.`,
      ur: `${rr}% پر real yields، gold کے لیے اونچی سطح پر structural headwind اور نچلی سطح پر tailwind ہیں، کیونکہ gold کوئی yield نہیں دیتا۔ یہ ایک cross-cycle رجحان ہے، روزمرہ کا اصول نہیں۔`,
      ar: `العوائد الحقيقية عند ${rr}% تشكل عائقاً هيكلياً للذهب عند المستويات المرتفعة وداعماً عند المستويات المنخفضة، لأن الذهب لا يدفع عائداً. هذا ميل عبر الدورات، وليس قاعدة يومية.`,
    }));
    const basisYield = pick(lang, { en: 'FRED DFII10 + the gold/real-yield relationship', ur: 'FRED DFII10 + gold/real-yield تعلق', ar: 'FRED DFII10 + علاقة الذهب بالعائد الحقيقي' });
    const yieldReasonUp = pick(lang, { en: 'Gold pays no yield, so when real yields rise, holding non-yielding gold becomes relatively less attractive.',
      ur: 'Gold کوئی yield نہیں دیتا، اس لیے جب real yields بڑھتی ہیں تو non-yielding gold رکھنا نسبتاً کم پرکشش ہو جاتا ہے۔',
      ar: 'الذهب لا يدفع عائداً، لذا عندما ترتفع العوائد الحقيقية يصبح الاحتفاظ بالذهب غير المُدر للعائد أقل جاذبية نسبياً.' });
    const yieldReasonDown = pick(lang, { en: 'Gold pays no yield, so when real yields fall, the cost of holding non-yielding gold instead of interest-bearing assets shrinks.',
      ur: 'Gold کوئی yield نہیں دیتا، اس لیے جب real yields گرتی ہیں تو interest-bearing assets کی بجائے non-yielding gold رکھنے کی cost کم ہو جاتی ہے۔',
      ar: 'الذهب لا يدفع عائداً، لذا عندما تنخفض العوائد الحقيقية تقل تكلفة الاحتفاظ بالذهب غير المُدر بدلاً من الأصول المُدرة للفائدة.' });
    const yieldReasonMid = pick(lang, { en: "Real yields are in a middle zone that historically hasn't leaned clearly for or against gold.",
      ur: 'Real yields ایک درمیانی zone میں ہیں جو تاریخی طور پر gold کے حق میں یا خلاف واضح جھکاؤ نہیں رکھتی۔',
      ar: 'العوائد الحقيقية في منطقة وسطى لم تُظهر تاريخياً ميلاً واضحاً لصالح الذهب أو ضده.' });
    if (rr >= 2.0) {
      out.evidence.push(bullet(
        pick(lang, { en: c.direction === 'buy' ? `Real 10Y yield is elevated at ${rr}%, historically a headwind for gold.` : `Elevated real yields (${rr}%) lean against gold.`,
          ur: c.direction === 'buy' ? `Real 10Y yield ${rr}% پر بلند ہے، جو تاریخی طور پر gold کے لیے headwind ہے۔` : `بلند real yields (${rr}%) gold کے خلاف جھکاؤ رکھتی ہیں۔`,
          ar: c.direction === 'buy' ? `عائد 10 سنوات الحقيقي مرتفع عند ${rr}%، وهو تاريخياً عائق أمام الذهب.` : `العوائد الحقيقية المرتفعة (${rr}%) تميل ضد الذهب.` }),
        c.direction === 'buy' ? 'opposing' : 'supportive', basisYield, lang, c.direction, yieldReasonUp));
    } else if (rr <= 1.0) {
      out.evidence.push(bullet(
        pick(lang, { en: c.direction === 'buy' ? `Low real yields (${rr}%) reduce the opportunity cost of holding gold.` : `Low real yields (${rr}%) lean in gold's favour, against a short.`,
          ur: c.direction === 'buy' ? `کم real yields (${rr}%) gold رکھنے کی opportunity cost کم کرتی ہیں۔` : `کم real yields (${rr}%) gold کے حق میں ہیں، جو short کے خلاف ہے۔`,
          ar: c.direction === 'buy' ? `العوائد الحقيقية المنخفضة (${rr}%) تقلل تكلفة فرصة الاحتفاظ بالذهب.` : `العوائد الحقيقية المنخفضة (${rr}%) تميل لصالح الذهب، وهذا ضد صفقة البيع.` }),
        c.direction === 'buy' ? 'supportive' : 'opposing', basisYield, lang, c.direction, yieldReasonDown));
    } else {
      out.evidence.push(bullet(
        pick(lang, { en: `Real yields at ${rr}% are mid-range — no clear fundamental lean for gold.`, ur: `${rr}% پر real yields درمیانی سطح پر ہیں — gold کے لیے کوئی واضح fundamental جھکاؤ نہیں۔`, ar: `العوائد الحقيقية عند ${rr}% متوسطة — لا ميل أساسي واضح للذهب.` }),
        'neutral', pick(lang, { en: 'FRED DFII10', ur: 'FRED DFII10', ar: 'FRED DFII10' }), lang, c.direction, yieldReasonMid));
    }
  }

  if (ev.regime && ev.regime.label) {
    const riskOn = /risk-on/i.test(ev.regime.label);
    const basisRegime = pick(lang, { en: 'VIX-derived regime from /api/sentiment', ur: 'VIX سے اخذ کردہ regime (/api/sentiment)', ar: 'نظام السوق المشتق من VIX عبر /api/sentiment' });
    if (c.instrument === 'BTC/USD') {
      const regimeReason = riskOn
        ? pick(lang, { en: 'Risk-on conditions tend to favour higher-beta assets like BTC.', ur: 'Risk-on حالات عام طور پر BTC جیسے high-beta assets کے حق میں ہوتی ہیں۔', ar: 'ظروف الإقبال على المخاطرة تميل لصالح الأصول عالية التقلب مثل BTC.' })
        : pick(lang, { en: 'Risk-off conditions tend to pressure higher-beta assets like BTC.', ur: 'Risk-off حالات عام طور پر BTC جیسے high-beta assets پر دباؤ ڈالتی ہیں۔', ar: 'ظروف تجنب المخاطرة تضغط عادة على الأصول عالية التقلب مثل BTC.' });
      out.evidence.push(bullet(
        pick(lang, {
          en: riskOn
            ? (c.direction === 'buy' ? 'Risk-on regime is the friendlier backdrop for a high-beta asset like BTC.' : 'Risk-on backdrop leans against a BTC short.')
            : (c.direction === 'sell' ? 'Risk-off backdrop pressures high-beta assets like BTC.' : 'Risk-off backdrop is a headwind for a BTC long.'),
          ur: riskOn
            ? (c.direction === 'buy' ? 'Risk-on regime، BTC جیسے high-beta asset کے لیے زیادہ سازگار پس منظر ہے۔' : 'Risk-on پس منظر BTC کی short کے خلاف جھکاؤ رکھتا ہے۔')
            : (c.direction === 'sell' ? 'Risk-off پس منظر BTC جیسے high-beta assets پر دباؤ ڈالتا ہے۔' : 'Risk-off پس منظر BTC کی long کے لیے headwind ہے۔'),
          ar: riskOn
            ? (c.direction === 'buy' ? 'نظام الإقبال على المخاطرة هو الخلفية الأنسب لأصل عالي التقلب مثل BTC.' : 'خلفية الإقبال على المخاطرة تميل ضد صفقة بيع BTC.')
            : (c.direction === 'sell' ? 'خلفية تجنب المخاطرة تضغط على الأصول عالية التقلب مثل BTC.' : 'خلفية تجنب المخاطرة عائق أمام صفقة شراء BTC.'),
        }),
        (riskOn && c.direction === 'buy') || (!riskOn && c.direction === 'sell') ? 'supportive' : 'opposing',
        basisRegime, lang, c.direction, regimeReason));
    } else if (c.instrument === 'XAU/USD') {
      out.evidence.push(bullet(
        pick(lang, {
          en: `Regime reads ${ev.regime.label}. Gold's response to risk regime is inconsistent — it trades as a defensive asset in some episodes and with real yields in others — so this is context, not a directional signal.`,
          ur: `Regime ${ev.regime.label} دکھا رہا ہے۔ Gold کا risk regime پر ردعمل غیر مستقل ہے — کبھی یہ defensive asset کی طرح چلتا ہے اور کبھی real yields کے ساتھ — اس لیے یہ صرف context ہے، directional signal نہیں۔`,
          ar: `يقرأ النظام ${ev.regime.label}. استجابة الذهب لنظام المخاطرة غير ثابتة — يتداول كأصل دفاعي في بعض الفترات ومع العوائد الحقيقية في أخرى — لذا هذا سياق فقط، وليس إشارة اتجاهية.`,
        }), 'neutral', basisRegime, lang, c.direction,
        pick(lang, { en: "Gold's reaction to risk sentiment is inconsistent across cycles, so this reading is kept as context rather than a directional call.",
          ur: 'Gold کا risk sentiment پر ردعمل مختلف cycles میں غیر مستقل رہتا ہے، اس لیے اسے directional call کی بجائے context کے طور پر رکھا گیا ہے۔',
          ar: 'استجابة الذهب لمعنويات المخاطرة غير ثابتة عبر الدورات، لذا تُعامل هذه القراءة كسياق وليست إشارة اتجاهية.' })));
    } else {
      out.evidence.push(bullet(
        pick(lang, { en: `Regime reads ${ev.regime.label} — background context for ${c.instrument || 'this instrument'}.`,
          ur: `Regime ${ev.regime.label} دکھا رہا ہے — ${c.instrument || 'اس instrument'} کے لیے پس منظر context۔`,
          ar: `يقرأ النظام ${ev.regime.label} — سياق خلفي لـ ${c.instrument || 'هذه الأداة'}.` }), 'neutral', basisRegime, lang, c.direction,
        pick(lang, { en: 'No established directional relationship is used for this instrument, so the regime is shown as context only.',
          ur: 'اس instrument کے لیے کوئی established directional تعلق استعمال نہیں کیا جاتا، اس لیے regime کو صرف context کے طور پر دکھایا گیا ہے۔',
          ar: 'لا تُستخدم علاقة اتجاهية ثابتة لهذه الأداة، لذا يُعرض النظام كسياق فقط.' })));
    }
  }

  out.uncertainty.push(pick(lang, {
    en: 'Supply/demand data (central-bank purchases, ETF flows, futures positioning, mine supply or on-chain flow) could not be independently verified — this platform has no connected source for it, so none is asserted here.',
    ur: 'Supply/demand data (central-bank purchases، ETF flows، futures positioning، mine supply یا on-chain flow) آزادانہ طور پر verify نہیں ہو سکا — اس platform کے پاس اس کے لیے کوئی connected source نہیں، اس لیے یہاں کچھ نہیں کہا جا رہا۔',
    ar: 'تعذّر التحقق المستقل من بيانات العرض/الطلب (مشتريات البنوك المركزية، تدفقات ETF، مراكز العقود الآجلة، إمدادات التعدين أو تدفقات السلسلة) — لا يملك هذا النظام مصدراً متصلاً لها، لذا لا يُذكر شيء هنا.',
  }));
  return out;
}

// ── SENTIMENT ────────────────────────────────────────────────────────────────
export function sentimentSection(lang, ev) {
  const out = { facts: [], evidence: [], uncertainty: [] };
  if (!ev.regime || typeof ev.regime.vix_level !== 'number') {
    out.uncertainty.push(pick(lang, { en: 'No verified volatility/sentiment reading was available.', ur: 'کوئی verified volatility/sentiment reading دستیاب نہیں تھی۔', ar: 'لا تتوفر قراءة موثقة للتقلب/المعنويات.' }));
    return out;
  }
  const v = ev.regime.vix_level;
  const band = v >= 25 ? 'high' : v >= 20 ? 'elevated' : v >= 14 ? 'normal' : 'low';
  const bandWord = pick(lang, { en: band, ur: { high: 'high', elevated: 'elevated', normal: 'normal', low: 'low' }[band], ar: { high: 'مرتفع', elevated: 'مرتفع نسبياً', normal: 'طبيعي', low: 'منخفض' }[band] });
  out.facts.push(pick(lang, {
    en: `VIX ${v} — ${bandWord} volatility regime.`, ur: `VIX ${v} — ${bandWord} volatility regime۔`, ar: `VIX ${v} — نظام تقلب ${bandWord}.`,
  }));
  const basisVix = pick(lang, { en: 'FRED VIXCLS via /api/sentiment', ur: 'FRED VIXCLS بذریعہ /api/sentiment', ar: 'FRED VIXCLS عبر /api/sentiment' });
  if (band === 'high' || band === 'elevated') {
    out.facts.push(pick(lang, {
      en: 'In an elevated-volatility regime the distance price routinely travels against a sound position widens. Stops sized for a calm market get hit more often without the idea being wrong.',
      ur: 'Elevated-volatility regime میں price کا ایک اچھی position کے خلاف سفر کرنے کا فاصلہ عام طور پر بڑھ جاتا ہے۔ Calm market کے لیے سائز کیے گئے stops زیادہ بار hit ہوتے ہیں بغیر اس کے کہ idea غلط ہو۔',
      ar: 'في نظام التقلب المرتفع، تتسع المسافة التي يقطعها السعر عادةً ضد مركز سليم. الوقف المحسوب لسوق هادئ يُصاب أكثر دون أن تكون الفكرة خاطئة.',
    }));
    out.evidence.push(bullet(
      pick(lang, { en: `Volatility is ${bandWord} (VIX ${v}) — wider adverse excursions are normal right now.`, ur: `Volatility ${bandWord} ہے (VIX ${v}) — اس وقت وسیع adverse excursions معمول ہیں۔`, ar: `التقلب ${bandWord} (VIX ${v}) — التحركات المعاكسة الأوسع طبيعية الآن.` }),
      'neutral', basisVix, lang, null,
      pick(lang, { en: "Elevated volatility widens how far price can move either way — it doesn't pick a direction.",
        ur: 'بلند volatility اس بات کو وسیع کر دیتی ہے کہ price کسی بھی طرف کتنا move کر سکتا ہے — یہ کوئی سمت طے نہیں کرتی۔',
        ar: 'التقلب المرتفع يوسّع المدى الذي يمكن أن يتحرك فيه السعر في أي الاتجاهين — لا يحدد اتجاهاً بعينه.' })));
  } else {
    out.evidence.push(bullet(
      pick(lang, { en: `Volatility is ${bandWord} (VIX ${v}).`, ur: `Volatility ${bandWord} ہے (VIX ${v})۔`, ar: `التقلب ${bandWord} (VIX ${v}).` }),
      'neutral', basisVix, lang, null,
      pick(lang, { en: 'Volatility is in a normal/calm range right now — this is background context, not a directional signal.',
        ur: 'اس وقت volatility ایک normal/calm range میں ہے — یہ پس منظر context ہے، directional اشارہ نہیں۔',
        ar: 'التقلب حالياً ضمن نطاق طبيعي/هادئ — هذا سياق خلفي، وليس إشارة اتجاهية.' })));
  }
  return out;
}

// ── NEWS / EVENTS ────────────────────────────────────────────────────────────
export function newsItems(lang, ev, limit = 5) {
  if (ev.newsStatus !== 'verified' || !ev.news.length) return [];
  const impactLabelUncertain = pick(lang, { en: 'Neutral / Uncertain', ur: 'Neutral / غیر یقینی', ar: 'محايد / غير مؤكد' });
  return ev.news.slice(0, limit).map((n) => ({
    what: n.title, source: n.source, at: n.publishedAt,
    why: pick(lang, { en: "Touches this instrument's price drivers.", ur: 'یہ instrument کے price drivers کو چھوتی ہے۔', ar: 'تتعلق بمحركات سعر هذه الأداة.' }),
    effect: pick(lang, {
      en: 'Uncertain — content-dependent; markets typically move before a headline is readable, so no direction is inferred from the title alone.',
      ur: 'غیر یقینی — مواد پر منحصر؛ عام طور پر market headline پڑھے جانے سے پہلے حرکت کر چکی ہوتی ہے، اس لیے صرف title سے کوئی سمت اخذ نہیں کی جاتی۔',
      ar: 'غير مؤكد — يعتمد على المحتوى؛ عادةً ما تتحرك الأسواق قبل أن يصبح العنوان قابلاً للقراءة، لذا لا يُستنتج أي اتجاه من العنوان وحده.',
    }),
    impact: 'neutral', impactLabel: impactLabelUncertain,
  }));
}
export function calendarItems(lang, ev, limit = 5) {
  if (ev.calendarStatus !== 'verified' || !ev.calendar.length) return [];
  return ev.calendar.slice(0, limit).map((e) => ({ what: e.event || e.title, when: e.time || e.date, impact: e.impact || pick(lang, { en: 'impact not specified', ur: 'impact واضح نہیں', ar: 'التأثير غير محدد' }) }));
}
export function newsUnavailable(lang) {
  return pick(lang, { en: 'No instrument-specific headline could be verified in the current feed.', ur: 'موجودہ feed میں کوئی instrument-specific headline verify نہیں ہو سکی۔', ar: 'تعذّر التحقق من أي عنوان خاص بهذه الأداة في التغذية الحالية.' });
}
export function calendarUnavailable(lang, note) {
  return pick(lang, {
    en: `Upcoming economic events could not be verified${note ? ` — ${note}` : ''}.`,
    ur: `آنے والے economic events verify نہیں ہو سکے${note ? ` — ${note}` : ''}۔`,
    ar: `تعذّر التحقق من الأحداث الاقتصادية القادمة${note ? ` — ${note}` : ''}.`,
  });
}

// ── UPCOMING ECONOMIC DATA — a category distinct from GENERAL NEWS ──────────
// evidence.js's calendar feed (Finnhub /calendar/economic) is honestly
// documented elsewhere in this codebase as unavailable on the current plan
// (HTTP 403) — so this almost always renders its unavailable branch, and
// that is stated plainly rather than backfilled from memory. When a real
// verified event IS present, this deliberately does NOT predict a result or
// invent a consensus figure to compare against (none is provided by the
// feed): "possible bullish / possible bearish" is a generic, honest
// explanation of how a stronger/weaker-than-expected print could move the
// instrument in either direction — not a forecast of which one will happen.
export function calendarSection(lang, ev, instrumentName) {
  const out = { events: [], unavailableText: null };
  if (ev.calendarStatus !== 'verified' || !ev.calendar || !ev.calendar.length) {
    out.unavailableText = calendarUnavailable(lang, ev.calendarNote);
    return out;
  }
  out.events = ev.calendar.slice(0, 5).map((e) => ({
    what: e.event || e.title,
    when: e.time || e.date,
    impact: e.impact || pick(lang, { en: 'impact not specified', ur: 'impact واضح نہیں', ar: 'التأثير غير محدد' }),
    whatItMeans: pick(lang, {
      en: 'A scheduled data release that can move markets once the actual figure is known.',
      ur: 'ایک طے شدہ data release جو اصل figure معلوم ہونے کے بعد markets کو move کر سکتی ہے۔',
      ar: 'إصدار بيانات مجدول يمكن أن يحرك الأسواق بمجرد معرفة الرقم الفعلي.',
    }),
    possibleBullish: pick(lang, {
      en: `A stronger-than-expected result could pressure ${instrumentName} — direction depends on the actual number, which is not known in advance.`,
      ur: `توقع سے مضبوط result ${instrumentName} پر دباؤ ڈال سکتا ہے — سمت اصل number پر منحصر ہے، جو پہلے سے معلوم نہیں۔`,
      ar: `قد تضغط نتيجة أقوى من المتوقع على ${instrumentName} — يعتمد الاتجاه على الرقم الفعلي، وهو غير معروف مسبقاً.`,
    }),
    possibleBearish: pick(lang, {
      en: `A weaker-than-expected result could support ${instrumentName} — again, this depends entirely on the actual release, not a prediction made here.`,
      ur: `توقع سے کمزور result ${instrumentName} کو support دے سکتا ہے — یہ مکمل طور پر اصل release پر منحصر ہے، یہاں کوئی پیشگوئی نہیں کی جا رہی۔`,
      ar: `قد تدعم نتيجة أضعف من المتوقع ${instrumentName} — يعتمد هذا بالكامل على الإصدار الفعلي، وليس تنبؤاً هنا.`,
    }),
    tradeRelevance: pick(lang, {
      en: 'Worth watching if this falls inside your holding window — volatility around the release can widen normal price movement either way.',
      ur: 'اگر یہ آپ کی holding window کے اندر آتا ہے تو دیکھنے کے قابل ہے — release کے ارد گرد volatility معمول کی price movement کو دونوں طرف وسیع کر سکتی ہے۔',
      ar: 'يستحق المراقبة إذا وقع ضمن فترة احتفاظك — قد يوسّع التقلب حول الإصدار حركة السعر الطبيعية في أي الاتجاهين.',
    }),
  }));
  return out;
}

// ── RISK ─────────────────────────────────────────────────────────────────────
export function riskSection(lang, c) {
  const out = { facts: [], evidence: [] };
  if (c.has_stop_loss === false) {
    out.facts.push(pick(lang, { en: 'There is no Stop Loss on this position.', ur: 'اس position پر کوئی Stop Loss نہیں ہے۔', ar: 'لا يوجد وقف خسارة على هذا المركز.' }));
    out.facts.push(pick(lang, {
      en: 'This is the single most consequential fact in the case. The maximum loss is currently undefined — it is set by whatever the market does next, not by your plan. Every judgement below is secondary to it.',
      ur: 'یہ اس case کا سب سے اہم fact ہے۔ زیادہ سے زیادہ loss فی الحال غیر متعین ہے — یہ آپ کے plan سے نہیں بلکہ market اگے کیا کرتا ہے اس سے طے ہوگا۔ نیچے دی گئی ہر judgement اس کے بعد آتی ہے۔',
      ar: 'هذه هي الحقيقة الأهم في هذه الحالة. الخسارة القصوى غير محددة حالياً — يحددها ما يفعله السوق لاحقاً، لا خطتك. كل حكم أدناه ثانوي أمام هذه الحقيقة.',
    }));
    out.evidence.push(bullet(
      pick(lang, { en: 'No stop loss — maximum loss on the position is undefined.', ur: 'کوئی stop loss نہیں — position پر زیادہ سے زیادہ loss غیر متعین ہے۔', ar: 'لا يوجد وقف خسارة — الخسارة القصوى على المركز غير محددة.' }),
      'opposing', pick(lang, { en: 'stated by you in this conversation', ur: 'آپ کے بتائے مطابق', ar: 'كما ذكرت' }), lang, c.direction));
  } else {
    out.facts.push(pick(lang, { en: 'Stop level not established, so risk per unit cannot be measured.', ur: 'Stop level طے نہیں کیا گیا، اس لیے فی unit risk نہیں ناپا جا سکتا۔', ar: 'لم يُحدَّد مستوى الوقف، لذا لا يمكن قياس المخاطرة لكل وحدة.' }));
  }
  if (c.position_size) out.facts.push(pick(lang, {
    en: `Position size, in your words: "${c.position_size}".`, ur: `Position size، آپ کے الفاظ میں: "${c.position_size}"۔`, ar: `حجم المركز، بكلماتك: "${c.position_size}".`,
  }));
  return out;
}

// ── BEHAVIOUR ────────────────────────────────────────────────────────────────
export function behaviourSection(lang, c) {
  const strengths = [], weaknesses = [];
  if (c.original_thesis) strengths.push(pick(lang, {
    en: 'You can still state why you entered, which is what makes it possible to judge whether the idea is intact.',
    ur: 'آپ اب بھی بتا سکتے ہیں کہ آپ نے کیوں entry لی — یہی وہ چیز ہے جو یہ جانچنا ممکن بناتی ہے کہ idea ابھی بھی intact ہے یا نہیں۔',
    ar: 'ما زلت قادراً على ذكر سبب دخولك، وهذا ما يجعل من الممكن الحكم على ما إذا كانت الفكرة لا تزال سليمة.',
  }));
  if (c.has_stop_loss === false) weaknesses.push(pick(lang, {
    en: 'No stop loss: the loss on this position is currently open-ended.', ur: 'کوئی stop loss نہیں: اس position پر loss فی الحال open-ended ہے۔', ar: 'لا يوجد وقف خسارة: الخسارة على هذا المركز مفتوحة حالياً.',
  }));
  if (!c.original_thesis) weaknesses.push(pick(lang, {
    en: 'No stated entry reason: without it, "hold" and "hope" are indistinguishable.', ur: 'Entry کی کوئی وجہ نہیں بتائی گئی: اس کے بغیر "hold" اور "hope" میں فرق نہیں کیا جا سکتا۔', ar: 'لا يوجد سبب دخول مذكور: بدونه، لا يمكن التمييز بين "الاحتفاظ" و"الأمل".',
  }));
  if (c.emotional_state === 'pressure_expressed') weaknesses.push(pick(lang, {
    en: 'You have described pressure around this trade. That is worth naming — decisions made to relieve discomfort tend to be the ones traders regret.',
    ur: 'آپ نے اس trade کے گرد دباؤ بیان کیا ہے۔ یہ بات کہنے کے لائق ہے — discomfort کم کرنے کے لیے کیے گئے فیصلے وہی ہوتے ہیں جن پر traders بعد میں پچھتاتے ہیں۔',
    ar: 'لقد وصفت ضغطاً يحيط بهذه الصفقة. هذا يستحق الذكر — القرارات المتخذة لتخفيف الانزعاج غالباً ما تكون تلك التي يندم عليها المتداولون.',
  }));
  return { strengths, weaknesses };
}

// ── MARKET DIRECTION ─────────────────────────────────────────────────────────
export function marketDirectionText(lang, meters, instrument) {
  const avail = ['technical', 'fundamental', 'sentiment'].map(k => meters[k]).filter(m => m && m.score != null);
  if (!avail.length) return { lean: null, line: pick(lang, {
    en: 'Not enough verified evidence to form a combined market-direction view yet.',
    ur: 'ابھی combined market-direction view بنانے کے لیے کافی verified evidence نہیں ہے۔',
    ar: 'لا تتوفر أدلة موثقة كافية بعد لتشكيل رأي موحّد حول اتجاه السوق.',
  }), drivers: [] };
  const avg = avail.reduce((a, m) => a + m.score, 0) / avail.length;
  const lean = avg > 0.15 ? 'bullish' : avg < -0.15 ? 'bearish' : 'mixed';
  const leanWord = pick(lang, { en: { bullish: 'Bullish', bearish: 'Bearish', mixed: 'Mixed' }[lean],
    ur: { bullish: 'Bullish', bearish: 'Bearish', mixed: 'Mixed' }[lean],
    ar: { bullish: 'صاعد', bearish: 'هابط', mixed: 'مختلط' }[lean] });
  const strengthWord = (s) => pick(lang, { en: s, ur: s, ar: { Strong: 'قوية', Moderate: 'متوسطة', Weak: 'ضعيفة', Unavailable: 'غير متاحة' }[s] || s });
  const leanOf = (m) => pick(lang, { en: m.lean || 'unavailable', ur: m.lean || 'unavailable', ar: { bullish: 'صاعد', bearish: 'هابط', neutral: 'محايد' }[m.lean] || 'غير متاح' });
  const nameOf = (m) => pick(lang, { en: m.label, ur: m.label, ar: { Technical: 'التحليل الفني', Fundamental: 'التحليل الأساسي', Sentiment: 'المعنويات' }[m.label] || m.label });
  const drivers = avail.map(m => pick(lang, {
    en: `${m.label} reads ${m.lean || 'unavailable'} (${m.strength} evidence)`,
    ur: `${m.label} کی reading ${m.lean || 'unavailable'} ہے (${m.strength} evidence)`,
    ar: `${nameOf(m)} يقرأ ${leanOf(m)} (أدلة ${strengthWord(m.strength)})`,
  }));
  const line = pick(lang, {
    en: `**${leanWord}** for ${instrument}.`, ur: `${instrument} کے لیے **${leanWord}**۔`, ar: `**${leanWord}** بالنسبة لـ ${instrument}.`,
  });
  return { lean, line, drivers };
}

// ── OVERALL EVIDENCE SCORE ───────────────────────────────────────────────────
// A display-only sum of the three meters' own categorical lean (+1 bullish /
// −1 bearish / 0 neutral for the INSTRUMENT — exactly meters.js's `m.lean`,
// nothing recomputed). This is an evidence count, not a probability: it is
// labelled "Overall Evidence Score" everywhere, never "Probability" or "Odds".
export function overallEvidence(lang, meters) {
  const avail = ['technical', 'fundamental', 'sentiment'].map(k => meters[k]).filter(m => m && m.score != null);
  if (!avail.length) {
    return { score: null, text: pick(lang, {
      en: 'Not enough verified evidence yet to form an overall evidence score.',
      ur: 'ابھی overall evidence score بنانے کے لیے کافی verified evidence نہیں ہے۔',
      ar: 'لا تتوفر أدلة موثقة كافية بعد لتشكيل درجة أدلة إجمالية.',
    }) };
  }
  const score = avail.reduce((a, m) => a + (m.lean === 'bullish' ? 1 : m.lean === 'bearish' ? -1 : 0), 0);
  const leanWord = pick(lang, {
    en: score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral',
    ur: score > 0 ? 'Bullish' : score < 0 ? 'Bearish' : 'Neutral',
    ar: score > 0 ? 'صاعد' : score < 0 ? 'هابط' : 'محايد',
  });
  const text = pick(lang, {
    en: `Overall evidence currently leans ${leanWord}.`,
    ur: `Overall evidence اس وقت ${leanWord} کی طرف جھکاؤ رکھتی ہے۔`,
    ar: `تميل الأدلة الإجمالية حالياً نحو ${leanWord}.`,
  });
  return { score, text };
}

// ── FIVE-FACTOR EVIDENCE SNAPSHOT ────────────────────────────────────────────
// One compact row per evidence category, for the scan-in-seconds summary that
// sits under the five evidence sections. Technical/Fundamental/Sentiment reuse
// meters.js's own lean — nothing recomputed. Upcoming Data and General News
// have no numeric score anywhere in this system (a scheduled event or a
// headline is deliberately never converted into a bullish/bearish number —
// see calendarSection()/newsItems() above), so they report the only honest
// words available: CONDITIONAL (real events exist, direction genuinely
// depends on the release) / NEUTRAL (headlines exist, none treated as
// directional) / UNAVAILABLE (nothing verified). `overallEvidence` is passed
// through unchanged — this function only adds the two non-scored rows.
export function fiveFactorOverview(lang, meters, hasCalendarEvents, hasNews) {
  const rows = [];
  const leanWord = (m) => !m || m.score == null ? pick(lang, { en: 'Unavailable', ur: 'دستیاب نہیں', ar: 'غير متاح' })
    : pick(lang, { en: { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' }[m.lean],
        ur: { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' }[m.lean],
        ar: { bullish: 'صاعد', bearish: 'هابط', neutral: 'محايد' }[m.lean] });
  const H = headings(lang);
  rows.push({ key: 'technical', label: H.technical, word: leanWord(meters.technical), lean: meters.technical && meters.technical.lean });
  rows.push({ key: 'fundamental', label: H.fundamental, word: leanWord(meters.fundamental), lean: meters.fundamental && meters.fundamental.lean });
  rows.push({ key: 'sentiment', label: H.sentiment, word: leanWord(meters.sentiment), lean: meters.sentiment && meters.sentiment.lean });
  rows.push({
    key: 'upcomingData', label: H.upcomingData,
    word: hasCalendarEvents ? pick(lang, { en: 'Conditional', ur: 'Conditional', ar: 'مشروط' }) : pick(lang, { en: 'Unavailable', ur: 'دستیاب نہیں', ar: 'غير متاح' }),
    lean: hasCalendarEvents ? 'neutral' : null,
  });
  rows.push({
    key: 'news', label: H.news,
    word: hasNews ? pick(lang, { en: 'Neutral', ur: 'Neutral', ar: 'محايد' }) : pick(lang, { en: 'Unavailable', ur: 'دستیاب نہیں', ar: 'غير متاح' }),
    lean: hasNews ? 'neutral' : null,
  });
  return rows;
}

// ── PER-EVIDENCE-ROW EXPLANATION ─────────────────────────────────────────────
// Every meter input already carries a `lean` (+1/0/−1) relative to the
// INSTRUMENT — meters.js's own field, never altered here. This turns that same
// lean, plus the trader's own stated direction, into the position-specific
// "Supports your X / Works against your X" tag (the SAME tag/labels already
// used throughout the report body) and a one-sentence tooltip explanation.
// No new financial relationship is stated — only the existing sign is read
// and paired with the trader's direction, exactly the rule already applied
// everywhere else in this module (see `tag()` above).
export function meterInputExplain(lang, direction, lean) {
  const L = labels(lang);
  const d = dirWord(lang, direction);
  const stance = lean > 0
    ? (direction === 'buy' ? 'supportive' : direction === 'sell' ? 'opposing' : 'neutral')
    : lean < 0
    ? (direction === 'sell' ? 'supportive' : direction === 'buy' ? 'opposing' : 'neutral')
    : 'neutral';
  const scoreStr = lean > 0 ? '+1' : lean < 0 ? '−1' : '0';
  const impact = stance === 'supportive' ? L.supportsYour(d) : stance === 'opposing' ? L.worksAgainst(d) : L.contextOnly;
  const leanWord = pick(lang, {
    en: lean > 0 ? 'bullish' : lean < 0 ? 'bearish' : 'neutral',
    ur: lean > 0 ? 'Bullish' : lean < 0 ? 'Bearish' : 'Neutral',
    ar: lean > 0 ? 'صاعد' : lean < 0 ? 'هابط' : 'محايد',
  });
  const tooltip = stance === 'neutral'
    ? pick(lang, {
      en: `This factor is neutral right now, so it does not lean for or against your ${d} position — it contributes 0 points.`,
      ur: `یہ factor اس وقت neutral ہے، اس لیے یہ آپ کی ${d} position کے حق میں یا خلاف نہیں جھکتا — یہ 0 points دیتا ہے۔`,
      ar: `هذا العامل محايد حالياً، لذا لا يميل لصالح أو ضد صفقة ${d} الخاصة بك — يساهم بـ 0 نقطة.`,
    })
    : pick(lang, {
      en: `This is a ${leanWord} factor for the market. Given your ${d} position, it ${stance === 'supportive' ? 'supports' : 'works against'} your trade, so it contributes ${scoreStr} point.`,
      ur: `یہ market کے لیے ایک ${leanWord} factor ہے۔ آپ کی ${d} position کو دیکھتے ہوئے، یہ آپ کی trade کو ${stance === 'supportive' ? 'support کرتا ہے' : 'کے خلاف جاتا ہے'}، اس لیے یہ ${scoreStr} point دیتا ہے۔`,
      ar: `هذا عامل ${leanWord} بالنسبة للسوق. بالنظر إلى صفقة ${d} الخاصة بك، فإنه ${stance === 'supportive' ? 'يدعم' : 'يعمل ضد'} صفقتك، لذا يساهم بـ ${scoreStr} نقطة.`,
    });
  return { stance, impact, scoreStr, tooltip };
}

// ── POSITION SUMMARY ─────────────────────────────────────────────────────────
// Reads the SAME `pos` object position.js already computed — no recalculation,
// only a parallel-language rendering of its fields.
export function positionSummaryLines(lang, pos) {
  const L = [];
  if (!pos || !pos.computableCount) return L;
  const U = pos.sized
    ? pick(lang, { en: 'lots', ur: 'lots', ar: 'لوت' })
    : pick(lang, { en: 'equally weighted units', ur: 'برابر وزن والے units', ar: 'وحدات موزونة بالتساوي' });
  L.push(pick(lang, {
    en: `Layers supplied: ${pos.layerCount} (${pos.computableCount} complete enough to compute).`,
    ur: `دی گئی layers: ${pos.layerCount} (${pos.computableCount} compute کرنے کے لیے کافی مکمل)۔`,
    ar: `الطبقات المقدَّمة: ${pos.layerCount} (${pos.computableCount} مكتملة بما يكفي للحساب).`,
  }));
  if (pos.grossLongSize) L.push(pick(lang, {
    en: `Gross long ${pos.grossLongSize} ${U}, weighted average entry ${pos.avgLongEntry}.`,
    ur: `Gross long ${pos.grossLongSize} ${U}، weighted average entry ${pos.avgLongEntry}۔`,
    ar: `الشراء الإجمالي ${pos.grossLongSize} ${U}، متوسط دخول موزون ${pos.avgLongEntry}.`,
  }));
  if (pos.grossShortSize) L.push(pick(lang, {
    en: `Gross short ${pos.grossShortSize} ${U}, weighted average entry ${pos.avgShortEntry}.`,
    ur: `Gross short ${pos.grossShortSize} ${U}، weighted average entry ${pos.avgShortEntry}۔`,
    ar: `البيع الإجمالي ${pos.grossShortSize} ${U}، متوسط دخول موزون ${pos.avgShortEntry}.`,
  }));
  const netDirWord = pos.netDirection === 'flat'
    ? pick(lang, { en: '(delta-flat)', ur: '(delta-flat)', ar: '(محايد الدلتا)' })
    : String(pos.netDirection).toUpperCase();
  L.push(pick(lang, {
    en: `Net exposure ${Math.abs(pos.netSize)} ${U} ${netDirWord}.`, ur: `Net exposure ${Math.abs(pos.netSize)} ${U} ${netDirWord}۔`, ar: `صافي الانكشاف ${Math.abs(pos.netSize)} ${U} ${netDirWord}.`,
  }));
  if (pos.hedged) L.push(pick(lang, {
    en: `Hedged: ${Math.round(pos.hedgeRatio * 100)}% of the larger side is offset by the opposite side.`,
    ur: `Hedged: بڑے side کا ${Math.round(pos.hedgeRatio * 100)}% مخالف side سے offset ہے۔`,
    ar: `محوَّط: ${Math.round(pos.hedgeRatio * 100)}% من الجانب الأكبر مقاصة بالجانب المقابل.`,
  }));
  if (pos.floatingPoints != null) {
    const ptWord = pos.sized
      ? pick(lang, { en: 'lot-points', ur: 'lot-points', ar: 'نقاط لوت' })
      : pick(lang, { en: 'weighted points', ur: 'weighted points', ar: 'نقاط موزونة' });
    L.push(pick(lang, {
      en: `Aggregate floating result ${pos.floatingPoints} ${ptWord}${pos.floatingMoney != null ? ` (≈ ${pos.floatingMoney} account currency)` : ''} at the current verified price ${pos.currentPrice} — DERIVED, not broker-confirmed.`,
      ur: `مجموعی floating result ${pos.floatingPoints} ${ptWord}${pos.floatingMoney != null ? ` (≈ ${pos.floatingMoney} account currency)` : ''} موجودہ verified price ${pos.currentPrice} پر — DERIVED، broker سے confirm شدہ نہیں۔`,
      ar: `النتيجة العائمة الإجمالية ${pos.floatingPoints} ${ptWord}${pos.floatingMoney != null ? ` (≈ ${pos.floatingMoney} بعملة الحساب)` : ''} عند السعر الموثق الحالي ${pos.currentPrice} — مُشتقة، غير مؤكدة من الوسيط.`,
    }));
  }
  if (pos.worstLayer) {
    const ptWord = pos.sized ? pick(lang, { en: 'lot-pts', ur: 'lot-pts', ar: 'نقاط لوت' }) : pick(lang, { en: 'weighted points', ur: 'weighted points', ar: 'نقاط موزونة' });
    L.push(pick(lang, {
      en: `Worst layer ${pos.worstLayer.id}: ${String(pos.worstLayer.direction).toUpperCase()} @ ${pos.worstLayer.entry}, ${pos.worstLayer.points} ${ptWord}.`,
      ur: `بدترین layer ${pos.worstLayer.id}: ${String(pos.worstLayer.direction).toUpperCase()} @ ${pos.worstLayer.entry}, ${pos.worstLayer.points} ${ptWord}۔`,
      ar: `أسوأ طبقة ${pos.worstLayer.id}: ${String(pos.worstLayer.direction).toUpperCase()} @ ${pos.worstLayer.entry}, ${pos.worstLayer.points} ${ptWord}.`,
    }));
  }
  if (pos.layersWithoutStop) L.push(pick(lang, {
    en: `${pos.layersWithoutStop} of ${pos.computableCount} layer(s) carry no Stop Loss.`,
    ur: `${pos.computableCount} میں سے ${pos.layersWithoutStop} layer(s) پر کوئی Stop Loss نہیں۔`,
    ar: `${pos.layersWithoutStop} من أصل ${pos.computableCount} طبقة/طبقات بدون وقف خسارة.`,
  }));
  if (!pos.sized) L.push(pick(lang, {
    en: 'No position sizes were supplied, so every layer is weighted equally. Direction and which layer helps or hurts are unaffected; a money figure is not produced, because relative weights cannot support one.',
    ur: 'کوئی position sizes فراہم نہیں کی گئیں، اس لیے ہر layer کو برابر وزن دیا گیا ہے۔ Direction اور کون سی layer مدد یا نقصان کر رہی ہے متاثر نہیں ہوتا؛ money figure نہیں دی جاتی، کیونکہ relative weights اس کی support نہیں کرتیں۔',
    ar: 'لم تُقدَّم أحجام مراكز، لذا وُزنت كل طبقة بالتساوي. الاتجاه وأي طبقة تساعد أو تضر لا يتأثران؛ لا يُنتَج رقم مالي، لأن الأوزان النسبية لا تدعم ذلك.',
  }));
  return L;
}

// ── TRADE MANAGEMENT OPTIONS — three genuinely different strategies ─────────
// Named for WHAT each one does, not "close/hold/hold-more": Immediate Risk
// Reduction, Protected Continuation, Structured Reassessment. `pos` is
// optional and, when it carries a real worst-vs-best split (a multi-layer
// or hedged book), Option 1 names the actual worst layer from position.js's
// own numbers instead of speaking only to a single-layer position.
export function managementOptionsLocalized(lang, direction, balance, invalidation, pos) {
  const d = dirWord(lang, direction);
  const opts = [];

  const multiLayerSplit = pos && pos.computableCount > 1 && pos.worstLayer
    && (!pos.bestLayer || pos.bestLayer.id !== pos.worstLayer.id);
  const worstId = multiLayerSplit ? pos.worstLayer.id : null;

  opts.push({
    title: pick(lang, { en: 'Immediate Risk Reduction', ur: 'فوری Risk Reduction', ar: 'تخفيض المخاطر الفوري' }),
    what: multiLayerSplit ? pick(lang, {
      en: `Close the worst-performing layer (${worstId}) now to cut the part of the book doing the most damage, or close the full position if you want the exposure removed entirely.`,
      ur: `سب سے زیادہ نقصان دینے والا حصہ کاٹنے کے لیے abhi worst-performing layer (${worstId}) بند کریں، یا اگر مکمل طور پر exposure ختم کرنا چاہیں تو پوری position بند کریں۔`,
      ar: `أغلق الطبقة الأسوأ أداءً (${worstId}) الآن لقطع الجزء الأكثر ضرراً من المركز، أو أغلق المركز بالكامل إذا أردت إزالة الانكشاف كلياً.`,
    }) : pick(lang, { en: 'Close the position (or its losing layers) immediately, removing the open exposure.',
      ur: 'Position (یا اس کی losing layers) فوری طور پر بند کریں، open exposure ختم کر دیں۔',
      ar: 'إغلاق المركز (أو طبقاته الخاسرة) فوراً، وإزالة الانكشاف المفتوح.' }),
    why: pick(lang, {
      en: balance === 'against' ? `Evidence currently leans against your ${d}; if you would not open this position today on the same information, that is itself the case for closing it now.`
        : balance === 'insufficient' ? 'There is not yet enough verified evidence to judge the position either way — removing the uncertainty is itself a legitimate reason some traders close here.'
        : `Even with evidence currently ${balance === 'favours' ? 'in your favour' : 'mixed'}, exiting removes all further exposure — the option exists regardless of the read.`,
      ur: balance === 'against' ? `Evidence اس وقت آپ کی ${d} کے خلاف جھکاؤ رکھتی ہے؛ اگر آپ آج اسی معلومات پر یہ position نہ کھولتے، تو یہی خود ابھی اسے بند کرنے کی وجہ ہے۔`
        : balance === 'insufficient' ? 'Position کو کسی بھی طرف judge کرنے کے لیے ابھی کافی verified evidence نہیں ہے — uncertainty ختم کرنا خود ایک جائز وجہ ہے کہ کچھ traders یہاں close کرتے ہیں۔'
        : `Evidence اس وقت ${balance === 'favours' ? 'آپ کے حق میں' : 'mixed'} ہونے کے باوجود، exit کرنا باقی exposure ختم کر دیتا ہے — یہ option ہر صورت میں موجود ہے۔`,
      ar: balance === 'against' ? `تميل الأدلة حالياً ضد صفقة ${d} الخاصة بك؛ إذا لم تكن لتفتح هذا المركز اليوم بنفس المعلومات، فهذا بحد ذاته سبب لإغلاقه الآن.`
        : balance === 'insufficient' ? 'لا تتوفر أدلة موثقة كافية بعد للحكم على المركز في أي اتجاه — إزالة عدم اليقين بحد ذاته سبب مشروع يدفع بعض المتداولين للإغلاق هنا.'
        : `حتى مع أدلة ${balance === 'favours' ? 'في صالحك' : 'مختلطة'} حالياً، فإن الخروج يزيل كل الانكشاف الإضافي — هذا الخيار متاح بغض النظر عن القراءة.`,
    }),
    risk: pick(lang, { en: 'Any loss on the closed portion is realised immediately rather than remaining open to change.',
      ur: 'بند کیے گئے حصے پر کوئی بھی loss فوری طور پر realise ہو جاتا ہے بجائے اس کے کہ وہ change کے لیے open رہے۔',
      ar: 'أي خسارة على الجزء المُغلق تتحقق فوراً بدلاً من أن تبقى مفتوحة للتغير.' }),
  });

  if (invalidation && invalidation.ok) {
    const sideWord = pick(lang, { en: invalidation.side, ur: invalidation.side === 'above' ? 'اوپر' : 'نیچے', ar: invalidation.side === 'above' ? 'أعلى' : 'أدنى' });
    opts.push({
      title: pick(lang, { en: 'Protected Continuation', ur: 'Protected Continuation', ar: 'الاستمرار المحمي' }),
      what: pick(lang, {
        en: `Keep the position open, with a protective stop at or beyond the verified level ${invalidation.level} (${invalidation.side} the current price).`,
        ur: `Position کو open رکھیں، verified level ${invalidation.level} پر یا اس سے آگے (موجودہ price سے ${sideWord}) protective stop کے ساتھ۔`,
        ar: `الاحتفاظ بالمركز مفتوحاً، مع وقف وقائي عند أو بعد المستوى الموثق ${invalidation.level} (${sideWord} السعر الحالي).`,
      }),
      why: pick(lang, {
        en: `This is the boundary of the verified ${invalidation.sessions}-session trading range — the most defensible invalidation point available from real market data, not an estimate.`,
        ur: `یہ verified ${invalidation.sessions}-session trading range کی حد ہے — real market data سے دستیاب سب سے قابل دفاع invalidation point، اندازہ نہیں۔`,
        ar: `هذا هو حد نطاق التداول الموثق لـ ${invalidation.sessions} جلسة — أكثر نقطة إبطال يمكن الدفاع عنها من بيانات سوق حقيقية، وليست تقديراً.`,
      }),
      trigger: pick(lang, {
        en: `A close ${invalidation.side} ${invalidation.level} breaks the verified range this level is anchored to.`,
        ur: `${invalidation.level} سے ${sideWord} close ہونا اس verified range کو توڑ دیتا ہے جس پر یہ level anchored ہے۔`,
        ar: `الإغلاق ${sideWord} ${invalidation.level} يكسر النطاق الموثق الذي يستند إليه هذا المستوى.`,
      }),
      risk: pick(lang, {
        en: 'A brief spike through the level can still trigger the stop before price returns in your favour — this places a floor on the loss, it does not prevent one.',
        ur: 'ایک مختصر spike اس level کو عبور کر کے stop trigger کر سکتا ہے اس سے پہلے کہ price آپ کے حق میں واپس آئے — یہ loss پر floor لگاتا ہے، اسے روکتا نہیں۔',
        ar: 'قد يؤدي ارتفاع مؤقت عبر المستوى إلى تفعيل الوقف قبل عودة السعر لصالحك — هذا يضع حداً أدنى للخسارة، ولا يمنعها.',
      }),
    });
  } else {
    opts.push({
      title: pick(lang, { en: 'Protected Continuation', ur: 'Protected Continuation', ar: 'الاستمرار المحمي' }),
      what: pick(lang, { en: 'Keep the position open with a protective stop.', ur: 'Position کو protective stop کے ساتھ open رکھیں۔', ar: 'الاحتفاظ بالمركز مفتوحاً مع وقف وقائي.' }),
      why: pick(lang, {
        en: `An exact protective level cannot be independently justified from the available verified data${invalidation ? `: ${invalidation.reason}` : ''}.`,
        ur: `دستیاب verified data سے کوئی exact protective level آزادانہ طور پر justify نہیں ہو سکتا${invalidation ? `: ${invalidation.reason}` : ''}۔`,
        ar: `لا يمكن تبرير مستوى وقائي دقيق بشكل مستقل من البيانات الموثقة المتاحة${invalidation ? `: ${invalidation.reason}` : ''}.`,
      }),
      risk: pick(lang, {
        en: 'Without a defensible level, any stop placed here would be a guess rather than evidence — so none is proposed.',
        ur: 'کسی قابل دفاع level کے بغیر، یہاں لگایا گیا کوئی بھی stop اندازہ ہوگا نہ کہ evidence — اس لیے کوئی تجویز نہیں کیا جا رہا۔',
        ar: 'بدون مستوى يمكن الدفاع عنه، أي وقف يوضع هنا سيكون تخميناً لا دليلاً — لذا لا يُقترح أي مستوى.',
      }),
      refused: true,
    });
  }

  opts.push({
    title: pick(lang, { en: 'Structured Reassessment', ur: 'Structured Reassessment', ar: 'إعادة تقييم منظّمة' }),
    what: pick(lang, {
      en: 'Hold the position only while its confirming conditions remain true, on a defined schedule for reassessment — not indefinitely.',
      ur: 'Position کو صرف اس وقت تک hold کریں جب تک اس کی confirming conditions درست رہیں، ایک متعین reassessment schedule پر — لامحدود مدت تک نہیں۔',
      ar: 'الاحتفاظ بالمركز فقط طالما بقيت شروطه المؤكدة صحيحة، وفق جدول محدد لإعادة التقييم — وليس إلى أجل غير مسمى.',
    }),
    why: pick(lang, {
      en: balance === 'favours' ? 'Evidence currently leans in your favour; the position remains consistent with what is verified right now.'
        : 'This is not a guaranteed recovery. It names what would need to stay true for continuing to make sense.',
      ur: balance === 'favours' ? 'Evidence اس وقت آپ کے حق میں جھکاؤ رکھتی ہے؛ position ابھی جو verify ہے اس سے مطابقت رکھتی ہے۔'
        : 'یہ کوئی guaranteed recovery نہیں ہے۔ یہ صرف یہ بتاتا ہے کہ continue کرنے کے معنی خیز ہونے کے لیے کیا درست رہنا چاہیے۔',
      ar: balance === 'favours' ? 'تميل الأدلة حالياً لصالحك؛ يظل المركز متسقاً مع ما هو موثق الآن.'
        : 'هذا ليس تعافياً مضموناً. إنه يحدد ما يجب أن يبقى صحيحاً كي يكون الاستمرار منطقياً.',
    }),
    trigger: invalidation && invalidation.ok
      ? pick(lang, {
        en: `Reassess if the evidence balance flips, or on a close ${invalidation.side} ${invalidation.level}.`,
        ur: `اگر evidence balance بدل جائے، یا ${invalidation.level} سے ${invalidation.side === 'above' ? 'اوپر' : 'نیچے'} close ہو تو دوبارہ جائزہ لیں۔`,
        ar: `أعد التقييم إذا انقلب ميزان الأدلة، أو عند الإغلاق ${invalidation.side === 'above' ? 'أعلى' : 'أدنى'} ${invalidation.level}.`,
      })
      : pick(lang, {
        en: 'Reassess if the evidence balance flips, or at the next verified price/news update, since no independent invalidation level is currently available.',
        ur: 'اگر evidence balance بدل جائے، یا اگلی verified price/news update پر دوبارہ جائزہ لیں، کیونکہ فی الحال کوئی independent invalidation level دستیاب نہیں۔',
        ar: 'أعد التقييم إذا انقلب ميزان الأدلة، أو عند تحديث السعر/الأخبار الموثق التالي، لعدم توفر مستوى إبطال مستقل حالياً.',
      }),
    risk: pick(lang, {
      en: 'Holding without a defined reassessment point is how a stuck trade becomes an indefinite one — this option requires an actual review moment, not just hope.',
      ur: 'بغیر متعین reassessment point کے hold کرنا ہی وہ طریقہ ہے جس سے ایک stuck trade لامحدود بن جاتی ہے — یہ option ایک حقیقی review moment چاہتا ہے، صرف امید نہیں۔',
      ar: 'الاحتفاظ دون نقطة إعادة تقييم محددة هو كيف تتحول صفقة عالقة إلى صفقة غير محددة المدة — يتطلب هذا الخيار لحظة مراجعة فعلية، لا مجرد أمل.',
    }),
  });

  return opts;
}

// ── MANAGEMENT FIT RATINGS (1–10, deterministic — NOT a probability) ────────
// "Management Fit" answers "how defensible is this approach given the
// evidence right now", never "how likely is this to succeed". Every input is
// a field this file's callers already compute — analysis.js's evidence
// `balance`, meters.js's own per-meter `coverage`, the trader's stated
// `has_stop_loss`, and levels.js's `invalidation.ok` — so the score is fully
// explainable from data already on the page, not a second scoring engine.
//   Immediate Risk Reduction — rises when the evidence balance leans against
//     the position, or when there is no stop loss (an exit removes both).
//   Protected Continuation   — rises when the balance favours the position
//     AND a defensible invalidation level actually exists; falls sharply
//     when no such level can be justified, since an undefended hold is the
//     one thing this system will not quietly endorse.
//   Structured Reassessment  — rises specifically when the evidence is
//     genuinely mixed (its whole premise: wait for the picture to clarify)
//     and when overall evidence coverage is strong enough to trust that read.
const clamp1to10 = (n) => Math.max(1, Math.min(10, Math.round(n)));
export function managementFitRatings({ balance, meters, hasStop, invalidation }) {
  const covs = ['technical', 'fundamental', 'sentiment']
    .map((k) => meters && meters[k]).filter((m) => m && m.coverage != null).map((m) => m.coverage);
  const avgCoverage = covs.length ? covs.reduce((a, b) => a + b, 0) / covs.length : 0;
  const evScore = balance === 'favours' ? 2 : balance === 'against' ? -2 : balance === 'insufficient' ? -1 : 0;

  const exit = clamp1to10(5 + (evScore < 0 ? 2 : evScore > 0 ? -2 : 0) + (hasStop ? 0 : 2));
  const protectedContinuation = clamp1to10(5 + (evScore > 0 ? 2 : evScore < 0 ? -2 : 0) + (invalidation && invalidation.ok ? 2 : -3));
  const reassessment = clamp1to10(5 + (balance === 'mixed' ? 2 : 0) + (avgCoverage >= 0.75 ? 1 : avgCoverage < 0.5 ? -1 : 0));

  return { exit, protectedContinuation, reassessment, avgCoverage: Math.round(avgCoverage * 100) / 100 };
}

// ── FINAL MENTOR VIEW ────────────────────────────────────────────────────────
// Kept for any caller that only wants the one-line balance summary (e.g. a
// plain-text fallback) — the richer, structured review below is what the
// result page actually renders.
export function finalMentorViewLine(lang, direction, balance) {
  const d = dirWord(lang, direction);
  const balanceLine = pick(lang, {
    en: balance === 'against' ? `the evidence currently leans against your ${d}` : balance === 'favours' ? `the evidence currently leans in favour of your ${d}` : balance === 'mixed' ? 'the evidence is genuinely mixed' : 'there is not yet enough evidence to form a balance',
    ur: balance === 'against' ? `evidence اس وقت آپ کی ${d} کے خلاف جھکاؤ رکھتی ہے` : balance === 'favours' ? `evidence اس وقت آپ کی ${d} کے حق میں جھکاؤ رکھتی ہے` : balance === 'mixed' ? 'evidence حقیقی معنوں میں mixed ہے' : 'ابھی balance بنانے کے لیے کافی evidence نہیں ہے',
    ar: balance === 'against' ? `تميل الأدلة حالياً ضد صفقة ${d} الخاصة بك` : balance === 'favours' ? `تميل الأدلة حالياً لصالح صفقة ${d} الخاصة بك` : balance === 'mixed' ? 'الأدلة مختلطة فعلاً' : 'لا تتوفر أدلة كافية بعد لتشكيل توازن',
  });
  return pick(lang, {
    en: `Based on the currently verified evidence, ${balanceLine}. This is an evidence-based decision-support assessment, not a guaranteed outcome — the decision on your own position is always yours.`,
    ur: `موجودہ verified evidence کی بنیاد پر، ${balanceLine}۔ یہ ایک evidence-based decision-support تجزیہ ہے، کوئی guaranteed نتیجہ نہیں — آپ کی اپنی position کا فیصلہ ہمیشہ آپ کا ہے۔`,
    ar: `بناءً على الأدلة الموثقة الحالية، ${balanceLine}. هذا تقييم لدعم القرار قائم على الأدلة، وليس نتيجة مضمونة — القرار بشأن مركزك يبقى قرارك دائماً.`,
  });
}

// ── FINAL MENTOR REVIEW — structured, not a paragraph ───────────────────────
// Answers exactly what a mentor sitting beside the trader would say: where
// the trade stands, what helps it, what's the single biggest risk, and what
// that implies for management. Every field is read straight from objects
// analysis.js / position.js already computed (`weighed.supportive/opposing`,
// `c.has_stop_loss`) — nothing here is a new judgement, only a compact
// re-statement of the strongest single item already on each list, so this
// can never disagree with the evidence sections above it.
export function finalMentorReview(lang, direction, balance, weighed, tradeCase) {
  const d = dirWord(lang, direction);
  const whereNow = pick(lang, {
    en: balance === 'against' ? `The evidence currently leans against your ${d}.` : balance === 'favours' ? `The evidence currently leans in favour of your ${d}.` : balance === 'mixed' ? 'The evidence is genuinely mixed — supportive and opposing factors are close in number.' : 'There is not yet enough verified evidence to form a clear balance.',
    ur: balance === 'against' ? `Evidence اس وقت آپ کی ${d} کے خلاف جھکاؤ رکھتی ہے۔` : balance === 'favours' ? `Evidence اس وقت آپ کی ${d} کے حق میں جھکاؤ رکھتی ہے۔` : balance === 'mixed' ? 'Evidence حقیقی معنوں میں mixed ہے — supportive اور opposing factors تعداد میں قریب ہیں۔' : 'ابھی ایک واضح balance بنانے کے لیے کافی verified evidence نہیں ہے۔',
    ar: balance === 'against' ? `تميل الأدلة حالياً ضد صفقة ${d} الخاصة بك.` : balance === 'favours' ? `تميل الأدلة حالياً لصالح صفقة ${d} الخاصة بك.` : balance === 'mixed' ? 'الأدلة مختلطة فعلاً — العوامل الداعمة والمعارضة متقاربة في العدد.' : 'لا تتوفر أدلة موثقة كافية بعد لتشكيل توازن واضح.',
  });

  const supportive = (weighed && weighed.supportive) || [];
  const opposing = (weighed && weighed.opposing) || [];
  const noStop = tradeCase && tradeCase.has_stop_loss === false;

  const strongestSupport = supportive.length ? supportive[0].text : pick(lang, {
    en: 'No supportive item currently stands out from the verified evidence.',
    ur: 'موجودہ verified evidence میں فی الحال کوئی supportive item نمایاں نہیں ہے۔',
    ar: 'لا يبرز حالياً أي عنصر داعم من الأدلة الموثقة.',
  });

  // The absence of a stop loss is already treated everywhere else in this
  // system as "the single most consequential fact in the case" (see
  // analysis.js's layerRisk) — the review keeps that same priority rather
  // than letting a smaller market factor outrank it.
  const strongestRisk = noStop ? pick(lang, {
    en: 'There is no Stop Loss on this position — the maximum loss is currently undefined.',
    ur: 'اس position پر کوئی Stop Loss نہیں ہے — زیادہ سے زیادہ loss فی الحال غیر متعین ہے۔',
    ar: 'لا يوجد وقف خسارة على هذا المركز — الخسارة القصوى غير محددة حالياً.',
  }) : opposing.length ? opposing[0].text : pick(lang, {
    en: 'No opposing item currently stands out from the verified evidence.',
    ur: 'موجودہ verified evidence میں فی الحال کوئی opposing item نمایاں نہیں ہے۔',
    ar: 'لا يبرز حالياً أي عنصر معارض من الأدلة الموثقة.',
  });

  const takeaway = pick(lang, {
    en: noStop ? 'Before weighing the market evidence at all, define the price at which this trade is wrong — an undefined maximum loss outranks every other consideration below.'
      : balance === 'against' ? 'Worth re-examining the original thesis against what the market is doing now — the evidence leaning against you is a reason to look again, not by itself an instruction to close.'
      : balance === 'favours' ? 'The management question here is protecting the position rather than justifying it.'
      : balance === 'mixed' ? 'With genuinely mixed evidence, sizing and invalidation matter more than direction — a position you can hold calmly through a mixed tape is one you can still manage.'
      : 'Confirm the missing figures on your own platform before leaning on this evidence for a management decision.',
    ur: noStop ? 'Market evidence کو تولنے سے پہلے، وہ price طے کریں جس پر یہ trade غلط ثابت ہو — ایک غیر متعین زیادہ سے زیادہ loss نیچے دیے گئے ہر دوسرے consideration پر حاوی ہے۔'
      : balance === 'against' ? 'اصل thesis کو موجودہ market کے مقابلے میں دوبارہ دیکھنا قابل قدر ہے — آپ کے خلاف جھکاؤ رکھنے والی evidence دوبارہ دیکھنے کی وجہ ہے، خود بند کرنے کی ہدایت نہیں۔'
      : balance === 'favours' ? 'یہاں management کا سوال position کو justify کرنے کی بجائے اسے protect کرنا ہے۔'
      : balance === 'mixed' ? 'حقیقی معنوں میں mixed evidence کے ساتھ، sizing اور invalidation سمت سے زیادہ اہم ہیں — جس position کو آپ mixed tape میں سکون سے hold کر سکیں وہی manageable ہے۔'
      : 'اس evidence پر management فیصلہ کرنے سے پہلے missing figures اپنے platform پر خود confirm کریں۔',
    ar: noStop ? 'قبل تقييم أدلة السوق إطلاقاً، حدد السعر الذي تصبح عنده هذه الصفقة خاطئة — فالخسارة القصوى غير المحددة تتفوق على أي اعتبار آخر أدناه.'
      : balance === 'against' ? 'يستحق إعادة فحص الفرضية الأصلية مقابل ما يفعله السوق الآن — ميل الأدلة ضدك سبب لإعادة النظر، وليس بحد ذاته أمراً بالإغلاق.'
      : balance === 'favours' ? 'سؤال الإدارة هنا هو حماية المركز لا تبريره.'
      : balance === 'mixed' ? 'مع أدلة مختلطة فعلاً، يهم الحجم ونقطة الإبطال أكثر من الاتجاه — المركز الذي يمكنك الاحتفاظ به بهدوء خلال سوق مختلط هو مركز يمكنك إدارته.'
      : 'أكّد الأرقام الناقصة على منصتك الخاصة قبل الاعتماد على هذه الأدلة لقرار إداري.',
  });

  return {
    whereNow, strongestSupport, strongestRisk, takeaway,
    disclaimer: pick(lang, {
      en: 'This is decision-support based on the evidence available right now — not a guaranteed outcome, and not financial advice. Market conditions can change at any time, and the decision on your own position is always yours.',
      ur: 'یہ اس وقت دستیاب evidence کی بنیاد پر decision-support ہے — کوئی guaranteed نتیجہ نہیں، اور نہ ہی financial advice۔ Market حالات کسی بھی وقت بدل سکتے ہیں، اور آپ کی اپنی position کا فیصلہ ہمیشہ آپ کا ہے۔',
      ar: 'هذا دعم لاتخاذ القرار بناءً على الأدلة المتاحة الآن — وليس نتيجة مضمونة ولا نصيحة مالية. ظروف السوق قد تتغير في أي وقت، والقرار بشأن مركزك يبقى قرارك أنت.',
    }),
  };
}

// ── PER-LAYER TABLE ──────────────────────────────────────────────────────────
export function perLayerRow(lang, r) {
  const res = r.points == null
    ? pick(lang, { en: 'no verified price', ur: 'کوئی verified price نہیں', ar: 'لا يوجد سعر موثق' })
    : `${r.points} ${pick(lang, { en: 'lot-pts', ur: 'lot-pts', ar: 'نقاط لوت' })}${r.money != null ? ` (${r.money})` : ''}`;
  const L = labels(lang);
  const mark = r.helping === true ? L.helping : r.helping === false ? L.hurting : L.flat;
  const size = r.size == null ? '—' : r.size;
  return { res, mark, size };
}

// Renders levels.js's `reasonCode`/`reasonVars` (never its English `reason`
// string) into the target language — the four refusal cases defensibleInvalidation()
// can produce, each with the exact numbers involved.
export function invalidationRefusalText(lang, invalidation) {
  if (!invalidation || invalidation.ok) return null;
  const v = invalidation.reasonVars || {};
  const by = {
    no_range: pick(lang, { en: 'No verified trading range is available for this instrument.', ur: 'اس instrument کے لیے کوئی verified trading range دستیاب نہیں۔', ar: 'لا يتوفر نطاق تداول موثق لهذه الأداة.' }),
    no_price: pick(lang, { en: 'No verified current price to measure the range against.', ur: 'Range کے مقابلے میں ناپنے کے لیے کوئی verified موجودہ price نہیں۔', ar: 'لا يوجد سعر حالي موثق لقياس النطاق مقابله.' }),
    wrong_side_sell: pick(lang, {
      en: `The verified range high (${v.level}) is not above the current price (${v.price}), so it cannot serve as an invalidation level for a short.`,
      ur: `Verified range کی high (${v.level}) موجودہ price (${v.price}) سے اوپر نہیں، اس لیے یہ short کے لیے invalidation level نہیں بن سکتی۔`,
      ar: `أعلى النطاق الموثق (${v.level}) ليس أعلى من السعر الحالي (${v.price})، لذا لا يصلح كمستوى إبطال لصفقة بيع.`,
    }),
    wrong_side_buy: pick(lang, {
      en: `The verified range low (${v.level}) is not below the current price (${v.price}), so it cannot serve as an invalidation level for a long.`,
      ur: `Verified range کی low (${v.level}) موجودہ price (${v.price}) سے نیچے نہیں، اس لیے یہ long کے لیے invalidation level نہیں بن سکتی۔`,
      ar: `أدنى النطاق الموثق (${v.level}) ليس أدنى من السعر الحالي (${v.price})، لذا لا يصلح كمستوى إبطال لصفقة شراء.`,
    }),
    no_direction: pick(lang, { en: 'Direction is not established, so an invalidation level cannot be proposed.', ur: 'Direction طے نہیں ہوئی، اس لیے کوئی invalidation level تجویز نہیں کی جا سکتی۔', ar: 'الاتجاه غير محدد، لذا لا يمكن اقتراح مستوى إبطال.' }),
  };
  const text = by[invalidation.reasonCode] || invalidation.reason;
  return pick(lang, {
    en: `${text} No invalidation level is proposed from the recent range.`,
    ur: `${text} حالیہ range سے کوئی invalidation level تجویز نہیں کی جا رہی۔`,
    ar: `${text} لا يُقترح أي مستوى إبطال من النطاق الأخير.`,
  });
}

// ── EVIDENCE-BUNDLE UNAVAILABLE MESSAGES ─────────────────────────────────────
// evidence.js (data collection — not touched here) produces `ev.unavailable[]`
// as a handful of fixed English templates when a provider fails. Rather than
// render that array verbatim (an English leak into an otherwise localized
// report), this recognises the known templates and their known diagnostic
// values and renders the SAME meaning in the target language. An unrecognised
// diagnostic detail (e.g. a provider error string never seen before) is kept
// verbatim rather than guessed at — better an honest untranslated fragment
// than an invented one.
const KNOWN_WHY = {
  'the market endpoint did not respond': { en: 'the market endpoint did not respond', ur: 'market endpoint نے جواب نہیں دیا', ar: 'لم تستجب نقطة نهاية السوق' },
  'the provider returned no price for this instrument': { en: 'the provider returned no price for this instrument', ur: 'provider نے اس instrument کے لیے کوئی price نہیں دی', ar: 'لم يُرجع المزود سعراً لهذه الأداة' },
};
const KNOWN_NOTE = {
  'calendar provider unavailable': { en: 'calendar provider unavailable', ur: 'calendar provider دستیاب نہیں', ar: 'مزود التقويم غير متاح' },
  'calendar provider did not respond': { en: 'calendar provider did not respond', ur: 'calendar provider نے جواب نہیں دیا', ar: 'لم يستجب مزود التقويم' },
};
export function localizeUnavailable(lang, msg) {
  const s = String(msg || '');
  let m;
  if ((m = s.match(/^Current price — (.+)\.$/))) {
    const why = KNOWN_WHY[m[1]] ? pick(lang, KNOWN_WHY[m[1]]) : m[1];
    return pick(lang, { en: `Current price — ${why}.`, ur: `موجودہ Price — ${why}۔`, ar: `السعر الحالي — ${why}.` });
  }
  if (s === 'Market regime / macro context — the sentiment endpoint did not respond.') {
    return pick(lang, { en: s, ur: 'Market regime / macro context — sentiment endpoint نے جواب نہیں دیا۔', ar: 'نظام السوق / السياق الكلي — لم تستجب نقطة نهاية المعنويات.' });
  }
  if ((m = s.match(/^No recent headline in the current feed is specific to (.+)\.$/))) {
    return pick(lang, { en: s, ur: `موجودہ feed میں ${m[1]} سے متعلق کوئی حالیہ headline نہیں۔`, ar: `لا يوجد عنوان حديث خاص بـ ${m[1]} في التغذية الحالية.` });
  }
  if (s === 'Recent news — the news endpoint did not respond.') {
    return pick(lang, { en: s, ur: 'حالیہ News — news endpoint نے جواب نہیں دیا۔', ar: 'الأخبار الحديثة — لم تستجب نقطة نهاية الأخبار.' });
  }
  if ((m = s.match(/^Upcoming economic events could not be verified — (.+)$/))) {
    const note = KNOWN_NOTE[m[1]] ? pick(lang, KNOWN_NOTE[m[1]]) : m[1];
    return pick(lang, { en: `Upcoming economic events could not be verified — ${note}`, ur: `آنے والے economic events verify نہیں ہو سکے — ${note}`, ar: `تعذّر التحقق من الأحداث الاقتصادية القادمة — ${note}` });
  }
  return s; // unrecognised — left verbatim rather than guessed at
}

// ── PROVENANCE AUDIT-TRAIL LINES (evidence.js's provenanceLines()) ──────────
// evidence.js's provenanceLines() (data collection — not touched here) emits
// exactly four fixed English templates, e.g.
//   "Price — ZTU /api/market — TwelveData, retrieved 2026-09-08T05:10:02Z"
// This recognises those four templates and re-renders the SAME structure in
// the target language. Deliberately left UNTRANSLATED, per the task's own
// requirement: provider/company names (TwelveData, gold-api.com, Finnhub,
// FRED), API paths (/api/market, /api/sentiment, /api/news, /api/calendar)
// and ISO timestamps — those are identifiers and facts, not prose. Only the
// connective words ("Price —", "retrieved", the fallback-used bracket) are
// localized. An unrecognised line (e.g. a future template this function does
// not yet know) is returned verbatim rather than guessed at.
export function localizeProvenanceLine(lang, line) {
  const s = String(line || '');
  const fb = (hit) => hit
    ? pick(lang, { en: ' [primary feed unavailable, backup used]', ur: ' [بنیادی feed دستیاب نہیں تھی، backup استعمال ہوا]', ar: ' [المصدر الأساسي غير متاح، تم استخدام مصدر احتياطي]' })
    : '';
  let m;

  if ((m = s.match(/^Price — (.+?)(\s\[primary feed unavailable, backup used\])?, retrieved (.+)$/))) {
    const [, source, fallback, at] = m;
    return pick(lang, {
      en: `Price — ${source}${fb(fallback)}, retrieved ${at}`,
      ur: `قیمت — ${source}${fb(fallback)}, حاصل کردہ ${at}`,
      ar: `السعر — ${source}${fb(fallback)}, تم الجلب في ${at}`,
    });
  }
  if ((m = s.match(/^Market regime & yields — (.+?), retrieved (.+)$/))) {
    const [, src, at] = m;
    return pick(lang, {
      en: `Market regime & yields — ${src}, retrieved ${at}`,
      ur: `Market regime اور yields — ${src}, حاصل کردہ ${at}`,
      ar: `نظام السوق والعوائد — ${src}, تم الجلب في ${at}`,
    });
  }
  if ((m = s.match(/^News — (.+?)(\s\[primary feed unavailable, backup used\])?, retrieved (.+)$/))) {
    const [, provider, fallback, at] = m;
    return pick(lang, {
      en: `News — ${provider}${fb(fallback)}, retrieved ${at}`,
      ur: `خبریں — ${provider}${fb(fallback)}, حاصل کردہ ${at}`,
      ar: `الأخبار — ${provider}${fb(fallback)}, تم الجلب في ${at}`,
    });
  }
  if ((m = s.match(/^Economic calendar — (.+?), retrieved (.+)$/))) {
    const [, src, at] = m;
    return pick(lang, {
      en: `Economic calendar — ${src}, retrieved ${at}`,
      ur: `Economic Calendar — ${src}, حاصل کردہ ${at}`,
      ar: `التقويم الاقتصادي — ${src}, تم الجلب في ${at}`,
    });
  }
  return s; // unrecognised — left verbatim rather than guessed at
}

// ── PROVENANCE ROW LABELS (for the client-side Sources block) ───────────────
export function providerLabels(lang) {
  return pick(lang, {
    en: { price: 'Current price', macro: 'Macro', news: 'News', calendar: 'Events', history: 'Market history' },
    ur: { price: 'موجودہ Price', macro: 'Macro', news: 'News', calendar: 'Events', history: 'Market History' },
    ar: { price: 'السعر الحالي', macro: 'البيانات الكلية', news: 'الأخبار', calendar: 'الأحداث', history: 'تاريخ السوق' },
  });
}
