// functions/api/journal-admin.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 5A — MENTOR REVIEW SYSTEM (server-side admin API).
//
// The Journal's RLS isolates every trader to their OWN rows (auth.uid() =
// user_id), so a mentor cannot read across traders with the browser anon key.
// This endpoint therefore runs server-side with the JOURNAL service-role key
// (bypasses RLS) and is gated by a server-side admin password. The service-role
// key is NEVER sent to the browser.
//
// AUTH: every request must carry header  x-journal-admin-key: <JOURNAL_ADMIN_PASSWORD>.
//   The journal-admin.html page sends the value entered at its password gate.
//
// Actions (POST JSON { action, ... }):
//   list-traders                      → [{ id, account, email, name, joined, totals... }]
//   trader-profile { userId }         → { user, trades, psychology, personality, aiReports, reviews, metrics }
//   create-review  { userId, account, category, comment, mentorName, tradeId? }
//   list-reviews   { userId? , limit? }→ recent reviews (all, or for one trader)
//   stats                             → { totalReviews, byCategory, reviewedTraders, totalTraders }
//
// Env vars (server-side only):
//   JOURNAL_SUPABASE_URL                (already used by journal.html client too)
//   JOURNAL_SUPABASE_SERVICE_ROLE_KEY   (NEW — service_role key, bypasses RLS)
//   JOURNAL_ADMIN_PASSWORD              (NEW — gates this API)
// ════════════════════════════════════════════════════════════════════════════

import { requireAdminModule } from '../utils/admin-session.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-journal-admin-key, Authorization',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSON_H });

