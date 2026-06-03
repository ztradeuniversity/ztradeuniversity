// functions/utils/ai-engine.js
// ════════════════════════════════════════════════════════════════════════════
// ZTU AI ENGINE — MASTER ORCHESTRATION LAYER (zero paid API)
//
// This file is intentionally THIN. All domain logic lives in focused modules:
//
//   intent-engine.js      → language detection, multi-layer intent + follow-up
//                           classification, country/timezone resolution
//   specialist-router.js  → routes an intent to the right specialist module
//   market-engine.js      → Gold / BTC / macro / mood / session / events / brief
//   psychology-engine.js  → coach intro, stuck-trade, why-losing, personality
//   broker-engine.js      → broker knowledge (level-aware depth)
//   knowledge-engine.js   → greeting, education, risk, strategy, technical,
//                           funding, self-assess, satisfaction fallback
//   chart-engine.js       → chart-structure explanation
//   pattern-engine.js     → pattern knowledge + overlay architecture
//   response-engine.js    → localization, formatting, transforms, decorators
//
// The orchestrator's only job: detect → route → decorate (Coach Mode,
// Conversation-Context transforms, Trader Journey, Conversion Engine).
// ════════════════════════════════════════════════════════════════════════════

import {
  detectLanguage, classifyIntent, classifyFollowup, resolveGeo,
} from './intent-engine.js';
import {
  condense, whyPreface, expandBlock, levelNote, conversionCTA,
} from './response-engine.js';
import { buildCoachIntro } from './psychology-engine.js';
import { route }           from './specialist-router.js';

// Re-export the public detection API (consumed by /api/ai-chat.js — unchanged)
export { detectLanguage, classifyIntent, classifyFollowup, resolveGeo };

// Master response generator: route to the specialist, then decorate.
export function generateResponse(ctx) {
  const coach = buildCoachIntro(ctx.traderContext, ctx.intent);   // Coach Mode
  let   body  = route(ctx);                                       // Specialist Router

  // Conversation Context transforms (follow-up modes)
  if      (ctx.mode === 'short')  body = condense(body, ctx.lang);
  else if (ctx.mode === 'expand') body = body + expandBlock(ctx);
  else if (ctx.mode === 'why')    body = whyPreface(ctx.lang) + body;

  // Trader Journey + Conversion Engine (skipped on short summaries)
  const extra = ctx.mode === 'short' ? '' : (levelNote(ctx.traderContext, ctx.intent) + conversionCTA(ctx.intent));

  return coach + body + extra;
}
