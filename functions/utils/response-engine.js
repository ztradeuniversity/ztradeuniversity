// functions/utils/response-engine.js
// ════════════════════════════════════════════════════════════════════════════
// SHARED RESPONSE CORE — localization, formatting helpers, and the
// answer-decoration toolkit (conversation-context transforms, journey notes,
// conversion CTAs). Every specialist engine imports from here.
// This module is a LEAF (it imports nothing from our other engines) → no cycles.
// ════════════════════════════════════════════════════════════════════════════

// ── SIGNAL ROUTING TARGETS ───────────────────────────────────────────────────
export const TELEGRAM = 'https://t.me/ztradeuniversity';
export const WHATSAPP = 'https://wa.me/17189730347';

// ── TRUSTED SOURCES (Priority 2 — official only) ─────────────────────────────
export const TRUSTED_SOURCES = {
  macro: [
    ['TradingEconomics', 'https://tradingeconomics.com/'],
    ['Federal Reserve',  'https://www.federalreserve.gov/'],
    ['U.S. Treasury',    'https://home.treasury.gov/'],
    ['World Gold Council','https://www.gold.org/'],
    ['CME Group',        'https://www.cmegroup.com/'],
  ],
  calendar: [
    ['ForexFactory Calendar', 'https://www.forexfactory.com/calendar'],
    ['Investing.com Calendar','https://www.investing.com/economic-calendar/'],
    ['TradingEconomics Calendar','https://tradingeconomics.com/calendar'],
  ],
  news: [
    ['Reuters',  'https://www.reuters.com/markets/'],
    ['Bloomberg','https://www.bloomberg.com/markets'],
    ['CNBC',     'https://www.cnbc.com/markets/'],
    ['Financial Times','https://www.ft.com/markets'],
  ],
  education: [
    ['Babypips',          'https://www.babypips.com/learn/forex'],
    ['TradingView Help',  'https://www.tradingview.com/support/'],
    ['MetaTrader 5 Docs', 'https://www.metatrader5.com/en/help'],
  ],
};

