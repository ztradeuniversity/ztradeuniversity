// functions/utils/intent-engine.js
// ════════════════════════════════════════════════════════════════════════════
// ADVANCED INTENT ENGINE — language detection, multi-layer intent
// classification, conversation-context follow-up detection, and the country /
// timezone resolution layer. Pure detection: no response text lives here.
// ════════════════════════════════════════════════════════════════════════════

import { findBroker }   from './broker-data.js';
import { has }          from './response-engine.js';
import { extractFacts } from './memory-facts.js';

// ── LANGUAGE DETECTION (9 languages, no API) ─────────────────────────────────
export function detectLanguage(text) {
  const t = text || '';
  if (/[฀-๿]/.test(t)) return 'th';            // Thai
  if (/[ঀ-৿]/.test(t)) return 'bn';            // Bengali
  if (/[؀-ۿ]/.test(t)) {                        // Arabic script
    if (/[ٹڈڑںھہےگچپژ]/.test(t)) return 'ur';   // Urdu-specific letters
    return 'ar';
  }
  const lower = t.toLowerCase();
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t)) return 'vi';
  if (/\b(vàng|giá|thế nào|không|tôi|làm sao|mua|bán)\b/.test(lower)) return 'vi';
  const romanUrdu = ['kya','kia','kaise','kaisa','kaisay','hai','hain','mera','meri','mujhe','batao','btao','karun','karoon','kar','raha','rahi','nahi','nahin','kyun','kyon','acha','accha','theek','rate kya','gold ka','kab','chahiye','samajh','bata'];
  const ruHits = romanUrdu.filter(w => new RegExp(`\\b${w}\\b`).test(lower)).length;
  if (ruHits >= 2) return 'ur-roman';
  if (/\b(macam mana|boleh|tak nak|nak tahu|saya nak|kenapa emas)\b/.test(lower)) return 'ms';
  if (/\b(bagaimana|apakah|saya ingin|harga emas|kenapa|sekarang|bisa|tidak)\b/.test(lower)) return 'id';
  if (/\b(saya|emas|apa)\b/.test(lower) && /\b(harga|naik|turun|pasar)\b/.test(lower)) return 'id';
  return 'en';
}

// ── COUNTRY INTELLIGENCE & TIMEZONE LAYER ────────────────────────────────────
export const COUNTRY_TZ = {
  PK: { name: 'Pakistan',     tz: 'Asia/Karachi' },
  IN: { name: 'India',        tz: 'Asia/Kolkata' },
  BD: { name: 'Bangladesh',   tz: 'Asia/Dhaka' },
  ID: { name: 'Indonesia',    tz: 'Asia/Jakarta' },
  MY: { name: 'Malaysia',     tz: 'Asia/Kuala_Lumpur' },
  VN: { name: 'Vietnam',      tz: 'Asia/Ho_Chi_Minh' },
  TH: { name: 'Thailand',     tz: 'Asia/Bangkok' },
  AE: { name: 'UAE',          tz: 'Asia/Dubai' },
  SA: { name: 'Saudi Arabia', tz: 'Asia/Riyadh' },
  EG: { name: 'Egypt',        tz: 'Africa/Cairo' },
  GB: { name: 'UK',           tz: 'Europe/London' },
  US: { name: 'United States',tz: 'America/New_York' },
};

const LANG_COUNTRY = {
  'ur':       { code: 'PK', confidence: 'high' },
  'ur-roman': { code: 'PK', confidence: 'high' },
  'bn':       { code: 'BD', confidence: 'high' },
  'vi':       { code: 'VN', confidence: 'high' },
  'th':       { code: 'TH', confidence: 'high' },
  'id':       { code: 'ID', confidence: 'high' },
  'ms':       { code: 'MY', confidence: 'high' },
  'ar':       { code: 'AE', confidence: 'low'  },
  'en':       { code: null, confidence: 'low'  },
};

