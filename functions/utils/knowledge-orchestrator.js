// functions/utils/knowledge-orchestrator.js
// ════════════════════════════════════════════════════════════════════════════
// RESPONSE ORCHESTRATOR (Phase 8B) — composes the Knowledge Base layer in the
// canonical priority order and returns ready-to-weave fragments. It NEVER
// rebuilds the engine and NEVER emits a signal.
//
//   PRIORITY:  1) Memory   → localized recall line (handled by memory-facts)
//              2) Articles → ai_articles (+ ai_article_images)
//              3) Broker   → ai_brokers
//              4) Pattern  → ai_pattern_vault (chat-mentioned patterns)
//              5) Live mkt → already produced by the engine answer
//
// Returns { recall, prepend, append, sources }:
//   recall  — in-language memory line (safe in ANY language)
//   prepend — English knowledge body (articles + broker) — caller injects only
//             for English so the Language Lock is never violated
//   append  — English pattern stats — same English-only rule
//
// Graceful: every Supabase call is wrapped; when not configured (or on error)
// the corresponding fragment is simply ''. Existing systems untouched.
// ════════════════════════════════════════════════════════════════════════════

import { searchArticles, relatedArticles } from './article-knowledge.js';
import { getPatternStats, formatHistoricalStats, isConfigured } from './pattern-stats.js';
import { buildMemoryRecall } from './memory-facts.js';

// Intents for which internal ARTICLES are searched first.
const ARTICLE_INTENTS = new Set([
  'gold', 'btc', 'macro', 'riskmgmt', 'psychology', 'strategy', 'technical', 'events', 'knowledge', 'brief',
]);

// Chat-mentioned pattern names → ai_pattern_vault keys.
const PATTERN_MAP = [
  [/\bdouble[\s-]?top\b/i, 'double-top'],
  [/\bdouble[\s-]?bottom\b/i, 'double-bottom'],
  [/\bhead (and|&|n)? ?shoulders?\b/i, 'head-and-shoulders'],
  [/\b(symmetrical|sym)[\s-]?triangle\b/i, 'symmetrical-triangle'],
  [/\bascending[\s-]?triangle\b/i, 'ascending-triangle'],
  [/\bdescending[\s-]?triangle\b/i, 'descending-triangle'],
  [/\b(bull(ish)?|bear(ish)?)?[\s-]?flag\b/i, 'flag'],
  [/\bchannel\b/i, 'channel'],
  [/\brange\b/i, 'range'],
  [/\bbreakout\b/i, 'breakout'],
];
function patternKeyFromText(text = '') {
  for (const [re, key] of PATTERN_MAP) if (re.test(text)) return key;
  return null;
}

// Known broker names → match against ai_brokers.broker_name (ilike).
const BROKER_NAMES = ['exness', 'octa', 'octafx', 'hfm', 'hf markets', 'hot forex', 'hotforex', 'ic markets', 'icmarkets', 'fp markets', 'fpmarkets', 'xm', 'fbs', 'pepperstone', 'avatrade', 'tickmill', 'fxtm'];
function brokerNameFromText(text = '') {
  const s = text.toLowerCase();
  for (const n of BROKER_NAMES) if (s.includes(n)) return n;
  return null;
}

// Isolated read-only ai_brokers lookup (own REST; service key stays server-side).
// Live schema: broker_name, regulation, account_types, deposit_methods,
// withdrawal_methods, strengths, weaknesses, updated_at. Match on broker_name.
async function queryBroker(env, name) {
  if (!isConfigured(env) || !name) return null;
  try {
    const url = `${env.AI_SUPABASE_URL}/rest/v1/ai_brokers?broker_name=ilike.*${encodeURIComponent(name)}*&limit=1`;
    const res = await fetch(url, {
      headers: { apikey: env.AI_SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.AI_SUPABASE_SERVICE_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch { return null; }
}

// Normalize a value that may be text, comma string, or array → clean string.
function asList(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return String(v).trim();
}

// Educational broker profile from the live ai_brokers schema. Education only —
// never a recommendation or signal.
function renderBroker(b) {
  if (!b) return '';
  let o = `## ${b.broker_name || 'Broker'} — from the ZTU broker database\n`;
  const reg = asList(b.regulation);          if (reg) o += `**Regulation:** ${reg}\n`;
  const acc = asList(b.account_types);       if (acc) o += `**Account Types:** ${acc}\n`;
  const dep = asList(b.deposit_methods);     if (dep) o += `**Deposit Methods:** ${dep}\n`;
  const wd  = asList(b.withdrawal_methods);  if (wd)  o += `**Withdrawal Methods:** ${wd}\n`;
  const str = asList(b.strengths);           if (str) o += `**Strengths:** ${str}\n`;
  const wk  = asList(b.weaknesses);          if (wk)  o += `**Weaknesses:** ${wk}\n`;
  o += `\n_Educational overview only — not a recommendation. Verify details with the broker directly._`;
  return o.trim();
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
// ctx: { intent, text, lang, profile }
export async function buildKnowledgeLayer(env, { intent, text, lang = 'en', profile = null } = {}) {
  const out = { recall: '', prepend: '', append: '', sources: [] };

  // STEP 1 — MEMORY (localized; safe in any language)
  out.recall = buildMemoryRecall(profile, intent, lang) || '';

  // English-body knowledge is gated to English to preserve the Language Lock.
  if (lang !== 'en' || !isConfigured(env)) return out;

  const prependParts = [];

  // STEP 3 — BROKER (ai_brokers) — highest specificity when intent is broker.
  if (intent === 'broker') {
    const bname = brokerNameFromText(text);
    if (bname_safe(bname)) {
      const b = await queryBroker(env, bname).catch(() => null);
      const rendered = renderBroker(b);
      if (rendered) { prependParts.push(rendered); out.sources.push({ type: 'broker', name: b.name }); }
    }
  }

  // STEP 2 — ARTICLES (ai_articles + ai_article_images), ranked.
  if (ARTICLE_INTENTS.has(intent)) {
    const hits = await searchArticles(env, { q: text, limit: 3 }).catch(() => []);
    if (hits && hits.length) {
      const top = hits[0];
      const body = (top.summary && top.summary.length > 40) ? top.summary : (top.content || '').slice(0, 500);
      let block = `## 📚 From the ZTU Knowledge Base\n**${top.title}**${body ? `\n${body}` : ''}`;
      // Relevant image (ai_article_images)
      const rel = await relatedArticles(env, top.id).catch(() => ({ images: [], next: null }));
      if (rel.images && rel.images[0] && rel.images[0].url) {
        block += `\n\n![${rel.images[0].alt || top.title}](${rel.images[0].url})`;
      }
      if (hits[1]) block += `\n\n_More on this: **${hits[1].title}**_`;
      if (top.slug) block += `\n📖 Source: [${top.title}](${top.slug})`;
      prependParts.push(block);
      out.sources.push(...hits.slice(0, 2).map(a => ({ type: 'article', id: a.id, title: a.title, slug: a.slug })));
    }
  }

  out.prepend = prependParts.join('\n\n');

  // STEP 4 — PATTERN VAULT (chat-mentioned pattern) — educational, never a signal.
  const pk = patternKeyFromText(text);
  if (pk) {
    const stats = await getPatternStats(env, pk).catch(() => null);
    const formatted = formatHistoricalStats(stats, pk.replace(/-/g, ' '));
    if (formatted) { out.append = '\n\n' + formatted; out.sources.push({ type: 'pattern', key: pk }); }
  }

  return out;
}

// tiny guard so a null broker name short-circuits cleanly
function bname_safe(n) { return typeof n === 'string' && n.length > 1; }
