// functions/api/trade-rescue.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU TRADE RESCUE — trade-management decision-support endpoint
//
//   POST /api/trade-rescue
//     { message, tradeCase?, lang? }
//   →   { mode:'question'|'analysis'|'scope', reply, tradeCase, evidence?, debug? }
//
// THIS IS NOT THE GENERAL CHATBOT AND DOES NOT TOUCH IT.
// functions/api/ai-chat.js is not imported, not called and not modified. None of
// its answer sources can reach this pipeline: no knowledge-graph retrieval, no
// published-article retrieval, no generic conversation intelligence, no
// specialist router. That disconnection is the point — those layers answer
// teaching questions, and a teaching answer is not a trade-management decision.
//
// PIPELINE
//   1. Scope gate      — is this actually about managing an open position?
//   2. Extract + merge — pull trade facts out of what the trader typed
//   3. Question engine — if the case is incomplete, ask (never re-asking)
//   4. Evidence        — fetch CURRENT data, each item source+timestamp stamped
//   5. Analysis        — 8 layers → evidence weighting → decision support
//   6. Synthesis       — deterministic brief, optionally rephrased by the LLM
//
// The deterministic brief is always built first and is always complete. The LLM
// only ever rewrites it, so if the model is unavailable the trader still gets
// the full, factual analysis.
// ════════════════════════════════════════════════════════════════════════════

import { emptyCase, mergeCase, extractFromText, nextQuestions, readyForAnalysis, missingRequired, caseSummary, questionText, INSTRUMENTS, isUnknownAnswer, markUnavailable, isUnavailable } from '../utils/trade-rescue/case.js';
import { collectEvidence, provenanceLines } from '../utils/trade-rescue/evidence.js';
import { runAnalysis, KIND } from '../utils/trade-rescue/analysis.js';
import { selectKnowledge } from '../utils/trade-rescue/knowledge.js';
import { generateTradeRescueReport, interpretTradeMessage } from '../utils/composer-llm.js';
import { resolveLang } from '../utils/trade-rescue/language.js';
// ── ACCESS: the SAME gate the AI assistant already uses ──────────────────────
// resolveTier reads the identity token minted by /api/ai-access after the
// existing Library OTP flow; readGuestCount/buildGuestCookie are the SAME signed
// `ztu_ai_guest` cookie the assistant counts against. Trade Rescue therefore
// shares ONE counter, ONE token, ONE secret and ONE membership with the rest of
// the site — no second auth system, no second OTP, no second counter, and a
// member who verified once for the Library/Journal/AI is already verified here.
import { resolveTier, readGuestCount, buildGuestCookie } from '../utils/identity-session.js';
import { limitReachedPayload } from '../utils/access-copy.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