const COUNTRY_HINTS = [
  [/\b(pak|pakistan|pakistani|karachi|lahore|islamabad|pkt)\b/i, 'PK'],
  [/\b(india|indian|delhi|mumbai|kolkata|ist time)\b/i,         'IN'],
  [/\b(bangladesh|dhaka|bangladeshi)\b/i,                        'BD'],
  [/\b(indonesia|jakarta|indonesian|wib)\b/i,                    'ID'],
  [/\b(malaysia|malaysian|kuala lumpur|kl time)\b/i,             'MY'],
  [/\b(vietnam|vietnamese|hanoi|ho chi minh|saigon)\b/i,         'VN'],
  [/\b(thai|thailand|bangkok)\b/i,                               'TH'],
  [/\b(uae|dubai|emirates|abu dhabi)\b/i,                        'AE'],
  [/\b(saudi|riyadh|ksa|jeddah)\b/i,                             'SA'],
  [/\b(egypt|cairo|egyptian)\b/i,                                'EG'],
  [/\b(uk|u\.k\.|britain|british|london time|gmt)\b/i,           'GB'],
  [/\b(usa|u\.s\.a|united states|new york|est time|american)\b/i,'US'],
];

export function parseCountryFromText(text) {
  const s = (text || '').toLowerCase();
  for (const [re, code] of COUNTRY_HINTS) if (re.test(s)) return code;
  return null;
}

export function resolveGeo({ text, lang, bodyCountry, bodyTz, profileCountry }) {
  const fromText = parseCountryFromText(text);
  if (fromText && COUNTRY_TZ[fromText]) {
    return { code: fromText, name: COUNTRY_TZ[fromText].name, tz: bodyTz || COUNTRY_TZ[fromText].tz, confidence: 'high', source: 'message' };
  }
  const known = (bodyCountry || profileCountry || '').toUpperCase();
  if (known && COUNTRY_TZ[known]) {
    return { code: known, name: COUNTRY_TZ[known].name, tz: bodyTz || COUNTRY_TZ[known].tz, confidence: 'high', source: 'stored' };
  }
  const li = LANG_COUNTRY[lang] || LANG_COUNTRY.en;
  if (li.code && COUNTRY_TZ[li.code]) {
    return { code: li.code, name: COUNTRY_TZ[li.code].name, tz: bodyTz || COUNTRY_TZ[li.code].tz, confidence: li.confidence, source: 'language' };
  }
  if (bodyTz) return { code: null, name: null, tz: bodyTz, confidence: 'low', source: 'browser-tz' };
  return { code: null, name: null, tz: 'UTC', confidence: 'none', source: 'utc' };
}

