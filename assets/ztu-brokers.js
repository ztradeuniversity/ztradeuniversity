/* ════════════════════════════════════════════════════════════════════════
   ZTU BROKER LIST — single shared source for the admin-managed broker list
   File: /assets/ztu-brokers.js

   THE AUTHORITATIVE LIST LIVES IN THE DATABASE: table `brokers` in the
   AUTOMATION Supabase project (see supabase/brokers-table.sql), reached ONLY
   through the server-side endpoint /api/brokers — the browser never queries
   that table directly, and the table carries no anon policies, so the public
   anon key cannot read around it or write to it. This file is the ONE place
   that knows how to fetch the list and render it into a <select>, so the
   broker names are never hardcoded in two pages again.

   Consumers:
     · license-request.html            → public broker selector (active only)
     · admin/pages/admin-dashboard.html → "Your Brokers" manager + the
                                          Create License Request selector

   FALLBACK_BROKERS below is NOT a second source of truth — it is the
   resilience path used only when the `brokers` table cannot be read (table not
   migrated yet, network failure, RLS change). Without it, a database hiccup
   would leave the public form with an empty broker selector and block real
   submissions. It matches the five options both pages hardcoded before this
   change, so behaviour is unchanged when the table is unavailable.

   NORMALIZATION: the administrator's chosen spelling is preserved for display;
   comparison is done on trim + collapse-whitespace + lowercase, matching the
   `lower(btrim(name))` unique index on the table. So "Exness", "exness" and
   " EXNESS " are one broker.

   USAGE:
     <script src="/assets/ztu-brokers.js" defer></script>
     const r = await ZTUBrokers.load();                                    // active only (public)
     const r = await ZTUBrokers.load({activeOnly:false, adminToken:tok});  // manager view
     ZTUBrokers.populate(selectEl, r.names, { placeholder:'Select your broker' });
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.ZTUBrokers) return;                 // guard against a double include

  var TABLE = 'brokers';
  var FALLBACK_BROKERS = ['Exness', 'HFM', 'Pepperstone', 'IC Markets', 'Other'];

  /* Display-safe normalization: trim the ends and collapse internal runs of
     whitespace. Case is preserved — this is what gets stored and shown. */
  function normalize(name) {
    return String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  }

  /* Comparison key — mirrors the table's lower(btrim(name)) unique index. */
  function key(name) {
    return normalize(name).toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Read the broker list through the server-side endpoint.

     SECURITY: this deliberately does NOT touch Supabase from the browser. The
     `brokers` table has no anon policies at all — every read and write goes
     through /api/brokers, which uses the server-side service key. That is what
     makes the list publicly readable but not publicly writable.

     `adminToken` (admin pages only) is sent as a Bearer token so the endpoint
     can return disabled brokers too; without it only ACTIVE brokers come back,
     which is exactly what the public form should see.

     Returns { names, rows, source:'api'|'fallback', error }.
     NEVER throws and NEVER returns an empty list — a caller can always render
     a usable selector from `names`. */
  async function load(opts) {
    opts = opts || {};
    var wantAll = opts.activeOnly === false;
    var fb = function (why) {
      return { names: FALLBACK_BROKERS.slice(), rows: [], source: 'fallback', error: why || null };
    };
    try {
      var headers = {};
      if (opts.adminToken) headers.Authorization = 'Bearer ' + opts.adminToken;
      var res = await fetch('/api/brokers' + (wantAll ? '?all=1' : ''), { headers: headers });
      if (!res.ok) return fb('http_' + res.status);
      var body = await res.json();
      if (body.configured === false) return fb(body.note || 'not_configured');
      if (body.error)                return fb(body.detail || body.error);

      if (wantAll) {
        var rows = Array.isArray(body.brokers) ? body.brokers : [];
        return { names: rows.map(function (r) { return normalize(r.name); }).filter(Boolean),
                 rows: rows, source: 'api', error: null };
      }
      var names = (Array.isArray(body.brokers) ? body.brokers : [])
        .map(function (n) { return normalize(n); }).filter(Boolean);
      if (!names.length) return fb('no_active_brokers');
      return { names: names, rows: [], source: 'api', error: null };
    } catch (e) {
      return fb((e && e.message) || 'exception');
    }
  }

  /* Render `names` into a <select>.
     opts.placeholder     — text for a leading disabled option (omit for none)
     opts.hidePlaceholder — also mark that option hidden (public form style)
     opts.keepValue       — preserve the currently selected value; if that value
                            is no longer offered (e.g. a broker was disabled
                            after the record was created) it is appended so an
                            existing/historical selection is never silently
                            rewritten to something else. */
  function populate(sel, names, opts) {
    opts = opts || {};
    if (!sel) return;
    var keep = opts.keepValue ? String(sel.value || '') : '';
    var list = (names || []).slice();
    if (keep && list.map(key).indexOf(key(keep)) === -1) list.push(keep);

    var html = '';
    if (opts.placeholder !== undefined) {
      html += '<option value="" disabled' + (keep ? '' : ' selected') +
              (opts.hidePlaceholder ? ' hidden' : '') + '>' + esc(opts.placeholder) + '</option>';
    }
    html += list.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
    }).join('');
    sel.innerHTML = html;
    if (keep) sel.value = keep;
  }

  window.ZTUBrokers = {
    TABLE:             TABLE,
    FALLBACK_BROKERS:  FALLBACK_BROKERS,
    normalize:         normalize,
    key:               key,
    load:              load,
    populate:          populate
  };
})();