// ── LANGUAGE ─────────────────────────────────────────────────────────────────
// The diagnostic conversation answers in the trader's own language. Trading
// terms stay in English in every language because that is how they appear on
// the trader's platform. English is the fallback for any language this build
// does not carry strings for — never a silent switch to English for a language
// it does DOES carry.
const L10N = {
  en: {
    disclaimer: '_This is decision-support based on the evidence available right now — not a guaranteed outcome, and not financial advice. Market conditions can change at any time, and the decision on your own position is always yours._',
    gotIt: (s) => `Got it — ${s}.`,
    start: 'Right, let me get the shape of this trade.',
    needTwo: 'Two things I need before I can analyse it properly:',
    needOne: 'One thing I still need:',
    thenAnalyse: "After that I'll pull the current market data and give you the full read.",
    englishNote: null,
    heardCheck: "Before I analyse — I want to be sure I heard your numbers right:",
    heardConfirm: 'If that’s correct just say **yes**; if not, tell me the right value.',
    switched: 'Of course — I’ll carry on in English.',
    // Hedged on purpose: this reflects back what the trader SAID, and never
    // claims to know how they feel.
    senseUnsure: 'It sounds like you’re unsure what to do with this one. Let’s take it apart properly rather than guess.',
    nextOne: 'Next thing I need:',
    andThen: 'Then I’ll pull the current market data and give you the full read.',
    scope: [
      "I'm **ZTU Rescue** — I work on one thing: helping you think through a trade you're already in.",
      '',
      "Tell me about an open position and I'll take it from there — for example:",
      '• _"My Gold buy is stuck, I\'m 40 points down"_',
      '• _"I\'m short BTC from 82,000 with no stop loss"_',
      '• _"Should I hold my XAU/USD long over the weekend?"_',
      '',
      "I'll ask a few questions about the trade, pull the current market data I can verify, and give you a structured read on where it stands.",
    ].join('\n'),
  },
  ur: {
    disclaimer: '_یہ اس وقت دستیاب evidence کی بنیاد پر decision-support ہے — کوئی guaranteed نتیجہ نہیں، اور نہ ہی financial advice۔ Market حالات کسی بھی وقت بدل سکتے ہیں، اور آپ کی اپنی position کا فیصلہ ہمیشہ آپ کا ہے۔_',
    gotIt: (s) => `سمجھ گیا — ${s}۔`,
    start: 'ٹھیک ہے، پہلے مجھے اس ٹریڈ کی تفصیل بتائیں۔',
    needTwo: 'مکمل تجزیے سے پہلے مجھے دو چیزیں درکار ہیں:',
    needOne: 'ایک چیز اور درکار ہے:',
    thenAnalyse: 'اس کے بعد میں موجودہ market data لے کر آپ کو مکمل تجزیہ دوں گا۔',
    englishNote: '_تفصیلی تجزیہ اس وقت انگریزی میں دستیاب ہے۔_',
    heardCheck: 'تجزیے سے پہلے میں آپ کے numbers confirm کرنا چاہتا ہوں:',
    heardConfirm: 'اگر یہ درست ہے تو **جی ہاں** لکھیں؛ ورنہ صحیح value بتا دیں۔',
    switched: 'ضرور — اب میں اردو میں بات کروں گا۔',
    senseUnsure: 'آپ کی بات سے لگ رہا ہے کہ آپ اس ٹریڈ کے بارے میں غیر یقینی ہیں۔ اندازے لگانے کے بجائے اسے ترتیب سے دیکھ لیتے ہیں۔',
    nextOne: 'اگلی بات جو مجھے درکار ہے:',
    andThen: 'اس کے بعد میں موجودہ market data لے کر آپ کو مکمل تجزیہ دوں گا۔',
    scope: [
      'میں **ZTU Rescue** ہوں — میرا کام ایک ہی ہے: آپ کی اُس ٹریڈ کو سمجھنا جو پہلے سے کھلی ہوئی ہے۔',
      '',
      'مجھے اپنی open position کے بارے میں بتائیں، مثلاً:',
      '• _"میری گولڈ کی buy پھنسی ہوئی ہے، 40 points نیچے ہوں"_',
      '• _"میں نے BTC 82,000 سے sell کی ہے، stop loss نہیں ہے"_',
      '• _"کیا میں اپنی XAU/USD buy weekend پر رکھوں؟"_',
      '',
      'میں ٹریڈ کے بارے میں چند سوال کروں گا، جو market data میں verify کر سکتا ہوں وہ لاؤں گا، اور پھر آپ کو ترتیب سے تجزیہ دوں گا۔',
    ].join('\n'),
  },
  ar: {
    disclaimer: '_هذا دعم لاتخاذ القرار بناءً على الأدلة المتاحة الآن — وليس نتيجة مضمونة ولا نصيحة مالية. ظروف السوق قد تتغير في أي وقت، والقرار بشأن مركزك يبقى قرارك أنت._',
    gotIt: (s) => `تمام — ${s}.`,
    start: 'حسناً، دعني أفهم تفاصيل هذه الصفقة أولاً.',
    needTwo: 'أحتاج أمرين قبل أن أحللها بشكل صحيح:',
    needOne: 'ما زلت أحتاج أمراً واحداً:',
    thenAnalyse: 'بعد ذلك سأجلب بيانات السوق الحالية وأعطيك التحليل الكامل.',
    englishNote: '_التحليل التفصيلي متاح حالياً باللغة الإنجليزية._',
    heardCheck: 'قبل التحليل، أريد التأكد من الأرقام:',
    heardConfirm: 'إذا كانت صحيحة اكتب **نعم**؛ وإلا أخبرني بالقيمة الصحيحة.',
    switched: 'بالتأكيد — سأكمل بالعربية.',
    senseUnsure: 'يبدو من كلامك أنك غير متأكد ممّا تفعله بهذه الصفقة. دعنا نحللها بشكل منظم بدل التخمين.',
    nextOne: 'الأمر التالي الذي أحتاجه:',
    andThen: 'بعد ذلك سأجلب بيانات السوق الحالية وأعطيك التحليل الكامل.',
    scope: [
      'أنا **ZTU Rescue** — عملي شيء واحد: مساعدتك على التفكير في صفقة أنت داخلها بالفعل.',
      '',
      'أخبرني عن مركز مفتوح وسأتولى الأمر — مثلاً:',
      '• _"صفقة شراء الذهب عالقة وأنا خاسر 40 نقطة"_',
      '• _"لدي بيع BTC من 82,000 بدون وقف خسارة"_',
      '• _"هل أحتفظ بصفقة XAU/USD خلال عطلة نهاية الأسبوع؟"_',
      '',
      'سأطرح بضعة أسئلة عن الصفقة، وأجلب بيانات السوق التي أستطيع التحقق منها، ثم أعطيك قراءة منظمة لوضعها.',
    ].join('\n'),
  },
};
const pickL10n = (lang) => L10N[String(lang || 'en').slice(0, 2).toLowerCase()] || L10N.en;

