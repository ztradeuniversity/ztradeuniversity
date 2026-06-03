// functions/utils/trader-intelligence.js
// ════════════════════════════════════════════════════════════════════════════
// TRADER INTELLIGENCE ENGINE — Profiling (M1), Weakness (M2), Strength (M3),
// Psychology (M4), Evolution (M5). ARCHITECTURE / FOUNDATION.
//
// Pure analysis functions: they work NOW from signals the client already
// produces (traderContext + Trader-Mirror patterns/scores) and categorised
// memory. NOTHING is persisted here. Future persistence targets ONLY the
// existing canonical tables: ai_user_profiles + ai_chat_memory.
//
// Reads-only inputs (never mutates existing engines):
//   traderContext = { level, type, patterns{}, patience, discipline,
//                     confidence, conversations, topWeakness, improved[] }
//   memory        = [{ category, content, psychology_flags, intent }]   (future)
// ════════════════════════════════════════════════════════════════════════════

// ── MODULE 1 — TRADER PROFILING ──────────────────────────────────────────────
export const TRADER_PROFILES = {
  experience: ['beginner', 'intermediate', 'advanced'],
  style:      ['scalper', 'day-trader', 'swing-trader', 'position-trader', 'funded-candidate'],
  behavioral: ['emotional-trader', 'overtrader'],
};

// Estimate a multi-dimensional profile from existing signals (no questions asked).
export function estimateProfile(traderContext = {}, memory = []) {
  const tc = traderContext || {};
  const p  = tc.patterns || {};

  const experience = tc.level || (tc.conversations > 20 ? 'advanced' : tc.conversations < 6 ? 'beginner' : 'intermediate');

  // Style: prefer an explicit detected style/type, else infer from memory cues.
  let style = null;
  if (tc.type === 'funded')  style = 'funded-candidate';
  else if (tc.type === 'scalper') style = 'scalper';
  else if (tc.type === 'swing')   style = 'swing-trader';
  if (!style) {
    const styleHits = memory.filter(m => m.category === 'trading-style').map(m => (m.content || '').toLowerCase()).join(' ');
    if (/scalp|m1|m5|tick/.test(styleHits)) style = 'scalper';
    else if (/swing|daily|4h|weekly/.test(styleHits)) style = 'swing-trader';
    else if (/position|long.?term/.test(styleHits)) style = 'position-trader';
    else if (/intraday|day trad/.test(styleHits)) style = 'day-trader';
  }

  const behavioral = [];
  if ((p.overtrading ?? 0) >= 3) behavioral.push('overtrader');
  if (((p.fear ?? 0) + (p.revenge ?? 0) + (p.fomo ?? 0)) >= 4) behavioral.push('emotional-trader');

  return {
    experience,
    style: style || null,
    behavioral,
    confidence: tc.conversations >= 5 ? 'estimated' : 'tentative',
    futureTable: 'ai_user_profiles', // trader_level / trader_type / trading_style
  };
}

