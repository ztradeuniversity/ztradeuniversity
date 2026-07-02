// functions/utils/knowledge-intelligence.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.3 — KNOWLEDGE INTELLIGENCE. Sits BEFORE response generation and
// decides: which source to trust (ranking), how confident we are (HIGH/MEDIUM/
// LOW/UNKNOWN), whether sources conflict, what to retrieve, and — critically —
// when to admit we don't know rather than fabricate. Pure (no I/O); localized.
// ════════════════════════════════════════════════════════════════════════════

const ARTICLE_INTENTS = new Set(['gold', 'btc', 'macro', 'riskmgmt', 'psychology', 'strategy', 'technical', 'events', 'knowledge', 'brief', 'career']);

// Future-price prediction / guaranteed-direction asks → never claim certainty.
const PREDICTION = /\b(will|is|are|gonna|going to)\b[^?]*\b(rise|fall|go up|go down|drop|crash|pump|moon|hit|reach|double|explode|recover)\b|\b(predict|prediction|forecast|guarantee|guaranteed|definitely (rise|fall|go|move)|for sure|100%|sure shot|tomorrow|next week|next month)\b/i;
// Facts we NEVER hold internally → always UNKNOWN.
const UNKNOWN_HARD   = /\b(who owns|who founded|founded in|headquarter|license number|ceo of|owned by|registration number)\b/i;
// Broker legitimacy/regulation → UNKNOWN only when the broker is NOT recognized.
const UNKNOWN_BROKER = /\b(is\s+[\w .]+\s+(regulated|legit|legitimate|a scam|scam|safe|trustworthy|reliable)|regulation (of|number))\b/i;

// ── A. SOURCE RANKING ────────────────────────────────────────────────────────
export function rankSources(ctx) {
  const order = [];
  if (ctx.carried)                                order.push('conversation');
  if (ctx.marketDumpAllowed && ctx.hasLiveData)   order.push('live');
  if (ctx.hasMemory)                              order.push('memory');
  if (!ctx.marketDumpAllowed)                     order.push('knowledgeBase', 'articles');
  if (ctx.intent === 'broker')                    order.push('brokerDB');
  if (ctx.patternRelevant)                        order.push('patternVault');
  order.push('liveMarket');
  const sourceOrder = [...new Set(order)];
  return { sourceOrder, primarySource: sourceOrder[0] || 'knowledgeBase', secondarySource: sourceOrder[1] || '' };
}

// ── B. KNOWLEDGE CONFIDENCE ──────────────────────────────────────────────────
export function knowledgeConfidence(ctx) {
  const s = String(ctx.text || '').toLowerCase();
  if (PREDICTION.test(s))                                   return { level: 'LOW',     reason: 'future-prediction' };
  if (UNKNOWN_HARD.test(s))                                 return { level: 'UNKNOWN', reason: 'unverifiable-fact' };
  if (UNKNOWN_BROKER.test(s) && !ctx.brokerKnown)          return { level: 'UNKNOWN', reason: 'unverified-broker' };
  if (ctx.marketDumpAllowed && ctx.hasLiveData)            return { level: 'HIGH',    reason: 'live-data' };
  if (ctx.marketDumpAllowed && !ctx.hasLiveData)           return { level: 'MEDIUM',  reason: 'no-live-data' };
  return { level: 'MEDIUM', reason: 'educational' };
}

// ── C. CONTRADICTION DETECTOR ────────────────────────────────────────────────
// Needs ≥2 INDEPENDENT directional signals to flag a real conflict.
export function detectContradiction({ changePct, regimeLabel, patternBias } = {}) {
  const dirs = [];
  if (typeof changePct === 'number') dirs.push(changePct > 0.25 ? 'bull' : changePct < -0.25 ? 'bear' : 'neutral');
  if (regimeLabel) { const r = String(regimeLabel).toLowerCase(); dirs.push(/risk-on|bull/.test(r) ? 'bull' : /risk-off|bear/.test(r) ? 'bear' : 'neutral'); }
  if (patternBias) dirs.push(String(patternBias).toLowerCase());
  const dir = new Set(dirs.filter(d => d && d !== 'neutral'));
  return { conflict: dir.has('bull') && dir.has('bear'), dirs };
}
export function balancedNote(lang = 'en') {
  return ({
    en:         '\n\n_⚖️ Note: signals are mixed right now — treat any single read with caution and wait for confluence._',
    ur:         '\n\n_⚖️ نوٹ: ابھی signals ملے جلے ہیں — کسی ایک اشارے پر مکمل بھروسہ نہ کریں، confluence کا انتظار کریں۔_',
    'ur-roman': '\n\n_⚖️ Note: abhi signals mile jule hain — kisi aik ishaare par mukammal bharosa na karein._',
    ar:         '\n\n_⚖️ ملاحظة: الإشارات متضاربة الآن — تعامل مع أي قراءة منفردة بحذر وانتظر التوافق._',
  }[lang] || '\n\n_⚖️ Note: signals are mixed right now — treat any single read with caution._');
}