// ── SCOPE GATE ───────────────────────────────────────────────────────────────
// Trade Rescue answers ONE kind of question. Anything else is declined with a
// clear pointer rather than silently handed to the general chatbot — the task's
// TEST 10 behaviour, made explicit instead of implicit.
// Deliberately wider than trading jargon. A trader in trouble writes "my gold
// trade is dead", "phans gayi", "market is against me", "should I cut it" — not
// "I have an open position with negative floating P/L". Keyword matching is only
// the FIRST gate: once the case carries an instrument, direction or entry the
// conversation is in scope regardless of how the next message is phrased, and
// the extraction layer reads meaning rather than commands.
const TRADE_SIGNALS = new RegExp([
  // instrument / mechanics
  '\\b(trade|trading|position|entry|entered|buy|bought|sell|sold|long|short|lot|pip|point)\\b',
  '\\b(stop ?loss|sl|take ?profit|tp|margin|hedge|averag|scal(?:e|ing) in|add(?:ing)? to)\\b',
  '\\b(gold|xau|btc|bitcoin|eur ?usd|gbp ?usd|usd ?jpy|silver|xag|oil|nas100|us30)\\b',
  // trouble, in the words people actually use
  '\\b(stuck|trapped|jammed|jam|frozen|dead|sitting there|going nowhere|not moving)\\b',
  '\\b(underwater|drawdown|floating|losing|loss|in profit|red|green|against me|went against)\\b',
  '\\b(reversed|turned around|came back|moved down|moved up|blew past)\\b',
  // the decision they are stuck on
  '\\b(hold(?:ing)?|close|cut|exit|book|square off|wait|should i|what (?:do|should) i)\\b',
  // Roman Urdu / Hinglish, which voice input produces constantly
  '\\b(phans|phansi|phas|ulta|ulat|nuqsan|nuksan|faida|band kar|rakhun|karun|bech)\\w*',
].join('|'), 'i');
// Non-Latin scope vocabulary is matched as plain substrings — JavaScript's \b is
// ASCII-only and never fires beside Arabic/Urdu characters, so a regex with
// boundaries silently rejects every Urdu and Arabic message.
const NON_LATIN_SIGNALS = [
  // Urdu — instruments, mechanics, and the vocabulary of a trade in trouble
  'ٹریڈ', 'پوزیشن', 'خرید', 'فروخت', 'نقصان', 'منافع', 'سٹاپ', 'سودا', 'اسٹاپ',
  'گولڈ', 'سونا', 'سونے', 'بٹ کوائن', 'بٹکوائن', 'بائی', 'سیل', 'انٹری', 'اینٹری',
  'پھنس', 'پھنسی', 'پھنسا', 'اٹک', 'اٹکی', 'الٹا', 'الٹی', 'خلاف', 'مندی', 'تیزی',
  'رکھوں', 'بند کر', 'بیچ', 'کیا کروں', 'سمجھ نہیں',
  // Arabic
  'صفقة', 'شراء', 'بيع', 'خسارة', 'ربح', 'وقف', 'مركز', 'ذهب', 'بيتكوين',
  'عالقة', 'عالق', 'محتجزة', 'ضدي', 'أحتفظ', 'أغلق', 'ماذا أفعل', 'دخول',
];

