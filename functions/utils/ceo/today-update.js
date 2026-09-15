// functions/utils/ceo/today-update.js
// ════════════════════════════════════════════════════════════════════════════
// AI CEO OS — TODAY UPDATE: localized, scalping-framed rendering of ZTU
// Rescue's OWN evidence. Pure functions — no fetching, no scoring of its own.
//
// Where every judgement comes from (nothing here re-scores the market):
//   · Category lean (Technical/Fundamental/Sentiment) → meters.js `m.lean`.
//   · Each factor row → one of that meter's own `inputsUsed` rows, i.e. the
//     exact inputs that produced the lean. Impact on the scalp is the row's
//     own `lean` sign: +1 → Supports BUY, −1 → Supports SELL, 0 → Neutral —
//     the same sign rule result-i18n.js's meterInputExplain() applies.
//   · Row facts are re-expressed from the SAME source values meters.js read
//     (ev.session, ev.yields, ev.regime, history closes), with the SAME
//     thresholds, so the sentence always matches the lean it explains.
//   · Reasons: session position / session change / real yield / BTC regime
//     reuse Rescue's existing sentences from result-i18n.js verbatim; the
//     rest restate meters.js's own documented rationale for that input.
//   · News / events → result-i18n.js newsItems() / calendarSection() output,
//     passed through (Rescue's rule: a headline is never scored from its title).
//
// The only decision logic here is dataBias() and overallView() — both
// documented below, both deterministic.
// ════════════════════════════════════════════════════════════════════════════

export const LANGS = ['en', 'ur', 'ar'];
const pick = (lang, o) => (o[lang] !== undefined ? o[lang] : o.en);
const r2 = (n) => Math.round(n * 100) / 100;

export function uiLabels(lang) {
  return pick(lang, {
    en: { bias: "Today's Scalping Bias", why: 'Why', technical: 'Technical', fundamental: 'Fundamental', sentiment: 'Sentiment',
      news: 'News', comingData: 'Coming Data', keyLevels: 'Key Levels', expert: 'Expert View Today', overall: 'Final Overall View',
      sources: 'Data Sources', verified: 'Verified Market Evidence', impact: 'Impact', reason: 'Why', evidenceStrength: 'Evidence Strength',
      todayRange: "Today's range", support: 'Key Support', resistance: 'Key Resistance', noTrade: 'No-trade condition',
      published: 'Published', dateUnconfirmed: 'date from search result', source: 'Source', ifUp: 'If', unavailable: 'Unavailable',
      price: 'Price', nothingHigh: 'No high-impact event in the verified calendar.',
      disclaimer: 'Decision-support from currently available evidence — not a guaranteed outcome and not financial advice.' },
    ur: { bias: 'آج کا Scalping Bias', why: 'کیوں', technical: 'تکنیکی تجزیہ', fundamental: 'بنیادی تجزیہ', sentiment: 'مارکیٹ کا موڈ',
      news: 'خبریں', comingData: 'آنے والا Data', keyLevels: 'اہم Levels', expert: 'آج کی Expert رائے', overall: 'حتمی مجموعی رائے',
      sources: 'Data کے ذرائع', verified: 'Verified Market Evidence', impact: 'Impact', reason: 'وجہ', evidenceStrength: 'Evidence Strength',
      todayRange: 'آج کی range', support: 'اہم Support', resistance: 'اہم Resistance', noTrade: 'No-trade شرط',
      published: 'شائع', dateUnconfirmed: 'تاریخ search result سے', source: 'ذریعہ', ifUp: 'اگر', unavailable: 'دستیاب نہیں',
      price: 'Price', nothingHigh: 'Verified calendar میں کوئی high-impact event نہیں۔',
      disclaimer: 'یہ موجودہ evidence پر مبنی decision-support ہے — کوئی guaranteed نتیجہ نہیں، اور نہ ہی financial advice۔' },
    ar: { bias: 'انحياز المضاربة اليوم', why: 'لماذا', technical: 'التحليل الفني', fundamental: 'التحليل الأساسي', sentiment: 'المعنويات',
      news: 'الأخبار', comingData: 'البيانات القادمة', keyLevels: 'المستويات الرئيسية', expert: 'رأي الخبراء اليوم', overall: 'الرأي الإجمالي النهائي',
      sources: 'مصادر البيانات', verified: 'أدلة السوق الموثقة', impact: 'التأثير', reason: 'السبب', evidenceStrength: 'قوة الأدلة',
      todayRange: 'نطاق اليوم', support: 'الدعم الرئيسي', resistance: 'المقاومة الرئيسية', noTrade: 'شرط عدم التداول',
      published: 'نُشر', dateUnconfirmed: 'التاريخ من نتيجة البحث', source: 'المصدر', ifUp: 'إذا', unavailable: 'غير متاح',
      price: 'السعر', nothingHigh: 'لا يوجد حدث عالي التأثير في التقويم الموثق.',
      disclaimer: 'دعم لاتخاذ القرار بناءً على الأدلة المتاحة حالياً — ليس نتيجة مضمونة ولا نصيحة مالية.' },
  });
}

