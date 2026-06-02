// functions/utils/ai-engine.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU AI RESPONSE ENGINE — ZERO PAID API
//
// A self-hosted, rule-based multilingual intelligence engine. No Anthropic.
// No paid LLM. Runs entirely inside Cloudflare Pages Functions for free.
//
// PRIORITY 1: Answer from INTERNAL website intelligence (live market data via
//             FRED/TwelveData/Finnhub, patterns, trader mirror, knowledge base,
//             broker dataset, trade-assessment & psychology logic).
// PRIORITY 2: If not answerable internally, point the user to TRUSTED, FILTERED
//             official sources only (regulators, exchanges, official docs, tier-1
//             news). We never invent facts or cite blogs/forums/SEO spam.
//
// GUARDRAILS: never a buy/sell signal, never an exact entry, never a guaranteed
//             outcome — signal requests are routed to Telegram / WhatsApp.
// ════════════════════════════════════════════════════════════════════════════

import { findBroker, brokerRegulatorLines, listBrokerNames, REGULATORS } from './broker-data.js';

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

// ── SIGNAL ROUTING TARGETS ───────────────────────────────────────────────────
const TELEGRAM = 'https://t.me/ztradeuniversity';
const WHATSAPP = 'https://wa.me/17189730347';

// ════════════════════════════════════════════════════════════════════════════
//  LANGUAGE DETECTION (9 languages, no API)
// ════════════════════════════════════════════════════════════════════════════

export function detectLanguage(text) {
  const t = text || '';

  // Script-based (non-Latin) detection first
  if (/[฀-๿]/.test(t)) return 'th';            // Thai
  if (/[ঀ-৿]/.test(t)) return 'bn';            // Bengali
  if (/[؀-ۿ]/.test(t)) {
    // Arabic script — distinguish Urdu (extra letters) from Arabic
    if (/[ٹڈڑںھہےگچپژ]/.test(t)) return 'ur';
    return 'ar';
  }

  const lower = t.toLowerCase();

  // Vietnamese — distinctive letters / diacritics
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t)) return 'vi';
  if (/\b(vàng|giá|thế nào|không|tôi|làm sao|mua|bán)\b/.test(lower)) return 'vi';

  // Roman Urdu (Latin script) — needs ≥2 distinctive tokens to avoid false hits
  const romanUrdu = ['kya','kia','kaise','kaisa','kaisay','hai','hain','mera','meri','mujhe','batao','btao','karun','karoon','kar','raha','rahi','nahi','nahin','kyun','kyon','acha','accha','theek','rate kya','gold ka','kab','chahiye','samajh','bata'];
  const ruHits = romanUrdu.filter(w => new RegExp(`\\b${w}\\b`).test(lower)).length;
  if (ruHits >= 2) return 'ur-roman';

  // Malay markers (check before Indonesian — some unique tokens)
  if (/\b(macam mana|boleh|tak nak|nak tahu|saya nak|kenapa emas)\b/.test(lower)) return 'ms';
  // Indonesian markers
  if (/\b(bagaimana|apakah|saya ingin|harga emas|kenapa|sekarang|bisa|tidak)\b/.test(lower)) return 'id';
  // Generic Malay/Indonesian shared (default to Indonesian if 'saya'/'apa'/'emas')
  if (/\b(saya|emas|apa)\b/.test(lower) && /\b(harga|naik|turun|pasar)\b/.test(lower)) return 'id';

  return 'en';
}

// ════════════════════════════════════════════════════════════════════════════
//  LOCALIZATION — core phrases in all 9 languages
//  Data/numbers are universal; detailed educational prose is English with a
//  localized opener + localized disclaimer so the reply matches the user's
//  language as closely as a no-LLM engine allows.
// ════════════════════════════════════════════════════════════════════════════