function sbHeaders(env) {
  const key = env.JOURNAL_SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
async function sbGet(env, path) {
  const r = await fetch(`${env.JOURNAL_SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
  if (!r.ok) throw new Error(`supabase GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
// Tolerant read: returns [] instead of throwing (used for mentor_reviews so the
// admin still loads a trader before the Phase 5A migration is run / if empty).
async function sbGetSafe(env, path) {
  try { return await sbGet(env, path); } catch (e) { return []; }
}
async function sbInsert(env, table, row) {
  const r = await fetch(`${env.JOURNAL_SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase INSERT ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}
// upsert on a unique column (e.g. mentor_scorecards.user_id)
async function sbUpsert(env, table, onConflict, row) {
  const r = await fetch(`${env.JOURNAL_SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase UPSERT ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

// ── schema-resilient field accessors ──
// The live Journal DB and the reference schema use different column names
// (e.g. trade_type vs direction, win_loss vs status, full_name vs display_name,
// and the live DB may lack a pnl/trade_id column). These coalesce so the admin
// API works against either schema and never 400s on a missing column.
function tDir(t)    { return t.direction || t.trade_type || null; }
function tPnl(t)    { return t.pnl != null ? Number(t.pnl) : null; }
function tStatus(t) {
  if (t.status) return t.status;
  if (t.win_loss) return t.win_loss;
  const p = tPnl(t);
  return p == null ? null : (p > 0 ? 'WIN' : p < 0 ? 'LOSS' : 'BREAKEVEN');
}
function tTradeId(t){ return t.trade_id || (t.id ? ('#' + String(t.id).slice(0, 8)) : '—'); }
function uName(u)   { return u.display_name || u.full_name || u.account_number || null; }

// ── analytics over a trader's trades (server-side, schema-resilient) ──
function computeMetrics(trades) {
  const total = trades.length;
  const wins = trades.filter((t) => tStatus(t) === 'WIN').length;
  const losses = trades.filter((t) => tStatus(t) === 'LOSS').length;
  const winRate = total ? (wins / total) * 100 : null;
  const rrTrades = trades.filter((t) => t.rr_ratio != null);
  const avgRR = rrTrades.length ? rrTrades.reduce((s, t) => s + Number(t.rr_ratio), 0) / rrTrades.length : null;
  const pnls = trades.map(tPnl).filter((v) => v != null);
  const netProfit = pnls.length ? pnls.reduce((s, v) => s + v, 0) : null;  // null when the DB has no pnl column
  return { total, wins, losses, winRate, avgRR, netProfit };
}

// Normalize a raw trade into the consistent shape the admin UI expects,
// regardless of which underlying column names the DB uses.
function normalizeTrade(t) {
  return Object.assign({}, t, {
    direction: tDir(t),
    status: tStatus(t),
    pnl: tPnl(t),
    trade_id: tTradeId(t),
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── config / auth ──
  if (!env.JOURNAL_SUPABASE_URL || !env.JOURNAL_SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'server_not_configured', detail: 'JOURNAL_SUPABASE_URL / JOURNAL_SUPABASE_SERVICE_ROLE_KEY missing' }, 503);
  }
  const authorized = await requireAdminModule(env, request, 'journal', { header: 'x-journal-admin-key', value: env.JOURNAL_ADMIN_PASSWORD });
  if (!authorized) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body?.action;

  try {
    // ── LIST TRADERS (with per-trader totals) ──────────────────────────────
    if (action === 'list-traders') {
      // select=* so we never 400 on a column the live schema doesn't have.
      const users = await sbGet(env, 'users?select=*&order=created_at.desc');
      const trades = await sbGet(env, 'journal_trades?select=*');
      const byUser = {};
      for (const t of trades) {
        (byUser[t.user_id] = byUser[t.user_id] || []).push(t);
      }
      const out = users.map((u) => {
        const ut = byUser[u.id] || [];
        const m = computeMetrics(ut);
        const latest = ut.reduce((mx, t) => (!mx || new Date(t.created_at) > new Date(mx) ? t.created_at : mx), null);
        return {
          id: u.id, account: u.account_number, email: u.email, name: uName(u),
          tier: u.tier, joined: u.created_at,
          totalTrades: m.total, wins: m.wins, losses: m.losses,
          winRate: m.winRate, avgRR: m.avgRR, netProfit: m.netProfit,
          latestActivity: latest,
        };
      });
      return json({ ok: true, traders: out });
    }

    // ── TRADER PROFILE ─────────────────────────────────────────────────────
    if (action === 'trader-profile') {
      const uid = String(body?.userId || '');
      if (!uid) return json({ error: 'userId required' }, 400);
      const [userArr, trades, personality, aiReports, reviews, grades, scorecardArr, acks] = await Promise.all([
        sbGet(env, `users?id=eq.${uid}&select=*`),
        sbGet(env, `journal_trades?user_id=eq.${uid}&select=*&order=created_at.desc`),
        sbGet(env, `personality_reports?user_id=eq.${uid}&select=*&order=period_start.desc`),
        sbGet(env, `ai_reports?user_id=eq.${uid}&select=*&order=created_at.desc`),
        sbGetSafe(env, `mentor_reviews?user_id=eq.${uid}&select=*&order=created_at.desc`),
        sbGetSafe(env, `trade_grades?user_id=eq.${uid}&select=*&order=created_at.desc`),       // 5B.2
        sbGetSafe(env, `mentor_scorecards?user_id=eq.${uid}&select=*`),                          // 5B.3
        sbGetSafe(env, `mentor_review_acks?user_id=eq.${uid}&select=*`),                         // 5B.4
      ]);
      const user = userArr[0] || null;
      if (!user) return json({ error: 'trader_not_found' }, 404);
      const metrics = computeMetrics(trades);          // computed from raw rows
      return json({
        ok: true,
        user: Object.assign({}, user, { display_name: uName(user) }),
        trades: trades.map(normalizeTrade),            // consistent direction/status/pnl/trade_id
        personality,
        aiReports,
        reviews,
        grades,
        scorecard: scorecardArr[0] || null,
        acks,
        metrics,
      });
    }

    // ── CREATE REVIEW ──────────────────────────────────────────────────────
    if (action === 'create-review') {
      const uid = String(body?.userId || '');
      const category = String(body?.category || '').trim();
      const comment = String(body?.comment || '').trim();
      const mentorName = String(body?.mentorName || 'ZTU Mentor').trim().slice(0, 80) || 'ZTU Mentor';
      const account = body?.account ? String(body.account).slice(0, 64) : null;
      const tradeId = body?.tradeId ? String(body.tradeId).slice(0, 32) : null;
      const ALLOWED = ['Approved Trade','Good Entry','Bad Entry','Risk Management Issue','Psychology Issue','Setup Issue','Execution Issue','Rule Violation','Excellent Discipline','Needs Improvement','Custom Review'];
      if (!uid) return json({ error: 'userId required' }, 400);
      if (!ALLOWED.includes(category)) return json({ error: 'invalid_category' }, 400);
      if (!comment) return json({ error: 'comment required' }, 400);
      const row = await sbInsert(env, 'mentor_reviews', {
        user_id: uid, account_number: account, category, comment: comment.slice(0, 4000), mentor_name: mentorName, trade_id: tradeId,
      });
      return json({ ok: true, review: row });
    }

    // ── LIST REVIEWS (all recent, or for one trader) ───────────────────────
    if (action === 'list-reviews') {
      const uid = body?.userId ? String(body.userId) : null;
      const limit = Math.min(parseInt(body?.limit ?? '25', 10) || 25, 100);
      const filter = uid ? `user_id=eq.${uid}&` : '';
      const reviews = await sbGetSafe(env, `mentor_reviews?${filter}select=*&order=created_at.desc&limit=${limit}`);
      return json({ ok: true, reviews });
    }

    // ── STATS ──────────────────────────────────────────────────────────────
    if (action === 'stats') {
      const [reviews, users] = await Promise.all([
        sbGetSafe(env, 'mentor_reviews?select=category,user_id,created_at'),
        sbGet(env, 'users?select=id'),
      ]);
      const byCategory = {};
      const reviewedTraders = new Set();
      for (const r of reviews) {
        byCategory[r.category] = (byCategory[r.category] || 0) + 1;
        reviewedTraders.add(r.user_id);
      }
      return json({
        ok: true,
        totalReviews: reviews.length,
        byCategory,
        reviewedTraders: reviewedTraders.size,
        totalTraders: users.length,
      });
    }

    // ── 5B.1 DASHBOARD — cards + quick sections ────────────────────────────
    if (action === 'dashboard') {
      const [users, trades, reviews, grades] = await Promise.all([
        sbGet(env, 'users?select=id,account_number,full_name,display_name,created_at&order=created_at.desc'),
        sbGet(env, 'journal_trades?select=user_id,created_at'),
        sbGetSafe(env, 'mentor_reviews?select=id,user_id,account_number,category,comment,mentor_name,created_at&order=created_at.desc'),
        sbGetSafe(env, 'trade_grades?select=user_id,created_at'),
      ]);
      const now = Date.now();
      const wk = now - 7 * 864e5, mo = now - 30 * 864e5;
      const reviewedTraders = new Set(reviews.map((r) => r.user_id));
      const reviewsThisWeek = reviews.filter((r) => new Date(r.created_at).getTime() >= wk).length;
      const reviewsThisMonth = reviews.filter((r) => new Date(r.created_at).getTime() >= mo).length;
      // traders with trade activity in the last 30d but no review in last 30d
      const tradesByUser = {}; for (const t of trades) (tradesByUser[t.user_id] = tradesByUser[t.user_id] || []).push(t);
      const recentReviewByUser = {}; for (const r of reviews) { const ts = new Date(r.created_at).getTime(); if (!recentReviewByUser[r.user_id] || ts > recentReviewByUser[r.user_id]) recentReviewByUser[r.user_id] = ts; }
      const tradersNeedingReview = users.filter((u) => {
        const ut = tradesByUser[u.id] || [];
        const recentTrade = ut.some((t) => new Date(t.created_at).getTime() >= mo);
        const recentlyReviewed = (recentReviewByUser[u.id] || 0) >= mo;
        return (ut.length > 0) && (!reviewedTraders.has(u.id) || (recentTrade && !recentlyReviewed));
      }).map((u) => ({ id: u.id, name: uName(u), account: u.account_number, trades: (tradesByUser[u.id] || []).length }));
      return json({
        ok: true,
        cards: {
          totalTraders: users.length,
          pendingReviews: tradersNeedingReview.length,
          reviewedTraders: reviewedTraders.size,
          reviewsThisWeek, reviewsThisMonth,
        },
        latestTraders: users.slice(0, 6).map((u) => ({ id: u.id, name: uName(u), account: u.account_number, joined: u.created_at })),
        latestReviews: reviews.slice(0, 6),
        tradersNeedingReview: tradersNeedingReview.slice(0, 8),
        recentActivity: reviews.slice(0, 10).map((r) => ({ type: 'review', user_id: r.user_id, account: r.account_number, category: r.category, mentor: r.mentor_name, at: r.created_at })),
      });
    }

    // ── 5B.2 GRADE A TRADE ─────────────────────────────────────────────────
    if (action === 'grade-trade') {
      const uid = String(body?.userId || '');
      const grade = String(body?.grade || '').trim();
      const GRADES = { 'Excellent Trade': 5, 'Good Trade': 4, 'Average Trade': 3, 'Poor Trade': 2, 'Rule Violation': 0 };
      if (!uid) return json({ error: 'userId required' }, 400);
      if (!(grade in GRADES)) return json({ error: 'invalid_grade' }, 400);
      const row = await sbInsert(env, 'trade_grades', {
        user_id: uid,
        trade_id: body?.tradeId ? String(body.tradeId).slice(0, 32) : null,
        grade,
        score: GRADES[grade],
        comment: body?.comment ? String(body.comment).slice(0, 2000) : null,
        mentor_name: String(body?.mentorName || 'ZTU Mentor').slice(0, 80) || 'ZTU Mentor',
      });
      return json({ ok: true, grade: row });
    }

    // ── 5B.3 SAVE SCORECARD (upsert one per trader) ────────────────────────
    if (action === 'save-scorecard') {
      const uid = String(body?.userId || '');
      if (!uid) return json({ error: 'userId required' }, 400);
      const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
      const arr = (v) => Array.isArray(v) ? v.slice(0, 20).map((s) => String(s).slice(0, 200)) : [];
      const s = {
        user_id: uid,
        discipline_score: num(body?.discipline), risk_score: num(body?.risk),
        psychology_score: num(body?.psychology), execution_score: num(body?.execution),
        consistency_score: num(body?.consistency),
        strengths: arr(body?.strengths), weaknesses: arr(body?.weaknesses), areas_to_improve: arr(body?.areas),
        mentor_name: String(body?.mentorName || 'ZTU Mentor').slice(0, 80) || 'ZTU Mentor',
      };
      const scores = [s.discipline_score, s.risk_score, s.psychology_score, s.execution_score, s.consistency_score].filter((v) => v != null);
      s.overall_score = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
      const row = await sbUpsert(env, 'mentor_scorecards', 'user_id', s);
      return json({ ok: true, scorecard: row });
    }

    // ── 5B.4 PENDING ACKNOWLEDGEMENT QUEUE ─────────────────────────────────
    if (action === 'pending-acks') {
      const [reviews, acks] = await Promise.all([
        sbGetSafe(env, 'mentor_reviews?select=id,user_id,account_number,category,comment,created_at&order=created_at.desc&limit=100'),
        sbGetSafe(env, 'mentor_review_acks?select=review_id,read_at,acknowledged_at'),
      ]);
      const ackByReview = {}; for (const a of acks) ackByReview[a.review_id] = a;
      const pending = reviews.map((r) => {
        const a = ackByReview[r.id] || {};
        return { ...r, read_at: a.read_at || null, acknowledged_at: a.acknowledged_at || null,
                 status: a.acknowledged_at ? 'acknowledged' : (a.read_at ? 'read' : 'pending') };
      }).filter((r) => r.status !== 'acknowledged');
      return json({ ok: true, pending });
    }

    // ── 5B.5 MENTOR ANALYTICS ──────────────────────────────────────────────
    if (action === 'mentor-analytics') {
      const [reviews, grades, scorecards, users, trades] = await Promise.all([
        sbGetSafe(env, 'mentor_reviews?select=category,user_id,created_at'),
        sbGetSafe(env, 'trade_grades?select=grade,user_id'),
        sbGetSafe(env, 'mentor_scorecards?select=overall_score'),
        sbGet(env, 'users?select=id'),
        sbGet(env, 'journal_trades?select=user_id,created_at'),
      ]);
      const mo = Date.now() - 30 * 864e5;
      const activeTraders = new Set(trades.filter((t) => new Date(t.created_at).getTime() >= mo).map((t) => t.user_id)).size;
      const overall = scorecards.map((s) => Number(s.overall_score)).filter((v) => Number.isFinite(v));
      const avgTraderScore = overall.length ? Math.round((overall.reduce((a, b) => a + b, 0) / overall.length) * 10) / 10 : null;
      // categorize reviews into mistakes / psychology / risk buckets
      const byCat = {}; for (const r of reviews) byCat[r.category] = (byCat[r.category] || 0) + 1;
      const psychCats = ['Psychology Issue']; const riskCats = ['Risk Management Issue'];
      const mistakeCats = ['Bad Entry', 'Setup Issue', 'Execution Issue', 'Rule Violation', 'Needs Improvement'];
      const sumCats = (list) => list.map((c) => ({ k: c, n: byCat[c] || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
      return json({
        ok: true,
        reviewsCompleted: reviews.length,
        reviewsPending: 0,                 // filled client-side from pending-acks if needed
        activeTraders,
        avgTraderScore,
        mostCommonMistakes: sumCats(mistakeCats),
        mostCommonPsychology: sumCats(psychCats),
        mostCommonRisk: sumCats(riskCats),
        gradeDistribution: grades.reduce((m, g) => { m[g.grade] = (m[g.grade] || 0) + 1; return m; }, {}),
        totalTraders: users.length,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: 'server_error', detail: String(err.message || err).slice(0, 300) }, 500);
  }
}
