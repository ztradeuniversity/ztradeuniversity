/* ════════════════════════════════════════════════════════════════════════
   ZTU PREMIUM MEMBER — reusable badge component  (Big Phase 4B)
   File: /assets/ztu-premium-badge.js

   A self-contained, framework-free drop-in that renders the "ZTU PREMIUM
   MEMBER" badge ONLY when the visitor holds an active unified-access session.
   It reuses the SAME client-side session keys the existing surfaces already
   write — it creates no new access state and duplicates no approval logic:

     • Trading Journal → localStorage 'ztu_journal_v1'  { account, sessionStart }
     • Library         → localStorage 'ztu_lib_v3'      { account, createdAt }

   (Both are 15-day hard-expiry sessions. If either is present and unexpired,
    the member is premium — one approval unlocks all surfaces.)

   USAGE — add to any page (Library, AI Unlimited, etc.):
     <span data-ztu-premium-badge></span>
     <script src="/assets/ztu-premium-badge.js" defer></script>

   The Trading Journal keeps its own inline Phase-4A badge and does NOT need
   this file — this component exists so Library and AI Unlimited can show the
   identical badge with a single line, without copying the markup/CSS.

   Programmatic API (optional):
     window.ZTUPremiumBadge.isPremium()        → boolean
     window.ZTUPremiumBadge.mount(el)          → render into a specific element
     window.ZTUPremiumBadge.refresh()          → re-evaluate + re-render all mounts
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
  var STYLE_ID = 'ztu-premium-badge-style';

  // ── Session detection (read-only; never writes or grants) ──
  function sessionActive(key, tsField) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return false;
      var s = JSON.parse(raw);
      if (!s || !s.account) return false;
      var started = s[tsField];
      if (!started) return false;
      return (Date.now() - started) <= FIFTEEN_DAYS_MS;
    } catch (e) { return false; }
  }

  function isPremium() {
    return sessionActive('ztu_journal_v1', 'sessionStart') ||
           sessionActive('ztu_lib_v3', 'createdAt');
  }

  // ── One-time scoped CSS injection (self-contained look, no page deps) ──
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.ztu-premium-badge{display:inline-flex;align-items:center;gap:6px;' +
      'padding:6px 13px;border-radius:100px;' +
      'background:linear-gradient(135deg,#e6c987 0%,#c89c3f 50%,#8c6c1f 100%);' +
      'color:#fff;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'font-size:11px;font-weight:800;letter-spacing:.4px;white-space:nowrap;' +
      'box-shadow:0 6px 16px rgba(200,156,63,0.34);line-height:1;}' +
      '.ztu-premium-badge svg{width:13px;height:13px;flex-shrink:0;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  var BADGE_HTML =
    '<span class="ztu-premium-badge" role="status" aria-label="ZTU Premium Member">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 ' +
    '2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z"/></svg>ZTU PREMIUM MEMBER</span>';

  // ── Render into a single element ──
  function mount(el) {
    if (!el) return;
    if (isPremium()) {
      injectStyle();
      el.innerHTML = BADGE_HTML;
      el.style.display = '';
    } else {
      el.innerHTML = '';
      el.style.display = 'none';
    }
  }

  // ── Render into every declared mount point ──
  function refresh() {
    var nodes = document.querySelectorAll('[data-ztu-premium-badge]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  window.ZTUPremiumBadge = { isPremium: isPremium, mount: mount, refresh: refresh };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  // Re-evaluate if another tab logs in/out (storage event fires cross-tab).
  window.addEventListener('storage', function (e) {
    if (e.key === 'ztu_journal_v1' || e.key === 'ztu_lib_v3') refresh();
  });
})();