function inScope(text, tradeCase) {
  if (tradeCase && (tradeCase.instrument || tradeCase.direction || tradeCase.entry != null)) return true;
  const t = String(text || '');
  return TRADE_SIGNALS.test(t) || NON_LATIN_SIGNALS.some(w => t.includes(w));
}

// Rescue is the only trading-assistance surface, so an out-of-scope message is
// redirected back to what Rescue itself does — never handed off to another
// product. (The former general assistant is retired; nothing points at it.)

// ── DETERMINISTIC BRIEF ──────────────────────────────────────────────────────
// The complete, factual report. Also the exact text handed to the LLM, so the
// model can only ever rewrite facts that are already grounded.
function buildBrief(c, ev, analysis, knowledge) {
  const L = [];
  L.push(`TRADE CASE: ${caseSummary(c) || '(incomplete)'}`);
  if (c.original_thesis) L.push(`Trader's original thesis: ${c.original_thesis}`);
  if (c.reported_move) L.push(`Trader reports the position has moved about ${c.reported_move}. This is THEIR report — it is not verified, and it must not be converted into a price or a profit/loss figure.`);
  if (c.account_context) L.push(`Trader's own account remark: ${c.account_context} (unverified, trader-reported).`);
  if ((c.unavailable || []).length) {
    L.push(`THE TRADER COULD NOT SUPPLY: ${c.unavailable.join(', ')}. Do NOT compute anything that depends on these and do NOT ask for them again — say plainly which calculations are therefore unavailable, and analyse everything that does not depend on them.`);
  }
  L.push('');

  L.push('CURRENT VERIFIED DATA (every value below was fetched just now; nothing here is remembered or estimated):');
  if (ev.priceStatus === 'verified') {
    L.push(`• ${c.instrument} price ${ev.price} — ${ev.priceSource}, retrieved ${ev.priceAt}`);
    if (ev.session) L.push(`• Session: low ${ev.session.low}, high ${ev.session.high}, change ${ev.session.changePct}%`);
  }
  if (ev.regime) L.push(`• Market regime ${ev.regime.label}, VIX ${ev.regime.vix_level} — FRED via /api/sentiment, retrieved ${ev.collectedAt}`);
  if (ev.yields) {
    if (ev.yields.us10y != null)     L.push(`• US 10Y nominal ${ev.yields.us10y}% (FRED DGS10, as of ${ev.yields.us10y_date})`);
    if (ev.yields.real10y != null)   L.push(`• US 10Y real ${ev.yields.real10y}% (FRED DFII10, as of ${ev.yields.real10y_date})`);
    if (ev.yields.breakeven != null) L.push(`• Breakeven inflation ${ev.yields.breakeven}%`);
  }
  if (ev.newsStatus === 'verified' && ev.news.length) {
    L.push(`• ${ev.news.length} relevant headline(s), retrieved ${ev.newsAt}:`);
    for (const n of ev.news) L.push(`   – "${n.title}" (${n.source}, ${n.publishedAt})`);
  }
  if (ev.unavailable.length) {
    L.push('');
    L.push('COULD NOT BE VERIFIED (state these as unavailable — never fill them in):');
    for (const u of ev.unavailable) L.push(`• ${u}`);
  }
  L.push('');

  for (const layer of analysis.layers) {
    if (!layer.findings.length) continue;
    L.push(`${layer.title.toUpperCase()}:`);
    for (const f of layer.findings) L.push(`[${f.kind}] ${f.text}`);
    L.push('');
  }

  const w = analysis.weighed;
  L.push('EVIDENCE BALANCE:');
  L.push(`Methodology: ${w.methodology}`);
  if (w.supportive.length) { L.push(`Supportive of the position (${w.supportive.length}):`); for (const e of w.supportive) L.push(`• ${e.text}  [basis: ${e.basis}]`); }
  if (w.opposing.length)   { L.push(`Against the position (${w.opposing.length}):`);      for (const e of w.opposing)   L.push(`• ${e.text}  [basis: ${e.basis}]`); }
  if (w.neutral.length)    { L.push(`Context only — excluded from the balance (${w.neutral.length}):`); for (const e of w.neutral) L.push(`• ${e.text}`); }
  L.push(`Overall: ${w.balanceText}`);
  L.push('');

  if (knowledge.length) {
    L.push('RELEVANT TRADE-MANAGEMENT PRINCIPLES (stored knowledge — NOT current market data):');
    for (const k of knowledge) L.push(`• ${k.title}: ${k.body}`);
    L.push('');
  }

  L.push('DECISION-SUPPORT CONSIDERATIONS (conditional, never commands):');
  for (const d of analysis.decision.considerations) L.push(`• ${d}`);
  return L.join('\n');
}

