// functions/utils/answer-planner.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 10 — ANSWER PLANNER. Turns a question-awareness analysis into a concrete
// plan the existing engine executes: which engine intent to use, the depth mode,
// whether a market dump is permitted, a localized short-status answer, and a
// localized follow-up block. Pure (no I/O). Preserves the Language Lock.
// ════════════════════════════════════════════════════════════════════════════

import { loc } from './response-engine.js';

const MARKET_INTENTS = new Set(['gold', 'btc', 'macro', 'brief', 'mood', 'events', 'session']);

// Map a non-status goal/category to the right EDUCATIONAL engine intent.
function goalToIntent(a) {
  switch (a.goal) {
    case 'wealth':     return 'career';
    case 'psychology': return 'psychology';
    case 'risk':       return 'riskmgmt';
    case 'strategy':   return 'strategy';
    case 'smartmoney': return 'technical';
    case 'learn':      return 'knowledge';
    case 'funding':    return 'funding';
    case 'broker':     return 'broker';
  }
  switch (a.category) {
    case 'Trading Career':    return 'career';
    case 'Psychology':        return 'psychology';
    case 'Risk Management':   return 'riskmgmt';
    case 'Strategy':          return 'strategy';
    case 'Smart Money':       return 'technical';
    case 'Beginner Learning': return 'knowledge';
    case 'Prop Firms':        return 'funding';
    case 'Brokers':           return 'broker';
    case 'Market Analysis':   return 'technical';
    case 'Macro News':        return 'knowledge';
    case 'Gold':              return 'technical';   // "how do I trade gold" → structure education
    case 'BTC':               return 'technical';
    case 'Forex':             return 'technical';
  }
  return null;
}

// Decide the final engine intent + depth mode + market-dump permission.
export function planIntent(analysis, cls) {
  let intent = cls.intent;
  const marketDump = !!analysis.marketDumpAllowed;

  if (MARKET_INTENTS.has(cls.intent) && !marketDump) {
    // Keyword matched a market intent but the user did NOT ask for status → educate.
    intent = goalToIntent(analysis) || 'knowledge';
  } else if (cls.intent === 'fallback') {
    const mapped = goalToIntent(analysis);
    if (mapped) intent = mapped;
  }

  // Short, non-dump answers get the condensed transform.
  const mode = (analysis.depth === 'short' && !marketDump) ? 'short' : null;
  return { intent, mode, marketDump };
}

// ── LOCALIZED MICRO-COPY ─────────────────────────────────────────────────────
const num = (n, dp = 2) => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const pc  = (p) => p == null ? '' : ` (${p > 0 ? '+' : ''}${Number(p).toFixed(2)}%)`;

const FU_HEADER = {
  en: 'I can also help with:', ur: 'میں ان میں بھی مدد کر سکتا ہوں:',
  'ur-roman': 'Main in mein bhi madad kar sakta hoon:', ar: 'يمكنني المساعدة أيضاً في:',
};
const FU_LABELS = {
  market_context: { en: 'Current market context', ur: 'موجودہ مارکیٹ کا حال', 'ur-roman': 'Mojooda market ka haal', ar: 'سياق السوق الحالي' },
  gold_context:   { en: 'Gold analysis & structure', ur: 'Gold کا تجزیہ اور structure', 'ur-roman': 'Gold ka tajziya aur structure', ar: 'تحليل Gold والبنية' },
  btc_context:    { en: 'BTC analysis & structure', ur: 'BTC کا تجزیہ اور structure', 'ur-roman': 'BTC ka tajziya aur structure', ar: 'تحليل BTC والبنية' },
  setup:          { en: 'A trade setup walk-through', ur: 'ایک trade setup کی وضاحت', 'ur-roman': 'Ek trade setup ki wazahat', ar: 'شرح إعداد صفقة' },
  risk:           { en: 'Risk & position sizing', ur: 'رسک اور position sizing', 'ur-roman': 'Risk aur position sizing', ar: 'المخاطر وحجم المركز' },
  entry:          { en: 'Entry confirmation basics', ur: 'entry confirmation کی بنیادیں', 'ur-roman': 'Entry confirmation ki buniyadein', ar: 'أساسيات تأكيد الدخول' },
  psychology:     { en: 'Trading psychology', ur: 'ٹریڈنگ سائیکالوجی', 'ur-roman': 'Trading psychology', ar: 'سيكولوجيا التداول' },
  learning:       { en: 'A beginner learning roadmap', ur: 'beginner سیکھنے کا roadmap', 'ur-roman': 'Beginner seekhne ka roadmap', ar: 'خارطة تعلّم للمبتدئين' },
  strategy:       { en: 'Choosing a strategy', ur: 'حکمتِ عملی کا انتخاب', 'ur-roman': 'Strategy ka intikhaab', ar: 'اختيار استراتيجية' },
  chart:          { en: 'Upload a chart for analysis', ur: 'تجزیے کے لیے chart اپلوڈ کریں', 'ur-roman': 'Tajziye ke liye chart upload karein', ar: 'ارفع شارت للتحليل' },
};

