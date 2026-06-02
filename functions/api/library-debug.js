// functions/api/library-debug.js
// =============================================================================
// POST /api/library-debug   { passcode, account }
//
// READ-ONLY forensic tool. Returns the RAW rows that the OTP email lookup sees,
// from every source, for one account — so you can confirm exactly where (or
// whether) the email is stored. Admin-passcode gated. Safe to deploy; delete
// after diagnosis if you prefer.
//
// Uses the SAME project + service key the OTP gate uses (EA_SUPABASE_*), so what
// you see here is exactly what /api/library-auth sees.
// =============================================================================

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return j({ ok: false, error: 'POST only' }, 405);

  let body; try { body = await request.json(); } catch { return j({ ok: false, error: 'bad json' }, 400); }

  const pass = env.LIBRARY_ADMIN_PASSCODE;
  if (!pass || !body.passcode || String(body.passcode) !== String(pass)) {
    return j({ ok: false, error: 'unauthorized' }, 401);
  }

  const url        = env.EA_SUPABASE_URL;
  const key        = env.EA_SUPABASE_SERVICE_KEY;
  const ibTable    = env.EA_IB_STARS_TABLE || 'ib_stars_active';
  if (!url || !key) return j({ ok: false, error: 'EA_SUPABASE_URL / EA_SUPABASE_SERVICE_KEY not set' }, 200);

  const acct = String(body.account || '').trim();
  if (!acct) return j({ ok: false, error: 'account required' }, 200);
  const norm = normAcct(acct);
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };

  // For each table: exact-eq match AND a tolerant ilike match on the digits.
  const tables = [ibTable, 'broker_accounts', 'license_requests'];
  const report = { project: url, ib_table: ibTable, input: acct, normalized: norm, tables: {} };

  for (const t of tables) {
    report.tables[t] = {
      exact_eq:    await probe(url, headers, `${t}?account_number=eq.${encodeURIComponent(acct)}&select=*&limit=5`),
      eq_dot_zero: await probe(url, headers, `${t}?account_number=eq.${encodeURIComponent(norm + '.0')}&select=*&limit=5`),
      ilike_digits:await probe(url, headers, `${t}?account_number=ilike.*${encodeURIComponent(norm)}*&select=*&limit=10`)
    };
  }

  // Summarise: where is an email actually reachable?
  report.email_found = {};
  for (const t of tables) {
    const sets = report.tables[t];
    let found = null;
    for (const mode of ['exact_eq', 'eq_dot_zero', 'ilike_digits']) {
      const rows = sets[mode]?.rows;
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const e = resolveEmail(row);
          if (e) { found = { via: mode, account_number_stored: row.account_number, email: e }; break; }
        }
      }
      if (found) break;
    }
    report.email_found[t] = found;
  }

  return j({ ok: true, report });
}

async function probe(url, headers, qs) {
  try {
    const r = await fetch(`${url}/rest/v1/${qs}`, { headers });
    const text = await r.text();
    let rows; try { rows = JSON.parse(text); } catch { rows = text; }
    return { status: r.status, count: Array.isArray(rows) ? rows.length : null, rows };
  } catch (e) {
    return { error: e?.message };
  }
}

function resolveEmail(row) {
  if (!row || typeof row !== 'object') return null;
  const keys = ['email', 'client_email', 'linked_email', 'email_address', 'client_email_address', 'user_email', 'contact_email'];
  for (const k of keys) if (row[k] && String(row[k]).includes('@')) return String(row[k]).trim();
  for (const v of Object.values(row)) {
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return v.trim();
  }
  return null;
}

function normAcct(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  let s = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (/[eE]/.test(s) && /^[0-9.eE+\-]+$/.test(s)) { const n = Number(s); if (Number.isFinite(n)) s = String(Math.round(n)); }
  return s.replace(/\.0+$/, '');
}

function j(obj, status = 200) { return new Response(JSON.stringify(obj, null, 2), { status, headers: CORS }); }
