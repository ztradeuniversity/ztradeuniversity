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
    reported_move: null,       // trader's own "~40 points against me" — never converted
    account_context: null,     // trader's own account/balance remark, verbatim
    asked: [],                 // field keys already asked — never ask twice
    unavailable: [],           // field keys the trader said they cannot supply
    last_asked: null,          // what the previous turn asked, so "I don't know" has a referent
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

  // Direction — WHOSE buy/sell is this?
  //
  // A trader describing a stuck position almost always describes the market in
  // the same breath: "میں نے سیل لگا دی تھی اور مارکیٹ اس کے بعد بائی ہوتی جا رہی
  // ہے" — I placed a SELL, and the market has been going UP since. The previous
  // implementation tested bare word presence with buy first, so "بائی" (the
  // market's movement) won and the case was recorded as a BUY. Every downstream
  // judgement then ran against the wrong side of the trade.
  //
  // So: look for a direction word ATTACHED TO A POSITION VERB first (I placed /
  // took / opened / sold). Only if that finds nothing fall back to bare
  // presence — and then only when exactly one side is mentioned. When both
  // appear with no verb to disambiguate, leave it null and ask; a guessed
  // direction is far worse than one more question.
  if (!cur.direction) {
    const buyNL  = ['خرید', 'خریدا', 'شراء', 'اشتريت', 'لانگ', 'بائی', 'بای', 'لونگ'];
    const sellNL = ['فروخت', 'بیچ', 'بيع', 'بعت', 'شارٹ', 'سیل', 'سيل'];
    // Urdu/Arabic: <direction word> … <verb of taking a position>, within a few words.
    const POS_VERB = '(?:لگا|لگائی|لگادی|لی|لیا|کی|کر\\s*(?:دی|لی)|کھول|فتحت|دخلت|وضعت)';
    const nlPositional = (words) =>
      words.some(w => new RegExp(`${w}[^۔.!?]{0,18}?${POS_VERB}`).test(raw)
                   || new RegExp(`${POS_VERB}[^۔.!?]{0,10}?${w}`).test(raw));
    // English: an explicit statement of the trader's own position.
    const enBuy  = /\b(i (?:bought|am long|went long)|my (?:buy|long)|(?:buy|long) (?:entry|position|trade)|opened a (?:buy|long))\b/i;
    const enSell = /\b(i (?:sold|am short|went short)|my (?:sell|short)|(?:sell|short) (?:entry|position|trade)|opened a (?:sell|short))\b/i;

    const posBuy  = enBuy.test(t)  || nlPositional(buyNL);
    const posSell = enSell.test(t) || nlPositional(sellNL);
    if (posBuy !== posSell) p.direction = posBuy ? 'buy' : 'sell';
    else if (!posBuy) {
      const bareBuy  = /\b(buy|long|bought|buying)\b/i.test(t) || buyNL.some(w => raw.includes(w));
      const bareSell = /\b(sell|short|sold|selling|shorted)\b/i.test(t) || sellNL.some(w => raw.includes(w));
      if (bareBuy !== bareSell) p.direction = bareBuy ? 'buy' : 'sell';
      // both or neither → ambiguous, stays null and gets asked
    }
  }

  // Explicit "no stop loss" — a first-class answer, not a missing field.
  if (/\b(no|without|nahi|nahin|koi nahi|بغیر|نہیں)\b[^.]{0,24}\b(sl|stop ?loss|stop)\b/i.test(t)
      || /\b(sl|stop ?loss)\b[^.]{0,16}\b(nahi|nahin|none|not set)\b/i.test(t)
      || /\b(sl|stop ?loss|stop)\b[^.۔]{0,16}(?:نہیں|نہ لگایا|بغیر)/i.test(raw)) {
    p.has_stop_loss = false; p.stop_loss = null;
  }

  // Labelled numbers. Only captured with an explicit label so a bare number in
  // prose can never be mistaken for an entry or a stop.
  const grab = (labels, key) => {
    const re = new RegExp(`\\b(?:${labels})\\b\\s*(?:price|level|at|@|=|:|is|was|par|pe)?\\s*${NUM}`, 'i');
    const m = raw.match(re);
    if (m) { const v = num(m[1]); if (v !== null) p[key] = v; }
  };
  if (!cur.entry)       grab('entry|entered|(?:bought|sold|buy|sell|open(?:ed)?|short(?:ed)?|long(?:ed)?)(?:\\s+\\w+){0,2}\\s+(?:at|from)', 'entry');
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
  // Matched in English, Roman Urdu and (below, in extractNonLatin) Urdu/Arabic:
  // "why did you enter?" is the question that separates a plan from hope, and
  // an English-only pattern silently lost the answer from most of the audience.
  if (!cur.original_thesis) {
    const th = raw.match(/\b(?:because|since|as|reason was|i (?:thought|expected|believed|saw))\b\s+(.{8,200}?)(?:[.!?]|$)/i)
            || raw.match(/\b(?:kyunki|kyunke|kyun ?ke|isliye|is ?liye|mujhe laga|maine socha|socha (?:tha|ke))\b\s+(.{8,200}?)(?:[.!?]|$)/i);
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
    // Transliterations matter more than the formal words here: traders say
    // "لوس ہو چکا ہے", not "نقصان ہو چکا ہے". Missing 'لوس' is why the reported
    // message's clearest fact — that the position is well underwater — was lost.
    const lossNL = ['نقصان', 'منفی', 'خسارة', 'لوس', 'لاس', 'خسارہ', 'ڈوب', 'مائنس'];
    const profNL = ['منافع', 'نفع', 'ربح', 'پرافٹ', 'فائدہ', 'فایدہ'];
    if (/\b(in (a )?loss|losing|drawdown|underwater|negative)\b/i.test(fl) || lossNL.some(w => raw.includes(w))) p.floating_state = 'loss';
    else if (/\b(in (a )?profit|winning|positive|green)\b/i.test(fl) || profNL.some(w => raw.includes(w))) p.floating_state = 'profit';
    else if (/\b(breakeven|break even)\b/i.test(fl)) p.floating_state = 'breakeven';
  }

  // Roman-Urdu entry — "4380 se lagi thi" / "4380 pe li thi" / "4380 par khareeda".
  // The Urdu-script patterns need an Urdu verb; Roman Urdu writes the verb in
  // Latin, so the same sentence typed phonetically lost its entry. A position
  // verb is required, so "3 days se stuck" cannot be read as an entry.
  if (!cur.entry && p.entry == null) {
    const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:se|pe|pr|par|py)\s+(?:\S+\s+){0,2}?(?:lagi|laga|lagai|li|liya|khareed\w*|becha|bechi|entry|buy|sell)\b/i);
    if (m) { const v = num(m[1]); if (v !== null) p.entry = v; }
  }

  // Trader-reported movement — "about 40 points against me". Preserved as THEIR
  // report, never converted into a price or a P/L: a "point" depends on the
  // broker's convention and on what it is measured from, neither of which is
  // verifiable here.
  if (!cur.reported_move) {
    const mv = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:points?|pips?|pts?)\b/i);
    if (mv) p.reported_move = `${mv[1]} points (trader-reported)`;
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

  // ENTRY — "4380 پہ انٹری لی" / "انٹری 4380" / "سعر الدخول 4380", and also the
  // way people actually speak it, where the verb carries the meaning and the
  // word "entry" never appears at all: "میں نے 4380 پر لی تھی" / "اشتريت عند 4380".
  // The verb is REQUIRED in that third form so a bare number elsewhere in the
  // sentence (a support level, a target) can never be mistaken for the entry.
  if (!have('entry')) {
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:پہ|پر|پے|عند|على)?\s*(?:انٹری|اینٹری|entry|دخول)/i)
           || s.match(/(?:انٹری|اینٹری|entry|دخول|سعر الدخول)\s*(?:پہ|پر|عند|:|=)?\s*(\d+(?:[.,]\d+)?)/i)
           || s.match(/(\d+(?:[.,]\d+)?)\s*(?:پہ|پر|پے|سے)\s*(?:\S+\s+){0,2}?(?:لی|لیا|لگی|لگا|لگے|لگائی|خریدی|خریدا|بیچی|بیچا)/)
           || s.match(/(?:اشتريت|بعت|دخلت)\s*(?:\S+\s+){0,2}?(?:عند|من|على)?\s*(\d+(?:[.,]\d+)?)/);
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

  // ORIGINAL THESIS — "کیونکہ …" / "میں نے سوچا …" / "لأن …" / "اعتقدت …".
  // Stored verbatim in the trader's own words, exactly like the English path.
  if (!have('original_thesis')) {
    const m = s.match(/(?:کیونکہ|کیوں\s*کہ|اس\s*لیے\s*کہ|میں\s*نے\s*سوچا|مجھے\s*لگا|لگ\s*رہا\s*تھا)\s*(?:کہ)?\s*(.{6,200}?)(?:[۔.!?\n]|$)/)
           || s.match(/(?:لأن(?:ني|ه)?|بسبب|اعتقدت|ظننت|توقعت)\s*(.{6,200}?)(?:[.!?\n]|$)/);
    if (m && m[1] && m[1].trim().length >= 6) p.original_thesis = m[1].trim();
  }

  // UNCERTAINTY / PRESSURE — recorded ONLY as "the trader expressed this", never
  // as a diagnosis of how they actually feel.
  if (/(?:سمجھ\s*نہیں|پتا\s*نہیں|کنفیوز|الجھن|حیران|پریشان|ڈر|امید|محتار|لا\s*أعرف|قلق|خائف)/.test(s)
      || /(?:کیا\s*کروں|کیا\s*کرنا\s*چاہی?[ےئ]|ماذا\s*أفعل|ما\s*العمل)/.test(s)) {
    p.emotional_state = 'pressure_expressed';
  }

  // TRADER-REPORTED MOVEMENT — "تقریباً 40 points خلاف" / "40 پوائنٹ نیچے".
  // Kept as the trader's own words. It is NOT converted into a price or a P/L:
  // "40 points" depends on a broker's point convention and on what it is measured
  // from, none of which is verifiable here.
  if (!have('reported_move')) {
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:points?|پوائنٹس?|پپس?|pips?|نقطة|نقاط)[^۔.!?]{0,24}?(?:خلاف|نیچے|اوپر|against|ضد|down|up)?/i);
    if (m) p.reported_move = `${m[1]} points (trader-reported)`;
  }

  // ACCOUNT CONTEXT — "میرے پاس ٹوٹل ایک ہزار ڈالر ہے". Verbatim, unverified.
  // A tight window: the amount plus at most three preceding words. Voice
  // transcripts arrive with no sentence punctuation, so a wide window simply
  // swallows the surrounding clause and starts mid-word.
  if (!have('account_context')) {
    const m = s.match(/((?:\S+\s+){0,3}(?:\d[\d,.]*|ایک|دو|تین|چار|پانچ|دس|سو|ہزار)(?:\s*ہزار)?\s*(?:ڈالر|دولار))/);
    if (m && /(?:ٹوٹل|کل|اکاؤنٹ|بیلنس|حساب|رصيد|إجمالي|پاس)/.test(m[1])) {
      p.account_context = m[1].trim().slice(0, 60) + ' (trader-reported)';
    }
  }

  return p;
}