// ── LOCALIZATION — core phrases in all 9 languages ───────────────────────────
export const L = {
  en: {
    ack: '',
    greet: "**Hello! I'm the ZTU AI Trading Assistant.** 👋\n\nI can help you with Gold & Bitcoin market context, trade assessment, risk & psychology, broker questions, and trading education — in your language.\n\nTry asking:\n- *What's the Gold market context right now?*\n- *Review my trade: entry, stop loss, take profit*\n- *Compare Exness vs IC Markets account types*\n- *Why do I keep losing?*",
    disclaimer: '_⚠️ Educational information only — always trade using your own judgment and risk management._',
    signalIntro: "I focus on **market education and context**, not live buy/sell signals.",
    signalBody: "For today's precise setups, entries, and signals, our team shares them here:",
    fallbackIntro: "I don't have that specific answer in our internal intelligence yet. Here are **trusted official sources** to check:",
    sourcesLabel: 'Trusted sources',
  },
  ur: {
    ack: '',
    greet: "**السلام علیکم! میں ZTU AI ٹریڈنگ اسسٹنٹ ہوں۔** 👋\n\nمیں آپ کی گولڈ اور بٹ کوائن مارکیٹ، ٹریڈ کے جائزے، رسک، نفسیات، بروکر سوالات اور ٹریڈنگ سیکھنے میں مدد کر سکتا ہوں — آپ کی زبان میں۔",
    disclaimer: '_⚠️ صرف تعلیمی مقصد کے لیے — یہ مالی مشورہ نہیں ہے۔_',
    signalIntro: "میں **مارکیٹ کی تعلیم اور سیاق و سباق** پر توجہ دیتا ہوں، براہِ راست خرید/فروخت سگنل نہیں دیتا۔",
    signalBody: "آج کے درست سیٹ اپ اور سگنلز کے لیے ہماری ٹیم یہاں شیئر کرتی ہے:",
    fallbackIntro: "یہ مخصوص جواب فی الحال ہمارے اندرونی ڈیٹا میں نہیں ہے۔ یہ **معتبر سرکاری ذرائع** دیکھیں:",
    sourcesLabel: 'معتبر ذرائع',
  },
  'ur-roman': {
    ack: '',
    greet: "**Assalam o Alaikum! Main ZTU AI Trading Assistant hoon.** 👋\n\nMain aap ki Gold aur Bitcoin market context, trade assessment, risk, psychology, broker sawalat aur trading seekhne mein madad kar sakta hoon — aap ki zaban mein.\n\nPoochhne ki koshish karein:\n- *Abhi Gold market ka context kya hai?*\n- *Mera trade review karein: entry, stop loss, take profit*\n- *Main baar baar kyun lose karta hoon?*",
    disclaimer: '_⚠️ Sirf taleemi maqsad ke liye — yeh financial advice nahi hai._',
    signalIntro: "Main **market ki taleem aur context** par focus karta hoon, direct buy/sell signal nahi deta.",
    signalBody: "Aaj ke exact setups aur signals ke liye hamari team yahan share karti hai:",
    fallbackIntro: "Yeh specific jawab filhal hamare internal data mein nahi hai. Yeh **trusted official sources** dekhein:",
    sourcesLabel: 'Trusted sources',
  },
  ar: {
    ack: '',
    greet: "**مرحباً! أنا مساعد ZTU AI للتداول.** 👋\n\nيمكنني مساعدتك في سياق سوق الذهب والبيتكوين، وتقييم الصفقات، وإدارة المخاطر والسيكولوجيا، وأسئلة الوسطاء، وتعليم التداول — بلغتك.",
    disclaimer: '_⚠️ سياق تعليمي للسوق فقط — وليس نصيحة مالية._',
    signalIntro: "أركز على **تعليم السوق وسياقه**، وليس إشارات بيع/شراء مباشرة.",
    signalBody: "للحصول على إعدادات ونقاط الدخول والإشارات الدقيقة لليوم، يشاركها فريقنا هنا:",
    fallbackIntro: "ليس لديّ هذه الإجابة المحددة في بياناتنا الداخلية بعد. إليك **مصادر رسمية موثوقة**:",
    sourcesLabel: 'مصادر موثوقة',
  },
  id: {
    ack: '',
    greet: "**Halo! Saya ZTU AI Trading Assistant.** 👋\n\nSaya bisa membantu Anda dengan konteks pasar Emas & Bitcoin, penilaian trade, risiko & psikologi, pertanyaan broker, dan edukasi trading — dalam bahasa Anda.",
    disclaimer: '_⚠️ Hanya konteks edukasi pasar — bukan nasihat finansial._',
    signalIntro: "Saya fokus pada **edukasi dan konteks pasar**, bukan sinyal beli/jual langsung.",
    signalBody: "Untuk setup, entry, dan sinyal presisi hari ini, tim kami membagikannya di sini:",
    fallbackIntro: "Saya belum memiliki jawaban spesifik itu di data internal kami. Berikut **sumber resmi tepercaya**:",
    sourcesLabel: 'Sumber tepercaya',
  },
  ms: {
    ack: '',
    greet: "**Salam! Saya ZTU AI Trading Assistant.** 👋\n\nSaya boleh membantu anda dengan konteks pasaran Emas & Bitcoin, penilaian dagangan, risiko & psikologi, soalan broker, dan pendidikan dagangan — dalam bahasa anda.",
    disclaimer: '_⚠️ Konteks pendidikan pasaran sahaja — bukan nasihat kewangan._',
    signalIntro: "Saya fokus pada **pendidikan dan konteks pasaran**, bukan isyarat beli/jual secara langsung.",
    signalBody: "Untuk setup, kemasukan, dan isyarat tepat hari ini, pasukan kami berkongsi di sini:",
    fallbackIntro: "Saya belum mempunyai jawapan khusus itu dalam data dalaman kami. Berikut **sumber rasmi yang dipercayai**:",
    sourcesLabel: 'Sumber dipercayai',
  },
  vi: {
    ack: '',
    greet: "**Xin chào! Tôi là Trợ lý Giao dịch ZTU AI.** 👋\n\nTôi có thể giúp bạn về bối cảnh thị trường Vàng & Bitcoin, đánh giá giao dịch, rủi ro & tâm lý, câu hỏi về sàn môi giới, và giáo dục giao dịch — bằng ngôn ngữ của bạn.",
    disclaimer: '_⚠️ Chỉ là bối cảnh giáo dục thị trường — không phải lời khuyên tài chính._',
    signalIntro: "Tôi tập trung vào **giáo dục và bối cảnh thị trường**, không phải tín hiệu mua/bán trực tiếp.",
    signalBody: "Để có các thiết lập, điểm vào lệnh và tín hiệu chính xác hôm nay, đội ngũ của chúng tôi chia sẻ tại đây:",
    fallbackIntro: "Tôi chưa có câu trả lời cụ thể đó trong dữ liệu nội bộ. Đây là **các nguồn chính thức đáng tin cậy**:",
    sourcesLabel: 'Nguồn đáng tin cậy',
  },
  bn: {
    ack: '',
    greet: "**হ্যালো! আমি ZTU AI ট্রেডিং অ্যাসিস্ট্যান্ট।** 👋\n\nআমি আপনাকে স্বর্ণ ও বিটকয়েন বাজারের প্রেক্ষাপট, ট্রেড মূল্যায়ন, ঝুঁকি ও মনোবিজ্ঞান, ব্রোকার সংক্রান্ত প্রশ্ন এবং ট্রেডিং শিক্ষায় সাহায্য করতে পারি — আপনার ভাষায়।",
    disclaimer: '_⚠️ শুধুমাত্র শিক্ষামূলক বাজার প্রেক্ষাপট — আর্থিক পরামর্শ নয়।_',
    signalIntro: "আমি **বাজার শিক্ষা ও প্রেক্ষাপটে** মনোযোগ দিই, সরাসরি কেনা/বেচার সিগন্যাল নয়।",
    signalBody: "আজকের নির্ভুল সেটআপ ও সিগন্যালের জন্য আমাদের টিম এখানে শেয়ার করে:",
    fallbackIntro: "এই নির্দিষ্ট উত্তরটি এখনও আমাদের অভ্যন্তরীণ ডেটায় নেই। এখানে **বিশ্বস্ত অফিসিয়াল উৎস** দেখুন:",
    sourcesLabel: 'বিশ্বস্ত উৎস',
  },
  th: {
    ack: '',
    greet: "**สวัสดี! ฉันคือผู้ช่วยเทรด ZTU AI** 👋\n\nฉันช่วยคุณได้เรื่องบริบทตลาดทองคำและบิตคอยน์ การประเมินการเทรด ความเสี่ยงและจิตวิทยา คำถามเกี่ยวกับโบรกเกอร์ และการเรียนรู้การเทรด — ในภาษาของคุณ",
    disclaimer: '_⚠️ เป็นบริบทเพื่อการศึกษาตลาดเท่านั้น — ไม่ใช่คำแนะนำทางการเงิน_',
    signalIntro: "ฉันเน้น **การให้ความรู้และบริบทของตลาด** ไม่ใช่สัญญาณซื้อ/ขายโดยตรง",
    signalBody: "สำหรับเซ็ตอัพ จุดเข้า และสัญญาณที่แม่นยำของวันนี้ ทีมงานของเราแชร์ที่นี่:",
    fallbackIntro: "ฉันยังไม่มีคำตอบเฉพาะนั้นในข้อมูลภายในของเรา นี่คือ **แหล่งข้อมูลทางการที่เชื่อถือได้**:",
    sourcesLabel: 'แหล่งที่เชื่อถือได้',
  },
};

