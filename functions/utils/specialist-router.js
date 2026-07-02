// functions/utils/specialist-router.js
// ════════════════════════════════════════════════════════════════════════════
// TRADING SPECIALIST ROUTER — the AI behaves as several specialists. Given a
// classified intent, this routes to the correct specialist module and returns
// the answer body (+ disclaimer). The user never sees the routing.
//
//   Market Analyst   → market-engine
//   Trading Coach    → psychology-engine (stuck / why-losing)
//   Psychology Coach → psychology-engine + knowledge-engine
//   Broker Expert    → broker-engine
//   Beginner Mentor  → knowledge-engine (greeting / strategy / technical / self-assess)
//   Risk Manager     → knowledge-engine (assess / lotsize / risk management)
//   Chart Analyst    → chart-engine
// ════════════════════════════════════════════════════════════════════════════

import { loc } from './response-engine.js';
import * as market    from './market-engine.js';
import * as psych     from './psychology-engine.js';
import * as broker    from './broker-engine.js';
import * as edu       from './knowledge-engine.js';
import { buildChartResponse } from './chart-engine.js';

export function route(ctx) {
  const { intent, lang } = ctx;
  const disc = '\n\n' + loc(lang).disclaimer;

  switch (intent) {
    // ── Market Analyst ──
    case 'gold':    return market.buildGold(ctx)    + disc;
    case 'btc':     return market.buildBtc(ctx)     + disc;
    case 'macro':   return market.buildMacro(ctx)   + disc;
    case 'mood':    return market.buildMood(ctx)    + disc;
    case 'session': return market.buildSession(ctx) + disc;
    case 'events':  return market.buildEvents(ctx)  + disc;
    case 'brief':   return market.buildBrief(ctx)   + disc;

    // ── Trading / Psychology Coach ──
    case 'stuck':     return psych.buildStuck(ctx)     + disc;
    case 'whylosing': return psych.buildWhyLosing(ctx) + disc;
    case 'psychology':
    case 'knowledge': return edu.buildKnowledge(ctx)   + disc;

    // ── Broker Expert ──
    case 'broker': return broker.buildBrokerResponse(ctx) + disc;

    // ── Chart Analyst ──
    case 'chart': {
      const c = buildChartResponse(ctx.chartAnalysis, lang);
      if (c) return c + disc;
      return `## 📊 Chart Image Intelligence\nUpload a chart screenshot using the **image button** next to the message box, and I'll analyse its structure — trend, support/resistance, and patterns like double tops/bottoms, head & shoulders, triangles, wedges, flags, channels, ranges, and liquidity sweeps — then explain the **probability and logic** (never a signal).` + disc;
    }

    // ── Beginner Mentor / Education ──
    case 'greeting':   return edu.buildGreeting(ctx)   + disc;
    case 'smalltalk':  return edu.buildSmallTalk(ctx)  + disc;
    case 'platform':   return edu.buildPlatform(ctx)   + disc;
    case 'strategy':   return edu.buildStrategy(ctx)   + disc;
    case 'technical':  return edu.buildTechnical(ctx)  + disc;
    case 'funding':    return edu.buildFunding(ctx)    + disc;
    case 'selfassess':  return edu.buildSelfAssess(ctx) + disc;
    case 'aboutme':     return edu.buildAboutMe(ctx)    + disc;
    case 'career':      return edu.buildCareer(ctx)     + disc;
    case 'islamic':     return edu.buildIslamic(ctx)    + disc;
    case 'profileinfo': return edu.buildProfileAck(ctx) + disc;
    case 'offtopic':    return edu.buildOffTopic(ctx)   + disc;
    case 'setcountry':  return edu.buildSetCountry(ctx) + disc;

    // ── Risk Manager ──
    case 'assess':   return edu.buildAssess(ctx)  + disc;
    case 'lotsize':  return edu.buildLotsize(ctx) + disc;
    case 'riskmgmt': return edu.buildRiskMgmt(ctx) + disc;

    // ── Signal routing guardrail ──
    case 'signal': return edu.buildSignal(ctx) + disc;

    // ── User Satisfaction fallback ──
    case 'fallback':
    default: return edu.buildFallback(ctx) + disc;
  }
}