const L = {
  en: {
    ack: '',
    greet: "**Hello! I'm the ZTU AI Trading Assistant.** 👋\n\nI can help you with Gold & Bitcoin market context, trade assessment, risk & psychology, broker questions, and trading education — in your language.\n\nTry asking:\n- *What's the Gold market context right now?*\n- *Review my trade: entry, stop loss, take profit*\n- *Compare Exness vs IC Markets account types*\n- *Why do I keep losing?*",
    disclaimer: '_⚠️ Educational market context only — not financial advice._',
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

function loc(lang) { return L[lang] || L.en; }

// ════════════════════════════════════════════════════════════════════════════
//  INTENT CLASSIFICATION
// ════════════════════════════════════════════════════════════════════════════

const has = (s, arr) => arr.some(w => s.includes(w));

export function classifyIntent(text) {
  const s = (text || '').toLowerCase().trim();
  const broker = findBroker(s);

  // Greeting (only short greetings)
  if (/^(hi|hey|hello|salam|assalam|asalam|halo|hallo|xin chao|sawasdee|namaskar|kemusta|hai)\b/.test(s) && s.length < 24) {
    return { intent: 'greeting', broker: null };
  }

  // SIGNAL REQUEST guardrail — asking us to tell them to buy/sell or give a signal/entry
  const askingSignal = has(s, [
    'should i buy', 'should i sell', 'buy or sell', 'sell or buy', 'give me a signal',
    'give signal', 'send signal', 'todays signal', "today's signal", 'today signal',
    'buy now', 'sell now', 'exact entry', 'entry price for', 'where to buy', 'where to enter',
    'long or short', 'tp and sl for', 'what should i trade', 'tell me to buy', 'tell me to sell',
    'kya khareedun', 'buy karun', 'sell karun', 'signal do', 'signal chahiye',
  ]);
  // Review markers (user shares THEIR OWN trade for assessment)
  const reviewMarkers = has(s, [
    'review my trade', 'assess my trade', 'rate my trade', 'check my trade', 'my entry is',
    'i entered', 'my stop loss', 'my sl', 'my tp', 'my take profit', 'my setup', 'analyse my',
    'analyze my', 'evaluate my trade', 'trade idea', 'risk reward', 'risk to reward', 'r:r',
  ]);
  if (askingSignal && !reviewMarkers) return { intent: 'signal', broker };

  // Broker module
  if (broker || has(s, ['broker', 'regulated', 'regulation', 'fca', 'cysec', 'asic', 'fsca',
      'deposit pending', 'withdrawal delay', 'withdraw', 'deposit', 'mt5 login', 'invalid account',
      'invalid server', 'account type', 'raw vs standard', 'standard vs', 'ecn account', 'cent account',
      'spread', 'commission', 'leverage', 'margin'])) {
    // platform-specific login still routed to broker module since it concerns broker/MT5
    return { intent: 'broker', broker };
  }

  // Platform help
  if (has(s, ['tradingview', 'trading view'])) return { intent: 'platform', platform: 'tradingview', broker };
  if (has(s, ['mt5', 'metatrader', 'meta trader', 'mt4'])) return { intent: 'platform', platform: 'mt5', broker };

  // Trade assessment
  if (reviewMarkers || (has(s, ['entry', 'stop loss', 'take profit', 'sl', 'tp']) && /\d/.test(s))) {
    return { intent: 'assess', broker };
  }

  // Lot size / risk calculator
  if (has(s, ['lot size', 'position size', 'how many lots', 'risk per trade', 'calculate lot', 'lot calculation'])) {
    return { intent: 'lotsize', broker };
  }

  // Stuck trade
  if (has(s, ['stuck', 'drawdown', 'in loss', 'losing trade', 'underwater', 'in the red',
      'trade is down', 'floating loss', 'what should i do with my'])) {
    return { intent: 'stuck', broker };
  }

  // Why am I losing
  if (has(s, ['why am i losing', 'why do i lose', 'why do i keep losing', 'keep losing',
      'not profitable', 'not making profit', 'always lose', 'losing money'])) {
    return { intent: 'whylosing', broker };
  }

  // Psychology
  if (has(s, ['fomo', 'revenge', 'fear', 'greedy', 'greed', 'emotional', 'discipline',
      'overtrading', 'over trading', 'hesitat', 'psychology', 'mindset', 'emotion'])) {
    return { intent: 'psychology', knowledgeTopic: 'psychology', broker };
  }

  // Knowledge / books
  if (has(s, ['mark douglas', 'trading in the zone'])) return { intent: 'knowledge', knowledgeTopic: 'mark-douglas', broker };
  if (has(s, ['van tharp', 'r-multiple', 'r multiple']))  return { intent: 'knowledge', knowledgeTopic: 'van-tharp', broker };
  if (has(s, ['market wizard']))                          return { intent: 'knowledge', knowledgeTopic: 'market-wizards', broker };
  if (has(s, ['roadmap', 'how to start', 'where do i start', 'beginner', 'new to trading'])) return { intent: 'knowledge', knowledgeTopic: 'beginner', broker };
  if (has(s, ['quote', 'wisdom']))                        return { intent: 'knowledge', knowledgeTopic: 'quotes', broker };
  if (has(s, ['what is', 'what are', 'explain', 'define', 'meaning of', 'how does']) &&
      has(s, ['stop loss', 'risk reward', 'leverage', 'margin', 'pip', 'spread', 'lot'])) {
    return { intent: 'knowledge', knowledgeTopic: 'glossary', broker };
  }

  // Events
  if (has(s, ['cpi', 'nfp', 'fomc', 'ppi', 'interest rate decision', 'economic event',
      'news event', 'calendar', 'upcoming news', 'data release', 'jobs report'])) {
    return { intent: 'events', broker };
  }

  // Macro
  if (has(s, ['dxy', 'dollar index', 'yield', 'bond', 'real yield', 'vix', 'volatility',
      'breakeven', 'inflation', 'fed', 'federal reserve', 'macro'])) {
    return { intent: 'macro', broker };
  }

  // Market mood / session
  if (has(s, ['market mood', 'mood', 'risk on', 'risk off', 'sentiment'])) return { intent: 'mood', broker };
  if (has(s, ['session', 'london open', 'new york open', 'asian session', 'what time', 'best time to trade'])) return { intent: 'session', broker };

  // Gold / BTC
  if (has(s, ['gold', 'xau', 'xauusd', 'sona', 'emas', 'vàng', 'স্বর্ণ', 'সোনা', 'ذهب', 'ذہب', 'سونا', 'ทอง', 'ทองคำ'])) return { intent: 'gold', broker };
  if (has(s, ['btc', 'bitcoin', 'crypto', 'bit coin', 'بيتكوين', 'বিটকয়েন', 'บิทคอยน์'])) return { intent: 'btc', broker };

  // Help / about the assistant
  if (has(s, ['what can you do', 'help', 'how do you work', 'who are you', 'features'])) {
    return { intent: 'greeting', broker };
  }

  return { intent: 'fallback', broker };
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════

function money(n, dp = 2) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function extractNumbers(text) {
  const matches = (text.match(/\d[\d,]*\.?\d*/g) || []).map(x => parseFloat(x.replace(/,/g, '')));
  return matches.filter(n => !isNaN(n));
}

// Parse entry / stop / target from text by keyword proximity
function parseTradeLevels(text) {
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

function marketBlock(marketData) {
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
  if (vix?.value != null)   lines.push(`- **VIX (volatility):** ${vix.value}`);
  if (yields?.us10y != null) lines.push(`- **US 10Y Yield:** ${yields.us10y.toFixed(2)}%${yields.real10y != null ? ` · Real: ${yields.real10y.toFixed(2)}%` : ''}`);
  if (marketRegime?.label)  lines.push(`- **Market Regime:** ${marketRegime.label}`);
  return lines.length ? lines.join('\n') : null;
}

function trustedSourceBlock(lang, key) {
  const list = TRUSTED_SOURCES[key] || [];
  return list.map(([n, u]) => `- [${n}](${u})`).join('\n');
}

function signalRouteBlock(lang) {
  const t = loc(lang);
  return `${t.signalIntro}\n\n${t.signalBody}\n- 📲 [Today's Signals on Telegram](${TELEGRAM})\n- 💬 [WhatsApp Channel](${WHATSAPP})`;
}

// ════════════════════════════════════════════════════════════════════════════
//  RESPONSE GENERATION
// ════════════════════════════════════════════════════════════════════════════

export function generateResponse(ctx) {
  const { text, lang = 'en', intent, marketData, patternData, knowledgeEntries, broker, isFirstMessage } = ctx;
  const t = loc(lang);
  const disc = '\n\n' + t.disclaimer;

  switch (intent) {

    // ── GREETING ──────────────────────────────────────────────────────────
    case 'greeting':
      return t.greet + disc;

    // ── SIGNAL REQUEST (guardrail) ─────────────────────────────────────────
    case 'signal':
      return signalRouteBlock(lang) + '\n\nMeanwhile, I can explain the **current market context**, assess **your own** trade idea, or check **news risk** — just ask.' + disc;

    // ── GOLD ──────────────────────────────────────────────────────────────
    case 'gold': {
      const mb = marketBlock(marketData);
      let out = '## Gold (XAU/USD) — Market Context\n';
      if (mb) out += mb + '\n\n';
      out += `**What moves Gold right now:**\n` +
        `- **Real yields & the Fed:** lower real yields and dovish Fed expectations tend to support Gold; rising yields pressure it.\n` +
        `- **US Dollar (DXY):** Gold is priced in USD — a stronger dollar is a headwind, a weaker dollar a tailwind.\n` +
        `- **Safe-haven demand:** geopolitical risk and elevated VIX can lift Gold.\n` +
        `- **Inflation expectations:** rising breakeven inflation is historically Gold-supportive.\n`;
      if (marketData?.marketRegime?.label) {
        out += `\nWith the current regime reading **${marketData.marketRegime.label}**, position discipline matters — context can shift quickly around news.`;
      }
      out += `\n\nWant me to **review a specific Gold trade idea** (your entry, SL, TP)? Share the numbers and I'll assess the structure and risk.`;
      return out + disc;
    }

    // ── BTC ───────────────────────────────────────────────────────────────
    case 'btc': {
      const mb = marketBlock(marketData);
      let out = '## Bitcoin (BTC/USD) — Market Context\n';
      if (mb) out += mb + '\n\n';
      out += `**Key BTC drivers:**\n` +
        `- **Risk appetite:** BTC behaves like a high-beta risk asset — low VIX / risk-on conditions tend to help, risk-off tends to pressure it.\n` +
        `- **Liquidity & the dollar:** looser global liquidity and a softer USD are historically supportive.\n` +
        `- **ETF & institutional flows:** spot-ETF inflows/outflows are a meaningful demand signal.\n` +
        `- **Halving cycle & on-chain:** supply dynamics and long-term holder behaviour shape the macro backdrop.\n`;
      out += `\nI can walk through **your own BTC trade idea** for structure and risk — just share entry, stop, and target.`;
      return out + disc;
    }

    // ── MACRO ─────────────────────────────────────────────────────────────
    case 'macro': {
      const mb = marketBlock(marketData);
      let out = '## Macro Context — DXY, Yields & VIX\n';
      if (mb) out += mb + '\n\n';
      out += `**How these connect to Gold & BTC:**\n` +
        `- **DXY (US Dollar Index):** inverse to Gold; dollar strength is a headwind for both Gold and risk assets.\n` +
        `- **US 10Y & real yields:** rising yields raise the opportunity cost of holding Gold (no yield) → pressure; falling yields → tailwind.\n` +
        `- **Breakeven inflation:** higher inflation expectations are historically Gold-supportive.\n` +
        `- **VIX:** under 15 = calm/risk-on · 15–20 = neutral · 20–25 = caution · above 25 = risk-off.\n`;
      out += `\nFor the latest macro releases and central-bank data, these official sources are reliable:\n${trustedSourceBlock(lang, 'macro')}`;
      return out + disc;
    }

    // ── EVENTS ────────────────────────────────────────────────────────────
    case 'events': {
      let out = '## Economic Events — What They Mean\n' +
        `- **CPI (inflation):** hotter-than-expected CPI can lift yields & the dollar → *possible* Gold pressure and risk-asset volatility. Softer CPI is often the reverse.\n` +
        `- **NFP (jobs):** a strong labour market can support the dollar and shift Fed expectations; surprises drive sharp moves.\n` +
        `- **FOMC (Fed decision):** rate decisions and the tone/dot-plot reset expectations across Gold, BTC, and the dollar.\n` +
        `- **PPI:** an early inflation read that can foreshadow CPI direction.\n\n` +
        `⚠️ Around these releases, spreads widen and whipsaws are common — many traders avoid the first minutes.\n\n` +
        `**Check the live calendar (official/trusted):**\n${trustedSourceBlock(lang, 'calendar')}`;
      return out + disc;
    }

    // ── TRADE ASSESSMENT ───────────────────────────────────────────────────
    case 'assess': {
      const { entry, sl, tp } = parseTradeLevels(text);
      let out = '## Trade Assessment (educational)\n';
      if (entry && sl && tp) {
        const slDist = Math.abs(entry - sl);
        const tpDist = Math.abs(tp - entry);
        const rr = slDist > 0 ? (tpDist / slDist) : null;
        out += `**Your levels:** Entry ${money(entry)} · Stop ${money(sl)} · Target ${money(tp)}\n\n`;
        out += `- **Stop distance:** ${slDist.toLocaleString('en-US')} points\n`;
        out += `- **Target distance:** ${tpDist.toLocaleString('en-US')} points\n`;
        if (rr != null) {
          const verdict = rr >= 2 ? '🟢 strong' : rr >= 1.5 ? '🟡 acceptable' : '🔴 below the common 1:1.5 minimum';
          out += `- **Risk-to-Reward:** ≈ **1:${rr.toFixed(2)}** — ${verdict}\n`;
        }
        out += `\n**How to read this (not a signal):**\n` +
          `- A minimum **1:1.5** R:R is generally considered acceptable; **1:2+** is preferred by most risk managers.\n` +
          `- Ask: is your **stop** beyond a logical structure level (not just an arbitrary distance)?\n` +
          `- Ask: does your **target** sit before a major opposing level that could reject price?\n` +
          `- Check **news risk**: is a high-impact event due within your trade's timeframe?\n`;
      } else {
        out += `Share your **entry**, **stop loss**, and **take profit** (e.g., *"entry 2650, stop 2640, target 2675"*) and I'll calculate your risk-to-reward and review the structure.\n\n` +
          `I'll cover: stop placement vs. structure, target realism, R:R, and news risk — all **educational**, never a buy/sell instruction.`;
      }
      if (marketData?.marketRegime?.label) out += `\n_Current regime: **${marketData.marketRegime.label}**._`;
      return out + disc;
    }

    // ── LOT SIZE ───────────────────────────────────────────────────────────
    case 'lotsize': {
      const nums = extractNumbers(text);
      const s = text.toLowerCase();
      const acct = (s.match(/(?:account|balance|capital|equity)[^\d]{0,10}(\d[\d,]*\.?\d*)/i) || [])[1];
      const riskPct = (s.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1];
      const slPips = (s.match(/(\d+(?:\.\d+)?)\s*(?:pips?|points?)/i) || [])[1];
      let out = '## Position Size & Risk Calculator (educational)\n';
      const account = acct ? parseFloat(acct.replace(/,/g, '')) : null;
      const risk    = riskPct ? parseFloat(riskPct) : null;
      const pips    = slPips ? parseFloat(slPips) : null;
      if (account && risk && pips) {
        const riskAmt = account * (risk / 100);
        const pipValuePerLot = 10; // documented assumption for XAU/USD per 1.00 lot
        const lots = riskAmt / (pips * pipValuePerLot);
        out += `**Your inputs:** Account ${money(account)} · Risk ${risk}% · Stop ${pips} pips\n\n` +
          `- **Risk amount:** ${money(riskAmt)} (the most you'd lose if stopped out)\n` +
          `- **Assumed Gold pip value:** ~$${pipValuePerLot} per pip per **1.00** standard lot\n` +
          `- **Suggested size:** ≈ **${lots.toFixed(2)} lots**\n\n` +
          `_Formula:_ \`Lots = (Account × Risk%) ÷ (Stop pips × pip value per lot)\`\n\n` +
          `⚠️ Pip value varies by broker and instrument — **always confirm the exact pip/point value on your own platform** before sizing.`;
      } else {
        out += `Tell me three things and I'll calculate it:\n` +
          `1. **Account size** (e.g., $5,000)\n2. **Risk per trade %** (1–2% recommended)\n3. **Stop loss distance** in pips/points\n\n` +
          `_Formula:_ \`Lots = (Account × Risk%) ÷ (Stop pips × pip value per lot)\`\n\n` +
          `Golden rule: risk **1–2% max** per trade so a losing streak can't wipe your account.`;
      }
      return out + disc;
    }

    // ── STUCK TRADE ────────────────────────────────────────────────────────
    case 'stuck': {
      let out = `## On a Trade in Drawdown\n` +
        `First — drawdowns are stressful, and that feeling is completely normal. Let's think clearly. 🧭\n\n`;
      const mb = marketBlock(marketData);
      if (mb) out += `**Current context:**\n${mb}\n\n`;
      out += `**Honest framing (not a rescue instruction):**\n` +
        `- Stuck trades carry **genuine uncertainty** — no one can predict whether price returns to your level.\n` +
        `- ⚠️ Be very careful with **emotional averaging** (adding to a loser without a clear structural reason) and **revenge entries** — these turn one mistake into several.\n` +
        `- A useful question: *"If I had no position right now, would I open this trade based on the current structure?"*\n` +
        `- Whatever happens, journal it. The goal is to protect capital and bring discipline to the **next** clean setup.\n\n` +
        `I won't tell you to hold, close, or add — that decision is yours and depends on your plan and risk limits.`;
      return out + disc;
    }

    // ── WHY AM I LOSING ────────────────────────────────────────────────────
    case 'whylosing':
      return `## Why Am I Losing? — A Structured Breakdown\n` +
        `Losses usually trace back to one (or more) of these areas. Be honest with yourself on each:\n\n` +
        `**1. 🧠 Psychology** — FOMO entries, revenge trading, breaking your own rules under pressure.\n` +
        `**2. 🎯 Execution** — entering before confirmation, stops placed at arbitrary distances, exiting winners too early.\n` +
        `**3. 🛡️ Risk Management** — risking too much per trade, poor R:R, no daily loss limit.\n` +
        `**4. ⏳ Patience** — overtrading, forcing trades in ranging markets, not waiting for A+ setups.\n` +
        `**5. ⚖️ Leverage & Sizing** — positions too large for the account; one bad trade does outsized damage.\n` +
        `**6. 📅 News & Timing** — trading into high-impact events or thin-liquidity sessions.\n\n` +
        `A powerful first step: take the **[Trader Self-Assessment](trader-assessment.html)** — it pinpoints which of these is hurting you most and gives a personalised roadmap.\n\n` +
        `Tell me which area resonates and I'll go deeper with you.` + disc;

    // ── PSYCHOLOGY / KNOWLEDGE (from internal KB) ──────────────────────────
    case 'psychology':
    case 'knowledge': {
      if (knowledgeEntries && knowledgeEntries.length) {
        const e = knowledgeEntries[0];
        let out = `## ${e.title}${e.source_author ? ` — *${e.source_author}*` : ''}\n${e.content}`;
        if (knowledgeEntries[1]) {
          out += `\n\n---\n**Related:** ${knowledgeEntries[1].title} — ${knowledgeEntries[1].summary || ''}`;
        }
        return out + disc;
      }
      return `I can share lessons from our knowledge base — **Mark Douglas (Trading in the Zone)**, **Van Tharp (position sizing & R-multiples)**, **Market Wizards**, trading **psychology**, a **beginner roadmap**, and a **glossary**. Which would you like?` + disc;
    }

    // ── BROKER MODULE ──────────────────────────────────────────────────────
    case 'broker':
      return brokerResponse(text, broker, lang) + disc;

    // ── PLATFORM HELP ──────────────────────────────────────────────────────
    case 'platform': {
      if (ctx.platform === 'tradingview') {
        return `## TradingView — Quick Help\n` +
          `- **Add an indicator:** top toolbar → *Indicators* → search (e.g., RSI, EMA) → click to add.\n` +
          `- **Draw a trendline:** left toolbar → trendline tool → click two points.\n` +
          `- **Set a price alert:** right-click the chart → *Add Alert*, or press the alarm icon; set condition & notification.\n` +
          `- **Multiple timeframes:** use the timeframe selector (top-left) or open a multi-chart layout.\n` +
          `- **Save a layout:** *Save* (top-right) to keep your drawings and indicators.\n\n` +
          `Official help: [TradingView Help Center](https://www.tradingview.com/support/)` + disc;
      }
      return `## MetaTrader 5 (MT5) — Quick Help\n` +
        `- **Place an order:** *New Order* (F9) → choose symbol, volume (lots), and set Stop Loss / Take Profit → Buy/Sell.\n` +
        `- **Modify SL/TP:** right-click the position in the *Trade* tab → *Modify or Delete* → set new levels.\n` +
        `- **Read your account:** the *Toolbox → Trade* tab shows Balance, Equity, Margin, and Free Margin.\n` +
        `- **Margin & free margin:** Free Margin = Equity − Used Margin; if it hits zero you risk a margin call.\n` +
        `- **Login issues ("invalid account"):** double-check the **login number**, **password**, and especially the exact **server name** from your broker.\n\n` +
        `Official docs: [MetaTrader 5 Help](https://www.metatrader5.com/en/help)` + disc;
    }

    // ── MARKET MOOD ────────────────────────────────────────────────────────
    case 'mood': {
      const mb = marketBlock(marketData);
      const regime = marketData?.marketRegime?.label || 'Neutral';
      const vix = marketData?.vix?.value;
      let mood = 'Neutral / balanced';
      if (vix != null && vix >= 25) mood = 'High Volatility — elevated fear';
      else if (/risk-off/i.test(regime)) mood = 'Risk-Off — defensive';
      else if (/risk-on/i.test(regime)) mood = 'Risk-On — healthy appetite';
      else if (vix != null && vix < 15) mood = 'Calm — low volatility';
      let out = `## Market Mood\n**Current mood:** ${mood}\n\n`;
      if (mb) out += mb + '\n\n';
      out += `Use mood as **context, not a trigger**: risk-off / high-VIX conditions widen ranges and reward patience; calm conditions can mean slower, choppier moves.`;
      return out + disc;
    }

    // ── SESSION ────────────────────────────────────────────────────────────
    case 'session':
      return `## Trading Sessions (UTC)\n` +
        `- **Asia (Tokyo/Sydney):** ~00:00–09:00 — typically lower liquidity, tighter ranges.\n` +
        `- **London:** ~08:00–17:00 — often the most active session for Gold.\n` +
        `- **New York:** ~13:00–22:00 — high activity, major US data lands here.\n` +
        `- **London/NY overlap:** ~13:00–17:00 — **peak liquidity** and often the largest moves.\n\n` +
        `The live **AI Session Map™** in the sidebar shows which sessions are open right now.` + disc;

    // ── FALLBACK (Priority 2: trusted sources) ─────────────────────────────
    case 'fallback':
    default: {
      return `${t.fallbackIntro}\n\n` +
        `**Markets & macro:**\n${trustedSourceBlock(lang, 'macro')}\n\n` +
        `**News:**\n${trustedSourceBlock(lang, 'news')}\n\n` +
        `**Learn trading:**\n${trustedSourceBlock(lang, 'education')}\n\n` +
        `Or ask me about **Gold/BTC context, a trade assessment, brokers, risk, or psychology** — I answer those directly.` + disc;
    }
  }
}

// ── BROKER RESPONSE BUILDER ──────────────────────────────────────────────────

function brokerResponse(text, broker, lang) {
  const s = text.toLowerCase();

  // Specific broker named → detailed card
  if (broker) {
    const regLines = brokerRegulatorLines(broker);
    let out = `## ${broker.name}\n`;
    out += `**Account types:** ${broker.accountTypes.join(', ')}\n\n`;
    out += `**Regulation (per the broker's disclosures — always verify yourself):**\n${regLines.join('\n')}\n\n`;
    out += `**Official links (only official sources):**\n- Website: ${broker.website}\n- Help center: ${broker.help}\n\n`;
    if (broker.notes) out += `**Notes:** ${broker.notes}\n\n`;

    // Issue-specific guidance
    if (has(s, ['deposit', 'pending'])) {
      out += `**Deposit pending?** Processing times vary by method (cards/e-wallets are usually fast; bank wires take longer). Check the deposit status in your broker portal and contact the broker's **official help center** above if it exceeds their stated time.\n\n`;
    }
    if (has(s, ['withdraw', 'withdrawal'])) {
      out += `**Withdrawal delayed?** Most delays are due to **KYC/verification** not being complete, or withdrawing to a different method than you deposited with. Verify your KYC status and raise a ticket via the official help center.\n\n`;
    }
    if (has(s, ['login', 'invalid account', 'invalid server', "can't login", 'cannot login', 'mt5 login'])) {
      out += `**MT5 login / "invalid account"?** Re-check your **login number**, **password**, and the exact **server name** (it must match what the broker emailed you). Picking the wrong server is the #1 cause of this error.\n\n`;
    }
    out += `_⚠️ I share official broker info only and never your password. Always confirm regulation on the official register links above._`;
    return out;
  }

  // Regulation / "is it legal" / how to verify
  if (has(s, ['regulated', 'regulation', 'legal', 'verify', 'fca', 'cysec', 'asic', 'fsca'])) {
    const regList = Object.values(REGULATORS).map(r => `- **${r.name}** — ${r.verify}`).join('\n');
    return `## How to Verify a Broker's Regulation\n` +
      `Never trust a broker's word alone — **check the regulator's official register** directly:\n\n${regList}\n\n` +
      `Steps: 1) Find the broker's claimed licence number on their site, 2) search it on the matching regulator register above, 3) confirm the legal entity name and that the licence is **active**.\n\n` +
      `Brokers I have detailed info on: ${listBrokerNames().join(', ')}. Name one for its regulators and account types.`;
  }

  // Account types / spreads / leverage explainer
  if (has(s, ['account type', 'raw vs standard', 'standard vs', 'ecn', 'cent account', 'which account'])) {
    return `## Broker Account Types — Explained\n` +
      `- **Cent / Micro:** balances shown in cents; tiny position sizes. Best for **learning** or very small capital.\n` +
      `- **Standard:** commission-free, cost is in the (slightly wider) **spread**. Good all-rounder for most retail traders.\n` +
      `- **ECN / Raw / Zero:** **raw spreads + a commission** per lot. Tightest spreads — best for active traders/scalpers who calculate total cost.\n` +
      `- **Pro / VIP:** for larger accounts; better conditions, sometimes higher minimums.\n\n` +
      `**Total cost = spread + commission.** A "zero spread" account with commission can be cheaper or pricier than a standard account depending on how you trade — compare the all-in cost.\n\n` +
      `Tell me your broker (e.g., ${listBrokerNames().slice(0, 4).join(', ')}…) and I'll list its specific account types.`;
  }

  if (has(s, ['spread', 'commission'])) {
    return `## Spreads vs. Commission\n` +
      `- **Spread:** the gap between Bid and Ask — your immediate cost to enter. Standard accounts bake cost into a wider spread.\n` +
      `- **Commission:** a flat fee per lot on raw/ECN accounts, which have much tighter spreads.\n` +
      `- **Compare all-in:** raw spread + commission vs. standard spread. For frequent/scalping styles, raw+commission is often cheaper.\n` +
      `- **Swap/overnight fees** also apply if you hold positions past the daily rollover.`;
  }

  if (has(s, ['leverage'])) {
    return `## Leverage — Explained\n` +
      `Leverage lets you control a larger position with less margin (e.g., 1:100 means $1,000 controls $100,000).\n\n` +
      `⚠️ **Leverage amplifies both gains AND losses.** It does **not** change your risk per trade — that's set by your **stop loss and position size**. Many blown accounts come from oversizing because high leverage *allowed* it.\n\n` +
      `Rule of thumb: decide risk by the **1–2% rule**, not by how much leverage your broker offers.`;
  }

  if (has(s, ['margin'])) {
    return `## Margin — Explained\n` +
      `- **Used Margin:** the funds locked to hold your open positions.\n` +
      `- **Free Margin:** Equity − Used Margin — what's available for new trades or to absorb drawdown.\n` +
      `- **Margin Level (%):** (Equity ÷ Used Margin) × 100. If it falls too low, you hit a **margin call** and then a **stop-out** (positions auto-closed).\n\n` +
      `Keeping plenty of free margin (by not oversizing) is how you avoid forced liquidations.`;
  }

  // Generic broker help
  return `## Broker Help\n` +
    `I can help with **account types**, **regulation checks**, **deposits/withdrawals**, **MT5 login issues**, **spreads/commission**, **leverage**, and **margin**.\n\n` +
    `Brokers I have detailed official info on: **${listBrokerNames().join(', ')}**.\n\n` +
    `Ask me something like *"Is IC Markets regulated?"*, *"Exness withdrawal delayed"*, or *"Raw vs Standard account?"*`;
}
