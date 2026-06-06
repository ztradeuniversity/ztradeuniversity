// functions/knowledge/index.js
// ════════════════════════════════════════════════════════════════════════════
// CATEGORY-BASED KNOWLEDGE STORE — aggregator (Phase 11C.4).
//
// Source of truth for AUTHORING (the live graph still serves from kb_nodes).
// Layout: functions/knowledge/<category>/<file>.js — each file exports an array
// of KOS concepts; question patterns live ON the concept, never in their own
// files. To add concepts: extend a category array, or add a new file + one
// import line here. No giant file, no per-question file, no future redesign:
//   • retrieval can load a single category (CATEGORY_MODULES[cat])
//   • embeddings/edges/dedup/review all operate per-concept, unchanged
//   • scales to 250 concepts / 1000+ patterns by adding category files
// ════════════════════════════════════════════════════════════════════════════

import { GOLD_CONCEPTS } from './gold/concepts.js';
import { RISK_CONCEPTS } from './risk/concepts.js';
import { ASSESSMENT_CONCEPTS } from './assessment/concepts.js';
import { PSYCHOLOGY_CONCEPTS } from './psychology/concepts.js';
import { STRUCTURE_CONCEPTS } from './structure/concepts.js';
import { NEWS_CONCEPTS } from './news/concepts.js';
import { GETTING_STARTED_CONCEPTS } from './getting-started/concepts.js';
import { RECOVERY_CONCEPTS } from './recovery/concepts.js';
import { ISLAMIC_CONCEPTS } from './islamic/concepts.js';
import { BROKER_CONCEPTS } from './brokers/concepts.js';

// ── Phase-100 expansion (additive only; existing files above are untouched) ──
import { GOLD_SESSION_CONCEPTS } from './gold/sessions-concepts.js';
import { FOREX_CONCEPTS } from './forex/concepts.js';
import { BROKERS_EXPANDED_CONCEPTS } from './brokers/expanded-concepts.js';
import { RISK_EXPANDED_CONCEPTS } from './risk/expanded-concepts.js';
import { PSYCHOLOGY_EXPANDED_CONCEPTS } from './psychology/expanded-concepts.js';
import { DISCIPLINE_CONCEPTS } from './discipline/concepts.js';
import { STRUCTURE_EXPANDED_CONCEPTS } from './structure/expanded-concepts.js';
import { LIQUIDITY_CONCEPTS } from './liquidity/concepts.js';

// category → concept[]  (a category MAY span multiple files; concat them here)
export const CATEGORY_MODULES = Object.freeze({
  gold: [...GOLD_CONCEPTS, ...GOLD_SESSION_CONCEPTS],
  risk: [...RISK_CONCEPTS, ...RISK_EXPANDED_CONCEPTS],
  assessment: ASSESSMENT_CONCEPTS,
  psychology: [...PSYCHOLOGY_CONCEPTS, ...PSYCHOLOGY_EXPANDED_CONCEPTS],
  structure: [...STRUCTURE_CONCEPTS, ...STRUCTURE_EXPANDED_CONCEPTS],
  news: NEWS_CONCEPTS,
  'getting-started': GETTING_STARTED_CONCEPTS,
  recovery: RECOVERY_CONCEPTS,
  islamic: ISLAMIC_CONCEPTS,
  brokers: [...BROKER_CONCEPTS, ...BROKERS_EXPANDED_CONCEPTS],
  forex: FOREX_CONCEPTS,
  discipline: DISCIPLINE_CONCEPTS,
  liquidity: LIQUIDITY_CONCEPTS,
});

export const CATEGORIES = Object.keys(CATEGORY_MODULES);
export const ANCHOR_CONCEPTS = Object.values(CATEGORY_MODULES).flat();

export function conceptsForCategory(cat) { return CATEGORY_MODULES[cat] || []; }
export function conceptById(id) { return ANCHOR_CONCEPTS.find(c => c.id === id) || null; }
export function allConceptIds() { return ANCHOR_CONCEPTS.map(c => c.id); }
