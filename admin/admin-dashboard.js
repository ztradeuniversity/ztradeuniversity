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
    BUCKET: 'screenshots',

    COLS: {
      id:               'id',
      account_number:   'account_number',
      email:            'email',
      screenshot_url:   'screenshot_url',
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

    // Safe anon-readable SELECT string
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
        lastUpdate:  row.created_at
          ? new Date(row.created_at).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
            })
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
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
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

    bodyEl.innerHTML = pending.map(r => `
      <div class="pool-row">
        <span class="pool-row-acct">${esc(r.account)}</span>
        <span class="pool-row-email">${esc(r.email || r.name)}</span>
        <span class="pool-row-broker">${esc(r.broker)}</span>
        <span class="pool-row-date">${esc(r.lastUpdate)}</span>
        <span class="pool-row-status">Waiting for Broker Confirmation</span>
      </div>`
    ).join('');
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
  function renderWaitingForMatch() {
    const activeCardEl    = document.getElementById('waitingActiveCard');
    const activeBodyEl    = document.getElementById('waitingActiveBody');
    const activeCountEl   = document.getElementById('waitingActiveCount');
    const archivedCardEl  = document.getElementById('waitingArchivedCard');
    const archivedBodyEl  = document.getElementById('waitingArchivedBody');
    const archivedCountEl = document.getElementById('waitingArchivedCount');
    const emptyEl         = document.getElementById('waitingEmpty');
    if (!activeBodyEl) return;   // section not in DOM

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

    // ── Active retry pool ──────────────────────────────────────
    if (activeCountEl) activeCountEl.textContent = active.length;
    if (active.length > 0) {
      activeBodyEl.innerHTML = active.map(entry => {
        const days    = RetryPool.getDaysWaiting(entry);
        const daysCls = days >= 6 ? 'pool-row-days--critical'
                      : days >= 4 ? 'pool-row-days--warn' : '';
        const checked = entry.lastChecked
          ? new Date(entry.lastChecked).toLocaleString([], {
              month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })
          : '—';
        return `<div class="pool-row pool-row--7">
          <span class="pool-row-acct">${esc(entry.account)}</span>
          <span class="pool-row-email">${esc(entry.email)}</span>
          <span class="pool-row-broker">${esc(entry.broker)}</span>
          <span class="pool-row-date">${esc(entry.requestDate)}</span>
          <span class="pool-row-days ${daysCls}">${days}d</span>
          <span class="pool-row-retries">Checked ${entry.retryCount}&times;</span>
          <span class="pool-row-checked">${checked}</span>
        </div>`;
      }).join('');
      if (activeCardEl) activeCardEl.hidden = false;
    } else {
      if (activeCardEl) activeCardEl.hidden = true;
    }

    // ── Archived (7-day window expired) ───────────────────────
    if (archivedCountEl) archivedCountEl.textContent = archived.length;
    if (archived.length > 0) {
      archivedBodyEl.innerHTML = archived.map(entry => {
        const days = RetryPool.getDaysWaiting(entry);

        // Archive date: use stored archivedAt, or estimate from firstMissedAt + 7 days
        const archiveMs = entry.archivedAt
          || (entry.firstMissedAt ? entry.firstMissedAt + RETRY_POOL_MAX_DAYS * RETRY_POOL_DAY_MS : null);
        const archivedStr = archiveMs
          ? new Date(archiveMs).toLocaleString([], {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          : '—';

        return `<div class="pool-row pool-row--7 pool-row--archived">
          <span class="pool-row-acct">${esc(entry.account)}</span>
          <span class="pool-row-email">${esc(entry.email)}</span>
          <span class="pool-row-broker">${esc(entry.broker)}</span>
          <span class="pool-row-date">${esc(entry.requestDate)}</span>
          <span class="pool-row-days">${days}d+</span>
          <span class="pool-row-retries">${entry.retryCount} checks</span>
          <span class="pool-row-checked pool-row-checked--archived">${archivedStr}</span>
        </div>`;
      }).join('');
      if (archivedCardEl) archivedCardEl.hidden = false;
    } else {
      if (archivedCardEl) archivedCardEl.hidden = true;
    }

    // ── Empty state ────────────────────────────────────────────
    if (emptyEl) emptyEl.hidden = (active.length + archived.length) > 0;
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
    const toArchive = RetryPool.getAll().filter(
      e => !e.archived && RetryPool.isExpired(e)
    );
    if (toArchive.length === 0) return;

    console.group(`[RetryPool] Auto-archiving ${toArchive.length} expired entry/entries…`);

    let count = 0;
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
          : 'pending';   // safe default — assume pending if not in current state

        if (currentCanonical === 'pending') {
          await writeUnmatched(entry.id);   // no-op in mock; RLS-gated in live
        }
        RetryPool.archive(entry.id);
        count++;
        console.log(
          `[RetryPool] Auto-archived ${entry.account}` +
          ` — ${RetryPool.getDaysWaiting(entry)}d elapsed, ${entry.retryCount} check(s) run.`
        );
      } catch (err) {
        console.warn(`[RetryPool] Auto-archive failed for ${entry.account}:`, err.message);
      } finally {
        WriteLock.delete(entry.id);
      }
    }

    console.groupEnd();

    if (count > 0) {
      // Re-render pool pages to reflect the newly archived entries
      renderWaitingForMatch();
      renderPendingRequests();
    }
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
          <span>Commission</span><span>Volume (lots)</span>
        </div>
        <div class="crm-table-body">
          ${rows.length === 0
            ? `<div class="crm-no-results">No clients match this filter.</div>`
            : rows.map(r => {
                const d   = CrmStore.daysSince(r.lastTrade);
                const cls = d === null ? '' : d <= 7 ? 'crm-days--fresh' : d <= 30 ? '' : d <= 90 ? 'crm-days--stale' : 'crm-days--old';
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
          <span>Platform</span><span>Joined</span><span>Last Trade</span><span>Commission</span>
        </div>
        <div class="crm-table-body">
          ${rows.length === 0
            ? `<div class="crm-no-results">No clients match this filter.</div>`
            : rows.map(r =>
                `<div class="crm-row crm-row--inactive">
                  <span class="crm-cell-acct">${esc(r.account)}</span>
                  <span class="crm-cell-email">${fmtContact(r)}</span>
                  <span class="crm-cell-cc">${esc(r.country||'—')}</span>
                  <span class="crm-cell-type">${esc(r.accountType||'—')}</span>
                  <span class="crm-cell-plat">${esc(r.platform||'—')}</span>
                  <span class="crm-cell-date">${esc(r.createdAt||'—')}</span>
                  <span class="crm-cell-date">${r.lastTrade ? esc(r.lastTrade) : '<span class="crm-never">Never</span>'}</span>
                  <span class="crm-cell-money">${fmtMoney(r.reward)}</span>
                </div>`
              ).join('')
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
          <span>Type</span><span>Commission</span><span>Volume (lots)</span><span>Last Trade</span>
        </div>
        <div class="crm-table-body">
          ${top.length === 0
            ? `<div class="crm-no-results">No commission data available. Upload a broker file with reward/commission data.</div>`
            : top.map((r, i) =>
                `<div class="crm-row crm-row--hv">
                  <span class="crm-cell-rank crm-rank-${i<3?i+1:'rest'}">#${i+1}</span>
                  <span class="crm-cell-acct">${esc(r.account)}</span>
                  <span class="crm-cell-email">${fmtContact(r)}</span>
                  <span class="crm-cell-cc">${esc(r.country||'—')}</span>
                  <span class="crm-cell-type">${esc(r.accountType||'—')}</span>
                  <span class="crm-cell-money crm-money--hi">${fmtMoney(r.reward)}</span>
                  <span class="crm-cell-lots">${fmtLots(r.volumeLots)}</span>
                  <span class="crm-cell-date">${esc(r.lastTrade||'—')}</span>
                </div>`
              ).join('')
          }
        </div>
      </div>`;
  }


  /* ─── Global Search ──────────────────────────────────────── */
  let _crmSearchTimer = null;

  function renderCrmSearch(q) {
    const resultsEl = document.getElementById('crmSearchResults');
    const countEl   = document.getElementById('crmSearchCount');
    const tableCard = document.getElementById('crmSearchTableCard');
    const noDataEl  = document.getElementById('crmSearchNoData');

    if (!resultsEl) return;

    if (CrmStore.isEmpty()) {
      if (tableCard)  tableCard.hidden  = true;
      if (noDataEl) { noDataEl.innerHTML = buildCrmNoData(); noDataEl.hidden = false; }
      if (countEl)    countEl.textContent = '—';
      return;
    }

    if (tableCard)  tableCard.hidden  = false;
    if (noDataEl)   noDataEl.hidden   = true;

    const query   = (q || '').trim();
    const results = CrmStore.search(query);

    if (countEl) {
      countEl.textContent = query
        ? `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`
        : `${results.length} total client${results.length !== 1 ? 's' : ''}`;
    }

    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="crm-no-results">No clients match "${esc(query)}".</div>`;
      return;
    }

    resultsEl.innerHTML = results.map(r =>
      `<div class="crm-row crm-row--search">
        <span class="crm-cell-acct">${esc(r.account)}</span>
        <span class="crm-cell-email">${fmtContact(r)}</span>
        <span class="crm-cell-cc">${esc(r.country||'—')}</span>
        <span class="crm-cell-type">${esc(r.accountType||'—')}</span>
        <span class="crm-cell-plat">${esc(r.platform||'—')}</span>
        <span class="crm-cell-date">${r.lastTrade ? esc(r.lastTrade) : '<span class="crm-never">Never</span>'}</span>
        <span class="crm-cell-money">${fmtMoney(r.reward)}</span>
        <span class="crm-badge ${r.lastTrade?'crm-badge--active':'crm-badge--inactive'}">${r.lastTrade?'Active':'Inactive'}</span>
      </div>`
    ).join('');
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
      default: return CrmStore.getActive().map(crmToC);
    }
  }

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
  function renderCampaignBuilder() {
    const noDataEl  = document.getElementById('crmMsgNoData');
    const composeEl = document.getElementById('crmMsgCompose');
    if (!composeEl) return;

    const hasData = !CrmStore.isEmpty() || RetryPool.getAll().length > 0;
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

  /** Format an ISO date string as "DD Mon YYYY". */
  function _iqFmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
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

      let actions = '';
      if (!isTerminal) {
        const s = String(r.status || r.dbStatus || '').toLowerCase();
        if (['matched', 'approved', 'compile_ready'].includes(s)) {
          actions = `
            <button class="iq-btn iq-btn--action" data-iq-action="compiled" data-iq-id="${r.id}" type="button" title="Mark as Compiled">Compiled</button>
            <button class="iq-btn iq-btn--action" data-iq-action="emailed"  data-iq-id="${r.id}" type="button" title="Mark as Emailed">Emailed</button>
            <button class="iq-btn iq-btn--danger" data-iq-action="rejected" data-iq-id="${r.id}" type="button" title="Reject">Reject</button>`;
        } else if (s === 'compiled') {
          actions = `
            <button class="iq-btn iq-btn--action" data-iq-action="emailed"  data-iq-id="${r.id}" type="button" title="Mark as Emailed">Emailed</button>
            <button class="iq-btn iq-btn--danger" data-iq-action="rejected" data-iq-id="${r.id}" type="button" title="Reject">Reject</button>`;
        }
      }

      return `<div class="intake-queue-row" data-iq-row-id="${r.id}">
        <span class="iq-cell iq-acct" title="${acct}">${acct}</span>
        <span class="iq-cell iq-email" title="${email}">${email}</span>
        <span class="iq-cell iq-broker" title="${broker}">${broker}</span>
        <span class="iq-cell iq-date">${date}</span>
        <span class="iq-cell iq-file" title="${file}">${file}</span>
        <span class="iq-cell iq-status">${pill}</span>
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

  /* ── Message templates ─────────────────────────────────── */
  const AUTO_MSG = {
    matched: {
      subject: 'Your ZTU Bot Account Has Been Approved ✓',
      body: (name) =>
        `Hi ${name || 'there'},\n\n` +
        `Great news — your trading account has been matched to our IB referral and approved.\n` +
        `Your EA bot file is now being compiled and will be delivered to you shortly.\n\n` +
        `What happens next:\n` +
        `• Your personalised EA file will be emailed to you within 24 hours.\n` +
        `• Install it on your MT5 platform as directed in our setup guide.\n` +
        `• The bot will activate automatically on your confirmed broker account.\n\n` +
        `Thank you for registering with ZTU.\n\nBest regards,\nZTU Support Team`,
      wa: (name, acct) =>
        `✅ *ZTU Bot Approved*\n\nHi ${name || 'there'}, your account *${acct}* has been matched and approved. ` +
        `Your EA file is being compiled and will be delivered shortly. Watch your email! 🎉`,
    },
    waiting: {
      subject: 'Your ZTU Bot Account — Match Pending',
      body: (name) =>
        `Hi ${name || 'there'},\n\n` +
        `We checked the latest broker report but were unable to find your trading account in our IB data yet.\n\n` +
        `Your account was not found in the current broker data.\n` +
        `Please wait while we continue checking new broker reports for 24–48 hours.\n` +
        `You will be notified automatically if matched.\n\n` +
        `Why this can happen:\n` +
        `• The broker report may not have updated yet (can take 1–3 business days).\n` +
        `• Your account may have been created before our referral link was used.\n\n` +
        `No action is needed from you right now. We will keep checking.\n\nBest regards,\nZTU Support Team`,
      wa: (name, acct) =>
        `⏳ *ZTU Bot — Match Pending*\n\nHi ${name || 'there'}, account *${acct}* was not found in today's broker data. ` +
        `We'll keep checking for 24–48 hours. You'll be notified automatically when matched.`,
    },
    not_found: {
      subject: 'Your ZTU Bot Account — Match Not Found',
      body: (name) =>
        `Hi ${name || 'there'},\n\n` +
        `Your account was still not found after repeated checks over 24–48 hours.\n\n` +
        `Unfortunately we were unable to confirm your trading account under our IB referral after multiple checks.\n\n` +
        `Next steps:\n` +
        `• Please create a new broker account using our official referral link with a new email address.\n` +
        `• Visit our website and click the broker registration link directly before signing up.\n` +
        `• Contact us if you need help — we're happy to guide you through the process.\n\n` +
        `We're sorry for the inconvenience.\n\nBest regards,\nZTU Support Team`,
      wa: (name, acct) =>
        `❌ *ZTU Bot — Match Not Found*\n\nHi ${name || 'there'}, after 24–48 hours of checks, account *${acct}* could not be confirmed under our IB referral. ` +
        `Please register a new account using our official link. Contact us for help.`,
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
    // STEP 1 — Matched accounts → compile_ready (Supabase writes)
    // ─────────────────────────────────────────────────────────
    _autoSetStep('autoStep1', 'running');

    for (const req of queued) {
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
        // Delayed match — remove from RetryPool if it was waiting
        RetryPool.remove(req.id);
        successCount++;
      } catch (e) {
        failCount++;
        errors.push(`${req.account}: ${e.message}`);
        console.error('[Phase15] compile_ready write failed:', req.account, e);
      } finally {
        WriteLock.delete(req.id);
      }
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
    matched.forEach(r => emailItems.push(_buildEmailItem(r, 'matched')));

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
    // STEP 5 — Finalize: refresh all dashboard sections
    // ─────────────────────────────────────────────────────────
    _autoSetStep('autoStep5', 'running');

    await loadData();
    renderWaitingForMatch();
    renderPendingRequests();
    refreshIntakeQueue();

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
  async function init() {
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