export function biasWord(lang, bias) {
  return pick(lang, {
    en: { BUY: 'BUY', SELL: 'SELL', 'NO CLEAR EDGE': 'NO CLEAR EDGE' },
    ur: { BUY: 'BUY', SELL: 'SELL', 'NO CLEAR EDGE': 'کوئی واضح Edge نہیں' },
    ar: { BUY: 'شراء (BUY)', SELL: 'بيع (SELL)', 'NO CLEAR EDGE': 'لا أفضلية واضحة' },
  })[bias];
}
export const leanWord = (lang, lean) => pick(lang, {
  en: { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral', mixed: 'Mixed' },
  ur: { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral', mixed: 'Mixed' },
  ar: { bullish: 'صاعد', bearish: 'هابط', neutral: 'محايد', mixed: 'مختلط' },
})[lean] || uiLabels(lang).unavailable;

export function impactOf(lang, lean, contextOnly) {
  const key = contextOnly ? 'context' : lean > 0 ? 'buy' : lean < 0 ? 'sell' : 'neutral';
  const label = pick(lang, {
    en: { buy: 'Supports BUY scalping', sell: 'Supports SELL scalping', neutral: 'Neutral / No directional edge', context: 'Neutral / Context only' },
    ur: { buy: 'BUY scalping کو Support کرتا ہے', sell: 'SELL scalping کو Support کرتا ہے', neutral: 'Neutral / کوئی directional edge نہیں', context: 'Neutral / صرف Context' },
    ar: { buy: 'يدعم مضاربة الشراء', sell: 'يدعم مضاربة البيع', neutral: 'محايد / لا أفضلية اتجاهية', context: 'محايد / سياق فقط' },
  })[key];
  return { impactKey: key, impactLabel: label };
}

// ── FACTOR ROWS — one per meters.js input actually used ─────────────────────
function factorRow(lang, input, lean, ev, ohlc, instrument) {
  const isGold = instrument === 'XAU/USD';
  const asset = pick(lang, { en: isGold ? 'Gold' : 'Bitcoin', ur: isGold ? 'Gold' : 'Bitcoin', ar: isGold ? 'الذهب' : 'بيتكوين' });
  const S = ev.session || {}, Y = ev.yields || {}, R = ev.regime || {};
  const riskOn = /risk[- ]?on/i.test(R.label || '');
  const closes = (ohlc && ohlc.closes) || [];
  const by3 = (up, down, mid) => (lean > 0 ? up : lean < 0 ? down : mid);

  switch (input) {
    case 'session position': {
      const p = Math.round(((ev.price - S.low) / (S.high - S.low)) * 100);
      return {
        text: pick(lang, { en: `Price is ${p}% up today's ${S.low}–${S.high} range.`, ur: `Price آج کی ${S.low}–${S.high} range میں ${p}% اوپر ہے۔`, ar: `السعر عند ${p}% من نطاق اليوم ${S.low}–${S.high}.` }),
        reason: by3(
          pick(lang, { en: "Price sitting near the top of today's range often reflects short-term buying pressure.", ur: 'آج کی range کی چوٹی کے قریب price اکثر short-term خریداری کے دباؤ کو ظاہر کرتا ہے۔', ar: 'وقوف السعر قرب أعلى نطاق اليوم غالباً ما يعكس ضغط شراء قصير المدى.' }),
          pick(lang, { en: "Price sitting near the bottom of today's range often reflects short-term selling pressure.", ur: 'آج کی range کے نچلے حصے کے قریب price اکثر short-term فروخت کے دباؤ کو ظاہر کرتا ہے۔', ar: 'وقوف السعر قرب أسفل نطاق اليوم غالباً ما يعكس ضغط بيع قصير المدى.' }),
          pick(lang, { en: "Price is neither near today's high nor low, so this alone doesn't lean either way.", ur: 'Price نہ آج کی high کے قریب ہے نہ low کے — اس لیے یہ اکیلے کسی سمت کا اشارہ نہیں دیتا۔', ar: 'السعر ليس قرب أعلى اليوم ولا أدناه، لذا هذا وحده لا يميل لأي جهة.' })),
      };
    }
    case 'session change': {
      const cp = S.changePct;
      return {
        text: pick(lang, { en: `Today's move is ${cp}%.`, ur: `آج کا move ${cp}% ہے۔`, ar: `حركة اليوم ${cp}%.` }),
        reason: by3(
          pick(lang, { en: 'A positive move on the day reflects more buying than selling pressure right now.', ur: 'دن میں مثبت move موجودہ وقت میں فروخت سے زیادہ خریداری کے دباؤ کو ظاہر کرتا ہے۔', ar: 'الحركة الإيجابية خلال اليوم تعكس ضغط شراء أكبر من ضغط البيع حالياً.' }),
          pick(lang, { en: 'A negative move on the day reflects more selling than buying pressure right now.', ur: 'دن میں منفی move موجودہ وقت میں خریداری سے زیادہ فروخت کے دباؤ کو ظاہر کرتا ہے۔', ar: 'الحركة السلبية خلال اليوم تعكس ضغط بيع أكبر من ضغط الشراء حالياً.' }),
          pick(lang, { en: 'A near-flat move gives no meaningful directional signal today.', ur: 'تقریباً flat move آج کوئی معنی خیز directional اشارہ نہیں دیتا۔', ar: 'حركة شبه ثابتة لا تعطي إشارة اتجاهية ذات معنى اليوم.' })),
      };
    }
    case 'trend vs recent closes': {
      const mean = r2(closes.reduce((a, b) => a + b, 0) / closes.length);
      const n = closes.length;
      return {
        text: by3(
          pick(lang, { en: `Price is above its ${n}-day average close (${mean}).`, ur: `Price اپنے ${n}-day average close (${mean}) سے اوپر ہے۔`, ar: `السعر أعلى من متوسط إغلاق ${n} يوماً (${mean}).` }),
          pick(lang, { en: `Price is below its ${n}-day average close (${mean}).`, ur: `Price اپنے ${n}-day average close (${mean}) سے نیچے ہے۔`, ar: `السعر أدنى من متوسط إغلاق ${n} يوماً (${mean}).` }),
          pick(lang, { en: `Price is at its ${n}-day average close (${mean}).`, ur: `Price اپنے ${n}-day average close (${mean}) پر ہے۔`, ar: `السعر عند متوسط إغلاق ${n} يوماً (${mean}).` })),
        reason: by3(
          pick(lang, { en: 'Trading above the recent average shows the recent trend has been up — buyers have had the upper hand.', ur: 'حالیہ average سے اوپر ہونا بتاتا ہے کہ حالیہ trend اوپر رہا ہے — buyers کا پلڑا بھاری رہا ہے۔', ar: 'التداول فوق المتوسط الأخير يُظهر أن الاتجاه الأخير كان صاعداً — للمشترين اليد العليا.' }),
          pick(lang, { en: 'Trading below the recent average shows the recent trend has been down — sellers have had the upper hand.', ur: 'حالیہ average سے نیچے ہونا بتاتا ہے کہ حالیہ trend نیچے رہا ہے — sellers کا پلڑا بھاری رہا ہے۔', ar: 'التداول دون المتوسط الأخير يُظهر أن الاتجاه الأخير كان هابطاً — للبائعين اليد العليا.' }),
          pick(lang, { en: 'Price is right at its recent average — no trend edge from this.', ur: 'Price بالکل اپنے حالیہ average پر ہے — اس سے کوئی trend edge نہیں۔', ar: 'السعر عند متوسطه الأخير تماماً — لا أفضلية اتجاه من هذا.' })),
      };
    }
    case 'distance from recent range': {
      const hi = Math.max(...closes), lo = Math.min(...closes);
      const p = Math.round(((ev.price - lo) / (hi - lo)) * 100);
      return {
        text: pick(lang, { en: `Price is ${p}% up its ${closes.length}-day range (${r2(lo)}–${r2(hi)}).`, ur: `Price اپنی ${closes.length}-day range (${r2(lo)}–${r2(hi)}) میں ${p}% اوپر ہے۔`, ar: `السعر عند ${p}% من نطاق ${closes.length} يوماً (${r2(lo)}–${r2(hi)}).` }),
        reason: by3(
          pick(lang, { en: 'Sitting in the upper part of the recent range shows buyers have been in control lately.', ur: 'حالیہ range کے اوپری حصے میں ہونا بتاتا ہے کہ حال ہی میں buyers کا کنٹرول رہا ہے۔', ar: 'الوجود في الجزء العلوي من النطاق الأخير يُظهر سيطرة المشترين مؤخراً.' }),
          pick(lang, { en: 'Sitting in the lower part of the recent range shows sellers have been in control lately.', ur: 'حالیہ range کے نچلے حصے میں ہونا بتاتا ہے کہ حال ہی میں sellers کا کنٹرول رہا ہے۔', ar: 'الوجود في الجزء السفلي من النطاق الأخير يُظهر سيطرة البائعين مؤخراً.' }),
          pick(lang, { en: 'Price is mid-way through its recent range — no edge from this.', ur: 'Price اپنی حالیہ range کے درمیان ہے — اس سے کوئی edge نہیں۔', ar: 'السعر في منتصف نطاقه الأخير — لا أفضلية من هذا.' })),
      };
    }
    case 'real 10Y yield': {
      const rr = Y.real10y;
      const lvl = by3(pick(lang, { en: 'low', ur: 'کم', ar: 'منخفض' }), pick(lang, { en: 'elevated', ur: 'بلند', ar: 'مرتفع' }), pick(lang, { en: 'mid-range', ur: 'درمیانی', ar: 'متوسط' }));
      return {
        text: pick(lang, { en: `US real 10-year yield is ${lvl} at ${rr}%.`, ur: `US real 10-year yield ${rr}% پر ${lvl} ہے۔`, ar: `العائد الحقيقي الأمريكي لـ 10 سنوات ${lvl} عند ${rr}%.` }),
        reason: isGold ? by3(
          pick(lang, { en: 'Gold pays no yield, so when real yields fall, the cost of holding non-yielding gold instead of interest-bearing assets shrinks.', ur: 'Gold کوئی yield نہیں دیتا، اس لیے جب real yields گرتی ہیں تو interest-bearing assets کی بجائے non-yielding gold رکھنے کی cost کم ہو جاتی ہے۔', ar: 'الذهب لا يدفع عائداً، لذا عندما تنخفض العوائد الحقيقية تقل تكلفة الاحتفاظ بالذهب غير المُدر بدلاً من الأصول المُدرة للفائدة.' }),
          pick(lang, { en: 'Gold pays no yield, so when real yields rise, holding non-yielding gold becomes relatively less attractive.', ur: 'Gold کوئی yield نہیں دیتا، اس لیے جب real yields بڑھتی ہیں تو non-yielding gold رکھنا نسبتاً کم پرکشش ہو جاتا ہے۔', ar: 'الذهب لا يدفع عائداً، لذا عندما ترتفع العوائد الحقيقية يصبح الاحتفاظ بالذهب غير المُدر للعائد أقل جاذبية نسبياً.' }),
          pick(lang, { en: "Real yields are in a middle zone that historically hasn't leaned clearly for or against gold.", ur: 'Real yields ایک درمیانی zone میں ہیں جو تاریخی طور پر gold کے حق میں یا خلاف واضح جھکاؤ نہیں رکھتی۔', ar: 'العوائد الحقيقية في منطقة وسطى لم تُظهر تاريخياً ميلاً واضحاً لصالح الذهب أو ضده.' }))
          : by3(
          pick(lang, { en: 'Low real yields mean easier financial conditions, which has tended to help risk assets like Bitcoin.', ur: 'کم real yields کا مطلب آسان financial conditions ہیں، جو عموماً Bitcoin جیسے risk assets کی مدد کرتی ہیں۔', ar: 'العوائد الحقيقية المنخفضة تعني ظروفاً مالية أسهل، ما يميل لدعم الأصول عالية المخاطر مثل بيتكوين.' }),
          pick(lang, { en: 'High real yields tighten financial conditions, which has tended to weigh on risk assets like Bitcoin.', ur: 'بلند real yields financial conditions کو سخت کرتی ہیں، جو عموماً Bitcoin جیسے risk assets پر دباؤ ڈالتی ہیں۔', ar: 'العوائد الحقيقية المرتفعة تشدد الظروف المالية، ما يميل للضغط على الأصول عالية المخاطر مثل بيتكوين.' }),
          pick(lang, { en: 'Real yields are in a middle zone — no clear lean for Bitcoin.', ur: 'Real yields درمیانی zone میں ہیں — Bitcoin کے لیے کوئی واضح جھکاؤ نہیں۔', ar: 'العوائد الحقيقية في منطقة وسطى — لا ميل واضح لبيتكوين.' })),
      };
    }
    case 'nominal 10Y yield':
      return {
        text: pick(lang, { en: `US 10-year yield is ${Y.us10y}%.`, ur: `US 10-year yield ${Y.us10y}% ہے۔`, ar: `العائد الأمريكي لـ 10 سنوات ${Y.us10y}%.` }),
        reason: by3(
          pick(lang, { en: `Low US yields reduce the pull of interest-paying assets, which tends to help ${asset}.`, ur: `کم US yields سود دینے والے assets کی کشش کم کرتی ہیں، جو عموماً ${asset} کی مدد کرتی ہے۔`, ar: `العوائد الأمريكية المنخفضة تقلل جاذبية الأصول المُدرة للفائدة، ما يميل لدعم ${asset}.` }),
          pick(lang, { en: `High US yields make interest-paying assets more attractive, which tends to weigh on ${asset}.`, ur: `بلند US yields سود دینے والے assets کو زیادہ پرکشش بناتی ہیں، جو عموماً ${asset} پر دباؤ ڈالتی ہے۔`, ar: `العوائد الأمريكية المرتفعة تجعل الأصول المُدرة للفائدة أكثر جاذبية، ما يميل للضغط على ${asset}.` }),
          pick(lang, { en: 'US yields are in a middle range — no clear pressure either way.', ur: 'US yields درمیانی range میں ہیں — کسی طرف واضح دباؤ نہیں۔', ar: 'العوائد الأمريكية في نطاق متوسط — لا ضغط واضح في أي اتجاه.' })),
      };
    case 'breakeven inflation':
      return {
        text: pick(lang, { en: `Market inflation expectations (breakeven) are ${Y.breakeven}%.`, ur: `Market کی inflation expectations (breakeven) ${Y.breakeven}% ہیں۔`, ar: `توقعات التضخم في السوق (التعادلية) ${Y.breakeven}%.` }),
        reason: by3(
          pick(lang, { en: `Higher expected inflation tends to lift demand for stores of value like ${asset}.`, ur: `زیادہ متوقع inflation عموماً ${asset} جیسے store of value کی طلب بڑھاتی ہے۔`, ar: `ارتفاع التضخم المتوقع يميل لزيادة الطلب على مخازن القيمة مثل ${asset}.` }),
          pick(lang, { en: `Low expected inflation reduces inflation-hedge demand for ${asset}.`, ur: `کم متوقع inflation، ${asset} کی inflation-hedge طلب کم کرتی ہے۔`, ar: `انخفاض التضخم المتوقع يقلل الطلب على ${asset} كتحوط من التضخم.` }),
          pick(lang, { en: 'Inflation expectations are moderate — no clear lean.', ur: 'Inflation expectations معتدل ہیں — کوئی واضح جھکاؤ نہیں۔', ar: 'توقعات التضخم معتدلة — لا ميل واضح.' })),
      };
    case 'market regime':
    case 'risk regime': {
      // meters.js scores every non-"risk-on" label like risk-off. A plain
      // "Neutral" label gets its own sentence so the reason never contradicts
      // the label shown, while still explaining the meter's actual lean.
      const plainNeutral = !riskOn && !/risk[- ]?off|caution/i.test(R.label || '');
      const text = pick(lang, { en: `Market mood is ${R.label} (VIX ${R.vix_level}).`, ur: `Market کا موڈ ${R.label} ہے (VIX ${R.vix_level})۔`, ar: `مزاج السوق ${R.label} (VIX ${R.vix_level}).` });
      if (plainNeutral) {
        return {
          text,
          reason: isGold
            ? pick(lang, { en: 'Markets are not in a risk-on mood, which the evidence meter counts as mildly supportive of defensive Gold.', ur: 'Markets risk-on موڈ میں نہیں، جسے evidence meter defensive Gold کے لیے ہلکا سا supportive شمار کرتا ہے۔', ar: 'الأسواق ليست في مزاج إقبال على المخاطرة، ويحتسب مقياس الأدلة ذلك داعماً قليلاً للذهب الدفاعي.' })
            : pick(lang, { en: 'Markets are not in a risk-on mood, which the evidence meter counts as a mild headwind for higher-beta BTC.', ur: 'Markets risk-on موڈ میں نہیں، جسے evidence meter high-beta BTC کے لیے ہلکی رکاوٹ شمار کرتا ہے۔', ar: 'الأسواق ليست في مزاج إقبال على المخاطرة، ويحتسب مقياس الأدلة ذلك عائقاً خفيفاً أمام BTC عالي التقلب.' }),
        };
      }
      return {
        text,
        reason: isGold
          ? (riskOn
            ? pick(lang, { en: 'Risk-on markets tend to pull money away from defensive assets like Gold.', ur: 'Risk-on markets عموماً Gold جیسے defensive assets سے پیسہ نکالتی ہیں۔', ar: 'أسواق الإقبال على المخاطرة تميل لسحب الأموال من الأصول الدفاعية مثل الذهب.' })
            : pick(lang, { en: 'Risk-off markets tend to support defensive assets like Gold.', ur: 'Risk-off markets عموماً Gold جیسے defensive assets کو support کرتی ہیں۔', ar: 'أسواق تجنب المخاطرة تميل لدعم الأصول الدفاعية مثل الذهب.' }))
          : (riskOn
            ? pick(lang, { en: 'Risk-on conditions tend to favour higher-beta assets like BTC.', ur: 'Risk-on حالات عام طور پر BTC جیسے high-beta assets کے حق میں ہوتی ہیں۔', ar: 'ظروف الإقبال على المخاطرة تميل لصالح الأصول عالية التقلب مثل BTC.' })
            : pick(lang, { en: 'Risk-off conditions tend to pressure higher-beta assets like BTC.', ur: 'Risk-off حالات عام طور پر BTC جیسے high-beta assets پر دباؤ ڈالتی ہیں۔', ar: 'ظروف تجنب المخاطرة تضغط عادة على الأصول عالية التقلب مثل BTC.' })),
      };
    }
    case 'volatility regime': {
      const v = Number(R.vix_level);
      const band = v > 25 ? 'high' : v < 15 ? 'calm' : 'normal';
      const bandW = pick(lang, { en: { high: 'elevated', calm: 'calm', normal: 'normal' }, ur: { high: 'بلند', calm: 'پرسکون', normal: 'نارمل' }, ar: { high: 'مرتفع', calm: 'هادئ', normal: 'طبيعي' } })[band];
      return {
        text: pick(lang, { en: `Market fear gauge (VIX) is ${bandW} at ${v}.`, ur: `Market کا خوف کا پیمانہ (VIX) ${v} پر ${bandW} ہے۔`, ar: `مؤشر الخوف (VIX) ${bandW} عند ${v}.` }),
        reason: band === 'normal'
          ? pick(lang, { en: 'Volatility is in a normal range — background context, not a directional signal.', ur: 'Volatility نارمل range میں ہے — پس منظر context، directional اشارہ نہیں۔', ar: 'التقلب ضمن نطاق طبيعي — سياق خلفي، وليس إشارة اتجاهية.' })
          : isGold
            ? (band === 'high'
              ? pick(lang, { en: 'High fear tends to push money into safe havens like Gold.', ur: 'زیادہ خوف عموماً پیسہ Gold جیسے safe havens کی طرف لے جاتا ہے۔', ar: 'الخوف المرتفع يميل لدفع الأموال نحو الملاذات الآمنة مثل الذهب.' })
              : pick(lang, { en: 'Calm markets reduce safe-haven demand for Gold.', ur: 'پرسکون markets میں Gold کی safe-haven طلب کم ہو جاتی ہے۔', ar: 'الأسواق الهادئة تقلل الطلب على الذهب كملاذ آمن.' }))
            : (band === 'high'
              ? pick(lang, { en: 'High fear tends to push money out of risk assets like Bitcoin.', ur: 'زیادہ خوف عموماً Bitcoin جیسے risk assets سے پیسہ نکالتا ہے۔', ar: 'الخوف المرتفع يميل لسحب الأموال من الأصول عالية المخاطر مثل بيتكوين.' })
              : pick(lang, { en: 'Calm markets tend to support appetite for risk assets like Bitcoin.', ur: 'پرسکون markets عموماً Bitcoin جیسے risk assets کی طلب کو support کرتی ہیں۔', ar: 'الأسواق الهادئة تميل لدعم الإقبال على الأصول عالية المخاطر مثل بيتكوين.' })),
      };
    }
    case 'relevant news flow':
      return {
        text: pick(lang, { en: `${(ev.news || []).length} relevant headline(s) in the current feed.`, ur: `موجودہ feed میں ${(ev.news || []).length} متعلقہ headline(s)۔`, ar: `${(ev.news || []).length} عنوان(ين) ذي صلة في التغذية الحالية.` }),
        reason: pick(lang, { en: "Counted as context only — a headline's direction can't be verified from its title, so it is never scored.", ur: 'صرف context کے طور پر شمار — headline کی سمت اس کے title سے verify نہیں ہو سکتی، اس لیے اسے کبھی score نہیں کیا جاتا۔', ar: 'تُحتسب كسياق فقط — لا يمكن التحقق من اتجاه العنوان من عنوانه، لذا لا تُحتسب أبداً.' }),
        contextOnly: true,
      };
    default:
      return null;
  }
}

// Rows for one meter: every input the meter actually used, directional ones
// first (by weight), capped at `max` so the card stays compact.
export function factorRows(lang, meter, ev, ohlc, instrument, max = 3) {
  if (!meter || meter.score == null) return [];
  const rows = [...meter.inputsUsed]
    .sort((a, b) => (Math.abs(b.lean) - Math.abs(a.lean)) || (b.weight - a.weight))
    .map((i) => {
      const r = factorRow(lang, i.input, i.lean, ev, ohlc, instrument);
      return r ? { input: i.input, lean: i.lean, text: r.text, reason: r.reason, ...impactOf(lang, i.lean, r.contextOnly) } : null;
    })
    .filter(Boolean);
  return rows.slice(0, max);
}

// ── DATA BIAS — the ONE new rule, built on two existing Rescue functions ────
// marketDirectionText() (meter-score average, ±0.15 band) AND overallEvidence()
// (count of bullish minus bearish categories) must AGREE. This is what makes
// "Technical bullish / Fundamental bearish / Sentiment neutral" come out as
// NO CLEAR EDGE (count 0) even if the averaged score tips slightly one way.
// Fewer than two available meters is never enough to call a direction.
export function dataBias(meters, marketDirection, overall) {
  const avail = ['technical', 'fundamental', 'sentiment'].map((k) => meters[k]).filter((m) => m && m.score != null);
  if (avail.length < 2) return { bias: 'NO CLEAR EDGE', basis: 'insufficient' };
  if (marketDirection.lean === 'bullish' && overall.score >= 1) return { bias: 'BUY', basis: 'aligned' };
  if (marketDirection.lean === 'bearish' && overall.score <= -1) return { bias: 'SELL', basis: 'aligned' };
  return { bias: 'NO CLEAR EDGE', basis: 'conflict' };
}

export function evidenceStrengthText(lang, bias, meters) {
  const avail = ['technical', 'fundamental', 'sentiment'].map((k) => meters[k]).filter((m) => m && m.score != null);
  const c = { bullish: 0, bearish: 0, neutral: 0 };
  for (const m of avail) c[m.lean] = (c[m.lean] || 0) + 1;
  if (bias === 'BUY' || bias === 'SELL') {
    const agree = bias === 'BUY' ? c.bullish : c.bearish;
    const b = biasWord(lang, bias);
    return pick(lang, {
      en: `${agree} of ${avail.length} evidence categories support ${b}.`,
      ur: `${avail.length} میں سے ${agree} evidence categories ${b} کو support کرتی ہیں۔`,
      ar: `${agree} من ${avail.length} فئات أدلة تدعم ${b}.`,
    });
  }
  return pick(lang, {
    en: `${c.bullish} bullish · ${c.bearish} bearish · ${c.neutral} neutral — no majority strong enough.`,
    ur: `${c.bullish} bullish · ${c.bearish} bearish · ${c.neutral} neutral — کوئی واضح اکثریت نہیں۔`,
    ar: `${c.bullish} صاعد · ${c.bearish} هابط · ${c.neutral} محايد — لا أغلبية كافية.`,
  });
}

export function whyLines(lang, bias, meters, basis) {
  const H = uiLabels(lang);
  const lines = [];
  for (const k of ['technical', 'fundamental', 'sentiment']) {
    const m = meters[k];
    if (!m || m.score == null) continue;
    const eff = m.lean === 'bullish' ? 'buy' : m.lean === 'bearish' ? 'sell' : 'neutral';
    const effText = pick(lang, {
      en: { buy: 'supports BUY', sell: 'supports SELL', neutral: 'no directional edge' },
      ur: { buy: 'BUY کو support کرتا ہے', sell: 'SELL کو support کرتا ہے', neutral: 'کوئی directional edge نہیں' },
      ar: { buy: 'يدعم الشراء', sell: 'يدعم البيع', neutral: 'لا أفضلية اتجاهية' },
    })[eff];
    lines.push(pick(lang, {
      en: `${H[k]} is ${leanWord(lang, m.lean)} — ${effText}.`,
      ur: `${H[k]}: ${leanWord(lang, m.lean)} — ${effText}۔`,
      ar: `${H[k]}: ${leanWord(lang, m.lean)} — ${effText}.`,
    }));
  }
  if (basis === 'insufficient') {
    lines.push(pick(lang, { en: 'Too few evidence categories could be verified to call a direction.', ur: 'Direction طے کرنے کے لیے کافی evidence categories verify نہیں ہو سکیں۔', ar: 'تعذّر التحقق من عدد كافٍ من فئات الأدلة لتحديد اتجاه.' }));
  } else if (bias === 'NO CLEAR EDGE') {
    lines.push(pick(lang, { en: 'The categories conflict — there is no clean edge today.', ur: 'Categories آپس میں متضاد ہیں — آج کوئی صاف edge نہیں۔', ar: 'الفئات متعارضة — لا توجد أفضلية واضحة اليوم.' }));
  }
  return lines;
}

// ── LEVELS — Rescue's verified values only ──────────────────────────────────
// Today's range = /api/market session high/low. Support/Resistance = the
// verified N-session close range from levels.js computeVerifiedRange().
// No-trade condition = levels.js defensibleInvalidation() for the bias side,
// or its localized refusal (result-i18n.js invalidationRefusalText()).
export function levelLines(lang, bias, ev, range, invalidation, refusalText) {
  const H = uiLabels(lang);
  const out = [];
  if (ev.session && ev.session.low != null && ev.session.high != null) out.push({ label: H.todayRange, value: `${ev.session.low} – ${ev.session.high}` });
  if (range) {
    // A range boundary price has already moved through is reported as broken,
    // never presented as live support/resistance.
    const p = ev.priceStatus === 'verified' ? ev.price : null;
    const brokenBelow = p != null && p < range.low;
    const brokenAbove = p != null && p > range.high;
    const brokenNote = pick(lang, { en: ' — price has moved through it', ur: ' — price اس سے آگے نکل چکا ہے', ar: ' — تجاوزه السعر' });
    out.push({ label: H.support, value: pick(lang, { en: `${range.low} (verified ${range.sessions}-day low)`, ur: `${range.low} (verified ${range.sessions}-day low)`, ar: `${range.low} (أدنى إغلاق موثق لـ ${range.sessions} يوماً)` }) + (brokenBelow ? brokenNote : '') });
    out.push({ label: H.resistance, value: pick(lang, { en: `${range.high} (verified ${range.sessions}-day high)`, ur: `${range.high} (verified ${range.sessions}-day high)`, ar: `${range.high} (أعلى إغلاق موثق لـ ${range.sessions} يوماً)` }) + (brokenAbove ? brokenNote : '') });
  }
  let noTrade;
  if (bias === 'NO CLEAR EDGE') {
    noTrade = pick(lang, { en: 'Evidence conflicts — standing aside is a valid decision until it aligns.', ur: 'Evidence متضاد ہے — جب تک یہ ایک سمت میں نہ آئے، trade نہ کرنا بھی درست فیصلہ ہے۔', ar: 'الأدلة متعارضة — الابتعاد قرار صحيح حتى تتوافق.' });
  } else if (invalidation && invalidation.ok) {
    const b = biasWord(lang, bias);
    noTrade = invalidation.side === 'below'
      ? pick(lang, { en: `A break below ${invalidation.level} would invalidate the ${b} view.`, ur: `${invalidation.level} سے نیچے break، ${b} view کو invalidate کر دے گا۔`, ar: `كسر أدنى ${invalidation.level} سيبطل رأي ${b}.` })
      : pick(lang, { en: `A break above ${invalidation.level} would invalidate the ${b} view.`, ur: `${invalidation.level} سے اوپر break، ${b} view کو invalidate کر دے گا۔`, ar: `كسر أعلى ${invalidation.level} سيبطل رأي ${b}.` });
  } else {
    noTrade = refusalText || null;
  }
  if (noTrade) out.push({ label: H.noTrade, value: noTrade });
  return out;
}

// ── FINAL OVERALL VIEW — data first, experts as context (task §15/§16) ──────
export function overallView(lang, bias, expert) {
  const b = biasWord(lang, bias);
  const e = expert && expert.status === 'verified' ? expert.consensus : null;
  if (bias === 'NO CLEAR EDGE') {
    if (e === 'bullish' || e === 'bearish') {
      return pick(lang, {
        en: `No clear edge — verified evidence conflicts. Experts lean ${leanWord(lang, e)}, but that alone does not override conflicting verified evidence.`,
        ur: `کوئی واضح edge نہیں — verified evidence متضاد ہے۔ Experts کا جھکاؤ ${leanWord(lang, e)} ہے، لیکن صرف یہ متضاد verified evidence پر غالب نہیں آتا۔`,
        ar: `لا أفضلية واضحة — الأدلة الموثقة متعارضة. يميل الخبراء إلى ${leanWord(lang, e)}، لكن ذلك وحده لا يتجاوز الأدلة الموثقة المتعارضة.`,
      });
    }
    return pick(lang, { en: 'No clear edge today — verified evidence is not aligned.', ur: 'آج کوئی واضح edge نہیں — verified evidence ایک سمت میں نہیں۔', ar: 'لا أفضلية واضحة اليوم — الأدلة الموثقة غير متوافقة.' });
  }
  const want = bias === 'BUY' ? 'bullish' : 'bearish';
  if (!e) return pick(lang, { en: `${b} — based on verified market evidence; no verified expert view today.`, ur: `${b} — verified market evidence کی بنیاد پر؛ آج کوئی verified expert view نہیں۔`, ar: `${b} — بناءً على أدلة السوق الموثقة؛ لا يوجد رأي خبراء موثق اليوم.` });
  if (e === want) return pick(lang, { en: `${b} — verified evidence and expert direction are aligned.`, ur: `${b} — verified evidence اور expert رائے ایک ہی سمت میں ہیں۔`, ar: `${b} — الأدلة الموثقة واتجاه الخبراء متوافقان.` });
  return pick(lang, {
    en: `${b} — verified market evidence currently has the stronger support, but expert views are not aligned.`,
    ur: `${b} — اس وقت verified market evidence زیادہ مضبوط ہے، لیکن expert رائے اس کے ساتھ نہیں۔`,
    ar: `${b} — أدلة السوق الموثقة تحظى حالياً بدعم أقوى، لكن آراء الخبراء غير متوافقة.`,
  });
}

export function expertHeadline(lang, expert) {
  if (!expert || expert.status !== 'verified') {
    return { text: pick(lang, { en: 'Not available from a verified current source.', ur: 'کسی verified موجودہ ذریعے سے دستیاب نہیں۔', ar: 'غير متاح من مصدر حالي موثق.' }), counts: null };
  }
  const c = expert.counts;
  const n = c.bullish + c.bearish + c.neutral;
  const counts = n >= 2
    ? pick(lang, { en: `${c.bullish} Bullish · ${c.bearish} Bearish · ${c.neutral} Neutral`, ur: `${c.bullish} Bullish · ${c.bearish} Bearish · ${c.neutral} Neutral`, ar: `${c.bullish} صاعد · ${c.bearish} هابط · ${c.neutral} محايد` })
    : pick(lang, { en: 'Single verified source', ur: 'صرف ایک verified ذریعہ', ar: 'مصدر موثق واحد' });
  return { text: leanWord(lang, expert.consensus), counts };
}
