// functions/utils/conversation-intelligence.js
// ════════════════════════════════════════════════════════════════════════════
// CONVERSATION INTELLIGENCE LAYER (Final Conversation Phase, Task 1/2/4/8).
//
// Reason-before-routing for CONVERSATIONAL turns: a greeting, thanks, farewell,
// "how are you", or "who are you / what can you do" must NEVER be routed to a
// knowledge source — no market data, no prices, no articles, no LLM generation.
// (Production bug this fixes: "hi" / "helo" were reaching the live-market
// awareness blocks — via the conversation-state layer carrying the thread's
// active instrument into vague text — and being answered with a full Gold
// technical view, sometimes with a hallucinated stale price.)
//
// This module is the FINAL AUTHORITY for those turns in ai-chat.js: it produces
// a short, warm, human reply that (a) answers the social gesture, (b) recognizes
// a signed-in user ("Welcome back"), and (c) ends with ONE natural follow-up
// question so the conversation never dead-ends (Task 8).
//
// Deterministic variation via humanize.vary (same reply for the same input —
// testable — but different phrasings across different inputs, so it never feels
// like a fixed template). English-only by design: for ur / ur-roman / ar the
// caller falls through to the existing localized greeting templates
// (engine-i18n), preserving the Language Lock exactly. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// The intents this layer owns. Kept to the two PURELY social intents —
// 'offtopic' keeps its own dedicated redirect (knowledge-engine.buildOffTopic).
export const CONVERSATIONAL_INTENTS = new Set(['greeting', 'smalltalk']);

const GREET = [
  'Hello 👋 Welcome. How can I help you today?',
  "Hi — it's good to see you. What would you like to work on today?",
  'Hey! What shall we look at today — market context, a trade, or something you want to learn?',
];

const THANKS = [
  "You're welcome — glad it helped. Is there anything else you'd like help with?",
  'Anytime! Anything else you want to dig into — Gold, BTC, or a trading concept?',
];

const BYE = [
  'Take care — I wish you successful trading. See you again. 👋',
  'Goodbye — trade safe and protect your capital. See you next time. 👋',
];

const HOWRU = [
  "I'm doing well, thank you for asking! What's on your mind today — Gold, BTC, or something you'd like to learn?",
  "All good here, thanks! What would you like to look at — market context, a trade you're weighing, or a concept?",
];

const CAPABILITIES =
  "I'm the ZTU AI Trading Assistant. I can walk you through **Gold (XAU/USD)** and **Bitcoin** market context, " +
  'trading concepts, **risk management**, trade assessment, chart structure, and trading **psychology** — education only, never signals. ' +
  'What would you like to start with?';

export function buildConversationalReply({ text, intent, lang = 'en', verified = false, firstTurn = true } = {}) {
  if (lang !== 'en') return null;                          // Language Lock — localized templates handle other langs
  if (!CONVERSATIONAL_INTENTS.has(intent)) return null;
  const s = String(text || '').toLowerCase();

  // Signed-in recognition (Task 4): greet a verified member as a member, once,
  // on the conversation's opening turn — never on thanks/bye mid-conversation.
  const wb = (verified && firstTurn) ? "Welcome back — you're signed in. " : '';

  // Salam → customary reply first (preserves the existing cultural behavior).
  if (/\b(salam|assalam|asalam|aslam|salaam|assalamu)\b/.test(s)) {
    return `**Wa Alaikum Assalam** — I hope you're doing well today. ${wb}How can I help you with trading today?`;
  }
  if (/\b(thank|thanks|thankyou|thank u|thx|shukr|jazak|appreciate)\b/.test(s)) return vary(THANKS, s);
  if (/\b(bye|goodbye|good night|see you|see ya|take care|hafiz)\b/.test(s))    return vary(BYE, s);
  if (/\b(how are you|how r u|how are u|how'?s it going|hows it going|kaise|kya haal)\b/.test(s)) return vary(HOWRU, s);
  if (/^good morning\b/.test(s))   return `Good morning! I hope you're having a great day. ${wb}How can I help you with trading today?`;
  if (/^good afternoon\b/.test(s)) return `Good afternoon! ${wb}How can I help you with trading today?`;
  if (/^good evening\b/.test(s))   return `Good evening! ${wb}How can I help you with trading today?`;
  if (/\b(who are you|what can you do|how do you work|features|what are you)\b/.test(s)) return wb + CAPABILITIES;

  return wb + vary(GREET, s);
}
