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
// Trader Intelligence, Conversation-Context transforms, Journey, Conversion).
//
// PHASE NEXT+4 — Trader Intelligence is now wired into the LIVE flow here (and
// ONLY here). No protected engine/module was modified; the intelligence modules
// are consumed read-only and their output is appended as light, throttled
// decoration that always preserves the safety guardrails (no signals).
// ════════════════════════════════════════════════════════════════════════════

import {
  detectLanguage, classifyIntent, classifyFollowup, resolveGeo,
} from './intent-engine.js';
import {
  condense, whyPreface, expandBlock, levelNote, conversionCTA,
} from './response-engine.js';
import { buildCoachIntro } from './psychology-engine.js';
import { route }           from './specialist-router.js';
// Language Lock — fully-localized bodies (prevents English/Urdu mixing)
import { hasLocale, localizedBody, localizedExpand } from './engine-i18n.js';
// Production Upgrade — honest disclosure for selectable languages that are
// detected/answered correctly but not yet fully translated (id/ms/vi/bn/th).
import { partialLanguageNote, PARTIAL_LANGS } from './language-intel.js';

// Trader Intelligence (read-only consumers — these modules are unchanged)
import {
  estimateProfile, detectWeaknesses, detectStrengths, analyzePsychology,
} from './trader-intelligence.js';
import { personalizationDirectives } from './personalization-engine.js';
import { buildLearningPath }         from './learning-path.js';

// Re-export the public detection API (consumed by /api/ai-chat.js — unchanged)
export { detectLanguage, classifyIntent, classifyFollowup, resolveGeo };

// Intents substantive enough to carry an intelligence insight.
const INSIGHT_INTENTS = new Set([
  'whylosing', 'stuck', 'assess', 'gold', 'btc', 'psychology',
  'riskmgmt', 'strategy', 'technical', 'brief',
]);
const LEARN_INTENTS = new Set(['strategy', 'technical', 'knowledge']);

// ── LIVE TRADER INTELLIGENCE LAYER (Modules 1–6, throttled, guardrailed) ─────
// Returns at most ONE insight line + at most ONE learning nudge. Never fires on
// follow-up transforms, never on greeting/signal/broker/etc., never a signal.
function buildIntelligenceLayer(ctx, profile) {
  const tc = ctx.traderContext;
  if (!tc || ctx.mode) return '';                 // need a profile; skip transforms
  if (!INSIGHT_INTENTS.has(ctx.intent)) return '';

  const text  = ctx.text || '';
  const parts = [];

  // M4 Psychology — only where Coach Mode didn't already cover it (it covers
  // whylosing/stuck), so add for gold/btc/assess/brief/riskmgmt/strategy/technical.
  const coachHandledPsych = (ctx.intent === 'whylosing' || ctx.intent === 'stuck');
  if (!coachHandledPsych) {
    const psych = analyzePsychology(tc, text);
    if (psych.observations.length) {
      const o = psych.observations[0];
      parts.push(`🧠 _Psychology note: I'm sensing some **${o.emotion}** — ${o.note}_`);
    }
  }

  // M2/M3 Weakness / Strength — one only, with real signal, no overuse.
  if (parts.length === 0) {
    const wk = detectWeaknesses(tc, [], text);
    const st = detectStrengths(tc, [], text);
    if ((ctx.intent === 'whylosing' || ctx.intent === 'assess' || ctx.intent === 'riskmgmt') && wk.sentence) {
      parts.push(`🔎 _${wk.sentence}_`);
    } else if (st.sentence && ((tc.discipline ?? 0) >= 7 || (tc.patience ?? 0) >= 7 || (tc.confidence ?? 0) >= 7)) {
      parts.push(`💪 _${st.sentence}_`);
    } else if (wk.sentence && (tc.conversations ?? 0) >= 4) {
      parts.push(`🔎 _${wk.sentence}_`);
    }
  }

  // M6 Learning recommendation — only a few intents / beginners; no dup with CTA.
  let learn = '';
  const beginnerCore = profile.experience === 'beginner' && (ctx.intent === 'gold' || ctx.intent === 'btc');
  if (LEARN_INTENTS.has(ctx.intent) || beginnerCore) {
    const pathTitle = buildLearningPath(profile.experience || 'beginner', tc.topWeakness || null).title;
    learn = `\n\n🗺️ _Your level fits the **${pathTitle}** — ask me for a "learning roadmap" whenever you want the step-by-step._`;
  }

  const insight = parts.length ? ('\n\n' + parts[0]) : '';
  return insight + learn;
}

// Master response generator: detect → route → decorate.
//   Order: Coach intro → Direct answer/context/risk (specialist body) →
//          Psychology/Weakness/Strength insight → Learning rec → Tool rec.
export function generateResponse(ctx) {
  // ── LANGUAGE LOCK ─────────────────────────────────────────────────────────
  // When the user has locked a fully-supported language (Urdu / Roman Urdu /
  // Arabic), build the ENTIRE reply from localized bodies and skip all English
  // decorations (coach / intelligence / level / CTA) so nothing mixes.
  if (hasLocale(ctx.lang)) {
    let lbody = localizedBody(ctx.intent, ctx.lang, ctx);
    if      (ctx.mode === 'short')  lbody = condense(lbody, ctx.lang);
    else if (ctx.mode === 'expand') lbody = lbody + localizedExpand(ctx.lang);
    else if (ctx.mode === 'why')    lbody = whyPreface(ctx.lang) + lbody;
    return lbody;
  }

  // M1/M5: live trader profiling + personalization directives (read-only)
  const profile     = estimateProfile(ctx.traderContext, []);
  const personalize = personalizationDirectives(profile, { topWeaknessKey: ctx.traderContext?.topWeakness });
  // `profile`/`personalize` inform throttling + learning level below; existing
  // Trader-Journey levelNote already adapts depth for beginner/advanced.

  const coach = buildCoachIntro(ctx.traderContext, ctx.intent);   // Coach Mode
  let   body  = route(ctx);                                       // Specialist Router

  // Conversation Context transforms (follow-up modes)
  if      (ctx.mode === 'short')  body = condense(body, ctx.lang);
  else if (ctx.mode === 'expand') body = body + expandBlock(ctx);
  else if (ctx.mode === 'why')    body = whyPreface(ctx.lang) + body;

  // Live Trader Intelligence insight + learning nudge (throttled; never on transforms)
  const intel = buildIntelligenceLayer(ctx, profile);

  // Trader Journey + Conversion Engine (tool recommendation) — skipped on summaries
  const extra = ctx.mode === 'short' ? '' : (levelNote(ctx.traderContext, ctx.intent) + conversionCTA(ctx.intent));

  // PRODUCTION UPGRADE — honest partial-language disclosure. Only fires for the
  // 5 selectable-but-not-yet-translated languages; never for en/ur/ur-roman/ar
  // (those are handled above or need no note). Additive: when ctx.lang is
  // anything else (undetected/legacy callers), PARTIAL_LANGS.has() is false and
  // this is a no-op — byte-for-byte unchanged behavior.
  const partialNote = PARTIAL_LANGS.has(ctx.lang) ? `\n\n${partialLanguageNote(ctx.lang)}` : '';

  return coach + body + intel + extra + partialNote;
}