function L(map, lang) { return map[lang] || map.en; }

// Build the ≤3 follow-up block in the reply language.
export function followupBlock(analysis, lang = 'en') {
  const types = (analysis.suggestedFollowups || []).slice(0, 3);
  if (!types.length) return '';
  const items = types.map(t => `• ${L(FU_LABELS[t] || FU_LABELS.market_context, lang)}`).join('\n');
  return `\n\n${L(FU_HEADER, lang)}\n${items}`;
}

// Concise live status line (for explicit short status asks) + follow-ups + disclaimer.
// `extraFollowup` (Phase 10.5) appends ONE natural follow-up line instead of a menu.
export function shortStatusAnswer(analysis, marketData, lang = 'en', extraFollowup = '') {
  const inst = analysis.statusInstrument || (analysis.category === 'BTC' ? 'BTC' : analysis.category === 'Gold' ? 'Gold' : null);
  if (!inst) return null;
  const md = marketData && marketData.status === 'ok' ? marketData : null;

  const lead = {
    Gold: { val: md?.gold?.price, dp: 2, code: 'Gold (XAU/USD)' },
    BTC:  { val: md?.btc?.price,  dp: 0, code: 'Bitcoin (BTC/USD)' },
  }[inst];

  const priceTxt = lead && lead.val != null
    ? `${lead.code} ${ ({ en: 'is around', ur: 'اس وقت تقریباً', 'ur-roman': 'is waqt taqreeban', ar: 'حالياً حول' }[lang] || 'is around') } ${num(lead.val, lead.dp)}${pc(inst === 'Gold' ? md?.gold?.changePct : md?.btc?.changePct)}.`
    : ({ en: `I can pull the live ${inst} read for you right now.`, ur: `میں ابھی ${inst} کا live حال نکال سکتا ہوں۔`, 'ur-roman': `Main abhi ${inst} ka live haal nikaal sakta hoon.`, ar: `يمكنني جلب حالة ${inst} المباشرة الآن.` }[lang] || `I can pull the live ${inst} read for you right now.`);

  const fu = (analysis.suggestedFollowups && analysis.suggestedFollowups.length) ? followupBlock(analysis, lang) : '';
  return priceTxt + fu + (extraFollowup || '') + '\n\n' + loc(lang).disclaimer;
}

// One-line status prefix for multi-questions ("price AND how to trade it").
export function statusPrefix(analysis, marketData, lang = 'en') {
  const s = shortStatusAnswer({ ...analysis, suggestedFollowups: [] }, marketData, lang);
  if (!s) return '';
  // strip the disclaimer from the prefix (the main answer carries its own)
  return s.split('\n\n')[0] + '\n\n';
}