// Reader-facing fallback when the LLM is unavailable — same facts, plain layout.
function renderDeterministic(c, ev, analysis, knowledge) {
  const L = [];
  L.push('### What I understand about your trade');
  L.push(caseSummary(c) || 'Not enough detail captured yet.');
  if (c.original_thesis) L.push(`\nYour original reason for entering: “${c.original_thesis}”`);

  L.push('\n### What the current data shows');
  if (ev.priceStatus === 'verified') {
    L.push(`- **${c.instrument} ${ev.price}** — retrieved ${ev.priceAt}`);
    if (ev.session) L.push(`- Session range **${ev.session.low} – ${ev.session.high}** (${ev.session.changePct}% today)`);
  }
  if (ev.regime) L.push(`- Market regime **${ev.regime.label}**, VIX ${ev.regime.vix_level}`);
  if (ev.yields && ev.yields.real10y != null) L.push(`- US 10Y real yield **${ev.yields.real10y}%**`);
  for (const u of ev.unavailable) L.push(`- ⚠️ ${u}`);

  for (const layer of analysis.layers) {
    if (layer.id === 'trade_context' || !layer.findings.length) continue;
    L.push(`\n### ${layer.title}`);
    for (const f of layer.findings) L.push(`- ${f.kind === KIND.UNCERTAINTY ? '⚠️ ' : ''}${f.text}`);
  }

  const w = analysis.weighed;
  if (w.supportive.length) { L.push('\n### What supports your position'); for (const e of w.supportive) L.push(`- ${e.text}`); }
  if (w.opposing.length)   { L.push('\n### What works against it');        for (const e of w.opposing)   L.push(`- ${e.text}`); }

  if (knowledge.length) {
    L.push('\n### Trade-management principles that apply here');
    for (const k of knowledge) L.push(`- **${k.title}** — ${k.body}`);
  }

  L.push('\n### My evidence-based assessment');
  L.push(w.balanceText);
  L.push(`\n_${w.methodology}_`);

  L.push('\n### What to watch next');
  for (const d of analysis.decision.considerations) L.push(`- ${d}`);
  return L.join('\n');
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const message = String(body.message || '').slice(0, 2000);
  const origin = new URL(request.url).origin;
  let tCase = mergeCase(emptyCase(), body.tradeCase || {});

  // WHICH LANGUAGE — an explicit request ("explain in English", "اردو میں
  // بتائیں") wins and is remembered on the case; otherwise the script the
  // trader is actually writing in decides; the composer selector is only the
  // last fallback. The trader should never have to find a dropdown to be
  // understood. `lang_pref` is part of the stateless case, so the choice
  // survives every following turn, including voice.
  const L = resolveLang(message, body.lang, tCase);
  const lang = L.lang;
  if (L.pref) tCase.lang_pref = L.pref;
  const T = pickL10n(lang);

  // 0 ── ACCESS GATE — identical rule to the AI assistant.
  // Verified members ('unlimited') are never counted. Everyone else gets exactly
  // AI_VISITOR_MESSAGE_LIMIT (default 5) free analyses, counted in the SAME
  // signed cookie the assistant uses, so the two surfaces share one allowance
  // rather than handing a guest double. On exhaustion the SAME limitReachedPayload
  // is returned, so the upgrade path and copy are the existing ones.
  const { tier } = await resolveTier(env, body.identityToken || '');
  const visitorLimit = parseInt(env.AI_VISITOR_MESSAGE_LIMIT ?? '5', 10) || 5;
  let guestSetCookie = null;
  if (tier !== 'unlimited') {
    const used = await readGuestCount(env, request);
    if (used >= visitorLimit) {
      return json({ mode: 'limit', tier: 'visitor', freeLimit: visitorLimit,
                    gate: limitReachedPayload(env, lang), tradeCase: tCase });
    }
    guestSetCookie = await buildGuestCookie(env, used + 1);
  }
  // Attach the updated guest count to whatever this turn returns.
  const respond = (payload, status = 200) => {
    const h = guestSetCookie ? { ...JSON_H, 'Set-Cookie': guestSetCookie } : JSON_H;
    return new Response(JSON.stringify({ ...payload, tier, freeLimit: visitorLimit }), { status, headers: h });
  };

  // 1 ── SCOPE GATE
  if (!inScope(message, tCase)) {
    return respond({ mode: 'scope', reply: T.scope, tradeCase: tCase });
  }

  // 2 ── EXTRACT + MERGE
  const before = { entry: tCase.entry, stop_loss: tCase.stop_loss, take_profit: tCase.take_profit, position_size: tCase.position_size };
  const FACTS = ['instrument', 'direction', 'entry', 'stop_loss', 'has_stop_loss', 'take_profit',
                 'position_size', 'holding_duration', 'original_thesis', 'floating_state', 'reported_move'];
  const factCount = (c) => FACTS.filter(k => c[k] !== null && c[k] !== undefined && c[k] !== '').length;
  const factsBefore = factCount(tCase);

  tCase = mergeCase(tCase, extractFromText(message, tCase));
  tCase.turns = (tCase.turns || 0) + 1;

  // 2a ── "I DON'T KNOW" is an ANSWER.
  // A trader who cannot remember their entry has told us something real. Mark
  // the field the previous turn asked about as unavailable so it is never asked
  // again and the report states plainly that it could not be verified — instead
  // of the case sitting on a null and the conversation grinding on.
  if (tCase.last_asked && isUnknownAnswer(message)) markUnavailable(tCase, tCase.last_asked);

  // 2b ── SEMANTIC FALLBACK — only when the deterministic pass came back thin.
  // The extractor is deliberately conservative, which is correct for numbers but
  // loses most of a natural paragraph (the reported failure: a trader explained
  // instrument, side, size of the move, account context and their actual
  // question, and only instrument + direction survived). This re-reads the SAME
  // sentence semantically on the existing callModel transport. It is given no
  // market data and can return nothing that is not in the message; every value
  // is validated in interpretTradeMessage() before it gets here, and only
  // still-empty fields are filled, so a deterministic capture always wins.
  const substantive = message.trim().length >= 40;
  if (substantive && (factCount(tCase) - factsBefore) <= 2) {
    try {
      const sem = await interpretTradeMessage(env, message, INSTRUMENTS.map(i => i.id));
      if (sem) {
        const patch = {};
        for (const [k, v] of Object.entries(sem)) {
          if (k === 'unavailable') continue;
          const cur = tCase[k];
          const empty = cur === null || cur === undefined || cur === ''
                     || (Array.isArray(cur) && cur.length === 0);
          if (empty) patch[k] = v;
        }
        if (patch.instrument) {
          const ins = INSTRUMENTS.find(i => i.id === patch.instrument);
          if (ins) patch.instrumentLive = ins.live;
        }
        tCase = mergeCase(tCase, patch);
        for (const k of (sem.unavailable || [])) markUnavailable(tCase, k);
      }
    } catch { /* interpretation is an enhancement — never a failure path */ }
  }

  // ── VOICE NUMERIC CONFIRMATION ───────────────────────────────────────────
  // Speech-to-text mis-hears digits ("4380" vs "4800", "0.10 lot" vs "1.0 lot"),
  // and a wrong entry or stop silently corrupts every downstream calculation.
  // So a trade number first captured from a SPOKEN turn is read back once for
  // confirmation instead of being trusted. Typed numbers are not re-confirmed —
  // the trader can already see what they wrote. Nothing is altered or normalised
  // either way; this only asks.
  if (body.viaVoice) {
    const heard = [];
    if (before.entry == null && tCase.entry != null) heard.push(['entry', 'Entry', tCase.entry]);
    if (before.stop_loss == null && tCase.stop_loss != null) heard.push(['stop_loss', 'Stop Loss', tCase.stop_loss]);
    if (before.take_profit == null && tCase.take_profit != null) heard.push(['take_profit', 'Take Profit', tCase.take_profit]);
    if (before.position_size == null && tCase.position_size != null) heard.push(['position_size', 'Size', tCase.position_size]);
    const unconfirmed = heard.filter(([k]) => !(tCase.voice_confirmed || []).includes(k));
    if (unconfirmed.length) {
      tCase.voice_confirmed = Array.from(new Set([...(tCase.voice_confirmed || []), ...unconfirmed.map(h => h[0])]));
      const L = [T.heardCheck];
      for (const [, label, val] of unconfirmed) L.push(`- **${label}: ${val}**`);
      L.push('');
      L.push(T.heardConfirm);
      return respond({ mode: 'confirm', reply: L.join('\n'), tradeCase: tCase });
    }
  }

  // 3 ── QUESTION ENGINE — a mentor's turn, not a form.
  // Once anything at all is known the trader gets ONE question, phrased as a
  // sentence, after a short acknowledgement of what was just understood. Two are
  // only ever asked on a cold open, where there is nothing to acknowledge yet.
  // A field already supplied is never asked about again (see `asked` + isFilled),
  // which is what stops the "enter instrument / enter entry / enter stop" feel.
  if (!readyForAnalysis(tCase)) {
    const known = caseSummary(tCase);
    const qs = nextQuestions(tCase, known ? 1 : 2);
    if (qs.length) {
      tCase.asked = Array.from(new Set([...(tCase.asked || []), ...qs.map(q => q.key)]));
      tCase.last_asked = qs[0].key;   // referent for a following "I don't know"
      const out = [];

      // Acknowledge a language switch once, on the turn it was asked for.
      if (L.switched && T.switched) out.push(T.switched);

      // Reflect back pressure the trader EXPRESSED — hedged, and only once.
      if (tCase.emotional_state === 'pressure_expressed' && !tCase.pressure_ack && T.senseUnsure) {
        tCase.pressure_ack = true;
        out.push(T.senseUnsure);
      }

      out.push(known ? T.gotIt(known) : T.start);
      out.push('');
      if (qs.length > 1) {
        out.push(T.needTwo);
        for (const q of qs) out.push(`- ${questionText(q, lang)}`);
      } else {
        out.push(`${T.nextOne} ${questionText(qs[0], lang)}`);
      }
      if (!missingRequired(tCase).length) out.push(`\n${T.andThen || T.thenAnalyse}`);
      return respond({ mode: 'question', reply: out.join('\n'), tradeCase: tCase });
    }
  }

  // 4 ── EVIDENCE (current, timestamped, or explicitly unavailable)
  const evidence = await collectEvidence(origin, tCase);

  // 5 ── ANALYSIS
  const analysis = runAnalysis(tCase, evidence);
  const knowledge = selectKnowledge(tCase, evidence, 6);

  // 6 ── SYNTHESIS — LLM rewrites the grounded brief; deterministic on failure
  const brief = buildBrief(tCase, evidence, analysis, knowledge);
  let reply = '';
  let synthesizedBy = 'deterministic';
  try {
    const llm = await generateTradeRescueReport(env, brief, lang);
    if (llm && llm.length > 200) { reply = llm; synthesizedBy = 'llm'; }
  } catch { /* fall through to deterministic */ }
  if (!reply) reply = renderDeterministic(tCase, evidence, analysis, knowledge);
  // The deterministic fallback is composed in English. When the trader is not
  // writing in English and the LLM (which carries the language) was unavailable,
  // say so in their language rather than silently handing back English.
  if (synthesizedBy === 'deterministic' && T.englishNote) reply += `\n\n${T.englishNote}`;
  reply += `\n\n${T.disclaimer}`;

  return respond({
    mode: 'analysis',
    reply,
    tradeCase: tCase,
    evidence: {
      collectedAt: evidence.collectedAt,
      priceStatus: evidence.priceStatus,
      priceAt: evidence.priceAt,
      newsStatus: evidence.newsStatus,
      calendarStatus: evidence.calendarStatus,
      unavailable: evidence.unavailable,
      provenance: provenanceLines(evidence),
    },
    debug: body.debug ? { synthesizedBy, balance: analysis.weighed.balance, counts: analysis.weighed.counts, knowledge: knowledge.map(k => k.id), brief } : undefined,
  });
}