// ── MODULE 2 — WEAKNESS DETECTION ────────────────────────────────────────────
const WEAKNESS_RULES = [
  { key: 'no-stop-loss',   label: 'trading without a stop loss',        from: m => /no stop|without (a )?stop/.test(m) },
  { key: 'fomo',           label: 'FOMO / chasing entries',             from: (m, p) => (p.fomo ?? 0) >= 2 || /fomo|missed the move|too late/.test(m) },
  { key: 'revenge',        label: 'revenge trading after losses',       from: (m, p) => (p.revenge ?? 0) >= 2 || /revenge|make it back/.test(m) },
  { key: 'overtrading',    label: 'overtrading — too many trades',      from: (m, p) => (p.overtrading ?? 0) >= 2 || /overtrad|too many trades/.test(m) },
  { key: 'news-gambling',  label: 'gambling around news events',        from: m => /news (gamble|gambling)|trade the news|enter before (cpi|nfp|fomc)/.test(m) },
  { key: 'poor-risk',      label: 'poor risk management',               from: (m, p) => /no risk|too much risk|overleverage|big lot/.test(m) },
  { key: 'impulsive',      label: 'impulsive entries',                  from: m => /impulsiv|entered without|jumped in/.test(m) },
  { key: 'no-patience',    label: 'lack of patience',                   from: (m, p) => (p.fomo ?? 0) + (p.overtrading ?? 0) >= 3 || /no patience|can'?t wait|forcing trades/.test(m) },
];

// Returns ranked weaknesses + a ready-to-use sentence.
export function detectWeaknesses(traderContext = {}, memory = [], latestText = '') {
  const p = traderContext.patterns || {};
  const corpus = (latestText + ' ' + memory.map(m => m.content || '').join(' ')).toLowerCase();
  const found = WEAKNESS_RULES.filter(r => { try { return r.from(corpus, p); } catch { return false; } });
  const top = found[0] || (traderContext.topWeakness ? { key: traderContext.topWeakness, label: traderContext.topWeakness } : null);
  return {
    weaknesses: found.map(f => ({ key: f.key, label: f.label })),
    sentence: top ? `Your most common weakness appears to be **${top.label}**.` : null,
    futureTable: 'ai_user_profiles (weaknesses[]) + ai_chat_memory (category=weakness)',
  };
}

// ── MODULE 3 — STRENGTH DETECTION ────────────────────────────────────────────
export function detectStrengths(traderContext = {}, memory = [], latestText = '') {
  const tc = traderContext || {};
  const corpus = (latestText + ' ' + memory.map(m => m.content || '').join(' ')).toLowerCase();
  const strengths = [];
  if ((tc.patience ?? 0)   >= 7) strengths.push('good patience');
  if ((tc.discipline ?? 0) >= 7) strengths.push('strong discipline');
  if ((tc.confidence ?? 0) >= 7) strengths.push('healthy confidence');
  if (/respected my stop|stuck to my stop|set (a |my )?stop/.test(corpus)) strengths.push('consistent stop-loss discipline');
  if (/followed (my )?plan|stuck to (my )?plan|my trading plan/.test(corpus)) strengths.push('good planning');
  if (/journal/.test(corpus)) strengths.push('strong journaling habit');
  if (/waited for (confirmation|the setup)/.test(corpus)) strengths.push('patience for confirmation');
  const uniq = [...new Set(strengths)];
  return {
    strengths: uniq,
    sentence: uniq.length ? `One of your strengths appears to be **${uniq[0]}**.` : null,
    futureTable: 'ai_user_profiles (strengths[])',
  };
}

// ── MODULE 4 — PSYCHOLOGY INTELLIGENCE ───────────────────────────────────────
export function analyzePsychology(traderContext = {}, latestText = '') {
  const p = traderContext.patterns || {};
  const s = (latestText || '').toLowerCase();
  const obs = [];
  if ((p.revenge ?? 0) >= 2 || /angry|frustrat|make it back/.test(s)) obs.push({ emotion: 'frustration / revenge mentality', note: 'losses are triggering emotional, not strategic, decisions.' });
  if ((p.fear ?? 0) >= 2 || /scared|afraid|what if it (drops|crashes)/.test(s)) obs.push({ emotion: 'fear', note: 'hesitation and risk-avoidance beyond healthy caution.' });
  if (/greed|over ?leverage|all in|max lot|double down/.test(s)) obs.push({ emotion: 'greed', note: 'reaching for outsized gains raises ruin risk.' });
  if ((p.fomo ?? 0) >= 2) obs.push({ emotion: 'emotional pressure (FOMO)', note: 'fear of missing out is forcing premature entries.' });
  if ((traderContext.confidence ?? 0) >= 7 && !obs.length) obs.push({ emotion: 'steady confidence', note: 'calm, process-focused tone — keep reinforcing it.' });
  return {
    observations: obs,
    summary: obs.length ? obs.map(o => `• **${o.emotion}** — ${o.note}`).join('\n') : null,
    futureTable: 'ai_chat_memory (category=psychology) + ai_user_profiles (psychology_score)',
  };
}

// ── MODULE 5 — TRADER EVOLUTION (past vs present) ────────────────────────────
// Compares two score snapshots (e.g., earliest vs latest from ai_user_profiles
// history / the client snapshots) and produces a progress summary.
export function compareEvolution(past = {}, present = {}) {
  const dims = [
    ['discipline', 'stop-loss discipline'],
    ['patience',   'patience'],
    ['confidence', 'confidence'],
    ['risk',       'risk control'],     // note: for risk, LOWER is better
    ['psychology', 'emotional control'],
  ];
  const improved = [], regressed = [];
  for (const [k, label] of dims) {
    const a = past[k], b = present[k];
    if (a == null || b == null) continue;
    const delta = (k === 'risk') ? (a - b) : (b - a); // risk improvement = decrease
    if (delta >= 2) improved.push(label);
    else if (delta <= -2) regressed.push(label);
  }
  const lines = [];
  improved.forEach(l => lines.push(`📈 Your **${l}** has improved.`));
  regressed.forEach(l => lines.push(`⚠️ Your **${l}** has slipped a little — worth refocusing on.`));
  return {
    improved, regressed,
    summary: lines.length ? lines.join('\n') : 'Not enough history yet to measure change — keep going and I\'ll track your progress.',
    futureSource: 'ai_user_profiles score columns over time (snapshots)',
  };
}

// FUTURE: persist a derived profile to ai_user_profiles (stub until connected).
export async function persistProfile(/* env, deviceId, profile */) {
  return { configured: false, table: 'ai_user_profiles' };
}
