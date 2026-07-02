// functions/utils/journey-flow.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 30 — JOURNEY FLOW (no dead ends)
// The capstone guarantee: a student should NEVER hit a reply with no way forward.
// When the graph-derived Phase 19 suggestion chips and Phase 23 action chips both
// come back empty (e.g. the graph isn't provisioned, or a short status/fallback
// answer), this supplies a small set of ALWAYS-ANSWERABLE navigation chips so there
// is always a clickable next step.
//
// These are not knowledge claims — they are navigation to capabilities the free
// engine answers WITHOUT the graph (career, risk, psychology, gold, smart-money…),
// so clicking one never dead-ends. Reuses the existing Phase 19 suggestions event +
// renderer (the chips are plain strings, label === query). Pure (no I/O).
// Language-Lock safe: prompts carry whitelisted English trading keywords so they
// classify correctly while the reply language follows the user.
// ════════════════════════════════════════════════════════════════════════════

// Beginner-facing starting points — each maps to a real engine intent that answers
// offline (knowledge/career/riskmgmt/psychology/gold). ≤5 words (mobile, STEP 4).
const STARTER = {
  beginner: {
    en:         ['What is trading?', 'Risk management basics', 'Trading psychology', 'How to become profitable'],
    ur:         ['Trading کیا ہے؟', 'Risk management کی بنیادیں', 'Trading psychology', 'Profitable کیسے بنوں؟'],
    'ur-roman': ['Trading kya hai?', 'Risk management basics', 'Trading psychology', 'Profitable kaise banun?'],
    ar:         ['ما هو التداول؟', 'أساسيات إدارة المخاطر (risk)', 'سيكولوجيا التداول (psychology)', 'كيف أصبح مربحاً (profitable)؟'],
  },
  advanced: {
    en:         ['Smart money concepts', 'Liquidity and structure', 'Build a trading edge', 'Risk per trade'],
    ur:         ['Smart money concepts', 'Liquidity اور structure', 'Trading edge کیسے بنائیں', 'Risk per trade'],
    'ur-roman': ['Smart money concepts', 'Liquidity aur structure', 'Trading edge kaise banayein', 'Risk per trade'],
    ar:         ['مفاهيم smart money', 'السيولة liquidity والبنية', 'بناء ميزة trading edge', 'المخاطرة لكل صفقة (risk)'],
  },
};

// Returns 2–4 short navigation chips (strings) guaranteeing a path forward.
export function fallbackPathChips({ lang = 'en', level = 'beginner' } = {}) {
  const tier = level === 'advanced' ? 'advanced' : 'beginner';
  const set = STARTER[tier];
  const arr = (set[lang] || set.en).slice(0, 4);
  // de-dupe defensively; keep ≤4
  const seen = new Set();
  return arr.filter(s => s && !seen.has(s) && seen.add(s)).slice(0, 4);
}
