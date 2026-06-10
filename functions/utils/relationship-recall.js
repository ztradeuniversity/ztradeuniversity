// functions/utils/relationship-recall.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 25 — HUMAN MEMORY & RELATIONSHIP V2
// A long-term mentor occasionally references the STUDENT'S OWN journey — not just
// the last topic (Phase 15 progressRecall already does that), but the last
// weakness they were working on or a recent achievement — to make continuity feel
// human. It reads ONLY the existing memory (Phase 14 session-memory + Phase 15
// mentor-journey); it stores nothing and exposes no sensitive data (STEP 5/6).
//
// Speaks rarely and varies its phrasing so it never sounds robotic (STEP 2).
// Pure (no I/O). Language-Lock safe (en / ur / ur-roman / ar).
// ════════════════════════════════════════════════════════════════════════════

import { vary } from './humanize.js';

function seedHash(seed) {
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const ACHIEVEMENT = {
  en: [a => `You've been making real progress on ${a} — good to see it carry over.`,
       a => `Your ${a} has come a long way since we started — let's build on it.`],
  ur: [a => `${a} میں آپ کی اچھی پیش رفت ہوئی ہے — اسی پر آگے بڑھتے ہیں۔`],
  'ur-roman': [a => `${a} mein aap ki achhi paish raft hui hai — isi par aage badhte hain.`],
  ar: [a => `أحرزت تقدّماً جيداً في ${a} — لنبنِ على ذلك.`],
};
const WEAKNESS = {
  en: [w => `Last time, ${w} was the area we were tightening up — let's keep at it.`,
       w => `We'd been working on your ${w} — picking that back up:`],
  ur: [w => `پچھلی بار ہم آپ کے ${w} پر کام کر رہے تھے — اسے جاری رکھتے ہیں۔`],
  'ur-roman': [w => `Pichli baar hum aap ke ${w} par kaam kar rahe the — ise jaari rakhte hain.`],
  ar: [w => `كنا نعمل على ${w} لديك — لنواصل ذلك.`],
};

// Returns ONE natural recall line referencing a recent achievement or weakness, or
// '' (most of the time, or when there is nothing meaningful to recall).
export function buildRelationshipRecall({ sessionMem = {}, journey = {}, lang = 'en', seed = '' } = {}) {
  // Speak only ~1-in-3 turns so continuity feels natural, never every message.
  if (seedHash(seed + 'rel') % 3 !== 0) return '';

  const achievement = Array.isArray(journey.achievements) && journey.achievements[0];
  const weakness = sessionMem.lastWeakArea || journey.weakArea || null;

  // Prefer celebrating progress; otherwise gently resume the weak area.
  if (achievement) {
    const arr = ACHIEVEMENT[lang] || ACHIEVEMENT.en;
    const fn = vary(arr, seed || String(achievement));
    return (typeof fn === 'function') ? fn(String(achievement).replace(/^improved\s+/i, '')) : '';
  }
  if (weakness) {
    const arr = WEAKNESS[lang] || WEAKNESS.en;
    const fn = vary(arr, seed || String(weakness));
    return (typeof fn === 'function') ? fn(String(weakness)) : '';
  }
  return '';
}
