// functions/utils/pattern-engine.js
// ════════════════════════════════════════════════════════════════════════════
// PATTERN ENGINE — the pattern KNOWLEDGE layer (education + catalog) and the
// architecture spec for the future Pattern Detection Overlay.
//
// ── PATTERN DETECTION OVERLAY ARCHITECTURE (future) ──────────────────────────
// Current state:  client-side heuristic chart vision (analyzeChartImage in
//                 ai-trade-assistant.html) extracts a price series → swings →
//                 classifies patterns → draws an overlay → sends {trend,patterns,
//                 levels} to /api/ai-chat which routes here for the EDUCATION.
//
// Future upgrade path (architecture only — not implemented here):
//   1. DETECT   → richer client vision OR server vision worker returns
//                 { patterns:[{key, confidence, zone:{x1,y1,x2,y2}}], levels, trend }
//   2. OVERLAY  → draw pattern zones / necklines / S-R bands on the chart canvas
//   3. EXPLAIN  → PATTERN_EDU[key] supplies logic + expected behaviour
//   4. PROBABILITY → optional ai_pattern_vault stats (win/loss %, sample size)
//   No signal generation. No guaranteed direction. Education + probability only.
// ════════════════════════════════════════════════════════════════════════════

// Catalog of patterns the system understands (keys align with the client vision).
export const PATTERN_CATALOG = [
  'double-top', 'double-bottom', 'head-shoulders', 'inverse-head-shoulders',
  'symmetrical-triangle', 'ascending-triangle', 'descending-triangle',
  'rising-wedge', 'falling-wedge', 'bull-flag', 'bear-flag',
  'channel', 'range', 'breakout', 'liquidity-sweep', 'support-resistance',
  'uptrend', 'downtrend',
];

// Educational knowledge for each pattern. Framing is ALWAYS probabilistic &
// educational — never a signal or a guaranteed move.
export const PATTERN_EDU = {
  'double-top':            { name: 'Double Top', bias: 'bearish reversal', logic: 'two peaks at a similar level with a trough between — buyers failed twice at resistance.', expected: 'historically often precedes a possible bearish reversal **if** the neckline (the trough) breaks with momentum.', watch: 'a clean neckline break vs. a third push into resistance (failure).' },
  'double-bottom':         { name: 'Double Bottom', bias: 'bullish reversal', logic: 'two troughs at a similar level with a peak between — sellers failed twice at support.', expected: 'historically often indicates a possible bullish reversal after the support level holds and the neckline breaks upward.', watch: 'neckline break with rising volume vs. a third drop into support (failure).' },
  'head-shoulders':        { name: 'Head & Shoulders', bias: 'bearish reversal', logic: 'three peaks — the middle (head) highest, two lower shoulders.', expected: 'one of the more reliable reversal structures; a neckline break *may* signal a possible downside move roughly equal to head-to-neckline height.', watch: 'the neckline break and whether the right shoulder forms on weaker momentum.' },
  'inverse-head-shoulders':{ name: 'Inverse Head & Shoulders', bias: 'bullish reversal', logic: 'three troughs — the middle (head) lowest, two higher shoulders.', expected: 'a neckline break upward *may* signal a possible bullish reversal; measured target ≈ head-to-neckline height.', watch: 'volume expansion on the neckline break.' },
  'ascending-triangle':    { name: 'Ascending Triangle', bias: 'bullish bias', logic: 'flat resistance with rising support — buyers stepping in higher each time.', expected: 'often resolves with a possible upside breakout, though false breaks are common.', watch: 'a decisive close above the flat resistance.' },
  'descending-triangle':   { name: 'Descending Triangle', bias: 'bearish bias', logic: 'flat support with falling resistance — sellers pressing lower each time.', expected: 'often resolves with a possible downside breakdown.', watch: 'a decisive close below the flat support.' },
  'symmetrical-triangle':  { name: 'Symmetrical Triangle', bias: 'neutral / continuation', logic: 'converging highs and lows — coiling energy, indecision.', expected: 'tends to break in the direction of the prior trend roughly two-thirds of the time — but direction is not guaranteed.', watch: 'which side breaks first, ideally with momentum.' },
  'rising-wedge':          { name: 'Rising Wedge', bias: 'bearish warning', logic: 'converging upward lines with weakening momentum.', expected: 'despite the upward slope, this often warns of a possible downside reversal.', watch: 'a break of the lower wedge line.' },
  'falling-wedge':         { name: 'Falling Wedge', bias: 'bullish signal', logic: 'converging downward lines with fading selling pressure.', expected: 'often precedes a possible upside move once the upper line breaks.', watch: 'a break above the upper wedge line.' },
  'bull-flag':             { name: 'Bull Flag', bias: 'bullish continuation', logic: 'a sharp rise (pole) then a tight downward/sideways consolidation (flag).', expected: 'often continues the prior up-move after a breakout — measured move ≈ the pole height.', watch: 'breakout above the flag on renewed momentum.' },
  'bear-flag':             { name: 'Bear Flag', bias: 'bearish continuation', logic: 'a sharp drop (pole) then a tight upward/sideways consolidation.', expected: 'often continues the prior down-move after a breakdown.', watch: 'breakdown below the flag.' },
  'channel':               { name: 'Channel', bias: 'trend continuation', logic: 'price moving between two parallel sloped lines.', expected: 'price tends to respect the channel until a clear break; the break direction often sets the next leg.', watch: 'reactions at the channel edges and any breakout.' },
  'range':                 { name: 'Range / Consolidation', bias: 'neutral', logic: 'price oscillating between horizontal support and resistance.', expected: 'ranges tend to persist until a confirmed breakout; edges often offer the cleanest reactions.', watch: 'a decisive break of either boundary.' },
  'breakout':              { name: 'Breakout Structure', bias: 'momentum', logic: 'price pushing beyond a established level after consolidation.', expected: 'breakouts *may* extend with momentum or fail (fakeout) — retests of the broken level are common.', watch: 'whether the broken level holds on a retest.' },
  'liquidity-sweep':       { name: 'Liquidity Sweep', bias: 'reversal context', logic: 'a sharp spike beyond an obvious high/low that quickly reverses — stops were taken.', expected: 'the snap-back *may* signal a reversal as trapped traders exit, but confirmation matters.', watch: 'price reclaiming the swept level quickly.' },
  'support-resistance':    { name: 'Support / Resistance', bias: 'structural', logic: 'horizontal levels where price has repeatedly reacted.', expected: 'these levels often produce reactions; the more touches, the more significant — until broken.', watch: 'reactions and clean breaks of the key level.' },
  'uptrend':               { name: 'Uptrend Structure', bias: 'bullish structure', logic: 'a sequence of higher highs and higher lows.', expected: 'trends tend to persist until structure breaks (a lower low).', watch: 'whether higher lows keep forming.' },
  'downtrend':             { name: 'Downtrend Structure', bias: 'bearish structure', logic: 'a sequence of lower highs and lower lows.', expected: 'trends tend to persist until structure breaks (a higher high).', watch: 'whether lower highs keep forming.' },
};
