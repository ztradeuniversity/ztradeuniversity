// functions/utils/session-memory.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 14 — SMART SESSION MEMORY
// Derives educational session state from existing data: message history,
// persisted profile, merged traderContext, and recent-recap array.
// NO new database tables. NO new storage. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

// Map intent/keyword → human-readable topic label
const TOPIC_MAP = [
  [/\b(riskmgmt|risk.?management|position.?siz|lot.?size|stop.?loss)\b/i, 'Risk Management'],
  [/\b(psychology|psych|emotional|fomo|revenge|discipline)\b/i,           'Trading Psychology'],
  [/\b(whylosing|why.*losing|keep losing|not profitable)\b/i,             'Why Am I Losing'],
  [/\b(assess|trade.?assessment|rr|r:r|risk.?reward)\b/i,                 'Trade Assessment'],
  [/\b(strategy|setup|entry|confluence|system)\b/i,                       'Strategy'],
  [/\b(technical|structure|support|resistance|trend|breakout|smc|order.?block)\b/i, 'Technical Analysis'],
  [/\b(macro|dxy|yields|cpi|fomc|nfp|fundamentals)\b/i,                   'Macro Context'],
  [/\b(gold|xau)\b/i,                                                      'Gold Analysis'],
  [/\b(btc|bitcoin)\b/i,                                                   'Bitcoin Analysis'],
  [/\b(broker|account.?type|ecn|spread|commission)\b/i,                   'Broker Selection'],
  [/\b(career|profitable|consistent|full.?time|living)\b/i,               'Trading Career'],
  [/\b(islamic|halal|riba|swap.?free)\b/i,                                 'Islamic Trading'],
  [/\b(funding|prop.?firm|ftmo|challenge)\b/i,                            'Prop Firms & Funding'],
];

const PRACTICE_RE  = /\b(practice|drill|exercise|apply|try this|log|journal it|notice what)\b/i;
const MISSION_RE   = /\b(mission|task|goal|challenge|homework|assignment|your next)\b/i;
const LOSS_RE      = /\b(lost|lose|losing|blew|blown|drawdown|down bad|struggling|wipeout)\b/i;
const CHALLENGE_RE = /\b(push your thinking|more advanced angle|separates good|next level|challenge)\b/i;

function topicFrom(text) {
  const t = String(text || '');
  for (const [re, label] of TOPIC_MAP) if (re.test(t)) return label;
  return null;
}

// Scan message history for the most recent topic discussed in an assistant turn.
function detectLastTopic(messages, recentRecap) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const t = topicFrom(messages[i].content);
      if (t) return t;
    }
  }
  // Fallback: scan recent user recap strings
  for (const r of [...(recentRecap || [])].reverse()) {
    const t = topicFrom(r);
    if (t) return t;
  }
  return null;
}

// Check if the last few assistant turns contained a practice/drill offer.
function detectLastPractice(messages) {
  const limit = Math.max(0, messages.length - 8);
  for (let i = messages.length - 1; i >= limit; i--) {
    if (messages[i].role === 'assistant' && PRACTICE_RE.test(messages[i].content || '')) return true;
  }
  return false;
}

// Check if a mission-type suggestion was made recently.
function detectLastMission(messages) {
  const limit = Math.max(0, messages.length - 8);
  for (let i = messages.length - 1; i >= limit; i--) {
    if (MISSION_RE.test(messages[i]?.content || '')) return true;
  }
  return false;
}

// Check if a challenge/advanced framing was used recently (to avoid repeating it).
function detectRecentChallenge(messages) {
  const limit = Math.max(0, messages.length - 6);
  for (let i = messages.length - 1; i >= limit; i--) {
    if (messages[i].role === 'assistant' && CHALLENGE_RE.test(messages[i].content || '')) return true;
  }
  return false;
}

// Check if the user's last few messages mention losses (signals Struggling Trader).
function detectRecentLoss(messages) {
  const userMsgs = messages.filter(m => m.role === 'user').slice(-3);
  return userMsgs.some(m => LOSS_RE.test(m.content || ''));
}

// Derive the current learning path label from level + conversation count.
function derivePath(profile, traderContext) {
  const level = profile.trader_level || traderContext.level || null;
  const convs  = Math.max(profile.conversation_count ?? 0, traderContext.conversations ?? 0);
  if (level === 'advanced')                       return 'performance-mastery';
  if (level === 'intermediate' || convs >= 5)     return 'strategy-execution';
  return 'beginner-fundamentals';
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

export function buildSessionMemory(messages = [], profile = {}, traderContext = {}, recentRecap = []) {
  const weaknesses = Array.isArray(profile.weaknesses) ? profile.weaknesses :
                     Array.isArray(traderContext.weaknesses) ? traderContext.weaknesses : [];

  return {
    lastTopic:       detectLastTopic(messages, recentRecap),
    currentPath:     derivePath(profile, traderContext),
    lastMission:     detectLastMission(messages),
    lastPractice:    detectLastPractice(messages),
    lastWeakArea:    weaknesses[0] || null,
    recentLoss:      detectRecentLoss(messages),
    recentChallenge: detectRecentChallenge(messages),
  };
}

// Natural mentor phrases referencing the last topic.
// Returns '' when no topic is known (never fabricates context).
const RECALL = {
  en: [
    t => `You've been exploring ${t} — let's build on that.`,
    t => `Continuing from our ${t} discussion:`,
    t => `Building on the ${t} work we've been doing:`,
  ],
  ur: [
    t => `جیسا کہ آپ ${t} سیکھ رہے تھے، آگے بڑھتے ہیں۔`,
    t => `${t} کی گفتگو کو جاری رکھتے ہوئے:`,
  ],
  'ur-roman': [
    t => `Jaise ke aap ${t} seekh rahe the, aage badhte hain.`,
    t => `${t} ki guftagu ko jaari rakhte hue:`,
  ],
  ar: [
    t => `استناداً إلى ما كنت تتعلمه حول ${t}، لنكمل.`,
    t => `بناءً على نقاش ${t}:`,
  ],
};

export function formatSessionRecall(sessionMem = {}, lang = 'en', seed = '') {
  if (!sessionMem.lastTopic) return '';
  const arr = RECALL[lang] || RECALL.en;
  if (!arr || !arr.length) return '';
  const fn = vary(arr, seed || sessionMem.lastTopic);
  if (typeof fn !== 'function') return '';
  return fn(sessionMem.lastTopic);
}