// ── MULTI-LAYER INTENT CLASSIFICATION ────────────────────────────────────────
export function classifyIntent(text) {
  const s = (text || '').toLowerCase().trim();
  const broker = findBroker(s);

  // Greeting (only short greetings)
  if (/^(hi|hey|hello|salam|assalam|asalam|halo|hallo|xin chao|sawasdee|namaskar|kemusta|hai)\b/.test(s) && s.length < 24) {
    return { intent: 'greeting', broker: null };
  }

  // SET COUNTRY (Country Intelligence Layer)
  {
    const countryCode    = parseCountryFromText(s);
    const locationPhrase = has(s, ['i am from', "i'm from", 'im from', 'i trade from',
      'trading from', 'my country', 'i live in', 'i am in', 'im in', 'based in', 'country is']);
    const newsy = has(s, ['news', 'event', 'calendar', 'gold', 'btc', 'bitcoin', 'market',
      'price', 'rate', 'signal', 'trade', 'session']);
    const wordCount = s.split(/\s+/).filter(Boolean).length;
    if (countryCode && (locationPhrase || (wordCount <= 3 && !newsy))) {
      return { intent: 'setcountry', country: countryCode, broker: null };
    }
  }

  // SIGNAL REQUEST guardrail
  const askingSignal = has(s, [
    'should i buy', 'should i sell', 'buy or sell', 'sell or buy', 'give me a signal',
    'give signal', 'send signal', 'todays signal', "today's signal", 'today signal',
    'buy now', 'sell now', 'exact entry', 'entry price for', 'where to buy', 'where to enter',
    'long or short', 'tp and sl for', 'what should i trade', 'tell me to buy', 'tell me to sell',
    'kya khareedun', 'buy karun', 'sell karun', 'signal do', 'signal chahiye',
  ]);
  const reviewMarkers = has(s, [
    'review my trade', 'assess my trade', 'rate my trade', 'check my trade', 'my entry is',
    'i entered', 'my stop loss', 'my sl', 'my tp', 'my take profit', 'my setup', 'analyse my',
    'analyze my', 'evaluate my trade', 'trade idea', 'risk reward', 'risk to reward', 'r:r',
  ]);
  if (askingSignal && !reviewMarkers) return { intent: 'signal', broker };

  // Funding / Prop firm (Phase Next)
  if (has(s, ['prop firm', 'prop-firm', 'prop trading', 'funded account', 'funded challenge',
      'funding challenge', 'ftmo', 'the5ers', 'myfunded', 'evaluation phase', 'payout rule',
      'challenge account', 'prop account', 'funded trader', 'pass the challenge', 'drawdown rule'])) {
    return { intent: 'funding', broker };
  }

  // Broker module
  if (broker || has(s, ['broker', 'regulated', 'regulation', 'fca', 'cysec', 'asic', 'fsca',
      'deposit pending', 'withdrawal delay', 'withdraw', 'deposit', 'mt5 login', 'invalid account',
      'invalid server', 'account type', 'raw vs standard', 'standard vs', 'ecn account', 'cent account',
      'spread', 'commission', 'leverage', 'margin'])) {
    return { intent: 'broker', broker };
  }

  // Chart image intelligence (text triggers)
  if (has(s, ['analyze my chart', 'analyse my chart', 'read my chart', 'check my chart',
      'chart screenshot', 'my chart', 'detect pattern', 'what pattern', 'is this a double',
      'is this a head and shoulders', 'pattern on my chart', 'analyze this chart', 'upload chart'])) {
    return { intent: 'chart', broker };
  }

  // Platform help
  if (has(s, ['tradingview', 'trading view'])) return { intent: 'platform', platform: 'tradingview', broker };
  if (has(s, ['mt5', 'metatrader', 'meta trader', 'mt4'])) return { intent: 'platform', platform: 'mt5', broker };

  // ABOUT ME / MEMORY RECALL (Phase 8C) — surface what we remember about the user
  if (has(s, ['what do you know about me', 'what do you remember about me', 'tell me about me',
      'about me', 'do you remember me', 'remember me', 'what have i told you', 'who am i',
      'my profile', 'my info', 'my details', 'what do you know about my trading',
      'میرے بارے میں کیا جانتے', 'میرے بارے میں کیا جانتی', 'کیا تم مجھے یاد', 'کیا آپ مجھے یاد',
      'مجھے یاد رکھتے', 'میرا پروفائل', 'میرے بارے میں بتاؤ', 'میرے بارے میں بتائیں'])) {
    return { intent: 'aboutme', confidence: 'high', broker };
  }

  // PROFILE STATEMENT (Phase 8E) — the user is telling us about themselves
  // ("I only trade Gold", "I'm a beginner", "I scalp intraday"). Detect the
  // statement and acknowledge it, rather than dumping a market/education answer.
  {
    const facts       = extractFacts(s);
    const wordCount   = s.split(/\s+/).filter(Boolean).length;
    const isQuestion  = /\?|^(what|why|how|when|where|which|who|is|are|do|does|should|can|tell|explain|give)\b/.test(s);
    if (facts.length && wordCount <= 9 && !isQuestion) {
      return { intent: 'profileinfo', facts, confidence: 'high', broker: null };
    }
  }

  // Self-assessment (route to existing tool) — before trade-assessment
  if (has(s, ['self assessment', 'self-assessment', 'assess myself', 'what kind of trader am i',
      'what type of trader', 'trader profile', 'my trader level', "what's my level", 'evaluate myself'])) {
    return { intent: 'selfassess', confidence: 'high', broker };
  }

  // Trade assessment
  if (reviewMarkers || (has(s, ['entry', 'stop loss', 'take profit', 'sl', 'tp']) && /\d/.test(s))) {
    return { intent: 'assess', broker };
  }

  // Lot size / risk calculator
  if (has(s, ['lot size', 'position size', 'how many lots', 'risk per trade', 'calculate lot', 'lot calculation'])) {
    return { intent: 'lotsize', broker };
  }

  // Risk management (Phase Next) — conceptual, not the calculator
  if (has(s, ['risk management', 'manage risk', 'money management', 'how much should i risk',
      'how much to risk', 'risk control', 'daily loss limit', 'protect my capital'])) {
    return { intent: 'riskmgmt', broker };
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

  // Strategy (Phase Next)
  if (has(s, ['strategy', 'which strategy', 'best strategy', 'what strategy', 'trading strategy',
      'scalping strategy', 'swing strategy', 'trend following', 'which style', 'trading style', 'system that works'])) {
    return { intent: 'strategy', broker };
  }

  // Technical analysis (Phase Next)
  if (has(s, ['technical analysis', 'technical setup', 'price action', 'support and resistance',
      'support resistance', 'candlestick', 'chart structure', 'market structure', 'how to read charts'])) {
    return { intent: 'technical', broker };
  }

  // AI Daily Brief™
  if (has(s, ["today's market", 'todays market', 'today market', 'market today', 'daily brief',
      'market brief', 'morning brief', 'market overview', 'market summary', 'daily market',
      'how is the market', "how's the market", 'hows the market', "what's the market", 'brief me',
      'give me a brief', 'market update'])) {
    return { intent: 'brief', broker };
  }

  // Events + News
  const isNewsy = has(s, ['news', 'calendar', 'economic event', 'upcoming event', 'today event',
      'todays event', "today's event", 'market event', 'high impact', 'high-impact', 'data release',
      'jobs report', 'headlines', "what's happening", 'whats happening', 'upcoming news', 'news event'])
    || has(s, ['cpi', 'nfp', 'fomc', 'ppi', 'interest rate decision']);
  if (isNewsy) {
    let newsFocus = 'all';
    if (has(s, ['gold', 'xau']))                   newsFocus = 'gold';
    else if (has(s, ['btc', 'bitcoin', 'crypto'])) newsFocus = 'btc';
    return { intent: 'events', newsFocus, broker };
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

  // DOMAIN GUARDRAIL (Phase 8E) — clearly off-topic (non-trading) → polite redirect.
  // High-precision: requires an off-topic marker AND no trading vocabulary present.
  {
    const OFFTOPIC = ['weather', 'tell me a joke', 'a joke', 'recipe', 'how to cook', 'movie', 'a film', 'song', 'lyrics',
      'football', 'cricket match', 'horoscope', 'astrology', 'write code', 'python code', 'javascript', 'write an essay',
      'write a poem', 'my homework', 'capital of', 'who is the president', 'prime minister', 'dating', 'girlfriend', 'boyfriend',
      'translate this', 'distance between', 'who won the'];
    const TRADING = ['gold', 'xau', 'btc', 'bitcoin', 'crypto', 'forex', 'trade', 'trading', 'market', 'price', 'chart', 'broker',
      'pip', 'lot', 'risk', 'stop loss', 'entry', 'tp', 'sl', 'fed', 'dxy', 'yield', 'vix', 'session', 'signal', 'candle',
      'support', 'resistance', 'volatility', 'account', 'invest'];
    if (has(s, OFFTOPIC) && !has(s, TRADING)) {
      return { intent: 'offtopic', confidence: 'high', broker: null };
    }
  }

  return { intent: 'fallback', confidence: 'low', broker };
}

// ── CONVERSATION CONTEXT ENGINE — follow-up / language-switch detection ──────
const FOLLOWUP_LANGS = [
  [/\b(roman urdu)\b/,                                                   'ur-roman'],
  [/(اردو|urdu mein|urdu me\b|urdu m\b|in urdu|\burdu\b)/,               'ur'],
  [/(انگریزی|english please|in english|\benglish\b)/,                    'en'],
  [/(بالعربية|عربی|\barabic\b|in arabic)/,                               'ar'],
  [/(bahasa indonesia|\bindonesian\b|in indonesian)/,                    'id'],
  [/(bahasa melayu|\bmalay\b|in malay)/,                                 'ms'],
  [/(tiếng việt|\bvietnamese\b|in vietnamese)/,                          'vi'],
  [/(বাংলা|\bbengali\b|\bbangla\b|in bengali)/,                          'bn'],
  [/(ภาษาไทย|\bthai\b|in thai)/,                                         'th'],
];

export function classifyFollowup(text) {
  const s  = (text || '').toLowerCase().trim();
  const wc = s.split(/\s+/).filter(Boolean).length;
  if (!s) return null;

  if (wc <= 5) {
    for (const [re, code] of FOLLOWUP_LANGS) if (re.test(s)) return { mode: 'lang', lang: code };
  }
  if (/^(short|in short|short mein|short version|summarize|summary|tldr|tl;dr|briefly|be brief|mukhtasar|mukhtasr|chota karo)\b/.test(s)
      || (wc <= 4 && /\b(summarize|in short|short mein|mukhtasar)\b/.test(s)))
    return { mode: 'short' };
  if (wc <= 5 && /^(explain more|more detail|more details|elaborate|in detail|detailed|expand|go deeper|tafseel|aur batao|aur batayen|explain)\b/.test(s))
    return { mode: 'expand' };
  if (wc <= 3 && /^(why|why\?|why so|why is that|how come|reason|kyun|kyu|kiu)\b/.test(s))
    return { mode: 'why' };

  return null;
}
