// functions/utils/trade-rescue/case.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU TRADE RESCUE — THE TRADE CASE
//
// The structured record of ONE stuck/difficult trade. This is the state the
// whole Trade Rescue pipeline reasons over, and it is what makes this system a
// trade-management tool rather than a general chatbot: nothing is analysed
// until the case carries enough verified context to analyse.
//
// STATELESS BY DESIGN. The case travels in the request/response body and is
// held by the client for the life of the conversation. That is a deliberate
// architectural choice, not a shortcut:
//   · no new database table is required (see the task's "create only what the
//     architecture actually requires"),
//   · it cannot contaminate ai_chat_memory / ai_user_profiles or any other
//     existing memory system,
//   · a trader's open-position details are never persisted server-side.
// Every field is either supplied by the trader or left null. NOTHING here is
// ever inferred from the market, and no value is ever invented.
// ════════════════════════════════════════════════════════════════════════════

// ── INSTRUMENTS ─────────────────────────────────────────────────────────────
// `live` is the key inside /api/market's response, and it is the ONLY way this
// system can obtain a current price. VERIFIED against the live endpoint: that
// response carries exactly two instruments (gold, btc). Everything else is
// recognised for context but carries live:null, which the evidence layer
// reports honestly as "no verified live price" rather than guessing one.
export const INSTRUMENTS = [
  { id: 'XAU/USD', live: 'gold', aliases: ['gold', 'xau', 'xauusd', 'xau/usd', 'gld'], nonLatin: ['سونا', 'ذهب', 'گولڈ', 'سونے'] },
  { id: 'BTC/USD', live: 'btc',  aliases: ['btc', 'bitcoin', 'btcusd', 'btc/usd'], nonLatin: ['بٹ کوائن', 'بٹکوائن', 'بيتكوين'] },
  { id: 'EUR/USD', live: null,   aliases: ['eurusd', 'eur/usd', 'euro dollar', 'eu'] },
  { id: 'GBP/USD', live: null,   aliases: ['gbpusd', 'gbp/usd', 'cable', 'gu'] },
  { id: 'USD/JPY', live: null,   aliases: ['usdjpy', 'usd/jpy', 'uj'] },
  { id: 'XAG/USD', live: null,   aliases: ['silver', 'xag', 'xagusd', 'چاندی'] },
  { id: 'ETH/USD', live: null,   aliases: ['eth', 'ethereum', 'ethusd'] },
  { id: 'US30',    live: null,   aliases: ['us30', 'dow', 'dow jones'] },
  { id: 'NAS100',  live: null,   aliases: ['nas100', 'nasdaq', 'us100'] },
  { id: 'USOIL',   live: null,   aliases: ['oil', 'usoil', 'wti', 'crude'] },
];

export function emptyCase() {
  return {
    instrument: null,          // canonical id, e.g. 'XAU/USD'
    instrumentLive: null,      // 'gold' | 'btc' | null  (live-price availability)
    direction: null,           // 'buy' | 'sell'
    entry: null,               // number
    stop_loss: null,           // number
    has_stop_loss: null,       // true | false — false is a REAL, analysed answer
    take_profit: null,         // number
    position_size: null,       // free text (lots / % / "normal for me")
    open_time: null,           // free text as given by the trader
    holding_duration: null,    // free text, e.g. '3 days'
    timeframe_entry: null,     // 'M5' | 'M15' | 'H1' | 'H4' | 'D1' | 'W1' …
    timeframe_management: null,
    original_thesis: null,     // why they entered
    support_levels: [],        // TRADER-STATED only — never computed here
    resistance_levels: [],     // TRADER-STATED only
    trend_context: null,       // trader's own read of the trend
    user_experience: null,
    floating_state: null,      // 'profit' | 'loss' | 'breakeven'
    emotional_state: null,
    user_notes: [],
    asked: [],                 // field keys already asked — never ask twice
    turns: 0,
  };
}

export function mergeCase(base, patch) {
  const out = Object.assign(emptyCase(), base || {});
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) { out[k] = Array.from(new Set([...(out[k] || []), ...v])); continue; }
    out[k] = v;
  }
  return out;
}

