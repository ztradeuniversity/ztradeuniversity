// functions/utils/kb-schema.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 11A.4 — KNOWLEDGE BASE SCHEMA (foundation for Phase 11B / 11C).
//
// Every Trading Knowledge entry follows this shape so the 1000+ question base
// drops in naturally and the semantic retriever can score it:
//
//   { id, category, subcategory, level,
//     concepts:[],            // semantic tags (see semantic-retrieval CONCEPTS)
//     questionPatterns:[],    // example phrasings users might type
//     shortAnswer, deepAnswer,// depth-aware bodies (answer.depth picks one)
//     related:[] }            // ids of related entries
//
// A small SEED set proves the pipeline end-to-end; 11B/11C will expand it
// (and add localized bodies). English bodies only for now (Language Lock note).
// ════════════════════════════════════════════════════════════════════════════

export const KB_LEVELS = ['beginner', 'intermediate', 'advanced'];

export function validateEntry(e) {
  return !!(e && e.id && e.category && Array.isArray(e.questionPatterns) && (e.shortAnswer || e.deepAnswer));
}

export const KB_SEED = [
  {
    id: 'recovery-001', category: 'Trading Career', subcategory: 'Account Recovery', level: 'beginner',
    concepts: ['account-recovery', 'risk-management', 'psychology'],
    questionPatterns: ['how do i stop losing my account', 'i keep losing accounts', 'how to recover after blowing my account', 'rebuild my account', 'i lost my account what do i do'],
    shortAnswer: "Recovery starts with one rule: risk so little per trade (0.5–1%) that no losing streak can end you. Rebuild the **habit** before the balance — small, consistent, boring trades are how accounts come back.",
    deepAnswer: "Recovering a blown account is mostly psychological and procedural, not strategic. 1) Drop risk to 0.5–1% per trade so survival is guaranteed. 2) Trade one setup only until it's consistent. 3) Journal every trade and review weekly. 4) Set a daily loss limit and stop when hit. The balance follows the process — chasing the loss back is what blew it the first time.",
    related: ['risk-001', 'dev-001'],
  },
  {
    id: 'risk-001', category: 'Risk Management', subcategory: 'Risk Management Errors', level: 'beginner',
    concepts: ['risk-management'],
    questionPatterns: ['i keep getting stopped out', 'why do i get stopped out', 'my stop loss keeps getting hit', 'where to place my stop', 'stops too tight'],
    shortAnswer: "Getting stopped out repeatedly usually means your stop sits at an obvious level or is too tight for the timeframe. Place it **beyond structure** (where your idea is actually wrong), size smaller, and let the trade breathe.",
    deepAnswer: "Repeated stop-outs come from three things: (1) stops at round numbers / obvious swing points where liquidity sits, (2) stops too tight for the volatility of your timeframe, (3) entering before confirmation so you're early. Fix: place the stop beyond the level that invalidates your idea, then size the position so that distance is still only 1–2% of your account. Wider, smarter stop + smaller size beats a tight stop that keeps getting tagged.",
    related: ['recovery-001'],
  },
  {
    id: 'dev-001', category: 'Trading Career', subcategory: 'Trader Development', level: 'beginner',
    concepts: ['trader-development', 'psychology', 'risk-management'],
    questionPatterns: ['i want to become profitable', 'how do i get better at trading', 'how to be a consistent trader', 'trader development', 'how do i improve'],
    shortAnswer: "Becoming profitable is a process, not a jackpot: **one repeatable setup**, strict 1–2% risk, a journal, and patience. Skill compounds — most accounts blow from rushing this, not from a bad strategy.",
    deepAnswer: "Trader development has a predictable arc: survive → consistent → profitable → scalable. Most people skip 'survive' and over-risk. The path: master one setup, risk 1–2% max, journal every trade with the reason and the emotion, review weekly to find your repeating mistake, and only increase size after a long stretch of disciplined execution. Profit is the by-product of process + risk control + patience.",
    related: ['risk-001', 'recovery-001'],
  },
];