// ── "I DON'T KNOW" ──────────────────────────────────────────────────────────
// A trader who cannot remember their entry is giving a real answer. Before this
// the field simply stayed null, so the case could only leave the question loop
// by exhausting its turn budget — and the analysis then reasoned as though the
// value were merely absent rather than genuinely unobtainable.
const UNKNOWN_RE = new RegExp([
  "\\b(i )?(don'?t|do not|dont) (know|remember|recall)\\b",
  '\\b(no idea|not sure|unsure|cant remember|can\'t remember|forgot|unknown|n/?a)\\b',
  '\\b(pata nahi|pta nahi|yaad nahi|nahi pata|maloom nahi)\\b',
  '(?:یاد\\s*نہیں|پتا?\\s*نہیں|معلوم\\s*نہیں|نہیں\\s*پتا)',
  '(?:لا\\s*أعرف|لا\\s*أتذكر|غير\\s*متأكد)',
].join('|'), 'i');

export function isUnknownAnswer(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 120) return false;   // a long message is context, not a shrug
  return UNKNOWN_RE.test(t);
}

export function markUnavailable(c, key) {
  if (!key) return c;
  c.unavailable = Array.from(new Set([...(c.unavailable || []), key]));
  return c;
}

export function isUnavailable(c, key) {
  return (c && Array.isArray(c.unavailable) && c.unavailable.includes(key)) || false;
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
  { key: 'holding_duration', required: false,
    q:  'How long have you been holding it?',
    ur: 'آپ اسے کتنے عرصے سے hold کیے ہوئے ہیں؟',
    ar: 'منذ متى وأنت تحتفظ بهذه الصفقة؟' },
  { key: 'original_thesis',  required: false,
    q:  'What made you take this trade in the first place?',
    ur: 'آپ نے یہ ٹریڈ اصل میں کس وجہ سے لی تھی؟',
    ar: 'ما الذي دفعك لدخول هذه الصفقة في الأساس؟' },
  { key: 'take_profit',      required: false,
    q:  'Do you have a **Take Profit** target set? If yes, at what price?',
    ur: 'کیا کوئی **Take Profit** target مقرر ہے؟ اگر ہاں تو کس price پر؟',
    ar: 'هل حددت هدف **Take Profit**؟ إذا نعم فعند أي سعر؟' },
  { key: 'timeframe_entry',  required: false,
    q:  'Which timeframe did you take the entry on (M15, H1, H4, D1…)?',
    ur: 'آپ نے entry کس timeframe پر لی تھی (M15، H1، H4، D1…)؟',
    ar: 'على أي timeframe دخلت الصفقة (M15، H1، H4، D1…)؟' },
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
  // A field the trader has told us they cannot supply is ANSWERED, not missing.
  // This is what stops the same question coming back around.
  if (isUnavailable(c, key)) return true;
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
// Analysis begins when there is enough to say something USEFUL — not when the
// case is complete. Waiting for a perfect case is what turned a trader who had
// already explained their situation into someone answering a form.
//
// Only instrument and direction are genuinely load-bearing: without them there
// is no position to reason about. Entry and Stop Loss materially improve the
// read, so they are still asked — but "known OR unavailable OR already asked"
// is enough to move on, and the report then states plainly what it could not
// verify. Three turns is a hard ceiling regardless.
export function readyForAnalysis(c) {
  if ((c.turns || 0) >= 3) return true;
  if (!isFilled(c, 'instrument') || !isFilled(c, 'direction')) return false;

  const settled = (k) => isFilled(c, k) || (c.asked || []).includes(k);
  if (!settled('entry') || !settled('has_stop_loss')) return false;

  return !!c.original_thesis || (c.asked || []).includes('original_thesis');
}

export function caseSummary(c) {
  const L = [];
  if (c.instrument) L.push(`${c.instrument}${c.direction ? ' — ' + c.direction.toUpperCase() : ''}`);
  else if (c.direction) L.push(c.direction.toUpperCase());
  if (c.entry != null) L.push(`entry ${c.entry}`);
  else if (isUnavailable(c, 'entry')) L.push('entry not available');
  if (c.reported_move) L.push(`~${c.reported_move}`);
  if (c.floating_state) L.push(`currently in ${c.floating_state}`);
  if (c.has_stop_loss === false) L.push('NO stop loss');
  else if (c.stop_loss != null) L.push(`SL ${c.stop_loss}`);
  if (c.take_profit != null) L.push(`TP ${c.take_profit}`);
  if (c.timeframe_entry) L.push(`entry TF ${c.timeframe_entry}`);
  if (c.holding_duration) L.push(`held ${c.holding_duration}`);
  return L.join(' · ');
}
