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

// ── Phase-2 expansion (additive only; new categories) ──
import { SMART_MONEY_CONCEPTS } from './smart-money/concepts.js';
import { PROP_FIRM_CONCEPTS } from './prop-firms/concepts.js';
import { STRATEGY_CONCEPTS } from './strategy/concepts.js';
import { PLANNING_CONCEPTS } from './planning/concepts.js';
import { MISTAKES_CONCEPTS } from './mistakes/concepts.js';

// ── Phase-4 expansion (additive only; new categories) ──
import { EXECUTION_CONCEPTS } from './execution/concepts.js';
import { REVIEW_CONCEPTS } from './review/concepts.js';

// ── Phase-5 expansion (additive only; new categories) ──
import { PRICE_ACTION_CONCEPTS } from './price-action/concepts.js';
import { MARKETS_CONCEPTS } from './markets/concepts.js';

// ── Phase-6 expansion (additive only; new categories) ──
import { INSTITUTIONAL_CONCEPTS } from './institutional/concepts.js';
import { COACHING_CONCEPTS } from './coaching/concepts.js';

// ── Phase-7 expansion (additive only; new category) ──
import { MACRO_CONCEPTS } from './macro/concepts.js';

// ── Phase-8 expansion (additive only; new category) ──
import { RESEARCH_CONCEPTS } from './research/concepts.js';

// ── Phase-9 expansion (additive only; new category) ──
import { ADVANCED_CONCEPTS } from './advanced/concepts.js';

// ── Phase-10 expansion (additive only; new category) ──
import { PROFESSIONAL_CONCEPTS } from './professional/concepts.js';

// ── Phase-11 expansion (additive only; new category) ──
import { DESK_CONCEPTS } from './desk/concepts.js';

// ── Phase-12 expansion (additive only; new categories) ──
import { PORTFOLIO_CONCEPTS } from './portfolio/concepts.js';
import { INSTRUMENTS_CONCEPTS } from './instruments/concepts.js';

// ── Phase-21 expansion — BEGINNER KNOWLEDGE FOUNDATION (additive only) ──
import { MARKETS_BASICS_CONCEPTS } from './markets/basics-concepts.js';
import { MARKETS_MORE_BASICS_CONCEPTS } from './markets/more-basics-concepts.js';
import { PRICE_ACTION_BASICS_CONCEPTS } from './price-action/basics-concepts.js';
import { PRICE_ACTION_STRUCTURE_BASICS_CONCEPTS } from './price-action/structure-basics-concepts.js';
import { ORDERS_CONCEPTS } from './orders/concepts.js';
import { BROKERS_BASICS_CONCEPTS } from './brokers/basics-concepts.js';
import { RISK_BASICS_CONCEPTS } from './risk/basics-concepts.js';
import { PSYCHOLOGY_BASICS_CONCEPTS } from './psychology/basics-concepts.js';
import { GETTING_STARTED_BASICS_CONCEPTS } from './getting-started/basics-concepts.js';
import { GETTING_STARTED_EXTRAS_CONCEPTS } from './getting-started/journey-extras-concepts.js';
import { PLATFORMS_CONCEPTS } from './platforms/concepts.js';   // ACTIVATION — beginner platform how-tos
import { PROP_FIRM_BASICS_CONCEPTS } from './prop-firms/basics-concepts.js';   // LIVE-PHASE — beginner prop-firm how-tos
import { GETTING_STARTED_FAQ_CONCEPTS } from './getting-started/faq-concepts.js';   // FINAL-PHASE — high-search FAQs

// category → concept[]  (a category MAY span multiple files; concat them here)
export const CATEGORY_MODULES = Object.freeze({
  gold: [...GOLD_CONCEPTS, ...GOLD_SESSION_CONCEPTS],
  risk: [...RISK_CONCEPTS, ...RISK_EXPANDED_CONCEPTS, ...RISK_BASICS_CONCEPTS],
  assessment: ASSESSMENT_CONCEPTS,
  psychology: [...PSYCHOLOGY_CONCEPTS, ...PSYCHOLOGY_EXPANDED_CONCEPTS, ...PSYCHOLOGY_BASICS_CONCEPTS],
  structure: [...STRUCTURE_CONCEPTS, ...STRUCTURE_EXPANDED_CONCEPTS],
  news: NEWS_CONCEPTS,
  'getting-started': [...GETTING_STARTED_CONCEPTS, ...GETTING_STARTED_BASICS_CONCEPTS, ...GETTING_STARTED_EXTRAS_CONCEPTS, ...GETTING_STARTED_FAQ_CONCEPTS],
  recovery: RECOVERY_CONCEPTS,
  islamic: ISLAMIC_CONCEPTS,
  brokers: [...BROKER_CONCEPTS, ...BROKERS_EXPANDED_CONCEPTS, ...BROKERS_BASICS_CONCEPTS],
  forex: FOREX_CONCEPTS,
  discipline: DISCIPLINE_CONCEPTS,
  liquidity: LIQUIDITY_CONCEPTS,
  'smart-money': SMART_MONEY_CONCEPTS,
  'prop-firms': [...PROP_FIRM_CONCEPTS, ...PROP_FIRM_BASICS_CONCEPTS],
  strategy: STRATEGY_CONCEPTS,
  planning: PLANNING_CONCEPTS,
  mistakes: MISTAKES_CONCEPTS,
  execution: EXECUTION_CONCEPTS,
  review: REVIEW_CONCEPTS,
  orders: ORDERS_CONCEPTS,
  platforms: PLATFORMS_CONCEPTS,
  'price-action': [...PRICE_ACTION_CONCEPTS, ...PRICE_ACTION_BASICS_CONCEPTS, ...PRICE_ACTION_STRUCTURE_BASICS_CONCEPTS],
  markets: [...MARKETS_CONCEPTS, ...MARKETS_BASICS_CONCEPTS, ...MARKETS_MORE_BASICS_CONCEPTS],
  institutional: INSTITUTIONAL_CONCEPTS,
  coaching: COACHING_CONCEPTS,
  macro: MACRO_CONCEPTS,
  research: RESEARCH_CONCEPTS,
  advanced: ADVANCED_CONCEPTS,
  professional: PROFESSIONAL_CONCEPTS,
  desk: DESK_CONCEPTS,
  portfolio: PORTFOLIO_CONCEPTS,
  instruments: INSTRUMENTS_CONCEPTS,
});

export const CATEGORIES = Object.keys(CATEGORY_MODULES);
export const ANCHOR_CONCEPTS = Object.values(CATEGORY_MODULES).flat();

export function conceptsForCategory(cat) { return CATEGORY_MODULES[cat] || []; }
export function conceptById(id) { return ANCHOR_CONCEPTS.find(c => c.id === id) || null; }
export function allConceptIds() { return ANCHOR_CONCEPTS.map(c => c.id); }
