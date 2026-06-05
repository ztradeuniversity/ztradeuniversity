// functions/utils/question-cognition.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 10.5 — COGNITIVE ANALYZER. Builds on Phase 10 question-awareness and
// adds the "understand → think" layer: what the user actually wants (hiddenGoal),
// their level, emotional tone, ambiguity, and a confidence seed. Pure (no I/O).
// ════════════════════════════════════════════════════════════════════════════

import { analyzeQuestion } from './question-awareness.js';

const LEVEL_ADVANCED = /\b(advanced|liquidity|order block|smc|confluence|backtest|expectancy|r[- ]?multiple|sharpe|algo|institutional|imbalance|fair value gap|fvg)\b/;
const LEVEL_BEGINNER = /\b(beginner|new to trading|just start|how do i start|the basics|don'?t understand|confused|noob|newbie|never traded)\b/;

const EMOTION = [
  ['frustrated', /\b(losing|lost it|blown|blew|frustrat|angry|fed up|tired of|give up|can'?t win|keep losing|hopeless)\b/],
  ['anxious',    /\b(scared|afraid|nervous|worried|fear|panic|confused|overwhelm|stress)\b/],
  ['excited',    /\b(excited|can'?t wait|let'?s go|ready to|pumped|finally)\b/],
  ['curious',    /\b(how|why|what is|explain|teach|learn|curious|understand)\b/],
];

export function analyzeCognition(text, { memoryData, traderContext } = {}) {
  const s = String(text || '').toLowerCase();
  const a = analyzeQuestion(text);
  const words = s.split(/\s+/).filter(Boolean).length;

  // userLevel: stored profile wins, then explicit text hints, else beginner.
  let userLevel = memoryData?.profile?.trader_level || traderContext?.level || 'beginner';
  if (LEVEL_ADVANCED.test(s)) userLevel = 'advanced';
  else if (LEVEL_BEGINNER.test(s)) userLevel = 'beginner';

  // emotionalTone
  let emotionalTone = 'neutral';
  for (const [t, re] of EMOTION) if (re.test(s)) { emotionalTone = t; break; }

  // hiddenGoal — what they actually want beneath the words
  let hiddenGoal = null;
  if (/\b(should i|is it (a )?good time|worth (buying|selling)|will (gold|btc|bitcoin|it|price) (go|rise|drop|fall|pump|crash))\b/.test(s)) hiddenGoal = 'seeking_direction';
  else if (/\b(losing|not profitable|keep losing|blown|can'?t win)\b/.test(s)) hiddenGoal = 'stop_losing';
  else if (a.category === 'Trading Career') hiddenGoal = 'build_wealth';
  else if (a.marketDumpAllowed) hiddenGoal = 'market_read';
  else if (a.goal === 'learn' || a.category === 'Beginner Learning') hiddenGoal = 'learn_skill';

  // ambiguity — too vague to answer well
  const pronounOnly = /\b(it|this|that|them|those)\b/.test(s) && words <= 4 && a.category === 'General Trading';
  const ambiguity = (a.category === 'General Trading' && words <= 3) || pronounOnly ? 'high' : 'low';

  return {
    intent: a.category,
    goal: a.goal,
    hiddenGoal,
    userLevel,
    answerDepth: null,            // set by answer-depth.js
    ambiguity,
    confidence: ambiguity === 'high' ? 'low' : (a.confidence || 'high'),
    emotionalTone,
    requiresClarification: false, // set by confidence-engine.js
    _qa: a,                       // pass-through Phase 10 analysis
  };
}