export function loc(lang) { return L[lang] || L.en; }

// ── GENERIC HELPERS ──────────────────────────────────────────────────────────
export const has = (s, arr) => arr.some(w => s.includes(w));

export function money(n, dp = 2) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function extractNumbers(text) {
  const matches = (text.match(/\d[\d,]*\.?\d*/g) || []).map(x => parseFloat(x.replace(/,/g, '')));
  return matches.filter(n => !isNaN(n));
}

// Parse entry / stop / target from text by keyword proximity
export function parseTradeLevels(text) {
  const s = text.toLowerCase();
  const grab = (labels) => {
    for (const lab of labels) {
      const re = new RegExp(`${lab}[^\\d]{0,12}(\\d[\\d,]*\\.?\\d*)`, 'i');
      const m = s.match(re);
      if (m) return parseFloat(m[1].replace(/,/g, ''));
    }
    return null;
  };
  return {
    entry: grab(['entry', 'enter at', 'bought at', 'sold at', 'buy at', 'sell at', 'price']),
    sl:    grab(['stop loss', 'stoploss', 'stop', 'sl']),
    tp:    grab(['take profit', 'takeprofit', 'target', 'tp']),
  };
}

export function marketBlock(marketData) {
  if (!marketData || marketData.status !== 'ok') return null;
  const { gold, btc, vix, yields, marketRegime } = marketData;
  const lines = [];
  if (gold?.price != null) {
    const pct = gold.changePct != null ? ` (${gold.changePct > 0 ? '+' : ''}${gold.changePct.toFixed(2)}%)` : '';
    lines.push(`- **Gold (XAU/USD):** ${money(gold.price)}${pct}`);
  }
  if (btc?.price != null) {
    const pct = btc.changePct != null ? ` (${btc.changePct > 0 ? '+' : ''}${btc.changePct.toFixed(2)}%)` : '';
    lines.push(`- **Bitcoin (BTC/USD):** ${money(btc.price, 0)}${pct}`);
  }
  if (vix?.value != null)    lines.push(`- **VIX (volatility):** ${vix.value}`);
  if (yields?.us10y != null) lines.push(`- **US 10Y Yield:** ${yields.us10y.toFixed(2)}%${yields.real10y != null ? ` · Real: ${yields.real10y.toFixed(2)}%` : ''}`);
  if (marketRegime?.label)   lines.push(`- **Market Regime:** ${marketRegime.label}`);
  return lines.length ? lines.join('\n') : null;
}

