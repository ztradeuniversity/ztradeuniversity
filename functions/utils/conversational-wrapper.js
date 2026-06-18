// functions/utils/conversational-wrapper.js
// ════════════════════════════════════════════════════════════════════════════
// CONVERSATIONAL RESPONSE WRAPPER (additive, post-composition).
// Wraps a SUBSTANTIVE educational answer (graph / database / openai sources) in a
// human conversational envelope:  [greeting?] + [acknowledgement] + main answer.
// Follow-up suggestions (chips) and the source badge are already emitted as SSE
// events by ai-chat — this only supplies the greeting + acknowledgement that were
// missing. It is purely a string transform: no retrieval/routing/priority change.
//
// Guards (so it never doubles up or fires where it shouldn't):
//   • Only for answerSource in {graph, database, openai} — never market(live)/safe/
//     clarify (those keep their exact current text → priority preserved).
//   • Greeting only on the FIRST user message of a session.
//   • Skips when the answer already opens with a greeting/acknowledgement.
// Localized (en / ur / ur-roman / ar); English default. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

const GREET = {
  en:         ['Hey! 👋', 'Hi there! 👋', 'Good to have you here. 👋'],
  ur:         ['خوش آمدید! 👋', 'سلام! 👋'],
  'ur-roman': ['Assalam o alaikum! 👋', 'Khush aamdeed! 👋'],
  ar:         ['أهلاً بك! 👋', 'مرحباً! 👋'],
};
const ACK = {
  en:         ['Good question', 'Good one', 'Glad you asked'],   // trimmed effusive praise (no "Love this question")
  ur:         ['اچھا سوال', 'بہترین سوال'],
  'ur-roman': ['Achha sawal', 'Behtareen sawal'],
  ar:         ['سؤال ممتاز', 'سؤال جيد'],
};
const ABOUT = { en: 'about', ur: 'کے بارے میں', 'ur-roman': 'ke baare mein', ar: 'حول' };

const pick = (m, lang) => m[lang] || m.en;

// Sources this wrapper applies to — substantive educational answers only.
const WRAPPABLE = new Set(['graph', 'database', 'openai']);

// Heuristic: does the text already begin with a greeting/acknowledgement so we don't
// stack a second one? Checks only the opening to stay cheap + safe.
function alreadyOpens(answer) {
  const head = String(answer || '').trimStart().slice(0, 60).toLowerCase();
  return /^(hey|hi|hello|assalam|salam|salaam|👋|great question|good one|glad you asked|love this question|achha|behtareen|أهلا|مرحبا|سؤال|خوش|سلام)/.test(head);
}

// Build the conversational envelope. Returns the answer unchanged when it should not
// apply, so the caller can assign unconditionally.
export function wrapConversational(answer, { messages = [], answerSource = 'safe', topic = '', lang = 'en', isFirstMessage = false } = {}) {
  const body = String(answer || '');
  if (!body.trim()) return answer;
  if (!WRAPPABLE.has(answerSource)) return answer;     // preserve live/safe/clarify text exactly
  if (alreadyOpens(body)) return answer;               // never double-greet / double-ack

  const seed = body.slice(0, 40);
  const t = String(topic || '').trim();

  const userTurns = messages.filter(m => m && m.role === 'user').length;
  const firstTurn = isFirstMessage || userTurns <= 1;
  const greet = firstTurn ? vary(pick(GREET, lang), seed) : '';

  // ANTI-OVERUSE: a warm acknowledgement on the first turn, then only OCCASIONALLY
  // (every ~3rd turn) — never on every reply — so it doesn't become repetitive praise.
  // Deterministic by turn count; most later turns open straight with the answer (more
  // expert-like). Greeting stays first-turn-only.
  const wantAck = firstTurn || (userTurns % 3 === 0);
  const ack = wantAck ? (t ? `${vary(pick(ACK, lang), seed)} ${pick(ABOUT, lang)} ${t} —` : `${vary(pick(ACK, lang), seed)} —`) : '';

  const opener = [greet, ack].filter(Boolean).join(' ');
  return opener ? `${opener} ${body}` : body;
}
