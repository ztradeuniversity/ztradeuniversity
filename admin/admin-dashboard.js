/* ═══════════════════════════════════════════════════════════════
   Admin Dashboard — Automation Command Center
   Phase 2 : Foundation — data paths          (preserved)
   Phase 3 : Full UI — layout & rendering     (preserved)
   Phase 4 : Supabase integration prep        (preserved)
   Phase 7 : Status normalization + legacy migration (preserved)
   Phase 11: Broker file intake + match engine + queue prep (this file)
════════════════════════════════════════════════════════════════ */

'use strict';

const AdminDashboard = (() => {

  /* ═══════════════════════════════════════════════════════════
     PHASE 2 — Data paths (preserved)
  ══════════════════════════════════════════════════════════ */
  const DATA = {
    approvedClients:  'data/approved_clients.json',
    rejectedClients:  'data/rejected_clients.json',
    deliveryLogs:     'data/delivery_logs.json',
    broadcastHistory: 'data/broadcast_history.json',
  };


  /* ═══════════════════════════════════════════════════════════
     SUPABASE CONFIG — Phase 5 live read integration
     Anon key is the same key used in license-request.html.
     It is public-safe — it only grants what RLS policies allow.
     NEVER place service_role key here. NEVER.
  ══════════════════════════════════════════════════════════ */
  const SUPABASE_URL      = 'https://yivkkfplrkcncjaqifxb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpdmtrZnBscmtjbmNqYXFpZnhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ5MjcsImV4cCI6MjA5NDkwMDkyN30._CC6KIPVOhzMyOnLDtTpLbtMwee8y-991YFpoC3eC5Q';

  // Created in initSupabase() — null until then
  let supabaseClient = null;


  /* ═══════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════ */
  const STORAGE_KEY     = 'adc_state_v3';
  const STORAGE_VERSION = 3;


  /* ═══════════════════════════════════════════════════════════
     DB SCHEMA MAP
     Discovered by auditing license-request.html + admin-upload-report.html.
     Authoritative reference for Supabase integration.
     DO NOT change names here without verifying against the live database.
  ══════════════════════════════════════════════════════════ */
  const DB_SCHEMA = {
    TABLE:  'license_requests',
    // Phase 16.8 — screenshot Storage bucket removed; no longer referenced.

    COLS: {
      id:               'id',
      account_number:   'account_number',
      email:            'email',
      // Phase 16.8 — screenshot_url column no longer written by license-request.html.
      // Existing rows still have it; safe to leave the column in place in Supabase.
      status:           'status',
      created_at:       'created_at',
      broker_name:      'broker_name',      // nullable
      whatsapp_number:  'whatsapp_number',  // nullable — Phase 13.5
    },

    // ── Canonical DB status strings (Phase 7) ─────────────────────
    // These are the ONLY values that should exist in new/migrated rows.
    // Legacy values are normalized to these on read (see STATUS_NORMALIZER).
    STATUS: {
      PENDING:       'pending',        // new submission, not yet matched
      MATCHED:       'matched',        // broker referral confirmed
      COMPILE_READY: 'compile_ready',  // queued for EA file generation
      COMPILED:      'compiled',       // EA file generated, ready to send
      EMAILED:       'emailed',        // EA delivered to client — terminal
      UNMATCHED:     'unmatched',      // referral not found — terminal
      // ── Legacy values (normalize on read, never write back) ──────
      // APPROVED  → matched      (old approval flow)
      // COMPILING → compiled     (old in-progress compile state)
      // REJECTED  → unmatched    (renamed for clarity)
    },

    // Dashboard status key → canonical DB statuses that map to it
    DASHBOARD_MAP: {
      new_request:   ['pending'],
      waiting_match: [],                        // mock-only
      matched:       ['matched'],               // approved normalizes before this
      ready_compile: ['compile_ready'],
      compiled:      ['compiled'],              // compiling normalizes before this
      delivered:     ['emailed'],
      rejected:      ['unmatched'],             // unmatched canonical + rejected legacy
    },

    // Safe anon-readable SELECT string.
    // NOTE: keep the base list strictly to columns that EXIST in user's
    // license_requests schema. Optional Phase 16.4 columns (resend_count,
    // last_resend_at, delivered_at, notes) are fetched separately by
    // _fetchDeliveryAudit() and merged in at render time so a missing column
    // never breaks the main intake queue with a 400.
    SELECT: 'id, account_number, email, status, created_at, broker_name, whatsapp_number',
  };


  /* ═══════════════════════════════════════════════════════════
     POLL CONFIG
     Disabled by default — initSupabase() enables it on SDK load.
  ══════════════════════════════════════════════════════════ */
  const POLL_CONFIG = {
    enabled:    false,    // set true by initSupabase()
    intervalMs: 45000,    // 45 s — safe for Supabase free-tier rate limits
    _timer:     null,     // internal: setInterval handle
  };


  /* ═══════════════════════════════════════════════════════════
     STATUS NORMALIZER — legacy → canonical mapping (Phase 7)
     Central lookup table applied to every raw DB status string
     BEFORE any rendering, transition logic, or write validation.

     Rules:
       • Canonical statuses map to themselves (pass-through).
       • Legacy aliases map to their canonical equivalent.
       • Unknown strings fall back to 'pending' with a console warning.
       • This table is the ONLY place legacy→canonical mapping lives.
  ══════════════════════════════════════════════════════════ */
  const STATUS_NORMALIZER = {
    // ── Canonical statuses (pass-through) ───────────────────────
    'pending':       'pending',
    'matched':       'matched',
    'compile_ready': 'compile_ready',
    'compiled':      'compiled',
    'emailed':       'emailed',
    'unmatched':     'unmatched',
    // ── Legacy aliases → canonical ───────────────────────────────
    'approved':      'matched',         // old pre-Phase 7 approval state
    'compiling':     'compiled',        // old in-progress compile state
    'rejected':      'unmatched',       // renamed to unmatched in Phase 7
    // ── Defensive edge-case variants ────────────────────────────
    'compile ready': 'compile_ready',   // space-separated variant
    'ready':         'compile_ready',   // shortened variant
    'email sent':    'emailed',         // verbose variant
    'delivered':     'emailed',         // UI-term used in some exports
  };


  /* ═══════════════════════════════════════════════════════════
     ALLOWED STATUS TRANSITIONS — DB-level write whitelist
     Uses CANONICAL statuses only — legacy values are normalized
     by normalizeDbStatus() before reaching this table.
     NEVER allow backward jumps or arbitrary status values.
     NEVER list legacy aliases here (normalization handles them).
  ══════════════════════════════════════════════════════════ */
  const ALLOWED_TRANSITIONS = {
    'pending':       'matched',
    'matched':       'compile_ready',
    'compile_ready': 'compiled',
    'compiled':      'emailed',
  };


  /* ═══════════════════════════════════════════════════════════
     LIVE TRANSITIONS — dashboard action metadata (Phase 6)
     Maps each actionable dashboard status key to the button
     label, target DB status string, button CSS class, and
     the confirmation message shown before writing.
     Statuses NOT listed here receive a read-only live-tag.
  ══════════════════════════════════════════════════════════ */
  const LIVE_TRANSITIONS = {
    new_request:   {
      label:      'Mark Matched',
      nextDb:     'matched',
      cls:        'btn-action--amber',
      confirmMsg: (acct) => `Move account “${acct}” to Matched?`,
    },
    matched:       {
      label:      'Queue Compile',
      nextDb:     'compile_ready',
      cls:        'btn-action--purple',
      confirmMsg: (acct) => `Queue “${acct}” for compile?`,
    },
    ready_compile: {
      label:      'Mark Compiled',
      nextDb:     'compiled',
      cls:        'btn-action--cyan',
      confirmMsg: (acct) => `Mark “${acct}” as Compiled?`,
    },
    compiled:      {
      label:      'Mark Delivered',
      nextDb:     'emailed',
      cls:        'btn-action--green',
      confirmMsg: (acct) => `Mark “${acct}” as Delivered?`,
    },
  };


  /* ═══════════════════════════════════════════════════════════
     WRITE LOCK — per-row concurrent write guard (Phase 6)
     A Set of request IDs currently being written to Supabase.
     Prevents double-clicks and overlapping writes to one row.
  ══════════════════════════════════════════════════════════ */
  const WriteLock = new Set();


  /* ═══════════════════════════════════════════════════════════
     DATA LAYER — mock / live abstraction
     isLive = false  →  in-memory State (mock behaviour)
     isLive = true   →  Supabase live reads (set by initSupabase)

     If initSupabase() fails, isLive stays false automatically
     and the dashboard continues showing mock/cached data.
  ══════════════════════════════════════════════════════════ */
  const DataLayer = {
    isLive: false,    // set true by initSupabase() when SDK loads

    /* Canonical DB status → dashboard display key.
       Legacy statuses are normalized by normalizeDbStatus() BEFORE
       reaching this table — only canonical keys are needed here.  */
    DB_TO_DASH: {
      'pending':       'new_request',
      'matched':       'matched',
      'compile_ready': 'ready_compile',
      'compiled':      'compiled',
      'emailed':       'delivered',
      'unmatched':     'rejected',       // canonical unmatched → "Not Matched" badge
    },

    /* Returns normalised dashboard request objects.
       Mock path  →  resolves immediately with a State snapshot.
       Live path  →  queries Supabase (SELECT only, anon key).    */
    async fetchAll() {
      if (!DataLayer.isLive) {
        return Promise.resolve(State.requests.map(r => ({ ...r })));
      }
      if (!supabaseClient) {
        throw new Error('[DataLayer] Supabase client not initialised.');
      }

      const { data, error } = await supabaseClient
        .from(DB_SCHEMA.TABLE)
        .select(DB_SCHEMA.SELECT)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('[DataLayer] fetchAll error:', error);
        throw new Error(error.message || 'Supabase read failed');
      }
      return (data || []).map(DataLayer.mapRow);
    },

    /* Converts a raw Supabase row → dashboard request object.
       Normalization step: rawStatus → canonicalDb → dashStatus.
       canonicalDb is stored on the object and used for all subsequent
       transition validation — rawStatus is preserved for audit display. */
    mapRow(row) {
      const rawStatus   = row.status || '';
      const canonicalDb = normalizeDbStatus(rawStatus);              // legacy → canonical
      const dashStatus  = DataLayer.DB_TO_DASH[canonicalDb] || 'new_request';

      const wasNormalized = canonicalDb !== rawStatus.toLowerCase().trim();
      const noteText = wasNormalized
        ? `DB: "${rawStatus}" → normalized to "${canonicalDb}"`
        : `DB status: ${rawStatus || 'unknown'}`;

      return {
        id:          String(row.id),
        account:     row.account_number  || String(row.id),
        name:        row.email           || '—',
        email:       row.email           || '',
        whatsapp:    row.whatsapp_number || '',   // Phase 13.5
        broker:      row.broker_name     || '—',
        status:      dashStatus,
        dbStatus:    rawStatus,       // preserved raw value — for tooltip / audit trail
        canonicalDb: canonicalDb,     // normalized canonical — used for transition validation
        // Phase 16.4 Issue 2 — date + admin local time, e.g. "01 Jun 2026 · 12:27 PM"
        lastUpdate:  row.created_at
          ? (function (iso) {
              try {
                const d = new Date(iso);
                const ds = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
                const ts = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
                return ds + ' · ' + ts;
              } catch (_) { return iso; }
            })(row.created_at)
          : '—',
        attempts:   1,
        notes:      noteText,
        canRecheck: false,
      };
    },

    /* Status write — validates transition, executes Supabase update.
       id              — row primary key (string)
       newDbStatus     — CANONICAL target status (from ALLOWED_TRANSITIONS values)
       currentDbStatus — CANONICAL current status (from req.canonicalDb, not raw dbStatus)

       Security:
         • caller MUST pass req.canonicalDb (not req.dbStatus) so legacy aliases
           are resolved before reaching ALLOWED_TRANSITIONS.
         • Transition is checked against ALLOWED_TRANSITIONS before any network call.
         • Uses anon key — RLS in Supabase enforces server-side access rules.
         • NEVER writes anything other than the status field.
         • NEVER performs a delete.
         • Returns the confirmed row from Supabase (.select) — if 0 rows returned,
           the write was silently blocked by RLS (treated as an error).             */
    async updateStatus(id, newDbStatus, currentDbStatus) {
      if (!DataLayer.isLive) return Promise.resolve();
      if (!supabaseClient) throw new Error('[DataLayer] Supabase client not initialised.');

      // Whitelist check — reject invalid or out-of-order transitions
      const allowed = ALLOWED_TRANSITIONS[currentDbStatus];
      if (allowed !== newDbStatus) {
        throw new Error(
          `[DataLayer] Blocked: "${currentDbStatus}" → "${newDbStatus}" is not an allowed transition. ` +
          `Expected next: "${allowed || 'none'}".`
        );
      }

      const { data, error } = await supabaseClient
        .from(DB_SCHEMA.TABLE)
        .update({ status: newDbStatus })
        .eq('id', id)
        .select('id, status');

      if (error) {
        console.error('[DataLayer] updateStatus error:', error);
        throw new Error(error.message || 'Supabase write failed');
      }
      if (!data || data.length === 0) {
        throw new Error(
          `[DataLayer] Write blocked by RLS or row not found (id: ${id}). ` +
          `Check Supabase RLS update policy for the anon role.`
        );
      }

      console.log(`[DataLayer] updateStatus OK: row ${id} → "${newDbStatus}".`, data[0]);
      return data[0];
    },
  };


  /* ═══════════════════════════════════════════════════════════
     SEED REQUESTS — mock mode starting state
     Only used when DataLayer.isLive = false.
     In live mode Supabase data fully replaces these.
  ══════════════════════════════════════════════════════════ */
  const SEED_REQUESTS = [
    {
      id: 'ACC-001', account: 'ACC-001', name: 'ahmed.k@clients.local',
      email: 'ahmed.k@clients.local', broker: 'Exness', status: 'delivered',
      lastUpdate: '22 May 2025', attempts: 1,
      notes: 'Matched on first broker report. EA file delivered successfully via email.',
      canRecheck: false,
    },
    {
      id: 'ACC-002', account: 'ACC-002', name: 'sara.m@clients.local',
      email: 'sara.m@clients.local', broker: 'IC Markets', status: 'ready_compile',
      lastUpdate: '22 May 2025', attempts: 1,
      notes: 'IB code confirmed — queued for EA compile.',
      canRecheck: false,
    },
    {
      id: 'ACC-003', account: 'ACC-003', name: 'khaled.r@clients.local',
      email: 'khaled.r@clients.local', broker: 'Pepperstone', status: 'matched',
      lastUpdate: '21 May 2025', attempts: 1,
      notes: 'Referral confirmed in latest broker report. Ready to be queued.',
      canRecheck: false,
    },
    {
      id: 'ACC-004', account: 'ACC-004', name: 'fatima.l@clients.local',
      email: 'fatima.l@clients.local', broker: 'Exness', status: 'waiting_match',
      lastUpdate: '21 May 2025', attempts: 2,
      notes: 'Referral link may not have been applied correctly at sign-up.',
      canRecheck: true,
    },
    {
      id: 'ACC-005', account: 'ACC-005', name: 'omar.t@clients.local',
      email: 'omar.t@clients.local', broker: 'FXTM', status: 'waiting_match',
      lastUpdate: '20 May 2025', attempts: 1,
      notes: 'New submission — first broker report check pending.',
      canRecheck: true,
    },
    {
      id: 'ACC-006', account: 'ACC-006', name: 'layla.n@clients.local',
      email: 'layla.n@clients.local', broker: 'Pepperstone', status: 'delivered',
      lastUpdate: '20 May 2025', attempts: 1,
      notes: 'EA delivered via email on 20 May 2025.',
      canRecheck: false,
    },
    {
      id: 'ACC-007', account: 'ACC-007', name: 'yusuf.a@clients.local',
      email: 'yusuf.a@clients.local', broker: 'IC Markets', status: 'ready_compile',
      lastUpdate: '19 May 2025', attempts: 1,
      notes: 'Matched — queued for EA compile.',
      canRecheck: false,
    },
  ];


  /* ═══════════════════════════════════════════════════════════
     STATUS CONFIGURATION
     Single source of truth for display labels and badge CSS.
     Covers all live DB statuses (via DB_TO_DASH mapping) plus
     mock-only statuses (waiting_match).
  ══════════════════════════════════════════════════════════ */
  /* STATUS_META — badge display labels and CSS classes.
     Keys are dashboard status keys (not raw DB strings).
     'rejected' handles both legacy "rejected" rows (normalized to "unmatched" canonical,
     then mapped to "rejected" dashboard key) AND any future canonical "unmatched" rows.
     'unmatched' is included as a defensive fallback in case a canonical "unmatched"
     ever reaches rendering without going through DB_TO_DASH.                        */
  const STATUS_META = {
    new_request:   { label: 'New Request',       cls: 'badge--new'      },
    waiting_match: { label: 'Waiting for Match', cls: 'badge--waiting'  }, // mock only
    matched:       { label: 'Matched',           cls: 'badge--matched'  },
    ready_compile: { label: 'Ready to Compile',  cls: 'badge--compile'  },
    compiled:      { label: 'Compiled',          cls: 'badge--compiled' },
    delivered:     { label: 'Delivered',         cls: 'badge--delivered'},
    rejected:      { label: 'Not Matched',       cls: 'badge--rejected' }, // covers unmatched canonical
    unmatched:     { label: 'Not Matched',       cls: 'badge--rejected' }, // defensive fallback
  };


  /* ═══════════════════════════════════════════════════════════
     MUTABLE STATE — single source of truth
  ══════════════════════════════════════════════════════════ */
  const State = {
    requests:   [],      // current request objects
    lastRun:    null,    // ISO — last mock automation run
    runCount:   0,       // mock automation session count
    isRunning:  false,   // mock automation guard
    lastSync:   null,    // ISO — last successful Supabase fetch
    isFetching: false,   // concurrent-fetch guard
  };


  /* ═══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */
  function today() {
    // Phase 16.4 Issue 2 — include admin local time
    const d = new Date();
    const ds = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const ts = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
    return ds + ' · ' + ts;
  }

  /* Phase 16.4 Issue 2 — global date+time formatter shared across tables */
  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const ds = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      const ts = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
      return ds + ' · ' + ts;
    } catch (_) { return String(iso); }
  }

  function timeLabel(iso) {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString([], {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* normalizeDbStatus — central legacy→canonical normalization (Phase 7)
     Converts any raw DB status string to its canonical equivalent via
     STATUS_NORMALIZER. Falls back to 'pending' for unknown values.

     Usage:
       normalizeDbStatus('approved')   → 'matched'
       normalizeDbStatus('compiling')  → 'compiled'
       normalizeDbStatus('rejected')   → 'unmatched'
       normalizeDbStatus('matched')    → 'matched'  (pass-through)
       normalizeDbStatus(null)         → 'pending'  (safe fallback)

     This is the ONLY function that should perform legacy translation.
     Do NOT scatter legacy alias lookups elsewhere in the code.         */
  function normalizeDbStatus(raw) {
    if (!raw) return 'pending';
    const key      = raw.toLowerCase().trim();
    const canonical = STATUS_NORMALIZER[key];
    if (!canonical) {
      console.warn(
        `[StatusNorm] Unknown DB status "${raw}" — defaulting to "pending". ` +
        `Add to STATUS_NORMALIZER if this is a valid legacy value.`
      );
    }
    return canonical || 'pending';
  }


  /* ═══════════════════════════════════════════════════════════
     SUPABASE INIT
     Reads the Supabase JS SDK from window (loaded via CDN).
     On success: DataLayer.isLive = true, POLL_CONFIG.enabled = true.
     On failure: logs warning, mock mode stays active automatically.
     Idempotent — safe to call multiple times.
  ══════════════════════════════════════════════════════════ */
  function initSupabase() {
    if (supabaseClient) return true;    // already initialised
    try {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase SDK not found on window — check CDN script tag.');
      }
      supabaseClient      = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      DataLayer.isLive    = true;
      POLL_CONFIG.enabled = true;
      console.log('[AdminDashboard] Supabase live mode activated.');
      return true;
    } catch (e) {
      console.warn('[AdminDashboard] Supabase init failed — mock mode active:', e.message);
      DataLayer.isLive    = false;
      POLL_CONFIG.enabled = false;
      supabaseClient      = null;
      return false;
    }
  }


  /* ═══════════════════════════════════════════════════════════
     LOCAL STORAGE — mock-mode persistence only
     Skipped entirely when DataLayer.isLive = true.
     In live mode, Supabase is the single source of truth.
  ══════════════════════════════════════════════════════════ */
  function saveState() {
    if (DataLayer.isLive) return;   // no localStorage writes in live mode
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version:  STORAGE_VERSION,
        savedAt:  new Date().toISOString(),
        requests: State.requests,
        lastRun:  State.lastRun,
        runCount: State.runCount,
      }));
    } catch (e) {
      console.warn('[AdminDashboard] localStorage write failed:', e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw);
      if (!p || p.version !== STORAGE_VERSION) return false;
      if (!Array.isArray(p.requests) || p.requests.length === 0) return false;
      State.requests = p.requests;
      State.lastRun  = p.lastRun  || null;
      State.runCount = p.runCount || 0;
      return true;
    } catch (e) {
      console.warn('[AdminDashboard] localStorage read failed — using seed data:', e);
      return false;
    }
  }

  function resetState() {
    if (DataLayer.isLive) {
      showToast('Reset is not available in live mode — data comes from Supabase.', 'warn');
      return;
    }
    if (State.isRunning) {
      showToast('Cannot reset while automation is running.', 'warn');
      return;
    }
    State.requests  = JSON.parse(JSON.stringify(SEED_REQUESTS));
    State.lastRun   = null;
    State.runCount  = 0;
    State.isRunning = false;
    saveState();
    const filter = els.tableFilter ? els.tableFilter.value : 'all';
    renderTable(filter);
    renderStats();
    renderStatusSummary();
    showToast('Dashboard reset to default mock data.', 'info');
  }


  /* ═══════════════════════════════════════════════════════════
     DOM ELEMENT CACHE — queried once on init
  ══════════════════════════════════════════════════════════ */
  let els = {};

  function cacheEls() {
    els = {
      // Layout
      sidebar:             document.getElementById('sidebar'),
      sidebarOverlay:      document.getElementById('sidebarOverlay'),
      sidebarToggle:       document.getElementById('sidebarToggle'),
      sidebarClose:        document.getElementById('sidebarClose'),
      // Topbar
      topbarTitle:         document.getElementById('topbarTitle'),
      btnRun:              document.getElementById('btnRunAutomation'),
      // Navigation
      navItems:            document.querySelectorAll('.nav-item'),
      sections:            document.querySelectorAll('.dash-section'),
      // Stat cards
      statTotal:           document.getElementById('statTotal'),
      statWaiting:         document.getElementById('statWaiting'),
      statCompile:         document.getElementById('statCompile'),
      statDelivered:       document.getElementById('statDelivered'),
      // Table
      tableBody:           document.getElementById('requestTableBody'),
      tableFilter:         document.getElementById('tableFilter'),
      tableFetchState:     document.getElementById('tableFetchState'),
      // Service health — Supabase row (dynamically updated on fetch)
      supabaseDot:         document.getElementById('supabaseDot'),
      supabaseBadge:       document.getElementById('supabaseBadge'),
      // Status panel — service health footer
      statusLastChecked:   document.getElementById('statusLastChecked'),
      btnRefreshStatus:    document.getElementById('btnRefreshStatus'),
      // Status panel — automation summary
      summaryBadge:        document.getElementById('summaryBadge'),
      summaryWaiting:      document.getElementById('summaryWaiting'),
      summaryMatched:      document.getElementById('summaryMatched'),
      summaryCompile:      document.getElementById('summaryCompile'),
      summaryDelivered:    document.getElementById('summaryDelivered'),
      summaryLastRun:      document.getElementById('summaryLastRun'),
      summaryRunCount:     document.getElementById('summaryRunCount'),
      btnResetState:       document.getElementById('btnResetState'),
      // Status panel — live sync info (Phase 5)
      summaryLiveMode:     document.getElementById('summaryLiveMode'),
      summaryLastSync:     document.getElementById('summaryLastSync'),
      summaryPollingState: document.getElementById('summaryPollingState'),
      // Toast
      toastContainer:      document.getElementById('toastContainer'),
      // Confirm modal (Phase 6)
      confirmModal:        document.getElementById('confirmModal'),
      confirmMsg:          document.getElementById('confirmMsg'),
      btnConfirmOk:        document.getElementById('btnConfirmOk'),
      btnConfirmCancel:    document.getElementById('btnConfirmCancel'),
    };
  }


  /* ═══════════════════════════════════════════════════════════
     NAVIGATION
  ══════════════════════════════════════════════════════════ */
  function activateSection(sectionId, label) {
    els.navItems.forEach(item => item.classList.remove('active'));
    const navEl = document.querySelector(`[data-section="${sectionId}"]`);
    if (navEl) navEl.classList.add('active');
    els.sections.forEach(sec => sec.classList.remove('active'));
    const secEl = document.getElementById(`section-${sectionId}`);
    if (secEl) secEl.classList.add('active');
    if (els.topbarTitle && label) els.topbarTitle.textContent = label;
    // Phase 11B — re-render pool sections with current data on navigation
    if (sectionId === 'pending') renderPendingRequests();
    if (sectionId === 'waiting') renderWaitingForMatch();
    // Phase 15.6 — three sidebar pages wired to fetchIntakeQueue()
    if (sectionId === 'matched')   renderMatchedAccountsSection();
    if (sectionId === 'compile')   renderCompileQueueSection();
    if (sectionId === 'delivered') renderDeliveredSection();
    // Phase 15.6 Phase B — IB Stars + IB Changed
    if (sectionId === 'ib-stars-active')   _renderIbStarsActive();
    if (sectionId === 'ib-stars-inactive') _renderIbStarsInactive();
    if (sectionId === 'ib-changed')        _renderIbChangedList();
    if (sectionId === 'blocked-clients')   _renderBlockedList();   // Phase 16.2 Issue 4
    // Phase 13 — CRM sections
    if (sectionId === 'crm-active')    renderCrmActive();
    if (sectionId === 'crm-inactive')  renderCrmInactive();
    if (sectionId === 'crm-highvalue') renderCrmHighValue();
    if (sectionId === 'crm-search') {
      renderCrmSearch(document.getElementById('crmSearchInput') ? document.getElementById('crmSearchInput').value : '');
    }
    if (sectionId === 'crm-message') {
      renderCampaignBuilder();   // Phase 14A
    }
    if (sectionId === 'intake') {
      // Always hide summary overlay on section entry — CSS display:flex override required explicit hide
      const _sumOverlay = document.getElementById('autoSummaryOverlay');
      if (_sumOverlay) _sumOverlay.hidden = true;
      refreshIntakeQueue();     // Phase 14B — load queue when entering Broker File Intake
      renderDeliveryPanels();   // Phase 15.1 — refresh email + WA delivery panels
      _startEmailOutboxPoll();  // Phase 15.4 — keep status fresh while on this page
    } else {
      _stopEmailOutboxPoll();   // stop polling when leaving intake
    }
    closeSidebar();
  }

  function bindNav() {
    els.navItems.forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        activateSection(item.dataset.section, item.dataset.label);
      });
    });
  }


  /* ═══════════════════════════════════════════════════════════
     SIDEBAR TOGGLE
  ══════════════════════════════════════════════════════════ */
  function openSidebar() {
    els.sidebar.classList.add('open');
    els.sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function bindSidebar() {
    if (els.sidebarToggle)  els.sidebarToggle.addEventListener('click', openSidebar);
    if (els.sidebarClose)   els.sidebarClose.addEventListener('click', closeSidebar);
    if (els.sidebarOverlay) els.sidebarOverlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
  }


  /* ═══════════════════════════════════════════════════════════
     STATS — computed live from State.requests
  ══════════════════════════════════════════════════════════ */
  function computeStats() {
    const r = State.requests;
    return {
      total:     r.length,
      // Waiting card — new_request (live pending) + waiting_match (mock)
      waiting:   r.filter(x => x.status === 'waiting_match' || x.status === 'new_request').length,
      matched:   r.filter(x => x.status === 'matched').length,
      // Compile card — ready_compile + compiled (both in pipeline)
      compile:   r.filter(x => x.status === 'ready_compile' || x.status === 'compiled').length,
      delivered: r.filter(x => x.status === 'delivered').length,
      // Rejected covers 'rejected' (DB_TO_DASH key) + 'unmatched' (defensive fallback)
      rejected:  r.filter(x => x.status === 'rejected' || x.status === 'unmatched').length,
    };
  }

  function renderStats() {
    const s = computeStats();
    if (els.statTotal)     els.statTotal.textContent     = s.total;
    if (els.statWaiting)   els.statWaiting.textContent   = s.waiting;
    if (els.statCompile)   els.statCompile.textContent   = s.compile;
    if (els.statDelivered) els.statDelivered.textContent = s.delivered;
  }


  /* ═══════════════════════════════════════════════════════════
     TABLE — state-driven rendering
  ══════════════════════════════════════════════════════════ */
  function buildBadge(status) {
    const meta = STATUS_META[status] || { label: status, cls: '' };
    return `<span class="badge ${meta.cls}"><span class="badge-dot"></span>${meta.label}</span>`;
  }

  /* Action column:
     Live mode  →  read-only live-tag (no writes in Phase 5).
     Mock mode  →  interactive action buttons (existing behaviour). */
  function buildActionBtn(req) {
    if (DataLayer.isLive) {
      return buildLiveActionBtn(req);
    }
    // ── Mock mode: interactive buttons ───────────────────────────
    switch (req.status) {
      case 'waiting_match':
      case 'new_request':
        if (req.canRecheck) {
          return `<button class="btn-action btn-action--amber"
            data-action="recheck" data-id="${req.id}"
            title="Simulate a recheck against the broker report">Recheck</button>`;
        }
        return `<button class="btn-action" disabled
          title="No recheck available — ask client to verify referral steps">Waiting&hellip;</button>`;

      case 'matched':
        return `<button class="btn-action btn-action--purple"
          data-action="queue-compile" data-id="${req.id}"
          title="Move this account into the compile queue">Queue for Compile</button>`;

      case 'ready_compile':
      case 'compiled':
        return `<button class="btn-action btn-action--green"
          data-action="mark-delivered" data-id="${req.id}"
          title="Mark as delivered">Mark Delivered</button>`;

      case 'delivered':
        return `<button class="btn-action btn-action--done" disabled
          title="Already delivered">Delivered &#10003;</button>`;

      case 'rejected':
      case 'unmatched':
        return `<button class="btn-action" disabled
          title="Not matched — contact the client to verify referral steps">Not Matched</button>`;

      default:
        return `<button class="btn-action" disabled>&mdash;</button>`;
    }
  }

  /* Read-only status tag — used for terminal/non-actionable statuses in live mode.
     Both 'rejected' and 'unmatched' dashboard keys display the same "Not Matched" tag.
     Canonical 'unmatched' maps to dashboard 'rejected' via DB_TO_DASH, but we include
     'unmatched' here as a defensive fallback for any edge-case rendering path.       */
  function buildLiveTag(dashStatus) {
    const LIVE_TAGS = {
      new_request:   ['New Request',  'new_request'],
      waiting_match: ['Waiting…',     'waiting'],
      matched:       ['Matched',      'matched'],
      ready_compile: ['Ready',        'ready_compile'],
      compiled:      ['Compiled',     'compiled'],
      delivered:     ['Delivered ✓',  'delivered'],
      rejected:      ['Not Matched',  'rejected'],   // legacy rejected + canonical unmatched
      unmatched:     ['Not Matched',  'rejected'],   // defensive: canonical unmatched fallback
    };
    const [label, cls] = LIVE_TAGS[dashStatus] || ['—', ''];
    return `<span class="live-tag live-tag--${cls}">${label}</span>`;
  }

  /* Live-mode action button (Phase 6).
     Renders a real write button for actionable statuses (those in LIVE_TRANSITIONS).
     Falls back to a read-only live-tag for terminal / non-actionable statuses.
     Buttons are disabled while a WriteLock is held on that row.               */
  function buildLiveActionBtn(req) {
    const transition = LIVE_TRANSITIONS[req.status];
    if (!transition) {
      return buildLiveTag(req.status);    // delivered, rejected — read-only
    }
    const locked = WriteLock.has(req.id);
    return `<button
      class="btn-action ${transition.cls}"
      data-action="live-write"
      data-id="${esc(req.id)}"
      ${locked ? 'disabled' : ''}
      title="${esc(transition.confirmMsg(req.account))}"
    >${locked ? 'Updating…' : transition.label}</button>`;
  }

  /* ─── Phase 13.5 — WhatsApp SVG icon (brand green) ─────────── */
  const WA_SVG = '<svg class="wa-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  /* Returns an <a> tag that opens a direct WhatsApp chat.
     waStr — raw number string from CRM/request (e.g. "+923001234567").
     Strips all non-digit chars (keeping leading +) then builds wa.me URL. */
  function buildWaLink(waStr, extraCls) {
    if (!waStr) return '';
    const waDigits = waStr.replace(/\D/g, '');  // strip everything except digits (+ gone)
    const url = 'https://wa.me/' + waDigits;
    return `<a class="crm-wa-link${extraCls ? ' ' + extraCls : ''}" href="${url}" target="_blank" rel="noopener noreferrer" title="Open WhatsApp: ${esc(waStr)}">${WA_SVG}${esc(waStr)}</a>`;
  }


  function buildRow(req) {
    const attemptsHTML = req.attempts > 1
      ? `<span class="row-attempts">${req.attempts} checks</span>`
      : '';
    // Tooltip: show normalization info in live mode if a legacy status was detected
    const wasNormalized = req.canonicalDb && req.dbStatus &&
      normalizeDbStatus(req.dbStatus) !== req.dbStatus.toLowerCase().trim();
    const tooltip = DataLayer.isLive
      ? (wasNormalized
          ? `DB: "${req.dbStatus}" → normalized: "${req.canonicalDb}"`
          : `DB status: ${req.dbStatus || req.status}`)
      : (req.notes || '');
    return `<tr data-status="${req.status}" data-id="${req.id}">
      <td title="${esc(tooltip)}">
        <span class="row-account">${esc(req.account)}</span>
        <span class="row-name">${esc(req.name)}</span>
        ${req.whatsapp ? buildWaLink(req.whatsapp, 'crm-wa-link--row') : ''}
        ${attemptsHTML}
      </td>
      <td>${esc(req.broker)}</td>
      <td>${buildBadge(req.status)}</td>
      <td><span class="row-date">${esc(req.lastUpdate)}</span></td>
      <td>${buildActionBtn(req)}</td>
    </tr>`;
  }

  function renderTable(filter) {
    if (!els.tableBody) return;
    filter = filter || 'all';
    const rows = filter === 'all'
      ? State.requests
      : State.requests.filter(r => r.status === filter);
    if (rows.length === 0) {
      els.tableBody.innerHTML = buildEmptyState();
      return;
    }
    els.tableBody.innerHTML = rows.map(buildRow).join('');
  }

  function bindFilter() {
    if (!els.tableFilter) return;
    els.tableFilter.addEventListener('change', () => renderTable(els.tableFilter.value));
  }


  /* ═══════════════════════════════════════════════════════════
     ROW WRITE STATE — inline feedback (Phase 6)
     Updates the action <td> of a specific row with a short
     state label while a Supabase write is in progress.
     state: 'updating' | 'done' | 'error'
  ══════════════════════════════════════════════════════════ */
  function setRowWriteState(id, state) {
    if (!els.tableBody) return;
    const tr = els.tableBody.querySelector(`tr[data-id="${CSS.escape ? CSS.escape(id) : id}"]`);
    if (!tr) return;
    const td = tr.querySelector('td:last-child');
    if (!td) return;
    const MAP = {
      updating: { cls: 'row-write-state--updating', text: 'Updating…' },
      done:     { cls: 'row-write-state--done',     text: 'Updated ✓'  },
      error:    { cls: 'row-write-state--error',    text: 'Failed ✕'   },
    };
    const cfg = MAP[state] || MAP.updating;
    td.innerHTML = `<span class="row-write-state ${cfg.cls}">${cfg.text}</span>`;
  }


  /* ═══════════════════════════════════════════════════════════
     ROW FLASH
  ══════════════════════════════════════════════════════════ */
  function flashRow(id) {
    if (!els.tableBody) return;
    const tr = els.tableBody.querySelector(`tr[data-id="${id}"]`);
    if (!tr) return;
    tr.classList.remove('row--flash');
    void tr.offsetHeight;         // forced reflow — restarts animation
    tr.classList.add('row--flash');
    setTimeout(() => tr.classList.remove('row--flash'), 1500);
  }


  /* ═══════════════════════════════════════════════════════════
     TABLE ACTIONS — event delegation
     Live mode  →  only 'live-write' actions are processed.
     Mock mode  →  existing mock action handlers.
  ══════════════════════════════════════════════════════════ */
  function bindTableActions() {
    if (!els.tableBody) return;
    els.tableBody.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;

      const { action, id } = btn.dataset;

      // Live mode — only safe write actions (Phase 6)
      if (DataLayer.isLive) {
        if (action === 'live-write') handleLiveAction(id);
        return;
      }

      // Mock mode — existing interactive handlers
      if (action === 'recheck')        actionRecheck(id);
      if (action === 'queue-compile')  actionQueueCompile(id);
      if (action === 'mark-delivered') actionMarkDelivered(id);
    });
  }


  /* ─── Action: Recheck ───────────────────────────────────────
     waiting_match → matched (mock simulation, 1.9s delay).
  ──────────────────────────────────────────────────────────── */
  function actionRecheck(id) {
    const btn = els.tableBody.querySelector(`[data-action="recheck"][data-id="${id}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      btn.classList.remove('btn-action--amber');
    }
    showToast('Rechecking account against broker report…', 'info', 2200);

    setTimeout(() => {
      const req = State.requests.find(r => r.id === id);
      if (!req) return;
      req.status     = 'matched';
      req.lastUpdate = today();
      req.attempts  += 1;
      req.canRecheck = false;
      req.notes      = `Match confirmed on manual recheck (attempt ${req.attempts}).`;
      saveState();
      const filter = els.tableFilter ? els.tableFilter.value : 'all';
      renderTable(filter);
      renderStats();
      flashRow(id);
      renderStatusSummary();
      showToast(`Match confirmed — ${req.account} is now Matched.`, 'success');
    }, 1900);
  }


  /* ─── Action: Queue for Compile ─────────────────────────────
     matched → ready_compile (instant mock transition).
  ──────────────────────────────────────────────────────────── */
  function actionQueueCompile(id) {
    const req = State.requests.find(r => r.id === id);
    if (!req || req.status !== 'matched') return;
    req.status     = 'ready_compile';
    req.lastUpdate = today();
    req.notes      = 'Manually queued for EA compile.';
    saveState();
    const filter = els.tableFilter ? els.tableFilter.value : 'all';
    renderTable(filter);
    renderStats();
    flashRow(id);
    renderStatusSummary();
    showToast(`${req.account} added to compile queue.`, 'success');
  }


  /* ─── Action: Mark Delivered ────────────────────────────────
     ready_compile | compiled → delivered (instant mock transition).
  ──────────────────────────────────────────────────────────── */
  function actionMarkDelivered(id) {
    const req = State.requests.find(r => r.id === id);
    if (!req || (req.status !== 'ready_compile' && req.status !== 'compiled')) return;
    req.status     = 'delivered';
    req.lastUpdate = today();
    req.canRecheck = false;
    req.notes      = 'EA delivered — marked manually via dashboard.';
    saveState();
    const filter = els.tableFilter ? els.tableFilter.value : 'all';
    renderTable(filter);
    renderStats();
    flashRow(id);
    renderStatusSummary();
    showToast(`${req.account} marked as delivered.`, 'delivered');
  }


  /* ═══════════════════════════════════════════════════════════
     RUN AUTOMATION — mock multi-step flow (mock mode only)
     In live mode this button shows an explanatory toast and exits.
  ══════════════════════════════════════════════════════════ */
  function setRunBtnState(running) {
    if (!els.btnRun) return;
    if (running) {
      els.btnRun.disabled = true;
      els.btnRun.classList.add('btn-run--running');
      els.btnRun.innerHTML = `<span class="run-spinner"></span>Running&hellip;`;
    } else {
      els.btnRun.disabled = false;
      els.btnRun.classList.remove('btn-run--running');
      // Phase 15.4 — header button is a navigation shortcut to intake
      els.btnRun.innerHTML = `
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true">
          <path d="M2 7h10M8 3l4 4-4 4"/>
        </svg>
        Go to Intake`;
    }
  }

  function runAutomation() {
    if (DataLayer.isLive) {
      // Live mode — the real automation lives in Broker File Intake.
      // Navigate there so the admin can upload a file and use runBrokerAutomation().
      activateSection('intake', 'Broker File Intake');
      return;
    }
    if (State.isRunning) {
      showToast('Automation is already running — please wait.', 'warn');
      return;
    }
    const preMatchedIds = new Set(
      State.requests.filter(r => r.status === 'matched').map(r => r.id)
    );
    const recheckable = State.requests.filter(
      r => r.status === 'waiting_match' && r.canRecheck
    );
    if (recheckable.length === 0 && preMatchedIds.size === 0) {
      showToast('Nothing to process — no accounts waiting for match or queued for compile.', 'info');
      return;
    }

    State.isRunning = true;
    setRunBtnState(true);
    showToast('Automation started — checking accounts…', 'info');

    // Step 1 (t=1200ms): waiting_match → matched
    setTimeout(() => {
      if (recheckable.length > 0) {
        recheckable.forEach(req => {
          req.status = 'matched'; req.lastUpdate = today();
          req.attempts += 1; req.canRecheck = false;
          req.notes = 'Match found during automation run.';
        });
        renderTable(els.tableFilter ? els.tableFilter.value : 'all');
        renderStats();
        showToast(`Match found for ${recheckable.length} account${recheckable.length > 1 ? 's' : ''}.`, 'success');
      }
    }, 1200);

    // Step 2 (t=3200ms): pre-matched → ready_compile
    setTimeout(() => {
      const toCompile = State.requests.filter(
        r => r.status === 'matched' && preMatchedIds.has(r.id)
      );
      if (toCompile.length > 0) {
        toCompile.forEach(req => {
          req.status = 'ready_compile'; req.lastUpdate = today();
          req.notes = 'Queued for compile by automation run.';
        });
        renderTable(els.tableFilter ? els.tableFilter.value : 'all');
        renderStats();
        showToast(
          `${toCompile.length} account${toCompile.length > 1 ? 's' : ''} moved to compile queue.`,
          'success'
        );
      }
    }, 3200);

    // Finalise (t=5000ms)
    setTimeout(() => {
      State.isRunning = false;
      State.lastRun   = new Date().toISOString();
      State.runCount += 1;
      saveState();
      setRunBtnState(false);
      renderStatusSummary();
      renderStatusTimestamp();
      showToast('Automation check complete.', 'info');
    }, 5000);
  }

  function bindRunBtn() {
    if (!els.btnRun) return;
    els.btnRun.addEventListener('click', runAutomation);
  }


  /* ═══════════════════════════════════════════════════════════
     SYSTEM STATUS PANEL
  ══════════════════════════════════════════════════════════ */
  function renderStatusTimestamp() {
    if (!els.statusLastChecked) return;
    els.statusLastChecked.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });
  }

  /* Updates the Supabase service health row based on fetch result */
  function updateSupabaseRow(ok, labelText) {
    if (els.supabaseDot) {
      els.supabaseDot.className = ok
        ? 'status-dot-sm status-dot-sm--ok'
        : 'status-dot-sm status-dot-sm--warn';
    }
    if (els.supabaseBadge) {
      els.supabaseBadge.textContent = labelText;
      els.supabaseBadge.className   = ok
        ? 'status-badge status-badge--ok'
        : 'status-badge status-badge--warn';
    }
  }

  function renderStatusSummary() {
    const s = computeStats();

    // Summary grid
    if (els.summaryWaiting)   els.summaryWaiting.textContent   = s.waiting;
    if (els.summaryMatched)   els.summaryMatched.textContent   = s.matched;
    if (els.summaryCompile)   els.summaryCompile.textContent   = s.compile;
    if (els.summaryDelivered) els.summaryDelivered.textContent = s.delivered;

    // Mock run info
    if (els.summaryLastRun)  els.summaryLastRun.textContent  = timeLabel(State.lastRun);
    if (els.summaryRunCount) els.summaryRunCount.textContent = State.runCount;

    // Live sync info (Phase 5)
    if (els.summaryLastSync) {
      els.summaryLastSync.textContent = DataLayer.isLive
        ? timeLabel(State.lastSync)
        : 'N/A (mock mode)';
    }
    if (els.summaryPollingState) {
      const active = POLL_CONFIG.enabled && POLL_CONFIG._timer !== null;
      els.summaryPollingState.textContent = active ? 'Polling active' : 'Polling off';
      els.summaryPollingState.className = active
        ? 'sync-state sync-state--active'
        : 'sync-state sync-state--off';
    }
    if (els.summaryLiveMode) {
      els.summaryLiveMode.textContent = DataLayer.isLive ? '● Live' : '● Mock';
      els.summaryLiveMode.className   = DataLayer.isLive
        ? 'status-overall-badge status-overall-badge--ok'
        : 'status-overall-badge status-overall-badge--warn';
    }

    // Supabase service health row
    if (DataLayer.isLive) {
      updateSupabaseRow(State.lastSync !== null, State.lastSync ? 'Connected' : 'Connecting…');
    } else {
      updateSupabaseRow(false, 'Mock Mode');
    }

    // Main summary badge
    if (els.summaryBadge) {
      if (State.isRunning) {
        els.summaryBadge.textContent = 'Running…';
        els.summaryBadge.className   = 'status-overall-badge status-overall-badge--warn';
      } else if (DataLayer.isLive && State.lastSync) {
        els.summaryBadge.textContent = 'Live — synced ' + timeLabel(State.lastSync);
        els.summaryBadge.className   = 'status-overall-badge status-overall-badge--ok';
      } else if (!DataLayer.isLive && State.lastRun) {
        els.summaryBadge.textContent = 'Last run: ' + timeLabel(State.lastRun);
        els.summaryBadge.className   = 'status-overall-badge status-overall-badge--ok';
      } else {
        els.summaryBadge.textContent = DataLayer.isLive ? 'Connecting…' : 'Idle';
        els.summaryBadge.className   = 'status-overall-badge status-overall-badge--ok';
      }
    }
  }

  function bindRefreshStatus() {
    if (!els.btnRefreshStatus) return;
    els.btnRefreshStatus.addEventListener('click', async () => {
      renderStatusTimestamp();
      if (DataLayer.isLive) {
        showToast('Refreshing from Supabase…', 'info', 1800);
        await loadData();
      } else {
        renderStatusSummary();
        showToast('Status refreshed (mock mode).', 'info');
      }
    });
  }

  function bindResetBtn() {
    if (!els.btnResetState) return;
    els.btnResetState.addEventListener('click', resetState);
  }


  /* ═══════════════════════════════════════════════════════════
     TOAST NOTIFICATIONS
  ══════════════════════════════════════════════════════════ */
  const TOAST_PREFIX = {
    success:   '✓ ',
    warn:      '⚠ ',
    error:     '✕ ',
    delivered: '✓ ',
    info:      '',
  };

  function showToast(message, type, duration) {
    if (!els.toastContainer) return;
    type     = type     || 'info';
    duration = duration || 4000;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `${TOAST_PREFIX[type] || ''}${message}`;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.28s ease';
      toast.style.opacity    = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }


  /* ═══════════════════════════════════════════════════════════
     LOADING STATE HELPERS
  ══════════════════════════════════════════════════════════ */
  function buildLoadingRows(n) {
    n = n || 5;
    const row = `<tr class="table-loading-row">
      <td><span class="skel skel--wide"></span></td>
      <td><span class="skel skel--med"></span></td>
      <td><span class="skel skel--med"></span></td>
      <td><span class="skel skel--narrow"></span></td>
      <td><span class="skel skel--btn"></span></td>
    </tr>`;
    return Array(n).fill(row).join('');
  }

  function buildEmptyState() {
    const sub = DataLayer.isLive
      ? 'No records found in Supabase for this filter. New submissions will appear here automatically.'
      : 'No accounts match the current filter — or no requests have been submitted yet.';
    return `<tr><td colspan="5">
      <div class="table-empty-state">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4"
          stroke-linecap="round" stroke-linejoin="round" width="42" height="42" opacity="0.3">
          <rect x="6" y="8" width="36" height="32" rx="3"/>
          <path d="M14 20h20M14 27h12"/>
        </svg>
        <p class="table-empty-title">No requests found</p>
        <p class="table-empty-sub">${sub}</p>
      </div>
    </td></tr>`;
  }

  function setFetchState(loading) {
    if (!els.tableFetchState || !els.tableBody) return;
    if (loading) {
      els.tableFetchState.hidden = false;
      els.tableBody.innerHTML    = buildLoadingRows(5);
    } else {
      els.tableFetchState.hidden = true;
    }
  }


  /* ═══════════════════════════════════════════════════════════
     CONFIRM MODAL — Promise-based overlay (Phase 6)
     showConfirmModal resolves true (OK) or false (Cancel/Escape).
     _confirmPending prevents stacking multiple modals.
  ══════════════════════════════════════════════════════════ */
  let _confirmPending = false;
  let _confirmResolve = null;

  function showConfirmModal(message) {
    if (_confirmPending) return Promise.resolve(false);   // already open — reject silently
    _confirmPending = true;
    if (els.confirmMsg)   els.confirmMsg.textContent = message;
    if (els.confirmModal) els.confirmModal.classList.add('confirm-modal--visible');
    return new Promise(resolve => { _confirmResolve = resolve; });
  }

  function hideConfirmModal(result) {
    if (!_confirmPending) return;
    _confirmPending = false;
    if (els.confirmModal) els.confirmModal.classList.remove('confirm-modal--visible');
    if (_confirmResolve) {
      _confirmResolve(!!result);
      _confirmResolve = null;
    }
  }

  function bindConfirmModal() {
    if (els.btnConfirmOk) {
      els.btnConfirmOk.addEventListener('click', () => hideConfirmModal(true));
    }
    if (els.btnConfirmCancel) {
      els.btnConfirmCancel.addEventListener('click', () => hideConfirmModal(false));
    }
    // Click on backdrop closes with Cancel
    if (els.confirmModal) {
      els.confirmModal.addEventListener('click', e => {
        if (e.target === els.confirmModal) hideConfirmModal(false);
      });
    }
    // Escape closes with Cancel (piggy-backs existing keydown — handles modal only)
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _confirmPending) hideConfirmModal(false);
    });
  }


  /* ═══════════════════════════════════════════════════════════
     HANDLE LIVE ACTION — full async write flow (Phase 6)
     1. Resolve request + transition definition
     2. Check WriteLock (per-row guard)
     3. Confirm modal (non-blocking Promise)
     4. Lock row → inline "Updating…" state
     5. DataLayer.updateStatus (validated Supabase write)
     6a. On success → inline "Updated ✓" → delayed loadData
     6b. On failure → inline "Failed ✕" → toast → restore button
  ══════════════════════════════════════════════════════════ */
  async function handleLiveAction(id) {
    const req = State.requests.find(r => r.id === id);
    if (!req) {
      showToast('Request not found — try refreshing.', 'warn');
      return;
    }

    const transition = LIVE_TRANSITIONS[req.status];
    if (!transition) {
      showToast('No write action available for this status.', 'info');
      return;
    }

    if (WriteLock.has(id)) {
      showToast('This row is already being updated — please wait.', 'warn');
      return;
    }

    // Await user confirmation
    const confirmed = await showConfirmModal(transition.confirmMsg(req.account));
    if (!confirmed) return;

    // Acquire lock + show inline state immediately
    WriteLock.add(id);
    setRowWriteState(id, 'updating');

    // Use canonicalDb (normalized) — not dbStatus (raw legacy) — for transition validation.
    // Example: req.dbStatus='approved', req.canonicalDb='matched' → validates correctly.
    const currentCanonical = req.canonicalDb || normalizeDbStatus(req.dbStatus || '');

    try {
      await DataLayer.updateStatus(id, transition.nextDb, currentCanonical);

      // Write confirmed by Supabase
      setRowWriteState(id, 'done');
      showToast(`${req.account} updated to "${transition.label}".`, 'success');

      // Brief feedback window, then reload fresh data
      setTimeout(async () => {
        WriteLock.delete(id);
        await loadData();
      }, 1200);

    } catch (err) {
      console.error('[AdminDashboard] handleLiveAction failed:', err);

      setRowWriteState(id, 'error');
      showToast(
        'Write failed — ' + (err.message || 'Supabase error. Check RLS policies.'),
        'error',
        7000
      );

      // After feedback window: unlock + re-render to restore the button
      setTimeout(() => {
        WriteLock.delete(id);
        const filter = els.tableFilter ? els.tableFilter.value : 'all';
        renderTable(filter);
      }, 2500);
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     ██████████████████████████████████████████████████████████████
     PHASE 11 — BROKER FILE INTAKE ENGINE
     ██████████████████████████████████████████████████████████████

     Architecture:
       1. bindIntake()          — wires all drop-zone / file UI events
       2. handleIntakeFile()    — entry point after file is selected
       3. parseFile()           — CSV via manual parse / XLSX via SheetJS
       4. detectAccountColumn() — auto-detect or prompt admin to select
       5. extractAccounts()     — pull account numbers from parsed rows
       6. runMatchEngine()      — compare broker accounts vs DB requests
       7. renderIntakePreview() — display preview report
       8. processIntakeFile()   — commit writes (matched→compile_ready,
                                  unmatched→unmatched) + log
       9. buildUnmatchedEmail() — compose guidance email body text
      10. resetIntake()         — clear all state, show drop zone again

     Security: all existing WriteLock / ALLOWED_TRANSITIONS /
     normalizeDbStatus protections are preserved.
     No SMTP secrets are included here — email is prepared for
     a server-side function to send.
  ══════════════════════════════════════════════════════════════ */

  /* ─── Intake state ──────────────────────────────────────────── */
  const IntakeState = {
    file:            null,   // File object
    parsedRows:      [],     // array of plain row objects from the file
    columns:         [],     // column header names detected
    accountCol:      null,   // name of the chosen account-number column
    brokerAccounts:  [],     // Set of account numbers extracted from file
    matchResult:     null,   // { matched:[], unmatched:[], duplicates:[], queued:[] }
    isProcessing:    false,  // guard against double-clicks
  };

  /*
   * Column detection — broker files vary between brokers and export formats.
   *
   * HIGH confidence → auto-proceed (specific, unambiguous names).
   * LOW  confidence → always show column picker so admin confirms.
   *
   * 'id', 'user_id' etc. are LOW because they often refer to internal
   * deal/trade IDs (Exness, IC Markets) not the MT5 login/account number.
   */
  const ACCOUNT_COL_CANDIDATES_HIGH = [
    'account_number', 'account number', 'accountnumber',
    'login',          'mt5_login',      'mt5 login',     'mt5login',
    'mt4_login',      'mt4 login',      'mt4login',
    'trading_account','trading account','tradingaccount',
    'account',        'acc_no',         'acc no',         'accno',
    'client_id',      'clientid',       'customer_id',    'customerid',
    'partner_login',  'partner login',
    'user_login',     'userlogin',
    'broker_account', 'broker_login',
    'metatrader_login','mt_login',
    'trader_login',   'trader login',
    'account_id',     'accountid',
  ];

  // Generic names — useful hint but always show picker for confirmation
  const ACCOUNT_COL_CANDIDATES_LOW = [
    'id', 'user_id', 'userid', 'uid',
  ];

  // Combined ordered list (HIGH first) used for partial-match fallback
  const ACCOUNT_COL_CANDIDATES = [...ACCOUNT_COL_CANDIDATES_HIGH, ...ACCOUNT_COL_CANDIDATES_LOW];

  /**
   * Normalize an account ID from any source:
   * XLSX number, DB string, form text input.
   *
   * Handles:
   *   168098627          → "168098627"   (number as-is)
   *   "168098627"        → "168098627"   (string as-is)
   *   "168098627.0"      → "168098627"   (trailing decimal artifact)
   *   " 168098627 "      → "168098627"   (whitespace)
   *   "168,098,627"      → "168098627"   (comma separators)
   *   "1.68098627E+08"   → "168098627"   (scientific notation)
   */
  function normalizeAccountId(raw) {
    if (raw === null || raw === undefined || raw === '') return '';
    // Convert numbers (JS Number type) — String(168098627.0) is already "168098627"
    let s = String(raw).trim();
    // Remove comma thousand-separators
    s = s.replace(/,/g, '');
    // Remove internal whitespace
    s = s.replace(/\s+/g, '');
    // Resolve scientific notation ("1.68098627E+08" → number → integer string)
    if (/^[0-9.e+\-]+$/i.test(s) && (s.includes('e') || s.includes('E'))) {
      const n = Number(s);
      if (Number.isFinite(n)) s = String(Math.round(n));
    }
    // Strip trailing .0 / .00 (float artifact that survives String conversion)
    s = s.replace(/\.0+$/, '');
    return s;
  }


  /* ═══════════════════════════════════════════════════════════
     PHASE 13 — CRM INTELLIGENCE ENGINE
     localStorage-backed CRM data store populated on every
     broker file import. Cross-references State.requests for
     email addresses (broker files contain no email field).

     Record shape:
       { account, email, lastTrade, createdAt, reward,
         volumeLots, volumeUsd, accountType, country,
         platform, uid, importedAt }

     Active   = lastTrade is a non-empty string (has ever traded)
     Inactive = lastTrade is empty (never traded / no history)
     High Value = reward > 0, sorted descending by commission

     localStorage key: ZTU_CRM_DATA_V1
  ══════════════════════════════════════════════════════════ */
  const CRM_STORE_KEY = 'ZTU_CRM_DATA_V1';

  /* Broker file column names ranked by priority for each CRM field.
     Based on real broker export schema (ClientsAccountsReport).     */
  const CRM_COL_CANDIDATES = {
    account:     ['client_account', 'account_number', 'account', 'login', 'acc_no'],
    lastTrade:   ['client_account_last_trade', 'last_trade', 'last_activity', 'last_trade_date'],
    createdAt:   ['client_account_created', 'created_at', 'joined', 'registration_date'],
    reward:      ['reward_usd', 'reward', 'commission', 'rebate'],
    volumeLots:  ['volume_lots', 'lots', 'volume'],
    volumeUsd:   ['volume_mln_usd', 'volume_usd', 'volume_million_usd'],
    accountType: ['client_account_type', 'account_type', 'type'],
    country:     ['client_country', 'country'],
    platform:    ['platform'],
    uid:         ['client_uid', 'uid', 'client_id'],
  };

  const CrmStore = {
    _data: null,

    _read() {
      if (this._data !== null) return this._data;
      try {
        const raw = localStorage.getItem(CRM_STORE_KEY);
        this._data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        console.warn('[CrmStore] read error:', e);
        this._data = {};
      }
      return this._data;
    },

    _write() {
      try {
        localStorage.setItem(CRM_STORE_KEY, JSON.stringify(this._data));
      } catch (e) {
        console.warn('[CrmStore] write failed — localStorage full?', e);
      }
    },

    /* Detect a column name from parsed row keys. */
    _detectCol(colNames, candidates) {
      const lower = colNames.map(c => c.toLowerCase().trim());
      for (const cand of candidates) {
        const idx = lower.indexOf(cand.toLowerCase());
        if (idx !== -1) return colNames[idx];
      }
      return null;
    },

    /* Parse all broker file rows into normalized CRM records.
       accountColName — already resolved by the Intake engine.
       Cross-references State.requests to attach email addresses. */
    importFromRows(rows, accountColName) {
      if (!rows || rows.length === 0) return 0;
      const cols   = Object.keys(rows[0]);
      const colMap = {};
      for (const [field, candidates] of Object.entries(CRM_COL_CANDIDATES)) {
        colMap[field] = field === 'account'
          ? accountColName
          : this._detectCol(cols, candidates);
      }

      // Contact lookup (email + whatsapp) from State.requests, keyed by account number
      const contactMap = {};
      State.requests.forEach(r => {
        if (r.account) {
          const key = String(r.account).trim();
          if (!contactMap[key]) contactMap[key] = { email: '', whatsapp: '' };
          if (r.email    && !contactMap[key].email)    contactMap[key].email    = r.email;
          if (r.whatsapp && !contactMap[key].whatsapp) contactMap[key].whatsapp = r.whatsapp;
        }
      });

      const store = this._read();
      let count   = 0;

      rows.forEach(row => {
        const acct = colMap.account ? String(row[colMap.account] || '').trim() : '';
        if (!acct) return;
        const get    = f => colMap[f] ? String(row[colMap[f]] || '').trim() : '';
        const getNum = f => { const v = colMap[f] ? parseFloat(row[colMap[f]]) : NaN; return isNaN(v) ? 0 : v; };
        const plat   = get('platform');
        const ctc    = contactMap[acct] || {};
        store[acct] = {
          account:     acct,
          email:       ctc.email    || (store[acct] ? store[acct].email    : ''),
          whatsapp:    ctc.whatsapp || (store[acct] ? store[acct].whatsapp : ''),  // Phase 13.5
          lastTrade:   get('lastTrade'),
          createdAt:   get('createdAt'),
          reward:      getNum('reward'),
          volumeLots:  getNum('volumeLots'),
          volumeUsd:   getNum('volumeUsd'),
          accountType: get('accountType'),
          country:     get('country'),
          platform:    plat ? plat.toUpperCase() : '',
          uid:         get('uid'),
          importedAt:  Date.now(),
        };
        count++;
      });

      this._write();
      console.log(`[CrmStore] Imported ${count} client records from broker file.`);
      return count;
    },

    /* Refresh email + WhatsApp from current State.requests — call after loadData().
       Phase 13.5: extended from syncEmails() to also sync whatsapp_number.        */
    syncContactData() {
      const store   = this._read();
      let changed   = false;
      State.requests.forEach(r => {
        const key = r.account ? String(r.account).trim() : null;
        if (!key || !store[key]) return;
        if (r.email    && !store[key].email)    { store[key].email    = r.email;    changed = true; }
        if (r.whatsapp && !store[key].whatsapp) { store[key].whatsapp = r.whatsapp; changed = true; }
      });
      if (changed) this._write();
    },

    getAll()      { return Object.values(this._read()); },
    getCount()    { return Object.keys(this._read()).length; },
    isEmpty()     { return this.getCount() === 0; },

    isActive(r)   { return !!(r.lastTrade); },
    getActive()   { return this.getAll().filter(r =>  this.isActive(r)); },
    getInactive() { return this.getAll().filter(r => !this.isActive(r)); },

    getHighValue(limit) {
      return this.getAll()
        .filter(r => r.reward > 0)
        .sort((a, b) => b.reward - a.reward)
        .slice(0, limit || 20);
    },

    daysSince(dateStr) {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d)) return null;
      return Math.floor((Date.now() - d.getTime()) / 86_400_000);
    },

    getTotalCommission() {
      return this.getAll().reduce((s, r) => s + (r.reward || 0), 0);
    },

    search(q) {
      if (!q || !q.trim()) return this.getAll();
      const lower = q.trim().toLowerCase();
      return this.getAll().filter(r =>
        (r.account     && r.account.toLowerCase().includes(lower))     ||
        (r.email       && r.email.toLowerCase().includes(lower))       ||
        (r.whatsapp    && r.whatsapp.toLowerCase().includes(lower))    ||  // Phase 13.5
        (r.country     && r.country.toLowerCase().includes(lower))     ||
        (r.accountType && r.accountType.toLowerCase().includes(lower)) ||
        (r.platform    && r.platform.toLowerCase().includes(lower))
      );
    },

    getImportDate() {
      const all = this.getAll();
      if (!all.length) return null;
      const ms = Math.max(...all.map(r => r.importedAt || 0));
      return ms > 0 ? new Date(ms) : null;
    },
  };


  /* ═══════════════════════════════════════════════════════════
     PHASE 11B — RETRY POOL
     localStorage-backed store for accounts NOT found in a
     broker file upload. Active entries are re-checked on every
     future upload. After RETRY_POOL_MAX_DAYS without a match
     the account is archived (DB written as 'unmatched') and
     excluded from all future broker-file checks.

     Entry shape:
       { id, account, email, broker, requestDate,
         firstMissedAt (ms), retryCount, lastChecked (ms),
         archived (bool) }

     localStorage key: ZTU_ADMIN_RETRY_POOL_V1
  ══════════════════════════════════════════════════════════ */
  const RETRY_POOL_KEY      = 'ZTU_ADMIN_RETRY_POOL_V1';
  const RETRY_POOL_MAX_DAYS = 2;   // Phase 15.3B: 48-hour window (was 7 days)
  const RETRY_POOL_DAY_MS   = 86_400_000;   // ms per day

  const RetryPool = {
    _data: null,   // in-memory cache; null = not yet loaded

    /* ── Load from localStorage (cached after first call) ─── */
    _read() {
      if (this._data !== null) return this._data;
      try {
        const raw = localStorage.getItem(RETRY_POOL_KEY);
        this._data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        console.warn('[RetryPool] read error:', e);
        this._data = {};
      }
      return this._data;
    },

    /* ── Persist to localStorage ─────────────────────────── */
    _write() {
      try {
        localStorage.setItem(RETRY_POOL_KEY, JSON.stringify(this._data));
      } catch (e) {
        console.warn('[RetryPool] write failed — localStorage full?', e);
      }
    },

    /* ── Add or update on each broker file miss.
         retryCount increments on every call after the first. */
    upsert(req) {
      const pool     = this._read();
      const now      = Date.now();
      const existing = pool[req.id];
      pool[req.id] = {
        id:           req.id,
        account:      req.account,
        email:        req.email || req.name || '',
        broker:       req.broker || '—',
        requestDate:  req.lastUpdate || '—',
        firstMissedAt: existing ? existing.firstMissedAt : now,
        retryCount:   existing ? existing.retryCount + 1 : 1,
        lastChecked:  now,
        archived:     false,
      };
      this._write();
      return pool[req.id];
    },

    /* ── Archive — DB written as unmatched, no more checks ── */
    archive(id) {
      const pool = this._read();
      if (pool[id]) {
        pool[id].archived   = true;
        pool[id].archivedAt = pool[id].archivedAt || Date.now();  // preserve if already set
        this._write();
      }
    },

    /* ── Remove entirely — account was successfully matched ─ */
    remove(id) {
      const pool = this._read();
      if (pool[id]) { delete pool[id]; this._write(); }
    },

    /* ── Is the 7-day window expired? ────────────────────── */
    isExpired(entry) {
      if (!entry || !entry.firstMissedAt) return false;
      return (Date.now() - entry.firstMissedAt) >= RETRY_POOL_MAX_DAYS * RETRY_POOL_DAY_MS;
    },

    /* ── Integer days waiting since first miss ───────────── */
    getDaysWaiting(entry) {
      if (!entry || !entry.firstMissedAt) return 0;
      return Math.floor((Date.now() - entry.firstMissedAt) / RETRY_POOL_DAY_MS);
    },

    /* ── Phase 16.7 Issue 1 — milliseconds remaining until 48h
     *    cutoff. Negative when already expired. */
    getMsRemaining(entry) {
      if (!entry || !entry.firstMissedAt) return 0;
      const expiresAt = entry.firstMissedAt + RETRY_POOL_MAX_DAYS * RETRY_POOL_DAY_MS;
      return expiresAt - Date.now();
    },

    /* ── Phase 16.7 Issue 1 — human-readable countdown string,
     *    e.g. "47h 12m left", "14m left", "02h 41m left".
     *    Returns "Expired" once past the 48h cutoff. */
    formatCountdown(entry) {
      const ms = this.getMsRemaining(entry);
      if (ms <= 0) return 'Expired';
      const totalMin = Math.floor(ms / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      if (h <= 0) return m + 'm left';
      const hStr = (h < 10 ? '0' + h : String(h));
      const mStr = (m < 10 ? '0' + m : String(m));
      return hStr + 'h ' + mStr + 'm left';
    },

    /* ── Phase 16.7 Issue 4 — auto-recovery.
     *    Un-archives an entry and stamps recoveredAt so the dashboard
     *    can flash a "Recovered Match" badge.  Keeps the entry in the
     *    pool for ~24h so the badge stays visible, then it gets pruned
     *    by pruneRecoveredEntries() once the grace window passes. */
    recover(id) {
      const pool = this._read();
      if (!pool[id]) return null;
      pool[id].archived          = false;
      pool[id].recoveredAt       = Date.now();
      pool[id].lastChecked       = Date.now();
      this._write();
      return pool[id];
    },

    /* ── Phase 16.7 Issue 5 — remove recovered entries older than 24h.
     *    Once the badge has had time to be seen by the admin, drop the
     *    row from the pool entirely so it doesn't keep re-rendering. */
    pruneRecoveredEntries(maxAgeMs) {
      const ttl = maxAgeMs || (24 * 60 * 60 * 1000);
      const pool  = this._read();
      let pruned = 0;
      const now  = Date.now();
      for (const id of Object.keys(pool)) {
        const e = pool[id];
        if (e && e.recoveredAt && (now - e.recoveredAt) > ttl) {
          delete pool[id];
          pruned++;
        }
      }
      if (pruned > 0) this._write();
      return pruned;
    },

    /* ── Single entry lookup ─────────────────────────────── */
    getById(id) { return this._read()[id] || null; },

    /* ── All entries as flat array ───────────────────────── */
    getAll() { return Object.values(this._read()); },

    /* ── Active = not archived AND not expired ───────────── */
    getActive()   { return this.getAll().filter(e => !e.archived && !this.isExpired(e)); },

    /* ── Archived = explicitly archived OR expired ────────── */
    getArchived() { return this.getAll().filter(e =>  e.archived ||  this.isExpired(e)); },

    /* ── ID Sets for O(1) membership tests ───────────────── */
    getActiveIds()   { return new Set(this.getActive().map(e => e.id)); },
    getArchivedIds() { return new Set(this.getArchived().map(e => e.id)); },

    /* ── Is this id actively tracked in the pool? ────────── */
    isActive(id) {
      const e = this.getById(id);
      return !!(e && !e.archived && !this.isExpired(e));
    },
  };


  /* ─── Intake element cache (populated in cacheIntakeEls) ──── */
  let iels = {};

  function cacheIntakeEls() {
    iels = {
      dropzone:        document.getElementById('intakeDropzone'),
      fileInput:       document.getElementById('intakeFileInput'),
      browseBtn:       document.getElementById('intakeBrowseBtn'),
      colSelector:     document.getElementById('intakeColSelector'),
      colSelect:       document.getElementById('intakeColSelect'),
      colConfirm:      document.getElementById('intakeColConfirm'),
      preview:         document.getElementById('intakePreview'),
      previewStatus:   document.getElementById('intakePreviewStatus'),
      previewFileName: document.getElementById('previewFileName'),
      previewColName:  document.getElementById('previewColName'),
      previewTs:       document.getElementById('previewTimestamp'),
      statBroker:          document.getElementById('previewTotalBroker'),   // meta line count
      statMatched:         document.getElementById('previewMatched'),
      statUnmatched:       document.getElementById('previewUnmatched'),
      statDuplicate:       document.getElementById('previewDuplicate'),
      statMatchNotFound:   document.getElementById('previewMatchNotFound'), // archived pool count
      matchedList:         document.getElementById('intakeMatchedList'),
      matchedBody:         document.getElementById('intakeMatchedBody'),
      matchedHeader:       document.getElementById('intakeMatchedHeader'),
      matchedCount:        document.getElementById('intakeMatchedCount'),
      unmatchedList:       document.getElementById('intakeUnmatchedList'),
      unmatchedBody:       document.getElementById('intakeUnmatchedBody'),
      unmatchedHeader:     document.getElementById('intakeUnmatchedHeader'),
      unmatchedCount:      document.getElementById('intakeUnmatchedCount'),
      emailPreview:    document.getElementById('intakeEmailPreview'),
      cancelBtn:       document.getElementById('intakeCancelBtn'),
      toggleEmailBtn:  document.getElementById('intakeToggleEmailBtn'),
      processBtn:      document.getElementById('intakeProcessBtn'),
      processing:      document.getElementById('intakeProcessing'),
      processingLabel: document.getElementById('intakeProcessingLabel'),
      result:          document.getElementById('intakeResult'),
      resultTitle:     document.getElementById('intakeResultTitle'),
      resultSub:       document.getElementById('intakeResultSub'),
      resultNewBtn:    document.getElementById('intakeResultNewBtn'),
    };
  }


  /* ─── bindIntake — wire all UI events ───────────────────────── */
  function bindIntake() {
    cacheIntakeEls();
    if (!iels.dropzone) return;   // section not in DOM yet — safe exit

    // File browse button
    iels.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      iels.fileInput.click();
    });

    // Click on drop zone also opens picker
    iels.dropzone.addEventListener('click', () => iels.fileInput.click());
    iels.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); iels.fileInput.click(); }
    });

    // File input change
    iels.fileInput.addEventListener('change', () => {
      if (iels.fileInput.files && iels.fileInput.files[0]) {
        handleIntakeFile(iels.fileInput.files[0]);
      }
    });

    // Drag-and-drop
    iels.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      iels.dropzone.classList.add('drag-over');
    });
    iels.dropzone.addEventListener('dragleave', () => {
      iels.dropzone.classList.remove('drag-over');
    });
    iels.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      iels.dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleIntakeFile(file);
    });

    // Column selector confirm
    iels.colConfirm.addEventListener('click', () => {
      const chosen = iels.colSelect.value;
      if (!chosen) { showToast('Please select a column first.', 'warn'); return; }
      IntakeState.accountCol = chosen;
      iels.colSelector.hidden = true;
      continueAfterColumnChoice();
    });

    // Cancel button
    iels.cancelBtn.addEventListener('click', resetIntake);

    // Matched list — click header to expand/collapse rows
    if (iels.matchedHeader) {
      iels.matchedHeader.addEventListener('click', () => {
        iels.matchedList.classList.toggle('intake-list-card--expanded');
      });
    }

    // Unmatched list — click header to expand/collapse rows
    if (iels.unmatchedHeader) {
      iels.unmatchedHeader.addEventListener('click', () => {
        iels.unmatchedList.classList.toggle('intake-list-card--expanded');
      });
    }

    // Toggle email preview
    iels.toggleEmailBtn.addEventListener('click', () => {
      const hidden = iels.emailPreview.hidden;
      iels.emailPreview.hidden = !hidden;
      iels.toggleEmailBtn.textContent = hidden
        ? 'Hide Guidance Email'
        : 'Show Guidance Email';
    });

    // Process button
    iels.processBtn.addEventListener('click', processIntakeFile);

    // New upload button (result screen)
    iels.resultNewBtn.addEventListener('click', resetIntake);
  }


  /* ─── handleIntakeFile — entry point after file selected ─────── */
  function handleIntakeFile(file) {
    const name = file.name || '';
    const ext  = name.split('.').pop().toLowerCase();

    if (ext !== 'csv' && ext !== 'xlsx') {
      showToast('Unsupported file type. Please upload a .csv or .xlsx file.', 'error', 6000);
      return;
    }

    IntakeState.file = file;
    showToast(`Reading "${name}"…`, 'info', 2500);

    // Show parsing indicator — hidden again by renderIntakePreview() on success
    // or by the catch blocks below on failure.
    if (iels.processingLabel) iels.processingLabel.textContent = 'Reading file…';
    if (iels.processing)      iels.processing.hidden = false;
    if (iels.dropzone)        iels.dropzone.hidden   = true;

    const reader = new FileReader();

    if (ext === 'csv') {
      reader.onload = (e) => {
        try {
          const { rows, columns } = parseCSV(e.target.result);
          IntakeState.parsedRows = rows;
          IntakeState.columns    = columns;
          afterFileParsed();
        } catch (err) {
          showToast('Could not parse CSV: ' + err.message, 'error', 7000);
          if (iels.processing) iels.processing.hidden = true;
          if (iels.dropzone)   iels.dropzone.hidden   = false;
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        try {
          const { rows, columns } = parseXLSX(e.target.result);
          IntakeState.parsedRows = rows;
          IntakeState.columns    = columns;
          afterFileParsed();
        } catch (err) {
          showToast('Could not parse XLSX: ' + err.message, 'error', 7000);
          if (iels.processing) iels.processing.hidden = true;
          if (iels.dropzone)   iels.dropzone.hidden   = false;
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }


  /* ─── parseCSV — manual RFC-4180 parser (no external dep) ──── */
  function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) throw new Error('CSV appears to be empty or has no data rows.');

    // Parse a single CSV line respecting quoted fields
    function parseLine(line) {
      const fields = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuote = !inQuote; }
        } else if (ch === ',' && !inQuote) {
          fields.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      fields.push(cur.trim());
      return fields;
    }

    const headers = parseLine(lines[0]);
    const rows    = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals = parseLine(line);
      const obj  = {};
      headers.forEach((h, idx) => { obj[h] = vals[idx] !== undefined ? vals[idx] : ''; });
      rows.push(obj);
    }
    return { rows, columns: headers };
  }


  /* ─── parseXLSX — SheetJS-powered parser ───────────────────── */
  function parseXLSX(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS library not loaded. Check CDN script tag.');
    }
    const wb    = XLSX.read(arrayBuffer, { type: 'array' });
    const wsName = wb.SheetNames[0];
    const ws    = wb.Sheets[wsName];
    const rows  = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    if (rows.length === 0) throw new Error('The XLSX sheet appears to be empty.');
    return { rows, columns };
  }


  /* ─── detectAccountColumn — auto-detect or prompt admin ─────── */
  /*
   * Returns { col, confidence: 'high' | 'low' | 'none' }
   *   high  → auto-proceed (unambiguous column name found)
   *   low   → show picker with a suggestion (generic or partial match)
   *   none  → show picker with no suggestion
   *
   * Generic names like 'id' always return LOW so admin can confirm
   * which column contains the MT5 trading account / login number.
   */
  function detectAccountColumn(columns) {
    const lowerCols = columns.map(c => c.toLowerCase().trim());

    // ── Exact match on HIGH-confidence candidates → auto-proceed ──
    for (const candidate of ACCOUNT_COL_CANDIDATES_HIGH) {
      const idx = lowerCols.indexOf(candidate);
      if (idx !== -1) return { col: columns[idx], confidence: 'high' };
    }

    // ── Partial match on HIGH-confidence candidates → show picker ──
    // e.g. "trader_login_id" contains "login"
    for (const candidate of ACCOUNT_COL_CANDIDATES_HIGH) {
      const idx = lowerCols.findIndex(c => c.includes(candidate) || candidate.includes(c));
      if (idx !== -1) return { col: columns[idx], confidence: 'low' };
    }

    // ── Exact match on LOW-confidence candidates (id, uid…) → always picker ──
    for (const candidate of ACCOUNT_COL_CANDIDATES_LOW) {
      const idx = lowerCols.indexOf(candidate);
      if (idx !== -1) return { col: columns[idx], confidence: 'low' };
    }

    return { col: null, confidence: 'none' };
  }


  /* ─── _detectByDbMatch — Phase 15.3C ground-truth disambiguator ── */
  /*
   * BULLETPROOF column detection — uses the actual license_requests
   * database as the source of truth.
   *
   * For each column, count how many normalized values exist inside
   * the current State.requests account-number set.  Whichever column
   * has the MOST overlap with the DB is, by definition, the correct
   * MT5-login column — because that is what license_requests stores.
   *
   * This solves the "two numeric columns" problem definitively:
   *   - Column A "id" (partner IDs)  → 0 matches with DB requests
   *   - Column G "login" (client MT5) → ≥1 match (e.g. 168098627)
   *   → Column G wins. No heuristics needed.
   *
   * Returns: { col, hits }  — col is null if no column has any overlap.
   */
  function _detectByDbMatch(rows, columns) {
    // Build the set of normalized request account numbers from the DB.
    if (!State.requests || State.requests.length === 0) {
      return { col: null, hits: 0 };
    }
    const requestSet = new Set();
    State.requests.forEach(r => {
      const v = normalizeAccountId(r.account);
      if (v) requestSet.add(v);
    });
    if (requestSet.size === 0) return { col: null, hits: 0 };

    // For each column, count how many of its values are in the request set.
    let bestCol  = null;
    let bestHits = 0;

    for (const col of columns) {
      let hits = 0;
      for (let i = 0; i < rows.length; i++) {
        const v = normalizeAccountId(rows[i][col]);
        if (v && requestSet.has(v)) hits++;
      }
      if (hits > bestHits) {
        bestHits = hits;
        bestCol  = col;
      }
    }

    return { col: bestCol, hits: bestHits };
  }


  /* ─── _detectByValues — Phase 15.3B value-heuristic fallback ── */
  /*
   * When header-name detection returns low/none confidence, scan column
   * values to find whichever column most looks like MT5 account numbers.
   *
   * MT5 account numbers are pure integers, typically 5–10 digits.
   * This distinguishes them from:
   *   - Very large deal/ticket IDs (often 11–13 digits on Exness)
   *   - Small sequential row IDs (1, 2, 3 … < 10000)
   *   - String/date/price columns
   *
   * Returns: column name string, or null if no column qualifies.
   */
  function _detectByValues(rows, columns) {
    const sample    = rows.slice(0, Math.min(rows.length, 100));
    const THRESHOLD = 0.75;   // ≥75% of sampled values must match
    const RE_ACCT   = /^\d{5,10}$/;  // 5–10 digit pure integer

    let bestCol   = null;
    let bestScore = 0;

    for (const col of columns) {
      const vals = sample
        .map(r => normalizeAccountId(r[col]))
        .filter(v => v !== '');

      if (vals.length === 0) continue;

      const hits  = vals.filter(v => RE_ACCT.test(v)).length;
      const score = hits / vals.length;

      if (score < THRESHOLD) continue;

      if (score > bestScore) {
        bestScore = score;
        bestCol   = col;
      } else if (score === bestScore && bestCol !== null) {
        // Tie-break: prefer the column whose header partially matches a
        // known account-related keyword (even low-confidence ones).
        const lc = col.toLowerCase();
        const keywords = [
          'login', 'account', 'acct', 'client', 'trader',
          'user', 'mt', 'broker', 'partner', 'id',
        ];
        const colIsRelated  = keywords.some(k => lc.includes(k));
        const bestIsRelated = keywords.some(k => bestCol.toLowerCase().includes(k));
        if (colIsRelated && !bestIsRelated) {
          bestCol = col;  // challenger wins tie on keyword relevance
        }
      }
    }

    return bestCol;
  }


  /* ─── afterFileParsed — choose column then continue ─────────── */
  /*
   * Phase 15.3C ground-truth-first detection.
   *
   * Detection priority (each pass exits early on success):
   *   1. HIGH-confidence header-name match  → auto-proceed.
   *   2. DB-intersection match (Phase 15.3C) → auto-proceed.
   *      Counts overlap with State.requests account numbers — bulletproof
   *      when the file has multiple numeric-looking columns (partner ID
   *      vs client MT5 login).  Whichever column overlaps the DB wins.
   *   3. Value-shape heuristic (Phase 15.3B) → auto-proceed.
   *   4. Last resort: show column picker.
   *
   * CRITICAL: iels.processing is hidden HERE, at the very top, regardless
   * of which branch is taken.  The previous code never hid it in the
   * low/none branch, causing the "Reading file…" spinner to stay visible
   * forever whenever the picker was shown.
   */
  function afterFileParsed() {
    // ── Always kill the "Reading file…" spinner immediately ───────
    if (iels.processing) iels.processing.hidden = true;

    // ── Pass 1: header-name detection ────────────────────────────
    const { col: headerCol, confidence } = detectAccountColumn(IntakeState.columns);

    if (confidence === 'high') {
      // Unambiguous match — proceed without showing anything to admin.
      IntakeState.accountCol = headerCol;
      console.log('[Intake] column auto-detected via header (HIGH):', headerCol);
      continueAfterColumnChoice();
      return;
    }

    // ── Pass 2: DB-intersection match (Phase 15.3C) ──────────────
    // Use the live license_requests table as ground truth.  Whichever
    // column has the most overlap with submitted accounts IS the
    // correct login column.  This is the definitive disambiguator
    // when multiple columns hold numeric IDs.
    const dbMatch = _detectByDbMatch(IntakeState.parsedRows, IntakeState.columns);
    if (dbMatch.col) {
      IntakeState.accountCol = dbMatch.col;
      console.log(
        `[Intake] column auto-detected via DB intersection: "${dbMatch.col}" ` +
        `(${dbMatch.hits} value(s) overlap with license_requests).`
      );
      continueAfterColumnChoice();
      return;
    }

    // ── Pass 3: value-shape heuristic (Phase 15.3B) ──────────────
    // Checks which column contains ≥75% 5–10-digit integers — the
    // signature shape of MT5 trading account numbers.  Used only when
    // DB intersection produced no hits (e.g. fresh import, empty DB,
    // or no overlap because no submitted account was in this file).
    const valueCol = _detectByValues(IntakeState.parsedRows, IntakeState.columns);

    if (valueCol) {
      IntakeState.accountCol = valueCol;
      console.log('[Intake] column auto-detected via value shape:', valueCol);
      continueAfterColumnChoice();
      return;
    }

    // ── Pass 4: last-resort picker ───────────────────────────────
    const select = iels.colSelect;
    select.innerHTML = '';
    IntakeState.columns.forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c;
      opt.textContent = c + (headerCol && c === headerCol ? ' (suggested)' : '');
      select.appendChild(opt);
    });
    if (headerCol) select.value = headerCol;
    iels.colSelector.hidden = false;
    showToast(
      'Could not auto-detect the account column — please select it from the dropdown.',
      'warn',
      6000
    );
  }


  /* ─── continueAfterColumnChoice — run match engine + preview ── */
  function continueAfterColumnChoice() {
    const accounts = extractAccounts(IntakeState.parsedRows, IntakeState.accountCol);
    IntakeState.brokerAccounts = accounts;

    // Phase 15.3C — forensic audit log (column choice + sample values)
    const sampleVals = Array.from(accounts).slice(0, 5);
    console.log(
      `[Intake] using column "${IntakeState.accountCol}" — ` +
      `${accounts.size} unique account(s) extracted. ` +
      `Sample: [${sampleVals.join(', ')}${accounts.size > 5 ? ', …' : ''}]`
    );

    // Phase 13 — populate CRM store from all broker file rows
    CrmStore.importFromRows(IntakeState.parsedRows, IntakeState.accountCol);

    /* Phase 16.9 — also populate IbStars classification immediately during
       parse so the IB Stars Active / Inactive sidebar pages refresh on
       upload (previously they only filled when admin clicked Run Automation).
       Wrapped in try/catch so a malformed last-trade column cannot break
       the rest of the intake flow. */
    try {
      if (typeof IbStars !== 'undefined' && IbStars && typeof IbStars.updateFromBrokerRows === 'function') {
        IbStars.updateFromBrokerRows(IntakeState.parsedRows, IntakeState.columns || []);
      }
    } catch (e) {
      console.warn('[Phase16.9] IbStars.updateFromBrokerRows during parse failed (non-fatal):', e);
    }

    /* Phase 17D — PERSISTENT BROKER REGISTRY.
       Mirror every parsed broker row to Supabase `broker_accounts` immediately
       on parse — NOT only inside runBrokerAutomation.  This fixes the bug
       where uploading a broker file populated CrmStore (local) but left
       broker_accounts (Supabase) empty, causing later license_requests to
       miss the auto-match against accounts the admin had already imported.
       Fire-and-forget; runs in the background so parse UI is never blocked.
       The async upsert chunks 500 rows at a time inside _persistBrokerAccounts
       so even thousands of rows stay responsive. */
    try {
      if (typeof _persistBrokerAccounts === 'function' && IntakeState.parsedRows && IntakeState.parsedRows.length > 0) {
        _persistBrokerAccounts(
          IntakeState.parsedRows,
          IntakeState.columns || [],
          IntakeState.file ? IntakeState.file.name : null
        ).then(res => {
          console.log('[Phase17D] broker_accounts persisted on PARSE — upserted=' + (res && res.upserted) + ', errors=' + (res && res.errors));
          // Refresh license_requests auto-match against the freshly-persisted
          // registry so any pending row submitted while waiting for this broker
          // file gets matched right away.
          try {
            if (typeof _autoMatchPendingViaBroker === 'function') _autoMatchPendingViaBroker();
          } catch (_) {}
        }).catch(e => console.warn('[Phase17D] broker_accounts persist on parse failed (non-fatal):', e));
      }
    } catch (e) {
      console.warn('[Phase17D] broker_accounts parse-persist invocation failed:', e);
    }

    const result = runMatchEngine(accounts);
    IntakeState.matchResult = result;

    // Phase 15.3C — per-request match verdict log
    console.log(
      `[MatchEngine] matched=${result.matched.length} ` +
      `unmatched=${result.unmatched.length} ` +
      `duplicates=${result.duplicates.length} ` +
      `queued=${result.queued.length}`
    );
    if (result.matched.length > 0) {
      console.log('[MatchEngine] matched accounts:', result.matched.map(r => r.account));
    }
    if (result.unmatched.length > 0) {
      console.log('[MatchEngine] unmatched accounts:', result.unmatched.map(r => r.account));
    }

    renderIntakePreview(result);
  }


  /* ─── extractAccounts — pull account numbers from parsed rows ── */
  function extractAccounts(rows, colName) {
    const set = new Set();
    rows.forEach(row => {
      const val = normalizeAccountId(row[colName]);
      if (val) set.add(val);
    });
    return set;   // Set<string> — all values normalized via normalizeAccountId()
  }


  /* ─── runMatchEngine — core matching logic ───────────────────── */
  /*
     Compares broker file accounts against State.requests.

     Classification:
       matched    — account found in broker file, request is 'pending' or
                    'new_request' → will be moved to 'matched' → 'compile_ready'
       duplicates — already at compile_ready / compiled / emailed (skip safely)
       unmatched  — request exists but account NOT in broker file
                    (only those still in pending/new_request state)

     The broker file may also contain accounts with NO matching request —
     those are simply ignored (they're other IB clients).
  */
  function runMatchEngine(brokerAccountSet) {
    const matched    = [];   // requests newly confirmed by broker file
    const unmatched  = [];   // pending requests not found in broker file
    const duplicates = [];   // already processed — skipped safely
    const queued     = [];   // will move to compile_ready

    const ALREADY_PROCESSED = new Set(['compile_ready','compiled','emailed','delivered']);

    // Phase 11B: archived pool IDs have exceeded the 7-day retry window
    // and been written to DB as 'unmatched'. Exclude them from ALL future
    // broker-file match checks to avoid unnecessary re-processing load.
    const archivedPoolIds = RetryPool.getArchivedIds();

    State.requests.forEach(req => {
      const acct     = normalizeAccountId(req.account);
      const inBroker = brokerAccountSet.has(acct);
      const dashSt   = req.status;

      // Skip archived retry-pool accounts — they are permanently resolved
      if (archivedPoolIds.has(req.id)) return;

      if (ALREADY_PROCESSED.has(dashSt)) {
        // Already progressed — do not touch regardless of broker file
        if (inBroker) duplicates.push(req);
        return;
      }

      if (dashSt === 'matched') {
        // Already manually matched — broker confirms it, push straight to compile queue
        if (inBroker) queued.push(req);
        return;
      }

      if (dashSt === 'new_request' || dashSt === 'waiting_match' || dashSt === 'rejected' || dashSt === 'unmatched') {
        if (inBroker) {
          matched.push(req);
          queued.push(req);
        } else {
          unmatched.push(req);
        }
      }
    });

    return { matched, unmatched, duplicates, queued };
  }


  /* ─── _renderDeliveryBreakdown — Phase 15.3 ─────────────────── */
  /*
   * Renders the delivery planning breakdown BELOW the 4 stat cards.
   * Shows exactly what emails and WhatsApp messages WILL be sent
   * when admin clicks Run Automation, so intent is clear up front.
   *
   * Delivery rules:
   *   matched     → compile file + license delivery email + WA success msg
   *   waiting     → waiting email immediately + waiting WA + retry pool
   *   not_found   → final not-found email + final not-found WA (7-day expired)
   *   later match → (if waiting account matches next upload) compile + congrats email + congrats WA
   */
  function _renderDeliveryBreakdown(matched, unmatched, duplicates) {
    const el = document.getElementById('intakeDeliveryBreakdown');
    if (!el) return;

    const notFound = RetryPool.getArchived();   // exhausted 7-day window this session

    // Counts
    const emailLicenseDelivery = matched.length;
    const emailWaiting         = unmatched.filter(r => {
      const e = RetryPool.getById(r.id);
      return !e || !e.archived;                 // in-window (will get waiting email)
    }).length;
    const emailNotFound        = notFound.length;
    const totalEmail           = emailLicenseDelivery + emailWaiting + emailNotFound;

    const waMatchSuccess       = matched.filter(r => r.whatsapp).length;
    const waWaiting            = unmatched.filter(r => {
      const e = RetryPool.getById(r.id);
      return r.whatsapp && (!e || !e.archived);
    }).length;
    const waNotFound           = notFound.filter(r => r.whatsapp).length;
    const totalWa              = waMatchSuccess + waWaiting + waNotFound;

    if (totalEmail === 0 && totalWa === 0) {
      el.hidden = true;
      return;
    }

    function row(label, val, cls) {
      return `<div class="idb-row">
        <span class="idb-row-label">${label}</span>
        <span class="idb-row-val ${cls || ''}">${val}</span>
      </div>`;
    }

    el.hidden   = false;
    el.innerHTML =
      `<div class="idb-col">
        <div class="idb-col-title">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12"><rect x="2" y="4" width="16" height="12" rx="1.5"/><path d="M2 6l8 6 8-6"/></svg>
          Emails to Send (${totalEmail})
        </div>
        ${row('License Delivery Emails', emailLicenseDelivery, 'idb-row-val--green')}
        ${row('Waiting for Match Emails', emailWaiting,        'idb-row-val--amber')}
        ${row('48h Not Found Emails',      emailNotFound,        'idb-row-val--error')}
      </div>` +
      `<div class="idb-col">
        <div class="idb-col-title">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12"><path d="M10 2a8 8 0 1 1-5.29 14.09L2 18l1.91-2.71A8 8 0 0 1 10 2z"/></svg>
          WhatsApp to Send (${totalWa})
        </div>
        ${row('Match Success Messages',    waMatchSuccess, 'idb-row-val--green')}
        ${row('Waiting for Match Messages',waWaiting,      'idb-row-val--amber')}
        ${row('Final Not Found Messages',  waNotFound,     'idb-row-val--error')}
      </div>`;
  }


  /* ─── renderIntakePreview — populate preview panel ──────────── */
  function renderIntakePreview(result) {
    if (!iels.preview) return;

    const { matched, unmatched, duplicates, queued } = result;
    const totalBroker = IntakeState.brokerAccounts.size;

    // Meta
    iels.previewFileName.textContent = IntakeState.file ? IntakeState.file.name : '—';
    iels.previewColName.textContent  = IntakeState.accountCol || '—';
    iels.previewTs.textContent = new Date().toLocaleString([], {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });

    // Stats — meta line broker count
    if (iels.statBroker) iels.statBroker.textContent = totalBroker;

    // Stats — 4 actionable cards
    iels.statMatched.textContent   = matched.length;
    iels.statUnmatched.textContent = unmatched.length;
    iels.statDuplicate.textContent = duplicates.length;
    // "Match Not Found" = accounts that have been in retry pool long enough
    // to be archived (exhausted 7-day window — permanently unresolved)
    if (iels.statMatchNotFound) {
      iels.statMatchNotFound.textContent = RetryPool.getArchived().length;
    }

    // Badge state
    iels.previewStatus.textContent = matched.length > 0
      ? `${matched.length} account${matched.length !== 1 ? 's' : ''} matched`
      : (unmatched.length > 0 ? 'No new matches — accounts added to retry pool' : 'Nothing new to process');
    iels.previewStatus.className = matched.length > 0
      ? 'intake-preview-badge intake-preview-badge--ok'
      : 'intake-preview-badge intake-preview-badge--warn';

    // Matched list — shown collapsed, admin clicks header to expand
    if (matched.length > 0) {
      iels.matchedBody.innerHTML = matched.map(r =>
        `<div class="intake-list-row">
          <span class="intake-list-acct">${esc(r.account)}</span>
          <span class="intake-list-email">${esc(r.email || r.name)}</span>
          <span class="intake-list-broker">${esc(r.broker)}</span>
        </div>`
      ).join('');
      if (iels.matchedCount) iels.matchedCount.textContent = matched.length;
      iels.matchedList.hidden = false;
      iels.matchedList.classList.remove('intake-list-card--expanded');   // start collapsed
    } else {
      iels.matchedList.hidden = true;
    }

    // Unmatched list — shown collapsed, admin clicks header to expand
    if (unmatched.length > 0) {
      iels.unmatchedBody.innerHTML = unmatched.map(r =>
        `<div class="intake-list-row">
          <span class="intake-list-acct">${esc(r.account)}</span>
          <span class="intake-list-email">${esc(r.email || r.name)}</span>
          <span class="intake-list-broker">${esc(r.broker)}</span>
        </div>`
      ).join('');
      if (iels.unmatchedCount) iels.unmatchedCount.textContent = unmatched.length;
      iels.unmatchedList.hidden = false;
      iels.unmatchedList.classList.remove('intake-list-card--expanded');  // start collapsed
      iels.emailPreview.hidden  = true;
      iels.toggleEmailBtn.textContent = 'Show Guidance Email';
    } else {
      iels.unmatchedList.hidden    = true;
      iels.emailPreview.hidden     = true;
      iels.toggleEmailBtn.textContent = 'Show Guidance Email';
    }

    // Phase 15.3 — Delivery Breakdown panel
    _renderDeliveryBreakdown(matched, unmatched, duplicates);

    // Process button state
    iels.processBtn.disabled = (queued.length === 0 && unmatched.length === 0);

    // Phase 15 — show Run Automation CTA whenever there is actionable data
    _showRunAutomationBtn(queued.length > 0 || unmatched.length > 0);

    // Show preview, hide dropzone + processing indicator
    iels.dropzone.hidden    = true;
    iels.colSelector.hidden = true;
    iels.preview.hidden     = false;
    iels.result.hidden      = true;

    // Reset processing indicator — restore label for next use (DB write phase)
    if (iels.processingLabel) iels.processingLabel.textContent = 'Processing…';
    iels.processing.hidden  = true;
  }


  /* ─── processIntakeFile — commit writes after confirmation ───── */
  async function processIntakeFile() {
    if (IntakeState.isProcessing) return;
    const { matched, unmatched, queued } = IntakeState.matchResult;

    const totalWrites = queued.length + unmatched.length;
    if (totalWrites === 0) {
      showToast('Nothing to process — no status changes required.', 'info');
      return;
    }

    const msg = `Process broker file?\n\n` +
      `• ${queued.length} account${queued.length !== 1 ? 's' : ''} → Ready to Compile\n` +
      `• ${unmatched.length} account${unmatched.length !== 1 ? 's' : ''} → Not Matched (guidance email prepared)`;

    const confirmed = await showConfirmModal(msg);
    if (!confirmed) return;

    IntakeState.isProcessing = true;
    iels.preview.hidden    = true;
    iels.processing.hidden = false;

    let successCount = 0;
    let failCount    = 0;
    let poolAddCount = 0;   // Phase 11B: added/updated in retry pool this run
    let archiveCount = 0;   // Phase 11B: expired and archived this run
    const errors     = [];

    // ── Move matched/queued → compile_ready ─────────────────────
    for (const req of queued) {
      if (WriteLock.has(req.id)) continue;
      WriteLock.add(req.id);
      setLabel(`Moving ${req.account} to compile queue…`);

      try {
        const currentCanonical = req.canonicalDb || normalizeDbStatus(req.dbStatus || req.status || '');
        // Determine which transition to use
        // pending → matched → compile_ready (two steps if still pending)
        // matched → compile_ready (one step)
        if (currentCanonical === 'pending') {
          // Step 1: pending → matched
          await DataLayer.updateStatus(req.id, 'matched', 'pending');
          // Step 2: matched → compile_ready
          await DataLayer.updateStatus(req.id, 'compile_ready', 'matched');
        } else if (currentCanonical === 'matched') {
          await DataLayer.updateStatus(req.id, 'compile_ready', 'matched');
        }
        // unmatched canonical treated as matched for compile_ready
        else if (currentCanonical === 'unmatched') {
          // Broker confirmed it — treat as matched, write matched first
          await DataLayer.updateStatus(req.id, 'matched', 'pending');
          await DataLayer.updateStatus(req.id, 'compile_ready', 'matched');
        }
        successCount++;
        // Phase 11B: account was matched — remove from retry pool if it was there
        RetryPool.remove(req.id);
      } catch (err) {
        failCount++;
        errors.push(`${req.account}: ${err.message}`);
        console.error('[Intake] queue write failed:', req.account, err);
      } finally {
        WriteLock.delete(req.id);
      }
    }

    // ── Phase 11B: Retry Pool — missed accounts enter 7-day window ──────────
    // Accounts NOT found in the broker file are NOT immediately written to DB
    // as 'unmatched'. Instead they are tracked in a localStorage retry pool
    // and re-checked on every future broker file upload. Only after
    // RETRY_POOL_MAX_DAYS (7) days without a match is the DB written and
    // the account archived, stopping further checks entirely.
    // Email + record are NEVER deleted — only re-checking stops.
    for (const req of unmatched) {
      if (WriteLock.has(req.id)) continue;
      WriteLock.add(req.id);

      try {
        const currentCanonical = req.canonicalDb || normalizeDbStatus(req.dbStatus || req.status || '');
        const poolEntry        = RetryPool.getById(req.id);
        const expired          = poolEntry && RetryPool.isExpired(poolEntry);

        if (expired) {
          // 7-day window has elapsed — write 'unmatched' to DB and archive from pool
          setLabel(`Archiving ${req.account} — ${RetryPool.getDaysWaiting(poolEntry)}-day window elapsed…`);
          if (currentCanonical === 'pending') {
            await writeUnmatched(req.id);
          }
          RetryPool.archive(req.id);
          archiveCount++;
          console.log(
            `[RetryPool] ${req.account} archived — ` +
            `${RetryPool.getDaysWaiting(poolEntry)} days, ` +
            `${poolEntry.retryCount} checks without a match.`
          );
        } else {
          // Within 7-day window — add/update in retry pool, keep DB status as pending
          setLabel(`Adding ${req.account} to 48h retry pool…`);
          const entry = RetryPool.upsert(req);
          poolAddCount++;
          console.log(
            `[RetryPool] ${req.account} → retry pool` +
            ` (check #${entry.retryCount}, ${RetryPool.getDaysWaiting(entry)}d elapsed of ${RETRY_POOL_MAX_DAYS}).`
          );
        }

        successCount++;
      } catch (err) {
        failCount++;
        errors.push(`${req.account}: ${err.message}`);
        console.error('[Intake] retry-pool operation failed:', req.account, err);
      } finally {
        WriteLock.delete(req.id);
      }
    }

    // ── Finish ──────────────────────────────────────────────────
    IntakeState.isProcessing = false;
    iels.processing.hidden   = true;

    // Phase 11B: log archived accounts to console for server-side email pickup.
    // Only accounts whose 7-day window expired this run trigger the guidance email.
    const archivedThisRun = unmatched.filter(r => {
      const e = RetryPool.getById(r.id);
      return e && e.archived;
    });
    if (archivedThisRun.length > 0) {
      console.group('[Intake] Match Not Found — trigger guidance email via server-side function:');
      archivedThisRun.forEach(r => console.log(r.email || r.name, '|', r.account));
      console.log('[Email body]:', buildUnmatchedEmail());
      console.groupEnd();
    }

    // Build result summary
    const parts = [];
    if (queued.length > 0)   parts.push(`${queued.length} account${queued.length !== 1 ? 's' : ''} moved to compile queue`);
    if (poolAddCount > 0)    parts.push(`${poolAddCount} added to 48h retry pool`);
    if (archiveCount > 0)    parts.push(`${archiveCount} archived as Match Not Found`);

    const sub = failCount > 0
      ? `${successCount} updated, ${failCount} failed. Check console for details.`
      : parts.join(' · ') || 'No status changes were required.';

    iels.resultTitle.textContent = failCount > 0
      ? 'Processing complete with errors'
      : 'File Processed Successfully';
    iels.resultSub.textContent = sub;
    iels.result.hidden = false;

    // Refresh dashboard data and pool pages
    showToast(
      failCount > 0
        ? `Processed with ${failCount} error${failCount > 1 ? 's' : ''} — check console.`
        : `Processed. ${queued.length} queued · ${poolAddCount} in retry pool · ${archiveCount} archived.`,
      failCount > 0 ? 'warn' : 'success',
      7000
    );
    await loadData();
    renderWaitingForMatch();    // Phase 11B — update pool pages after processing
    renderPendingRequests();    // Phase 11B
    refreshIntakeQueue();       // Phase 14B — refresh compilation queue after file processing

    function setLabel(txt) {
      if (iels.processingLabel) iels.processingLabel.textContent = txt;
    }
  }


  /* ─── writeUnmatched — direct RLS-gated write for unmatched ─── */
  /*
     ALLOWED_TRANSITIONS only covers forward compile pipeline.
     'unmatched' is a terminal admin decision — not a pipeline step.
     We write it directly, still guarded by:
       • Supabase anon key (RLS must allow update for the anon role)
       • WriteLock (no concurrent writes to the same row)
       • Only writes the 'status' field
       • Never deletes
  */
  async function writeUnmatched(id) {
    if (!DataLayer.isLive) return;
    if (!supabaseClient)   throw new Error('Supabase client not initialised.');

    const { data, error } = await supabaseClient
      .from(DB_SCHEMA.TABLE)
      .update({ status: 'unmatched' })
      .eq('id', id)
      .select('id, status');

    if (error) throw new Error(error.message || 'Supabase write failed');
    if (!data || data.length === 0) {
      throw new Error(`Write blocked by RLS or row not found (id: ${id})`);
    }
    return data[0];
  }


  /* ─── buildUnmatchedEmail — compose guidance email text ─────── */
  /*
     Returns a plain-text email body for the admin / server function to send.
     No SMTP credentials here — this is purely content composition.
     The server-side function (e.g., Supabase Edge Function or webhook)
     is responsible for actually delivering the email.
  */
  function buildUnmatchedEmail(recipientName) {
    recipientName = recipientName || 'there';
    return [
      `Hi ${recipientName},`,
      '',
      `We checked the latest broker report and were unable to find your trading account linked to our IB referral.`,
      `This means your EA bot cannot be activated yet.`,
      '',
      `Why this might have happened:`,
      `• You may have registered with the broker without using our referral link during sign-up.`,
      `• Your broker account may have been created before clicking our link.`,
      `• The app or browser may have interrupted the referral redirect mid-process.`,
      `• The broker report may not have updated yet — this can take 1–3 business days.`,
      '',
      `What to do next:`,
      `Contact us and we will help you recheck or relink your account.`,
      `There is no need to create a new broker account.`,
      '',
      `Please also check your Spam or Junk folder — automated emails sometimes land there.`,
      '',
      `Best regards,`,
      `ZTU Support Team`,
    ].join('\n');
  }


  /* ─── resetIntake — return to drop zone ─────────────────────── */
  function resetIntake() {
    IntakeState.file           = null;
    IntakeState.parsedRows     = [];
    IntakeState.columns        = [];
    IntakeState.accountCol     = null;
    IntakeState.brokerAccounts = [];
    IntakeState.matchResult    = null;
    IntakeState.isProcessing   = false;

    if (!iels.dropzone) return;
    if (iels.fileInput) iels.fileInput.value = '';

    iels.dropzone.hidden    = false;
    iels.colSelector.hidden = true;
    iels.preview.hidden     = true;
    iels.processing.hidden  = true;
    iels.result.hidden      = true;

    // Reset matched/unmatched lists
    if (iels.matchedBody)    iels.matchedBody.innerHTML    = '';
    if (iels.unmatchedBody)  iels.unmatchedBody.innerHTML  = '';
    if (iels.matchedList)    iels.matchedList.hidden    = true;
    if (iels.unmatchedList)  iels.unmatchedList.hidden  = true;
    if (iels.emailPreview)   iels.emailPreview.hidden   = true;

    // Phase 15 — hide automation elements
    _showRunAutomationBtn(false);
    const progEl    = document.getElementById('autoProgress');
    const overlayEl = document.getElementById('autoSummaryOverlay');
    if (progEl)    progEl.hidden    = true;
    if (overlayEl) overlayEl.hidden = true;
    // Reset progress steps to pending
    ['autoStep1','autoStep2','autoStep3','autoStep4','autoStep5'].forEach(id => {
      _autoSetStep(id, 'pending');
    });
    // Phase 15.3 — hide delivery breakdown
    const brkEl = document.getElementById('intakeDeliveryBreakdown');
    if (brkEl) brkEl.hidden = true;
  }

  /* ═══════════════════════════════════════════════════════════
     END PHASE 11
  ══════════════════════════════════════════════════════════ */


  /* ═══════════════════════════════════════════════════════════
     PHASE 11B — POOL SECTION RENDERERS
  ══════════════════════════════════════════════════════════ */

  /* ─── renderPendingRequests ──────────────────────────────────
     Populates #section-pending with requests that have DB
     status 'pending' (new_request dash-status) and are NOT
     yet in the active retry pool (those belong in Waiting
     for Match once they've been checked against a broker file).
  ──────────────────────────────────────────────────────────── */
  function renderPendingRequests() {
    const tableWrap = document.getElementById('pendingTable');
    const bodyEl    = document.getElementById('pendingTableBody');
    const countEl   = document.getElementById('pendingCount');
    const emptyEl   = document.getElementById('pendingEmpty');
    if (!bodyEl) return;   // section not in DOM

    // Exclude accounts already in the active retry pool —
    // those show under Waiting for Match instead.
    const activePoolIds = RetryPool.getActiveIds();
    const pending = State.requests.filter(
      r => r.status === 'new_request' && !activePoolIds.has(r.id)
    );

    /* ── Phase 14B: Matched-accounts info note ───────────────────────────
       After admin-upload-report.html processes a broker file, matched rows
       move to status='matched' in Supabase. They appear in the main Request
       Overview table but NOT here (Pending shows only new_request rows).
       Surface a visible note so the admin knows where to look.              */
    const _matchedRows = State.requests.filter(r => r.status === 'matched');
    const _noteId = 'pendingMatchedNote';
    let _noteEl = document.getElementById(_noteId);
    const _section = document.getElementById('section-pending');

    if (_matchedRows.length > 0) {
      if (!_noteEl && _section) {
        _noteEl = document.createElement('div');
        _noteEl.id = _noteId;
        _noteEl.className = 'pool-note pool-note--matched';
        const _intro = _section.querySelector('.section-intro');
        if (_intro) _intro.after(_noteEl);
        else _section.prepend(_noteEl);
      }
      if (_noteEl) {
        _noteEl.innerHTML =
          `<span class="pool-note-icon">✓</span>` +
          `<span class="pool-note-body">` +
            `<strong>${_matchedRows.length} matched account${_matchedRows.length !== 1 ? 's' : ''}</strong> ` +
            `confirmed via broker file — visible in the ` +
            `<strong>Request Overview</strong> table with a <em>Matched</em> badge. ` +
            `Use the <em>Queue Compile</em> action to advance them to the compile pipeline.` +
          `</span>`;
      }
    } else if (_noteEl) {
      _noteEl.remove();
    }

    /* ── Phase 14B verification logging ──────────────────────────────── */
    console.log(
      `[renderPendingRequests] ${pending.length} pending (not in pool) |`,
      `${_matchedRows.length} matched (main table) |`,
      `${activePoolIds.size} in active retry pool`
    );

    if (countEl) countEl.textContent = pending.length;

    if (pending.length === 0) {
      if (tableWrap) tableWrap.hidden = true;
      if (emptyEl)   emptyEl.hidden   = false;
      return;
    }

    if (tableWrap) tableWrap.hidden = false;
    if (emptyEl)   emptyEl.hidden   = true;

    /* Phase 16.4 Issue 3 — 6-column layout: Status badge in its own cell, Actions in their own cell */
    bodyEl.innerHTML = pending.map(r => `
      <div class="pool-row pool-row--pending6">
        <span class="pool-row-acct">${esc(r.account)}</span>
        <span class="pool-row-email">${esc(r.email || r.name)}</span>
        <span class="pool-row-broker">${esc(r.broker)}</span>
        <span class="pool-row-date">${esc(r.lastUpdate)}</span>
        <span class="pool-row-status">Waiting</span>
        <span class="pool-row-actions">
          <button class="row-act-btn row-act-btn--edit" data-row-edit="${esc(r.account)}" title="Edit Client" type="button">✎ Edit</button>
          <button class="row-act-btn row-act-btn--block" data-row-block="${esc(r.account)}" title="Block Client" type="button">⊘ Block</button>
        </span>
      </div>`
    ).join('');
    // Phase 16.2 — delegate Edit + Block on Pending Requests rows
    bodyEl.querySelectorAll('[data-row-edit]').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); _openEditClientModal(b.dataset.rowEdit); })
    );
    bodyEl.querySelectorAll('[data-row-block]').forEach(b =>
      b.addEventListener('click', async e => {
        e.stopPropagation();
        b.disabled = true;
        const acct = b.dataset.rowBlock;
        const req  = State.requests.find(r => normalizeAccountId(r.account) === normalizeAccountId(acct));
        const res = await _blockClient(acct, req || {}, 'Admin block from Pending Requests');
        if (res.ok) { showToast(`Client ${acct} blocked.`, 'success', 3000); renderPendingRequests(); }
        else { b.disabled = false; showToast('Block failed: ' + (res.error || 'unknown'), 'error', 4000); }
      })
    );
  }


  /* ─── renderWaitingForMatch ──────────────────────────────────
     Populates #section-waiting from RetryPool:

     Active pool  — accounts within the 7-day retry window,
                    re-checked on every broker file upload.
     Archived     — accounts that exceeded the window; DB written
                    as 'unmatched'. Displayed for CRM reference.
                    Email + record preserved, never deleted.

     Auto-cleanup: if a pool account's DB status has advanced
     past pending (matched, compile_ready, etc.) we remove it
     from the pool — it was matched successfully.
  ──────────────────────────────────────────────────────────── */
  /*
   * Phase 15.6 Task 1 — pool-row outbox status lookup.
   * Builds an in-memory snapshot of email_outbox + wa_outbox row statuses,
   * keyed by (recipient + template_type), so renderWaitingForMatch can
   * stamp each pool row with the actual send state.  Refreshed on every
   * navigation to the Waiting for Match page.
   */
  let _waitingStatusSnapshot = { email: {}, wa: {}, fetchedAt: 0 };

  function _statusKey(recipient, type, account) {
    return `${(recipient || '').toLowerCase()}|${type || ''}|${account || ''}`;
  }

  async function _fetchWaitingStatusSnapshot() {
    if (!supabaseClient) return { email: {}, wa: {}, fetchedAt: Date.now() };
    const email = {};
    const wa    = {};
    try {
      const [eRes, wRes] = await Promise.all([
        supabaseClient
          .from(OUTBOX.EMAIL_TABLE)
          .select('recipient_email, template_type, recipient_account, status, sent_at, error_message')
          .in('template_type', ['waiting', 'not_found'])
          .order('created_at', { ascending: false })
          .limit(500),
        supabaseClient
          .from(OUTBOX.WA_TABLE)
          .select('recipient_phone, template_type, recipient_account, status, sent_at, error_message')
          .in('template_type', ['waiting', 'not_found'])
          .order('created_at', { ascending: false })
          .limit(500),
      ]);
      if (!eRes.error && Array.isArray(eRes.data)) {
        eRes.data.forEach(r => {
          // Newest-first ordering means first write wins — most recent state.
          const k = _statusKey(r.recipient_email, r.template_type, r.recipient_account);
          if (!email[k]) email[k] = r;
        });
      }
      if (!wRes.error && Array.isArray(wRes.data)) {
        wRes.data.forEach(r => {
          const k = _statusKey(r.recipient_phone, r.template_type, r.recipient_account);
          if (!wa[k]) wa[k] = r;
        });
      }
    } catch (e) {
      console.warn('[waitingStatusSnapshot] fetch failed (continuing without):', e);
    }
    return { email, wa, fetchedAt: Date.now() };
  }

  function _statusPillHtml(row) {
    if (!row) {
      return '<span class="pool-status-pill pool-status-pill--none" title="No outbox row found">—</span>';
    }
    const s = String(row.status || 'pending').toLowerCase();
    const cls = ['sent','pending','sending','failed','skipped'].includes(s) ? s : 'pending';
    const label = s.charAt(0).toUpperCase() + s.slice(1);
    const tip = s === 'failed' && row.error_message
      ? `Failed: ${String(row.error_message).slice(0, 220)}`
      : s === 'sent' && row.sent_at
        ? `Sent ${new Date(row.sent_at).toLocaleString()}`
        : `Status: ${label}`;
    return `<span class="pool-status-pill pool-status-pill--${cls}" title="${esc(tip)}">${esc(label)}</span>`;
  }

  function renderWaitingForMatch() {
    const activeCardEl    = document.getElementById('waitingActiveCard');
    const activeBodyEl    = document.getElementById('waitingActiveBody');
    const activeCountEl   = document.getElementById('waitingActiveCount');
    const archivedCardEl  = document.getElementById('waitingArchivedCard');
    const archivedBodyEl  = document.getElementById('waitingArchivedBody');
    const archivedCountEl = document.getElementById('waitingArchivedCount');
    const emptyEl         = document.getElementById('waitingEmpty');
    if (!activeBodyEl) return;   // section not in DOM

    // Phase 15.6 Task 1 — kick off outbox snapshot fetch in parallel.
    // First render uses cached snapshot (or empty); when the fetch resolves
    // we re-render with the freshly populated status pills.  Non-blocking.
    const cacheAge = Date.now() - (_waitingStatusSnapshot.fetchedAt || 0);
    if (cacheAge > 5000) {
      _fetchWaitingStatusSnapshot().then(snap => {
        _waitingStatusSnapshot = snap;
        // Only re-render if the section is still active.
        const stillVisible = document.getElementById('section-waiting');
        if (stillVisible && stillVisible.classList.contains('active')) {
          renderWaitingForMatch();
        }
      });
    }

    // Auto-cleanup: if a pool account was matched/processed in DB, evict from pool
    RetryPool.getActive().forEach(entry => {
      const req = State.requests.find(r => r.id === entry.id);
      if (req && !['new_request', 'rejected', 'unmatched'].includes(req.status)) {
        RetryPool.remove(entry.id);
      }
    });

    const active   = RetryPool.getActive();
    const archived = RetryPool.getArchived();

    /* ── Phase 14B verification logging ──────────────────────────────── */
    console.log(
      `[renderWaitingForMatch] Active pool: ${active.length} | Archived: ${archived.length}`,
      active.length === 0 && archived.length === 0
        ? '— RetryPool is empty. Process a broker file via Broker File Intake to populate.'
        : ''
    );
    if (active.length > 0) {
      console.log('[renderWaitingForMatch] Active entries:',
        active.map(e => e.account + ' (check #' + e.retryCount + ', ' +
          Math.floor((Date.now() - e.firstMissedAt) / 86400000) + 'd elapsed)').join(', ')
      );
    }

    // Resolve outbox status for an entry given the row's template_type.
    // For Active pool entries, look up 'waiting'.  For Archived entries,
    // look up 'not_found' (the final rejection template).
    function _entryStatus(entry, templateType) {
      const req = State.requests.find(r => r.id === entry.id);
      const acct = entry.account || (req && req.account) || '';
      const wapNumber = req && req.whatsapp;
      const emailRow = _waitingStatusSnapshot.email[_statusKey(entry.email, templateType, acct)];
      const waRow    = wapNumber
        ? _waitingStatusSnapshot.wa[_statusKey(wapNumber, templateType, acct)]
        : null;
      return { emailRow, waRow, hasWa: !!wapNumber };
    }

    // ── SECTION A — Active retry pool (within 48h window).  Phase 16.7 Issue 1 + 5 ──
    if (activeCountEl) activeCountEl.textContent = active.length;
    if (active.length > 0) {
      activeBodyEl.innerHTML = active.map(entry => {
        // Phase 16.7 Issue 1 — live countdown instead of `${days}d`.
        const countdown = RetryPool.formatCountdown(entry);
        const ms        = RetryPool.getMsRemaining(entry);
        const cdCls     = ms <= 0                  ? 'pool-row-countdown--expired'
                        : ms <  4  * 60 * 60 * 1000 ? 'pool-row-countdown--critical'
                        : ms < 24  * 60 * 60 * 1000 ? 'pool-row-countdown--warn'
                                                    : 'pool-row-countdown--ok';
        const checked = entry.lastChecked
          ? new Date(entry.lastChecked).toLocaleString([], {
              month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })
          : '—';
        // Phase 15.6 Task 1 — outbox status pills (waiting template)
        const st = _entryStatus(entry, 'waiting');
        const emailPill = _statusPillHtml(st.emailRow);
        const waPill    = st.hasWa
          ? _statusPillHtml(st.waRow)
          : '<span class="pool-status-pill pool-status-pill--none" title="No WhatsApp on file">N/A</span>';
        // Phase 16.7 Issue 5 — Recovered Match badge (shown when an
        // archived row was just auto-recovered into the active list).
        const recoveredBadge = entry.recoveredAt
          ? `<span class="pool-row-recovered-badge" title="Auto-recovered from Not Found pool">RECOVERED MATCH</span><span class="pool-row-recovered-time">${esc(fmtDateTime(new Date(entry.recoveredAt).toISOString()))}</span>`
          : '';
        return `<div class="pool-row pool-row--10">
          <span class="pool-row-acct">${esc(entry.account)}${recoveredBadge}</span>
          <span class="pool-row-email">${esc(entry.email)}</span>
          <span class="pool-row-broker">${esc(entry.broker)}</span>
          <span class="pool-row-date">${esc(entry.requestDate)}</span>
          <span class="pool-row-countdown ${cdCls}" data-retry-countdown="${entry.id}" data-first-missed="${entry.firstMissedAt}">${countdown}</span>
          <span class="pool-row-retries">Checked ${entry.retryCount}&times;</span>
          <span class="pool-row-checked">${checked}</span>
          <span class="pool-row-status">${emailPill}</span>
          <span class="pool-row-status">${waPill}</span>
          <span class="pool-row-actions"><button class="iq-btn iq-btn--info" data-waiting-info="${entry.id}" data-waiting-acct="${esc(entry.account)}" type="button" title="Show full diagnostics for this row">ⓘ</button></span>
        </div>`;
      }).join('');
      if (activeCardEl) activeCardEl.hidden = false;
    } else {
      if (activeCardEl) activeCardEl.hidden = true;
    }

    // ── SECTION B — Not Found After 48 Hours.  Phase 16.7 Issue 1 + 2 + 3 ──
    if (archivedCountEl) archivedCountEl.textContent = archived.length;
    if (archived.length > 0) {
      archivedBodyEl.innerHTML = archived.map(entry => {
        // Archive date: use stored archivedAt, or estimate from firstMissedAt + 48h.
        const archiveMs = entry.archivedAt
          || (entry.firstMissedAt ? entry.firstMissedAt + RETRY_POOL_MAX_DAYS * RETRY_POOL_DAY_MS : null);
        const archivedStr = archiveMs
          ? new Date(archiveMs).toLocaleString([], {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          : '—';

        // Phase 15.6 Task 1 — outbox status pills (not_found template)
        const st = _entryStatus(entry, 'not_found');
        const emailPill = _statusPillHtml(st.emailRow);
        const waPill    = st.hasWa
          ? _statusPillHtml(st.waRow)
          : '<span class="pool-status-pill pool-status-pill--none" title="No WhatsApp on file">N/A</span>';

        return `<div class="pool-row pool-row--10 pool-row--archived">
          <span class="pool-row-acct">${esc(entry.account)}</span>
          <span class="pool-row-email">${esc(entry.email)}</span>
          <span class="pool-row-broker">${esc(entry.broker)}</span>
          <span class="pool-row-date">${esc(entry.requestDate)}</span>
          <span class="pool-row-countdown pool-row-countdown--expired">48h retry ended</span>
          <span class="pool-row-retries">${entry.retryCount} checks</span>
          <span class="pool-row-checked pool-row-checked--archived">${archivedStr}</span>
          <span class="pool-row-status">${emailPill}</span>
          <span class="pool-row-status">${waPill}</span>
          <span class="pool-row-actions"><button class="iq-btn iq-btn--info" data-waiting-info="${entry.id}" data-waiting-acct="${esc(entry.account)}" type="button" title="Show full diagnostics for this row">ⓘ</button></span>
        </div>`;
      }).join('');
      if (archivedCardEl) archivedCardEl.hidden = false;
    } else {
      if (archivedCardEl) archivedCardEl.hidden = true;
    }

    // Phase 16.7 Issue 3 — wire the ⓘ buttons in BOTH sections to the diagnostic modal.
    [activeBodyEl, archivedBodyEl].forEach(body => {
      if (!body) return;
      body.querySelectorAll('[data-waiting-info]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.getAttribute('data-waiting-info');
          const acct = btn.getAttribute('data-waiting-acct');
          if (typeof _openIqInfoModal === 'function') {
            _openIqInfoModal(id, acct);
          }
        });
      });
    });

    // ── Empty state ────────────────────────────────────────────
    if (emptyEl) emptyEl.hidden = (active.length + archived.length) > 0;
  }

  /* Phase 16.7 Issue 1 — live countdown ticker.
   * Updates every 60 seconds in place (no full re-render so the admin
   * doesn't lose scroll position).  When any row crosses the 48h boundary
   * it flips the class to --expired and triggers a full render so the row
   * physically moves from Section A to Section B. */
  let _waitingCountdownInterval = null;
  function _startWaitingCountdownTicker() {
    if (_waitingCountdownInterval) return;
    _waitingCountdownInterval = setInterval(() => {
      const nodes = document.querySelectorAll('[data-retry-countdown]');
      if (nodes.length === 0) return;
      let needsFullRerender = false;
      nodes.forEach(node => {
        const firstMissed = parseInt(node.getAttribute('data-first-missed'), 10);
        if (!isFinite(firstMissed) || firstMissed <= 0) return;
        const ms = (firstMissed + RETRY_POOL_MAX_DAYS * RETRY_POOL_DAY_MS) - Date.now();
        if (ms <= 0) { needsFullRerender = true; return; }
        const totalMin = Math.floor(ms / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        let label;
        if (h <= 0) label = m + 'm left';
        else {
          const hStr = (h < 10 ? '0' + h : String(h));
          const mStr = (m < 10 ? '0' + m : String(m));
          label = hStr + 'h ' + mStr + 'm left';
        }
        node.textContent = label;
        node.classList.remove('pool-row-countdown--ok','pool-row-countdown--warn','pool-row-countdown--critical','pool-row-countdown--expired');
        node.classList.add(
          ms <  4  * 60 * 60 * 1000 ? 'pool-row-countdown--critical'
          : ms < 24  * 60 * 60 * 1000 ? 'pool-row-countdown--warn'
                                       : 'pool-row-countdown--ok'
        );
      });
      if (needsFullRerender) {
        try {
          // Auto-archive expired entries then re-render so the row moves
          // from Section A → Section B without admin intervention.
          autoArchiveExpiredPool().then(() => renderWaitingForMatch());
        } catch (_) { renderWaitingForMatch(); }
      }
    }, 60 * 1000);
    // Fire one immediate update so the first minute isn't stale.
    setTimeout(() => {
      const evt = new Event('retry-tick'); document.dispatchEvent(evt);
    }, 200);
  }


  /* ─── autoArchiveExpiredPool — Phase 12 ────────────────────────
     Called fire-and-forget on every loadData() cycle.

     Scans the RetryPool for entries that have exceeded
     RETRY_POOL_MAX_DAYS (7) days WITHOUT a match but have not yet
     been explicitly archived (i.e. no broker file has been
     processed during or after the expiry window).

     For each expired-but-unarchived entry:
       • writes 'unmatched' to Supabase (live mode only; no-op in mock)
       • stamps archivedAt on the pool entry
       • calls RetryPool.archive() to stop future re-checks

     Uses WriteLock to prevent conflicts with concurrent writes
     (e.g. the user simultaneously processing a broker file).

     Triggers its own re-render when any entries are archived.
  ──────────────────────────────────────────────────────────────── */
  async function autoArchiveExpiredPool() {
    const allEntries = RetryPool.getAll();
    const activeEntries = allEntries.filter(e => !e.archived);
    const toArchive  = activeEntries.filter(e => RetryPool.isExpired(e));

    // Phase 16 follow-up #2 — explicit gate diagnostics so the user can
    // see exactly which condition is preventing writes.
    console.log(
      '[RetryPool] sweep — total entries: %d | active: %d | expired-and-not-archived: %d | window: %d days',
      allEntries.length, activeEntries.length, toArchive.length, RETRY_POOL_MAX_DAYS
    );
    if (toArchive.length === 0) {
      if (allEntries.length === 0) {
        console.log('[RetryPool] Gate A closed — pool is empty. Process a broker file with unmatched accounts via Broker File Intake to populate.');
      } else if (activeEntries.length === 0) {
        console.log('[RetryPool] Gate A closed — every entry is already archived. Nothing more to process.');
      } else {
        const youngest = Math.min(...activeEntries.map(e => RetryPool.getDaysWaiting(e)));
        const oldest   = Math.max(...activeEntries.map(e => RetryPool.getDaysWaiting(e)));
        console.log(
          `[RetryPool] Gate B closed — ${activeEntries.length} active entry(ies) but none yet ${RETRY_POOL_MAX_DAYS}+ days old. Range: ${youngest}d–${oldest}d. Wait or use window.__ZTU_DEBUG_forceArchive(account).`
        );
      }
      return;
    }

    console.group(`[RetryPool] Auto-archiving ${toArchive.length} expired entry/entries…`);

    let count = 0;
    const notFoundEmailItems = [];

    for (const entry of toArchive) {
      if (WriteLock.has(entry.id)) {
        console.log(`[RetryPool] ${entry.account} — skipped (WriteLock active).`);
        continue;
      }
      WriteLock.add(entry.id);
      try {
        const req              = State.requests.find(r => r.id === entry.id);
        const currentCanonical = req
          ? (req.canonicalDb || normalizeDbStatus(req.dbStatus || req.status || ''))
          : 'pending';

        let dbWritten = false;
        if (currentCanonical === 'pending') {
          try {
            const writeResult = await writeUnmatched(entry.id);
            dbWritten = !!writeResult;
            console.log(`[RetryPool] writeUnmatched OK — license_requests.id=${entry.id} → 'unmatched'`);
          } catch (writeErr) {
            console.warn(`[RetryPool] writeUnmatched FAILED for ${entry.account} (id=${entry.id}): ${writeErr.message}. Pool entry will still archive locally, but no email will be queued.`);
          }
        } else {
          console.log(`[RetryPool] ${entry.account}: license_requests status is already '${currentCanonical}' (past pending). Skipping writeUnmatched + skipping not_found email — account was matched, no need to send rejection.`);
        }

        RetryPool.archive(entry.id);
        count++;
        console.log(
          `[RetryPool] Auto-archived ${entry.account}` +
          ` — ${RetryPool.getDaysWaiting(entry)}d elapsed, ${entry.retryCount} check(s) run.`
        );

        // Phase 16 follow-up #2 BUG FIX — only queue the not_found final
        // email when writeUnmatched actually succeeded (i.e. the account
        // really is now 'unmatched' in DB).  Previously this fired for
        // every archived entry regardless of canonical status, which would
        // send rejection emails to already-matched customers.
        if (dbWritten) {
          const name = (req && (req.name || req.email)) || entry.email || 'there';
          const tmpl = AUTO_MSG.not_found;
          if (entry.email && tmpl) {
            notFoundEmailItems.push({
              id:         _autoId(),
              type:       'not_found',
              account:    entry.account,
              email:      entry.email,
              subject:    tmpl.subject,
              body:       tmpl.body(name),
              request_id: entry.id || null,
              status:     'queued',
              queued_at:  new Date().toISOString(),
            });
            console.log(`[RetryPool] queued not_found email for ${entry.account} → ${entry.email}`);
          } else if (!entry.email) {
            console.warn(`[RetryPool] ${entry.account}: writeUnmatched succeeded but pool entry has no email — cannot queue not_found message.`);
          }
        }
      } catch (err) {
        console.warn(`[RetryPool] Auto-archive failed for ${entry.account}:`, err.message);
      } finally {
        WriteLock.delete(entry.id);
      }
    }

    // Push the queued not_found emails to Supabase email_outbox. The
    // _insertEmailOutbox dedup guard (Phase 15.5C) prevents duplicate
    // sends if this account already has a pending not_found row.
    if (notFoundEmailItems.length > 0) {
      try {
        const res = await _insertEmailOutbox(notFoundEmailItems);
        const ok  = res.inserted ? res.inserted.length : 0;
        console.log(`[RetryPool] Queued ${ok} 'not_found' final email(s) into email_outbox.`);
      } catch (e) {
        console.warn('[RetryPool] not_found email enqueue failed (non-fatal):', e);
      }
    }

    console.groupEnd();

    if (count > 0) {
      // Re-render pool pages to reflect the newly archived entries
      renderWaitingForMatch();
      renderPendingRequests();
    }
  }


  /* ─── _sweepStalePendingViaSupabase — Phase 16 follow-up #3 ──
   *
   * Removes the RetryPool localStorage dependency.  Queries Supabase
   * directly for pending license_requests older than the configured
   * 48 h window, cross-references against broker_accounts, and for
   * any account that is BOTH (older than 48h pending) AND (not in
   * the latest broker file): flips license_requests.status to
   * 'unmatched' + INSERTs a 'not_found' row into email_outbox.
   *
   * This guarantees the not_found pipeline fires regardless of
   * whether the admin ever clicked Run Automation or whether the
   * RetryPool localStorage has data.
   *
   * Runs on dashboard init AND every hour via setInterval.
   * Idempotent — the email_outbox dedup guard (Phase 15.5C)
   * prevents duplicate sends per (recipient, template_type, account).
   */
  /* ─── _autoMatchPendingViaBroker — Phase 16.4 Issue 1 ────────
   *
   * As soon as a new license_request is submitted, this checks it
   * against the LATEST broker_accounts persisted in Supabase.  If
   * the account exists in broker_accounts, the request is flipped
   * from 'pending' → 'matched' immediately — no need to wait for
   * the 15-min engine tick OR for the admin to re-upload the broker
   * file.  The engine's STEP 2.5 still runs on its own schedule;
   * this is purely an additive accelerator for the dashboard side.
   *
   * Returns: { scanned, matchedNow, errors }
   */
  async function _autoMatchPendingViaBroker() {
    if (!supabaseClient || !DataLayer.isLive) {
      return { scanned: 0, matchedNow: 0, errors: 0, skipped: 'not-live' };
    }
    let scanned = 0, matchedNow = 0, errors = 0;
    try {
      // 1) Pull all currently-pending license_requests
      const { data: pendingRows, error: pendErr } = await supabaseClient
        .from('license_requests')
        .select('id, account_number, status, created_at')
        .eq('status', 'pending');
      if (pendErr) {
        console.warn('[AutoMatch] pending fetch error:', pendErr);
        return { scanned: 0, matchedNow: 0, errors: 1 };
      }
      if (!pendingRows || pendingRows.length === 0) {
        return { scanned: 0, matchedNow: 0, errors: 0 };
      }
      scanned = pendingRows.length;
      const acctList = pendingRows
        .map(r => String(r.account_number || '').trim())
        .filter(Boolean);
      if (!acctList.length) return { scanned, matchedNow: 0, errors: 0 };

      // 2) Look those accounts up in broker_accounts
      //    Phase 18 CRITICAL FIX — column is `account_number` in the Supabase
      //    table (the broker file's raw 'client_account' header is normalised
      //    to `account_number` at upsert time by _persistBrokerAccounts).
      //    The pre-fix query used 'client_account' and never matched anything,
      //    so every license_request went to the engine's 15-min tick instead
      //    of being auto-matched by the dashboard.
      const { data: brokerHits, error: brokErr } = await supabaseClient
        .from('broker_accounts')
        .select('account_number')
        .in('account_number', acctList);
      if (brokErr) {
        console.warn('[AutoMatch] broker_accounts fetch error:', brokErr);
        return { scanned, matchedNow: 0, errors: 1 };
      }
      const hitSet = new Set(
        (brokerHits || []).map(b => String(b.account_number || '').trim())
      );
      if (hitSet.size === 0) {
        return { scanned, matchedNow: 0, errors: 0 };
      }

      // Phase 16.5 PART C — pull IB Changed set so we never auto-match an
      // account that was flagged as no-longer-under-ZTU-referral.
      let ibChangedSet = new Set();
      try {
        await _ensureIbChangedSet();
        if (_ibChangedSet && typeof _ibChangedSet.forEach === 'function') {
          ibChangedSet = _ibChangedSet;
        }
      } catch (_) {}

      // 3) Flip status for each pending row that exists in broker_accounts
      //    AND is not flagged as IB Changed.
      const nowIso = new Date().toISOString();
      let ibBlocked = 0;
      let recovered = 0;
      for (const row of pendingRows) {
        const acct  = String(row.account_number || '').trim();
        const acctN = (typeof normalizeAccountId === 'function') ? normalizeAccountId(acct) : acct;
        if (!hitSet.has(acct)) continue;
        if (ibChangedSet.has && ibChangedSet.has(acctN)) {
          ibBlocked++;
          console.log('[AutoMatch] IB-CHANGED skip: ' + acct + ' is on ib_changed_accounts — not auto-matching.');
          continue;
        }
        // Phase 16.7 Issue 4 — if this pending row also has a RetryPool
        // entry (archived or active), mark it as recovered so the
        // Waiting for Match page can flash the "Recovered Match" badge.
        try {
          const poolEntry = RetryPool.getById(row.id);
          if (poolEntry && (poolEntry.archived || poolEntry.recoveredAt == null)) {
            RetryPool.recover(row.id);
            recovered++;
            console.log('[AutoMatch] RECOVERED: ' + acct + ' was in not-found pool; un-archived + matched.');
          }
        } catch (e) { console.warn('[AutoMatch] recover hook failed:', e); }
        try {
          const { error: updErr } = await supabaseClient
            .from('license_requests')
            .update({ status: 'matched', updated_at: nowIso })
            .eq('id', row.id);
          if (updErr) {
            errors++;
            console.warn('[AutoMatch] update error for id=' + row.id + ':', updErr);
          } else {
            matchedNow++;
          }
        } catch (e) {
          errors++;
          console.warn('[AutoMatch] update exception for id=' + row.id + ':', e);
        }
      }
      if (matchedNow > 0) {
        console.log('[AutoMatch] flipped ' + matchedNow + ' of ' + scanned + ' pending → matched (broker_accounts hit).');
      }
      if (ibBlocked > 0) {
        console.warn('[AutoMatch] ' + ibBlocked + ' pending request(s) NOT auto-matched — flagged IB Changed.');
      }
      if (recovered > 0) {
        console.log('[AutoMatch] ' + recovered + ' archived not-found row(s) auto-recovered.');
        try {
          if (typeof renderWaitingForMatch === 'function') renderWaitingForMatch();
          if (typeof showToast === 'function') showToast(recovered + ' Not Found account(s) auto-recovered into the matched pipeline.', 'success', 5000);
        } catch (_) {}
      }
    } catch (e) {
      errors++;
      console.warn('[AutoMatch] outer exception:', e);
    }
    return { scanned, matchedNow, errors };
  }

  async function _sweepStalePendingViaSupabase() {
    if (!supabaseClient || !DataLayer.isLive) {
      console.log('[NotFoundSweep] Supabase not live — skipping sweep.');
      return { staleFound: 0, marked: 0, emailed: 0 };
    }

    // Step 1 — fetch pending license_requests older than the 48h window
    const cutoffMs  = Date.now() - RETRY_POOL_MAX_DAYS * RETRY_POOL_DAY_MS;
    const cutoffIso = new Date(cutoffMs).toISOString();

    let staleRows = [];
    try {
      const { data, error } = await supabaseClient
        .from(DB_SCHEMA.TABLE)
        .select(DB_SCHEMA.SELECT)
        .eq('status', 'pending')
        .lt('created_at', cutoffIso)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) {
        console.warn('[NotFoundSweep] license_requests stale-pending fetch failed:', error.message);
        return { staleFound: 0, marked: 0, emailed: 0 };
      }
      staleRows = data || [];
    } catch (e) {
      console.warn('[NotFoundSweep] license_requests fetch exception:', e);
      return { staleFound: 0, marked: 0, emailed: 0 };
    }

    console.log(`[NotFoundSweep] stale-pending scan — found ${staleRows.length} pending license_request(s) older than ${RETRY_POOL_MAX_DAYS}-day window.`);
    if (staleRows.length === 0) return { staleFound: 0, marked: 0, emailed: 0 };

    // Step 2 — fetch broker_accounts so we can exclude any account that
    // IS still in the latest broker file (those remain match-candidates).
    let brokerSet = new Set();
    try {
      const { data, error } = await supabaseClient
        .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
        .select('account_number')
        .limit(20000);
      if (!error && Array.isArray(data)) {
        brokerSet = new Set(data.map(r => normalizeAccountId(r.account_number)));
      } else if (error) {
        console.warn('[NotFoundSweep] broker_accounts fetch warning:', error.message);
      }
    } catch (e) {
      console.warn('[NotFoundSweep] broker_accounts fetch exception:', e);
    }
    console.log(`[NotFoundSweep] broker_accounts known: ${brokerSet.size} account(s).`);

    // Step 3 — for each stale pending account NOT in broker_accounts:
    //   (a) flip license_requests.status='unmatched' via writeUnmatched
    //   (b) build a not_found email_outbox payload
    const emailItems = [];
    let marked = 0;

    for (const row of staleRows) {
      const acct = normalizeAccountId(row.account_number);
      if (!acct) continue;
      // If account is still in broker_accounts, do NOT mark unmatched —
      // the Phase 16 STEP 2.5 in master_engine.ps1 will auto-match it
      // on its next 15-min tick.  Leave it for the engine to handle.
      if (brokerSet.has(acct)) continue;

      try {
        await writeUnmatched(row.id);
        marked++;
        console.log(`[NotFoundSweep] license_requests.id=${row.id} account=${acct} → 'unmatched' (older than ${RETRY_POOL_MAX_DAYS}d, not in broker_accounts)`);
      } catch (writeErr) {
        console.warn(`[NotFoundSweep] writeUnmatched failed for id=${row.id}: ${writeErr.message}. Skipping email.`);
        continue;
      }

      if (row.email && AUTO_MSG.not_found) {
        const name = row.email || 'there';
        emailItems.push({
          id:         _autoId(),
          type:       'not_found',
          account:    acct,
          email:      row.email,
          subject:    AUTO_MSG.not_found.subject,
          body:       AUTO_MSG.not_found.body(name),
          request_id: row.id,
          status:     'queued',
          queued_at:  new Date().toISOString(),
        });
      }
    }

    // Step 4 — push the not_found emails to email_outbox
    let emailedCount = 0;
    if (emailItems.length > 0) {
      try {
        const res = await _insertEmailOutbox(emailItems);
        emailedCount = res.inserted ? res.inserted.length : 0;
        console.log(`[NotFoundSweep] email_outbox: inserted ${emailedCount} not_found row(s).`);
      } catch (e) {
        console.warn('[NotFoundSweep] email_outbox insert failed:', e);
      }
    }

    if (marked > 0) {
      // Refresh dashboard so the Delivered / Waiting / Matched pages
      // reflect the new 'unmatched' status.
      try { await loadData(); } catch (e) {}
    }

    console.log(`[NotFoundSweep] summary — stale found: ${staleRows.length}, marked unmatched: ${marked}, emailed: ${emailedCount}`);
    return { staleFound: staleRows.length, marked, emailed: emailedCount };
  }


  /* ═══════════════════════════════════════════════════════════
     PHASE 13 — CRM INTELLIGENCE RENDERERS
  ══════════════════════════════════════════════════════════ */

  /* ─── Formatting helpers ─────────────────────────────────── */
  function fmtMoney(n) {
    if (!n || isNaN(n)) return '$0.00';
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function fmtLots(n) {
    if (!n || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /* ─── Phase 13.5 — Contact cell: email + optional WhatsApp link ─ */
  function fmtContact(r) {
    const emailHtml = `<span class="crm-contact-email">${esc(r.email || '—')}</span>`;
    if (!r.whatsapp) return emailHtml;
    return emailHtml + buildWaLink(r.whatsapp);
  }


  /* ─── Empty state — shown when no broker file has been imported ─ */
  function buildCrmNoData() {
    return `<div class="crm-empty">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" width="40" height="40" opacity="0.25">
        <circle cx="24" cy="18" r="9"/>
        <path d="M6 42c0-9.9 8.1-18 18-18s18 8.1 18 18"/>
      </svg>
      <p class="crm-empty-title">No CRM Data Yet</p>
      <p class="crm-empty-sub">Upload a broker export file in <strong>Broker File Intake</strong> to populate the CRM with client data.</p>
    </div>`;
  }


  /* ─── Active Clients ─────────────────────────────────────── */
  function renderCrmActive(filter) {
    const wrap = document.getElementById('crmActiveWrap');
    if (!wrap) return;
    filter = filter || 'all';

    if (CrmStore.isEmpty()) { wrap.innerHTML = buildCrmNoData(); return; }

    let rows = CrmStore.getActive();
    if (filter !== 'all') {
      rows = rows.filter(r => {
        const d = CrmStore.daysSince(r.lastTrade);
        if (d === null) return false;
        if (filter === '7d')   return d <= 7;
        if (filter === '30d')  return d >= 8  && d <= 30;
        if (filter === '60d')  return d >= 31 && d <= 60;
        if (filter === '90d')  return d >= 61 && d <= 90;
        if (filter === '180d') return d >= 91 && d <= 180;
        if (filter === 'old')  return d > 180;
        return true;
      });
    }

    const allActive  = CrmStore.getActive();
    const totalComm  = rows.reduce((s, r) => s + (r.reward || 0), 0);
    const avgComm    = rows.length > 0 ? totalComm / rows.length : 0;
    const totalLots  = rows.reduce((s, r) => s + (r.volumeLots || 0), 0);
    const imp        = CrmStore.getImportDate();
    const impStr     = imp ? imp.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

    const TABS = { all:'All Active', '7d':'≤ 7d', '30d':'8–30d', '60d':'31–60d',
                   '90d':'61–90d', '180d':'91–180d', old:'180d+' };

    rows.sort((a, b) => (CrmStore.daysSince(a.lastTrade) || 9999) - (CrmStore.daysSince(b.lastTrade) || 9999));

    wrap.innerHTML = `
      <div class="crm-stats-bar">
        <div class="crm-stat-pill crm-stat-pill--green">
          <span class="crm-stat-val">${allActive.length}</span>
          <span class="crm-stat-lbl">Total Active</span>
        </div>
        <div class="crm-stat-pill crm-stat-pill--blue">
          <span class="crm-stat-val">${fmtMoney(allActive.reduce((s,r)=>s+(r.reward||0),0))}</span>
          <span class="crm-stat-lbl">All Active Commission</span>
        </div>
        <div class="crm-stat-pill">
          <span class="crm-stat-val">${fmtMoney(avgComm)}</span>
          <span class="crm-stat-lbl">Avg (this filter)</span>
        </div>
        <div class="crm-stat-pill">
          <span class="crm-stat-val">${fmtLots(totalLots)}</span>
          <span class="crm-stat-lbl">Lots (this filter)</span>
        </div>
        <div class="crm-stat-pill crm-stat-pill--muted">
          <span class="crm-stat-val">${impStr}</span>
          <span class="crm-stat-lbl">Last Import</span>
        </div>
      </div>
      <div class="crm-filter-bar" data-crm-section="crm-active">
        ${Object.entries(TABS).map(([f, lbl]) =>
          `<button class="crm-tab${filter===f?' crm-tab--active':''}" data-filter="${f}">${lbl}</button>`
        ).join('')}
      </div>
      <div class="crm-table-card">
        <div class="crm-col-labels crm-col-labels--active">
          <span>Account</span><span>Email</span><span>Country</span><span>Type</span>
          <span>Platform</span><span>Last Trade</span><span>Days Ago</span>
          <span>Commission</span><span>Volume (lots)</span><span>Actions</span>
        </div>
        <div class="crm-table-body">
          ${rows.length === 0
            ? `<div class="crm-no-results">No clients match this filter.</div>`
            : rows.map(orig => {
                const r = _applyOverride(orig); // Phase 16.2 — apply client_overrides
                const d   = CrmStore.daysSince(r.lastTrade);
                const cls = d === null ? '' : d <= 7 ? 'crm-days--fresh' : d <= 30 ? '' : d <= 90 ? 'crm-days--stale' : 'crm-days--old';
                const isBlocked = _blockedSet && _blockedSet.has(normalizeAccountId(r.account));
                const blkBtn = isBlocked
                  ? `<button class="row-act-btn row-act-btn--edit" data-row-unblock="${esc(r.account)}" title="Unblock" type="button" style="color:#4ade80;border-color:rgba(34,197,94,0.45)">↺ Unblk</button>`
                  : `<button class="row-act-btn row-act-btn--block" data-row-block="${esc(r.account)}" title="Block" type="button">⊘ Block</button>`;
                return `<div class="crm-row crm-row--active">
                  <span class="crm-cell-acct">${esc(r.account)}</span>
                  <span class="crm-cell-email">${fmtContact(r)}</span>
                  <span class="crm-cell-cc">${esc(r.country||'—')}</span>
                  <span class="crm-cell-type">${esc(r.accountType||'—')}</span>
                  <span class="crm-cell-plat">${esc(r.platform||'—')}</span>
                  <span class="crm-cell-date">${esc(r.lastTrade||'—')}</span>
                  <span class="crm-cell-days ${cls}">${d!==null?d+'d':'—'}</span>
                  <span class="crm-cell-money">${fmtMoney(r.reward)}</span>
                  <span class="crm-cell-lots">${fmtLots(r.volumeLots)}</span>
                  <span class="crm-cell-actions">
                    <button class="row-act-btn row-act-btn--edit" data-row-edit="${esc(r.account)}" title="Edit" type="button">✎</button>
                    ${blkBtn}
                  </span>
                </div>`;
              }).join('')
          }
        </div>
      </div>`;
  }


  /* ─── Inactive Clients ───────────────────────────────────── */
  function renderCrmInactive(filter) {
    const wrap = document.getElementById('crmInactiveWrap');
    if (!wrap) return;
    filter = filter || 'all';

    if (CrmStore.isEmpty()) { wrap.innerHTML = buildCrmNoData(); return; }

    const allInactive = CrmStore.getInactive();
    let rows = allInactive;

    if (filter !== 'all') {
      rows = rows.filter(r => {
        if (filter === 'never') return !r.lastTrade;
        const d = CrmStore.daysSince(r.createdAt);
        if (filter === '30d')  return d !== null && d >= 30;
        if (filter === '90d')  return d !== null && d >= 90;
        if (filter === '180d') return d !== null && d >= 180;
        return true;
      });
    }

    const neverCount = allInactive.filter(r => !r.lastTrade).length;
    const imp        = CrmStore.getImportDate();
    const impStr     = imp ? imp.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

    const TABS = { all:'All Inactive', never:'Never Traded', '30d':'Joined 30d+', '90d':'Joined 90d+', '180d':'Joined 180d+' };

    wrap.innerHTML = `
      <div class="crm-stats-bar">
        <div class="crm-stat-pill crm-stat-pill--amber">
          <span class="crm-stat-val">${allInactive.length}</span>
          <span class="crm-stat-lbl">Total Inactive</span>
        </div>
        <div class="crm-stat-pill crm-stat-pill--muted">
          <span class="crm-stat-val">${neverCount}</span>
          <span class="crm-stat-lbl">Never Traded</span>
        </div>
        <div class="crm-stat-pill crm-stat-pill--muted">
          <span class="crm-stat-val">${impStr}</span>
          <span class="crm-stat-lbl">Last Import</span>
        </div>
      </div>
      <div class="crm-filter-bar" data-crm-section="crm-inactive">
        ${Object.entries(TABS).map(([f, lbl]) =>
          `<button class="crm-tab${filter===f?' crm-tab--active':''}" data-filter="${f}">${lbl}</button>`
        ).join('')}
      </div>
      <div class="crm-table-card">
        <div class="crm-col-labels crm-col-labels--inactive">
          <span>Account</span><span>Email</span><span>Country</span><span>Type</span>
          <span>Platform</span><span>Joined</span><span>Last Trade</span><span>Commission</span><span>Actions</span>
        </div>
        <div class="crm-table-body">
          ${rows.length === 0
            ? `<div class="crm-no-results">No clients match this filter.</div>`
            : rows.map(orig => {
                const r = _applyOverride(orig); // Phase 16.2 — apply client_overrides
                const isBlocked = _blockedSet && _blockedSet.has(normalizeAccountId(r.account));
                const blkBtn = isBlocked
                  ? `<button class="row-act-btn row-act-btn--edit" data-row-unblock="${esc(r.account)}" type="button" style="color:#4ade80;border-color:rgba(34,197,94,0.45)">↺ Unblk</button>`
                  : `<button class="row-act-btn row-act-btn--block" data-row-block="${esc(r.account)}" type="button">⊘ Block</button>`;
                return `<div class="crm-row crm-row--inactive">
                  <span class="crm-cell-acct">${esc(r.account)}</span>
                  <span class="crm-cell-email">${fmtContact(r)}</span>
                  <span class="crm-cell-cc">${esc(r.country||'—')}</span>
                  <span class="crm-cell-type">${esc(r.accountType||'—')}</span>
                  <span class="crm-cell-plat">${esc(r.platform||'—')}</span>
                  <span class="crm-cell-date">${esc(r.createdAt||'—')}</span>
                  <span class="crm-cell-date">${r.lastTrade ? esc(r.lastTrade) : '<span class="crm-never">Never</span>'}</span>
                  <span class="crm-cell-money">${fmtMoney(r.reward)}</span>
                  <span class="crm-cell-actions">
                    <button class="row-act-btn row-act-btn--edit" data-row-edit="${esc(r.account)}" type="button">✎</button>${blkBtn}
                  </span>
                </div>`;
              }).join('')
          }
        </div>
      </div>`;
  }


  /* ─── High Value Clients ─────────────────────────────────── */
  function renderCrmHighValue() {
    const wrap = document.getElementById('crmHighValueWrap');
    if (!wrap) return;

    if (CrmStore.isEmpty()) { wrap.innerHTML = buildCrmNoData(); return; }

    const top      = CrmStore.getHighValue(20);
    const allTotal = CrmStore.getTotalCommission();
    const topTotal = top.reduce((s, r) => s + r.reward, 0);
    const topAvg   = top.length > 0 ? topTotal / top.length : 0;
    const topEarner = top.length > 0 ? top[0].reward : 0;

    wrap.innerHTML = `
      <div class="crm-stats-bar">
        <div class="crm-stat-pill crm-stat-pill--purple">
          <span class="crm-stat-val">${fmtMoney(allTotal)}</span>
          <span class="crm-stat-lbl">Total Commission Pool</span>
        </div>
        <div class="crm-stat-pill crm-stat-pill--blue">
          <span class="crm-stat-val">${fmtMoney(topAvg)}</span>
          <span class="crm-stat-lbl">Avg (Top 20)</span>
        </div>
        <div class="crm-stat-pill crm-stat-pill--green">
          <span class="crm-stat-val">${fmtMoney(topEarner)}</span>
          <span class="crm-stat-lbl">Top Earner</span>
        </div>
        <div class="crm-stat-pill crm-stat-pill--muted">
          <span class="crm-stat-val">${top.length}</span>
          <span class="crm-stat-lbl">Shown (of ${CrmStore.getAll().filter(r=>r.reward>0).length})</span>
        </div>
      </div>
      <div class="crm-table-card">
        <div class="crm-col-labels crm-col-labels--hv">
          <span>#</span><span>Account</span><span>Email</span><span>Country</span>
          <span>Type</span><span>Commission</span><span>Volume (lots)</span><span>Last Trade</span><span>Actions</span>
        </div>
        <div class="crm-table-body">
          ${top.length === 0
            ? `<div class="crm-no-results">No commission data available. Upload a broker file with reward/commission data.</div>`
            : top.map((orig, i) => {
                const r = _applyOverride(orig); // Phase 16.2 — apply client_overrides
                const isBlocked = _blockedSet && _blockedSet.has(normalizeAccountId(r.account));
                const blkBtn = isBlocked
                  ? `<button class="row-act-btn row-act-btn--edit" data-row-unblock="${esc(r.account)}" type="button" style="color:#4ade80;border-color:rgba(34,197,94,0.45)">↺ Unblk</button>`
                  : `<button class="row-act-btn row-act-btn--block" data-row-block="${esc(r.account)}" type="button">⊘ Block</button>`;
                return `<div class="crm-row crm-row--hv">
                  <span class="crm-cell-rank crm-rank-${i<3?i+1:'rest'}">#${i+1}</span>
                  <span class="crm-cell-acct">${esc(r.account)}</span>
                  <span class="crm-cell-email">${fmtContact(r)}</span>
                  <span class="crm-cell-cc">${esc(r.country||'—')}</span>
                  <span class="crm-cell-type">${esc(r.accountType||'—')}</span>
                  <span class="crm-cell-money crm-money--hi">${fmtMoney(r.reward)}</span>
                  <span class="crm-cell-lots">${fmtLots(r.volumeLots)}</span>
                  <span class="crm-cell-date">${esc(r.lastTrade||'—')}</span>
                  <span class="crm-cell-actions">
                    <button class="row-act-btn row-act-btn--edit" data-row-edit="${esc(r.account)}" type="button">✎</button>${blkBtn}
                  </span>
                </div>`;
              }).join('')
          }
        </div>
      </div>`;
  }


  /* ─── Global Search ──────────────────────────────────────── */
  let _crmSearchTimer = null;

  /* Phase 17B — Global search now spans EVERY client-bearing list:
       1. CrmStore        (Active / Inactive / High Value / IB Stars / IB Changed)
       2. State.requests  (Pending / Waiting / Matched / Compile / Delivered)
       3. RetryPool       (Waiting-for-Match active + archived)
       4. _blockedSet     (Blocked Clients)
       5. _ibChangedSet   (IB Changed Accounts)
     Each result row carries a source badge and an inline Edit button. */
  function _globalSearchAggregate(query) {
    const q = String(query || '').trim().toLowerCase();
    const seen = new Map();   // account -> merged row (first source wins for badge)
    const push = (acct, row, source) => {
      const key = normalizeAccountId(acct);
      if (!key) return;
      if (!seen.has(key)) {
        seen.set(key, { ...row, account: key, _sources: new Set([source]) });
      } else {
        const existing = seen.get(key);
        // enrich missing fields without overwriting
        if (!existing.email    && row.email)    existing.email    = row.email;
        if (!existing.whatsapp && row.whatsapp) existing.whatsapp = row.whatsapp;
        if (!existing.broker   && row.broker)   existing.broker   = row.broker;
        if (!existing.lastTrade && row.lastTrade) existing.lastTrade = row.lastTrade;
        if (!existing.country  && row.country)  existing.country  = row.country;
        if (!existing.accountType && row.accountType) existing.accountType = row.accountType;
        if (!existing.platform && row.platform) existing.platform = row.platform;
        existing._sources.add(source);
      }
    };
    // 1. CrmStore
    try {
      (CrmStore.getAll() || []).forEach(r => push(r.account, r, 'crm'));
    } catch (_) {}
    // 2. State.requests (pending / matched / compiled / emailed / delivered / unmatched / rejected / ib_changed)
    try {
      (State.requests || []).forEach(r => push(r.account, {
        email: r.email, whatsapp: r.whatsapp, broker: r.broker,
        country: '', accountType: r.status || '', platform: '',
        lastTrade: r.lastUpdate || '',
      }, 'request'));
    } catch (_) {}
    // 3. RetryPool (Waiting for Match)
    try {
      if (typeof RetryPool !== 'undefined' && RetryPool) {
        (RetryPool.getAll() || []).forEach(e => push(e.account, {
          email: e.email, whatsapp: '', broker: e.broker,
          country: '', accountType: e.archived ? 'archived' : 'retrying',
          platform: '', lastTrade: e.requestDate || '',
        }, 'retry'));
      }
    } catch (_) {}
    // 4. Blocked
    try {
      if (typeof _blockedSet !== 'undefined' && _blockedSet && _blockedSet.size) {
        _blockedSet.forEach(acct => push(acct, {
          email: '', whatsapp: '', broker: '', country: '',
          accountType: 'blocked', platform: '', lastTrade: '',
        }, 'blocked'));
      }
    } catch (_) {}
    // 5. IB Changed
    try {
      if (typeof _ibChangedRowsCache !== 'undefined' && Array.isArray(_ibChangedRowsCache)) {
        _ibChangedRowsCache.forEach(row => push(row.account_number, {
          email: row.email, whatsapp: row.whatsapp, broker: row.broker,
          country: '', accountType: 'ib_changed', platform: '',
          lastTrade: row.last_active_date || '',
        }, 'ibch'));
      }
    } catch (_) {}

    let arr = Array.from(seen.values());
    if (q) {
      arr = arr.filter(r =>
        (r.account    && String(r.account).toLowerCase().includes(q))    ||
        (r.email      && String(r.email).toLowerCase().includes(q))      ||
        (r.whatsapp   && String(r.whatsapp).toLowerCase().includes(q))   ||
        (r.broker     && String(r.broker).toLowerCase().includes(q))     ||
        (r.country    && String(r.country).toLowerCase().includes(q))    ||
        (r.accountType&& String(r.accountType).toLowerCase().includes(q))||
        (r.platform   && String(r.platform).toLowerCase().includes(q))
      );
    }
    return arr;
  }

  function _badgeForSource(srcSet) {
    // Priority: blocked > ibch > request > retry > crm
    if (srcSet.has('blocked')) return '<span class="crm-source-badge crm-source-badge--blocked">Blocked</span>';
    if (srcSet.has('ibch'))    return '<span class="crm-source-badge crm-source-badge--ibch">IB Changed</span>';
    if (srcSet.has('request')) return '<span class="crm-source-badge crm-source-badge--request">Request</span>';
    if (srcSet.has('retry'))   return '<span class="crm-source-badge crm-source-badge--retry">Waiting</span>';
    if (srcSet.has('crm'))     return '<span class="crm-source-badge crm-source-badge--crm">Client</span>';
    return '';
  }

  function renderCrmSearch(q) {
    const resultsEl = document.getElementById('crmSearchResults');
    const countEl   = document.getElementById('crmSearchCount');
    const tableCard = document.getElementById('crmSearchTableCard');
    const noDataEl  = document.getElementById('crmSearchNoData');

    if (!resultsEl) return;

    /* Phase 17B — aggregate across all stores instead of CrmStore-only.
       Show the no-data state only if EVERY store is empty. */
    const allEmpty =
      (typeof CrmStore !== 'undefined' && CrmStore.isEmpty ? CrmStore.isEmpty() : true) &&
      (!State.requests || State.requests.length === 0) &&
      (typeof RetryPool !== 'undefined' && RetryPool && RetryPool.getAll && RetryPool.getAll().length === 0);
    if (allEmpty) {
      if (tableCard)  tableCard.hidden  = true;
      if (noDataEl) { noDataEl.innerHTML = buildCrmNoData(); noDataEl.hidden = false; }
      if (countEl)    countEl.textContent = '—';
      return;
    }

    if (tableCard)  tableCard.hidden  = false;
    if (noDataEl)   noDataEl.hidden   = true;

    const query   = (q || '').trim();
    const results = _globalSearchAggregate(query);

    if (countEl) {
      countEl.textContent = query
        ? `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`
        : `${results.length} total record${results.length !== 1 ? 's' : ''}`;
    }

    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="crm-no-results">No accounts match "${esc(query)}".</div>`;
      return;
    }

    resultsEl.innerHTML = results.map(r => {
      const contactCell = (r.email || r.whatsapp)
        ? esc((r.email || '') + (r.whatsapp ? '  ·  ' + r.whatsapp : ''))
        : '<span class="crm-never">No contact on file</span>';
      const badge = _badgeForSource(r._sources || new Set());
      const isActive = !!r.lastTrade && !(r._sources && r._sources.has('blocked')) && !(r._sources && r._sources.has('ibch'));
      return `<div class="crm-row crm-row--search">
        <span class="crm-cell-acct">${esc(r.account)} ${badge}</span>
        <span class="crm-cell-email">${contactCell}</span>
        <span class="crm-cell-cc">${esc(r.country||'—')}</span>
        <span class="crm-cell-type">${esc(r.accountType||'—')}</span>
        <span class="crm-cell-plat">${esc(r.platform||'—')}</span>
        <span class="crm-cell-date">${r.lastTrade ? esc(r.lastTrade) : '<span class="crm-never">Never</span>'}</span>
        <span class="crm-cell-money">${fmtMoney(r.reward || 0)}</span>
        <span class="crm-badge ${isActive?'crm-badge--active':'crm-badge--inactive'}">${isActive?'Active':'Inactive'}</span>
        <span><button class="crm-row-edit-btn" data-global-edit="${esc(r.account)}" type="button" title="Edit this client">✎ Edit</button></span>
      </div>`;
    }).join('');

    // Wire the Edit buttons — Phase 17B Issue 3
    resultsEl.querySelectorAll('[data-global-edit]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const acct = b.dataset.globalEdit;
        if (typeof _openEditClientModal === 'function') _openEditClientModal(acct);
      });
    });
  }


  /* ─── Bulk Message — update dynamic parts only ───────────── */
  /* ═══════════════════════════════════════════════════════════
     PHASE 14A — CAMPAIGN BUILDER
     Replaces the old Bulk Message section with a full
     multi-channel campaign builder. Architecture is queue-ready
     for Phase 14B sending pipeline integration.
  ══════════════════════════════════════════════════════════ */

  /* In-memory campaign state — persists while dashboard is open */
  const CampaignBuilder = {
    group:       'active',   // selected audience segment key
    channel:     'email',    // 'email' | 'whatsapp' | 'both'
    manualAccts: [],         // resolved account strings for 'manual' group
    links:       [],         // [{ label, url }]
    files:       [],         // File objects from attach input / drop zone
  };

  /* ── getCampaignAudience ───────────────────────────────────────
     Returns flat array of { account, email, whatsapp, source }
     for the given segment. Works across CrmStore + RetryPool.   */
  function getCampaignAudience(group, manualAccts) {
    const crmToC  = r => ({ account: r.account, email: r.email    || '', whatsapp: r.whatsapp || '', source: 'crm'   });
    const poolToC = e => {
      const wa = _cbWaLookup()[String(e.account).trim()] || '';
      return { account: e.account, email: e.email || '', whatsapp: wa, source: 'retry' };
    };
    switch (group) {
      case 'matched':   return CrmStore.getAll().map(crmToC);
      case 'active':    return CrmStore.getActive().map(crmToC);
      case 'inactive':  return CrmStore.getInactive().map(crmToC);
      case 'never':     return CrmStore.getInactive().filter(r => !r.lastTrade).map(crmToC);
      case 'hv10':      return CrmStore.getHighValue(10).map(crmToC);
      case 'hv20':      return CrmStore.getHighValue(20).map(crmToC);
      case 'hvall':     return CrmStore.getAll().filter(r => r.reward > 0).sort((a, b) => b.reward - a.reward).map(crmToC);
      case 'waiting':   return RetryPool.getActive().map(poolToC);
      case 'unmatched': return RetryPool.getArchived().map(poolToC);
      case 'all': {
        const crmAccts = new Set(CrmStore.getAll().map(r => r.account));
        const retryU   = [...RetryPool.getActive(), ...RetryPool.getArchived()]
          .filter(e => !crmAccts.has(e.account)).map(poolToC);
        return [...CrmStore.getAll().map(crmToC), ...retryU];
      }
      case 'manual': {
        if (!manualAccts || !manualAccts.length) return [];
        const crmAll = CrmStore.getAll();
        const waMap  = _cbWaLookup();
        return manualAccts.map(acct => {
          const crm = crmAll.find(r => r.account === acct);
          if (crm) return crmToC(crm);
          const req = State.requests.find(r => String(r.account).trim() === acct);
          return { account: acct, email: req ? req.email : '', whatsapp: waMap[acct] || '', source: 'manual' };
        });
      }
      // Phase 16 follow-up — IB Changed audience for recovery campaigns.
      // Read from the cached ib_changed_accounts rows. These clients have
      // service access revoked BUT remain contactable from CRM.
      case 'ib_changed': {
        return (_ibChangedRowsCache || []).map(r => ({
          account:  normalizeAccountId(r.account_number),
          email:    r.email    || '',
          whatsapp: r.whatsapp || '',
          source:   'ib_changed',
        }));
      }
      default: return CrmStore.getActive().map(crmToC);
    }
  }

  // Phase 16.2 Issue 4 — universal audience filter: exclude blocked accounts.
  // Wraps the original getCampaignAudience so EVERY group automatically
  // excludes blocked clients, including the new ib_changed audience.
  const _originalGetCampaignAudience = getCampaignAudience;
  getCampaignAudience = function (group, manualAccts) {
    const list = _originalGetCampaignAudience(group, manualAccts);
    if (!_blockedSet || _blockedSet.size === 0) return list;
    return list.filter(c => !_blockedSet.has(normalizeAccountId(c.account)));
  };

  /* WhatsApp lookup map from live State.requests — used for RetryPool contacts */
  function _cbWaLookup() {
    const map = {};
    State.requests.forEach(r => {
      if (r.account && r.whatsapp && !map[String(r.account).trim()])
        map[String(r.account).trim()] = r.whatsapp;
    });
    return map;
  }

  /* ── getAudienceCounts ─────────────────────────────────────── */
  function getAudienceCounts() {
    const all      = CrmStore.getAll();
    const active   = CrmStore.getActive();
    const inactive = CrmStore.getInactive();
    const crmAccts = new Set(all.map(r => r.account));
    const retryA   = RetryPool.getActive();
    const retryArc = RetryPool.getArchived();
    const retryUniq = [...retryA, ...retryArc].filter(e => !crmAccts.has(e.account));
    return {
      matched:   all.length,
      waiting:   retryA.length,
      unmatched: retryArc.length,
      active:    active.length,
      inactive:  inactive.length,
      never:     inactive.filter(r => !r.lastTrade).length,
      hv10:      CrmStore.getHighValue(10).length,
      hv20:      CrmStore.getHighValue(20).length,
      hvall:     all.filter(r => r.reward > 0).length,
      all:       all.length + retryUniq.length,
      ib_changed: (_ibChangedRowsCache || []).length,   // Phase 16 follow-up
    };
  }

  /* ── buildAudienceGrid ─────────────────────────────────────── */
  function buildAudienceGrid() {
    const gridEl = document.getElementById('cbAudienceGrid');
    if (!gridEl) return;
    const counts = getAudienceCounts();
    const OPTS = [
      { group: 'matched',   label: 'Matched Accounts',    count: counts.matched   },
      { group: 'waiting',   label: 'Waiting for Match',   count: counts.waiting   },
      { group: 'unmatched', label: 'Match Not Found',     count: counts.unmatched },
      { group: 'active',    label: 'Active Clients',      count: counts.active    },
      { group: 'inactive',  label: 'Inactive Clients',    count: counts.inactive  },
      { group: 'never',     label: 'Never Traded',        count: counts.never     },
      { group: 'hv10',      label: 'High Value — Top 10', count: counts.hv10      },
      { group: 'hv20',      label: 'High Value — Top 20', count: counts.hv20      },
      { group: 'hvall',     label: 'All High Value',      count: counts.hvall     },
      { group: 'all',       label: 'All Clients',         count: counts.all       },
      // Phase 16 follow-up — recovery audience (service-revoked, still contactable)
      { group: 'ib_changed',label: 'IB Changed (Recovery)', count: counts.ib_changed },
      { group: 'manual',    label: 'Custom Selection',    count: null             },
    ];
    gridEl.innerHTML = OPTS.map(o =>
      `<button type="button" class="cb-aud-opt${o.group === CampaignBuilder.group ? ' is-active' : ''}"
               data-group="${o.group}">
        <span class="cb-aud-label">${o.label}</span>
        <span class="cb-aud-count">${o.count !== null ? o.count : '—'}</span>
      </button>`
    ).join('');
  }

  /* ── updateCbAudience ─────────────────────────────────────────
     Recomputes contacts for the selected segment and refreshes
     the summary stats + recipient preview list.              */
  function updateCbAudience(group) {
    CampaignBuilder.group = group;
    const contacts  = getCampaignAudience(group, CampaignBuilder.manualAccts);
    const withEmail = contacts.filter(c => c.email);
    const withWa    = contacts.filter(c => c.whatsapp);
    const noContact = contacts.filter(c => !c.email && !c.whatsapp);
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('cbSumTotal', contacts.length);
    setEl('cbSumEmail', withEmail.length);
    setEl('cbSumWa',    withWa.length);
    setEl('cbSumMiss',  noContact.length);

    // Preview (up to 8 rows)
    const listEl  = document.getElementById('cbPreviewList');
    if (listEl) {
      const preview = contacts.slice(0, 8);
      listEl.innerHTML = contacts.length === 0
        ? '<p class="cb-preview-hint">No recipients in this segment.</p>'
        : preview.map(c =>
            `<div class="cb-prev-row">
              <span class="cb-prev-acct">${esc(c.account)}</span>
              <span class="cb-prev-contact">
                ${c.email
                  ? `<span class="cb-prev-email">${esc(c.email)}</span>`
                  : '<span class="cb-prev-missing">no email</span>'}
                ${c.whatsapp ? buildWaLink(c.whatsapp, 'crm-wa-link--sm') : ''}
              </span>
            </div>`).join('') +
          (contacts.length > 8
            ? `<p class="cb-prev-more">+ ${contacts.length - 8} more not shown</p>`
            : '');
    }

    // Audience grid active state
    document.querySelectorAll('.cb-aud-opt').forEach(btn =>
      btn.classList.toggle('is-active', btn.dataset.group === group)
    );

    // Manual card visibility
    const manualCard = document.getElementById('cbManualCard');
    if (manualCard) manualCard.hidden = group !== 'manual';
  }

  /* ── renderCampaignBuilder — section entry point ─────────────── */
  async function renderCampaignBuilder() {
    const noDataEl  = document.getElementById('crmMsgNoData');
    const composeEl = document.getElementById('crmMsgCompose');
    if (!composeEl) return;

    // Phase 16 follow-up — refresh ib_changed_accounts cache so the
    // audience grid shows accurate count for the new IB Changed audience.
    _invalidateIbChangedCache();
    try { await _ensureIbChangedSet(); } catch (e) {}

    const hasData = !CrmStore.isEmpty() || RetryPool.getAll().length > 0 || (_ibChangedRowsCache || []).length > 0;
    if (!hasData) {
      if (noDataEl) { noDataEl.innerHTML = buildCrmNoData(); noDataEl.hidden = false; }
      composeEl.hidden = true;
      return;
    }
    if (noDataEl) noDataEl.hidden = true;
    composeEl.hidden = false;

    // Rebuild audience grid with fresh counts
    buildAudienceGrid();
    // Refresh summary + preview for current group
    updateCbAudience(CampaignBuilder.group);
  }

  /* ── renderCbLinks ──────────────────────────────────────────── */
  function renderCbLinks() {
    const listEl = document.getElementById('cbLinksList');
    if (!listEl) return;
    if (CampaignBuilder.links.length === 0) {
      listEl.innerHTML = '<p class="cb-empty-note" id="cbLinksEmpty">No links added. Share WhatsApp channels, Telegram groups, YouTube videos, Drive folders, or any custom URL.</p>';
      return;
    }
    listEl.innerHTML = CampaignBuilder.links.map((lk, i) =>
      `<div class="cb-link-row">
        <input type="text"  class="cb-input cb-link-lbl" data-idx="${i}" data-f="label"
               placeholder="Label (e.g. WhatsApp Channel)" value="${esc(lk.label)}">
        <input type="url"   class="cb-input cb-link-url" data-idx="${i}" data-f="url"
               placeholder="https://…" value="${esc(lk.url)}">
        <button type="button" class="cb-link-rm" data-idx="${i}" aria-label="Remove">&#10005;</button>
      </div>`
    ).join('');
    listEl.querySelectorAll('[data-f]').forEach(el => {
      el.addEventListener('input', () => {
        const i = +el.dataset.idx; const f = el.dataset.f;
        if (CampaignBuilder.links[i]) CampaignBuilder.links[i][f] = el.value;
      });
    });
    listEl.querySelectorAll('.cb-link-rm').forEach(btn => {
      btn.addEventListener('click', () => {
        CampaignBuilder.links.splice(+btn.dataset.idx, 1);
        renderCbLinks();
      });
    });
  }

  /* ── addCbFiles / renderCbAttachCards ───────────────────────── */
  function addCbFiles(files) {
    const OK_EXT = new Set(['pdf','docx','xlsx','zip','ex5','jpg','jpeg','png']);
    Array.from(files).forEach(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (!OK_EXT.has(ext)) { showToast(`"${f.name}" — unsupported type.`, 'warn'); return; }
      if (CampaignBuilder.files.some(x => x.name === f.name && x.size === f.size)) return;
      CampaignBuilder.files.push(f);
    });
    renderCbAttachCards();
  }

  function renderCbAttachCards() {
    const cardsEl = document.getElementById('cbAttachCards');
    if (!cardsEl) return;
    if (!CampaignBuilder.files.length) { cardsEl.innerHTML = ''; return; }
    const ICO = { pdf:'📄', docx:'📝', xlsx:'📊', zip:'🗜️', ex5:'⚙️', jpg:'🖼️', jpeg:'🖼️', png:'🖼️' };
    const fmtSz = f => f.size < 1048576 ? (f.size/1024).toFixed(1)+' KB' : (f.size/1048576).toFixed(2)+' MB';
    cardsEl.innerHTML = CampaignBuilder.files.map((f, i) => {
      const ext = f.name.split('.').pop().toLowerCase();
      return `<div class="cb-attach-card">
        <span class="cb-attach-card-ico">${ICO[ext] || '📎'}</span>
        <div class="cb-attach-card-info">
          <span class="cb-attach-card-name">${esc(f.name)}</span>
          <span class="cb-attach-card-size">${fmtSz(f)}</span>
        </div>
        <button type="button" class="cb-link-rm" data-fidx="${i}" aria-label="Remove file">&#10005;</button>
      </div>`;
    }).join('');
    cardsEl.querySelectorAll('[data-fidx]').forEach(btn => {
      btn.addEventListener('click', () => {
        CampaignBuilder.files.splice(+btn.dataset.fidx, 1);
        renderCbAttachCards();
      });
    });
  }

  /* ── buildCampaignPayload / handleCbSend ────────────────────── */
  function buildCampaignPayload() {
    const contacts = getCampaignAudience(CampaignBuilder.group, CampaignBuilder.manualAccts);
    const g = id => document.getElementById(id);
    return {
      _version:   '14A',
      _timestamp: new Date().toISOString(),
      audience: {
        group:    CampaignBuilder.group,
        count:    contacts.length,
        contacts: contacts.map(c => ({ account: c.account, email: c.email, whatsapp: c.whatsapp })),
      },
      channel: CampaignBuilder.channel,
      message: {
        title:   g('cbCampaignTitle')?.value.trim() || '',
        subject: g('cbSubjectLine')?.value.trim()   || '',
        body:    g('cbMsgBody')?.value.trim()        || '',
        cta: {
          text: g('cbCtaText')?.value.trim() || '',
          url:  g('cbCtaUrl')?.value.trim()  || '',
        },
      },
      links:       CampaignBuilder.links.filter(l => l.url.trim()),
      attachments: CampaignBuilder.files.map(f => ({ name: f.name, size: f.size, type: f.type })),
    };
  }

  function handleCbSend(channel) {
    const payload    = buildCampaignPayload();
    const needsEmail = channel === 'email'     || channel === 'both';
    const needsWa    = channel === 'whatsapp'  || channel === 'both';

    /* ── Validation ──────────────────────────────────────── */
    if (!payload.message.body) {
      showToast('Please write a message body before sending.', 'warn'); return;
    }
    if (payload.audience.count === 0) {
      showToast('No recipients in the selected audience.', 'warn'); return;
    }
    if (needsEmail && !payload.message.subject) {
      showToast('Please add an email subject line.', 'warn'); return;
    }
    if (needsWa && !payload.audience.contacts.some(c => c.whatsapp)) {
      showToast('No WhatsApp numbers in this audience segment.', 'warn'); return;
    }

    console.log(`[CampaignBuilder] Phase 15.1 — Campaign send (${channel}):`, payload);

    /* ── Part E: Email queue ─────────────────────────────── */
    if (needsEmail) {
      const subject  = payload.message.subject;
      const body     = payload.message.body +
        (payload.message.cta.url
          ? `\n\n${payload.message.cta.text || 'Learn more'}: ${payload.message.cta.url}`
          : '');
      const newItems = payload.audience.contacts
        .filter(c => c.email)
        .map(c => _buildEmailItemFromContact(c, subject, body, 'campaign'));
      if (newItems.length > 0) {
        _appendToEmailQueue(newItems);
        console.log(`[Phase15.1] Appended ${newItems.length} email item(s) to queue.`);
      }
    }

    /* ── Part E: WA batch queue ──────────────────────────── */
    if (needsWa) {
      const waContacts = payload.audience.contacts.filter(c => c.whatsapp);
      const msgBody    = payload.message.body +
        (payload.message.cta.url
          ? `\n\n🔗 ${payload.message.cta.url}`
          : '');
      const waItems    = waContacts.map(c =>
        _buildWaItemFromContact(c, msgBody, 'campaign')
      );
      if (waItems.length > 0) {
        const newBatches = _buildWaBatches(waItems);
        _appendToWaQueue(newBatches);
        console.log(`[Phase15.1] Appended ${newBatches.length} WA batch(es) (${waItems.length} contact(s)) to queue.`);
      }
    }

    /* ── Navigate to intake delivery panels ──────────────── */
    activateSection('intake', 'Broker File Intake');
    // Small delay lets the section render before scrolling delivery panels into view
    setTimeout(() => {
      renderDeliveryPanels();
      const emailPanel = document.getElementById('emailDeliveryPanel');
      const waPanel    = document.getElementById('waDeliveryPanel');
      const target     = (needsEmail && emailPanel && !emailPanel.hidden)
        ? emailPanel
        : (needsWa && waPanel && !waPanel.hidden)
          ? waPanel
          : null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    const chLabel = channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : 'Email + WhatsApp';
    const rec     = payload.audience.count;
    showToast(
      `${chLabel} campaign queued for ${rec} recipient${rec !== 1 ? 's' : ''}. Review in the Delivery panels below.`,
      'success', 6000
    );
  }


  /* ═══════════════════════════════════════════════════════════
     PHASE 14B — COMPILATION QUEUE
     In-dashboard lifecycle tracker for matched broker accounts.
     Mirrors the queue UI that previously existed only in
     admin-upload-report.html — now merged into the intake
     section so the admin only needs one page.

     Architecture:
       fetchIntakeQueue()   — parallel Supabase reads, 4 stages
       intakeSetStatus()    — flexible status write (bypasses strict
                              single-step ALLOWED_TRANSITIONS)
       renderIqPanel()      — render one queue tab panel
       renderIntakeQueue()  — render all tabs + update counts
       refreshIntakeQueue() — async fetch → render wrapper
       _iqExportJSON()      — download matched queue as JSON
       bindIntakeQueue()    — wire tab UI, refresh, export, row actions
  ══════════════════════════════════════════════════════════ */

  let _iqData      = null;   // { matched:[], compiled:[], emailed:[], rejected:[] }
  let _iqActiveTab = 'matched';

  /* ─── Helpers ────────────────────────────────────────────── */

  /** Build the expected output filename for an account number. */
  function _iqFilename(acctNum) {
    if (!acctNum) return '—';
    return 'ZTU_Report_' + String(acctNum).replace(/[^a-zA-Z0-9_-]/g, '_') + '.xlsx';
  }

  /** Render a status badge pill using existing STATUS_META + DB_TO_DASH mapping. */
  function _iqPill(rawStatus) {
    const canonical = normalizeDbStatus(rawStatus);
    const dashKey   = DataLayer.DB_TO_DASH[canonical] || 'new_request';
    const meta      = STATUS_META[dashKey] || STATUS_META['new_request'];
    return `<span class="status-pill ${meta.cls}">${meta.label}</span>`;
  }

  /** Format an ISO date string as "DD Mon YYYY · HH:MM AM/PM" (Phase 16.4 Issue 2). */
  function _iqFmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const ds = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      const ts = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
      return ds + ' · ' + ts;
    } catch (_e) { return iso; }
  }

  /* ─── fetchIntakeQueue ───────────────────────────────────── */

  /**
   * Fetch all four lifecycle stages from Supabase in parallel.
   * Returns { matched:[], compiled:[], emailed:[], rejected:[] }.
   * In mock mode, derives the lists from State.requests.
   */
  async function fetchIntakeQueue() {
    if (!DataLayer.isLive) {
      // Mock mode — derive from in-memory State
      const all = State.requests;
      return {
        matched:  all.filter(r => ['matched','ready_compile'].includes(r.status)),
        compiled: all.filter(r => r.status === 'compiled'),
        emailed:  all.filter(r => r.status === 'delivered'),
        rejected: all.filter(r => r.status === 'rejected'),
      };
    }
    if (!supabaseClient) return { matched: [], compiled: [], emailed: [], rejected: [] };

    const MATCHED_STATUSES = ['matched', 'approved', 'compile_ready'];
    // Use created_at for ordering — updated_at may not exist in all deployments
    const [mRes, cRes, eRes, rRes] = await Promise.all([
      supabaseClient.from(DB_SCHEMA.TABLE).select(DB_SCHEMA.SELECT).in('status', MATCHED_STATUSES).order('created_at', { ascending: false }),
      supabaseClient.from(DB_SCHEMA.TABLE).select(DB_SCHEMA.SELECT).eq('status', 'compiled').order('created_at', { ascending: false }),
      supabaseClient.from(DB_SCHEMA.TABLE).select(DB_SCHEMA.SELECT).eq('status', 'emailed').order('created_at', { ascending: false }),
      supabaseClient.from(DB_SCHEMA.TABLE).select(DB_SCHEMA.SELECT).eq('status', 'rejected').order('created_at', { ascending: false }),
    ]);

    // Log query errors without crashing — panels render as empty on error
    if (mRes.error) console.warn('[IntakeQueue] matched query error:', mRes.error.message);
    if (cRes.error) console.warn('[IntakeQueue] compiled query error:', cRes.error.message);
    if (eRes.error) console.warn('[IntakeQueue] emailed query error:', eRes.error.message);
    if (rRes.error) console.warn('[IntakeQueue] rejected query error:', rRes.error.message);

    return {
      matched:  mRes.data || [],
      compiled: cRes.data || [],
      emailed:  eRes.data || [],
      rejected: rRes.data || [],
    };
  }

  /* ─── intakeSetStatus — flexible lifecycle write ─────────── */

  /**
   * Allowed "from" statuses for each target.  More permissive than
   * the strict single-step ALLOWED_TRANSITIONS used by the table
   * actions — necessary for multi-step jumps (e.g. matched→emailed).
   */
  const _IQ_ALLOWED_FROM = {
    compile_ready: ['matched', 'approved'],
    compiled:      ['matched', 'approved', 'compile_ready'],
    emailed:       ['matched', 'approved', 'compile_ready', 'compiled'],
    rejected:      ['pending', 'matched', 'approved', 'compile_ready', 'compiled'],
  };

  /**
   * Write a new lifecycle status to Supabase.  Uses WriteLock to
   * prevent concurrent writes on the same row.
   * @param {string|number} id       — row ID
   * @param {string}        toStatus — target DB status string
   * @returns {boolean} true on success
   */
  async function intakeSetStatus(id, toStatus) {
    const idStr = String(id);
    if (WriteLock.has(idStr)) {
      showToast('Another update is in progress for this row.', 'warn', 3000);
      return false;
    }
    if (!DataLayer.isLive || !supabaseClient) {
      showToast('Live mode required for status updates.', 'warn', 3000);
      return false;
    }
    WriteLock.add(idStr);
    try {
      const { error } = await supabaseClient
        .from(DB_SCHEMA.TABLE)
        .update({ status: toStatus, updated_at: new Date().toISOString() })
        .eq('id', idStr);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[intakeSetStatus] Write failed:', e);
      showToast('Update failed — ' + (e.message || String(e)), 'error', 5000);
      return false;
    } finally {
      WriteLock.delete(idStr);
    }
  }

  /* ─── renderIqPanel — single tab panel renderer ──────────── */

  /**
   * Render the rows (or empty state) for one queue panel.
   * @param {HTMLElement} panelEl   — the .intake-queue-panel element
   * @param {Array}       rows      — raw DB rows (or mock objects) for this stage
   * @param {boolean}     isTerminal — true for Emailed/Rejected (no action buttons)
   */
  function renderIqPanel(panelEl, rows, isTerminal) {
    const bodyEl  = panelEl.querySelector('.intake-queue-rows');
    const emptyEl = panelEl.querySelector('.intake-queue-empty');
    if (!bodyEl) return;

    if (!rows || rows.length === 0) {
      bodyEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    bodyEl.innerHTML = rows.map(r => {
      const acct   = r.account_number || r.account || '—';
      const broker = r.broker_name    || r.broker  || '—';
      const email  = r.email          || '—';
      const date   = _iqFmtDate(r.updated_at || r.created_at);
      const file   = _iqFilename(r.account_number || r.account);
      const pill   = _iqPill(r.status || r.dbStatus || '');

      // Phase 16.4 Issue 5 — explicit human-readable context per row state.
      const sLower = String(r.status || r.dbStatus || '').toLowerCase();
      let contextLabel = '';
      if (sLower === 'matched' || sLower === 'approved') {
        contextLabel = 'Awaiting Compile';
      } else if (sLower === 'compile_ready') {
        contextLabel = 'Ready to Compile';
      } else if (sLower === 'compiled') {
        contextLabel = 'Ready to Send';
      } else if (sLower === 'emailed' || sLower === 'delivered') {
        const sentWhen = _iqFmtDate(r.delivered_at || r.emailed_at || r.updated_at);
        contextLabel = 'Delivered ' + sentWhen + (email !== '—' ? ' → ' + email : '');
      } else if (sLower === 'rejected' || sLower === 'failed' || sLower === 'unmatched') {
        const reason = r.notes || r.failure_reason || r.reject_reason || 'no reason captured';
        contextLabel = 'Failed: ' + reason;
      } else if (sLower) {
        contextLabel = sLower;
      }

      // Phase 16.4 Issue 7 — delivery-history fields (graceful when columns missing)
      const resendCount  = (r.resend_count != null) ? r.resend_count : 0;
      const lastResendAt = r.last_resend_at ? _iqFmtDate(r.last_resend_at) : null;
      let historyLine = '';
      if (sLower === 'emailed' || sLower === 'delivered') {
        historyLine =
          'Resends: ' + resendCount +
          (lastResendAt ? ' · Last: ' + lastResendAt : '');
      }

      let actions = '';
      if (!isTerminal) {
        if (['matched', 'approved', 'compile_ready'].includes(sLower)) {
          actions = `
            <button class="iq-btn iq-btn--action" data-iq-action="compiled" data-iq-id="${r.id}" type="button" title="Mark as Compiled">Compiled</button>
            <button class="iq-btn iq-btn--action" data-iq-action="emailed"  data-iq-id="${r.id}" type="button" title="Mark as Emailed">Emailed</button>
            <button class="iq-btn iq-btn--danger" data-iq-action="rejected" data-iq-id="${r.id}" type="button" title="Reject">Reject</button>`;
        } else if (sLower === 'compiled') {
          actions = `
            <button class="iq-btn iq-btn--action" data-iq-action="emailed"  data-iq-id="${r.id}" type="button" title="Mark as Emailed">Emailed</button>
            <button class="iq-btn iq-btn--action" data-iq-action="resend"   data-iq-id="${r.id}" data-iq-acct="${acct}" data-iq-email="${email}" type="button" title="Resend delivery email">RESEND</button>
            <button class="iq-btn iq-btn--danger" data-iq-action="rejected" data-iq-id="${r.id}" type="button" title="Reject">Reject</button>`;
        }
      } else {
        // Phase 16.4 Issue 6 — RESEND on Delivered rows
        if (sLower === 'emailed' || sLower === 'delivered') {
          actions = `<button class="iq-btn iq-btn--action" data-iq-action="resend" data-iq-id="${r.id}" data-iq-acct="${acct}" data-iq-email="${email}" type="button" title="Resend delivery email">RESEND</button>`;
        }
      }
      // Phase 16.6 — universal "ⓘ" info button on EVERY row, regardless of status.
      // Opens the diagnostic modal with full reason + history + Remove-from-Queue.
      const infoBtn = `<button class="iq-btn iq-btn--info" data-iq-action="info" data-iq-id="${r.id}" data-iq-acct="${acct}" type="button" title="Show full diagnostics for this row">ⓘ</button>`;
      actions = infoBtn + (actions ? ' ' + actions : '');

      return `<div class="intake-queue-row" data-iq-row-id="${r.id}">
        <span class="iq-cell iq-acct" title="${acct}">${acct}</span>
        <span class="iq-cell iq-email" title="${email}">${email}</span>
        <span class="iq-cell iq-broker" title="${broker}">${broker}</span>
        <span class="iq-cell iq-date">${date}</span>
        <span class="iq-cell iq-file" title="${file}">${file}</span>
        <span class="iq-cell iq-status">
          ${pill}
          ${contextLabel ? `<div class="iq-context-label" title="${contextLabel.replace(/"/g,'&quot;')}">${contextLabel}</div>` : ''}
          ${historyLine ? `<div class="iq-history-line">${historyLine}</div>` : ''}
        </span>
        <span class="iq-cell iq-actions">${actions}</span>
      </div>`;
    }).join('');
  }

  /* ─── renderIntakeQueue — render all tabs + counts ───────── */

  /**
   * Accept pre-fetched data, update all 4 tab count badges,
   * render each panel, and hide the loading overlay.
   */
  function renderIntakeQueue(data) {
    _iqData = data;

    // Tab count badges
    const tabCounts = [
      data.matched.length,
      data.compiled.length,
      data.emailed.length,
      data.rejected.length,
    ];
    tabCounts.forEach((count, i) => {
      const el = document.getElementById(`iqTabN${i}`);
      if (el) el.textContent = count > 0 ? String(count) : '';
    });

    // Render panels
    const pm = document.getElementById('iqPanelMatched');
    const pc = document.getElementById('iqPanelCompiled');
    const pe = document.getElementById('iqPanelEmailed');
    const pr = document.getElementById('iqPanelRejected');
    if (pm) renderIqPanel(pm, data.matched,  false);
    if (pc) renderIqPanel(pc, data.compiled, false);
    if (pe) renderIqPanel(pe, data.emailed,  true);
    if (pr) renderIqPanel(pr, data.rejected, true);

    // Dismiss loading overlay
    const loadEl = document.getElementById('iqLoading');
    if (loadEl) loadEl.hidden = true;
  }

  /* ─── refreshIntakeQueue ─────────────────────────────────── */

  /** Show loading state, fetch all stages, render. */
  async function refreshIntakeQueue() {
    const loadEl = document.getElementById('iqLoading');
    if (loadEl) loadEl.hidden = false;
    try {
      const data = await fetchIntakeQueue();
      renderIntakeQueue(data);
    } catch (e) {
      console.error('[refreshIntakeQueue] Failed:', e);
      showToast('Could not load compilation queue.', 'error', 4000);
      if (loadEl) loadEl.hidden = true;
    }
  }

  /* ─── _iqExportJSON ──────────────────────────────────────── */

  /** Download the current "New Matches" tab data as a JSON file. */
  function _iqExportJSON() {
    if (!_iqData || !_iqData.matched || _iqData.matched.length === 0) {
      showToast('No matched accounts in queue to export.', 'warn', 3000);
      return;
    }
    const payload = _iqData.matched.map(r => ({
      id:             r.id,
      account_number: r.account_number || r.account || '',
      broker_name:    r.broker_name    || r.broker  || '',
      email:          r.email          || '',
      status:         r.status         || '',
      created_at:     r.created_at     || '',
      updated_at:     r.updated_at     || '',
      target_file:    _iqFilename(r.account_number || r.account),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ZTU_MatchedQueue_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${payload.length} matched account${payload.length !== 1 ? 's' : ''}.`, 'success', 3000);
  }

  /* ═══════════════════════════════════════════════════════════
     PHASE 15.6 — sidebar pages wired to fetchIntakeQueue()
     ───────────────────────────────────────────────────────────
     Three thin renderers — no new Supabase calls, no new schema,
     no UI redesign.  Each renderer:
       1. Shows a "Loading…" bar
       2. Calls the existing fetchIntakeQueue() (single source of truth)
       3. Hands the relevant slice to the existing renderIqPanel()
       4. Updates the section's count badge
     Called from activateSection() when the user opens these pages.
  ══════════════════════════════════════════════════════════ */

  /**
   * Render Matched Accounts sidebar page using fetchIntakeQueue().matched.
   * (matched + approved + compile_ready, per fetchIntakeQueue's MATCHED_STATUSES)
   */
  async function renderMatchedAccountsSection() {
    const wrapEl   = document.getElementById('matchedSectionWrap');
    const rowsEl   = document.getElementById('matchedSectionRows');
    const emptyEl  = document.getElementById('matchedSectionEmpty');
    const countEl  = document.getElementById('matchedSectionCount');
    const loadEl   = document.getElementById('matchedSectionLoading');
    if (!wrapEl || !rowsEl) return;

    if (loadEl) loadEl.hidden = false;
    try {
      const data = await fetchIntakeQueue();
      // Phase 15.6 refinement (Task 5): clean status separation.
      // Matched Accounts now shows ONLY 'matched' / 'approved' — these are
      // the brief pre-compile states.  As soon as the engine flips a row to
      // 'compile_ready', it leaves this page and shows in Compile Queue.
      // This prevents the same account appearing in two sidebar pages.
      const rows = (data.matched || []).filter(r => {
        const s = String(r.status || '').toLowerCase();
        return s === 'matched' || s === 'approved';
      });
      if (countEl) countEl.textContent = String(rows.length);

      // Synthesize a panel-shaped wrapper so renderIqPanel can reuse its
      // .intake-queue-rows / .intake-queue-empty lookups.
      const fakePanel = {
        querySelector: (sel) => {
          if (sel === '.intake-queue-rows') return rowsEl;
          if (sel === '.intake-queue-empty') return emptyEl;
          return null;
        },
      };
      // isTerminal=false → show Compiled / Emailed / Reject action buttons
      renderIqPanel(fakePanel, rows, false);
    } catch (e) {
      console.error('[renderMatchedAccountsSection] Failed:', e);
      if (rowsEl)  rowsEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden   = false;
      if (countEl) countEl.textContent = '0';
    } finally {
      if (loadEl) loadEl.hidden = true;
    }
  }

  /**
   * Render Compile Queue sidebar page.
   * Phase 15.6 refinement (Task 5): shows only 'compile_ready' + 'compiled'
   * — the active compile pipeline.  Excludes brief pre-compile 'matched'
   * (those appear in Matched Accounts).  No overlap between sidebar pages.
   */
  async function renderCompileQueueSection() {
    const wrapEl   = document.getElementById('compileSectionWrap');
    const rowsEl   = document.getElementById('compileSectionRows');
    const emptyEl  = document.getElementById('compileSectionEmpty');
    const countEl  = document.getElementById('compileSectionCount');
    const loadEl   = document.getElementById('compileSectionLoading');
    if (!wrapEl || !rowsEl) return;

    if (loadEl) loadEl.hidden = false;
    try {
      const data = await fetchIntakeQueue();
      // Pull compile_ready rows from the 'matched' slice (which still
      // includes them per fetchIntakeQueue's MATCHED_STATUSES contract),
      // then concat with rows already past compile.
      const compileReady = (data.matched || []).filter(r => {
        return String(r.status || '').toLowerCase() === 'compile_ready';
      });
      const rows = compileReady.concat(data.compiled || []);
      if (countEl) countEl.textContent = String(rows.length);

      const fakePanel = {
        querySelector: (sel) => {
          if (sel === '.intake-queue-rows') return rowsEl;
          if (sel === '.intake-queue-empty') return emptyEl;
          return null;
        },
      };
      // isTerminal=false → keep action buttons (Compiled/Emailed/Reject)
      renderIqPanel(fakePanel, rows, false);
    } catch (e) {
      console.error('[renderCompileQueueSection] Failed:', e);
      if (rowsEl)  rowsEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden   = false;
      if (countEl) countEl.textContent = '0';
    } finally {
      if (loadEl) loadEl.hidden = true;
    }
  }

  /**
   * Render Delivered sidebar page using fetchIntakeQueue().emailed.
   * Terminal stage → no action buttons (matches the Emailed tab inside intake).
   */
  async function renderDeliveredSection() {
    const wrapEl   = document.getElementById('deliveredSectionWrap');
    const rowsEl   = document.getElementById('deliveredSectionRows');
    const emptyEl  = document.getElementById('deliveredSectionEmpty');
    const countEl  = document.getElementById('deliveredSectionCount');
    const loadEl   = document.getElementById('deliveredSectionLoading');
    if (!wrapEl || !rowsEl) return;

    if (loadEl) loadEl.hidden = false;
    try {
      const data = await fetchIntakeQueue();
      const rows = data.emailed || [];
      if (countEl) countEl.textContent = String(rows.length);

      const fakePanel = {
        querySelector: (sel) => {
          if (sel === '.intake-queue-rows') return rowsEl;
          if (sel === '.intake-queue-empty') return emptyEl;
          return null;
        },
      };
      // isTerminal=true → no action buttons (delivered is final)
      renderIqPanel(fakePanel, rows, true);
    } catch (e) {
      console.error('[renderDeliveredSection] Failed:', e);
      if (rowsEl)  rowsEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden   = false;
      if (countEl) countEl.textContent = '0';
    } finally {
      if (loadEl) loadEl.hidden = true;
    }
  }

  /**
   * Wire the three Refresh buttons + delegated action clicks (Compiled /
   * Emailed / Reject) on the matched & compile sidebar pages.  Reuses the
   * same intakeSetStatus() function the intake queue already uses.
   */
  function bindSidebarSectionPages() {
    const matchedRefresh   = document.getElementById('matchedSectionRefresh');
    const compileRefresh   = document.getElementById('compileSectionRefresh');
    const deliveredRefresh = document.getElementById('deliveredSectionRefresh');
    if (matchedRefresh)   matchedRefresh.addEventListener('click',   () => renderMatchedAccountsSection());
    if (compileRefresh)   compileRefresh.addEventListener('click',   () => renderCompileQueueSection());
    if (deliveredRefresh) deliveredRefresh.addEventListener('click', () => renderDeliveredSection());

    // Phase 16.6 — bind the diagnostic modal close/resend/remove handlers once.
    if (typeof _bindIqInfoModal === 'function') _bindIqInfoModal();

    // Phase 16.7 Issue 1 — kick off the per-minute countdown ticker.
    if (typeof _startWaitingCountdownTicker === 'function') _startWaitingCountdownTicker();

    // Action-button delegation — reuses same data-iq-action contract as the
    // intake queue, so intakeSetStatus() does the actual write.
    const matchedRows   = document.getElementById('matchedSectionRows');
    const compileRows   = document.getElementById('compileSectionRows');
    const deliveredRows = document.getElementById('deliveredSectionRows');
    [matchedRows, compileRows, deliveredRows].forEach(rowsEl => {
      if (!rowsEl) return;
      rowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-iq-action]');
        if (!btn) return;
        const action = btn.dataset.iqAction;
        const id     = btn.dataset.iqId;
        if (!action || !id) return;
        btn.disabled = true;
        try {
          /* Phase 16.4 Issue 6 — RESEND is NOT a status transition; route to its own handler */
          if (action === 'resend') {
            const acct  = btn.dataset.iqAcct  || '';
            const email = btn.dataset.iqEmail || '';
            const ok = await _requestResend(id, acct, email);
            if (ok) {
              showToast('Resend queued for ' + acct + ' → ' + email + '. Engine will pick it up on the next tick.', 'success', 5000);
              // Refresh Delivered + Compile so the resend counter shows
              if (rowsEl.id === 'compileSectionRows') renderCompileQueueSection();
              renderDeliveredSection();
            }
            return;
          }
          /* Phase 16.6 — INFO button opens the diagnostic modal (no status change). */
          if (action === 'info') {
            const acct = btn.dataset.iqAcct || '';
            await _openIqInfoModal(id, acct);
            return;
          }
          const ok = await intakeSetStatus(id, action);
          if (ok) {
            showToast(`Status updated to "${action}".`, 'success', 2500);
            // Re-render whichever section the button was on
            if (rowsEl.id === 'matchedSectionRows') renderMatchedAccountsSection();
            if (rowsEl.id === 'compileSectionRows') renderCompileQueueSection();
            renderDeliveredSection();   // Delivered may have gained a row
          }
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  /* ─── _requestResend — Phase 16.4 Issue 6 ─────────────────────
   *
   * Inserts a row into `resend_requests` (Supabase) and bumps
   * `license_requests.resend_count` + `last_resend_at`.  The PowerShell
   * engine STEP 2.6 (added in master_engine.ps1 patch) picks up any
   * resend_requests rows with status='pending' and re-runs the EX5
   * package + Gmail SMTP send for each, then PATCHes status='consumed'.
   *
   * REQUIRED Supabase SQL (run once in SQL editor):
   *   CREATE TABLE IF NOT EXISTS resend_requests (
   *     id              BIGSERIAL PRIMARY KEY,
   *     license_request_id UUID,
   *     account_number  TEXT NOT NULL,
   *     recipient_email TEXT,
   *     requested_by    TEXT,
   *     status          TEXT NOT NULL DEFAULT 'pending',
   *     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
   *     consumed_at     TIMESTAMPTZ
   *   );
   *   ALTER TABLE license_requests
   *     ADD COLUMN IF NOT EXISTS resend_count   INTEGER NOT NULL DEFAULT 0,
   *     ADD COLUMN IF NOT EXISTS last_resend_at TIMESTAMPTZ;
   *
   * Returns true on success, false on failure (toast already shown).
   */
  async function _requestResend(licenseRequestId, accountNumber, recipientEmail) {
    if (!supabaseClient || !DataLayer.isLive) {
      showToast('Resend unavailable — Supabase is not live.', 'error', 4000);
      return false;
    }
    try {
      // 1) Insert into resend_requests audit table
      const insResp = await supabaseClient
        .from('resend_requests')
        .insert([{
          license_request_id: licenseRequestId,
          account_number:     String(accountNumber || ''),
          recipient_email:    String(recipientEmail || ''),
          requested_by:       'dashboard',
          status:             'pending',
        }])
        .select('id, created_at');
      if (insResp.error) {
        const code = insResp.error.code ? ' [' + insResp.error.code + ']' : '';
        const msg  = insResp.error.message || 'unknown error';
        console.error('[Resend] resend_requests insert failed:', insResp.error);
        if (insResp.error.code === 'PGRST205' || /relation .* does not exist/i.test(msg)) {
          showToast('Resend table missing — run the SQL in _requestResend() comment. See console.', 'error', 9000);
        } else {
          showToast('Resend insert failed: ' + msg + code, 'error', 7000);
        }
        return false;
      }
      // 2) Bump resend_count + last_resend_at on the license_requests row.
      //    Read current count first, then write count+1 (Supabase JS has no atomic increment).
      try {
        const { data: cur } = await supabaseClient
          .from('license_requests')
          .select('resend_count')
          .eq('id', licenseRequestId)
          .limit(1);
        const currentCount = (cur && cur[0] && typeof cur[0].resend_count === 'number')
          ? cur[0].resend_count : 0;
        await supabaseClient
          .from('license_requests')
          .update({
            resend_count:   currentCount + 1,
            last_resend_at: new Date().toISOString(),
          })
          .eq('id', licenseRequestId);
      } catch (e) {
        console.warn('[Resend] resend_count bump failed (non-fatal — audit row was created):', e);
      }
      // 3) Trigger the engine so the resend goes out at the next tick.
      try {
        await supabaseClient
          .from('engine_triggers')
          .insert([{ status: 'pending', requested_by: 'resend:' + accountNumber }]);
      } catch (e) {
        console.warn('[Resend] engine_triggers nudge failed (non-fatal):', e);
      }
      return true;
    } catch (e) {
      console.error('[Resend] exception:', e);
      showToast('Resend exception: ' + (e.message || e), 'error', 5000);
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Phase 16.6 — Compile Queue row diagnostic modal
     ───────────────────────────────────────────────────────────
     Universal "ⓘ" button on every Matched / Compile / Delivered
     row opens this modal.  The modal answers, for one specific
     license_requests id:

       1. Why is this row stuck here?  (current status + reason)
       2. Has the SAME account already been delivered through a
          prior request_id?  (cross-account duplicate check)
       3. Full delivery history (delivered_at, resend_count,
          last_resend_at, recipient)
       4. Compile / delivery failure reason if status='rejected'
          or notes carry a failure marker
       5. Resend action (same as inline RESEND, for convenience)
       6. Remove from Queue — flips status to 'rejected' so the
          engine + dashboard both drop it from active pipelines.
                                                                     */

  let _iqInfoActive = null;   // holds { id, acct } while the modal is open

  async function _openIqInfoModal(licenseRequestId, account) {
    const overlay = document.getElementById('iqInfoOverlay');
    if (!overlay) {
      console.warn('[iqInfo] modal overlay missing');
      return;
    }
    _iqInfoActive = { id: licenseRequestId, acct: account };
    overlay.hidden = false;

    const $ = (id) => document.getElementById(id);
    $('iqInfoLoading').hidden = false;
    $('iqInfoBody').hidden    = true;
    $('iqInfoError').hidden   = true;
    $('iqInfoDuplicateSection').hidden = true;
    $('iqInfoFailureSection').hidden   = true;
    $('iqInfoResendBtn').hidden        = true;
    $('iqInfoRemoveBtn').disabled      = false;
    // Phase 16.7 Issue 3 — hide retry-pool sections by default; populated below if applicable
    if ($('iqInfoRetrySection'))    $('iqInfoRetrySection').hidden    = true;
    if ($('iqInfoAttemptsSection')) $('iqInfoAttemptsSection').hidden = true;
    if ($('iqInfoRecoverySection')) $('iqInfoRecoverySection').hidden = true;

    try {
      // 1) Fetch the row itself.  We only pull base columns so this never
      //    400s on tenants whose schema is missing optional resend/delivery cols.
      let row = null;
      if (supabaseClient && DataLayer.isLive) {
        try {
          const baseSel = await supabaseClient
            .from('license_requests')
            .select('id, account_number, email, status, broker_name, created_at')
            .eq('id', licenseRequestId)
            .limit(1);
          if (!baseSel.error && baseSel.data && baseSel.data[0]) row = baseSel.data[0];
        } catch (e) {
          console.warn('[iqInfo] base select failed:', e);
        }
        // Try optional columns separately; ignore failures.
        if (row) {
          try {
            const optSel = await supabaseClient
              .from('license_requests')
              .select('resend_count, last_resend_at, delivered_at, notes')
              .eq('id', licenseRequestId)
              .limit(1);
            if (!optSel.error && optSel.data && optSel.data[0]) Object.assign(row, optSel.data[0]);
          } catch (_) { /* optional columns may not exist */ }
        }
      }
      if (!row) {
        // Fall back to in-memory CrmStore / State.requests
        const inMem = (Array.isArray(State.requests) ? State.requests : [])
          .find(x => String(x.id) === String(licenseRequestId));
        if (inMem) {
          row = {
            id:             inMem.id,
            account_number: inMem.account,
            email:          inMem.email,
            status:         inMem.dbStatus || inMem.status,
            broker_name:    inMem.broker,
            created_at:     inMem.createdAt || null,
          };
        }
      }
      if (!row) {
        $('iqInfoLoading').hidden = true;
        $('iqInfoError').hidden   = false;
        $('iqInfoError').textContent = 'Row not found. It may have been deleted.';
        return;
      }

      // 2) Identity + current state
      $('iqInfoAcct').textContent      = row.account_number || account || '—';
      $('iqInfoEmail').textContent     = row.email || '—';
      $('iqInfoBroker').textContent    = row.broker_name || '—';
      $('iqInfoId').textContent        = row.id || '—';
      $('iqInfoSubmitted').textContent = row.created_at ? fmtDateTime(row.created_at) : '—';
      $('iqInfoStatus').textContent    = row.status || '—';

      // 3) Reason text — same vocabulary the inline labels use, plus extras
      const s = String(row.status || '').toLowerCase();
      let reason;
      if (s === 'pending')        reason = 'Waiting for the next broker file to match this account.';
      else if (s === 'matched' || s === 'approved')
                                  reason = 'Awaiting Compile — engine STEP 6 will pick it up on the next 15-minute tick (or click Run Now).';
      else if (s === 'compile_ready') reason = 'Ready to Compile — engine STEP 5/6 will stage + compile the MQ5 on the next tick.';
      else if (s === 'compiling')     reason = 'Compile in progress — engine has staged the MQ5; wait for next tick to complete.';
      else if (s === 'compiled')      reason = 'Ready to Send — EX5 is built; engine STEP 7 will email it on the next tick. You can also click RESEND.';
      else if (s === 'emailed' || s === 'delivered') {
        reason = 'Successfully delivered. Use RESEND only if the client did not receive the email.';
      } else if (s === 'rejected') reason = 'Rejected by admin or engine. See Failure section below for the captured reason.';
      else if (s === 'unmatched')  reason = 'Account was absent from the last broker file beyond the retry window. Final not_found email sent.';
      else if (s === 'ib_changed') reason = 'Account is in ib_changed_accounts — delivery blocked. The client is no longer under our IB referral.';
      else                         reason = 'Unknown status — check engine logs.';
      $('iqInfoReason').textContent = reason;

      // 4) Delivery history
      $('iqInfoDeliveredAt').textContent = row.delivered_at ? fmtDateTime(row.delivered_at)
                                          : (s === 'emailed' || s === 'delivered') ? fmtDateTime(row.created_at) + ' (approx — delivered_at column not populated)'
                                          : 'Not delivered yet';
      $('iqInfoRecipient').textContent    = row.email || '—';
      $('iqInfoResendCount').textContent  = (row.resend_count != null) ? String(row.resend_count) : '0';
      $('iqInfoLastResend').textContent   = row.last_resend_at ? fmtDateTime(row.last_resend_at) : 'Never resent';

      // 5) Cross-account duplicate check.  If the row's account_number has
      //    EVER been delivered through a different license_requests id, surface
      //    that fact so the admin knows the file already went out.
      if (supabaseClient && DataLayer.isLive && row.account_number) {
        try {
          const dupResp = await supabaseClient
            .from('license_requests')
            .select('id, status, email, created_at')
            .eq('account_number', row.account_number)
            .in('status', ['emailed', 'delivered'])
            .order('created_at', { ascending: false })
            .limit(3);
          if (!dupResp.error && dupResp.data && dupResp.data.length > 0) {
            const others = dupResp.data.filter(x => String(x.id) !== String(row.id));
            if (others.length > 0) {
              const first = others[0];
              const noteHtml =
                'This account already has <strong>' + others.length + '</strong> earlier ' +
                (others.length === 1 ? 'delivery' : 'deliveries') + ' on record. Most recent: ' +
                '<strong>' + fmtDateTime(first.created_at) + '</strong>' +
                (first.email ? ' → <code>' + esc(first.email) + '</code>' : '') +
                '. If this is a duplicate submission, use <strong>Remove from Queue</strong> below.';
              $('iqInfoDuplicateNote').innerHTML = noteHtml;
              $('iqInfoDuplicateSection').hidden = false;
            }
          }
        } catch (e) {
          console.warn('[iqInfo] duplicate check failed (non-fatal):', e);
        }
      }

      // 6) Failure reason if any
      const failureText = row.notes || row.failure_reason || row.reject_reason;
      if (s === 'rejected' || s === 'unmatched' || s === 'ib_changed' || failureText) {
        $('iqInfoFailureNote').textContent = failureText || (
          s === 'ib_changed' ? 'Account moved away from ZTU referral network.' :
          s === 'unmatched'  ? 'Account never appeared in any broker file within the 48-hour retry window.' :
          'No failure reason captured. Check engine logs (logs\\master_engine_*.log) for stack traces.'
        );
        $('iqInfoFailureSection').hidden = false;
      }

      // 7) Actions — Resend visible only on compiled / emailed / delivered
      if (['compiled', 'emailed', 'delivered'].includes(s)) {
        $('iqInfoResendBtn').hidden = false;
      }

      // 8) Phase 16.7 Issue 3 — if a RetryPool entry exists for this id,
      //    populate the Request Timeline / Match Attempts / Recovery Status
      //    sections so the admin sees the full lifecycle of the retry.
      try {
        const poolEntry = (typeof RetryPool !== 'undefined' && RetryPool)
          ? RetryPool.getById(licenseRequestId)
          : null;
        if (poolEntry) {
          const submittedIso = poolEntry.firstMissedAt ? new Date(poolEntry.firstMissedAt).toISOString() : null;
          const expiresMs    = poolEntry.firstMissedAt + RETRY_POOL_MAX_DAYS * RETRY_POOL_DAY_MS;
          const archivedMs   = poolEntry.archivedAt || (poolEntry.archived ? expiresMs : null);
          const isExpired    = RetryPool.isExpired(poolEntry);

          $('iqInfoRetrySubmitted').textContent = row.created_at ? fmtDateTime(row.created_at) : (submittedIso ? fmtDateTime(submittedIso) : '—');
          $('iqInfoRetryStarted').textContent   = submittedIso ? fmtDateTime(submittedIso) : '—';
          $('iqInfoRetryExpires').textContent   = expiresMs ? fmtDateTime(new Date(expiresMs).toISOString()) : '—';
          if (poolEntry.recoveredAt) {
            $('iqInfoRetryWindow').textContent = 'Recovered (un-archived ' + fmtDateTime(new Date(poolEntry.recoveredAt).toISOString()) + ')';
          } else if (isExpired || poolEntry.archived) {
            $('iqInfoRetryWindow').textContent = 'Expired — 48h retry window ended ' + (archivedMs ? fmtDateTime(new Date(archivedMs).toISOString()) : '');
          } else {
            $('iqInfoRetryWindow').textContent = RetryPool.formatCountdown(poolEntry);
          }
          $('iqInfoRetrySection').hidden = false;

          $('iqInfoAttemptsCount').textContent = String(poolEntry.retryCount || 0);
          $('iqInfoAttemptsLast').textContent  = poolEntry.lastChecked ? fmtDateTime(new Date(poolEntry.lastChecked).toISOString()) : 'Never';
          $('iqInfoAttemptsFiles').textContent = 'Cross-checked against every broker file uploaded since submission (' + (poolEntry.retryCount || 0) + ' file scan(s) performed).';
          $('iqInfoAttemptsSection').hidden = false;

          if (poolEntry.recoveredAt) {
            $('iqInfoRecoveryNote').innerHTML =
              '<strong>Recovered Match Found Later.</strong> This account was previously in the Not Found pool and was auto-recovered into the matched pipeline on ' +
              '<strong>' + fmtDateTime(new Date(poolEntry.recoveredAt).toISOString()) + '</strong>.';
            $('iqInfoRecoverySection').hidden = false;
          }

          // Override the generic "Why stuck" line with a more specific
          // failure-reason taxonomy for archived (not-found) rows.
          if ((isExpired || poolEntry.archived) && !poolEntry.recoveredAt) {
            $('iqInfoReason').textContent = 'Account not found in any broker report uploaded during the 48-hour retry window. Likely causes: (1) account not opened via our IB referral link, (2) wrong broker selected at submission, (3) registration not completed, (4) account exists but under a different IB, (5) typo in account number.';
          }
        }
      } catch (e) {
        console.warn('[iqInfo] retry-pool section population failed (non-fatal):', e);
      }

      $('iqInfoLoading').hidden = true;
      $('iqInfoBody').hidden    = false;
    } catch (e) {
      console.error('[iqInfo] open failed:', e);
      $('iqInfoLoading').hidden = true;
      $('iqInfoError').hidden   = false;
      $('iqInfoError').textContent = 'Failed to load row diagnostics: ' + (e.message || e);
    }
  }

  function _closeIqInfoModal() {
    const overlay = document.getElementById('iqInfoOverlay');
    if (overlay) overlay.hidden = true;
    _iqInfoActive = null;
  }

  /* Remove from Queue — flip status to 'rejected' so engine + dashboard
   * both drop it from active pipelines.  Audit trail is preserved: the row
   * stays in license_requests with status='rejected' and shows on the
   * Rejected tab.  Reversible via the standard intake actions. */
  async function _removeFromQueue(licenseRequestId, account) {
    if (!supabaseClient || !DataLayer.isLive) {
      showToast('Cannot remove — Supabase not live.', 'error', 4000);
      return false;
    }
    try {
      const upd = await supabaseClient
        .from('license_requests')
        .update({ status: 'rejected' })
        .eq('id', licenseRequestId);
      if (upd.error) {
        console.error('[iqInfo] remove failed:', upd.error);
        showToast('Remove failed: ' + (upd.error.message || 'unknown'), 'error', 5000);
        return false;
      }
      showToast('Removed from queue (status → rejected) for ' + (account || licenseRequestId), 'success', 4000);
      return true;
    } catch (e) {
      console.error('[iqInfo] remove exception:', e);
      showToast('Remove exception: ' + (e.message || e), 'error', 5000);
      return false;
    }
  }

  /* Bind the modal's own buttons (close / resend / remove) ONCE on init.
   * Called from the existing bindSidebarSectionPages() wiring. */
  function _bindIqInfoModal() {
    const overlay = document.getElementById('iqInfoOverlay');
    if (!overlay || overlay.dataset.bound === '1') return;
    overlay.dataset.bound = '1';

    document.getElementById('iqInfoClose')   ?.addEventListener('click', _closeIqInfoModal);
    document.getElementById('iqInfoCloseBtn')?.addEventListener('click', _closeIqInfoModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _closeIqInfoModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) _closeIqInfoModal();
    });

    document.getElementById('iqInfoResendBtn')?.addEventListener('click', async () => {
      if (!_iqInfoActive) return;
      const btn = document.getElementById('iqInfoResendBtn');
      const email = document.getElementById('iqInfoEmail').textContent || '';
      btn.disabled = true;
      try {
        const ok = await _requestResend(_iqInfoActive.id, _iqInfoActive.acct, email);
        if (ok) {
          showToast('Resend queued from diagnostics modal.', 'success', 4000);
          _closeIqInfoModal();
          if (typeof renderCompileQueueSection === 'function') renderCompileQueueSection();
          if (typeof renderDeliveredSection    === 'function') renderDeliveredSection();
        }
      } finally { btn.disabled = false; }
    });

    document.getElementById('iqInfoRemoveBtn')?.addEventListener('click', async () => {
      if (!_iqInfoActive) return;
      const confirmed = window.confirm(
        'Remove this row from the queue?\n\n' +
        'Account: ' + _iqInfoActive.acct + '\n' +
        'Request ID: ' + _iqInfoActive.id + '\n\n' +
        'Status will be set to "rejected". The row remains visible on the Rejected tab and can be re-opened from there.'
      );
      if (!confirmed) return;
      const btn = document.getElementById('iqInfoRemoveBtn');
      btn.disabled = true;
      const ok = await _removeFromQueue(_iqInfoActive.id, _iqInfoActive.acct);
      btn.disabled = false;
      if (ok) {
        _closeIqInfoModal();
        if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
        if (typeof renderCompileQueueSection    === 'function') renderCompileQueueSection();
        if (typeof renderDeliveredSection       === 'function') renderDeliveredSection();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     PHASE 15.6 — PHASE B (Tasks 3 + 6)
     ───────────────────────────────────────────────────────────
     IB Stars Engine (Active / Inactive activity tracking)
     IB Changed Accounts (access revocation + auto-detect)

     Broker file mappings (confirmed by user):
       account column        : 'client_account'
       activity date column  : 'client_account_last_trade'
       partner code column   : 'partner_code'
       OUR VALID PARTNER CODE: '5dogk171n8'

     ╔════════════════════════════════════════════════════════════╗
     ║  REQUIRED SUPABASE MIGRATION — run once in SQL editor      ║
     ╠════════════════════════════════════════════════════════════╣
     CREATE TABLE IF NOT EXISTS ib_changed_accounts (
       id                 BIGSERIAL PRIMARY KEY,
       account_number     TEXT NOT NULL UNIQUE,
       email              TEXT,
       whatsapp           TEXT,
       broker             TEXT,
       join_date          DATE,
       ib_changed_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
       last_active_date   DATE,
       revenue_total      NUMERIC,
       engagement_days    INTEGER,
       detection_source   TEXT CHECK (detection_source IN ('manual','broker_file_auto')),
       partner_code_seen  TEXT,
       notes              TEXT,
       created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS ib_changed_lookup
       ON ib_changed_accounts (account_number, email);

     ALTER TABLE ib_changed_accounts ENABLE ROW LEVEL SECURITY;
     CREATE POLICY ib_changed_anon_read   ON ib_changed_accounts
       FOR SELECT TO anon USING (true);
     CREATE POLICY ib_changed_anon_insert ON ib_changed_accounts
       FOR INSERT TO anon WITH CHECK (true);
     CREATE POLICY ib_changed_anon_update ON ib_changed_accounts
       FOR UPDATE TO anon USING (true) WITH CHECK (true);
     ╚════════════════════════════════════════════════════════════╝
  ══════════════════════════════════════════════════════════ */

  const IB_CFG = {
    OUR_PARTNER_CODE:  '5dogk171n8',
    ACCOUNT_COL:       'client_account',
    LAST_TRADE_COL:    'client_account_last_trade',
    PARTNER_CODE_COL:  'partner_code',
    ACTIVE_DAYS:       30,
    STORE_KEY:         'ZTU_IB_STARS_ACTIVITY_V1',
    IB_CHANGED_TABLE:  'ib_changed_accounts',
    // Phase 16
    BROKER_ACCOUNTS_TABLE: 'broker_accounts',
    BROKER_ACCOUNTS_BATCH: 500,
  };

  /* ─── Phase 16 — column candidates for broker file → broker_accounts ─ */
  const BA_COL_CANDIDATES = {
    email:         ['client_email', 'email'],
    whatsapp:      ['client_phone', 'whatsapp', 'phone'],
    broker:        ['broker', 'broker_name'],
    partner_code:  ['partner_code'],
    last_trade:    ['client_account_last_trade', 'last_trade', 'last_trade_date'],
    created_at:    ['client_account_creation_date', 'account_created_at', 'creation_date'],
    account_type:  ['client_account_type', 'account_type', 'type'],
    country:       ['client_country', 'country'],
    platform:      ['client_account_platform', 'platform'],
    reward:        ['client_reward_usd', 'commission', 'reward'],
    volume_lots:   ['client_volume_lots', 'volume_lots', 'lots'],
    volume_usd:    ['client_volume_usd', 'volume_usd'],
  };

  function _pickBaColumn(columns, candidates) {
    const lower = columns.map(c => String(c).toLowerCase().trim());
    for (const cand of candidates) {
      const idx = lower.indexOf(cand.toLowerCase());
      if (idx !== -1) return columns[idx];
    }
    return null;
  }

  function _isoDateOrNull(raw) {
    const d = _parseLastTrade(raw);
    return d ? d.toISOString().slice(0, 10) : null;
  }

  function _numOrNull(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = parseFloat(String(raw).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  /* ─── _persistBrokerAccounts — Phase 16 upsert into Supabase ──── */
  /*
   * Mirrors the broker file rows to the Supabase `broker_accounts` table.
   * Idempotent — uses ON CONFLICT(account_number) so re-running the same
   * broker file simply refreshes the row's values.  CrmStore localStorage
   * write continues to happen alongside this (preserved as fast cache).
   * Chunks rows into batches of BROKER_ACCOUNTS_BATCH to keep payloads safe.
   *
   * Returns: { upserted: number, errors: number }
   */
  async function _persistBrokerAccounts(rows, columns, sourceFileName) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { upserted: 0, errors: 0 };
    }
    if (!supabaseClient) {
      console.warn('[Phase16] Supabase client not initialised — broker_accounts upsert skipped');
      return { upserted: 0, errors: 0 };
    }

    // Resolve column names once.
    const acctCol = IB_CFG.ACCOUNT_COL;
    const map = {};
    for (const [field, cands] of Object.entries(BA_COL_CANDIDATES)) {
      map[field] = _pickBaColumn(columns, cands);
    }

    /* ╔══════════════════════════════════════════════════════════════════╗
       ║  Phase 17A FINAL — IB STARS ACTIVE = TRADE ACTIVITY ONLY         ║
       ║  ────────────────────────────────────────────────────────────────║
       ║  Business rule (ONLY source of truth):                            ║
       ║    ib_star_status = 'active'    IFF  last_trade_date is within    ║
       ║                                      IB_CFG.ACTIVE_DAYS (30 d).   ║
       ║    ib_star_status = 'inactive'  IFF  last_trade_date is older.    ║
       ║    ib_star_status = NULL        IFF  no last_trade_date at all.   ║
       ║                                                                   ║
       ║  Email is NOT a classification input.  Delivery is NOT a          ║
       ║  classification input.  Email enrichment from license_requests is ║
       ║  still done so the Library OTP gate has a destination, but it     ║
       ║  cannot change ib_star_status.                                    ║
       ╚══════════════════════════════════════════════════════════════════╝ */
    const ACTIVE_WINDOW_MS = IB_CFG.ACTIVE_DAYS * 86_400_000;

    function _ibStarStatusFromTrade(lastTradeIso) {
      if (!lastTradeIso) return null;
      const ms = new Date(lastTradeIso).getTime();
      if (isNaN(ms)) return null;
      return (Date.now() - ms) <= ACTIVE_WINDOW_MS ? 'active' : 'inactive';
    }

    // Build an email/whatsapp lookup from license_requests purely for the
    // Library OTP gate (broker reports usually omit the email column).
    // This DOES NOT influence ib_star_status.
    const _contactByAccount = new Map();
    try {
      const reqs = (typeof State !== 'undefined' && State && Array.isArray(State.requests))
        ? State.requests : [];
      for (const r of reqs) {
        if (!r || !r.account) continue;
        const key = normalizeAccountId(r.account);
        if (!key) continue;
        if (_contactByAccount.has(key)) continue;
        const email = r.email ? String(r.email).trim() : null;
        const wa    = r.whatsapp ? String(r.whatsapp).trim() : null;
        if (email || wa) _contactByAccount.set(key, { email, whatsapp: wa });
      }
    } catch (_) { /* non-fatal */ }

    const byAccount = new Map();
    for (const row of rows) {
      const acct = normalizeAccountId(row[acctCol]);
      if (!acct) continue;
      const lastTradeIso = map.last_trade ? _isoDateOrNull(row[map.last_trade]) : null;

      // Email + WhatsApp enrichment (display-only; does not gate ib_star_status)
      const fileEmail = map.email    ? (row[map.email]    || null) : null;
      const fileWa    = map.whatsapp ? (row[map.whatsapp] || null) : null;
      const contact   = _contactByAccount.get(acct) || null;
      const finalEmail = fileEmail || (contact ? contact.email    : null);
      const finalWa    = fileWa    || (contact ? contact.whatsapp : null);

      const payload = {
        account_number:     acct,
        email:              finalEmail,
        whatsapp:           finalWa,
        broker:             map.broker       ? (row[map.broker]       || null) : null,
        partner_code:       map.partner_code ? (row[map.partner_code] || null) : null,
        last_trade_date:    lastTradeIso,
        account_created_at: map.created_at   ? _isoDateOrNull(row[map.created_at])   : null,
        account_type:       map.account_type ? (row[map.account_type] || null) : null,
        country:            map.country      ? (row[map.country]      || null) : null,
        platform:           map.platform     ? (row[map.platform]     || null) : null,
        revenue_total:      map.reward       ? _numOrNull(row[map.reward])      : null,
        volume_lots:        map.volume_lots  ? _numOrNull(row[map.volume_lots]) : null,
        volume_usd:         map.volume_usd   ? _numOrNull(row[map.volume_usd])  : null,
        ib_star_status:     _ibStarStatusFromTrade(lastTradeIso),   // Phase 17A FINAL
        source_file:        sourceFileName || null,
        updated_at:         new Date().toISOString(),
      };
      // Last write wins inside the same file (broker reports occasionally
      // contain multiple rows per account at different timestamps).
      byAccount.set(acct, payload);
    }
    const allPayloads = Array.from(byAccount.values());
    if (allPayloads.length === 0) return { upserted: 0, errors: 0 };

    let upserted = 0;
    let errors   = 0;
    for (let i = 0; i < allPayloads.length; i += IB_CFG.BROKER_ACCOUNTS_BATCH) {
      const chunk = allPayloads.slice(i, i + IB_CFG.BROKER_ACCOUNTS_BATCH);
      try {
        const { data, error } = await supabaseClient
          .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
          .upsert(chunk, { onConflict: 'account_number' })
          .select('account_number');
        if (error) {
          errors++;
          console.error('[Phase16] broker_accounts upsert chunk failed:', {
            code: error.code, message: error.message, details: error.details, hint: error.hint,
          });
        } else {
          upserted += (data || []).length;
        }
      } catch (e) {
        errors++;
        console.error('[Phase16] broker_accounts upsert exception:', e);
      }
    }
    console.log(`[Phase16] broker_accounts: upserted ${upserted} / ${allPayloads.length} row(s) | errors: ${errors}`);
    return { upserted, errors };
  }

  /* ─── _fetchBrokerAccountsByStatus — Phase 16 IB Stars Supabase query ── */
  async function _fetchBrokerAccountsByStatus(statusFilter, limit) {
    if (!supabaseClient) return [];
    const max = limit || 2000;
    try {
      const { data, error } = await supabaseClient
        .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
        .select('account_number, email, whatsapp, broker, partner_code, last_trade_date, ib_star_status, updated_at')
        .eq('ib_star_status', statusFilter)
        .order('last_trade_date', { ascending: false })
        .limit(max);
      if (error) {
        console.warn(`[Phase16] broker_accounts fetch (${statusFilter}) failed:`, error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn(`[Phase16] broker_accounts fetch (${statusFilter}) exception:`, e);
      return [];
    }
  }

  // In-memory cache of currently-IB-changed account numbers.  Populated
  // on first read; refreshed on insert + on intake hook.
  let _ibChangedSet     = null;
  let _ibChangedRowsCache = [];

  /* ─── _parseLastTrade — robust date parsing for broker files ── */
  function _parseLastTrade(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    // SheetJS gives JS Date sometimes, strings other times.
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    const s = String(raw).trim();
    if (!s) return null;
    // Accept ISO + common shapes (YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY).
    const tryNative = new Date(s);
    if (!isNaN(tryNative.getTime())) return tryNative;
    const m = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1]);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════
     IB STARS — activity store + render
  ══════════════════════════════════════════════════════════ */
  const IbStars = {
    _data: null,

    load() {
      if (this._data) return this._data;
      try {
        const raw = window.localStorage.getItem(IB_CFG.STORE_KEY);
        this._data = raw ? JSON.parse(raw) : { version: 1, accounts: {} };
      } catch (e) {
        this._data = { version: 1, accounts: {} };
      }
      if (!this._data.accounts) this._data.accounts = {};
      return this._data;
    },

    save() {
      try { window.localStorage.setItem(IB_CFG.STORE_KEY, JSON.stringify(this._data)); }
      catch (e) { console.warn('[IbStars] save failed:', e); }
    },

    /* Update from broker file rows. Returns {newActive, newInactive,
       transitionsToInactive[]} so the caller can enqueue notifications.
       Phase 17A FINAL — classification is trade-activity ONLY (d ≤ 30 d).
       Email is captured for display from State.requests when available, but
       is never a classification input. */
    updateFromBrokerRows(rows, columns) {
      this.load();
      const data = this._data.accounts;
      const cols = (columns || []).map(c => String(c).toLowerCase());
      const acctCol  = columns[cols.indexOf(IB_CFG.ACCOUNT_COL)]      || IB_CFG.ACCOUNT_COL;
      const lastCol  = columns[cols.indexOf(IB_CFG.LAST_TRADE_COL)]   || IB_CFG.LAST_TRADE_COL;
      const partCol  = columns[cols.indexOf(IB_CFG.PARTNER_CODE_COL)] || IB_CFG.PARTNER_CODE_COL;
      const now      = Date.now();
      const ACTIVE_MS = IB_CFG.ACTIVE_DAYS * 86_400_000;

      // Optional email enrichment for display (not for classification).
      const emailByAccount = {};
      try {
        const reqs = (typeof State !== 'undefined' && State && Array.isArray(State.requests))
          ? State.requests : [];
        for (const r of reqs) {
          if (!r || !r.account || !r.email) continue;
          const k = normalizeAccountId(r.account);
          if (k && !emailByAccount[k]) emailByAccount[k] = String(r.email).trim();
        }
      } catch (_) { /* non-fatal */ }

      const transitionsToInactive = [];
      const transitionsToActive   = [];
      let touched = 0;

      (rows || []).forEach(row => {
        const acct = normalizeAccountId(row[acctCol]);
        if (!acct) return;
        const lastTradeDate = _parseLastTrade(row[lastCol]);
        const partnerCode   = row[partCol] ? String(row[partCol]).trim() : '';

        const prev   = data[acct] || null;
        const wasActive = prev ? prev.classification === 'active' : null;

        const lastTradeMs = lastTradeDate ? lastTradeDate.getTime() : (prev && prev.lastTradeMs) || null;
        const sinceLastTrade = lastTradeMs ? (now - lastTradeMs) : null;
        // Phase 17A FINAL — pure trade-activity check.  Email NOT considered.
        const isActive = sinceLastTrade !== null && sinceLastTrade <= ACTIVE_MS;

        const updated = {
          account:         acct,
          email:           emailByAccount[acct] || (prev && prev.email) || null,
          lastTradeMs,
          lastTradeISO:    lastTradeMs ? new Date(lastTradeMs).toISOString().slice(0, 10) : null,
          partnerCode,
          firstSeenAt:     prev ? prev.firstSeenAt : now,
          lastSeenAt:      now,
          classification:  isActive ? 'active' : 'inactive',
          notifiedInactiveAt: prev ? prev.notifiedInactiveAt : null,
        };
        data[acct] = updated;
        touched++;

        // Detect Active -> Inactive transition (notify once per transition)
        if (wasActive === true && !isActive && !prev.notifiedInactiveAt) {
          transitionsToInactive.push(updated);
        }
        // Detect Inactive -> Active transition (clear notifiedInactiveAt so
        // a future inactive transition can re-notify)
        if (wasActive === false && isActive) {
          updated.notifiedInactiveAt = null;
          transitionsToActive.push(updated);
        }
      });

      this.save();
      console.log(`[IbStars] updated ${touched} account(s) | A→I: ${transitionsToInactive.length} | I→A: ${transitionsToActive.length}`);
      return { transitionsToInactive, transitionsToActive };
    },

    getActive() {
      this.load();
      return Object.values(this._data.accounts).filter(a => a.classification === 'active');
    },

    getInactive() {
      this.load();
      return Object.values(this._data.accounts).filter(a => a.classification === 'inactive');
    },

    /* Mark inactive-transition notification as sent (idempotency guard). */
    markNotified(account) {
      this.load();
      if (this._data.accounts[account]) {
        this._data.accounts[account].notifiedInactiveAt = Date.now();
        this.save();
      }
    },

    /* Clear all activity data — used by Clear Cache. */
    clearAll() {
      this._data = { version: 1, accounts: {} };
      this.save();
    },
  };

  /* ─── Notification: queue ib_inactive email + WA for transitions ─ */
  async function _enqueueIbInactiveNotifications(transitions) {
    if (!transitions || transitions.length === 0) return { email: 0, wa: 0 };
    // Look up email/whatsapp from State.requests by account number.
    const emailItems = [];
    const waItems    = [];
    transitions.forEach(t => {
      const req = State.requests.find(r => normalizeAccountId(r.account) === t.account);
      if (!req) return;
      const name = req.name || req.email || 'there';
      if (req.email) {
        emailItems.push({
          id: _autoId(),
          type: 'ib_inactive',
          account: t.account,
          email: req.email,
          subject: 'Your ZTU Access Has Been Paused (Inactivity)',
          body:
            `Hi ${name},\n\n` +
            `You have been inactive for 30+ days on your trading account ${t.account}.\n\n` +
            `Your ZTU access has been paused.\n` +
            `Once active again, access will automatically restore.\n\n` +
            `Resume trading on the same account to reactivate.\n\n` +
            `— ZTU Team`,
          request_id: req.id || null,
          status: 'queued',
          queued_at: new Date().toISOString(),
        });
      }
      if (req.whatsapp) {
        waItems.push({
          id: _autoId(),
          type: 'ib_inactive',
          account: t.account,
          email: req.email,
          whatsapp: req.whatsapp,
          message:
            `⏸ *ZTU Access Paused*\n\nHi ${name}, you've been inactive for 30+ days on account *${t.account}*. ` +
            `Your access is paused — resume trading on the same account and access will automatically restore.`,
          request_id: req.id || null,
          status: 'pending',
          queued_at: new Date().toISOString(),
        });
      }
    });

    let emailInserted = 0;
    let waInserted    = 0;
    if (emailItems.length > 0) {
      const r = await _insertEmailOutbox(emailItems);
      emailInserted = r.inserted ? r.inserted.length : 0;
    }
    if (waItems.length > 0) {
      const r = await _insertWaOutbox(waItems);
      waInserted = r.inserted ? r.inserted.length : 0;
    }
    transitions.forEach(t => IbStars.markNotified(t.account));
    console.log(`[IbStars] enqueued ${emailInserted} email + ${waInserted} WA inactive-notifications`);
    return { email: emailInserted, wa: waInserted };
  }

  /* ═══════════════════════════════════════════════════════════
     IB CHANGED — Supabase helpers + access-control set
  ══════════════════════════════════════════════════════════ */

  async function _ensureIbChangedSet() {
    if (_ibChangedSet) return _ibChangedSet;
    if (!supabaseClient) {
      _ibChangedSet = new Set();
      return _ibChangedSet;
    }
    try {
      const { data, error } = await supabaseClient
        .from(IB_CFG.IB_CHANGED_TABLE)
        .select('account_number, email, whatsapp, broker, ib_changed_date, last_active_date, detection_source, partner_code_seen, notes')
        .order('ib_changed_date', { ascending: false })
        .limit(2000);
      if (error) {
        console.warn('[IbChanged] fetch failed (table missing? run migration):', error.message);
        _ibChangedSet = new Set();
        _ibChangedRowsCache = [];
        return _ibChangedSet;
      }
      _ibChangedRowsCache = data || [];
      _ibChangedSet = new Set(_ibChangedRowsCache.map(r => normalizeAccountId(r.account_number)));
    } catch (e) {
      console.warn('[IbChanged] fetch exception:', e);
      _ibChangedSet = new Set();
      _ibChangedRowsCache = [];
    }
    return _ibChangedSet;
  }

  function _invalidateIbChangedCache() {
    _ibChangedSet = null;
    _ibChangedRowsCache = [];
  }

  async function _isAccountIbChanged(accountId) {
    const set = await _ensureIbChangedSet();
    return set.has(normalizeAccountId(accountId));
  }

  async function _insertIbChangedRow(payload) {
    if (!supabaseClient) return { ok: false, error: new Error('no supabase client') };
    try {
      const { data, error } = await supabaseClient
        .from(IB_CFG.IB_CHANGED_TABLE)
        .upsert([payload], { onConflict: 'account_number' })
        .select();
      if (error) return { ok: false, error };
      _invalidateIbChangedCache();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  /* ─── Auto-detect via broker_accounts (Supabase) ─────────────
   * Phase 16 follow-up #2 — runs WITHOUT requiring a fresh broker file
   * upload.  Drives detection from the persistent `broker_accounts`
   * table (last upload's partner_code per account is already stored
   * there).  Called automatically every time IB Changed page opens,
   * AND from inside runBrokerAutomation's existing STEP 4.6.
   *
   * Rules (any one triggers IB Changed insert):
   *   - Serviced license_request whose account_number is NOT in
   *     broker_accounts at all
   *   - Serviced license_request whose broker_accounts row has
   *     partner_code = '' / NULL
   *   - Serviced license_request whose broker_accounts row has
   *     partner_code != our valid IB code
   *
   * 'Serviced' means any post-match status, including 'emailed'.
   * Already-flagged accounts (in _ibChangedSet) are skipped.
   */
  async function _autoDetectFromBrokerAccounts() {
    if (!supabaseClient) return { inserted: 0, scanned: 0, reason: 'no supabase' };
    let brokerRows = [];
    try {
      const { data, error } = await supabaseClient
        .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
        .select('account_number, partner_code')
        .limit(20000);
      if (error) {
        console.warn('[IbChanged Supabase scan] broker_accounts fetch failed:', error.message);
        return { inserted: 0, scanned: 0, reason: error.message };
      }
      brokerRows = data || [];
    } catch (e) {
      console.warn('[IbChanged Supabase scan] exception:', e);
      return { inserted: 0, scanned: 0, reason: String(e) };
    }

    // Build account → partner_code lookup
    const codeByAcct = {};
    for (const r of brokerRows) {
      const a = normalizeAccountId(r.account_number);
      if (a) codeByAcct[a] = (r.partner_code == null) ? '' : String(r.partner_code).trim();
    }

    await _ensureIbChangedSet();
    const SERVICED = new Set(['matched','approved','compile_ready','compiled','emailed','delivered']);
    let inserted = 0, scanned = 0, missing = 0, blank = 0, wrong = 0;

    for (const req of State.requests) {
      const status = String(req.status || '').toLowerCase();
      if (!SERVICED.has(status)) continue;
      scanned++;
      const acct = normalizeAccountId(req.account);
      if (!acct) continue;
      if (_ibChangedSet.has(acct)) continue;

      let reason = null;
      let seenCode = null;
      const hasBrokerRow = Object.prototype.hasOwnProperty.call(codeByAcct, acct);

      if (!hasBrokerRow) {
        reason = 'absent from broker_accounts (no historical broker file contained this account)';
        missing++;
      } else {
        const code = codeByAcct[acct];
        if (!code) {
          reason = 'partner_code blank in broker_accounts (broker report shows no IB code)';
          seenCode = null;
          blank++;
        } else if (code !== IB_CFG.OUR_PARTNER_CODE) {
          reason = `partner_code in broker_accounts = "${code}" (expected "${IB_CFG.OUR_PARTNER_CODE}")`;
          seenCode = code;
          wrong++;
        }
      }
      if (!reason) continue;

      const activity = IbStars.load().accounts[acct];
      const payload = {
        account_number:    acct,
        email:             req.email      || null,
        whatsapp:          req.whatsapp   || null,
        broker:            req.broker     || null,
        join_date:         req.created_at ? String(req.created_at).slice(0, 10) : null,
        last_active_date:  activity && activity.lastTradeISO ? activity.lastTradeISO : null,
        detection_source:  'broker_file_auto',
        partner_code_seen: seenCode,
        notes:             'Auto-detected via broker_accounts scan: ' + reason,
      };
      const res = await _insertIbChangedRow(payload);
      if (res.ok) {
        inserted++;
        _ibChangedSet.add(acct);
        console.log(`[IbChanged Supabase scan] flagged: ${acct} (${reason})`);
      } else {
        console.warn(`[IbChanged Supabase scan] insert failed for ${acct}:`, res.error && res.error.message);
      }
    }
    console.log(`[IbChanged Supabase scan] summary — scanned: ${scanned}, missing: ${missing}, partner_code blank: ${blank}, partner_code wrong: ${wrong}, inserted: ${inserted}`);
    return { inserted, scanned, missing, blank, wrong };
  }


  /* ─── Auto-detect: scan delivered accounts for IB-changed ───
   * Phase 16 follow-up — corrected detection logic.
   *
   * Old rule (broken for real data): iterate broker file rows, flag rows
   * where partner_code is blank or wrong.  Diagnostic on actual broker
   * file (679 rows): 621 of 622 partner_code cells = our valid code,
   * zero rows have blank/wrong code.  Rule could never trigger.
   *
   * Why: clients who move IB *disappear* from your broker report — they
   * stop being listed at all.  They don't show up with a different code.
   *
   * New rule:
   *   PRIMARY  : iterate State.requests (license_requests we've serviced).
   *              For each delivered/serviced account, if it is NOT present
   *              in the latest broker file → flag as IB Changed (absence).
   *   EDGE     : also flag if account IS present but partner_code blank
   *              or != our valid code (rare in practice but still valid).
   *   GUARD    : require ≥ ACCOUNT_PRESENT_THRESHOLD rows in the current
   *              broker file to avoid false flags from a tiny/partial
   *              upload mistakenly classifying everyone as missing.
   */
  async function _autoDetectIbChanges(rows, columns) {
    if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0, skipped: 0, missing: 0, mismatch: 0 };
    const cols = (columns || []).map(c => String(c).toLowerCase());
    const acctCol = columns[cols.indexOf(IB_CFG.ACCOUNT_COL)]      || IB_CFG.ACCOUNT_COL;
    const partCol = columns[cols.indexOf(IB_CFG.PARTNER_CODE_COL)] || IB_CFG.PARTNER_CODE_COL;

    // Build presence index from the current broker file.
    const ACCOUNT_PRESENT_THRESHOLD = 50;
    const presentInFile = new Set();
    const partnerCodeByAcct = {};
    for (const row of rows) {
      const acct = normalizeAccountId(row[acctCol]);
      if (!acct) continue;
      presentInFile.add(acct);
      partnerCodeByAcct[acct] = row[partCol] ? String(row[partCol]).trim() : '';
    }
    if (presentInFile.size < ACCOUNT_PRESENT_THRESHOLD) {
      console.warn(`[IbChanged] broker file too small (${presentInFile.size} accounts < ${ACCOUNT_PRESENT_THRESHOLD}) — skipping auto-detect to avoid false flags.`);
      return { inserted: 0, skipped: 0, missing: 0, mismatch: 0 };
    }

    await _ensureIbChangedSet();
    const SERVICED = new Set(['matched','approved','compile_ready','compiled','emailed','delivered']);
    let inserted = 0, skipped = 0, missingCount = 0, mismatchCount = 0;

    // Iterate license_requests we've serviced — these are the candidates.
    for (const req of State.requests) {
      const status = String(req.status || '').toLowerCase();
      if (!SERVICED.has(status)) continue;
      const acct = normalizeAccountId(req.account);
      if (!acct) continue;
      if (_ibChangedSet.has(acct)) { skipped++; continue; }   // already flagged

      let reason = null;
      let seenCode = null;
      if (!presentInFile.has(acct)) {
        // Primary: account disappeared from broker report → moved IB.
        reason = 'absent from latest broker report';
        seenCode = null;
        missingCount++;
      } else {
        const code = partnerCodeByAcct[acct];
        if (!code || code !== IB_CFG.OUR_PARTNER_CODE) {
          // Edge: still in file but partner_code drift.
          reason = code
            ? `partner_code in latest broker file = "${code}" (expected "${IB_CFG.OUR_PARTNER_CODE}")`
            : 'partner_code blank in latest broker file';
          seenCode = code || null;
          mismatchCount++;
        }
      }
      if (!reason) continue;   // still ours

      const activity = IbStars.load().accounts[acct];
      const payload = {
        account_number:    acct,
        email:             req.email      || null,
        whatsapp:          req.whatsapp   || null,
        broker:            req.broker     || null,
        join_date:         req.created_at ? String(req.created_at).slice(0, 10) : null,
        last_active_date:  activity && activity.lastTradeISO ? activity.lastTradeISO : null,
        detection_source:  'broker_file_auto',
        partner_code_seen: seenCode,
        notes:             'Auto-detected during broker intake: ' + reason,
      };
      const res = await _insertIbChangedRow(payload);
      if (res.ok) {
        inserted++;
        console.log(`[IbChanged] auto-flagged: ${acct} (${reason})`);
      } else {
        console.warn(`[IbChanged] auto-flag insert failed for ${acct}:`, res.error && res.error.message);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Phase 16 follow-up — sweep historical "blocked / access-revoked"
    // signals so any client previously flagged as moved-away-from-our-IB
    // also surfaces in IB Changed Accounts.
    //
    //   Signal 1: license_requests.status = 'unmatched'  (DB-level rejection
    //             — final blocked state after retry window exhausted)
    //   Signal 2: RetryPool.getArchived()                (browser-side mirror
    //             of the same signal — 48h window expired with no match)
    //
    // Both indicate the client could not be matched against our IB report
    // over the full retry window — strongest proxy we have for "moved away
    // from our IB / access denied".  Already-flagged accounts are skipped.
    // ─────────────────────────────────────────────────────────────
    let historicalRevoked = 0;
    const FINAL_BLOCKED_STATUSES = new Set(['unmatched', 'rejected']);

    // Signal 1 — license_requests in DB-final-blocked status
    for (const req of State.requests) {
      const status = String(req.status || '').toLowerCase();
      if (!FINAL_BLOCKED_STATUSES.has(status)) continue;
      const acct = normalizeAccountId(req.account);
      if (!acct) continue;
      if (_ibChangedSet.has(acct)) { skipped++; continue; }

      const reason = `historical access-revoked signal — license_requests.status='${status}'`;
      const activity = IbStars.load().accounts[acct];
      const payload = {
        account_number:    acct,
        email:             req.email      || null,
        whatsapp:          req.whatsapp   || null,
        broker:            req.broker     || null,
        join_date:         req.created_at ? String(req.created_at).slice(0, 10) : null,
        last_active_date:  activity && activity.lastTradeISO ? activity.lastTradeISO : null,
        detection_source:  'broker_file_auto',
        partner_code_seen: null,
        notes:             'Auto-detected during broker intake: ' + reason,
      };
      const res = await _insertIbChangedRow(payload);
      if (res.ok) {
        inserted++;
        historicalRevoked++;
        // Update local cache so Signal 2 dedups correctly within this run.
        _ibChangedSet.add(acct);
        console.log(`[IbChanged] auto-flagged (historical-revoked): ${acct} (${reason})`);
      } else {
        console.warn(`[IbChanged] historical-revoked insert failed for ${acct}:`, res.error && res.error.message);
      }
    }

    // Signal 2 — RetryPool archived (48h-expired entries that may or may
    // not have a matching license_requests row in DB after migration).
    try {
      const archived = RetryPool.getArchived();
      for (const entry of archived) {
        const acct = normalizeAccountId(entry.account);
        if (!acct) continue;
        if (_ibChangedSet.has(acct)) { skipped++; continue; }

        const reason = 'historical access-revoked signal — RetryPool archived (48h match window exhausted)';
        const matchingReq = State.requests.find(r => normalizeAccountId(r.account) === acct);
        const payload = {
          account_number:    acct,
          email:             entry.email   || (matchingReq && matchingReq.email)    || null,
          whatsapp:          (matchingReq && matchingReq.whatsapp) || null,
          broker:            entry.broker  || (matchingReq && matchingReq.broker)   || null,
          join_date:         entry.requestDate || null,
          last_active_date:  null,
          detection_source:  'broker_file_auto',
          partner_code_seen: null,
          notes:             'Auto-detected during broker intake: ' + reason,
        };
        const res = await _insertIbChangedRow(payload);
        if (res.ok) {
          inserted++;
          historicalRevoked++;
          _ibChangedSet.add(acct);
          console.log(`[IbChanged] auto-flagged (retry-pool-archived): ${acct}`);
        } else {
          console.warn(`[IbChanged] retry-pool-archived insert failed for ${acct}:`, res.error && res.error.message);
        }
      }
    } catch (e) {
      console.warn('[IbChanged] RetryPool archived sweep failed (non-fatal):', e);
    }

    console.log(`[IbChanged] auto-detect summary — absent-from-file: ${missingCount}, partner_code mismatch: ${mismatchCount}, historical-revoked: ${historicalRevoked}, already-flagged: ${skipped}, total inserted: ${inserted}`);
    return { inserted, skipped, missing: missingCount, mismatch: mismatchCount, historicalRevoked };
  }

  /* ═══════════════════════════════════════════════════════════
     RENDERERS — IB Stars Active / Inactive / IB Changed list
  ══════════════════════════════════════════════════════════ */

  /* Phase 16 — Supabase-backed IB Stars renderers.
   *
   * Data flow:
   *   1. PRIMARY  : query broker_accounts WHERE ib_star_status = 'active'/'inactive'
   *   2. FALLBACK : if Supabase returns 0 rows AND localStorage has data,
   *                 fall back to the in-browser store so the page is never
   *                 silently empty when the migration hasn't been run yet.
   *
   * The localStorage IbStars store is still updated on every intake — it
   * remains the source of truth for "notified inactive at" transition
   * timestamps (Supabase doesn't track per-account notification state).
   */
  async function _renderIbStarsActive() {
    const bodyEl = document.getElementById('ibStarsActiveBody');
    const cntEl  = document.getElementById('ibStarsActiveCount');
    const empEl  = document.getElementById('ibStarsActiveEmpty');
    if (!bodyEl) return;

    /* ╔══════════════════════════════════════════════════════════════════╗
       ║  Phase 17A FINAL — SOURCE OF TRUTH = Active Clients ∩ d ≤ 30      ║
       ║  ────────────────────────────────────────────────────────────────║
       ║  Render is derived directly from CrmStore (the Active Clients     ║
       ║  dataset).  No email filter.  No delivery filter.  No license     ║
       ║  filter.  Accounts with blank email STILL appear and STILL show   ║
       ║  ACTIVE status.                                                   ║
       ║                                                                   ║
       ║  Email is looked up from broker_accounts / State.requests for     ║
       ║  display purposes only.  If unknown, the cell renders blank.      ║
       ║                                                                   ║
       ║  A fire-and-forget write-back patches broker_accounts.ib_star_    ║
       ║  status = 'active' for every surfaced row so the Library OTP      ║
       ║  gate sees the same set on the next request.                      ║
       ╚══════════════════════════════════════════════════════════════════╝ */
    const ACTIVE_DAY_CAP = IB_CFG.ACTIVE_DAYS;   // 30

    // 1. Primary list = every CrmStore row whose daysSince(lastTrade) ≤ 30.
    const crmRows = (typeof CrmStore !== 'undefined' && CrmStore && !CrmStore.isEmpty())
      ? CrmStore.getActive() : [];
    const crmRecent = crmRows
      .map(r => ({
        account:      normalizeAccountId(r.account),
        accountRaw:   r.account,
        email:        r.email || null,
        whatsapp:     r.whatsapp || null,
        broker:       r.broker || null,
        lastTradeISO: r.lastTrade || null,
        lastTradeMs:  r.lastTrade ? new Date(r.lastTrade).getTime() : null,
        daysSince:    CrmStore.daysSince(r.lastTrade),
        source:       'crm',
      }))
      .filter(r => r.daysSince !== null && r.daysSince <= ACTIVE_DAY_CAP);

    // 2. Pull the existing Supabase rows so we can merge email/whatsapp/broker
    //    when CrmStore doesn't carry them (broker file is the canonical contact
    //    source for many tenants).
    let dbRows = [];
    try {
      const cutoff = new Date(Date.now() - ACTIVE_DAY_CAP * 86_400_000)
        .toISOString().slice(0, 10);
      const { data, error } = await supabaseClient
        .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
        .select('account_number, email, whatsapp, broker, last_trade_date, ib_star_status')
        .or(`ib_star_status.eq.active,last_trade_date.gte.${cutoff}`)
        .limit(5000);
      if (!error) dbRows = data || [];
    } catch (e) {
      console.warn('[Phase17A FINAL] broker_accounts probe failed:', e);
    }
    const dbByAcct = new Map();
    dbRows.forEach(r => dbByAcct.set(normalizeAccountId(r.account_number), r));

    // 3. Also build State.requests email map for last-resort enrichment.
    const reqEmailByAcct = new Map();
    try {
      const reqs = (typeof State !== 'undefined' && State && Array.isArray(State.requests))
        ? State.requests : [];
      for (const r of reqs) {
        if (!r || !r.account || !r.email) continue;
        const k = normalizeAccountId(r.account);
        if (k && !reqEmailByAcct.has(k)) reqEmailByAcct.set(k, String(r.email).trim());
      }
    } catch (_) {}

    // 4. Merge: every CrmStore recent row goes in, enriched with email/broker
    //    from broker_accounts → State.requests when CrmStore was missing them.
    const merged = new Map();
    for (const r of crmRecent) {
      const dbHit = dbByAcct.get(r.account);
      const reqEmail = reqEmailByAcct.get(r.account) || null;
      merged.set(r.account, {
        account:      r.account,
        email:        r.email || (dbHit && dbHit.email) || reqEmail || null,
        whatsapp:     r.whatsapp || (dbHit && dbHit.whatsapp) || null,
        broker:       r.broker || (dbHit && dbHit.broker) || null,
        lastTradeISO: r.lastTradeISO || (dbHit && dbHit.last_trade_date) || null,
        lastTradeMs:  r.lastTradeMs,
        source:       'crm',
      });
    }
    // 5. Also include any DB row already tagged active that the CrmStore
    //    didn't carry — keeps the page resilient on fresh browsers where
    //    the CrmStore localStorage is empty but the DB has data.
    for (const r of dbRows) {
      const acct = normalizeAccountId(r.account_number);
      if (merged.has(acct)) continue;
      if (r.ib_star_status !== 'active') continue;
      merged.set(acct, {
        account:      acct,
        email:        r.email || reqEmailByAcct.get(acct) || null,
        whatsapp:     r.whatsapp || null,
        broker:       r.broker || null,
        lastTradeISO: r.last_trade_date,
        lastTradeMs:  r.last_trade_date ? new Date(r.last_trade_date).getTime() : null,
        source:       'supabase',
      });
    }
    let rows = Array.from(merged.values()).sort((a, b) => (b.lastTradeMs || 0) - (a.lastTradeMs || 0));

    // 6. Fire-and-forget write-back so broker_accounts.ib_star_status reflects
    //    the rendered set — the Library OTP gate will see the same accounts.
    rows.forEach(r => {
      const dbHit = dbByAcct.get(r.account);
      // PATCH when the DB row is missing / not-active, OR when it is active but
      // lacks an email/whatsapp we can supply. The email backfill is what lets
      // the Library OTP gate read a contact for accounts whose email currently
      // lives only in the browser CrmStore (it never reached Supabase before).
      const needsStatus = !dbHit || dbHit.ib_star_status !== 'active';
      const needsEmail  = r.email    && (!dbHit || !dbHit.email);
      const needsWa     = r.whatsapp && (!dbHit || !dbHit.whatsapp);
      if (!needsStatus && !needsEmail && !needsWa) return;
      try {
        // Full-enough payload so a NEW row (account not yet in broker_accounts —
        // e.g. 171929726) passes NOT NULL columns. Missing updated_at was causing
        // the INSERT to fail silently, so CrmStore-only emails never reached
        // Supabase and the Library OTP gate saw email_missing.
        const payload = {
          account_number: r.account,
          ib_star_status: 'active',
          last_trade_date: r.lastTradeISO || null,
          source_file: 'ib-stars-active-backfill',
          updated_at: new Date().toISOString()
        };
        if (r.email)    payload.email    = r.email;
        if (r.whatsapp) payload.whatsapp = r.whatsapp;
        if (r.broker)   payload.broker   = r.broker;
        supabaseClient
          .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
          .upsert([payload], { onConflict: 'account_number' })
          .then(({ error }) => {
            if (error) console.warn('[Phase17A FINAL] write-back failed for', r.account, error.message);
            else if (needsEmail) console.log('[Phase17A FINAL] backfilled email for', r.account);
          });
      } catch (e) { console.warn('[Phase17A FINAL] write-back exception for', r.account, e); }
    });

    // 7. Last-resort fallback: localStorage IbStars (only when CrmStore AND
    //    Supabase both came up empty — e.g. very fresh browser before any
    //    intake has happened).
    if (rows.length === 0) {
      const local = IbStars.getActive();
      rows = local.map(r => ({ ...r, source: 'local' }));
    }

    if (cntEl) cntEl.textContent = String(rows.length);
    if (rows.length === 0) {
      bodyEl.innerHTML = '';
      if (empEl) empEl.hidden = false;
      return;
    }
    if (empEl) empEl.hidden = true;
    bodyEl.innerHTML = rows.map(r => {
      const req = State.requests.find(rq => normalizeAccountId(rq.account) === r.account);
      const email  = r.email  || (req ? req.email  : '') || '—';
      const broker = r.broker || (req ? req.broker : '') || '—';
      const days   = r.lastTradeMs ? Math.floor((Date.now() - r.lastTradeMs) / 86_400_000) : null;
      const daysCls = days === null ? 'ib-stars-days--warn'
                    : days <= 7 ? 'ib-stars-days--ok'
                    : days <= 20 ? 'ib-stars-days--warn'
                    : 'ib-stars-days--alert';
      return `<div class="ib-stars-row">
        <span class="ib-stars-acct">${esc(r.account)}</span>
        <span>${esc(email)}</span>
        <span>${esc(broker)}</span>
        <span>${esc(r.lastTradeISO || '—')}</span>
        <span class="${daysCls}">${days !== null ? days + 'd' : '—'}</span>
        <span><span class="ib-stars-pill ib-stars-pill--active">Active</span></span>
      </div>`;
    }).join('');
  }

  async function _renderIbStarsInactive() {
    const bodyEl = document.getElementById('ibStarsInactiveBody');
    const cntEl  = document.getElementById('ibStarsInactiveCount');
    const empEl  = document.getElementById('ibStarsInactiveEmpty');
    if (!bodyEl) return;

    // Primary: Supabase
    const dbRows = await _fetchBrokerAccountsByStatus('inactive', 2000);
    // Read local store for notifiedInactiveAt overlay.
    const localData = IbStars.load().accounts;
    let rows = dbRows.map(r => {
      const acct = normalizeAccountId(r.account_number);
      const localEntry = localData[acct];
      return {
        account:            acct,
        email:              r.email,
        whatsapp:           r.whatsapp,
        broker:             r.broker,
        lastTradeISO:       r.last_trade_date,
        lastTradeMs:        r.last_trade_date ? new Date(r.last_trade_date).getTime() : null,
        notifiedInactiveAt: localEntry ? localEntry.notifiedInactiveAt : null,
        source:             'supabase',
      };
    });
    // Fallback to localStorage if Supabase is empty (migration not run yet).
    if (rows.length === 0) {
      const local = IbStars.getInactive();
      rows = local.map(r => ({ ...r, source: 'local' }));
    }

    if (cntEl) cntEl.textContent = String(rows.length);
    if (rows.length === 0) {
      bodyEl.innerHTML = '';
      if (empEl) empEl.hidden = false;
      return;
    }
    if (empEl) empEl.hidden = true;
    bodyEl.innerHTML = rows.map(r => {
      const req = State.requests.find(rq => normalizeAccountId(rq.account) === r.account);
      const email  = r.email  || (req ? req.email  : '') || '—';
      const broker = r.broker || (req ? req.broker : '') || '—';
      const days   = r.lastTradeMs ? Math.floor((Date.now() - r.lastTradeMs) / 86_400_000) : null;
      const notifiedPill = r.notifiedInactiveAt
        ? `<span class="ib-stars-pill ib-stars-pill--notified" title="Notified ${new Date(r.notifiedInactiveAt).toLocaleString()}">Sent</span>`
        : `<span class="ib-stars-pill ib-stars-pill--pending">Pending</span>`;
      return `<div class="ib-stars-row">
        <span class="ib-stars-acct">${esc(r.account)}</span>
        <span>${esc(email)}</span>
        <span>${esc(broker)}</span>
        <span>${esc(r.lastTradeISO || '—')}</span>
        <span class="ib-stars-days--alert">${days !== null ? days + 'd' : '—'}</span>
        <span>${notifiedPill}</span>
        <span><span class="ib-stars-pill ib-stars-pill--inactive">Inactive</span></span>
      </div>`;
    }).join('');
  }

  async function _renderIbChangedList() {
    const bodyEl = document.getElementById('ibChangedListBody');
    const cntEl  = document.getElementById('ibChangedListCount');
    const empEl  = document.getElementById('ibChangedListEmpty');
    const navEl  = document.getElementById('ibChangedNavCount');
    if (!bodyEl) return;

    // Phase 16 follow-up #2 — auto-detect on every page open using
    // broker_accounts (Supabase persistent store).  Runs without requiring
    // admin to upload + Run Automation again.  Errors are non-fatal: the
    // page still renders existing ib_changed_accounts rows on failure.
    try { await _autoDetectFromBrokerAccounts(); }
    catch (e) { console.warn('[IbChanged] auto-detect on render failed (non-fatal):', e); }

    _invalidateIbChangedCache();
    await _ensureIbChangedSet();
    const rows = _ibChangedRowsCache;
    if (cntEl) cntEl.textContent = String(rows.length);
    if (navEl) {
      if (rows.length > 0) { navEl.textContent = String(rows.length); navEl.hidden = false; }
      else { navEl.hidden = true; }
    }
    if (rows.length === 0) {
      bodyEl.innerHTML = '';
      if (empEl) empEl.hidden = false;
      return;
    }
    if (empEl) empEl.hidden = true;
    bodyEl.innerHTML = rows.map(r => {
      const dateStr = r.ib_changed_date
        ? new Date(r.ib_changed_date).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
      const srcCls = r.detection_source === 'broker_file_auto' ? 'ib-changed-detection--auto' : 'ib-changed-detection--manual';
      const srcLabel = r.detection_source === 'broker_file_auto' ? 'Auto' : 'Manual';
      return `<div class="ib-changed-row">
        <span class="ib-changed-acct">${esc(r.account_number)}</span>
        <span>${esc(r.email || '—')}</span>
        <span>${esc(r.whatsapp || '—')}</span>
        <span>${esc(r.broker || '—')}</span>
        <span>${esc(dateStr)}</span>
        <span><span class="ib-changed-detection ${srcCls}">${srcLabel}</span></span>
      </div>`;
    }).join('');
  }

  /* ─── Admin search panel (Task 6) ────────────────────────────── */

  function _renderIbChangedSearchResult(req, alreadyChanged, activity) {
    const resEl = document.getElementById('ibChangedSearchResult');
    if (!resEl) return;
    if (!req) {
      resEl.innerHTML = `<div class="ib-changed-banner ib-changed-banner--miss">No account found with that number in our system.</div>`;
      resEl.hidden = false;
      return;
    }
    const lastTrade = activity && activity.lastTradeISO ? activity.lastTradeISO : '—';
    const joinDate  = req.created_at ? String(req.created_at).slice(0, 10) : '—';
    const statusPretty = String(req.status || '—').replace(/_/g, ' ');
    const banner = alreadyChanged
      ? `<div class="ib-changed-banner ib-changed-banner--already">⚠ Already marked as IB Changed — access already revoked.</div>`
      : '';
    resEl.innerHTML =
      banner +
      `<div class="ib-changed-result-grid">
        <div class="ib-changed-result-field"><span class="ib-changed-result-label">Account</span><span class="ib-changed-result-value ib-changed-acct">${esc(req.account)}</span></div>
        <div class="ib-changed-result-field"><span class="ib-changed-result-label">Email</span><span class="ib-changed-result-value">${esc(req.email || '—')}</span></div>
        <div class="ib-changed-result-field"><span class="ib-changed-result-label">WhatsApp</span><span class="ib-changed-result-value">${esc(req.whatsapp || '—')}</span></div>
        <div class="ib-changed-result-field"><span class="ib-changed-result-label">Broker</span><span class="ib-changed-result-value">${esc(req.broker || '—')}</span></div>
        <div class="ib-changed-result-field"><span class="ib-changed-result-label">Join Date</span><span class="ib-changed-result-value">${esc(joinDate)}</span></div>
        <div class="ib-changed-result-field"><span class="ib-changed-result-label">Current Status</span><span class="ib-changed-result-value">${esc(statusPretty)}</span></div>
        <div class="ib-changed-result-field"><span class="ib-changed-result-label">Last Active</span><span class="ib-changed-result-value">${esc(lastTrade)}</span></div>
      </div>
      <div class="ib-changed-result-actions">
        <button class="btn-mark-ib-changed" id="btnMarkIbChanged" type="button" ${alreadyChanged ? 'disabled' : ''}>${alreadyChanged ? 'Already IB Changed' : 'Mark as IB Changed'}</button>
      </div>`;
    resEl.hidden = false;

    if (!alreadyChanged) {
      const btn = document.getElementById('btnMarkIbChanged');
      if (btn) btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Saving…';
        const payload = {
          account_number:    normalizeAccountId(req.account),
          email:             req.email      || null,
          whatsapp:          req.whatsapp   || null,
          broker:            req.broker     || null,
          join_date:         req.created_at ? String(req.created_at).slice(0, 10) : null,
          last_active_date:  activity && activity.lastTradeISO ? activity.lastTradeISO : null,
          detection_source:  'manual',
          partner_code_seen: null,
          notes:             'Manually flagged by admin via IB Changed search panel.',
        };
        const res = await _insertIbChangedRow(payload);
        if (res.ok) {
          showToast('Account flagged as IB Changed. Premium access revoked.', 'success', 4000);
          await _renderIbChangedList();
          _renderIbChangedSearchResult(req, true, activity);
        } else {
          btn.disabled = false;
          btn.textContent = 'Mark as IB Changed';
          showToast('Failed to mark account: ' + ((res.error && res.error.message) || 'unknown'), 'error', 5000);
        }
      });
    }
  }

  async function _handleIbChangedSearch() {
    const input = document.getElementById('ibChangedSearchInput');
    if (!input) return;
    const raw = (input.value || '').trim();
    if (!raw) { showToast('Enter an account number to search.', 'warn', 2500); return; }
    const acct = normalizeAccountId(raw);
    const req = State.requests.find(r => normalizeAccountId(r.account) === acct);
    const already = await _isAccountIbChanged(acct);
    const activity = IbStars.load().accounts[acct] || null;
    _renderIbChangedSearchResult(req || null, already, activity);
  }

  function bindIbStarsAndChanged() {
    // Refresh buttons
    const a = document.getElementById('ibStarsActiveRefresh');
    const i = document.getElementById('ibStarsInactiveRefresh');
    const c = document.getElementById('ibChangedListRefresh');
    if (a) a.addEventListener('click', _renderIbStarsActive);
    if (i) i.addEventListener('click', _renderIbStarsInactive);
    if (c) c.addEventListener('click', _renderIbChangedList);

    // Search panel
    const sBtn = document.getElementById('ibChangedSearchBtn');
    const sIn  = document.getElementById('ibChangedSearchInput');
    if (sBtn) sBtn.addEventListener('click', _handleIbChangedSearch);
    if (sIn)  sIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _handleIbChangedSearch(); }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     PHASE 16.2 — Edit Client + Block/Unblock System
  ══════════════════════════════════════════════════════════ */

  const BLOCKED_TABLE = 'blocked_clients';
  let _blockedSet     = null;
  let _blockedRows    = [];

  /* ─── Phase 16.2 — client_overrides read layer ──────────────
   * After a Save in the Edit modal, the WRITE path goes to
   * client_overrides successfully but Active/Inactive/HighValue
   * tables kept showing stale values because they read directly
   * from CrmStore (broker-file cache) without consulting overrides.
   *
   * Fix: build a per-account latest-override map at init / after
   * save, and merge it on top of every rendered row.  Priority:
   *   override.email    || original.email
   *   override.whatsapp || original.whatsapp
   *   override.broker   || original.broker
   */
  let _clientOverridesMap = {};

  async function _refreshClientOverrides() {
    if (!supabaseClient) { _clientOverridesMap = {}; return _clientOverridesMap; }
    try {
      const { data, error } = await supabaseClient
        .from('client_overrides')
        .select('account_number, email, whatsapp, broker, updated_by, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) {
        console.warn('[Overrides] fetch failed (continuing without):', error.message);
        _clientOverridesMap = {};
        return _clientOverridesMap;
      }
      // Latest per account — first hit wins because we order DESC.
      const map = {};
      (data || []).forEach(row => {
        const k = normalizeAccountId(row.account_number);
        if (k && !map[k]) map[k] = row;
      });
      _clientOverridesMap = map;
      console.log('[Overrides] cache refreshed —', Object.keys(map).length, 'account(s) with overrides.');
      return _clientOverridesMap;
    } catch (e) {
      console.warn('[Overrides] fetch exception:', e);
      _clientOverridesMap = {};
      return _clientOverridesMap;
    }
  }

  function _applyOverride(row) {
    if (!row) return row;
    const acct = normalizeAccountId(row.account);
    const ov = _clientOverridesMap[acct];
    if (!ov) return row;
    // Non-mutating merge so the source object stays clean for other callers.
    return Object.assign({}, row, {
      email:    ov.email    || row.email,
      whatsapp: ov.whatsapp || row.whatsapp,
      broker:   ov.broker   || row.broker,
    });
  }

  async function _ensureBlockedSet() {
    if (_blockedSet) return _blockedSet;
    if (!supabaseClient) { _blockedSet = new Set(); return _blockedSet; }
    try {
      const { data, error } = await supabaseClient
        .from(BLOCKED_TABLE).select('*').eq('active', true)
        .order('blocked_at', { ascending: false }).limit(2000);
      if (error) {
        console.warn('[Blocked] fetch failed (table missing? run Phase 16.2 SQL):', error.message);
        _blockedSet = new Set(); _blockedRows = []; return _blockedSet;
      }
      _blockedRows = data || [];
      _blockedSet  = new Set(_blockedRows.map(r => normalizeAccountId(r.account_number)));
    } catch (e) { _blockedSet = new Set(); _blockedRows = []; }
    return _blockedSet;
  }
  function _invalidateBlockedCache() { _blockedSet = null; _blockedRows = []; }
  async function _isBlocked(account) {
    const set = await _ensureBlockedSet();
    return set.has(normalizeAccountId(account));
  }

  async function _blockClient(account, ctx, reason) {
    if (!supabaseClient) return { ok: false, error: 'no supabase' };
    const acct = normalizeAccountId(account);
    if (!acct) return { ok: false, error: 'no account' };
    const payload = {
      account_number: acct,
      email:    ctx && ctx.email    || null,
      whatsapp: ctx && ctx.whatsapp || null,
      broker:   ctx && ctx.broker   || null,
      reason:   reason || 'Admin block',
      blocked_by: 'admin',
      active:   true,
    };
    try {
      const { error } = await supabaseClient.from(BLOCKED_TABLE)
        .upsert([payload], { onConflict: 'account_number' });
      if (error) return { ok: false, error: error.message };
      _invalidateBlockedCache();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  async function _unblockClient(account) {
    const acct = normalizeAccountId(account);
    if (!acct || !supabaseClient) return { ok: false };
    try {
      const { error } = await supabaseClient.from(BLOCKED_TABLE)
        .update({ active: false, unblocked_at: new Date().toISOString() })
        .eq('account_number', acct);
      if (error) return { ok: false, error: error.message };
      _invalidateBlockedCache();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  async function _renderBlockedList() {
    const bodyEl = document.getElementById('blockedListBody');
    const cntEl  = document.getElementById('blockedListCount');
    const empEl  = document.getElementById('blockedListEmpty');
    const navEl  = document.getElementById('blockedClientsNavCount');
    if (!bodyEl) return;
    _invalidateBlockedCache();
    await _ensureBlockedSet();
    const rows = _blockedRows;
    if (cntEl) cntEl.textContent = String(rows.length);
    if (navEl) { if (rows.length > 0) { navEl.textContent = String(rows.length); navEl.hidden = false; } else navEl.hidden = true; }
    if (rows.length === 0) { bodyEl.innerHTML = ''; if (empEl) empEl.hidden = false; return; }
    if (empEl) empEl.hidden = true;
    bodyEl.innerHTML = rows.map(r => {
      const dt = r.blocked_at ? new Date(r.blocked_at).toLocaleString() : '—';
      return `<div class="ib-changed-row">
        <span class="ib-changed-acct">${esc(r.account_number)}</span>
        <span>${esc(r.email || '—')}</span>
        <span>${esc(r.whatsapp || '—')}</span>
        <span>${esc(r.broker || '—')}</span>
        <span>${esc(dt)}</span>
        <span><button class="iq-btn iq-btn--action" data-unblock="${esc(r.account_number)}" type="button" style="background:rgba(34,197,94,0.16);border-color:rgba(34,197,94,0.45);color:#22c55e">Unblock</button></span>
      </div>`;
    }).join('');
    bodyEl.querySelectorAll('[data-unblock]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const res = await _unblockClient(btn.dataset.unblock);
        if (res.ok) { showToast('Client unblocked.', 'success', 3000); _renderBlockedList(); }
        else { btn.disabled = false; showToast('Unblock failed: ' + (res.error || 'unknown'), 'error', 4000); }
      });
    });
  }

  /* ── Edit Client modal ─────────────────────────────────── */
  let _editClientState = { account: null, currentRow: null };
  async function _openEditClientModal(account) {
    const acct = normalizeAccountId(account);
    if (!acct) return;
    /* Phase 17B — populate from EVERY known source in priority order so the
       admin always sees existing values even when the account isn't in
       license_requests (e.g. pure broker-file accounts).
         1. license_requests row (State.requests) — most trusted (carries id)
         2. CrmStore localStorage — broker-intake mirror
         3. broker_accounts Supabase — canonical broker mirror
         4. client_overrides latest — most recent admin edit
       Each source can fill missing fields without overwriting earlier ones. */
    const req      = State.requests.find(r => normalizeAccountId(r.account) === acct) || null;
    let pre = {
      email:    (req && req.email)    || '',
      whatsapp: (req && req.whatsapp) || '',
      broker:   (req && req.broker)   || '',
    };
    try {
      if (typeof CrmStore !== 'undefined' && CrmStore) {
        const crm = CrmStore.getAll().find(r => normalizeAccountId(r.account) === acct);
        if (crm) {
          if (!pre.email)    pre.email    = crm.email    || '';
          if (!pre.whatsapp) pre.whatsapp = crm.whatsapp || '';
          if (!pre.broker)   pre.broker   = crm.broker   || crm.broker_name || '';
        }
      }
    } catch (_) {}
    if (supabaseClient && DataLayer && DataLayer.isLive) {
      try {
        const { data } = await supabaseClient
          .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
          .select('email, whatsapp, broker')
          .eq('account_number', acct)
          .limit(1);
        if (data && data[0]) {
          if (!pre.email)    pre.email    = data[0].email    || '';
          if (!pre.whatsapp) pre.whatsapp = data[0].whatsapp || '';
          if (!pre.broker)   pre.broker   = data[0].broker   || '';
        }
      } catch (_) {}
      try {
        const { data: ovRows } = await supabaseClient
          .from('client_overrides')
          .select('email, whatsapp, broker, created_at')
          .eq('account_number', acct)
          .order('created_at', { ascending: false })
          .limit(1);
        if (ovRows && ovRows[0]) {
          if (ovRows[0].email)    pre.email    = ovRows[0].email;
          if (ovRows[0].whatsapp) pre.whatsapp = ovRows[0].whatsapp;
          if (ovRows[0].broker)   pre.broker   = ovRows[0].broker;
        }
      } catch (_) {}
    }
    _editClientState.account = acct;
    _editClientState.currentRow = req || { account: acct, email: pre.email, whatsapp: pre.whatsapp, broker: pre.broker };
    const ov = document.getElementById('editClientOverlay');
    document.getElementById('editClientAcct').textContent = acct;
    document.getElementById('editClientEmail').value    = pre.email    || '';
    document.getElementById('editClientWhatsapp').value = pre.whatsapp || '';
    document.getElementById('editClientBroker').value   = pre.broker   || '';
    const errEl = document.getElementById('editClientError');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (ov) ov.hidden = false;
    // Move focus into email so the admin can immediately edit.
    setTimeout(() => {
      const f = document.getElementById('editClientEmail');
      if (f) try { f.focus(); } catch (_) {}
    }, 60);
  }
  function _closeEditClientModal() { const ov = document.getElementById('editClientOverlay'); if (ov) ov.hidden = true; }

  async function _saveEditClient() {
    const errEl = document.getElementById('editClientError');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    const acct = _editClientState.account;
    if (!acct) return;
    const newEmail = document.getElementById('editClientEmail').value.trim();
    const newWa    = document.getElementById('editClientWhatsapp').value.trim();
    const newBrk   = document.getElementById('editClientBroker').value.trim();
    const cur = _editClientState.currentRow || {};
    if (!supabaseClient) {
      if (errEl) { errEl.textContent = 'No live Supabase client.'; errEl.hidden = false; }
      showToast('Cannot save — Supabase not initialised.', 'error', 5000);
      return;
    }

    const changes = {};
    if (newEmail !== (cur.email || ''))   changes.email           = newEmail || null;
    if (newWa    !== (cur.whatsapp || ''))changes.whatsapp_number = newWa    || null;
    if (newBrk   !== (cur.broker || ''))  changes.broker_name     = newBrk   || null;
    if (Object.keys(changes).length === 0) { _closeEditClientModal(); showToast('No changes to save.', 'info', 2500); return; }

    // ── 1. UPDATE license_requests (only if we have an id) ─────────
    //    Honest reporting: show RED toast with exact error if it fails;
    //    do NOT proceed to audit log or success message.
    let licenseUpdated = false;
    if (cur.id) {
      try {
        const resp = await supabaseClient.from(DB_SCHEMA.TABLE)
          .update(changes).eq('id', cur.id)
          .select('id, email, whatsapp_number, broker_name');
        console.log('[EditClient] license_requests UPDATE response:', resp);
        if (resp.error) {
          const msg = 'license_requests UPDATE failed — [' + (resp.error.code || '?') + '] ' + resp.error.message;
          if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
          showToast(msg, 'error', 8000);
          return;
        }
        if (!resp.data || resp.data.length === 0) {
          const msg = 'license_requests UPDATE returned 0 rows — RLS may be denying SELECT return, or id mismatch.';
          if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
          showToast(msg, 'warn', 7000);
          return;
        }
        licenseUpdated = true;
      } catch (e) {
        const msg = 'license_requests UPDATE exception: ' + (e.message || e);
        if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        showToast(msg, 'error', 7000);
        console.error('[EditClient] license_requests UPDATE exception:', e);
        return;
      }
    }

    // ── 2. Write override snapshot to client_overrides ──────────────
    //    User's live schema: (account_number, email, whatsapp, broker, updated_by, created_at).
    //    Previous payload was using a changelog shape (field/old_value/new_value)
    //    which caused 400 Bad Request because those columns do not exist.
    //    Now sending the actual snapshot columns.  Plain INSERT (no upsert)
    //    so each save is its own audit row, with created_at preserved.
    let overrideSaved = false;
    try {
      const overridePayload = {
        account_number: normalizeAccountId(acct),
        email:          newEmail || null,
        whatsapp:       newWa    || null,
        broker:         newBrk   || null,
        updated_by:     'admin',
      };
      const ovResp = await supabaseClient.from('client_overrides')
        .insert([overridePayload])
        .select('id, account_number, email, whatsapp, broker, updated_by, created_at');
      console.log('[EditClient] client_overrides INSERT response:', ovResp);
      if (ovResp.error) {
        const msg = 'client_overrides write failed — [' + (ovResp.error.code || '?') + '] ' + ovResp.error.message + (ovResp.error.details ? ' | ' + ovResp.error.details : '');
        console.error('[EditClient] client_overrides INSERT FAILED:', ovResp.error);
        // license_requests UPDATE already succeeded; surface the audit failure
        // but do NOT claim full success.
        if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        showToast('Saved license_requests row but client_overrides audit FAILED: ' + ovResp.error.message + (ovResp.error.code ? ' [' + ovResp.error.code + ']' : ''), 'error', 9000);
      } else if (!ovResp.data || ovResp.data.length === 0) {
        showToast('client_overrides INSERT returned 0 rows — RLS may be denying SELECT return on the inserted row.', 'warn', 7000);
      } else {
        overrideSaved = true;
        console.log('[EditClient] client_overrides INSERT OK — id=' + ovResp.data[0].id);
      }
    } catch (e) {
      console.error('[EditClient] client_overrides exception:', e);
      showToast('client_overrides exception: ' + (e.message || e), 'error', 8000);
    }

    // ── 3. Phase 17B — propagate edit to EVERY downstream store so the new
    //       values appear on every section page without a reload.
    try {
      // 3a. Update CrmStore localStorage (Active/Inactive/HighValue/Global Search).
      if (typeof CrmStore !== 'undefined' && CrmStore && typeof CrmStore._read === 'function') {
        const store = CrmStore._read();
        const k = String(acct).trim();
        if (store[k]) {
          if (newEmail) store[k].email    = newEmail;
          if (newWa)    store[k].whatsapp = newWa;
          if (newBrk)   store[k].broker   = newBrk;
          CrmStore._write && CrmStore._write();
        } else {
          // Account exists in license_requests but not yet in CrmStore — add a stub
          store[k] = {
            account: k, email: newEmail || '', whatsapp: newWa || '',
            broker: newBrk || '', lastTrade: '', createdAt: '', reward: 0,
            volumeLots: 0, volumeUsd: 0, accountType: '', country: '',
            platform: '', uid: '', importedAt: Date.now(),
          };
          CrmStore._write && CrmStore._write();
        }
      }
      // 3b. Update broker_accounts in Supabase (feeds IB Stars Active/Inactive + Library OTP).
      if (supabaseClient && DataLayer && DataLayer.isLive) {
        try {
          const baPatch = {};
          if (newEmail) baPatch.email    = newEmail;
          if (newWa)    baPatch.whatsapp = newWa;
          if (newBrk)   baPatch.broker   = newBrk;
          if (Object.keys(baPatch).length > 0) {
            await supabaseClient
              .from(IB_CFG.BROKER_ACCOUNTS_TABLE)
              .upsert([{ account_number: acct, ...baPatch }], { onConflict: 'account_number' });
          }
        } catch (e) { console.warn('[EditClient] broker_accounts propagate failed (non-fatal):', e); }
      }
      // 3c. Update State.requests in memory (Pending/Waiting/Matched/Compile/Delivered rows).
      if (Array.isArray(State.requests)) {
        State.requests.forEach(r => {
          if (normalizeAccountId(r.account) === acct) {
            if (newEmail) r.email    = newEmail;
            if (newWa)    r.whatsapp = newWa;
            if (newBrk)   r.broker   = newBrk;
          }
        });
      }
      // 3d. Pull latest client_overrides snapshot and re-fetch live data.
      await _refreshClientOverrides();
      await loadData();
      // 3e. Re-render every client-facing section.
      if (typeof renderPendingRequests        === 'function') renderPendingRequests();
      if (typeof renderWaitingForMatch        === 'function') renderWaitingForMatch();
      if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
      if (typeof renderCompileQueueSection    === 'function') renderCompileQueueSection();
      if (typeof renderDeliveredSection       === 'function') renderDeliveredSection();
      if (typeof renderCrmActive              === 'function') renderCrmActive();
      if (typeof renderCrmInactive            === 'function') renderCrmInactive();
      if (typeof renderCrmHighValue           === 'function') renderCrmHighValue();
      if (typeof _renderIbStarsActive         === 'function') _renderIbStarsActive();
      if (typeof _renderIbStarsInactive       === 'function') _renderIbStarsInactive();
      if (typeof _renderIbChangedList         === 'function') _renderIbChangedList();
      if (typeof _renderBlockedList           === 'function') _renderBlockedList();
      if (typeof renderCrmSearch              === 'function') {
        const q = document.getElementById('crmSearchInput');
        renderCrmSearch(q ? q.value : '');
      }
    } catch (e) { console.warn('[EditClient] propagate/render pass failed:', e); }

    // ── 4. Final outcome — only claim success when both writes succeeded ─
    if (licenseUpdated && overrideSaved) {
      _closeEditClientModal();
      showToast('✓ Client updated — license_requests + client_overrides both saved.', 'success', 4000);
    } else if (licenseUpdated && !overrideSaved) {
      // Modal stays open; error is already in the inline error banner
      console.warn('[EditClient] partial: license_requests saved, override FAILED');
    }
    return;
  }

  /* ═══════════════════════════════════════════════════════════
     Phase 17C — Admin-side License Request submission
     ───────────────────────────────────────────────────────────
     Mirrors license-request.html submitForm() exactly so the
     resulting row is processed by the existing automation as if
     a customer had filled in the public form themselves.

     Audit metadata (when the columns exist in the live schema):
       created_by       = 'admin'
       created_by_user  = ADMIN_CONFIG.username || 'admin'
       admin_note       = optional free text

     The graceful cascade pattern from license-request.html is
     re-used: if any optional column is missing in the live
     license_requests schema, the INSERT is retried with that
     column dropped, so the submission never fails for schema
     drift reasons.
  ══════════════════════════════════════════════════════════ */
  let _createLicenseState = { lastDupe: null, force: false };

  function _openCreateLicenseModal() {
    const ov = document.getElementById('createLicenseOverlay');
    if (!ov) return;
    _createLicenseState = { lastDupe: null, force: false };
    document.getElementById('createLicenseAcct').value     = '';
    document.getElementById('createLicenseEmail').value    = '';
    document.getElementById('createLicenseWhatsapp').value = '';
    document.getElementById('createLicenseBroker').value   = '';
    document.getElementById('createLicenseNote').value     = '';
    const err = document.getElementById('createLicenseError');
    if (err) { err.hidden = true; err.textContent = ''; }
    const dup = document.getElementById('createLicenseDupeWarning');
    if (dup) dup.style.display = 'none';
    ov.hidden = false;
    setTimeout(() => {
      const f = document.getElementById('createLicenseAcct');
      if (f) try { f.focus(); } catch (_) {}
    }, 60);
  }
  function _closeCreateLicenseModal() {
    const ov = document.getElementById('createLicenseOverlay');
    if (ov) ov.hidden = true;
  }

  async function _submitAdminLicenseRequest() {
    const errEl = document.getElementById('createLicenseError');
    const dupEl = document.getElementById('createLicenseDupeWarning');
    const dupText = document.getElementById('createLicenseDupeText');
    const setErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
    const clearErr = () => { if (errEl) { errEl.textContent = ''; errEl.hidden = true; } };
    clearErr();

    const account  = (document.getElementById('createLicenseAcct').value || '').trim();
    const email    = (document.getElementById('createLicenseEmail').value || '').trim();
    const whatsapp = (document.getElementById('createLicenseWhatsapp').value || '').trim();
    const broker   = (document.getElementById('createLicenseBroker').value || '').trim();
    const note     = (document.getElementById('createLicenseNote').value || '').trim();

    // 1. Validate required fields
    if (!account)             { setErr('Account number is required.'); return; }
    if (!/^\d{2,}$/.test(account.replace(/\D/g,''))) { setErr('Account number should be numeric.'); return; }
    if (!email)               { setErr('Email is required.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Email looks invalid.'); return; }
    if (!whatsapp)            { setErr('WhatsApp number is required.'); return; }
    if (!/^\+?\d{6,}$/.test(whatsapp.replace(/\s|-/g,''))) { setErr('WhatsApp number should be digits, with optional leading +.'); return; }
    if (!broker)              { setErr('Broker is required.'); return; }

    if (!supabaseClient || !DataLayer || !DataLayer.isLive) {
      setErr('Supabase is not live — cannot submit.');
      return;
    }

    const normAcct = normalizeAccountId(account);

    // 2. IB Changed gate — same check the public form runs
    try {
      const ibResp = await supabaseClient
        .from('ib_changed_accounts')
        .select('id, account_number')
        .eq('account_number', normAcct)
        .limit(1);
      if (!ibResp.error && ibResp.data && ibResp.data.length > 0) {
        setErr('Account is flagged as IB Changed (no longer under our referral). Submission blocked.');
        return;
      }
    } catch (e) {
      console.warn('[CreateLicense] IB Changed gate check failed (continuing):', e);
    }

    // 3. Duplicate guard — unless admin already clicked Continue Anyway
    if (!_createLicenseState.force) {
      try {
        const dResp = await supabaseClient
          .from(DB_SCHEMA.TABLE)
          .select('id, status, email, created_at')
          .eq('account_number', normAcct)
          .order('created_at', { ascending: false })
          .limit(1);
        if (!dResp.error && dResp.data && dResp.data.length > 0) {
          const prior = dResp.data[0];
          _createLicenseState.lastDupe = prior;
          if (dupEl && dupText) {
            const when = prior.created_at ? fmtDateTime(prior.created_at) : '—';
            dupText.innerHTML =
              'Account <strong>' + esc(normAcct) + '</strong> already has a request — status <strong>' +
              esc(String(prior.status || 'unknown')) + '</strong> from ' + esc(when) +
              (prior.email ? ' for <code>' + esc(prior.email) + '</code>' : '') + '.';
            dupEl.style.display = 'block';
          }
          return; // wait for admin to click View Existing or Continue Anyway
        }
      } catch (e) {
        console.warn('[CreateLicense] duplicate check failed (continuing):', e);
      }
    }

    // 4. Build payload — same shape as license-request.html
    //    + Phase 17C audit metadata.
    const adminUser = (typeof ADMIN_CONFIG !== 'undefined' && ADMIN_CONFIG && ADMIN_CONFIG.username) || 'admin';
    const baseRow = {
      account_number: normAcct,
      email:          email,
      status:         'pending',
    };
    const withAudit = Object.assign({}, baseRow, {
      created_by:      'admin',
      created_by_user: adminUser,
      admin_note:      note || null,
    });
    const withBroker   = Object.assign({}, withAudit,    { broker_name:     broker });
    const withWhatsapp = Object.assign({}, withBroker,   { whatsapp_number: whatsapp });

    // 5. Insert with graceful cascade — drop optional columns one by one
    //    if PostgREST reports the column is missing.
    const cascade = [
      { row: withWhatsapp, drop: null },
      { row: withBroker,   drop: 'whatsapp_number' },
      { row: withAudit,    drop: 'broker_name' },
      { row: baseRow,      drop: 'audit metadata' },
    ];

    const isMissingColErr = (err) => {
      if (!err) return false;
      const m = String(err.message || '').toLowerCase();
      const code = String(err.code || '');
      return code === 'PGRST204' ||
             m.indexOf('schema cache') !== -1 ||
             m.indexOf('could not find') !== -1 ||
             m.indexOf('column') !== -1;
    };

    /* Phase 18 CRITICAL FIX — break on ANY non-error response, not only when
       resp.data has rows.  If anon RLS allows INSERT but denies SELECT, the
       previous logic would continue the cascade with a different payload
       shape — silently inserting the row 2-4 times.  Now: any successful
       INSERT terminates the loop; we then do a follow-up SELECT to recover
       the new id for the success toast (best-effort; the row exists either
       way). */
    let insertedId = null;
    let insertSucceeded = false;
    let lastErr = null;
    let lastSuccessfulAcct = null;
    for (const step of cascade) {
      try {
        const resp = await supabaseClient.from(DB_SCHEMA.TABLE)
          .insert([step.row])
          .select('id, account_number, status, created_at');
        if (resp.error) {
          lastErr = resp.error;
          if (isMissingColErr(resp.error)) {
            console.warn('[CreateLicense] missing column detected — retrying without:', step.drop || '(initial)');
            continue;
          }
          // Hard error — stop the cascade.
          setErr('Database error [' + (resp.error.code || '?') + ']: ' + resp.error.message);
          return;
        }
        // No error == INSERT accepted by the server. Stop the cascade
        // regardless of whether RLS returned the inserted row.
        insertSucceeded   = true;
        lastSuccessfulAcct = step.row.account_number;
        if (resp.data && resp.data[0] && resp.data[0].id) {
          insertedId = resp.data[0].id;
        }
        break;
      } catch (e) {
        lastErr = e;
        console.warn('[CreateLicense] insert exception:', e);
      }
    }

    if (!insertSucceeded) {
      setErr('Could not save the request: ' + (lastErr && lastErr.message ? lastErr.message : 'unknown error'));
      return;
    }
    // Best-effort: if RLS denied the SELECT return, fetch the id we just
    // created so the toast can show it.  Soft-fail if the lookup also gets
    // RLS-blocked.
    if (!insertedId && lastSuccessfulAcct) {
      try {
        const { data } = await supabaseClient
          .from(DB_SCHEMA.TABLE)
          .select('id')
          .eq('account_number', lastSuccessfulAcct)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data[0]) insertedId = data[0].id;
      } catch (_) { /* non-fatal */ }
    }

    showToast('✓ License request submitted on behalf of customer' + (insertedId ? ' — id=' + insertedId : '') + '. Entering the standard pipeline.', 'success', 6000);
    _closeCreateLicenseModal();

    // 6. Pull the fresh row into State.requests + propagate, then fire the
    //    SAME post-submission sweeps the public form benefits from on the
    //    next dashboard tick: auto-match against broker_accounts (Phase 16.4
    //    Issue 1), pending sweep, and full re-render.
    try {
      await loadData();
      try { if (typeof _autoMatchPendingViaBroker === 'function') await _autoMatchPendingViaBroker(); } catch (_) {}
      try { if (typeof _sweepStalePendingViaSupabase === 'function') await _sweepStalePendingViaSupabase(); } catch (_) {}
      if (typeof renderPendingRequests        === 'function') renderPendingRequests();
      if (typeof renderWaitingForMatch        === 'function') renderWaitingForMatch();
      if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
      if (typeof renderCompileQueueSection    === 'function') renderCompileQueueSection();
      if (typeof renderDeliveredSection       === 'function') renderDeliveredSection();
      if (typeof renderCrmActive              === 'function') renderCrmActive();
      if (typeof renderCrmSearch              === 'function') {
        const q = document.getElementById('crmSearchInput');
        renderCrmSearch(q ? q.value : '');
      }
    } catch (e) { console.warn('[CreateLicense] post-submit refresh failed:', e); }
  }

  /* ═══════════════════════════════════════════════════════════
     Phase 17E — DEVELOPMENT TOOLKIT (admin-side reset utilities)
     ───────────────────────────────────────────────────────────
     Four destructive operations, each gated by a confirmation
     modal that requires typing the literal phrase
       RESET PRODUCTION DATA
     before the Execute button enables.

     ONLY row data is deleted.  Tables, schema, RLS policies,
     functions, automation code, matching logic, broker intake
     flow, compile pipeline, and Library Access OTP gate are
     never touched by these actions.
  ══════════════════════════════════════════════════════════ */

  /* PostgREST DELETE requires a filter to prevent accidental table-wide
     wipes.  `.not('id','is',null)` matches every row safely on every table
     we touch (each has an `id` PK — BIGSERIAL or UUID).  Returns
     { ok: bool, error?: object }. */
  async function _devDelete(table) {
    if (!supabaseClient || !DataLayer.isLive) {
      return { ok: false, error: { message: 'Supabase is not live.' } };
    }
    try {
      const { error } = await supabaseClient.from(table).delete().not('id', 'is', null);
      if (error) {
        console.warn('[DevToolkit] delete failed for ' + table + ':', error.message);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (e) {
      console.warn('[DevToolkit] delete exception for ' + table + ':', e);
      return { ok: false, error: e };
    }
  }

  function _devClearLocalStorageKeys(keys) {
    let removed = 0;
    (keys || []).forEach(k => {
      try {
        if (window.localStorage.getItem(k) !== null) {
          window.localStorage.removeItem(k);
          removed++;
        }
      } catch (_) {}
    });
    return removed;
  }

  /* Action definitions — each carries:
       label       : human-readable title shown in the confirm modal
       summary     : one-line description shown above the targets list
       targets     : array of "what will be cleared" bullet strings
       tables      : Supabase tables to DELETE (in order)
       localKeys   : localStorage keys to remove
       memReset    : optional in-memory reset (RetryPool / IbStars / CrmStore) */
  const _devActions = {
    'clear-requests': {
      label: 'Clear Test License Requests',
      summary: 'Deletes every license request row, the resend queue, and engine triggers. Empties RetryPool from localStorage. Pending / Waiting / Matched / Compile / Delivered tabs will all show empty.',
      targets: [
        '<code>license_requests</code> — every row deleted',
        '<code>resend_requests</code> — every row deleted',
        '<code>engine_triggers</code> — every row deleted',
        '<code>ZTU_ADMIN_RETRY_POOL_V1</code> (localStorage) — cleared',
      ],
      tables: ['license_requests', 'resend_requests', 'engine_triggers'],
      localKeys: ['ZTU_ADMIN_RETRY_POOL_V1'],
      memReset: () => {
        try { if (typeof RetryPool !== 'undefined' && RetryPool) RetryPool._data = null; } catch (_) {}
        try { if (Array.isArray(State.requests)) State.requests.length = 0; } catch (_) {}
      },
    },
    'clear-emails': {
      label: 'Clear Test Emails',
      summary: 'Deletes every row from email_outbox and wa_outbox. Resets sent/pending/failed counters.',
      targets: [
        '<code>email_outbox</code> — every row deleted',
        '<code>wa_outbox</code> — every row deleted',
        'Per-tab Sent / Pending / Failed badges — reset to 0',
      ],
      tables: ['email_outbox', 'wa_outbox'],
      localKeys: ['ZTU_EMAIL_QUEUE_V1', 'ZTU_WA_QUEUE_V1'],
      memReset: () => {},
    },
    'clear-broker': {
      label: 'Clear Test Broker Registry',
      summary: 'Deletes broker_accounts and clears the CRM + IB Stars activity caches. Next broker file you upload becomes the new production registry.',
      targets: [
        '<code>broker_accounts</code> — every row deleted',
        '<code>ZTU_CRM_DATA_V1</code> (localStorage) — cleared',
        '<code>ZTU_IB_STARS_ACTIVITY_V1</code> (localStorage) — cleared',
        'Active Clients / Inactive Clients / High Value / IB Stars Active / IB Stars Inactive — empty until next broker upload',
      ],
      tables: ['broker_accounts'],
      localKeys: ['ZTU_CRM_DATA_V1', 'ZTU_IB_STARS_ACTIVITY_V1'],
      memReset: () => {
        try { if (typeof CrmStore !== 'undefined' && CrmStore) CrmStore._data = null; } catch (_) {}
        try { if (typeof IbStars  !== 'undefined' && IbStars)  IbStars._data  = null; } catch (_) {}
      },
    },
    'full-reset': {
      label: 'Full Development Reset',
      summary: 'Deletes ALL test/dev row data in every table that the dashboard writes to, AND clears every ZTU_* localStorage key. Tables, schema, RLS, automation logic, engine, and Library Access remain intact. After completion the dashboard behaves as a fresh production install.',
      targets: [
        '<code>license_requests</code>',
        '<code>resend_requests</code>',
        '<code>engine_triggers</code>',
        '<code>email_outbox</code>',
        '<code>wa_outbox</code>',
        '<code>broker_accounts</code>',
        '<code>client_overrides</code>',
        '<code>blocked_clients</code>',
        '<code>ib_changed_accounts</code>',
        'Every <code>ZTU_*</code> localStorage key (CRM cache, RetryPool, IB Stars cache, Email/WA queues, Admin session)',
      ],
      tables: [
        'license_requests', 'resend_requests', 'engine_triggers',
        'email_outbox', 'wa_outbox',
        'broker_accounts',
        'client_overrides', 'blocked_clients', 'ib_changed_accounts',
      ],
      localKeys: [
        'ZTU_CRM_DATA_V1',
        'ZTU_ADMIN_RETRY_POOL_V1',
        'ZTU_IB_STARS_ACTIVITY_V1',
        'ZTU_EMAIL_QUEUE_V1',
        'ZTU_WA_QUEUE_V1',
        'adc_state_v3',
      ],
      memReset: () => {
        try { if (typeof RetryPool !== 'undefined' && RetryPool) RetryPool._data = null; } catch (_) {}
        try { if (typeof IbStars   !== 'undefined' && IbStars)   IbStars._data   = null; } catch (_) {}
        try { if (typeof CrmStore  !== 'undefined' && CrmStore)  CrmStore._data  = null; } catch (_) {}
        try { if (Array.isArray(State.requests)) State.requests.length = 0; } catch (_) {}
      },
    },
  };

  let _devActiveActionKey = null;

  function _openDevResetModal(actionKey) {
    const act = _devActions[actionKey];
    if (!act) return;
    _devActiveActionKey = actionKey;
    const ov = document.getElementById('devResetOverlay');
    if (!ov) return;
    document.getElementById('devResetTitle').innerHTML =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M10 2L1 18h18L10 2z"/><path d="M10 8v4M10 15v.5"/></svg> ' +
      esc(act.label);
    document.getElementById('devResetSummary').textContent = act.summary;
    document.getElementById('devResetTargets').innerHTML =
      act.targets.map(t => '<li>' + t + '</li>').join('');
    const inp = document.getElementById('devResetConfirmInput');
    const exe = document.getElementById('devResetExecute');
    const err = document.getElementById('devResetError');
    inp.value = '';
    exe.disabled = true;
    if (err) { err.hidden = true; err.textContent = ''; }
    ov.hidden = false;
    setTimeout(() => { try { inp.focus(); } catch (_) {} }, 60);
  }
  function _closeDevResetModal() {
    const ov = document.getElementById('devResetOverlay');
    if (ov) ov.hidden = true;
    _devActiveActionKey = null;
  }

  async function _executeDevResetAction() {
    const key = _devActiveActionKey;
    const act = _devActions[key];
    if (!act) return;
    const exe = document.getElementById('devResetExecute');
    const err = document.getElementById('devResetError');
    const origLabel = exe.textContent;
    exe.disabled = true;
    exe.textContent = 'Working…';
    if (err) { err.hidden = true; err.textContent = ''; }

    console.group('[DevToolkit] executing ' + act.label);
    let tablesCleared = 0;
    let tablesFailed  = [];
    for (const table of (act.tables || [])) {
      try {
        const res = await _devDelete(table);
        if (res.ok) {
          tablesCleared++;
          console.log('[DevToolkit] cleared ' + table);
        } else {
          tablesFailed.push(table);
          console.warn('[DevToolkit] failed to clear ' + table + ':', res.error);
        }
      } catch (e) {
        tablesFailed.push(table);
        console.warn('[DevToolkit] exception clearing ' + table + ':', e);
      }
    }

    // Local cache clear
    const lsRemoved = _devClearLocalStorageKeys(act.localKeys || []);
    try { (act.memReset || (()=>{}))(); } catch (_) {}

    console.log('[DevToolkit] tablesCleared=' + tablesCleared +
                '  tablesFailed=' + tablesFailed.length +
                '  localStorageKeysRemoved=' + lsRemoved);
    console.groupEnd();

    _closeDevResetModal();

    if (tablesFailed.length === 0) {
      showToast('✓ ' + act.label + ' complete — ' + tablesCleared + ' table(s) cleared, ' + lsRemoved + ' local cache key(s) removed.', 'success', 6000);
    } else {
      showToast('⚠ ' + act.label + ' partial — cleared ' + tablesCleared + ', failed: [' + tablesFailed.join(', ') + ']. See console.', 'warn', 8000);
    }

    // Refresh every visible section so the empty state appears immediately.
    try {
      await loadData();
      if (typeof renderPendingRequests        === 'function') renderPendingRequests();
      if (typeof renderWaitingForMatch        === 'function') renderWaitingForMatch();
      if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
      if (typeof renderCompileQueueSection    === 'function') renderCompileQueueSection();
      if (typeof renderDeliveredSection       === 'function') renderDeliveredSection();
      if (typeof renderCrmActive              === 'function') renderCrmActive();
      if (typeof renderCrmInactive            === 'function') renderCrmInactive();
      if (typeof renderCrmHighValue           === 'function') renderCrmHighValue();
      if (typeof _renderIbStarsActive         === 'function') _renderIbStarsActive();
      if (typeof _renderIbStarsInactive       === 'function') _renderIbStarsInactive();
      if (typeof _renderBlockedList           === 'function') _renderBlockedList();
      if (typeof _renderIbChangedList         === 'function') _renderIbChangedList();
      if (typeof renderCrmSearch              === 'function') {
        const q = document.getElementById('crmSearchInput');
        renderCrmSearch(q ? q.value : '');
      }
      if (typeof refreshIntakeQueue           === 'function') refreshIntakeQueue();
    } catch (e) {
      console.warn('[DevToolkit] post-reset refresh failed:', e);
    }

    exe.textContent = origLabel;
  }

  function _bindDevToolkit() {
    // Wire each card's button to the confirmation modal.
    document.querySelectorAll('[data-dev-action]').forEach(btn => {
      if (btn.dataset.devBound === '1') return;
      btn.dataset.devBound = '1';
      btn.addEventListener('click', () => {
        const key = btn.dataset.devAction;
        _openDevResetModal(key);
      });
    });
    const ov  = document.getElementById('devResetOverlay');
    const cls = document.getElementById('devResetClose');
    const cnl = document.getElementById('devResetCancel');
    const exe = document.getElementById('devResetExecute');
    const inp = document.getElementById('devResetConfirmInput');
    if (cls && !cls.dataset.bound) { cls.addEventListener('click', _closeDevResetModal); cls.dataset.bound = '1'; }
    if (cnl && !cnl.dataset.bound) { cnl.addEventListener('click', _closeDevResetModal); cnl.dataset.bound = '1'; }
    if (ov  && !ov.dataset.bound)  {
      ov.addEventListener('click', (e) => { if (e.target === ov) _closeDevResetModal(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && ov && !ov.hidden) _closeDevResetModal();
      });
      ov.dataset.bound = '1';
    }
    if (inp && !inp.dataset.bound) {
      inp.addEventListener('input', () => {
        const v = (inp.value || '').trim();
        if (exe) exe.disabled = (v !== 'RESET PRODUCTION DATA');
      });
      inp.dataset.bound = '1';
    }
    if (exe && !exe.dataset.bound) {
      exe.addEventListener('click', _executeDevResetAction);
      exe.dataset.bound = '1';
    }
  }

  function _bindCreateLicense() {
    const openBtn   = document.getElementById('btnOpenCreateLicense');
    const closeBtn  = document.getElementById('createLicenseClose');
    const cancelBtn = document.getElementById('createLicenseCancel');
    const submitBtn = document.getElementById('createLicenseSubmit');
    const ov        = document.getElementById('createLicenseOverlay');
    if (openBtn   && !openBtn.dataset.bound)   { openBtn.addEventListener('click', _openCreateLicenseModal);  openBtn.dataset.bound   = '1'; }
    if (closeBtn  && !closeBtn.dataset.bound)  { closeBtn.addEventListener('click', _closeCreateLicenseModal); closeBtn.dataset.bound  = '1'; }
    if (cancelBtn && !cancelBtn.dataset.bound) { cancelBtn.addEventListener('click', _closeCreateLicenseModal); cancelBtn.dataset.bound = '1'; }
    if (submitBtn && !submitBtn.dataset.bound) {
      submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        const orig = submitBtn.textContent;
        submitBtn.textContent = 'Submitting…';
        try { await _submitAdminLicenseRequest(); }
        finally { submitBtn.textContent = orig; submitBtn.disabled = false; }
      });
      submitBtn.dataset.bound = '1';
    }
    // Backdrop click + Esc close
    if (ov && !ov.dataset.boundBackdrop) {
      ov.addEventListener('click', (e) => { if (e.target === ov) _closeCreateLicenseModal(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && ov && !ov.hidden) _closeCreateLicenseModal();
      });
      ov.dataset.boundBackdrop = '1';
    }
    // Duplicate-warning buttons
    const dvBtn = document.getElementById('createLicenseDupeView');
    const dcBtn = document.getElementById('createLicenseDupeContinue');
    if (dvBtn && !dvBtn.dataset.bound) {
      dvBtn.addEventListener('click', () => {
        const acct = (document.getElementById('createLicenseAcct').value || '').trim();
        _closeCreateLicenseModal();
        // Open the diagnostic modal if available; else just jump to pending.
        if (_createLicenseState.lastDupe && typeof _openIqInfoModal === 'function') {
          _openIqInfoModal(_createLicenseState.lastDupe.id, normalizeAccountId(acct));
        } else {
          // Navigate to Pending Requests section
          const target = document.querySelector('[data-section="pending"]');
          if (target) target.click();
        }
      });
      dvBtn.dataset.bound = '1';
    }
    if (dcBtn && !dcBtn.dataset.bound) {
      dcBtn.addEventListener('click', () => {
        _createLicenseState.force = true;
        const dup = document.getElementById('createLicenseDupeWarning');
        if (dup) dup.style.display = 'none';
        _submitAdminLicenseRequest();
      });
      dcBtn.dataset.bound = '1';
    }
  }

  function bindEditAndBlock() {
    const ec = document.getElementById('editClientClose');
    const ecCancel = document.getElementById('editClientCancel');
    const ecSave = document.getElementById('editClientSave');
    if (ec) ec.addEventListener('click', _closeEditClientModal);
    if (ecCancel) ecCancel.addEventListener('click', _closeEditClientModal);
    if (ecSave) ecSave.addEventListener('click', _saveEditClient);
    // Phase 17C — wire Create License Request button + modal
    _bindCreateLicense();
    // Phase 17E — wire Development Toolkit reset buttons + confirmation modal
    if (typeof _bindDevToolkit === 'function') _bindDevToolkit();

    // Blocked-Clients search + refresh
    const bsBtn = document.getElementById('blockedSearchBtn');
    const bsIn  = document.getElementById('blockedSearchInput');
    const bsRef = document.getElementById('blockedListRefresh');
    if (bsRef) bsRef.addEventListener('click', _renderBlockedList);
    const doBlockLookup = async () => {
      const raw = (bsIn ? bsIn.value : '').trim();
      const acct = normalizeAccountId(raw);
      const resEl = document.getElementById('blockedSearchResult');
      if (!acct) { showToast('Enter an account number.', 'warn', 2500); return; }
      const req = State.requests.find(r => normalizeAccountId(r.account) === acct);
      const blocked = await _isBlocked(acct);
      if (!resEl) return;
      if (!req && !blocked) {
        resEl.innerHTML = '<div class="ib-changed-banner ib-changed-banner--miss">No account ' + esc(acct) + ' in license_requests.</div>';
        resEl.hidden = false; return;
      }
      const banner = blocked
        ? '<div class="ib-changed-banner ib-changed-banner--already">⚠ Already blocked.</div>'
        : '';
      resEl.innerHTML = banner +
        '<div class="ib-changed-result-grid">' +
          '<div class="ib-changed-result-field"><span class="ib-changed-result-label">Account</span><span class="ib-changed-result-value ib-changed-acct">' + esc(acct) + '</span></div>' +
          '<div class="ib-changed-result-field"><span class="ib-changed-result-label">Email</span><span class="ib-changed-result-value">' + esc((req && req.email) || '—') + '</span></div>' +
          '<div class="ib-changed-result-field"><span class="ib-changed-result-label">WhatsApp</span><span class="ib-changed-result-value">' + esc((req && req.whatsapp) || '—') + '</span></div>' +
          '<div class="ib-changed-result-field"><span class="ib-changed-result-label">Broker</span><span class="ib-changed-result-value">' + esc((req && req.broker) || '—') + '</span></div>' +
        '</div>' +
        '<div class="ib-changed-result-actions" style="gap:10px">' +
          (req ? '<button class="iq-btn iq-btn--action" id="blockedEditBtn" type="button" style="background:rgba(99,102,241,0.18);border-color:rgba(99,102,241,0.4);color:#c7d2fe">Edit Client</button>' : '') +
          (!blocked ? '<button class="btn-mark-ib-changed" id="blockedNowBtn" type="button">Block Client</button>' : '<button class="iq-btn iq-btn--action" id="blockedUnblockBtn" type="button" style="background:rgba(34,197,94,0.16);border-color:rgba(34,197,94,0.45);color:#22c55e">Unblock</button>') +
        '</div>';
      resEl.hidden = false;
      const editBtn = document.getElementById('blockedEditBtn');
      if (editBtn) editBtn.addEventListener('click', () => _openEditClientModal(acct));
      const blkBtn = document.getElementById('blockedNowBtn');
      if (blkBtn) blkBtn.addEventListener('click', async () => {
        blkBtn.disabled = true;
        const res = await _blockClient(acct, req || {}, 'Admin manual block');
        if (res.ok) { showToast('Client blocked.', 'success', 3000); doBlockLookup(); _renderBlockedList(); }
        else { blkBtn.disabled = false; showToast('Block failed: ' + (res.error || 'unknown'), 'error', 4000); }
      });
      const unbBtn = document.getElementById('blockedUnblockBtn');
      if (unbBtn) unbBtn.addEventListener('click', async () => {
        unbBtn.disabled = true;
        const res = await _unblockClient(acct);
        if (res.ok) { showToast('Unblocked.', 'success', 3000); doBlockLookup(); _renderBlockedList(); }
        else { unbBtn.disabled = false; showToast('Unblock failed: ' + (res.error || 'unknown'), 'error', 4000); }
      });
    };
    if (bsBtn) bsBtn.addEventListener('click', doBlockLookup);
    if (bsIn)  bsIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doBlockLookup(); } });
  }

  // Expose as global for inline button clicks if needed
  window._ZTU_openEditClient = (acct) => _openEditClientModal(acct);
  window._ZTU_blockClient    = (acct) => {
    const req = State.requests.find(r => normalizeAccountId(r.account) === normalizeAccountId(acct));
    return _blockClient(acct, req || {}, 'Admin block');
  };

  /* ═══════════════════════════════════════════════════════════
     END PHASE 15.6
  ══════════════════════════════════════════════════════════ */


  /* ─── bindIntakeQueue — wire all queue UI events ─────────── */

  function bindIntakeQueue() {
    const queueEl    = document.getElementById('intakeQueue');
    const tabListEl  = document.getElementById('iqTabList');
    const refreshBtn = document.getElementById('intakeQueueRefresh');
    const exportBtn  = document.getElementById('intakeQueueExport');
    if (!queueEl) return;   // section not present in DOM — safe no-op

    /* ── Tab switching ──────────────────────────────────────── */
    if (tabListEl) {
      tabListEl.addEventListener('click', e => {
        const tab = e.target.closest('[data-iq-tab]');
        if (!tab) return;
        const target = tab.dataset.iqTab;
        _iqActiveTab = target;

        // Update tab active state
        tabListEl.querySelectorAll('[data-iq-tab]').forEach(t => {
          const isActive = t.dataset.iqTab === target;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', String(isActive));
        });

        // Show matching panel, hide others
        const panelId = 'iqPanel' + target.charAt(0).toUpperCase() + target.slice(1);
        queueEl.querySelectorAll('.intake-queue-panel').forEach(p => {
          p.hidden = p.id !== panelId;
        });
      });

      // Activate the first tab on init
      const firstTab = tabListEl.querySelector('[data-iq-tab]');
      if (firstTab) firstTab.click();
    }

    /* ── Header buttons ─────────────────────────────────────── */
    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshIntakeQueue());
    if (exportBtn)  exportBtn.addEventListener('click',  () => _iqExportJSON());

    /* ── Row action delegation ──────────────────────────────── */
    queueEl.addEventListener('click', async e => {
      const btn = e.target.closest('[data-iq-action][data-iq-id]');
      if (!btn || btn.disabled) return;

      const id     = btn.dataset.iqId;
      const action = btn.dataset.iqAction;
      const labels = { compiled: 'Compiled', emailed: 'Emailed', rejected: 'Rejected' };
      const label  = labels[action] || action;

      // Confirm destructive reject action
      if (action === 'rejected') {
        const confirmed = await showConfirmModal(
          `Reject account ${id}? This will move it to Rejected and cannot be undone.`
        );
        if (!confirmed) return;
      }

      // Disable all buttons in this row while writing
      const rowEl = btn.closest('.intake-queue-row');
      if (rowEl) rowEl.querySelectorAll('[data-iq-action]').forEach(b => { b.disabled = true; });

      const ok = await intakeSetStatus(id, action);
      if (ok) {
        showToast(`Marked as ${label}.`, 'success', 3000);
        // Refresh queue + main table so status propagates everywhere
        await refreshIntakeQueue();
        await loadData();
        renderPendingRequests();
        renderWaitingForMatch();
      } else {
        // Re-enable on failure so admin can retry
        if (rowEl) rowEl.querySelectorAll('[data-iq-action]').forEach(b => { b.disabled = false; });
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     END PHASE 14B
  ══════════════════════════════════════════════════════════ */


  /* ═══════════════════════════════════════════════════════════
     PHASE 15 — ONE CLICK AUTOMATION ENGINE
     Single-button pipeline that runs after a broker file is
     parsed and previewed.  Sequence:
       1. DB writes — matched → compile_ready, unmatched → RetryPool
       2. Email queue — localStorage payload per account / message type
       3. WhatsApp batch queue — batches of 10, localStorage
       4. Finalize — refresh all dashboard sections
       5. Summary modal — counts + errors

     Storage keys:
       ZTU_EMAIL_QUEUE_V1  — email payload array
       ZTU_WA_QUEUE_V1     — WhatsApp batch array

     Nothing is sent automatically.  Admin reviews queues before
     taking delivery action in a future phase.
  ══════════════════════════════════════════════════════════ */

  const AUTO_EMAIL_KEY = 'ZTU_EMAIL_QUEUE_V1';
  const AUTO_WA_KEY    = 'ZTU_WA_QUEUE_V1';
  const AUTO_WA_BATCH  = 10;   // contacts per WhatsApp batch

  /* ── Phase 16.1 — simplified message templates (Issues 3 + 4)
     ──────────────────────────────────────────────────────────────
     Only TWO customer email types now exist:
       A. matched  → ONE email, sent by master_engine.ps1 STEP 7 with
                     EX5 attachment.  Dashboard pre-delivery copy below
                     is unused for live customers (kept for WhatsApp
                     templates the admin sends manually).
       B. waiting / not_found → single 48-hour notification.
                     Both pull from this same simplified copy.  The
                     dedup guard at _insertEmailOutbox ensures each
                     account receives it at most ONCE.
  */
  const AUTO_MSG = {
    matched: {
      subject: 'Your ZTU Bot — Account Matched & Delivered',
      body: (name) =>
        `Hi ${name || 'there'},\n\n` +
        `Congratulations — your trading account has been matched and your personalised EA file is attached to this email.\n\n` +
        `Install it on your MT5 platform as directed in our setup guide. The bot will activate automatically on your confirmed broker account.\n\n` +
        `Thank you for registering with ZTU.\n\nBest regards,\nZTU Support Team`,
      wa: (name, acct) =>
        `✅ *ZTU Bot Delivered*\n\nHi ${name || 'there'}, your account *${acct}* has been matched and your EA file has been emailed to you. Check your inbox.`,
    },
    waiting: {
      subject: 'Your ZTU Bot Account — Not Matched Yet (48-hour re-check)',
      body: (name) =>
        `Hi ${name || 'there'},\n\n` +
        `Your account has not matched yet.\n\n` +
        `The system will automatically re-check for up to 48 hours after submission.\n` +
        `• If matched during this period → your file will be delivered automatically.\n` +
        `• If still not matched after 48 hours, the likely cause is one of:\n` +
        `   - referral / IB code missing on registration\n` +
        `   - broker account not created through our referral link\n` +
        `   - existing broker account used instead of a new account\n` +
        `   - registration did not complete fully\n\n` +
        `If still unresolved after 48 hours, please contact support.\n\nBest regards,\nZTU Support Team`,
      wa: (name, acct) =>
        `⏳ *ZTU Bot — Not Matched Yet*\n\nHi ${name || 'there'}, account *${acct}* hasn't matched yet. We'll keep checking for up to 48 hours. If matched, delivery is automatic.`,
    },
    not_found: {
      subject: 'Your ZTU Bot Account — Not Matched After 48 Hours',
      body: (name) =>
        `Hi ${name || 'there'},\n\n` +
        `Your account has not matched after the 48-hour review window.\n\n` +
        `Likely cause:\n` +
        `• referral / IB code missing on registration\n` +
        `• broker account not created through our referral link\n` +
        `• existing broker account used instead of a new account\n` +
        `• registration did not complete fully\n\n` +
        `Please re-check the steps above, or contact support and we'll help.\n\nBest regards,\nZTU Support Team`,
      wa: (name, acct) =>
        `❌ *ZTU Bot — Not Matched*\n\nHi ${name || 'there'}, after 48 hours of checks, account *${acct}* could not be confirmed under our IB referral. Please re-register using our official link or contact support.`,
    },
    // Phase 16.1 — Issue 2 + 6 new template: once-only "already processed".
    already_processed: {
      subject: 'Your ZTU Bot — Account Already Delivered',
      body: (name) =>
        `Hi ${name || 'there'},\n\n` +
        `Your account was already created and your EA file was previously delivered successfully.\n\n` +
        `Please check your email inbox including the spam/junk folder.\n` +
        `If not found, contact support.\n\nBest regards,\nZTU Support Team`,
      wa: (name, acct) =>
        `ℹ️ *ZTU Bot — Already Delivered*\n\nHi ${name || 'there'}, account *${acct}* was already delivered previously. Please check your email inbox and spam folder.`,
    },
  };

  /* ── Tiny unique-enough ID helper ──────────────────────── */
  function _autoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ── Progress step updater ──────────────────────────────── */
  function _autoSetStep(stepId, status) {
    const el = document.getElementById(stepId);
    if (!el) return;
    el.dataset.status = status;   // CSS drives the visual (pending/running/done/error)
  }

  /* ── Build one email queue item ─────────────────────────── */
  function _buildEmailItem(req, type) {
    const tmpl   = AUTO_MSG[type] || AUTO_MSG.waiting;
    const name   = req.name || req.email || 'there';
    const acct   = req.account || req.id || '';
    const emailAddr = req.email || '';
    return {
      id:         _autoId(),
      type,
      account:    acct,
      email:      emailAddr,
      subject:    tmpl.subject,
      body:       tmpl.body(name),
      request_id: req.id || null,        // Phase 15.4 — FK to license_requests
      status:     'queued',
      queued_at:  new Date().toISOString(),
    };
  }

  /* ── Build one WhatsApp queue item ──────────────────────── */
  function _buildWaItem(req, type) {
    const tmpl   = AUTO_MSG[type] || AUTO_MSG.waiting;
    const name   = req.name || req.email || 'there';
    const acct   = req.account || req.id || '';
    return {
      id:         _autoId(),
      type,
      account:    acct,
      email:      req.email   || '',
      whatsapp:   req.whatsapp || '',
      message:    tmpl.wa(name, acct),
      request_id: req.id || null,        // Phase 15.4 — FK to license_requests
      status:     'pending',
      queued_at:  new Date().toISOString(),
    };
  }

  /* ── Split flat WA item list into batches of AUTO_WA_BATCH ─ */
  /*
   * Phase 15.4 fix: group items by template type FIRST, then chunk
   * within each type.  Each batch is uniform (all matched, or all
   * waiting, or all not_found, or all campaign) — no template mixing.
   * This eliminates the bug where one contact in a batch received the
   * wrong template because the modal used items[0].message for everyone.
   */
  function _buildWaBatches(items) {
    if (!items || items.length === 0) return [];

    // Stable type ordering
    const TYPE_ORDER = ['matched', 'waiting', 'not_found', 'campaign'];
    const groups = {};
    items.forEach(it => {
      const t = it.type || 'waiting';
      if (!groups[t]) groups[t] = [];
      groups[t].push(it);
    });

    const batches = [];
    let batchCounter = 1;
    TYPE_ORDER.forEach(type => {
      const grp = groups[type];
      if (!grp || grp.length === 0) return;
      for (let i = 0; i < grp.length; i += AUTO_WA_BATCH) {
        const slice = grp.slice(i, i + AUTO_WA_BATCH);
        // Stamp each item with its batch_number so wa_outbox INSERT preserves grouping
        const bNum = batchCounter++;
        slice.forEach(it => { it.batch_number = bNum; });
        batches.push({
          batch_number: bNum,
          type,                       // ← new: uniform-type label
          status:       'pending',
          items:        slice,
          created_at:   new Date().toISOString(),
        });
      }
    });

    // Catch any unknown types not in TYPE_ORDER (defensive)
    Object.keys(groups).forEach(t => {
      if (TYPE_ORDER.includes(t)) return;
      const grp = groups[t];
      for (let i = 0; i < grp.length; i += AUTO_WA_BATCH) {
        const slice = grp.slice(i, i + AUTO_WA_BATCH);
        const bNum = batchCounter++;
        slice.forEach(it => { it.batch_number = bNum; });
        batches.push({
          batch_number: bNum,
          type:         t,
          status:       'pending',
          items:        slice,
          created_at:   new Date().toISOString(),
        });
      }
    });

    return batches;
  }

  /* ── Persist email queue to localStorage ────────────────── */
  function _saveEmailQueue(items) {
    try {
      const payload = {
        version:    1,
        created_at: new Date().toISOString(),
        count:      items.length,
        items,
      };
      window.localStorage.setItem(AUTO_EMAIL_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[Phase15] Email queue save failed (non-fatal):', e);
    }
  }

  /* ── Persist WhatsApp batch queue to localStorage ────────── */
  function _saveWaQueue(batches) {
    try {
      const payload = {
        version:       1,
        created_at:    new Date().toISOString(),
        total_batches: batches.length,
        total_items:   batches.reduce((s, b) => s + b.items.length, 0),
        batches,
      };
      window.localStorage.setItem(AUTO_WA_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[Phase15] WA queue save failed (non-fatal):', e);
    }
  }

  /* ── Show automation summary modal ──────────────────────── */
  function _showAutoSummary(counts) {
    const overlay = document.getElementById('autoSummaryOverlay');
    const grid    = document.getElementById('autoSummaryGrid');
    if (!overlay || !grid) return;

    const rows = [
      { label: 'Matched Accounts',  val: counts.matched,      cls: 'auto-stat--green' },
      { label: 'Compile Ready',     val: counts.compileReady, cls: 'auto-stat--purple' },
      { label: 'Waiting for Match', val: counts.waiting,      cls: 'auto-stat--amber' },
      { label: 'Match Not Found',   val: counts.notFound,     cls: 'auto-stat--error' },
      { label: 'Emails Queued',     val: counts.emailsQueued, cls: 'auto-stat--blue' },
      { label: 'WhatsApp Batches',  val: counts.waBatches,    cls: 'auto-stat--teal' },
    ];

    grid.innerHTML = rows.map(r =>
      `<div class="auto-stat ${r.cls}">
        <span class="auto-stat-val">${r.val}</span>
        <span class="auto-stat-label">${r.label}</span>
      </div>`
    ).join('');

    if (counts.errors > 0) {
      grid.insertAdjacentHTML('beforeend',
        `<p class="auto-summary-error-note">⚠ ${counts.errors} write error${counts.errors !== 1 ? 's' : ''} — check console for details.</p>`
      );
    }

    overlay.hidden = false;
  }

  /* ── Main automation engine ─────────────────────────────── */
  async function runBrokerAutomation() {
    if (IntakeState.isProcessing) return;
    if (!IntakeState.matchResult) {
      showToast('No broker file loaded. Upload a file first.', 'warn', 3000);
      return;
    }

    const { matched, unmatched, queued } = IntakeState.matchResult;
    const archivedPool = RetryPool.getArchived();
    const totalWork    = queued.length + unmatched.length;

    if (totalWork === 0 && matched.length === 0) {
      showToast('Nothing to automate — no actionable accounts found.', 'info', 3000);
      return;
    }

    // ── Confirmation ──────────────────────────────────────────
    const confirmLines = [
      `Run full automation for this broker file?`,
      '',
      `• ${matched.length} account${matched.length !== 1 ? 's' : ''} → Compile Queue`,
      unmatched.length > 0
        ? `• ${unmatched.length} account${unmatched.length !== 1 ? 's' : ''} → Waiting for Match`
        : null,
      archivedPool.length > 0
        ? `• ${archivedPool.length} expired → Match Not Found queue`
        : null,
      '',
      `Emails will be inserted into Supabase email_outbox for server delivery.`,
      `WhatsApp messages will be inserted into wa_outbox and grouped by template type.`,
    ].filter(l => l !== null).join('\n');

    const ok = await showConfirmModal(confirmLines);
    if (!ok) return;

    // ── Begin ─────────────────────────────────────────────────
    IntakeState.isProcessing = true;
    iels.preview.hidden      = true;
    const progEl = document.getElementById('autoProgress');
    if (progEl) progEl.hidden = false;

    let successCount = 0;
    let failCount    = 0;
    let poolAddCount = 0;
    let archiveCount = 0;
    const errors     = [];

    // ─────────────────────────────────────────────────────────
    // STEP 0 — Phase 16.5 PART C: SYNCHRONOUS IB Change intake enforcement
    // ─────────────────────────────────────────────────────────
    // Detect IB-changed accounts BEFORE STEP 1 so the access-control filter
    // below sees the freshest flags.  Old order ran detection in STEP 4.6
    // (post-STEP 1), letting newly-blank-partner-code accounts slip through
    // the matching gate on the same upload they were flagged in.
    try {
      _autoSetStep('autoStep1', 'running');   // re-using the step indicator; we re-set below
      // Mirror broker rows to Supabase broker_accounts FIRST so the Supabase
      // scan can see the just-uploaded partner_code values.
      try {
        await _persistBrokerAccounts(
          IntakeState.parsedRows || [],
          IntakeState.columns    || [],
          IntakeState.file ? IntakeState.file.name : null
        );
      } catch (e) {
        console.warn('[Phase16.5 PART C] early broker_accounts persist failed (non-fatal):', e);
      }

      // In-file pass: flags any serviced account absent from latest broker
      // file OR present with blank / wrong partner_code.
      try {
        await _autoDetectIbChanges(
          IntakeState.parsedRows || [],
          IntakeState.columns    || []
        );
      } catch (e) {
        console.warn('[Phase16.5 PART C] in-file IB Changed scan failed (non-fatal):', e);
      }

      // Supabase-backed pass: walks broker_accounts looking for blank/wrong
      // partner_code — catches accounts the in-file pass missed.
      try {
        await _autoDetectFromBrokerAccounts();
      } catch (e) {
        console.warn('[Phase16.5 PART C] Supabase IB Changed scan failed (non-fatal):', e);
      }

      // Force a fresh read of ib_changed_accounts so the STEP 1 filter below
      // sees the rows we just inserted.
      _invalidateIbChangedCache();
    } catch (e) {
      console.warn('[Phase16.5 PART C] pre-STEP-1 IB Changed enforcement failed (non-fatal):', e);
    }

    // ─────────────────────────────────────────────────────────
    // STEP 1 — Matched accounts → compile_ready (Supabase writes)
    // ─────────────────────────────────────────────────────────
    _autoSetStep('autoStep1', 'running');

    // Phase 15.6 Task 6c + Phase 16.2 — access-control pre-filter.
    // Skip any matched account that has been flagged as IB Changed OR Blocked.
    let ibChangedSkipped = 0;
    let blockedSkipped   = 0;
    await _ensureIbChangedSet();
    await _ensureBlockedSet();
    const queuedAllowed = [];
    for (const req of queued) {
      const acctN = normalizeAccountId(req.account);
      if (_blockedSet.has(acctN)) {
        console.log(`[Phase16.2/Blocked] skipping compile for ${req.account} — admin blocked`);
        blockedSkipped++;
        continue;
      }
      if (_ibChangedSet.has(acctN)) {
        console.log(`[Phase15.6/IBChanged] skipping compile for ${req.account} — flagged as IB Changed`);
        ibChangedSkipped++;
        continue;
      }
      queuedAllowed.push(req);
    }
    if (ibChangedSkipped > 0) {
      errors.push(`${ibChangedSkipped} IB-changed account(s) skipped from compile.`);
    }

    let recoveredFromNotFound = 0;
    for (const req of queuedAllowed) {
      if (WriteLock.has(req.id)) continue;
      WriteLock.add(req.id);
      try {
        const c = req.canonicalDb || normalizeDbStatus(req.dbStatus || req.status || '');
        if (c === 'pending' || c === 'unmatched') {
          await DataLayer.updateStatus(req.id, 'matched',        'pending');
          await DataLayer.updateStatus(req.id, 'compile_ready',  'matched');
        } else if (c === 'matched') {
          await DataLayer.updateStatus(req.id, 'compile_ready',  'matched');
        }
        // Phase 16.7 Issue 4 — if this account was in the archived
        // (Not Found After 48h) pool, mark it as recovered BEFORE we
        // remove it so the dashboard can flash the "Recovered Match"
        // badge for the standard 24h grace window.
        const poolEntry = RetryPool.getById(req.id);
        if (poolEntry && poolEntry.archived) {
          RetryPool.recover(req.id);
          recoveredFromNotFound++;
          console.log('[Phase16.7] RECOVERED ' + req.account + ' — un-archived from Not Found, status → compile_ready');
        } else {
          // Delayed match — remove from RetryPool if it was waiting (and not archived).
          RetryPool.remove(req.id);
        }
        successCount++;
      } catch (e) {
        failCount++;
        errors.push(`${req.account}: ${e.message}`);
        console.error('[Phase15] compile_ready write failed:', req.account, e);
      } finally {
        WriteLock.delete(req.id);
      }
    }
    if (recoveredFromNotFound > 0) {
      errors.push(`✓ ${recoveredFromNotFound} previously Not Found account(s) recovered into matched pipeline.`);
    }

    _autoSetStep('autoStep1', failCount > successCount ? 'error' : 'done');

    // ─────────────────────────────────────────────────────────
    // STEP 2 — Unmatched → RetryPool or archive (Supabase + localStorage)
    // ─────────────────────────────────────────────────────────
    _autoSetStep('autoStep2', 'running');

    for (const req of unmatched) {
      if (WriteLock.has(req.id)) continue;
      WriteLock.add(req.id);
      try {
        const poolEntry = RetryPool.getById(req.id);
        const expired   = poolEntry && RetryPool.isExpired(poolEntry);

        if (expired) {
          // 7-day window elapsed — write unmatched to DB + archive from pool
          const c = req.canonicalDb || normalizeDbStatus(req.dbStatus || req.status || '');
          if (c === 'pending') await writeUnmatched(req.id);
          RetryPool.archive(req.id);
          archiveCount++;
        } else {
          // Within window — track in pool, keep DB as pending
          RetryPool.upsert(req);
          poolAddCount++;
        }
        successCount++;
      } catch (e) {
        failCount++;
        errors.push(`${req.account}: ${e.message}`);
        console.error('[Phase15] retry-pool write failed:', req.account, e);
      } finally {
        WriteLock.delete(req.id);
      }
    }

    _autoSetStep('autoStep2', 'done');

    // ─────────────────────────────────────────────────────────
    // STEP 3 — Email Queue (localStorage — no sending)
    // ─────────────────────────────────────────────────────────
    _autoSetStep('autoStep3', 'running');

    const emailItems = [];

    // Matched → approval email
    // Phase 16 follow-up #4 — Issue 2 (Simplify email automation).
    // Removed the pre-delivery "matched" announcement email — the customer
    // now receives ONE email only: the delivery email with EX5 attached,
    // sent by master_engine.ps1 STEP 7 after compile completes.
    // Original line (disabled): matched.forEach(r => emailItems.push(_buildEmailItem(r, 'matched')));

    // Unmatched within 7-day window → waiting email
    const waitingThisRun = unmatched.filter(r => {
      const e = RetryPool.getById(r.id);
      return e && !e.archived;
    });
    waitingThisRun.forEach(r => emailItems.push(_buildEmailItem(r, 'waiting')));

    // Expired this run → not_found email
    const archivedThisRun = unmatched.filter(r => {
      const e = RetryPool.getById(r.id);
      return e && e.archived;
    });
    archivedThisRun.forEach(r => emailItems.push(_buildEmailItem(r, 'not_found')));

    _saveEmailQueue(emailItems);

    // Console audit log — server-side function can pick these up
    if (emailItems.length > 0) {
      console.group(`[Phase15] Email queue prepared — ${emailItems.length} item(s):`);
      emailItems.forEach(item =>
        console.log(`  [${item.type}] ${item.email} | account: ${item.account}`)
      );
      console.log('Key:', AUTO_EMAIL_KEY);
      console.groupEnd();
    }

    _autoSetStep('autoStep3', 'done');

    // ─────────────────────────────────────────────────────────
    // STEP 4 — WhatsApp Batch Queue (localStorage — no sending)
    // ─────────────────────────────────────────────────────────
    _autoSetStep('autoStep4', 'running');

    const waItems = [];
    matched.forEach(r => waItems.push(_buildWaItem(r, 'matched')));
    waitingThisRun.forEach(r => waItems.push(_buildWaItem(r, 'waiting')));
    archivedThisRun.forEach(r => waItems.push(_buildWaItem(r, 'not_found')));

    const waBatches = _buildWaBatches(waItems);
    _saveWaQueue(waBatches);

    if (waBatches.length > 0) {
      console.group(`[Phase15] WhatsApp queue prepared — ${waBatches.length} batch(es), ${waItems.length} contact(s):`);
      waBatches.forEach(b =>
        console.log(`  Batch ${b.batch_number} (${b.type}): ${b.items.length} contact(s) — status: ${b.status}`)
      );
      console.log('Key:', AUTO_WA_KEY);
      console.groupEnd();
    }

    _autoSetStep('autoStep4', 'done');

    // ─────────────────────────────────────────────────────────
    // STEP 4.5 — Phase 15.4: INSERT into Supabase outbox tables
    //   email_outbox  → server-side SMTP worker picks up
    //   wa_outbox     → record of WA batch contents (admin-driven send)
    // ─────────────────────────────────────────────────────────
    let emailOutboxInserted = 0;
    let waOutboxInserted    = 0;
    let outboxErrors        = 0;

    if (emailItems.length > 0) {
      const emailRes = await _insertEmailOutbox(emailItems);
      if (emailRes.error) {
        outboxErrors++;
        errors.push(`email_outbox: ${emailRes.error.message || 'insert failed'}`);
      } else {
        emailOutboxInserted = emailRes.inserted.length;
        // Stitch returned outbox IDs back onto local items so the UI
        // can refer to them (e.g. for Retry actions).
        emailRes.inserted.forEach((row, i) => {
          if (emailItems[i]) emailItems[i].outbox_id = row.id;
        });
        // Refresh local cache for the UI
        _currentEmailOutbox = emailRes.inserted.concat(_currentEmailOutbox).slice(0, 200);
      }
    }

    console.log('[WA DEBUG] waItems length:', waItems.length);
    console.log('[WA DEBUG] waItems payload:', waItems);
    if (waItems.length > 0) {
      const waRes = await _insertWaOutbox(waItems);
      console.log('[WA DEBUG] waRes:', waRes);
      if (waRes.error) {
        outboxErrors++;
        errors.push(`wa_outbox: ${waRes.error.message || 'insert failed'}`);
      } else {
        waOutboxInserted = waRes.inserted.length;
        // Match outbox rows back to local items by recipient+batch so the
        // send-flow can flip rows to 'sent' on Mark Batch Complete.
        // Server may return rows in any order — match by (whatsapp + batch).
        const byKey = {};
        waRes.inserted.forEach(row => {
          const k = `${row.recipient_phone}|${row.batch_number || ''}`;   // Phase 15.4 fix: column is recipient_phone
          byKey[k] = row;
        });
        waItems.forEach(item => {
          const k = `${item.whatsapp || ''}|${item.batch_number || ''}`;
          if (byKey[k]) item.outbox_id = byKey[k].id;
        });
        // Persist outbox_id back into the localStorage batch queue so the
        // send-flow modal can read it.
        const persistedQueue = _readWaQueue();
        if (persistedQueue && persistedQueue.batches) {
          persistedQueue.batches.forEach(batch => {
            (batch.items || []).forEach(it => {
              const matchingLocal = waItems.find(w => w.id === it.id);
              if (matchingLocal && matchingLocal.outbox_id) {
                it.outbox_id = matchingLocal.outbox_id;
              }
            });
          });
          _writeWaQueue(persistedQueue);
        }
      }
    }

    console.log(
      `[Phase15.4] outbox writes — email: ${emailOutboxInserted}/${emailItems.length}, ` +
      `wa: ${waOutboxInserted}/${waItems.length}, errors: ${outboxErrors}`
    );

    // ─────────────────────────────────────────────────────────
    // STEP 4.6 — Phase 15.6: IB Stars activity + IB Changed auto-detect
    // Hooks read directly from IntakeState.parsedRows / .columns.
    // Both run AFTER STEP 1 (license_requests now reflect new statuses)
    // and BEFORE STEP 5 refresh (so renders pick up the new state).
    // ─────────────────────────────────────────────────────────
    let ibStarsTransitions = { transitionsToInactive: [], transitionsToActive: [] };
    let ibChangedDetected  = { inserted: 0, skipped: 0 };
    let baPersisted        = { upserted: 0, errors: 0 };
    try {
      // Refresh license_requests cache so auto-detect sees the just-updated statuses.
      // (We just did Supabase UPDATEs in STEP 1; State.requests is stale until loadData runs.)
      await loadData();

      // Phase 16.5 PART C — broker_accounts persist + IB Changed detection
      // already ran synchronously in STEP 0 above.  Skipping them here avoids
      // duplicate Supabase round-trips.  IbStars still needs to run since the
      // pre-STEP-1 block didn't touch it.
      ibStarsTransitions = IbStars.updateFromBrokerRows(
        IntakeState.parsedRows || [],
        IntakeState.columns    || []
      );

      if (ibStarsTransitions.transitionsToInactive.length > 0) {
        await _enqueueIbInactiveNotifications(ibStarsTransitions.transitionsToInactive);
      }
    } catch (e) {
      console.warn('[Phase15.6] IB Stars / IB Changed / broker_accounts hook failed (non-fatal):', e);
    }

    // ─────────────────────────────────────────────────────────
    // STEP 5 — Finalize: refresh all dashboard sections
    // ─────────────────────────────────────────────────────────
    _autoSetStep('autoStep5', 'running');

    await loadData();
    renderWaitingForMatch();
    renderPendingRequests();
    refreshIntakeQueue();
    // Phase 15.6 — keep IB sidebar pages in sync if they're already mounted.
    try { _renderIbStarsActive(); _renderIbStarsInactive(); _renderIbChangedList(); } catch (e) {}

    _autoSetStep('autoStep5', 'done');

    // ─────────────────────────────────────────────────────────
    // COMPLETE — hide progress, show summary modal
    // ─────────────────────────────────────────────────────────
    if (progEl) progEl.hidden = true;
    IntakeState.isProcessing  = false;

    _showAutoSummary({
      matched:      matched.length,
      compileReady: queued.length,
      waiting:      poolAddCount,
      notFound:     archiveCount,
      emailsQueued: emailOutboxInserted,    // real DB-confirmed insert count
      waBatches:    waBatches.length,
      errors:       failCount + outboxErrors,
    });

    // Phase 15.1 — refresh delivery panels now that queues are populated
    renderDeliveryPanels();
  }

  /* ── bindRunAutomation — wire button + modal actions ────── */
  function bindRunAutomation() {
    const runBtn      = document.getElementById('intakeRunAutomation');
    const closeBtn    = document.getElementById('autoSummaryCloseBtn');
    const uploadBtn   = document.getElementById('autoSummaryUploadBtn');
    const overlay     = document.getElementById('autoSummaryOverlay');

    if (runBtn)    runBtn.addEventListener('click', () => runBrokerAutomation());
    if (closeBtn)  closeBtn.addEventListener('click', () => {
      if (overlay) overlay.hidden = true;
      // Scroll to compilation queue so admin sees results immediately
      const queueEl = document.getElementById('intakeQueue');
      if (queueEl) queueEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (uploadBtn) uploadBtn.addEventListener('click', () => {
      if (overlay) overlay.hidden = true;
      resetIntake();
    });
  }

  /* ── showRunAutomationBtn / hideRunAutomationBtn helpers ── */
  function _showRunAutomationBtn(show) {
    const el = document.getElementById('intakeRunCta');
    if (el) el.hidden = !show;
  }

  /* ═══════════════════════════════════════════════════════════
     END PHASE 15
  ══════════════════════════════════════════════════════════ */


  /* ═══════════════════════════════════════════════════════════
     PHASE 15.1 — DELIVERY LAYER
     Part A: Email Delivery Panel
     Part B: WhatsApp Batch Launcher
     Part C: Editable WA Review Modal
     Part D: Batch Send Flow (wa.me links, per-contact)
     Part E: Campaign Builder Integration
  ══════════════════════════════════════════════════════════ */

  /* ── Internal send-flow state ─────────────────────────── */
  let _waSendFlowState = {
    batchIdx:  -1,
    editedMsg: '',
    ctaUrl:    '',
    support:   '',
    final:     '',
    opened:    new Set(),
  };

  /* ── localStorage read/write helpers ───────────────────── */

  function _readEmailQueue() {
    try {
      const raw = window.localStorage.getItem(AUTO_EMAIL_KEY);
      if (!raw) return null;
      return JSON.parse(raw);          // { version, created_at, count, items }
    } catch (e) { return null; }
  }

  function _readWaQueue() {
    try {
      const raw = window.localStorage.getItem(AUTO_WA_KEY);
      if (!raw) return null;
      return JSON.parse(raw);          // { version, created_at, total_batches, total_items, batches }
    } catch (e) { return null; }
  }

  function _writeEmailQueue(payload) {
    try { window.localStorage.setItem(AUTO_EMAIL_KEY, JSON.stringify(payload)); }
    catch (e) { console.warn('[Phase15.1] Email queue write failed:', e); }
  }

  function _writeWaQueue(payload) {
    try { window.localStorage.setItem(AUTO_WA_KEY, JSON.stringify(payload)); }
    catch (e) { console.warn('[Phase15.1] WA queue write failed:', e); }
  }

  /* ─────────────────────────────────────────────────────────
     PART A — Email Delivery Panel
  ───────────────────────────────────────────────────────── */

  /*
   * Phase 15.4 — show REAL email_outbox state.  Pulls rows from
   * Supabase and renders per-item status badges.  Falls back to the
   * old localStorage queue if the table is missing (e.g. migration
   * not yet run) — but clearly labels that fallback so the admin
   * never sees a false "Sent" claim.
   */
  async function renderEmailDeliveryPanel() {
    const panel      = document.getElementById('emailDeliveryPanel');
    const badge      = document.getElementById('emailQueueCountBadge');
    const progLabel  = document.getElementById('emailProgressLabel');
    const doneLabel  = document.getElementById('emailDoneLabel');
    const sendBtn    = document.getElementById('btnSendAllEmails');
    const listEl     = document.getElementById('emailOutboxList');
    const summaryEl  = document.getElementById('emailStatusSummary');
    if (!panel) return;

    // Pull real rows from Supabase
    const rows = await _fetchEmailOutbox(50);
    _currentEmailOutbox = rows;

    // Hide panel only if outbox AND legacy queue are both empty
    const legacyQueue = _readEmailQueue();
    const legacyItems = legacyQueue ? legacyQueue.items || [] : [];
    if (rows.length === 0 && legacyItems.length === 0) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;

    // Count buckets
    const buckets = { pending: 0, sending: 0, sent: 0, failed: 0 };
    rows.forEach(r => {
      if (buckets.hasOwnProperty(r.status)) buckets[r.status]++;
    });

    // Header badge — total active queue
    if (badge) {
      const active = buckets.pending + buckets.sending;
      badge.textContent = `${active} queued · ${buckets.sent} sent`;
    }

    // Done/progress labels
    if (progLabel) progLabel.hidden = true;
    if (doneLabel) {
      if (buckets.pending === 0 && buckets.sending === 0 && buckets.sent > 0 && buckets.failed === 0) {
        doneLabel.textContent = `✓ ${buckets.sent} email${buckets.sent !== 1 ? 's' : ''} confirmed delivered by server`;
        doneLabel.hidden      = false;
      } else if (buckets.failed > 0) {
        doneLabel.textContent = `⚠ ${buckets.failed} email${buckets.failed !== 1 ? 's' : ''} failed — click Retry on each row`;
        doneLabel.hidden      = false;
      } else {
        doneLabel.hidden = true;
      }
    }

    // Per-item list
    if (listEl) {
      if (rows.length > 0) {
        const TYPE_LABELS = {
          matched:   'Matched',
          waiting:   'Waiting (24–48h)',
          not_found: 'Not Found',
          campaign:  'Campaign',
        };
        listEl.innerHTML = rows.map(r => {
          const status     = r.status || 'pending';
          const typeLabel  = TYPE_LABELS[r.template_type] || (r.template_type || '');
          const retryBtn   = status === 'failed'
            ? `<button class="btn-retry-outbox" data-table="email_outbox" data-id="${esc(r.id)}">Retry</button>`
            : '';
          const errNote    = r.error_message ? ` · ${esc(r.error_message)}` : '';
          return (
            `<li class="delivery-item">` +
              `<div class="delivery-item-info">` +
                `<span class="delivery-item-recipient">${esc(r.recipient_email)}</span>` +
                `<span class="delivery-item-meta">${esc(typeLabel)}${r.recipient_account ? ' · ' + esc(r.recipient_account) : ''}${errNote}</span>` +
              `</div>` +
              `<span class="delivery-status-badge delivery-status-badge--${esc(status)}">${esc(status)}</span>` +
              retryBtn +
            `</li>`
          );
        }).join('');
      } else {
        // Outbox empty but legacy queue still has items — fallback label
        listEl.innerHTML =
          `<li class="delivery-item"><div class="delivery-item-info"><span class="delivery-item-recipient">No outbox rows.</span>` +
          `<span class="delivery-item-meta">${legacyItems.length} item(s) in legacy localStorage queue. Run automation again to populate email_outbox.</span></div></li>`;
      }
    }

    // Summary line
    if (summaryEl) {
      const parts = [];
      if (buckets.pending > 0) parts.push(`${buckets.pending} pending`);
      if (buckets.sending > 0) parts.push(`${buckets.sending} sending`);
      if (buckets.sent    > 0) parts.push(`${buckets.sent} sent`);
      if (buckets.failed  > 0) parts.push(`${buckets.failed} failed`);
      summaryEl.textContent = parts.length > 0
        ? parts.join(' · ') + ' · Server worker polls outbox on its own schedule.'
        : '';
    }

    // Button — now "Refresh" instead of "Send"
    if (sendBtn) sendBtn.disabled = false;
  }

  /*
   * Phase 15.4 — this used to flip status='sent' in localStorage.
   * Now it just re-queries Supabase so the admin can see updated
   * server status without waiting for the poller.  No fake "send" happens.
   */
  async function sendAllEmails() {
    showToast('Refreshing email delivery status from server…', 'info', 1500);
    await renderEmailDeliveryPanel();
  }

  /* ── Retry handler — flips a failed outbox row back to pending ── */
  async function _handleOutboxRetryClick(e) {
    const btn = e.target.closest('.btn-retry-outbox');
    if (!btn) return;
    const table = btn.dataset.table;
    const id    = btn.dataset.id;
    if (!table || !id) return;
    btn.disabled    = true;
    btn.textContent = 'Retrying…';
    const ok = await _retryFailedOutboxRow(table, id);
    if (ok) {
      showToast('Marked for retry — server will pick up shortly.', 'success', 3000);
      await renderEmailDeliveryPanel();
    } else {
      btn.disabled    = false;
      btn.textContent = 'Retry';
      showToast('Retry failed — see console.', 'error', 3000);
    }
  }

  /* ── Start / stop email outbox polling while panel is visible ── */
  function _startEmailOutboxPoll() {
    if (_emailOutboxPoll) return;
    _emailOutboxPoll = setInterval(() => {
      const panel = document.getElementById('emailDeliveryPanel');
      if (!panel || panel.hidden) return;
      renderEmailDeliveryPanel();
    }, OUTBOX.POLL_MS);
  }
  function _stopEmailOutboxPoll() {
    if (_emailOutboxPoll) { clearInterval(_emailOutboxPoll); _emailOutboxPoll = null; }
  }

  /* ─────────────────────────────────────────────────────────
     PART B — WhatsApp Batch Launcher
  ───────────────────────────────────────────────────────── */

  function renderWaDeliveryPanel() {
    const panel     = document.getElementById('waDeliveryPanel');
    const badge     = document.getElementById('waBatchCountBadge');
    const batchList = document.getElementById('waBatchList');
    const sendFlow  = document.getElementById('waSendFlow');
    if (!panel) return;

    const queue = _readWaQueue();
    const batches = queue ? queue.batches || [] : [];

    if (batches.length === 0) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    if (sendFlow)  sendFlow.hidden  = true;    // always reset to list view on render
    if (batchList) batchList.hidden = false;
    if (badge)     badge.textContent = `${batches.length} batch${batches.length !== 1 ? 'es' : ''}`;

    if (!batchList) return;
    batchList.innerHTML = batches.map((batch, idx) =>
      _renderBatchRow(batch, idx, batches)
    ).join('');
  }

  function _renderBatchRow(batch, idx, allBatches) {
    const isCompleted = batch.status === 'completed';
    const prevDone    = idx === 0 || (allBatches[idx - 1] && allBatches[idx - 1].status === 'completed');
    const isLocked    = !isCompleted && !prevDone;
    const bNum        = batch.batch_number || (idx + 1);
    const contactCount = batch.items ? batch.items.length : 0;

    let badgeHtml, actionsHtml;

    if (isCompleted) {
      badgeHtml   = `<span class="wa-batch-status-badge wa-batch-status-badge--completed">✓ Completed</span>`;
      actionsHtml = '';
    } else if (isLocked) {
      badgeHtml   = `<span class="wa-batch-status-badge wa-batch-status-badge--locked">Locked</span>`;
      actionsHtml = '';
    } else {
      badgeHtml = `<span class="wa-batch-status-badge wa-batch-status-badge--pending">Pending</span>`;
      actionsHtml =
        `<div class="wa-batch-actions">
          <button class="btn-wa-batch btn-wa-batch--primary" data-action="review" data-idx="${idx}">Review &amp; Launch</button>
          <button class="btn-wa-batch btn-wa-batch--skip"    data-action="skip"   data-idx="${idx}">Skip</button>
        </div>`;
    }

    const labelCls = isLocked ? 'wa-batch-label-locked' : '';

    // Phase 15.4 — show uniform-type label (matched / waiting / not_found / campaign)
    const TYPE_LABELS = {
      matched:   'Matched ✓',
      waiting:   'Waiting (24–48h)',
      not_found: 'Match Not Found',
      campaign:  'Campaign',
    };
    const typeKey   = batch.type || 'waiting';
    const typeText  = TYPE_LABELS[typeKey] || typeKey;
    const typeBadge = `<span class="wa-batch-type-badge wa-batch-type-badge--${esc(typeKey)}">${esc(typeText)}</span>`;

    return (
      `<div class="wa-batch-row" data-batch-idx="${idx}">` +
        `<span class="wa-batch-num">Batch ${bNum}</span>` +
        typeBadge +
        `<span class="wa-batch-label ${labelCls}">${contactCount} contact${contactCount !== 1 ? 's' : ''}</span>` +
        badgeHtml +
        actionsHtml +
      `</div>`
    );
  }

  /* ─────────────────────────────────────────────────────────
     PART C — WA Review Modal
  ───────────────────────────────────────────────────────── */

  function _openWaReview(batchIdx) {
    const queue = _readWaQueue();
    if (!queue || !queue.batches || !queue.batches[batchIdx]) {
      showToast('Batch not found.', 'error', 3000);
      return;
    }

    const batch      = queue.batches[batchIdx];
    const firstItem  = batch.items && batch.items[0];
    const defaultMsg = firstItem ? firstItem.message : '';

    _waSendFlowState.batchIdx  = batchIdx;
    _waSendFlowState.editedMsg = defaultMsg;
    _waSendFlowState.ctaUrl    = '';
    _waSendFlowState.support   = '';
    _waSendFlowState.final     = '';
    _waSendFlowState.opened    = new Set();

    const msgEl     = document.getElementById('waReviewMsg');
    const ctaEl     = document.getElementById('waReviewCta');
    const supportEl = document.getElementById('waReviewSupport');
    const finalEl   = document.getElementById('waReviewFinal');

    if (msgEl)     msgEl.value     = defaultMsg;
    if (ctaEl)     ctaEl.value     = '';
    if (supportEl) supportEl.value = '';
    if (finalEl)   finalEl.value   = '';

    _updateWaReviewPreview();

    const overlay = document.getElementById('waReviewOverlay');
    if (overlay) overlay.hidden = false;
  }

  function _closeWaReview() {
    const overlay = document.getElementById('waReviewOverlay');
    if (overlay) overlay.hidden = true;
  }

  function _updateWaReviewPreview() {
    const previewEl = document.getElementById('waReviewPreview');
    if (!previewEl) return;

    const msg     = (document.getElementById('waReviewMsg')?.value     || '').trim();
    const cta     = (document.getElementById('waReviewCta')?.value     || '').trim();
    const support = (document.getElementById('waReviewSupport')?.value || '').trim();
    const final_  = (document.getElementById('waReviewFinal')?.value   || '').trim();

    let preview = msg;
    if (cta)     preview += `\n\n🔗 ${cta}`;
    if (support) preview += `\n📞 WhatsApp Support: ${support}`;
    if (final_)  preview += `\n\n${final_}`;

    previewEl.textContent = preview || '(type a message to see preview)';

    // Cache edits
    _waSendFlowState.editedMsg = preview;
  }

  /* ─────────────────────────────────────────────────────────
     PART D — Batch Send Flow
  ───────────────────────────────────────────────────────── */

  function _startWaSendFlow(batchIdx) {
    _closeWaReview();

    const queue = _readWaQueue();
    if (!queue || !queue.batches || !queue.batches[batchIdx]) return;

    const batch = queue.batches[batchIdx];
    _waSendFlowState.batchIdx = batchIdx;

    const batchList = document.getElementById('waBatchList');
    const sendFlow  = document.getElementById('waSendFlow');
    const titleEl   = document.getElementById('waSendFlowTitle');
    const contactEl = document.getElementById('waSendContactList');

    if (batchList) batchList.hidden = true;
    if (sendFlow)  sendFlow.hidden  = false;

    const bNum = batch.batch_number || (batchIdx + 1);
    const cnt  = batch.items ? batch.items.length : 0;
    const TYPE_LABELS = {
      matched: 'Matched ✓', waiting: 'Waiting (24–48h)',
      not_found: 'Match Not Found', campaign: 'Campaign',
    };
    const typeLabel = TYPE_LABELS[batch.type] || (batch.type || '');
    if (titleEl) {
      titleEl.textContent =
        `Batch ${bNum} · ${typeLabel} — ${cnt} contact${cnt !== 1 ? 's' : ''}`;
    }

    if (!contactEl) return;

    /*
     * Phase 15.4 fix: each contact's wa.me link is built from THAT
     * contact's own item.message, not from a shared editedMsg.  Because
     * batches are now single-type (see _buildWaBatches), every item in
     * the batch uses the same template, so the editable modal can safely
     * override the message for the whole batch via _waSendFlowState.editedMsg
     * — but if the admin did not edit, we use each item's original message.
     */
    const edited = (_waSendFlowState.editedMsg || '').trim();
    const usingEdit = edited.length > 0;

    contactEl.innerHTML = (batch.items || []).map((item, i) => {
      const digits  = (item.whatsapp || '').replace(/\D/g, '');
      const hasWa   = digits.length >= 7;
      // Per-contact message — admin's edit only applies if they typed one.
      const msgForContact = usingEdit ? edited : (item.message || '');
      const waUrl   = hasWa
        ? `https://wa.me/${digits}?text=${encodeURIComponent(msgForContact)}`
        : '#';
      const alreadyOpened = _waSendFlowState.opened.has(item.id);
      const outboxId      = item.outbox_id ? ` data-outbox-id="${esc(item.outbox_id)}"` : '';

      return (
        `<div class="wa-contact-row" id="waContactRow_${i}">` +
          `<div class="wa-contact-info">` +
            `<div class="wa-contact-name">${esc(item.account || item.email || 'Unknown')}</div>` +
            `<div class="wa-contact-phone">${hasWa ? esc(item.whatsapp) : 'No WhatsApp number'}</div>` +
          `</div>` +
          (hasWa
            ? `<a class="btn-wa-open${alreadyOpened ? ' btn-wa-open--opened' : ''}"
                  href="${waUrl}" target="_blank" rel="noopener"
                  data-item-id="${esc(item.id)}" data-row-i="${i}"${outboxId}>
                  Open WhatsApp ↗
               </a>`
            : `<span class="wa-contact-skip-note">Skipped — no number</span>`
          ) +
        `</div>`
      );
    }).join('');
  }

  async function _completeWaBatch(batchIdx) {
    const queue = _readWaQueue();
    if (!queue || !queue.batches || !queue.batches[batchIdx]) return;

    queue.batches[batchIdx].status       = 'completed';
    queue.batches[batchIdx].completed_at = new Date().toISOString();
    _writeWaQueue(queue);

    // Phase 15.4 — flip every wa_outbox row in this batch to 'sent'
    // (admin self-report; wa.me has no callback so this is the best we can do).
    const items = queue.batches[batchIdx].items || [];
    const ids   = items.map(it => it.outbox_id).filter(Boolean);
    if (ids.length > 0) {
      let okCount = 0, failCount = 0;
      for (const id of ids) {
        const ok = await _markWaOutboxSent(id);
        if (ok) okCount++; else failCount++;
      }
      console.log(`[Phase15.4] wa_outbox batch ${queue.batches[batchIdx].batch_number}: ${okCount} marked sent, ${failCount} failed.`);
    }

    // Return to batch list
    const sendFlow  = document.getElementById('waSendFlow');
    const batchList = document.getElementById('waBatchList');
    if (sendFlow)  sendFlow.hidden  = true;
    if (batchList) batchList.hidden = false;

    renderWaDeliveryPanel();
    showToast(`Batch ${(queue.batches[batchIdx].batch_number || batchIdx + 1)} marked as completed.`, 'success', 3000);
  }

  /* ─────────────────────────────────────────────────────────
     PART E — Campaign Builder helpers (append to queues)
  ───────────────────────────────────────────────────────── */

  function _buildEmailItemFromContact(contact, subject, body, type) {
    return {
      id:        _autoId(),
      type:      type || 'campaign',
      account:   contact.account  || '',
      email:     contact.email    || '',
      subject:   subject,
      body:      body,
      status:    'queued',
      source:    'campaign_builder',
      queued_at: new Date().toISOString(),
    };
  }

  function _buildWaItemFromContact(contact, message, type) {
    return {
      id:        _autoId(),
      type:      type || 'campaign',
      account:   contact.account  || '',
      email:     contact.email    || '',
      whatsapp:  contact.whatsapp || '',
      message:   message,
      status:    'pending',
      source:    'campaign_builder',
      queued_at: new Date().toISOString(),
    };
  }

  /** Append new email items into ZTU_EMAIL_QUEUE_V1 (does not replace). */
  function _appendToEmailQueue(newItems) {
    const existing = _readEmailQueue();
    const allItems = existing ? (existing.items || []).concat(newItems) : newItems;
    _writeEmailQueue({
      version:    1,
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      count:      allItems.filter(x => x.status === 'queued').length,
      items:      allItems,
    });
  }

  /** Append new WA batches into ZTU_WA_QUEUE_V1 (does not replace). */
  function _appendToWaQueue(newBatches) {
    const existing     = _readWaQueue();
    const existBatches = existing ? (existing.batches || []) : [];
    const startNum     = existBatches.length;
    const numbered     = newBatches.map((b, i) => ({
      ...b,
      batch_number: startNum + i + 1,
    }));
    const allBatches   = existBatches.concat(numbered);
    const totalItems   = allBatches.reduce((s, b) => s + (b.items || []).length, 0);
    _writeWaQueue({
      version:       1,
      created_at:    existing ? existing.created_at : new Date().toISOString(),
      updated_at:    new Date().toISOString(),
      total_batches: allBatches.length,
      total_items:   totalItems,
      batches:       allBatches,
    });
  }

  /* ─────────────────────────────────────────────────────────
     Master render: show/hide both delivery panels
  ───────────────────────────────────────────────────────── */

  function renderDeliveryPanels() {
    // renderEmailDeliveryPanel is async (Phase 15.4); swallow rejection so
    // callers do not need to know it returns a promise.
    Promise.resolve(renderEmailDeliveryPanel()).catch(e =>
      console.warn('[Phase15.4] renderEmailDeliveryPanel:', e)
    );
    renderWaDeliveryPanel();
  }

  /* ─────────────────────────────────────────────────────────
     Bind: wire all delivery-layer event listeners
  ───────────────────────────────────────────────────────── */

  function bindDeliveryPanels() {

    /* Part A — Refresh Status (Phase 15.4: was "Send All", now Refresh) */
    const sendAllBtn = document.getElementById('btnSendAllEmails');
    if (sendAllBtn) sendAllBtn.addEventListener('click', () => sendAllEmails());

    /* Phase 15.4 — outbox row retry button delegation */
    const emailList = document.getElementById('emailOutboxList');
    if (emailList) emailList.addEventListener('click', _handleOutboxRetryClick);

    /* Part B — Batch list delegation (Review & Launch + Skip) */
    const batchList = document.getElementById('waBatchList');
    if (batchList) {
      batchList.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const idx    = parseInt(btn.dataset.idx, 10);
        const action = btn.dataset.action;
        if (action === 'review') _openWaReview(idx);
        if (action === 'skip')   _skipWaBatch(idx);
      });
    }

    /* Part D — Back button (send flow → batch list) */
    const backBtn = document.getElementById('btnWaFlowBack');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const sendFlow  = document.getElementById('waSendFlow');
        const batchList = document.getElementById('waBatchList');
        if (sendFlow)  sendFlow.hidden  = true;
        if (batchList) batchList.hidden = false;
      });
    }

    /* Part D — "Open WhatsApp ↗" link clicks (mark opened) */
    const contactList = document.getElementById('waSendContactList');
    if (contactList) {
      contactList.addEventListener('click', e => {
        const link = e.target.closest('.btn-wa-open');
        if (!link) return;
        const itemId = link.dataset.itemId;
        const rowI   = link.dataset.rowI;
        if (itemId) _waSendFlowState.opened.add(itemId);
        // Visual: dim the button
        link.classList.add('btn-wa-open--opened');
        link.textContent = 'Opened ✓';
      });
    }

    /* Part D — Mark Batch Complete */
    const completeBtn = document.getElementById('btnMarkBatchComplete');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => {
        _completeWaBatch(_waSendFlowState.batchIdx);
      });
    }

    /* Part C — WA Review Modal: live preview on input */
    ['waReviewMsg', 'waReviewCta', 'waReviewSupport', 'waReviewFinal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', _updateWaReviewPreview);
    });

    /* Part C — Save + Send Batch */
    const saveBtn = document.getElementById('waReviewSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const batchIdx = _waSendFlowState.batchIdx;
        if (batchIdx < 0) return;
        _startWaSendFlow(batchIdx);
      });
    }

    /* Part C — Cancel / Close */
    const cancelBtn = document.getElementById('waReviewCancelBtn');
    const closeBtn  = document.getElementById('waReviewCloseBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', _closeWaReview);
    if (closeBtn)  closeBtn.addEventListener('click', _closeWaReview);

    /* Close modal on overlay backdrop click */
    const overlay = document.getElementById('waReviewOverlay');
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) _closeWaReview();
      });
    }

    /* Escape key closes review modal */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const ov = document.getElementById('waReviewOverlay');
        if (ov && !ov.hidden) _closeWaReview();
      }
    });
  }

  /** Skip a WA batch (mark completed without sending). */
  function _skipWaBatch(batchIdx) {
    const queue = _readWaQueue();
    if (!queue || !queue.batches || !queue.batches[batchIdx]) return;
    queue.batches[batchIdx].status       = 'completed';
    queue.batches[batchIdx].skipped      = true;
    queue.batches[batchIdx].completed_at = new Date().toISOString();
    _writeWaQueue(queue);
    renderWaDeliveryPanel();
    const bNum = queue.batches[batchIdx].batch_number || (batchIdx + 1);
    showToast(`Batch ${bNum} skipped.`, 'info', 2500);
  }

  /* ═══════════════════════════════════════════════════════════
     END PHASE 15.1
  ══════════════════════════════════════════════════════════ */


  /* ═══════════════════════════════════════════════════════════
     PHASE 15.4 — REAL DELIVERY OUTBOX
     ───────────────────────────────────────────────────────────
     The frontend writes every outgoing email and WhatsApp item to a
     Supabase outbox table.  Server-side ZTU_AUTOMATION engine polls
     these tables, dispatches via SMTP / WhatsApp API, and updates
     status to 'sent' or 'failed'.  The dashboard polls back to show
     real per-item delivery status — never claims "Sent" until the
     backend confirms it.

     ╔══════════════════════════════════════════════════════════╗
     ║  REQUIRED SUPABASE MIGRATION — run once in SQL editor    ║
     ╠══════════════════════════════════════════════════════════╣

     -- ── Email outbox ─────────────────────────────────────────
     CREATE TABLE IF NOT EXISTS email_outbox (
       id                BIGSERIAL PRIMARY KEY,
       status            TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','sending','sent','failed')),
       template_type     TEXT NOT NULL
                           CHECK (template_type IN ('matched','waiting','not_found','campaign')),
       recipient_email   TEXT NOT NULL,
       recipient_account TEXT,
       subject           TEXT NOT NULL,
       body_html         TEXT NOT NULL,
       body_text         TEXT,
       request_id        TEXT,    -- license_requests.id as text (UUID or numeric — works either way)
       created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
       sent_at           TIMESTAMPTZ,
       delivery_status   TEXT,
       error_message     TEXT,
       retry_count       INTEGER NOT NULL DEFAULT 0
     );
     CREATE INDEX IF NOT EXISTS email_outbox_status_idx
       ON email_outbox(status, created_at);

     ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
     CREATE POLICY email_outbox_anon_insert ON email_outbox
       FOR INSERT TO anon WITH CHECK (true);
     CREATE POLICY email_outbox_anon_read   ON email_outbox
       FOR SELECT TO anon USING (true);
     CREATE POLICY email_outbox_anon_retry  ON email_outbox
       FOR UPDATE TO anon
       USING  (status = 'failed')
       WITH CHECK (status = 'pending');

     -- ── WhatsApp outbox ──────────────────────────────────────
     CREATE TABLE IF NOT EXISTS wa_outbox (
       id                BIGSERIAL PRIMARY KEY,
       status            TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','sending','sent','failed','skipped')),
       template_type     TEXT NOT NULL
                           CHECK (template_type IN ('matched','waiting','not_found','campaign')),
       recipient_whatsapp TEXT NOT NULL,
       recipient_account  TEXT,
       recipient_email    TEXT,
       message            TEXT NOT NULL,
       batch_number       INTEGER,
       request_id         TEXT,    -- license_requests.id as text (UUID or numeric — works either way)
       created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
       sent_at            TIMESTAMPTZ,
       delivery_status    TEXT,
       error_message      TEXT,
       retry_count        INTEGER NOT NULL DEFAULT 0
     );
     CREATE INDEX IF NOT EXISTS wa_outbox_status_idx
       ON wa_outbox(status, batch_number, created_at);

     ALTER TABLE wa_outbox ENABLE ROW LEVEL SECURITY;
     CREATE POLICY wa_outbox_anon_insert ON wa_outbox
       FOR INSERT TO anon WITH CHECK (true);
     CREATE POLICY wa_outbox_anon_read   ON wa_outbox
       FOR SELECT TO anon USING (true);
     CREATE POLICY wa_outbox_anon_mark_sent ON wa_outbox
       FOR UPDATE TO anon
       USING  (status IN ('pending','failed'))
       WITH CHECK (status IN ('sent','skipped','pending'));

     ╚══════════════════════════════════════════════════════════╝
  ══════════════════════════════════════════════════════════ */

  const OUTBOX = {
    EMAIL_TABLE: 'email_outbox',
    WA_TABLE:    'wa_outbox',
    POLL_MS:     7000,     // re-query Supabase every 7s while panel is visible
  };

  let _emailOutboxPoll = null;
  let _waOutboxPoll    = null;
  let _currentEmailOutbox = [];   // last fetched rows
  let _currentWaOutbox    = [];   // last fetched rows

  /* ─── _safeUuid — return value only if it matches UUID shape ─ */
  /*
   * Phase 15.4 forensic fix: license_requests.id may be a UUID or a
   * numeric/string local id (mock mode, test rows, migrated rows).
   * email_outbox.request_id is a UUID column — sending a non-UUID
   * value (e.g. "15") triggers a Postgres type error and the whole
   * insert fails.  This helper returns null for anything that isn't
   * a 36-char UUID-shaped string.  Schema is unchanged.
   */
  function _safeUuid(v) {
    if (!v) return null;
    return /^[0-9a-fA-F-]{36}$/.test(String(v)) ? String(v) : null;
  }

  /* ─── _emailBodyToHtml — minimal text → html for body_html ── */
  function _emailBodyToHtml(text) {
    if (!text) return '';
    const esc = s => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc(text)
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  /* ─── _insertEmailOutbox — INSERT rows into email_outbox ───── */
  /*
   * items: array of objects shaped like _buildEmailItem() output, each
   * carrying type ('matched'|'waiting'|'not_found'|'campaign'), email,
   * account, subject, body, and optionally request_id.
   *
   * Returns: { inserted: [{id, ...}], error: Error | null }
   */
  async function _insertEmailOutbox(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return { inserted: [], error: null };
    }
    if (!supabaseClient) {
      console.warn('[Phase15.4] Supabase client not initialised — cannot insert email_outbox');
      return { inserted: [], error: new Error('No Supabase client') };
    }

    // Phase 15.5C — pre-INSERT dedup: skip items where a pending row already
    // exists for the same (recipient_email, template_type, recipient_account).
    // Prevents duplicate accumulation across repeated Run Automation clicks.
    try {
      const { data: existing, error: dErr } = await supabaseClient
        .from(OUTBOX.EMAIL_TABLE)
        .select('recipient_email, template_type, recipient_account')
        .eq('status', 'pending');
      if (!dErr && Array.isArray(existing) && existing.length > 0) {
        const key = (e, t, a) => `${e || ''}|${t || ''}|${a || ''}`;
        const seen = new Set(existing.map(r => key(r.recipient_email, r.template_type, r.recipient_account)));
        const before = items.length;
        items = items.filter(i => !seen.has(key(i.email, i.type || 'waiting', i.account)));
        const skipped = before - items.length;
        if (skipped > 0) console.log(`[Phase15.5C] email_outbox: dedup skipped ${skipped} duplicate(s).`);
        if (items.length === 0) return { inserted: [], error: null };
      }
    } catch (e) {
      console.warn('[Phase15.5C] email_outbox dedup check failed (continuing without):', e);
    }

    const rows = items.map(item => ({
      status:            'pending',
      template_type:     item.type || 'waiting',
      recipient_email:   item.email,
      recipient_account: item.account || null,
      subject:           item.subject || '',
      body_html:         _emailBodyToHtml(item.body || ''),
      body_text:         item.body || '',
      request_id:        _safeUuid(item.request_id),
    }));

    try {
      const { data, error } = await supabaseClient
        .from(OUTBOX.EMAIL_TABLE)
        .insert(rows)
        .select('id, status, template_type, recipient_email, recipient_account, subject, created_at, sent_at, delivery_status, error_message, retry_count');

      if (error) {
        console.error('[Phase15.4] email_outbox insert failed:', error.message);
        return { inserted: [], error };
      }
      console.log(`[Phase15.4] email_outbox: inserted ${data.length} row(s).`);
      return { inserted: data, error: null };
    } catch (e) {
      console.error('[Phase15.4] email_outbox insert exception:', e);
      return { inserted: [], error: e };
    }
  }

  /* ─── _insertWaOutbox — INSERT rows into wa_outbox ─────────── */
  async function _insertWaOutbox(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return { inserted: [], error: null };
    }
    if (!supabaseClient) {
      console.warn('[Phase15.4] Supabase client not initialised — cannot insert wa_outbox');
      return { inserted: [], error: new Error('No Supabase client') };
    }

    // Phase 15.5C — pre-INSERT dedup: skip items where a pending row already
    // exists for the same (recipient_phone, template_type, recipient_account).
    try {
      const { data: existing, error: dErr } = await supabaseClient
        .from(OUTBOX.WA_TABLE)
        .select('recipient_phone, template_type, recipient_account')
        .eq('status', 'pending');
      if (!dErr && Array.isArray(existing) && existing.length > 0) {
        const key = (p, t, a) => `${p || ''}|${t || ''}|${a || ''}`;
        const seen = new Set(existing.map(r => key(r.recipient_phone, r.template_type, r.recipient_account)));
        const before = items.length;
        items = items.filter(i => !seen.has(key(i.whatsapp, i.type || 'waiting', i.account)));
        const skipped = before - items.length;
        if (skipped > 0) console.log(`[Phase15.5C] wa_outbox: dedup skipped ${skipped} duplicate(s).`);
        if (items.length === 0) return { inserted: [], error: null };
      }
    } catch (e) {
      console.warn('[Phase15.5C] wa_outbox dedup check failed (continuing without):', e);
    }

    const rows = items.map(item => ({
      status:            'pending',
      template_type:     item.type || 'waiting',
      recipient_phone:   item.whatsapp || '',   // Phase 15.4 fix: column is recipient_phone (not recipient_whatsapp)
      recipient_account: item.account || null,
      message:           item.message || '',
      batch_number:      item.batch_number || null,
      request_id:        _safeUuid(item.request_id),
    }));

    try {
      // Phase 15.4 forensic fix: SELECT clause limited to columns that
      // actually exist in user's wa_outbox schema. Previous version asked
      // for delivery_status + retry_count, which DON'T exist here — the
      // whole .insert().select() call was failing in PostgREST's schema-
      // cache check BEFORE any row was committed.
      console.log('[WA DEBUG] _insertWaOutbox called with', items.length, 'item(s)');
      console.log('[WA DEBUG] wa_outbox payload sample:', rows[0]);
      const { data, error } = await supabaseClient
        .from(OUTBOX.WA_TABLE)
        .insert(rows)
        .select('id, status, template_type, recipient_phone, recipient_account, message, batch_number, created_at, sent_at, error_message');

      console.log('[WA DEBUG] Supabase response — data:', data, '| error:', error);

      if (error) {
        // Phase 15.4 forensic enhancement: dump FULL Supabase error object so
        // RLS / NOT NULL / CHECK / schema-cache failures are immediately legible.
        console.error('[Phase15.4] wa_outbox insert failed:', {
          message: error.message,
          code:    error.code,
          details: error.details,
          hint:    error.hint,
          status:  error.status,
        });
        return { inserted: [], error };
      }
      console.log(`[Phase15.4] wa_outbox: inserted ${data.length} row(s).`);
      return { inserted: data, error: null };
    } catch (e) {
      console.error('[Phase15.4] wa_outbox insert exception:', e);
      return { inserted: [], error: e };
    }
  }

  /* ─── _fetchEmailOutbox — SELECT recent rows ──────────────── */
  /*
   * Fetches the N most recent email_outbox rows (default 50) so the
   * delivery panel can show real status.
   */
  async function _fetchEmailOutbox(limit) {
    if (!supabaseClient) return [];
    const max = limit || 50;
    try {
      const { data, error } = await supabaseClient
        .from(OUTBOX.EMAIL_TABLE)
        .select('id, status, template_type, recipient_email, recipient_account, subject, created_at, sent_at, delivery_status, error_message, retry_count')
        .order('created_at', { ascending: false })
        .limit(max);
      if (error) {
        console.warn('[Phase15.4] email_outbox fetch failed:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('[Phase15.4] email_outbox fetch exception:', e);
      return [];
    }
  }

  /* ─── _fetchWaOutbox — SELECT recent rows ────────────────── */
  async function _fetchWaOutbox(limit) {
    if (!supabaseClient) return [];
    const max = limit || 100;
    try {
      const { data, error } = await supabaseClient
        .from(OUTBOX.WA_TABLE)
        .select('id, status, template_type, recipient_phone, recipient_account, message, batch_number, created_at, sent_at, error_message')
        .order('batch_number', { ascending: true })
        .order('created_at',   { ascending: false })
        .limit(max);
      if (error) {
        console.warn('[Phase15.4] wa_outbox fetch failed:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('[Phase15.4] wa_outbox fetch exception:', e);
      return [];
    }
  }

  /* ─── _retryFailedOutboxRow — flip failed → pending ───────── */
  async function _retryFailedOutboxRow(tableName, id) {
    if (!supabaseClient) return false;
    try {
      const { error } = await supabaseClient
        .from(tableName)
        .update({ status: 'pending', error_message: null })
        .eq('id', id)
        .eq('status', 'failed');
      if (error) {
        console.warn(`[Phase15.4] retry failed for ${tableName}#${id}:`, error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[Phase15.4] retry exception for ${tableName}#${id}:`, e);
      return false;
    }
  }

  /* ─── _markWaOutboxSent — admin self-report (UI-driven) ───── */
  async function _markWaOutboxSent(id) {
    if (!supabaseClient) return false;
    try {
      // Phase 15.4 forensic fix: wa_outbox has no delivery_status column —
      // do not include it in the UPDATE payload. Status + sent_at is enough.
      const { error } = await supabaseClient
        .from(OUTBOX.WA_TABLE)
        .update({
          status:  'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', id)
        .in('status', ['pending', 'failed']);
      if (error) {
        console.warn(`[Phase15.4] wa_outbox mark sent failed #${id}:`, error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[Phase15.4] wa_outbox mark sent exception #${id}:`, e);
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     END PHASE 15.4 — OUTBOX CORE
     (UI integration follows in renderEmailDeliveryPanel rewrite +
      runBrokerAutomation auto-trigger.)
  ══════════════════════════════════════════════════════════ */


  /* ─── bindCrm — wire all CRM event listeners ─────────────── */
  function bindCrm() {
    // Active section — filter tab delegation
    const activeWrap = document.getElementById('crmActiveWrap');
    if (activeWrap) {
      activeWrap.addEventListener('click', e => {
        const tab = e.target.closest('.crm-tab[data-filter]');
        if (!tab) return;
        if (!tab.closest('[data-crm-section="crm-active"]')) return;
        renderCrmActive(tab.dataset.filter);
      });
    }

    // Inactive section — filter tab delegation
    const inactiveWrap = document.getElementById('crmInactiveWrap');
    if (inactiveWrap) {
      inactiveWrap.addEventListener('click', e => {
        const tab = e.target.closest('.crm-tab[data-filter]');
        if (!tab) return;
        if (!tab.closest('[data-crm-section="crm-inactive"]')) return;
        renderCrmInactive(tab.dataset.filter);
      });
    }

    // Search input — debounced
    const searchInput = document.getElementById('crmSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(_crmSearchTimer);
        _crmSearchTimer = setTimeout(() => renderCrmSearch(searchInput.value), 250);
      });
      const clearBtn = document.getElementById('crmSearchClear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          searchInput.value = '';
          renderCrmSearch('');
          searchInput.focus();
        });
      }
    }

    // ── Phase 14A — Campaign Builder bindings ──────────────────

    // Audience grid — delegated click
    const cbAudGrid = document.getElementById('cbAudienceGrid');
    if (cbAudGrid) {
      cbAudGrid.addEventListener('click', e => {
        const btn = e.target.closest('.cb-aud-opt[data-group]');
        if (btn) updateCbAudience(btn.dataset.group);
      });
    }

    // Channel radio buttons
    document.querySelectorAll('input[name="cbChannel"]').forEach(radio => {
      radio.addEventListener('change', () => {
        CampaignBuilder.channel = radio.value;
        const subRow = document.getElementById('cbSubjectRow');
        if (subRow) subRow.hidden = radio.value === 'whatsapp';
      });
    });

    // Manual selection — Apply button
    const cbManualApply = document.getElementById('cbManualApply');
    if (cbManualApply) {
      cbManualApply.addEventListener('click', () => {
        const ta = document.getElementById('cbManualInput');
        if (!ta) return;
        CampaignBuilder.manualAccts = ta.value
          .replace(/\n/g, ',').split(',').map(s => s.trim()).filter(Boolean);
        updateCbAudience('manual');
      });
    }

    // Add Link button
    const cbAddLink = document.getElementById('cbAddLink');
    if (cbAddLink) {
      cbAddLink.addEventListener('click', () => {
        CampaignBuilder.links.push({ label: '', url: '' });
        renderCbLinks();
      });
    }

    // Attachment — file input
    const cbAttachInput = document.getElementById('cbAttachInput');
    if (cbAttachInput) {
      cbAttachInput.addEventListener('change', () => {
        if (cbAttachInput.files) addCbFiles(cbAttachInput.files);
        cbAttachInput.value = '';   // reset so re-adding same file works
      });
    }

    // Attachment — drag & drop zone
    const cbAttachZone = document.getElementById('cbAttachZone');
    if (cbAttachZone) {
      cbAttachZone.addEventListener('dragover',  e => { e.preventDefault(); cbAttachZone.classList.add('is-dragover'); });
      cbAttachZone.addEventListener('dragleave', () => cbAttachZone.classList.remove('is-dragover'));
      cbAttachZone.addEventListener('drop', e => {
        e.preventDefault();
        cbAttachZone.classList.remove('is-dragover');
        if (e.dataTransfer.files) addCbFiles(e.dataTransfer.files);
      });
    }

    // Send buttons
    const cbSendEmail = document.getElementById('cbSendEmail');
    const cbSendWa    = document.getElementById('cbSendWa');
    const cbSendBoth  = document.getElementById('cbSendBoth');
    if (cbSendEmail) cbSendEmail.addEventListener('click', () => handleCbSend('email'));
    if (cbSendWa)    cbSendWa.addEventListener('click',    () => handleCbSend('whatsapp'));
    if (cbSendBoth)  cbSendBoth.addEventListener('click',  () => handleCbSend('both'));
  }


  /* ═══════════════════════════════════════════════════════════
     PHASE 15.6 TASK 4 — CLEAR CACHE ADMIN UTILITY
     ───────────────────────────────────────────────────────────
     Safe localStorage clearing of derived/dashboard caches only.
     NEVER touches:
       - delivered accounts (Supabase license_requests.status='emailed')
       - sent email log     (Supabase email_outbox.status='sent')
       - retry pool         (localStorage.ZTU_ADMIN_RETRY_POOL_V1)
     Each cache key maps to a clearer that wipes only its own data.
  ══════════════════════════════════════════════════════════ */

  const _CLEAR_CACHE_MAP = {
    // Phase 16 follow-up — expanded coverage. Every entry can target
    // BOTH localStorage AND sessionStorage. NEVER touches protected
    // records (delivered, sent email log, ib_changed_accounts Supabase,
    // RetryPool *archived* entries — those have customer history).
    // Phase 16 follow-up #4 — REAL key fix.
    // Active/Inactive/HighValue are computed VIEWS of the CRM store
    // (CRM_STORE_KEY = 'ZTU_CRM_DATA_V1'). The previous map referenced
    // non-existent keys (ZTU_CACHE_ACTIVE_V1 etc.) and called
    // CrmStore.clearActive() which doesn't exist — silent no-op.
    // Now all three groups properly clear the underlying ZTU_CRM_DATA_V1
    // AND reset the in-memory CrmStore._data cache.
    // Phase 16.1 — full coverage map. Each group resets in-memory caches
    // AND clears the underlying localStorage key.  All groups force a
    // window.location.reload() after clear via _performClearCache.
    'matched-cache':   { keys: ['ZTU_CRM_DATA_V1'], reset: () => { if (typeof CrmStore !== 'undefined') CrmStore._data = null; } },
    'active-cache':    { keys: ['ZTU_CRM_DATA_V1'], reset: () => { if (typeof CrmStore !== 'undefined') CrmStore._data = null; } },
    'inactive-cache':  { keys: ['ZTU_CRM_DATA_V1'], reset: () => { if (typeof CrmStore !== 'undefined') CrmStore._data = null; } },
    'highvalue-cache': { keys: ['ZTU_CRM_DATA_V1'], reset: () => { if (typeof CrmStore !== 'undefined') CrmStore._data = null; } },
    'pending-requests':{ keys: [], reset: () => { if (typeof State !== 'undefined') State.requests = []; } },
    'waiting-match':   { keys: ['ZTU_ADMIN_RETRY_POOL_V1'], reset: () => {
      // Phase 16.3 — drop ACTIVE retry pool entries, preserve archived
      // (Match Not Found history). Rebuild localStorage in correct map
      // shape { <id>: entry } so RetryPool._read() returns valid data.
      if (typeof RetryPool !== 'undefined' && RetryPool) {
        const archived = RetryPool.getArchived();
        const map = {};
        archived.forEach(e => { map[e.id] = e; });
        try { window.localStorage.setItem('ZTU_ADMIN_RETRY_POOL_V1', JSON.stringify(map)); } catch (e) {}
        RetryPool._data = null;   // force re-hydrate from localStorage on next read
      }
    } },
    'compile-queue':   { keys: [], reset: () => { /* No separate cache; fetchIntakeQueue() is uncached */ } },
    'delivered-cache': { keys: [], reset: () => { /* No separate cache; fetchIntakeQueue() is uncached */ } },
    'email-queue':     { keys: ['ZTU_EMAIL_QUEUE_V1', 'ZTU_WA_QUEUE_V1'], reset: null },
    'campaign-cache':  { keys: ['ZTU_CACHE_CAMPAIGN_V1', 'ZTU_CAMPAIGN_DRAFT_V1'], reset: () => {
      if (typeof CampaignBuilder !== 'undefined' && CampaignBuilder) {
        CampaignBuilder.manualAccts = [];
        CampaignBuilder.group = 'active';
      }
    }},
    'ib-stars-cache':  { keys: [IB_CFG.STORE_KEY], reset: () => {
      if (typeof IbStars !== 'undefined' && IbStars) IbStars.clearAll();
    }},
    'intake-cache':    { keys: ['ZTU_CACHE_INTAKE_PARSED_V1', 'ZTU_EMAIL_QUEUE_V1', 'ZTU_WA_QUEUE_V1'], reset: () => {
      if (typeof IntakeState !== 'undefined' && IntakeState) {
        IntakeState.file = null;
        IntakeState.parsedRows = [];
        IntakeState.columns = [];
        IntakeState.accountCol = null;
        IntakeState.brokerAccounts = null;
        IntakeState.matchResult = null;
      }
    }},
    // Phase 16 follow-up — additional groups
    'retry-pool-active': { keys: [], reset: () => {
      // Clear ACTIVE retry pool entries only (NEVER archived ones).
      if (typeof RetryPool !== 'undefined' && RetryPool) {
        const archived = RetryPool.getArchived();
        try {
          window.localStorage.setItem('ZTU_ADMIN_RETRY_POOL_V1', JSON.stringify({
            version: 1, entries: archived,
          }));
        } catch (e) {}
        RetryPool._data = null;
      }
    }},
    'search-cache':     { keys: [], reset: () => {
      // Clear in-memory CRM search state
      ['crmSearchInput', 'globalSearchInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    }},
    'session-storage':   { keys: [], reset: () => {
      // Clear sessionStorage entirely (admin auth session also clears
      // → will log out the admin, which is intentional and safe).
      try { sessionStorage.clear(); } catch (e) {}
    }},
    'dashboard-counters': { keys: ['adc_state_v3'], reset: () => {
      // Force the cached in-memory State to drop counters & re-fetch.
      if (typeof State !== 'undefined' && State) {
        State.requests = [];
        State.lastSync = null;
        State.runCount = 0;
      }
    }},
  };

  function _openClearCacheModal() {
    const ov = document.getElementById('clearCacheOverlay');
    if (!ov) return;
    ov.hidden = false;
    // Reset all checkboxes on open
    ov.querySelectorAll('input[type="checkbox"][data-cache-key]').forEach(cb => cb.checked = false);
  }
  function _closeClearCacheModal() {
    const ov = document.getElementById('clearCacheOverlay');
    if (ov) ov.hidden = true;
  }
  function _performClearCache() {
    const ov = document.getElementById('clearCacheOverlay');
    if (!ov) return;
    const boxes = ov.querySelectorAll('input[type="checkbox"][data-cache-key]:checked');
    if (boxes.length === 0) {
      showToast('Select at least one cache to clear.', 'warn', 2500);
      return;
    }
    // Phase 16.2 audit fix — count all three reset paths separately so the
    // toast reports REAL totals, not just localStorage removeItem hits.
    // Several groups (pending-requests/compile-queue/delivered-cache/etc.)
    // have keys: [] by design — they're memory- or Supabase-backed — so the
    // old counter understated their effect as "0 key(s) removed".
    let lsRemoved = 0;
    let lsMissed  = 0;   // keys requested but not present in localStorage
    let memReset  = 0;
    let ssBefore  = 0, ssAfter = 0;
    try { ssBefore = sessionStorage.length; } catch (e) {}
    const cleared = [];

    boxes.forEach(cb => {
      const groupKey = cb.dataset.cacheKey;
      const entry = _CLEAR_CACHE_MAP[groupKey];
      if (!entry) return;
      entry.keys.forEach(k => {
        try {
          const existed = window.localStorage.getItem(k) !== null;
          window.localStorage.removeItem(k);
          if (existed) lsRemoved++; else lsMissed++;
        } catch (e) {}
      });
      if (typeof entry.reset === 'function') {
        try { entry.reset(); memReset++; }
        catch (e) { console.warn('[clearCache] reset failed for', groupKey, e); }
      }
      cleared.push(cb.parentElement.querySelector('span').textContent.trim());
    });
    try { ssAfter = sessionStorage.length; } catch (e) {}
    const ssRemoved = Math.max(0, ssBefore - ssAfter);

    _closeClearCacheModal();
    const parts = [`${cleared.length} group(s)`];
    if (lsRemoved > 0)  parts.push(`${lsRemoved} localStorage key(s)`);
    if (ssRemoved > 0)  parts.push(`${ssRemoved} sessionStorage key(s)`);
    if (memReset  > 0)  parts.push(`${memReset} memory reset(s)`);
    if (lsMissed  > 0)  parts.push(`${lsMissed} key(s) not present (no-op)`);
    const summary = parts.join(' · ');
    showToast(`Cleared ${summary}. Reloading…`, 'success', 4500);
    console.log('[clearCache] cleared groups:', cleared, '| lsRemoved=', lsRemoved, '| lsMissed=', lsMissed, '| ssRemoved=', ssRemoved, '| memReset=', memReset);

    // Phase 16.2 — same banner flag (now carrying the honest counters)
    try {
      sessionStorage.setItem('ZTU_CACHE_CLEARED_AT', JSON.stringify({
        at: new Date().toISOString(),
        groups: cleared,
        lsRemoved, ssRemoved, memReset, lsMissed,
      }));
    } catch (e) {}
    setTimeout(() => window.location.reload(), 1200);
  }
  function bindClearCache() {
    const openBtn   = document.getElementById('btnOpenClearCache');
    const closeBtn  = document.getElementById('clearCacheClose');
    const cancelBtn = document.getElementById('clearCacheCancel');
    const okBtn     = document.getElementById('clearCacheConfirm');
    const selectAll = document.getElementById('clearCacheSelectAll');
    const overlay   = document.getElementById('clearCacheOverlay');

    if (openBtn)   openBtn.addEventListener('click', _openClearCacheModal);
    if (closeBtn)  closeBtn.addEventListener('click', _closeClearCacheModal);
    if (cancelBtn) cancelBtn.addEventListener('click', _closeClearCacheModal);
    if (okBtn)     okBtn.addEventListener('click', _performClearCache);
    if (selectAll) selectAll.addEventListener('click', () => {
      if (!overlay) return;
      const boxes = overlay.querySelectorAll('input[type="checkbox"][data-cache-key]');
      const allChecked = Array.from(boxes).every(cb => cb.checked);
      boxes.forEach(cb => cb.checked = !allChecked);
      selectAll.textContent = allChecked ? 'Select All' : 'Deselect All';
    });
    if (overlay) overlay.addEventListener('click', e => {
      if (e.target === overlay) _closeClearCacheModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay && !overlay.hidden) _closeClearCacheModal();
    });
  }


  /* ═══════════════════════════════════════════════════════════
     DATA LOADING
     Single async entry point for all data population.
     State.isFetching guards against concurrent calls.
     On success: updates requests + lastSync (live mode only).
     On failure: non-destructive toast, preserves existing data.
  ══════════════════════════════════════════════════════════ */
  async function loadData() {
    if (State.isFetching) return;   // concurrent fetch guard
    State.isFetching = true;
    setFetchState(true);

    try {
      const rows = await DataLayer.fetchAll();
      if (DataLayer.isLive) {
        State.requests = rows;
        State.lastSync = new Date().toISOString();
        updateSupabaseRow(true, 'Connected');

        /* ── Phase 14B verification logging ─────────────────────────────────
           Open DevTools Console → filter by "[AdminDashboard]" to trace the
           full pipeline after a broker file upload from either admin tool.

           After mapRow() each row has:
             r.dbStatus    = raw DB value  (e.g. "matched", "approved", "pending")
             r.canonicalDb = normalized    (e.g. "matched", "matched",  "pending")
             r.status      = dashboard key (e.g. "matched", "matched",  "new_request")
        ──────────────────────────────────────────────────────────────────── */
        const _dbBreak  = {};   // raw DB status → count
        const _dashBreak = {};  // dashboard status → count
        rows.forEach(r => {
          const db = r.dbStatus || r.status || '?';
          _dbBreak[db]  = (_dbBreak[db]  || 0) + 1;
          _dashBreak[r.status] = (_dashBreak[r.status] || 0) + 1;
        });
        console.group(`[AdminDashboard] Live sync — ${rows.length} row(s) from Supabase:`);
        console.log('  Raw DB status → dashboard section:');
        Object.entries(_dbBreak).forEach(([s, n]) => {
          const canonical = normalizeDbStatus(s);
          const dashKey   = DataLayer.DB_TO_DASH[canonical] || '(unmapped)';
          console.log(`    DB:"${s}" → canonical:"${canonical}" → section:"${dashKey}": ${n}`);
        });
        console.log('  RetryPool — active:', RetryPool.getActive().length,
                    '| archived:', RetryPool.getArchived().length);
        console.log('  CrmStore  — records:', CrmStore.getCount());
        const _matchedN = (_dashBreak['matched'] || 0);
        if (_matchedN > 0) {
          console.log(`  ✓ ${_matchedN} matched row(s) — visible in main table with "Matched" badge.`);
          console.log('    Also flagged in "Pending Requests" section as an info note.');
        }
        const _poolActive = RetryPool.getActive().length;
        if (_poolActive === 0 && (_dashBreak['new_request'] || 0) > 0) {
          console.warn(
            `  ⚠ RetryPool is empty but ${_dashBreak['new_request']} pending row(s) exist in DB.`,
            '\n  If these were processed via Broker File Intake the bridge auto-populates',
            'RetryPool — open DevTools there and look for [Bridge] log entries.'
          );
        }
        console.groupEnd();
      }
    } catch (err) {
      console.error('[AdminDashboard] loadData failed:', err);
      updateSupabaseRow(false, 'Error');
      showToast(
        'Could not reach Supabase — showing last available data.',
        'warn',
        5000
      );
      // First load with no cached data → fall back to seed so UI isn't blank
      if (State.requests.length === 0) {
        State.requests = JSON.parse(JSON.stringify(SEED_REQUESTS));
      }
    } finally {
      State.isFetching = false;
      setFetchState(false);
      const filter = els.tableFilter ? els.tableFilter.value : 'all';
      renderTable(filter);
      renderStats();
      renderStatusSummary();
      renderPendingRequests();      // Phase 11B
      renderWaitingForMatch();      // Phase 11B
      autoArchiveExpiredPool();     // Phase 12 — fire-and-forget; re-renders when done
      CrmStore.syncContactData();   // Phase 13.5 — refresh email + WhatsApp from live requests
    }
  }


  /* ═══════════════════════════════════════════════════════════
     POLLING — 45-second live refresh
     Pauses automatically when the browser tab is hidden.
     Resumes with an immediate fetch when tab becomes visible.
     Guards against duplicate timers via stopPolling() before start.
  ══════════════════════════════════════════════════════════ */
  function startPolling() {
    if (!POLL_CONFIG.enabled) {
      console.log('[AdminDashboard] Polling disabled — POLL_CONFIG.enabled = false.');
      return;
    }
    stopPolling();    // clear any existing timer before creating a new one
    POLL_CONFIG._timer = setInterval(async () => {
      if (document.visibilityState === 'hidden') return;  // skip hidden-tab ticks
      console.log('[AdminDashboard] Poll tick — fetching from Supabase…');
      await loadData();
    }, POLL_CONFIG.intervalMs);
    renderStatusSummary();  // update polling indicator immediately
    console.log(`[AdminDashboard] Polling started — every ${POLL_CONFIG.intervalMs / 1000}s.`);
  }

  function stopPolling() {
    if (POLL_CONFIG._timer !== null) {
      clearInterval(POLL_CONFIG._timer);
      POLL_CONFIG._timer = null;
      renderStatusSummary();
      console.log('[AdminDashboard] Polling stopped.');
    }
  }

  /* Page Visibility API — auto pause/resume on tab switch */
  function bindVisibilityChange() {
    if (!POLL_CONFIG.enabled) return;   // only register when polling is active
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') {
        stopPolling();
        console.log('[AdminDashboard] Tab hidden — polling paused.');
      } else {
        console.log('[AdminDashboard] Tab visible — resuming with immediate fetch.');
        await loadData();   // fetch fresh data immediately on tab restore
        startPolling();     // then restart the 45-second timer
      }
    });
  }


  /* ═══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════
     PHASE 16 follow-up — ADMIN PASSWORD GATE
     ───────────────────────────────────────────────────────────
     Single-source-of-truth configuration: change ADMIN_CONFIG.password
     to rotate the password.  Session is sessionStorage-based with an
     idle-timeout (resets on any user interaction).  Gate blocks ALL
     dashboard rendering until authenticated.
  ══════════════════════════════════════════════════════════ */
  const ADMIN_CONFIG = {
    password:        'ZTU-Admin-2026',   // CHANGE THIS to rotate admin password
    sessionMinutes:  30,                  // idle timeout in minutes
    storageKey:      'ZTU_ADMIN_SESSION_V1',
  };

  const AdminAuth = {
    _idleTimer: null,

    _isValid() {
      try {
        const raw = sessionStorage.getItem(ADMIN_CONFIG.storageKey);
        if (!raw) return false;
        const s = JSON.parse(raw);
        return s && s.expiresAt && Date.now() < s.expiresAt;
      } catch (e) { return false; }
    },

    _refresh() {
      const expiresAt = Date.now() + ADMIN_CONFIG.sessionMinutes * 60_000;
      sessionStorage.setItem(ADMIN_CONFIG.storageKey, JSON.stringify({ expiresAt }));
    },

    _scheduleIdleCheck() {
      if (this._idleTimer) clearInterval(this._idleTimer);
      this._idleTimer = setInterval(() => {
        if (!this._isValid()) this.logout(true /* sessionExpired */);
      }, 60_000);
      // Activity refreshes session
      const refresh = () => { if (this._isValid()) this._refresh(); };
      ['click', 'keydown', 'mousemove'].forEach(ev =>
        document.addEventListener(ev, refresh, { passive: true, capture: true })
      );
    },

    showGate(errMsg) {
      const ov = document.getElementById('adminGateOverlay');
      const er = document.getElementById('adminGateError');
      const ip = document.getElementById('adminGateInput');
      const sm = document.getElementById('adminGateSessMin');
      const sh = document.querySelector('.app-shell');
      if (ov) ov.hidden = false;
      if (sh) sh.style.display = 'none';
      if (sm) sm.textContent = String(ADMIN_CONFIG.sessionMinutes);
      if (er) {
        if (errMsg) { er.textContent = errMsg; er.hidden = false; }
        else { er.hidden = true; er.textContent = ''; }
      }
      if (ip) { ip.value = ''; setTimeout(() => ip.focus(), 50); }
    },

    hideGate() {
      const ov = document.getElementById('adminGateOverlay');
      const sh = document.querySelector('.app-shell');
      if (ov) ov.hidden = true;
      if (sh) sh.style.display = '';
    },

    tryLogin(pwd) {
      if (pwd === ADMIN_CONFIG.password) {
        this._refresh();
        this.hideGate();
        this._scheduleIdleCheck();
        console.log('[AdminAuth] login OK — session valid for ' + ADMIN_CONFIG.sessionMinutes + ' min idle');
        return true;
      }
      return false;
    },

    logout(sessionExpired) {
      sessionStorage.removeItem(ADMIN_CONFIG.storageKey);
      if (this._idleTimer) { clearInterval(this._idleTimer); this._idleTimer = null; }
      this.showGate(sessionExpired ? 'Session expired — please re-enter password.' : null);
      console.log('[AdminAuth] logged out' + (sessionExpired ? ' (idle timeout)' : ''));
    },

    bindGate() {
      const form = document.getElementById('adminGateForm');
      const btnLogout = document.getElementById('btnAdminLogout');
      if (form) {
        form.addEventListener('submit', e => {
          e.preventDefault();
          const ip = document.getElementById('adminGateInput');
          const pwd = ip ? ip.value : '';
          if (!this.tryLogin(pwd)) {
            const er = document.getElementById('adminGateError');
            if (er) { er.textContent = 'Incorrect password.'; er.hidden = false; }
            if (ip) { ip.value = ''; ip.focus(); }
          }
        });
      }
      if (btnLogout) btnLogout.addEventListener('click', () => this.logout(false));
    },

    /* Entry point — call before any dashboard rendering.  Returns true
       if authenticated, false if gate is shown and dashboard should pause. */
    enforce() {
      this.bindGate();
      if (this._isValid()) {
        this.hideGate();
        this._refresh();
        this._scheduleIdleCheck();
        return true;
      }
      this.showGate();
      // Poll: when user authenticates, re-trigger init.
      const checker = setInterval(() => {
        if (this._isValid()) {
          clearInterval(checker);
          // Resume init by reloading — simplest way to bootstrap full dashboard
          window.location.reload();
        }
      }, 500);
      return false;
    },
  };

  async function init() {
    // Phase 16 follow-up — auth gate FIRST. Block all dashboard init if not authed.
    if (!AdminAuth.enforce()) {
      console.log('[AdminDashboard] auth required — dashboard render paused');
      return;
    }
    console.log('[AdminDashboard] Phase 14A — Campaign Builder loaded.');

    cacheEls();
    bindNav();
    bindSidebar();

    // Attempt Supabase init — falls back to mock automatically if SDK missing
    const liveReady = initSupabase();

    // In mock mode, restore persisted state or use seed data
    if (!DataLayer.isLive) {
      const restored = loadState();
      if (!restored) {
        State.requests = JSON.parse(JSON.stringify(SEED_REQUESTS));
        saveState();
      }
    }

    // Bind all interactive controls before first render
    bindFilter();
    bindTableActions();
    bindRunBtn();
    bindResetBtn();
    renderStatusTimestamp();
    renderStatusSummary();
    bindRefreshStatus();
    bindConfirmModal();
    bindIntake();            // Phase 11 — broker file intake engine
    bindIntakeQueue();       // Phase 14B — compilation queue
    bindRunAutomation();     // Phase 15 — one click automation engine
    bindDeliveryPanels();    // Phase 15.1 — delivery layer (email + WA)
    bindSidebarSectionPages(); // Phase 15.6 — Matched / Compile / Delivered sidebar pages
    bindClearCache();          // Phase 15.6 Task 4 — Clear Cache admin utility
    bindIbStarsAndChanged();   // Phase 15.6 Phase B — IB Stars + IB Changed (Tasks 3 + 6)
    bindEditAndBlock();        // Phase 16.2 — Edit Client modal + Block/Unblock
    _ensureBlockedSet();       // populate blocked cache early so audience filters work
    _refreshClientOverrides(); // Phase 16.2 — populate overrides map so CRM tables show latest values
    // Phase 16.2 — universal delegated handler for inline row buttons across
    // every table (Active/Inactive/HighValue/Pending/etc.). Single listener.
    document.addEventListener('click', async (ev) => {
      const editBtn = ev.target.closest('[data-row-edit]');
      if (editBtn) {
        ev.preventDefault(); ev.stopPropagation();
        _openEditClientModal(editBtn.dataset.rowEdit);
        return;
      }
      const blockBtn = ev.target.closest('[data-row-block]');
      if (blockBtn) {
        ev.preventDefault(); ev.stopPropagation();
        blockBtn.disabled = true;
        const acct = blockBtn.dataset.rowBlock;
        const req  = State.requests.find(r => normalizeAccountId(r.account) === normalizeAccountId(acct));
        const ctx  = req || (CrmStore.getAll().find(c => c.account === acct) || {});
        const res = await _blockClient(acct, { email: ctx.email, whatsapp: ctx.whatsapp, broker: ctx.broker || ctx.broker_name }, 'Admin row block');
        if (res.ok) {
          showToast('Blocked ' + acct + '.', 'success', 3000);
          if (typeof renderCrmActive   === 'function') renderCrmActive();
          if (typeof renderCrmInactive === 'function') renderCrmInactive();
          if (typeof renderCrmHighValue=== 'function') renderCrmHighValue();
          if (typeof renderPendingRequests === 'function') renderPendingRequests();
          if (typeof _renderBlockedList === 'function') _renderBlockedList();
        } else {
          blockBtn.disabled = false;
          showToast('Block failed: ' + (res.error || 'unknown'), 'error', 5000);
        }
        return;
      }
      const unblockBtn = ev.target.closest('[data-row-unblock]');
      if (unblockBtn) {
        ev.preventDefault(); ev.stopPropagation();
        unblockBtn.disabled = true;
        const res = await _unblockClient(unblockBtn.dataset.rowUnblock);
        if (res.ok) {
          showToast('Unblocked ' + unblockBtn.dataset.rowUnblock + '.', 'success', 3000);
          if (typeof renderCrmActive   === 'function') renderCrmActive();
          if (typeof renderCrmInactive === 'function') renderCrmInactive();
          if (typeof renderCrmHighValue=== 'function') renderCrmHighValue();
          if (typeof renderPendingRequests === 'function') renderPendingRequests();
          if (typeof _renderBlockedList === 'function') _renderBlockedList();
        } else {
          unblockBtn.disabled = false;
          showToast('Unblock failed: ' + (res.error || 'unknown'), 'error', 5000);
        }
        return;
      }
    });

    // Phase 16 follow-up — periodic Not Found sweep.
    // Runs autoArchiveExpiredPool() every hour while the dashboard tab
    // is open.  Guarantees the final 'not_found' email goes out within
    // ~1 hour of the 48h window expiry, regardless of broker file uploads.
    const NOT_FOUND_SWEEP_MS = 60 * 60 * 1000;   // 1 hour
    setInterval(() => {
      try { autoArchiveExpiredPool(); }
      catch (e) { console.warn('[NotFoundSweep] interval failed:', e); }
      try { _sweepStalePendingViaSupabase(); }
      catch (e) { console.warn('[NotFoundSweep] Supabase sweep failed:', e); }
    }, NOT_FOUND_SWEEP_MS);
    console.log('[NotFoundSweep] periodic sweep enabled — runs every', NOT_FOUND_SWEEP_MS/60000, 'min');
    // Also fire once at init so the first sweep runs immediately rather than
    // waiting an hour.  Both helpers are no-ops if nothing is eligible.
    setTimeout(() => {
      try { _sweepStalePendingViaSupabase(); } catch (e) {}
    }, 3000);

    /* Phase 16.4 Issue 1 — periodic auto-match against latest broker_accounts.
     * Runs once at init (3 s after boot) and then every 2 minutes so a freshly
     * submitted license_request whose account already lives in broker_accounts
     * is promoted to 'matched' without waiting for the engine's 15-min tick. */
    const AUTO_MATCH_MS = 2 * 60 * 1000;
    setInterval(() => {
      _autoMatchPendingViaBroker().then(res => {
        if (res && res.matchedNow > 0) {
          try {
            if (typeof renderPendingRequests === 'function') renderPendingRequests();
            if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
          } catch (_) {}
        }
      }).catch(e => console.warn('[AutoMatch] interval failed:', e));
    }, AUTO_MATCH_MS);
    setTimeout(() => {
      _autoMatchPendingViaBroker().then(res => {
        if (res && res.matchedNow > 0) {
          console.log('[AutoMatch] boot pass flipped ' + res.matchedNow + ' row(s).');
          try {
            if (typeof renderPendingRequests === 'function') renderPendingRequests();
            if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
          } catch (_) {}
        }
      }).catch(()=>{});
    }, 3500);

    // Phase 16 follow-up #4 — engine countdown timer.
    // ZTU_MasterEngine scheduled task runs every 15 minutes on the
    // local PC.  Cannot be triggered from browser (file:// can't spawn
    // PowerShell).  This badge is informational ONLY — shows mm:ss to
    // next expected tick based on a 15-min cycle anchored to :00/:15/:30/:45.
    const ENGINE_TICK_MIN = 15;
    function _updateEngineCountdown() {
      const valEl = document.getElementById('engineCountdownVal');
      if (!valEl) return;
      const now = new Date();
      const cur = now.getMinutes();
      const next = Math.ceil((cur + 0.001) / ENGINE_TICK_MIN) * ENGINE_TICK_MIN;
      const tgt = new Date(now);
      tgt.setMinutes(next, 0, 0);
      if (tgt <= now) tgt.setMinutes(tgt.getMinutes() + ENGINE_TICK_MIN);
      const diffMs = tgt - now;
      const m = Math.floor(diffMs / 60000);
      const s = Math.floor((diffMs % 60000) / 1000);
      valEl.textContent = (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
    }
    _updateEngineCountdown();
    setInterval(_updateEngineCountdown, 1000);

    // Phase 16.2 — Cache cleared banner (visible confirmation after reload)
    try {
      const flag = sessionStorage.getItem('ZTU_CACHE_CLEARED_AT');
      if (flag) {
        sessionStorage.removeItem('ZTU_CACHE_CLEARED_AT');
        const meta = JSON.parse(flag);
        // Phase 16.2 audit fix — render the same honest breakdown the
        // pre-reload toast used (ls / ss / memory / missed).
        const parts = [`${meta.groups.length} group(s)`];
        if (meta.lsRemoved > 0) parts.push(`${meta.lsRemoved} localStorage`);
        if (meta.ssRemoved > 0) parts.push(`${meta.ssRemoved} sessionStorage`);
        if (meta.memReset  > 0) parts.push(`${meta.memReset} memory reset(s)`);
        if (meta.lsMissed  > 0) parts.push(`${meta.lsMissed} no-op (key absent)`);
        // Legacy banner fallback if old code wrote `keys` field
        if (parts.length === 1 && typeof meta.keys === 'number') {
          parts.push(`${meta.keys} key(s) removed`);
        }
        setTimeout(() => {
          showToast(`✓ Cache cleared at ${new Date(meta.at).toLocaleTimeString()} — ${parts.join(' · ')}. Dashboard reloaded from Supabase.`, 'success', 7000);
        }, 500);
      }
    } catch (e) {}

    // Phase 16.1 — Issue 5 — Run Now button.
    // Triggers ALL dashboard-side sweeps that mirror what the engine does
    // when it runs.  Cannot compile new EX5 (that's strictly PowerShell-side
    // on DESKTOP-H7MOLKJ) but executes every dashboard responsibility:
    //   1. _sweepStalePendingViaSupabase     → flips 48h-stale to unmatched + queues not_found email
    //   2. autoArchiveExpiredPool             → archives expired RetryPool entries
    //   3. _autoDetectFromBrokerAccounts      → marks IB Changed accounts
    //   4. loadData                           → refreshes all Supabase reads
    //   5. re-renders every visible sidebar page
    const btnRunNow = document.getElementById('btnEngineRunNow');
    if (btnRunNow) {
      btnRunNow.addEventListener('click', async () => {
        btnRunNow.disabled = true;
        const originalLabel = btnRunNow.textContent;
        btnRunNow.textContent = 'Running…';
        console.group('[RunNow] manual dashboard-side engine cycle starting');
        try {
          // Phase 16.2 — REAL engine trigger.  INSERT into engine_triggers;
          // master_engine.ps1 STEP 0.0 consumes pending rows on its next tick
          // and marks them 'consumed' with timestamp.  Admin sees real DB
          // evidence the trigger was acted on.
          let triggerId = null;
          let triggerInsertErr = null;
          try {
            console.log('[RunNow] supabaseClient present?', !!supabaseClient, 'DataLayer.isLive?', DataLayer.isLive);
            const insertResp = await supabaseClient
              .from('engine_triggers')
              // Phase 16.4 Issue 4 — removed `notes` column (not in user's engine_triggers schema; caused PGRST204)
              .insert([{ status: 'pending', requested_by: 'dashboard' }])
              .select('id, status, created_at');
            console.log('[RunNow] insert response:', insertResp);
            if (insertResp.error) {
              triggerInsertErr = insertResp.error;
              console.error('[RunNow] INSERT FAILED — code:', insertResp.error.code, '| message:', insertResp.error.message, '| details:', insertResp.error.details, '| hint:', insertResp.error.hint);
              showToast('Run Now FAILED — engine_triggers insert error: ' + (insertResp.error.message || 'unknown') + (insertResp.error.code ? ' [' + insertResp.error.code + ']' : ''), 'error', 9000);
            } else if (insertResp.data && insertResp.data.length > 0) {
              triggerId = insertResp.data[0].id;
              console.log('[RunNow] engine_triggers row inserted: id=' + triggerId);
            } else {
              triggerInsertErr = { message: 'insert returned no rows (RLS may be denying SELECT return)' };
              console.warn('[RunNow] insert returned empty data; cannot confirm row was written. Check RLS SELECT policy.');
              showToast('Run Now: insert returned no data — RLS may be denying read. Check Supabase policies.', 'warn', 7000);
            }
          } catch (e) {
            triggerInsertErr = e;
            console.error('[RunNow] insert exception:', e);
            showToast('Run Now exception: ' + (e.message || e), 'error', 7000);
          }
          // Phase 16.4 Issue 1 — auto-match new pending requests against broker_accounts
          // BEFORE the stale sweep so we don't kick a fresh request into 'unmatched'.
          try {
            const amRes = await _autoMatchPendingViaBroker();
            if (amRes && amRes.matchedNow > 0) {
              showToast('Auto-matched ' + amRes.matchedNow + ' pending request(s) against broker_accounts.', 'success', 4000);
            }
          } catch (e) { console.warn('[RunNow] _autoMatchPendingViaBroker failed:', e); }
          await _sweepStalePendingViaSupabase();
          await autoArchiveExpiredPool();
          await _autoDetectFromBrokerAccounts();
          await loadData();
          if (typeof renderPendingRequests       === 'function') renderPendingRequests();
          if (typeof renderWaitingForMatch       === 'function') renderWaitingForMatch();
          if (typeof renderMatchedAccountsSection=== 'function') renderMatchedAccountsSection();
          if (typeof renderCompileQueueSection   === 'function') renderCompileQueueSection();
          if (typeof renderDeliveredSection      === 'function') renderDeliveredSection();
          if (typeof refreshIntakeQueue          === 'function') refreshIntakeQueue();
          if (typeof renderDeliveryPanels        === 'function') renderDeliveryPanels();
          // Phase 17D — extended poll to 3 min @ 5-sec interval to comfortably
          // cover the fast-poll watcher's ~60s cadence + master_engine.ps1's
          // ~30-90s pipeline execution.  When the engine consumes the row we
          // also re-render every section so the new state appears at once.
          if (triggerId) {
            (async () => {
              const start = Date.now();
              while (Date.now() - start < 180000) {
                try {
                  const { data } = await supabaseClient
                    .from('engine_triggers')
                    .select('status, consumed_at')
                    .eq('id', triggerId)
                    .limit(1);
                  if (data && data[0] && data[0].status === 'consumed') {
                    showToast('Engine ACK: Run Now trigger #' + triggerId + ' consumed at ' + new Date(data[0].consumed_at).toLocaleTimeString() + '. Refreshing dashboard…', 'success', 7000);
                    try {
                      await loadData();
                      if (typeof renderPendingRequests        === 'function') renderPendingRequests();
                      if (typeof renderWaitingForMatch        === 'function') renderWaitingForMatch();
                      if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
                      if (typeof renderCompileQueueSection    === 'function') renderCompileQueueSection();
                      if (typeof renderDeliveredSection       === 'function') renderDeliveredSection();
                    } catch (_) {}
                    return;
                  }
                } catch (e) {}
                await new Promise(r => setTimeout(r, 5000));
              }
              showToast('Run Now timed out waiting for engine ACK (3 min). Confirm ZTU_TriggerWatcher is registered as a 1-min Scheduled Task (see D:\\ZTU_AUTOMATION\\TOOLS\\trigger_watcher.ps1 header).', 'warn', 9000);
            })();
          }
          if (triggerId) {
            showToast('Run Now: trigger row queued in engine_triggers (id=' + triggerId + '). Dashboard sweeps done. Engine fast-poll watcher (ZTU_TriggerWatcher, 60-sec interval) will invoke master_engine.ps1 within ~1 minute. Watch for the "Engine ACK" toast that fires when the row is consumed.', 'success', 8000);
          } else if (triggerInsertErr) {
            // Already showed error toast above. No fake success.
          } else {
            showToast('Run Now: dashboard sweeps done. Engine trigger NOT inserted — see console.', 'warn', 6000);
          }
        } catch (e) {
          console.error('[RunNow] failed:', e);
          showToast('Run Now error — see console.', 'error', 4000);
        } finally {
          console.groupEnd();
          btnRunNow.textContent = originalLabel;
          btnRunNow.disabled = false;
        }
      });
    }

    // Phase 16 follow-up #2 — admin-only debug helpers exposed on window
    // so the user can inspect pool state and test the Not Found pipeline
    // WITHOUT waiting 2 days.  These are no-ops in production traffic.
    window.__ZTU_DEBUG_RetryPool = function () {
      const entries = RetryPool.getAll();
      console.group('[ZTU DEBUG] RetryPool snapshot');
      console.log('Total entries:', entries.length);
      console.log('Active (not archived):', entries.filter(e => !e.archived).length);
      console.log('Archived:', entries.filter(e => e.archived).length);
      console.log('Expiry window:', RETRY_POOL_MAX_DAYS, 'days');
      console.table(entries.map(e => ({
        account: e.account,
        email:   e.email,
        days_elapsed: RetryPool.getDaysWaiting(e),
        is_expired:   RetryPool.isExpired(e),
        archived:     !!e.archived,
        id:           e.id,
      })));
      console.groupEnd();
      return entries;
    };

    window.__ZTU_DEBUG_forceArchive = async function (accountNumber) {
      const entries = RetryPool.getAll();
      const entry = entries.find(e => String(e.account) === String(accountNumber));
      if (!entry) { console.error('[ZTU DEBUG] No pool entry for account:', accountNumber); return; }
      if (entry.archived) { console.warn('[ZTU DEBUG] Entry already archived. Use __ZTU_DEBUG_unarchive(acct) first.'); return; }
      // Force expiry by rewriting firstMissedAt to 3 days ago.
      const pool = RetryPool._read();
      pool[entry.id].firstMissedAt = Date.now() - (RETRY_POOL_MAX_DAYS + 1) * 86_400_000;
      RetryPool._write();
      console.log('[ZTU DEBUG] firstMissedAt rewound to ' + (RETRY_POOL_MAX_DAYS + 1) + ' days ago for account ' + accountNumber + '. Triggering autoArchiveExpiredPool now...');
      await autoArchiveExpiredPool();
      console.log('[ZTU DEBUG] Sweep complete. Check Supabase license_requests + email_outbox.');
    };

    window.__ZTU_DEBUG_unarchive = function (accountNumber) {
      const entries = RetryPool.getAll();
      const entry = entries.find(e => String(e.account) === String(accountNumber));
      if (!entry) { console.error('No entry for', accountNumber); return; }
      const pool = RetryPool._read();
      pool[entry.id].archived = false;
      pool[entry.id].archivedAt = null;
      RetryPool._write();
      console.log('[ZTU DEBUG] Unarchived', accountNumber);
    };

    console.log('[ZTU DEBUG] Pool helpers ready:');
    console.log('  window.__ZTU_DEBUG_RetryPool()                  — dump pool state');
    console.log('  window.__ZTU_DEBUG_forceArchive("ACCOUNT_NUM")  — force expire + archive one entry to test pipeline');
    console.log('  window.__ZTU_DEBUG_unarchive("ACCOUNT_NUM")     — undo archive (for re-testing)');

    /* ═══════════════════════════════════════════════════════════
       Developer-only debug — Force-Expire Pending
       ───────────────────────────────────────────────────────────
       Simulates an instant 48h expiry for ONE pending license_request
       and runs it through the exact same production helpers used by
       _sweepStalePendingViaSupabase (writeUnmatched + _insertEmailOutbox).
       Zero impact on production logic — this is a window-attached
       helper only invocable from the DevTools console.
    ══════════════════════════════════════════════════════════ */
    window._ZTU_DEBUG_ForceExpirePending = async function (accountNumber) {
      console.log('[ForceExpire] starting — account:', accountNumber);
      if (!accountNumber) {
        console.error('[ForceExpire] missing account number');
        return { ok: false, reason: 'no account' };
      }
      if (!supabaseClient || !DataLayer.isLive) {
        console.error('[ForceExpire] Supabase not live — cannot proceed');
        return { ok: false, reason: 'no supabase' };
      }
      const normAcct = normalizeAccountId(accountNumber);

      // 1. Locate the pending license_request for this account.
      let row = null;
      try {
        const { data, error } = await supabaseClient
          .from(DB_SCHEMA.TABLE)
          .select(DB_SCHEMA.SELECT)
          .eq('account_number', normAcct)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) {
          console.error('[ForceExpire] fetch failed:', error.message);
          return { ok: false, reason: 'fetch error' };
        }
        if (!data || data.length === 0) {
          console.warn('[ForceExpire] no pending license_request found for account ' + normAcct);
          return { ok: false, reason: 'no pending row' };
        }
        row = data[0];
      } catch (e) {
        console.error('[ForceExpire] fetch exception:', e);
        return { ok: false, reason: 'fetch exception' };
      }
      console.log('[ForceExpire] located license_requests.id=' + row.id + ' email=' + row.email + ' status=' + row.status);

      // 2. Flip status to 'unmatched' (same path the sweep uses).
      try {
        await writeUnmatched(row.id);
        console.log('[ForceExpire] unmatched queued — license_requests.id=' + row.id + " → 'unmatched'");
      } catch (e) {
        console.error('[ForceExpire] writeUnmatched failed:', e.message);
        return { ok: false, reason: 'writeUnmatched failed', error: e.message };
      }

      // 3. Build and enqueue not_found email_outbox row.
      let emailedCount = 0;
      if (row.email && AUTO_MSG.not_found) {
        const name = row.email || 'there';
        const item = {
          id:         _autoId(),
          type:       'not_found',
          account:    normAcct,
          email:      row.email,
          subject:    AUTO_MSG.not_found.subject,
          body:       AUTO_MSG.not_found.body(name),
          request_id: row.id,
          status:     'queued',
          queued_at:  new Date().toISOString(),
        };
        try {
          const res = await _insertEmailOutbox([item]);
          emailedCount = res.inserted ? res.inserted.length : 0;
          console.log('[ForceExpire] not_found email queued — email_outbox inserts: ' + emailedCount);
        } catch (e) {
          console.error('[ForceExpire] email_outbox insert failed:', e);
        }
      } else {
        console.warn('[ForceExpire] row has no email OR AUTO_MSG.not_found missing — email step skipped.');
      }

      // 4. Refresh UI surfaces that read from RetryPool / license_requests.
      try {
        await loadData();
        renderWaitingForMatch();
        renderPendingRequests();
        if (typeof renderMatchedAccountsSection === 'function') renderMatchedAccountsSection();
        if (typeof renderDeliveredSection === 'function')       renderDeliveredSection();
        console.log('[ForceExpire] refresh complete');
      } catch (e) {
        console.warn('[ForceExpire] refresh failed (non-fatal):', e);
      }

      console.log('[ForceExpire] done — account ' + normAcct + ' is now `unmatched` in license_requests, ' + emailedCount + ' not_found row inserted to email_outbox.');
      return { ok: true, account: normAcct, license_request_id: row.id, emailed: emailedCount };
    };
    console.log('  window._ZTU_DEBUG_ForceExpirePending("ACCOUNT_NUM") — DEV: instantly simulate 48h expiry + fire full not_found pipeline');
    bindCrm();               // Phase 13 — CRM intelligence engine

    // Initial data load — shows skeleton, fetches, renders
    await loadData();

    // Start polling (immediate no-op if disabled)
    startPolling();

    // Register visibility handler for auto pause/resume
    bindVisibilityChange();

    console.log(
      '[AdminDashboard] Phase 15.1 init complete.',
      DataLayer.isLive ? 'Live mode — Supabase writes + normalization enabled.' : 'Mock mode — localStorage.',
      `${State.requests.length} requests loaded.`,
      !liveReady ? '(SDK load failed — mock fallback active)' : ''
    );
  }


  /* ─── Public API ────────────────────────────────────────────── */
  return {
    init,
    DATA,
    DB_SCHEMA,
    DataLayer,
    POLL_CONFIG,
    showToast,
    resetState,
    startPolling,
    stopPolling,
    getState: () => ({
      requests:   [...State.requests],
      lastRun:    State.lastRun,
      lastSync:   State.lastSync,
      runCount:   State.runCount,
      isRunning:  State.isRunning,
      isFetching: State.isFetching,
      isLive:     DataLayer.isLive,
    }),
  };

})();

document.addEventListener('DOMContentLoaded', AdminDashboard.init);