// ── EXTRACTION ──────────────────────────────────────────────────────────────
// Pulls trade facts out of what the trader actually typed. Conservative on
// purpose: a value is only captured when the phrasing makes its meaning
// unambiguous. Anything uncertain stays null and gets asked about instead —
// a wrong assumption about an open position is far worse than one more question.
const NUM = '(-?\\d+(?:[.,]\\d+)?)';
const num = (s) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; };

export function extractFromText(text, current) {
  const raw = String(text || '');
  const t = raw.toLowerCase();
  const p = {};
  const cur = current || emptyCase();

  // Instrument.
  // Latin aliases are matched with boundaries so "gu" cannot fire inside a word.
  // Non-Latin names are matched as plain substrings, because JavaScript's \b is
  // ASCII-only and never fires next to Arabic/Urdu characters — the bug that
  // made "گولڈ" (gold) go unrecognised.
  if (!cur.instrument) {
    for (const ins of INSTRUMENTS) {
      const latin = ins.aliases.some(a =>
        new RegExp(`(^|[^a-z])${a.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(t));
      const nonLatin = (ins.nonLatin || []).some(a => raw.includes(a));
      if (latin || nonLatin) { p.instrument = ins.id; p.instrumentLive = ins.live; break; }
    }
  }

  // Direction — Latin with boundaries, non-Latin as substrings (same \b reason).
  if (!cur.direction) {
    // Includes the transliterated forms traders actually type ("بائی" = buy,
    // "سیل" = sell) alongside the native words — the exact phrasing that made
    // "میری گولڈ کی بائی ٹریڈ" fail direction extraction.
    const buyNL  = ['خرید', 'خریدا', 'شراء', 'لانگ', 'بائی', 'بای', 'لونگ'];
    const sellNL = ['فروخت', 'بیچ', 'بيع', 'شارٹ', 'سیل', 'سيل'];
    if (/\b(buy|long|bought|buying)\b/i.test(t) || buyNL.some(w => raw.includes(w))) p.direction = 'buy';
    else if (/\b(sell|short|sold|selling|shorted)\b/i.test(t) || sellNL.some(w => raw.includes(w))) p.direction = 'sell';
  }

  // Explicit "no stop loss" — a first-class answer, not a missing field.
  if (/\b(no|without|nahi|nahin|koi nahi|بغیر|نہیں)\b[^.]{0,24}\b(sl|stop ?loss|stop)\b/i.test(t)
      || /\b(sl|stop ?loss)\b[^.]{0,16}\b(nahi|nahin|none|not set|نہیں)\b/i.test(t)) {
    p.has_stop_loss = false; p.stop_loss = null;
  }

  // Labelled numbers. Only captured with an explicit label so a bare number in
  // prose can never be mistaken for an entry or a stop.
  const grab = (labels, key) => {
    const re = new RegExp(`\\b(?:${labels})\\b\\s*(?:price|level|at|@|=|:|is|was|par|pe)?\\s*${NUM}`, 'i');
    const m = raw.match(re);
    if (m) { const v = num(m[1]); if (v !== null) p[key] = v; }
  };
  if (!cur.entry)       grab('entry|entered|bought at|sold at|open(?:ed)? at|buy at|sell at', 'entry');
  if (!cur.stop_loss && p.has_stop_loss !== false) grab('sl|stop ?loss|stop', 'stop_loss');
  if (!cur.take_profit) grab('tp|take ?profit|target', 'take_profit');
  if (p.stop_loss != null) p.has_stop_loss = true;

  // Trader-stated levels — recorded as THEIR view, never as verified levels.
  const sup = raw.match(new RegExp(`\\bsupport\\b\\s*(?:at|@|is|around|near|:)?\\s*${NUM}`, 'i'));
  if (sup && num(sup[1]) !== null) p.support_levels = [num(sup[1])];
  const res = raw.match(new RegExp(`\\bresistance\\b\\s*(?:at|@|is|around|near|:)?\\s*${NUM}`, 'i'));
  if (res && num(res[1]) !== null) p.resistance_levels = [num(res[1])];

  // Timeframes
  if (!cur.timeframe_entry) {
    const tf = raw.match(/\b(m1|m5|m15|m30|h1|h4|d1|w1|mn|1m|5m|15m|30m|1h|4h|daily|weekly|monthly)\b/i);
    if (tf) p.timeframe_entry = normalizeTf(tf[1]);
  }

  // Holding duration — digits ("3 days") and written numbers ("three days ago"),
  // because traders write both and only matching digits silently loses half.
  if (!cur.holding_duration) {
    const WORDNUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, a:1, an:1, couple:2, few:3 };
    const d = raw.match(new RegExp(`\\b(\\d+|${Object.keys(WORDNUM).join('|')})\\s*(minute|min|hour|hr|day|week|month)s?\\b`, 'i'));
    if (d) {
      const n = /^\d+$/.test(d[1]) ? Number(d[1]) : WORDNUM[d[1].toLowerCase()];
      if (n) p.holding_duration = `${n} ${d[2].toLowerCase()}${n > 1 ? 's' : ''}`;
    }
  }

  // Original thesis — captured from the trader's own "because …" / "I thought …"
  // clause. Stored verbatim; never paraphrased, since the analysis quotes it back.
  if (!cur.original_thesis) {
    const th = raw.match(/\b(?:because|since|as|reason was|i (?:thought|expected|believed|saw))\b\s+(.{8,200}?)(?:[.!?]|$)/i);
    if (th) p.original_thesis = th[1].trim();
  }

  // Position size context — the trader's own characterisation, not a number.
  if (!cur.position_size) {
    if (/\b(normal|usual|standard|regular)\s+(size|lot|position)|\bnormal size\b|\bsize is normal\b/i.test(t)) p.position_size = 'normal for this account (per trader)';
    else if (/\b(larger|bigger|heavy|heavier|over-?sized|too big|zyada|بڑ)\b[^.]{0,20}\b(size|lot|position|than usual)?\b/i.test(t)) p.position_size = 'larger than usual (per trader)';
    else {
      const lots = raw.match(/\b(\d+(?:\.\d+)?)\s*(lot|lots)\b/i);
      if (lots) p.position_size = `${lots[1]} lots`;
    }
  }

  // Stated experience with the instrument.
  if (!cur.user_experience) {
    const ex = raw.match(/\b(?:trading|traded|been trading)\b[^.]{0,40}?\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(year|month)s?\b/i);
    if (ex) p.user_experience = `${ex[1]} ${ex[2]}s (per trader)`;
    else if (/\b(beginner|new to|just started|naya)\b/i.test(t)) p.user_experience = 'beginner (per trader)';
  }

  // Floating state.
  // The stop-loss vocabulary is stripped FIRST: "no stop loss" and "take profit"
  // both contain the words this looks for, and mis-reading them would put the
  // trade on the wrong side of every downstream judgement.
  if (!cur.floating_state) {
    const fl = t
      .replace(/\b(stop ?loss|stoploss|sl)\b/gi, ' ')
      .replace(/\b(take ?profit|takeprofit|tp)\b/gi, ' ');
    const lossNL = ['نقصان', 'منفی', 'خسارة'];
    const profNL = ['منافع', 'نفع', 'ربح'];
    if (/\b(in (a )?loss|losing|drawdown|underwater|negative)\b/i.test(fl) || lossNL.some(w => raw.includes(w))) p.floating_state = 'loss';
    else if (/\b(in (a )?profit|winning|positive|green)\b/i.test(fl) || profNL.some(w => raw.includes(w))) p.floating_state = 'profit';
    else if (/\b(breakeven|break even)\b/i.test(fl)) p.floating_state = 'breakeven';
  }

  // Emotional pressure — only when the trader says it themselves.
  const emoNL = ['پریشان', 'ڈر', 'امید', 'قلق'];
  if (/\b(worried|scared|panic|stress|anxious|afraid|frustrat|angry|hope|hoping)\b/i.test(t) || emoNL.some(w => raw.includes(w))) {
    p.emotional_state = 'pressure_expressed';
  }

  // Non-Latin natural speech. Everything above is written for Latin phrasing
  // with \b boundaries and English labels, so a fluent Urdu/Arabic sentence —
  // exactly what voice input produces — yielded almost nothing. Verified against
  // the real sentence "میری گولڈ کی بائی تین دن سے پھنسی ہوئی ہے، میں نے 4380 پہ
  // انٹری لی تھی، اسٹاپ لاس بھی نہیں لگایا": before this layer only instrument
  // and direction were captured.
  Object.assign(p, extractNonLatin(raw, cur, p));

  if (raw.trim().length > 3) p.user_notes = [raw.trim().slice(0, 400)];
  return p;
}

// Written number words traders actually speak, Urdu and Arabic.
const NL_NUMWORD = {
  'ایک': 1, 'دو': 2, 'تین': 3, 'چار': 4, 'پانچ': 5, 'چھ': 6, 'سات': 7, 'آٹھ': 8, 'نو': 9, 'دس': 10,
  'واحد': 1, 'اثنين': 2, 'يومين': 2, 'ثلاثة': 3, 'ثلاث': 3, 'أربعة': 4, 'خمسة': 5, 'ستة': 6, 'سبعة': 7,
};
const NL_UNIT = [
  { re: /(?:منٹ|دقيقة|دقائق)/, unit: 'minute' },
  { re: /(?:گھنٹ|ساعة|ساعات)/, unit: 'hour' },
  { re: /(?:دن|روز|يوم|أيام)/,  unit: 'day' },
  { re: /(?:ہفت|أسبوع|أسابيع)/, unit: 'week' },
  { re: /(?:مہین|شهر|أشهر)/,    unit: 'month' },
];

export function extractNonLatin(raw, cur, already) {
  const p = {};
  const s = String(raw || '');
  if (!/[؀-ۿ]/.test(s)) return p;   // no Arabic-script content — nothing to do
  const have = (k) => (already && already[k] != null) || (cur && cur[k] != null && cur[k] !== '');

  // ENTRY — "4380 پہ انٹری لی" / "انٹری 4380" / "سعر الدخول 4380"
  if (!have('entry')) {
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:پہ|پر|پے|عند|على)?\s*(?:انٹری|اینٹری|entry|دخول)/i)
           || s.match(/(?:انٹری|اینٹری|entry|دخول|سعر الدخول)\s*(?:پہ|پر|عند|:|=)?\s*(\d+(?:[.,]\d+)?)/i);
    if (m) { const v = parseFloat(m[1].replace(',', '.')); if (Number.isFinite(v)) p.entry = v; }
  }

  // STOP LOSS — negation ("نہیں لگایا" / "بدون") vs a stated level.
  if (!have('has_stop_loss') && (cur ? cur.has_stop_loss == null : true)) {
    const slWord = /(?:اسٹاپ\s*لاس|سٹاپ\s*لاس|stop\s*loss|وقف\s*(?:الخسارة|خسارة))/i;
    if (slWord.test(s)) {
      const negated = /(?:نہیں|نہ|بغیر|بدون|ما\s*(?:وضعت|في)|لا\s*يوجد)/.test(s);
      const lvl = s.match(new RegExp(`${slWord.source}\\s*(?:پہ|پر|عند|:|=)?\\s*(\\d+(?:[.,]\\d+)?)`, 'i'));
      if (lvl) { const v = parseFloat(lvl[1].replace(',', '.')); if (Number.isFinite(v)) { p.stop_loss = v; p.has_stop_loss = true; } }
      else if (negated) p.has_stop_loss = false;
    }
  }

  // TAKE PROFIT
  if (!have('take_profit')) {
    const m = s.match(/(?:ٹی\s*پی|take\s*profit|ٹارگٹ|هدف|جني\s*الأرباح)\s*(?:پہ|پر|عند|:|=)?\s*(\d+(?:[.,]\d+)?)/i);
    if (m) { const v = parseFloat(m[1].replace(',', '.')); if (Number.isFinite(v)) p.take_profit = v; }
  }

  // HOLDING DURATION — "تین دن سے" / "منذ ثلاثة أيام"
  if (!have('holding_duration')) {
    for (const u of NL_UNIT) {
      const digit = s.match(new RegExp(`(\\d+)\\s*${u.re.source}`));
      if (digit) { const n = Number(digit[1]); p.holding_duration = `${n} ${u.unit}${n > 1 ? 's' : ''}`; break; }
      const words = Object.keys(NL_NUMWORD).join('|');
      const word = s.match(new RegExp(`(${words})\\s*${u.re.source}`));
      if (word) { const n = NL_NUMWORD[word[1]]; if (n) { p.holding_duration = `${n} ${u.unit}${n > 1 ? 's' : ''}`; break; } }
    }
  }

  // LOT SIZE — "0.10 لاٹ"
  if (!have('position_size')) {
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:لاٹ|لوٹ|lot|عقد)/i);
    if (m) p.position_size = `${m[1].replace(',', '.')} lots`;
  }

  // UNCERTAINTY / PRESSURE — recorded ONLY as "the trader expressed this", never
  // as a diagnosis of how they actually feel.
  if (/(?:سمجھ\s*نہیں|پتا\s*نہیں|کنفیوز|الجھن|حیران|پریشان|ڈر|امید|محتار|لا\s*أعرف|قلق|خائف)/.test(s)) {
    p.emotional_state = 'pressure_expressed';
  }

  return p;
}

export function normalizeTf(s) {
  const v = String(s || '').toLowerCase();
  const map = { '1m': 'M1', 'm1': 'M1', '5m': 'M5', 'm5': 'M5', '15m': 'M15', 'm15': 'M15',
    '30m': 'M30', 'm30': 'M30', '1h': 'H1', 'h1': 'H1', '4h': 'H4', 'h4': 'H4',
    'daily': 'D1', 'd1': 'D1', 'weekly': 'W1', 'w1': 'W1', 'monthly': 'MN', 'mn': 'MN' };
  return map[v] || v.toUpperCase();
}

// ── QUESTION ENGINE ─────────────────────────────────────────────────────────
// Progressive diagnosis. Ordered by how much each answer actually changes the
// analysis, so the trader is never interrogated. `required` fields gate the
// analysis; the rest are asked only while there is room in the turn budget.
// A field is never asked twice (see `asked`).
// Each question carries its own translations. Trading terms (Stop Loss, Take
// Profit, Support, Resistance, Buy/Sell, timeframe codes) stay in English in
// every language — that is how traders actually read their own platforms, and
// translating them would reduce clarity rather than improve it.
export const QUESTIONS = [
  { key: 'instrument',       required: true,
    q:  'Which instrument is the trade on — for example Gold (XAU/USD), BTC/USD, or a currency pair?',
    ur: 'یہ ٹریڈ کس instrument پر ہے؟ مثلاً Gold (XAU/USD)، BTC/USD، یا کوئی currency pair؟',
    ar: 'ما هي الأداة التي تتداولها؟ مثلاً Gold (XAU/USD) أو BTC/USD أو زوج عملات؟' },
  { key: 'direction',        required: true,
    q:  'Is it a **Buy** (long) or a **Sell** (short)?',
    ur: 'یہ **Buy** (long) ہے یا **Sell** (short)؟',
    ar: 'هل هي **Buy** (شراء) أم **Sell** (بيع)؟' },
  { key: 'entry',            required: true,
    q:  'What price did you enter at?',
    ur: 'آپ کا entry price کیا تھا؟',
    ar: 'ما هو سعر الدخول (Entry) الخاص بك؟' },
  { key: 'has_stop_loss',    required: true,
    q:  'Do you have a **Stop Loss** on this trade? If yes, at what price — if not, just say "no SL".',
    ur: 'کیا اس ٹریڈ پر **Stop Loss** لگا ہوا ہے؟ اگر ہاں تو کس price پر — اگر نہیں تو صرف "no SL" لکھ دیں۔',
    ar: 'هل لديك **Stop Loss** على هذه الصفقة؟ إذا نعم فعند أي سعر — وإذا لا فاكتب "no SL".' },
  { key: 'take_profit',      required: false,
    q:  'Do you have a **Take Profit** target set? If yes, at what price?',
    ur: 'کیا کوئی **Take Profit** target مقرر ہے؟ اگر ہاں تو کس price پر؟',
    ar: 'هل حددت هدف **Take Profit**؟ إذا نعم فعند أي سعر؟' },
  { key: 'timeframe_entry',  required: false,
    q:  'Which timeframe did you take the entry on (M15, H1, H4, D1…)?',
    ur: 'آپ نے entry کس timeframe پر لی تھی (M15، H1، H4، D1…)؟',
    ar: 'على أي timeframe دخلت الصفقة (M15، H1، H4، D1…)؟' },
  { key: 'original_thesis',  required: false,
    q:  'What was your original reason for entering this trade?',
    ur: 'اس ٹریڈ میں داخل ہونے کی اصل وجہ کیا تھی؟',
    ar: 'ما هو السبب الأصلي لدخولك هذه الصفقة؟' },
  { key: 'holding_duration', required: false,
    q:  'How long have you been holding it?',
    ur: 'آپ اسے کتنے عرصے سے hold کیے ہوئے ہیں؟',
    ar: 'منذ متى وأنت تحتفظ بهذه الصفقة؟' },
  { key: 'position_size',    required: false,
    q:  'Is this a normal position size for your account, or larger than usual?',
    ur: 'کیا یہ آپ کے account کے لیے normal position size ہے یا معمول سے بڑی؟',
    ar: 'هل حجم المركز طبيعي بالنسبة لحسابك أم أكبر من المعتاد؟' },
  { key: 'support_levels',   required: false,
    q:  'Where do you see the nearest **Support** for this instrument?',
    ur: 'آپ کے خیال میں قریب ترین **Support** کہاں ہے؟',
    ar: 'أين ترى أقرب **Support** لهذه الأداة؟' },
  { key: 'resistance_levels',required: false,
    q:  'And the nearest **Resistance**?',
    ar: 'وأين أقرب **Resistance**؟',
    ur: 'اور قریب ترین **Resistance** کہاں ہے؟' },
  { key: 'trend_context',    required: false,
    q:  'On your higher timeframe, is the market trending up, down, or ranging?',
    ur: 'آپ کے higher timeframe پر market اوپر جا رہی ہے، نیچے، یا range میں ہے؟',
    ar: 'على الإطار الزمني الأعلى، هل السوق صاعد أم هابط أم في نطاق عرضي؟' },
];

// Question text in the trader's language, falling back to English for any
// language this build does not carry translations for.
export function questionText(q, lang) {
  const l = String(lang || 'en').slice(0, 2).toLowerCase();
  return q[l] || q.q;
}

function isFilled(c, key) {
  const v = c[key];
  if (key === 'has_stop_loss') return v === true || v === false;
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== undefined && v !== '';
}

export function missingRequired(c) {
  return QUESTIONS.filter(q => q.required && !isFilled(c, q.key)).map(q => q.key);
}

// Up to `max` questions for this turn — never repeats, never asks what is known.
export function nextQuestions(c, max = 2) {
  const out = [];
  for (const q of QUESTIONS) {
    if (out.length >= max) break;
    if (isFilled(c, q.key)) continue;
    if ((c.asked || []).includes(q.key)) continue;
    out.push(q);
  }
  return out;
}

// Analysis runs once every REQUIRED field is answered AND the single most
// diagnostic optional question — why the trade was entered — has been put to the
// trader at least once. Without that, "hold" and "hope" are indistinguishable and
// the behaviour layer has nothing to judge, so jumping straight to analysis the
// moment entry+SL are known produced a materially thinner read.
// It only has to have been ASKED, never answered — a trader who ignores it still
// gets their analysis on the next turn.
export function readyForAnalysis(c) {
  const stalled = (c.turns || 0) >= 4;
  if (stalled) return true;
  if (missingRequired(c).length > 0) {
    const unaskedRequired = missingRequired(c).filter(k => !(c.asked || []).includes(k));
    return unaskedRequired.length === 0 && (c.turns || 0) >= 3;
  }
  const thesisKnown = !!c.original_thesis;
  const thesisAsked = (c.asked || []).includes('original_thesis');
  return thesisKnown || thesisAsked;
}

export function caseSummary(c) {
  const L = [];
  if (c.instrument) L.push(`${c.instrument}${c.direction ? ' — ' + c.direction.toUpperCase() : ''}`);
  if (c.entry != null) L.push(`entry ${c.entry}`);
  if (c.has_stop_loss === false) L.push('NO stop loss');
  else if (c.stop_loss != null) L.push(`SL ${c.stop_loss}`);
  if (c.take_profit != null) L.push(`TP ${c.take_profit}`);
  if (c.timeframe_entry) L.push(`entry TF ${c.timeframe_entry}`);
  if (c.holding_duration) L.push(`held ${c.holding_duration}`);
  if (c.floating_state) L.push(`currently in ${c.floating_state}`);
  return L.join(' · ');
}
