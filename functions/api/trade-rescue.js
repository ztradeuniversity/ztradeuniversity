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

import { emptyCase, mergeCase, extractFromText, nextQuestions, readyForAnalysis, missingRequired, caseSummary, questionText } from '../utils/trade-rescue/case.js';
import { collectEvidence, provenanceLines } from '../utils/trade-rescue/evidence.js';
import { runAnalysis, KIND } from '../utils/trade-rescue/analysis.js';
import { selectKnowledge } from '../utils/trade-rescue/knowledge.js';
import { generateTradeRescueReport } from '../utils/composer-llm.js';

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
  },
  ur: {
    disclaimer: '_یہ اس وقت دستیاب evidence کی بنیاد پر decision-support ہے — کوئی guaranteed نتیجہ نہیں، اور نہ ہی financial advice۔ Market حالات کسی بھی وقت بدل سکتے ہیں، اور آپ کی اپنی position کا فیصلہ ہمیشہ آپ کا ہے۔_',
    gotIt: (s) => `سمجھ گیا — ${s}۔`,
    start: 'ٹھیک ہے، پہلے مجھے اس ٹریڈ کی تفصیل بتائیں۔',
    needTwo: 'مکمل تجزیے سے پہلے مجھے دو چیزیں درکار ہیں:',
    needOne: 'ایک چیز اور درکار ہے:',
    thenAnalyse: 'اس کے بعد میں موجودہ market data لے کر آپ کو مکمل تجزیہ دوں گا۔',
    englishNote: '_تفصیلی تجزیہ اس وقت انگریزی میں دستیاب ہے۔_',
  },
  ar: {
    disclaimer: '_هذا دعم لاتخاذ القرار بناءً على الأدلة المتاحة الآن — وليس نتيجة مضمونة ولا نصيحة مالية. ظروف السوق قد تتغير في أي وقت، والقرار بشأن مركزك يبقى قرارك أنت._',
    gotIt: (s) => `تمام — ${s}.`,
    start: 'حسناً، دعني أفهم تفاصيل هذه الصفقة أولاً.',
    needTwo: 'أحتاج أمرين قبل أن أحللها بشكل صحيح:',
    needOne: 'ما زلت أحتاج أمراً واحداً:',
    thenAnalyse: 'بعد ذلك سأجلب بيانات السوق الحالية وأعطيك التحليل الكامل.',
    englishNote: '_التحليل التفصيلي متاح حالياً باللغة الإنجليزية._',
  },
};
const pickL10n = (lang) => L10N[String(lang || 'en').slice(0, 2).toLowerCase()] || L10N.en;

// ── SCOPE GATE ───────────────────────────────────────────────────────────────
// Trade Rescue answers ONE kind of question. Anything else is declined with a
// clear pointer rather than silently handed to the general chatbot — the task's
// TEST 10 behaviour, made explicit instead of implicit.
const TRADE_SIGNALS = /\b(trade|position|entry|entered|buy|sell|long|short|stop ?loss|sl\b|take ?profit|tp\b|lot|pip|drawdown|floating|stuck|underwater|losing|profit|hold|close|exit|margin|hedge|averag)\b/i;
// Non-Latin scope vocabulary is matched as plain substrings — JavaScript's \b is
// ASCII-only and never fires beside Arabic/Urdu characters, so a regex with
// boundaries silently rejects every Urdu and Arabic message.
const NON_LATIN_SIGNALS = [
  'ٹریڈ', 'پوزیشن', 'خرید', 'فروخت', 'نقصان', 'منافع', 'سٹاپ', 'سودا',   // Urdu
  'صفقة', 'شراء', 'بيع', 'خسارة', 'ربح', 'وقف', 'مركز',                    // Arabic
];

function inScope(text, tradeCase) {
  if (tradeCase && (tradeCase.instrument || tradeCase.direction || tradeCase.entry != null)) return true;
  const t = String(text || '');
  return TRADE_SIGNALS.test(t) || NON_LATIN_SIGNALS.some(w => t.includes(w));
}

const SCOPE_REPLY = [
  "I'm **ZTU Trade Rescue** — I work on one thing: helping you think through a trade you're already in.",
  '',
  'Tell me about an open position and I\'ll take it from there — for example:',
  '• _"My Gold buy is stuck, I\'m 40 points down"_',
  '• _"I\'m short BTC from 82,000 with no stop loss"_',
  '• _"Should I hold my XAU/USD long over the weekend?"_',
  '',
  "I'll ask a few questions about the trade, pull the current market data I can verify, and give you a structured read on where it stands.",
  '',
  'For general trading education — what a concept means, how a strategy works — the [AI Trading Assistant](/ai-trade-assistant.html) is the right place. I deliberately don\'t answer those here, so this stays a trade-management tool.',
].join('\n');

// ── DETERMINISTIC BRIEF ──────────────────────────────────────────────────────
// The complete, factual report. Also the exact text handed to the LLM, so the
// model can only ever rewrite facts that are already grounded.
function buildBrief(c, ev, analysis, knowledge) {
  const L = [];
  L.push(`TRADE CASE: ${caseSummary(c) || '(incomplete)'}`);
  if (c.original_thesis) L.push(`Trader's original thesis: ${c.original_thesis}`);
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
  const lang = String(body.lang || 'en').slice(0, 8);
  const origin = new URL(request.url).origin;
  const T = pickL10n(lang);
  let tCase = mergeCase(emptyCase(), body.tradeCase || {});

  // 1 ── SCOPE GATE
  if (!inScope(message, tCase)) {
    return json({ mode: 'scope', reply: SCOPE_REPLY, tradeCase: tCase });
  }

  // 2 ── EXTRACT + MERGE
  tCase = mergeCase(tCase, extractFromText(message, tCase));
  tCase.turns = (tCase.turns || 0) + 1;

  // 3 ── QUESTION ENGINE
  if (!readyForAnalysis(tCase)) {
    const qs = nextQuestions(tCase, 2);
    if (qs.length) {
      tCase.asked = Array.from(new Set([...(tCase.asked || []), ...qs.map(q => q.key)]));
      const known = caseSummary(tCase);
      const L = [];
      L.push(known ? T.gotIt(known) : T.start);
      L.push('');
      L.push(qs.length > 1 ? T.needTwo : T.needOne);
      for (const q of qs) L.push(`- ${questionText(q, lang)}`);
      if (!missingRequired(tCase).length) L.push(`\n${T.thenAnalyse}`);
      return json({ mode: 'question', reply: L.join('\n'), tradeCase: tCase });
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

  return json({
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
