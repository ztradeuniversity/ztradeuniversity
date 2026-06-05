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

// category → concept[]  (a category MAY span multiple files; concat them here)
export const CATEGORY_MODULES = Object.freeze({
  gold: GOLD_CONCEPTS,
  risk: RISK_CONCEPTS,
  assessment: ASSESSMENT_CONCEPTS,
  psychology: PSYCHOLOGY_CONCEPTS,
  structure: STRUCTURE_CONCEPTS,
  news: NEWS_CONCEPTS,
  'getting-started': GETTING_STARTED_CONCEPTS,
  recovery: RECOVERY_CONCEPTS,
  islamic: ISLAMIC_CONCEPTS,
  brokers: BROKER_CONCEPTS,
});

export const CATEGORIES = Object.keys(CATEGORY_MODULES);
export const ANCHOR_CONCEPTS = Object.values(CATEGORY_MODULES).flat();

export function conceptsForCategory(cat) { return CATEGORY_MODULES[cat] || []; }
export function conceptById(id) { return ANCHOR_CONCEPTS.find(c => c.id === id) || null; }
export function allConceptIds() { return ANCHOR_CONCEPTS.map(c => c.id); }
