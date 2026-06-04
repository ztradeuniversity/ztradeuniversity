// functions/api/ai-memory.js
// ──────────────────────────────────────────────────────────────────────────
// User memory & psychology engine for the ZTU AI Trading Assistant.
// Backed by a SEPARATE AI-only Supabase project (never the main site's DB).
//
// GET  /api/ai-memory?userId=xxx            → profile + psychology summary
// POST /api/ai-memory                       → write operations (see actions below)
//
// POST actions:
//   upsert_profile    → create or update user profile fields
//   save_interaction  → save user+ai message pair, detect psychology flags
//   save_assessment   → save a trade assessment record
//
// Degrades gracefully to localStorage-only mode when Supabase is not configured.
// ──────────────────────────────────────────────────────────────────────────

import {
  getProfile, upsertProfile,
  saveChatMessage, getRecentChatContext,
  saveTradeAssessment,
  incrementFreeMessages,
  isConfigured,
} from '../utils/ai-supabase.js';
import { categorizeTurn } from '../utils/memory-engine.js';
import { extractFacts } from '../utils/memory-facts.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_H });
}

// ── PSYCHOLOGY SIGNAL DETECTION ────────────────────────────────────────────
// Keyword-based detection of common trading psychology patterns in user text.

const PSYCH_SIGNALS = [
  {
    flag: 'fomo',
    label: 'FOMO',
    patterns: [
      'missed the move', 'miss the move', 'still enter', 'already moved too far',
      'too late to enter', 'gone too high', 'gone too far', 'still going up',
      'should i still buy', 'should i still enter', 'wish i entered', 'i should have entered',
      'can i still jump in', 'is it too late', 'fomo',
    ],
  },
  {
    flag: 'fear',
    label: 'Fear',
    patterns: [
      'scared to enter', 'afraid to trade', 'worried about', 'feeling nervous',
      'what if it drops', 'what if it crashes', 'what if i lose', 'too risky for me',
      'i am scared', "i'm scared", 'fear of losing', 'might lose everything',
      'too much risk', 'trembling', 'hesitant because i am scared',
    ],
  },
  {
    flag: 'revenge',
    label: 'Revenge Trading',
    patterns: [
      'make it back', 'recover my loss', 'get my money back', 'just lost a trade',
      'need to recover', 'revenge trade', "can't accept this loss", 'frustrated at the market',
      'angry at the market', 'desperate to win', 'need to make back', 'angry trade',
      'emotional trade', 'double down to recover',
    ],
  },
  {
    flag: 'hesitation',
    label: 'Hesitation',
    patterns: [
      'keep second-guessing', 'second-guess myself', 'overthinking the setup',
      'was going to enter but', 'almost entered', 'keep missing the entry',
      'wait too long', 'i hesitate', 'i keep hesitating', 'always too slow',
      'i overthink everything', 'analysis paralysis', 'cant pull the trigger',
      "can't pull the trigger",
    ],
  },
  {
    flag: 'overtrading',
    label: 'Overtrading',
    patterns: [
      'took too many trades', 'many trades today', 'trading too much',
      'i overtrade', 'overtrading', 'opened multiple trades', 'trade everything i see',
      "can't stop trading", 'keep opening trades', '5 trades today', '6 trades today',
      '7 trades today', 'too many positions', 'all day trading',
    ],
  },
];

export function detectPsychologyFlags(text) {
  const lower = (text ?? '').toLowerCase();
  return PSYCH_SIGNALS
    .filter(s => s.patterns.some(p => lower.includes(p)))
    .map(s => s.flag);
}

// ── BUILD PROFILE SUMMARY (for AI context injection) ──────────────────────

export function buildProfileSummary(profile) {
  if (!profile) return null;

  const lines = [];

  if (profile.trader_level)  lines.push(`Trader Level: ${profile.trader_level}`);
  if (profile.trading_style) lines.push(`Trading Style: ${profile.trading_style}`);
  if (profile.instruments?.length) lines.push(`Instruments: ${profile.instruments.join(', ')}`);

  // Psychology scores (only show elevated ones — score > 2)
  const psychLines = [];
  if ((profile.fomo_score        ?? 0) > 2) psychLines.push(`FOMO tendency (score: ${profile.fomo_score}/10)`);
  if ((profile.fear_score        ?? 0) > 2) psychLines.push(`Fear pattern (score: ${profile.fear_score}/10)`);
  if ((profile.revenge_score     ?? 0) > 2) psychLines.push(`Revenge trading risk (score: ${profile.revenge_score}/10)`);
  if ((profile.hesitation_score  ?? 0) > 2) psychLines.push(`Hesitation pattern (score: ${profile.hesitation_score}/10)`);
  if ((profile.overtrading_score ?? 0) > 2) psychLines.push(`Overtrading risk (score: ${profile.overtrading_score}/10)`);
  if (psychLines.length) lines.push(`Detected Psychology Patterns: ${psychLines.join('; ')}`);

  if (profile.strengths?.length)    lines.push(`Known Strengths: ${profile.strengths.join(', ')}`);
  if (profile.weaknesses?.length)   lines.push(`Known Weaknesses: ${profile.weaknesses.join(', ')}`);
  if (profile.behavior_notes?.length) lines.push(`Behavior Notes: ${profile.behavior_notes.slice(0, 3).join(' | ')}`);
  if (profile.ai_profile_summary)   lines.push(`AI Profile Summary: ${profile.ai_profile_summary}`);

  if (profile.confidence_score != null) {
    const label = profile.confidence_score >= 7 ? 'High' : profile.confidence_score >= 4 ? 'Medium' : 'Low';
    lines.push(`Confidence Level: ${label} (${profile.confidence_score}/10)`);
  }

  return lines.length ? lines.join('\n') : null;
}

