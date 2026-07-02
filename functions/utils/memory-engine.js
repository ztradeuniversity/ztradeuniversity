// functions/utils/memory-engine.js
// ════════════════════════════════════════════════════════════════════════════
// TRADER MEMORY ENGINE (Module 2) + MEMORY SCORING (Module 3) + CLEANUP (Module 7)
// ARCHITECTURE / FOUNDATION ONLY — nothing is persisted yet.
//
// SINGLE memory design — maps to the already-planned AI Supabase tables:
//   • ai_user_profiles  → rolled-up identity, preferences, and the 5 scores
//   • ai_chat_memory     → individual categorised memory entries (the log)
//
// No second/alternative storage model is introduced. Stubs return
// `configured:false` until the ZTU Chatbot AI Supabase is connected later.
// ════════════════════════════════════════════════════════════════════════════

// ── MODULE 2 — MEMORY CATEGORIES (every entry is tagged with one) ────────────
export const MEMORY_CATEGORIES = [
  'question',            // a question the trader asked
  'mistake',             // a trading mistake observed
  'weakness',            // recurring weakness
  'strength',            // demonstrated strength
  'psychology',          // psychology observation (fomo/fear/revenge/hesitation…)
  'risk-behavior',       // sizing / stop / leverage behaviour
  'trading-style',       // scalper / intraday / swing / trend / funded
  'broker-preference',   // brokers the trader uses / asks about
  'language',            // language preference
];

// Shape of one ai_chat_memory row (categorised memory entry).
export const CHAT_MEMORY_SCHEMA = {
  id:              'uuid',
  device_id:       'text  → ai_user_profiles.device_id',
  created_at:      'timestamptz',
  category:        `text  (one of MEMORY_CATEGORIES)`,
  role:            "text  ('user' | 'assistant')",
  content:         'text  (trimmed)',
  intent:          'text  (classifyIntent result, e.g. gold/whylosing/broker)',
  psychology_flags:'text[] (fomo/fear/revenge/hesitation/overtrading)',
  weight:          'int   (importance 0–10 — drives retention)',
  pinned:          'boolean (never auto-pruned)',
  expires_at:      'timestamptz (nullable — soft TTL for low-value noise)',
};

// Rolled-up fields living on ai_user_profiles (one row per device).
export const PROFILE_MEMORY_FIELDS = {
  language_pref:      'text',
  trader_level:       "text ('beginner'|'intermediate'|'advanced')",
  trader_type:        "text ('emotional'|'overtrader'|'scalper'|'swing'|'funded')",
  trading_style:      'text',
  broker_preferences: 'text[]',
  strengths:          'text[]',
  weaknesses:         'text[]',
  behavior_notes:     'text[]',
  conversation_count: 'int',
};

// ── MODULE 3 — MEMORY SCORING (0–10, improves over time) ─────────────────────
export const SCORE_DEFINITIONS = {
  discipline_score: { range: [0, 10], raisedBy: ['respecting stops', 'following a plan'], loweredBy: ['moving stops', 'revenge', 'overtrading'] },
  patience_score:   { range: [0, 10], raisedBy: ['waiting for setups', 'plan mentions'],  loweredBy: ['fomo', 'overtrading'] },
  confidence_score: { range: [0, 10], raisedBy: ['consistency', 'tenure'],                loweredBy: ['hesitation', 'fear'] },
  risk_score:       { range: [0, 10], note: 'risk EXPOSURE (higher = riskier behaviour)', raisedBy: ['overleverage', 'no stop'], loweredBy: ['fixed % risk', 'stop discipline'] },
  psychology_score: { range: [0, 10], note: 'composite emotional control',                raisedBy: ['calm framing'], loweredBy: ['fomo', 'fear', 'revenge'] },
};

// The client already computes these locally (Trader Mirror V2 / updateTraderV2).
// FUTURE: persist + smooth them on ai_user_profiles so they improve over time
// across devices/sessions. Smoothing recommendation: EMA (new = 0.7·old + 0.3·sample).
export const SCORE_SMOOTHING = { method: 'EMA', alpha: 0.3, persistTo: 'ai_user_profiles' };

// ── MODULE 7 — MEMORY CLEANUP / RETENTION POLICY ─────────────────────────────
export const RETENTION_POLICY = {
  keepAlways:      ['pinned = true', 'category in (strength, weakness, trading-style, broker-preference, language)'],
  decay:           'category = question  → soft TTL 60 days unless weight ≥ 7',
  pruneNoise:      'weight ≤ 2 AND age > 30 days → eligible for removal',
  hardCapPerDevice: 500,            // max ai_chat_memory rows per device
  onCapExceeded:   'remove lowest-weight, oldest, non-pinned rows first',
  rollupBeforePrune:'fold recurring patterns into ai_user_profiles (strengths/weaknesses/scores) before deleting raw rows',
};

// ── CONNECTED to ZTU Chatbot AI Supabase (canonical tables) ──────────────────
// All calls no-op gracefully (configured:false) until credentials are provided.
import {
  isConfigured,
  insertChatMemory,
  getChatMemory,
  updateScores as sbUpdateScores,
  pruneChatMemory,
} from './ai-supabase.js';

// Module 2 — write a categorised memory entry to ai_chat_memory.
export async function recordMemory(env, { deviceId, category, role, content, intent, flags, weight, pinned } = {}) {
  if (!isConfigured(env)) return { configured: false, saved: false, table: 'ai_chat_memory' };
  const row = await insertChatMemory(env, deviceId, {
    role, content, intent,
    category: category || 'question',
    psychologyFlags: flags || [],
    weight, pinned,
  });
  return { configured: true, saved: !!row, table: 'ai_chat_memory' };
}

// Read recent categorised memory for a device.
export async function getMemory(env, { deviceId, category, limit = 12 } = {}) {
  if (!isConfigured(env)) return { configured: false, entries: [], table: 'ai_chat_memory' };
  const entries = await getChatMemory(env, deviceId, { category, limit });
  return { configured: true, entries, table: 'ai_chat_memory' };
}

// Module 4 — persist the five behaviour scores (+ optional rolled-up fields).
export async function updateScores(env, { deviceId, scores = {}, extra = {} } = {}) {
  if (!isConfigured(env)) return { configured: false, updated: false, table: 'ai_user_profiles' };
  const row = await sbUpdateScores(env, deviceId, scores, extra);
  return { configured: true, updated: !!row, table: 'ai_user_profiles' };
}

// Module 7 — retention cleanup per RETENTION_POLICY (low-weight, old, non-pinned).
export async function pruneMemory(env, deviceId) {
  if (!isConfigured(env)) return { configured: false, pruned: 0, policy: 'RETENTION_POLICY' };
  await pruneChatMemory(env, deviceId, { maxAgeDays: 30, maxWeight: RETENTION_POLICY.pruneNoiseMaxWeight || 2 });
  return { configured: true, table: 'ai_chat_memory', policy: 'RETENTION_POLICY' };
}

// Pure helper (safe now): classify which memory category a turn belongs to,
// from an intent + detected psychology flags. Future writers call this.
export function categorizeTurn(intent, flags = []) {
  if (flags && flags.length) return 'psychology';
  if (intent === 'whylosing' || intent === 'stuck') return 'mistake';
  if (intent === 'broker') return 'broker-preference';
  if (intent === 'riskmgmt' || intent === 'lotsize' || intent === 'assess') return 'risk-behavior';
  if (intent === 'strategy' || intent === 'selfassess') return 'trading-style';
  return 'question';
}