// ── D. UNKNOWN HANDLER (never fabricate) ─────────────────────────────────────
export function unknownResponse(lang = 'en') {
  return ({
    en:         "I don't have enough verified information to answer that accurately, and I won't guess. For things like broker regulation, confirm directly on the official regulator's site (FCA, CySEC, ASIC, etc.). If you share more detail, I'll help you reason it through.",
    ur:         "اس کا درست جواب دینے کے لیے میرے پاس مصدقہ معلومات کافی نہیں، اور میں اندازہ نہیں لگاؤں گا۔ broker ریگولیشن جیسے معاملات کے لیے براہِ راست آفیشل ریگولیٹر (FCA, CySEC, ASIC) کی سائٹ پر تصدیق کریں۔ مزید تفصیل بتائیں تو میں سوچنے میں مدد کروں گا۔",
    'ur-roman': "Iska durust jawab dene ke liye mere paas mustanad maloomat kaafi nahi, aur main andaza nahi lagaoon ga. Broker regulation jaise maamlaat ke liye official regulator (FCA, CySEC, ASIC) ki site par tasdeeq karein.",
    ar:         "لا أملك معلومات موثّقة كافية للإجابة بدقة، ولن أخمّن. للتحقق من تنظيم الوسطاء، راجع موقع الجهة الرسمية مباشرة (FCA, CySEC, ASIC). أخبرني بمزيد من التفاصيل وسأساعدك على التفكير فيها.",
  }[lang] || "I don't have enough verified information to answer that accurately, and I won't guess.");
}

// ── LOW-confidence preface (predictions) ─────────────────────────────────────
export function lowConfidencePreface(lang = 'en') {
  return ({
    en:         "No one can reliably predict short-term price moves — anyone guaranteeing a direction is guessing. What I *can* do is explain what's actually driving it:",
    ur:         "کوئی بھی short-term قیمت کی پیش گوئی یقین سے نہیں کر سکتا — جو کوئی سمت کی گارنٹی دے، وہ اندازہ لگا رہا ہے۔ البتہ میں یہ بتا سکتا ہوں کہ اصل میں اسے کیا حرکت دے رہا ہے:",
    'ur-roman': "Koi bhi short-term qeemat ki paish-goi yaqeen se nahi kar sakta — jo koi direction ki guarantee de, woh andaza laga raha hai. Albatta main ye bata sakta hoon ke asal mein ise kya move kar raha hai:",
    ar:         "لا أحد يستطيع التنبؤ بحركة السعر قصيرة المدى بثقة — من يضمن اتجاهاً فهو يخمّن. لكن يمكنني شرح ما الذي يحرّكه فعلاً:",
  }[lang] || "No one can reliably predict short-term price moves. Here's what actually drives it:");
}

// ── E. RETRIEVAL PLANNER ─────────────────────────────────────────────────────
export function planRetrieval(ctx, kConf) {
  const need = { memory: false, knowledgeBase: false, article: false, pattern: false, live: false };
  if (kConf.level === 'UNKNOWN') return need;                 // retrieve nothing — we won't fabricate
  if (ctx.marketDumpAllowed) need.live = true;
  if (!ctx.marketDumpAllowed && ARTICLE_INTENTS.has(ctx.intent)) { need.article = true; need.knowledgeBase = true; }
  if (ctx.hasMemory) need.memory = true;
  if (ctx.patternRelevant) need.pattern = true;
  if (ctx.depth === 'MICRO') { need.article = false; need.knowledgeBase = false; need.pattern = false; }
  return need;
}
