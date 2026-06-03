// functions/utils/supabase-mapping.js
// ════════════════════════════════════════════════════════════════════════════
// FUTURE SUPABASE MAPPING (Module 8) — SINGLE SOURCE OF TRUTH. NOT CONNECTED.
//
// Target project:  ZTU Chatbot  (dedicated AI Supabase — NOT Library, NOT Automation)
// Credentials:     provided LATER. Env var names are FIXED (do not rename):
//                    AI_SUPABASE_URL · AI_SUPABASE_ANON_KEY · AI_SUPABASE_SERVICE_KEY
//
// This file maps every memory / retrieval / identity / pattern module to the
// SEVEN already-planned tables. No second design, no alternative tables.
//   ai_user_profiles · ai_chat_memory · ai_articles · ai_article_images
//   ai_chart_analyses · ai_pattern_vault · ai_brokers
// ════════════════════════════════════════════════════════════════════════════

export const AI_SUPABASE_ENV = {
  url:        'AI_SUPABASE_URL',
  anonKey:    'AI_SUPABASE_ANON_KEY',
  serviceKey: 'AI_SUPABASE_SERVICE_KEY',
  project:    'ZTU Chatbot',
  connected:  false,
};

// ── CANONICAL TABLES (future destination column specs) ───────────────────────
export const AI_SUPABASE_TABLES = {
  ai_user_profiles: {
    purpose: 'One row per device — identity, preferences, rolled-up memory, scores.',
    pk: 'device_id',
    columns: {
      device_id: 'text PK',
      created_at: 'timestamptz', last_seen_at: 'timestamptz',
      language_pref: 'text', country: 'text', timezone: 'text',
      trader_level: 'text', trader_type: 'text', trading_style: 'text',
      broker_preferences: 'text[]', strengths: 'text[]', weaknesses: 'text[]', behavior_notes: 'text[]',
      conversation_count: 'int',
      discipline_score: 'int', patience_score: 'int', confidence_score: 'int',
      risk_score: 'int', psychology_score: 'int',
      is_verified: 'boolean', verified_account_number: 'text', verified_broker: 'text', verified_at: 'timestamptz',
      free_messages_used: 'int',
    },
  },
  ai_chat_memory: {
    purpose: 'Categorised memory log — questions, mistakes, psychology, etc.',
    pk: 'id',
    columns: {
      id: 'uuid PK', device_id: 'text → ai_user_profiles.device_id', created_at: 'timestamptz',
      category: 'text (question|mistake|weakness|strength|psychology|risk-behavior|trading-style|broker-preference|language)',
      role: 'text (user|assistant)', content: 'text', intent: 'text',
      psychology_flags: 'text[]', weight: 'int', pinned: 'boolean', expires_at: 'timestamptz',
    },
    indexes: ['(device_id, created_at desc)', '(device_id, category)'],
  },
  ai_articles: {
    purpose: 'Educational articles for retrieval & citation.',
    pk: 'id',
    columns: {
      id: 'uuid PK', slug: 'text unique', title: 'text', content: 'text', summary: 'text',
      tags: 'text[]', difficulty: 'text', embedding: 'vector(1536)', is_active: 'boolean', updated_at: 'timestamptz',
    },
    indexes: ['gin(tags)', 'ivfflat(embedding) — future semantic search'],
  },
  ai_article_images: {
    purpose: 'Educational screenshots / chart examples / diagrams, linked to articles.',
    pk: 'id',
    columns: {
      id: 'uuid PK', url: 'text', kind: 'text', caption: 'text', alt_text: 'text',
      tags: 'text[]', article_id: 'uuid → ai_articles', detected: 'jsonb', created_at: 'timestamptz',
    },
  },
  ai_chart_analyses: {
    purpose: 'History of user chart uploads + detection results (feeds pattern stats).',
    pk: 'id',
    columns: {
      id: 'uuid PK', device_id: 'text → ai_user_profiles.device_id', created_at: 'timestamptz',
      instrument: 'text', timeframe: 'text', trend: 'text',
      patterns: 'jsonb', levels: 'jsonb', image_ref: 'text', outcome: 'text',
    },
    indexes: ['gin(patterns)', '(device_id, created_at desc)'],
  },
  ai_pattern_vault: {
    purpose: 'Aggregated pattern statistics powering probability education.',
    pk: 'pattern_key',
    columns: {
      pattern_key: 'text PK', instrument: 'text', occurrences: 'int',
      win_rate: 'numeric', loss_rate: 'numeric', avg_move: 'numeric',
      sample_size: 'int', last_seen: 'timestamptz',
    },
  },
  ai_brokers: {
    purpose: 'Broker knowledge base (future home of broker-data.js BROKER_PROFILES).',
    pk: 'key',
    columns: {
      key: 'text PK', name: 'text', regulators: 'text[]', account_types: 'text[]',
      profile: 'jsonb (platforms/deposit/withdrawal/strengths/weaknesses/complaints/beginner)',
      website: 'text', help: 'text', updated_at: 'timestamptz',
    },
  },
};

// ── MODULE → TABLE MAP (Phase Next+2) ────────────────────────────────────────
export const MODULE_TABLE_MAP = {
  'M1 Device Identity':        { tables: ['ai_user_profiles'], via: 'device-identity.js → ai_user_profiles.device_id' },
  'M2 Trader Memory':          { tables: ['ai_chat_memory', 'ai_user_profiles'], via: 'memory-engine.recordMemory → ai_chat_memory; rollups → ai_user_profiles' },
  'M3 Memory Scoring':         { tables: ['ai_user_profiles'], via: 'memory-engine.updateScores → *_score columns (EMA smoothed)' },
  'M4 Article Retrieval':      { tables: ['ai_articles', 'ai_article_images'], via: 'retrieval-engine.retrieveArticleKnowledge' },
  'M5 Image Retrieval':        { tables: ['ai_article_images', 'ai_articles'], via: 'retrieval-engine.retrieveImage' },
  'M6 Pattern History':        { tables: ['ai_pattern_vault', 'ai_chart_analyses'], via: 'retrieval-engine.retrievePatternHistory' },
  'M7 Memory Cleanup':         { tables: ['ai_chat_memory', 'ai_user_profiles'], via: 'memory-engine.pruneMemory (RETENTION_POLICY)' },
  'Broker Engine (existing)':  { tables: ['ai_brokers'], via: 'broker-data.js BROKER_PROFILES → ai_brokers at integration' },
  'Chart Pipeline (existing)': { tables: ['ai_chart_analyses', 'ai_pattern_vault'], via: 'chart-pipeline.processChartUpload (future)' },
};

// Guard: integration code must call this and refuse to proceed until creds exist.
export function isAiSupabaseConfigured(env) {
  return !!(env && env.AI_SUPABASE_URL && env.AI_SUPABASE_SERVICE_KEY);
}
