// functions/utils/relevance-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11C.0B — RELEVANCE ENFORCEMENT (NO TOPIC DRIFT). Decides what may and
// may NOT appear in an answer, so the assistant stays on the asked topic:
//   • relevanceEngine(text, ctx) → { primaryIntent, primaryEntity, allowedTopics,
//                                     forbiddenTopics, confidence, relevanceScore }
//   • enforceRelevance(conceptMeta, rel) → keep|reject  (gates KB/graph hits)
//   • recommendRelevantTool(intent, uNeed) → ONE relevant tool id | null
//   • applyEntityFilter(answer, rel) → drops the non-primary instrument's line
//     (Gold question must not show a BTC price line, and vice-versa)
// Pure (no I/O), Language-Lock safe (only filters whitelisted instrument codes).
// ════════════════════════════════════════════════════════════════════════════

const ALL_MARKET = ['gold', 'xau', 'btc', 'bitcoin', 'forex', 'market', 'macro', 'analysis'];

function entityOf(s) {
  if (/\b(gold|xau|xauusd)\b/i.test(s)) return 'Gold';
  if (/\b(btc|bitcoin|bit ?coin)\b/i.test(s)) return 'BTC';
  if (/\b(forex|eur ?usd|gbp ?usd|usd ?jpy|currency pair)\b/i.test(s)) return 'Forex';
  return null;
}

// Per-intent allow/forbid (lowercase topic keywords matched as substrings).
const POLICY = {
  gold:       { allow: ['gold', 'xau', 'market', 'risk'],                   forbid: ['btc', 'bitcoin', 'psychology', 'broker', 'regulation', 'course'] },
  btc:        { allow: ['btc', 'bitcoin', 'market', 'risk'],                forbid: ['gold', 'xau', 'psychology', 'broker', 'regulation', 'course'] },
  macro:      { allow: ['macro', 'market', 'risk', 'gold', 'btc'],          forbid: ['psychology', 'broker', 'course'] },
  brief:      { allow: ['market', 'macro', 'gold', 'btc', 'risk'],          forbid: ['psychology', 'broker', 'course'] },
  mood:       { allow: ['market', 'sentiment', 'risk'],                     forbid: ['broker', 'course'] },
  events:     { allow: ['news', 'event', 'macro', 'market'],                forbid: ['broker', 'course'] },
  session:    { allow: ['session', 'timing', 'market'],                     forbid: ['broker', 'course'] },
  psychology: { allow: ['psychology', 'risk', 'recovery', 'discipline', 'self', 'journal'], forbid: ['broker', 'regulation', 'platform'] },
  whylosing:  { allow: ['psychology', 'risk', 'recovery', 'discipline', 'execution', 'self'], forbid: ['broker', 'regulation', 'platform'] },
  stuck:      { allow: ['psychology', 'risk', 'recovery', 'market'],        forbid: ['broker', 'regulation', 'course'] },
  career:     { allow: ['career', 'risk', 'psychology', 'development'],     forbid: ['broker', 'regulation'] },
  broker:     { allow: ['broker', 'regulation', 'platform', 'account'],     forbid: ['gold', 'xau', 'btc', 'psychology', 'strategy'] },
  islamic:    { allow: ['islamic', 'halal', 'broker', 'swap'],              forbid: ['analysis', 'psychology', 'strategy'] },
  assess:     { allow: ['assessment', 'trade', 'risk'],                     forbid: ['broker', 'course', 'psychology'] },
  lotsize:    { allow: ['risk', 'position', 'lot', 'assessment'],           forbid: ['broker', 'course', 'psychology'] },
  riskmgmt:   { allow: ['risk', 'position', 'money', 'drawdown'],           forbid: ['broker', 'course'] },
  strategy:   { allow: ['strategy', 'system', 'setup', 'risk'],             forbid: ['broker', 'regulation'] },
  technical:  { allow: ['technical', 'structure', 'analysis', 'market'],    forbid: ['broker', 'regulation', 'course'] },
  smalltalk:  { allow: ['conversation'],                                    forbid: ALL_MARKET.concat(['broker', 'psychology', 'strategy', 'course', 'tool']) },
  greeting:   { allow: ['conversation'],                                    forbid: ALL_MARKET.concat(['broker', 'psychology', 'strategy', 'course', 'tool']) },
};

export function relevanceEngine(text, { intent, category, statusInstrument } = {}) {
  const s = String(text || '').toLowerCase();
  const primaryIntent = intent || 'fallback';
  const primaryEntity = statusInstrument || entityOf(s) || (['Gold', 'BTC', 'Forex'].includes(category) ? category : null);
  const pol = POLICY[primaryIntent] || { allow: [], forbid: [] };
  const confidence = POLICY[primaryIntent] ? 'HIGH' : 'MEDIUM';
  return {
    primaryIntent, primaryEntity,
    allowedTopics: pol.allow, forbiddenTopics: pol.forbid,
    confidence, relevanceScore: POLICY[primaryIntent] ? 90 : 50,
  };
}

// Gate a retrieved KB/graph concept against the question's relevance frame.
export function enforceRelevance(conceptMeta = {}, rel = {}) {
  const cat = String(conceptMeta.category || '').toLowerCase();
  const tags = (conceptMeta.relevanceTags || conceptMeta.concepts || []).map(t => String(t).toLowerCase());
  const hay = [cat, ...tags];
  if ((rel.forbiddenTopics || []).some(f => hay.some(h => h.includes(f)))) return false;       // hard reject
  if ((rel.allowedTopics || []).length) {
    const overlap = (rel.allowedTopics).some(a => hay.some(h => h.includes(a)));
    if (!overlap) return rel.confidence === 'HIGH' ? false : true;   // off-topic + we're sure → reject
  }
  return true;
}

// ONE relevant tool only (no menus, no spam). null when none fits.
const TOOL_BY_INTENT = {
  assess: 'trade-assessment', lotsize: 'lot-calculator', riskmgmt: 'position-size',
  chart: 'chart-analysis', whylosing: 'trader-self-assessment', psychology: 'trader-self-assessment',
  stuck: 'trader-self-assessment', career: 'trader-self-assessment',
};
export function recommendRelevantTool(intent, uNeed) {
  if (uNeed && uNeed.found && ['recovery', 'why-losing', 'psychology', 'discipline'].includes(uNeed.need)) return 'trader-self-assessment';
  return TOOL_BY_INTENT[intent] || null;
}

// Drop the non-primary instrument's snapshot line (instrument codes are
// whitelisted, so this is Language-Lock safe). Idempotent.
export function applyEntityFilter(answer, rel = {}) {
  if (!answer || !rel.primaryEntity) return answer;
  let out = answer;
  if (rel.primaryEntity === 'Gold') out = out.replace(/^\s*[-•]\s*(Bitcoin|BTC)\s*\(BTC\/USD\):.*\n?/gim, '');
  else if (rel.primaryEntity === 'BTC') out = out.replace(/^\s*[-•]\s*Gold\s*\(XAU\/USD\):.*\n?/gim, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
