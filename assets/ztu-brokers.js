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

   THERE IS DELIBERATELY NO FALLBACK BROKER LIST. An earlier version of this
   file carried FALLBACK_BROKERS = ['Exness','HFM','Pepperstone','IC Markets',
   'Other'] for resilience. That was wrong: it meant a failed API call silently
   offered brokers the administrator had never configured (or had deleted),
   producing exactly the admin/public mismatch this file now prevents. If the
   list cannot be read, load() returns ok:false with an EMPTY list and the
   caller must show "temporarily unavailable" — never an invented broker.

   NORMALIZATION: the administrator's chosen spelling is preserved for display;
   comparison is done on trim + collapse-whitespace + lowercase, matching the
   `lower(btrim(name))` unique index on the table. So "Exness", "exness" and
   " EXNESS " are one broker.

   USAGE:
     <script src="/assets/ztu-brokers.js" defer></script>
     const r = await ZTUBrokers.load();                                    // active only (public)
     const r = await ZTUBrokers.load({activeOnly:false, adminToken:tok});  // manager view
     if (!r.ok) → show "temporarily unavailable"; never invent a broker
     ZTUBrokers.populate(selectEl, r.names, { placeholder:'Select your broker' });
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.ZTUBrokers) return;                 // guard against a double include

  var TABLE = 'brokers';

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

     Returns { ok, names, rows, error }.
       ok:true  → `names` is the authoritative list (may legitimately be EMPTY
                  when the administrator has configured no brokers).
       ok:false → the list could not be read; `names` is ALWAYS empty. Callers
                  must surface "temporarily unavailable" and must not offer any
                  broker of their own.
     Never throws.

     Cache-busting: the endpoint already answers `Cache-Control: no-store`, and
     `cache:'no-store'` here stops a bfcache/Back-Forward restore from replaying
     a stale list after the administrator deletes a broker. */
  async function load(opts) {
    opts = opts || {};
    var wantAll = opts.activeOnly === false;
    var fail = function (why) { return { ok: false, names: [], rows: [], error: why || 'unavailable' }; };
    try {
      var headers = { 'Cache-Control': 'no-cache' };
      if (opts.adminToken) headers.Authorization = 'Bearer ' + opts.adminToken;
      var res = await fetch('/api/brokers' + (wantAll ? '?all=1' : ''), { headers: headers, cache: 'no-store' });
      if (!res.ok) return fail('http_' + res.status);
      var body = await res.json();
      if (body.configured === false) return fail(body.note || 'not_configured');
      if (body.error)                return fail(body.detail || body.error);

      if (wantAll) {
        var rows = Array.isArray(body.brokers) ? body.brokers : [];
        return { ok: true, names: rows.map(function (r) { return normalize(r.name); }).filter(Boolean),
                 rows: rows, error: null };
      }
      var names = (Array.isArray(body.brokers) ? body.brokers : [])
        .map(function (n) { return normalize(n); }).filter(Boolean);
      // An empty list is a VALID answer (no brokers configured), not a failure.
      return { ok: true, names: names, rows: [], error: null };
    } catch (e) {
      return fail((e && e.message) || 'exception');
    }
  }

  /* Render `names` into a <select>.
     opts.placeholder     — text for a leading disabled option (omit for none)
     opts.hidePlaceholder — also mark that option hidden (public form style)
     opts.keepValue       — re-select the current value IF it is still in the
                            list. A value that is no longer offered is dropped,
                            NOT re-added: appending it (the previous behaviour)
                            meant a broker the administrator had just deleted
                            reappeared in the selector on the next refresh.
                            Historical broker names live in
                            license_requests.broker_name and are never
                            reconstructed from this selector. */
  function populate(sel, names, opts) {
    opts = opts || {};
    if (!sel) return;
    var list = (names || []).slice();
    var wanted = opts.keepValue ? String(sel.value || '') : '';
    var keep = (wanted && list.map(key).indexOf(key(wanted)) !== -1) ? wanted : '';

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
    TABLE:      TABLE,
    normalize:  normalize,
    key:        key,
    load:       load,
    populate:   populate
  };
})();