// ── HANDLER ────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const configured = isConfigured(env);

  // ── GET: fetch user profile ──────────────────────────────────────────────
  if (request.method === 'GET') {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return json({ error: 'userId required' }, 400);

    if (!configured) {
      return json({ configured: false, profile: null, summary: null });
    }

    const profile = await getProfile(env, userId);
    return json({
      configured: true,
      profile,
      summary: buildProfileSummary(profile),
    });
  }

  // ── POST: write operations ───────────────────────────────────────────────
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body;
  try   { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { action, userId, data } = body;
  if (!userId) return json({ error: 'userId required' }, 400);

  // ── action: upsert_profile ───────────────────────────────────────────────
  if (action === 'upsert_profile') {
    if (!configured) return json({ configured: false, saved: false });
    const result = await upsertProfile(env, userId, data ?? {});
    return json({ configured: true, saved: !!result, profile: result });
  }

  // ── action: save_interaction ─────────────────────────────────────────────
  if (action === 'save_interaction') {
    const { conversationId, userMessage, aiMessage } = data ?? {};
    if (!userMessage) return json({ error: 'userMessage required' }, 400);

    // Detect psychology in user message
    const flags = detectPsychologyFlags(userMessage);

    if (!configured) {
      return json({ configured: false, saved: false, flags });
    }

    // Module 2 — store both turns in ai_chat_memory with category + intent.
    const category = categorizeTurn(data?.intent || null, flags);   // psychology|mistake|question|…
    const [u] = await Promise.all([
      saveChatMessage(env, userId, conversationId, 'user', userMessage, flags,
        { category, intent: data?.intent || null, weight: flags.length ? 6 : 3 }),
      aiMessage
        ? saveChatMessage(env, userId, conversationId, 'assistant', aiMessage, [],
            { category: 'question', intent: data?.intent || null, weight: 2 })
        : Promise.resolve(null),
    ]);

    // ── PHASE 8A: HIGH-VALUE MEMORY FACTS ────────────────────────────────────
    // Extract durable trader facts (preferred instrument, level, style, goals),
    // store them PINNED at high weight so retention never prunes them, and roll
    // the structured ones up into ai_user_profiles for instant recall.
    let storedFacts = [];
    try {
      const facts = extractFacts(userMessage);
      if (facts.length) {
        const profileUpdates = {};
        await Promise.all(facts.map(f => {
          if (f.profileField && f.value) profileUpdates[f.profileField] = f.value;
          return saveChatMessage(env, userId, conversationId, 'user', f.fact, [],
            { category: f.category, intent: data?.intent || null, weight: f.weight, pinned: !!f.pinned });
        }));
        if (Object.keys(profileUpdates).length) {
          await upsertProfile(env, userId, profileUpdates).catch(() => {});
        }
        storedFacts = facts.map(f => f.category);
      }
    } catch { /* fact extraction is best-effort; never blocks the save */ }

    // Phase 9: increment free-message counter (used for access gating)
    await incrementFreeMessages(env, userId).catch(() => {});

    return json({ configured: true, saved: !!(u), flags, category, facts: storedFacts });
  }

  // ── action: save_assessment ──────────────────────────────────────────────
  if (action === 'save_assessment') {
    if (!configured) return json({ configured: false, saved: false });
    const result = await saveTradeAssessment(env, userId, data ?? {});
    return json({ configured: true, saved: !!result });
  }

  // ── action: get_context (for AI system prompt injection) ─────────────────
  if (action === 'get_context') {
    if (!configured) return json({ configured: false, context: null });
    const [profile, recentChats] = await Promise.all([
      getProfile(env, userId),
      getRecentChatContext(env, userId, 8),
    ]);
    return json({
      configured: true,
      profile,
      summary:     buildProfileSummary(profile),
      recentChats: recentChats.map(c => ({ role: c.role, content: c.content.slice(0, 500) })),
    });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}