export function trustedSourceBlock(lang, key) {
  const list = TRUSTED_SOURCES[key] || [];
  return list.map(([n, u]) => `- [${n}](${u})`).join('\n');
}

export function signalRouteBlock(lang) {
  const t = loc(lang);
  return `${t.signalIntro}\n\n${t.signalBody}\n- 📲 [Today's Signals on Telegram](${TELEGRAM})\n- 💬 [WhatsApp Channel](${WHATSAPP})`;
}

// ── TIMEZONE FORMATTING ──────────────────────────────────────────────────────
export function fmtTime(iso, tz) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC', weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(d);
  } catch { return null; }
}

export function isSameDayInTz(iso, tz) {
  try {
    const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return fmt(new Date(iso)) === fmt(new Date());
  } catch { return false; }
}

export function impactEmoji(impact) {
  const i = (impact || '').toLowerCase();
  if (i === 'high')   return '🔴';
  if (i === 'medium') return '🟡';
  return '⚪';
}

// ── CONVERSATION-CONTEXT TRANSFORMS (follow-up modes) ────────────────────────
export function condense(text, lang) {
  const t = loc(lang);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = []; let bullets = 0;
  for (const l of lines) {
    if (l.startsWith('##')) { out.push(l.replace(/^#+\s*/, '**') + '**'); continue; }
    if (/^[-•]/.test(l) && bullets < 3) { out.push(l); bullets++; }
  }
  if (!out.some(l => /^[-•]/.test(l))) {
    const para = lines.find(l => !l.startsWith('#') && !l.startsWith('_') && !l.startsWith('**') && l.length > 30);
    if (para) out.push('- ' + para.split('. ')[0].replace(/\*\*/g, '').slice(0, 160));
  }
  const head = (lang === 'ur' || lang === 'ur-roman') ? '**Mukhtasar (in short):**'
             : (lang === 'ar') ? '**باختصار:**' : '**In short:**';
  return head + '\n' + out.join('\n') + '\n\n' + t.disclaimer;
}

export function whyPreface(lang) {
  const map = {
    'en': "**Here's the reasoning behind that:**\n\n",
    'ur': "**اس کی بنیادی وجہ یہ ہے:**\n\n",
    'ur-roman': "**Iski bunyadi wajah yeh hai:**\n\n",
    'ar': "**إليك المنطق وراء ذلك:**\n\n",
    'id': "**Berikut alasannya:**\n\n",
    'ms': "**Berikut sebabnya:**\n\n",
    'vi': "**Đây là lý do đằng sau điều đó:**\n\n",
    'bn': "**এর পেছনের যুক্তি:**\n\n",
    'th': "**นี่คือเหตุผลเบื้องหลัง:**\n\n",
  };
  return map[lang] || map.en;
}

export function expandBlock(ctx) {
  return `\n\n**Going deeper:** want me to drill into one specific angle — the **technical structure**, the **macro driver** (real yields / DXY), the **sentiment**, or the **psychology** of this? Name it and I'll expand on just that. You can also share your **entry, stop & target** for a full structure review.`;
}

// ── TRADER JOURNEY (level adaptation) ────────────────────────────────────────
export function levelNote(tc, intent) {
  if (!tc || !tc.level) return '';
  if (tc.level === 'beginner' && ['gold', 'btc', 'macro', 'knowledge', 'brief'].includes(intent)) {
    return `\n\n💡 _New to this? In plain terms: focus on understanding **why** price moves and protecting your capital — predicting the next candle comes much later._`;
  }
  if (tc.level === 'advanced' && ['gold', 'btc', 'macro'].includes(intent)) {
    return `\n\n_(Pro view: watch the real-yield + DXY confluence and positioning into the next data print for the higher-timeframe bias.)_`;
  }
  return '';
}

// ── CONVERSION ENGINE (natural, non-spammy CTAs) ─────────────────────────────
export function conversionCTA(intent) {
  switch (intent) {
    case 'brief':
    case 'events':
      return `\n\n📊 For the full live breakdown, see **[Live Market Sentiment](live-sentiment.html)** and the **[Weekly Report](weekly-report.html)**.`;
    case 'whylosing':
    case 'psychology':
    case 'selfassess':
      return `\n\n🪞 To pinpoint your exact profile and roadmap, take the **[Trader Self-Assessment](trader-assessment.html)**.`;
    case 'macro':
      return `\n\n📈 Full macro dashboard: **[Fundamentals & Technical Intelligence](fundamentals.html)**.`;
    default:
      return '';
  }
}
