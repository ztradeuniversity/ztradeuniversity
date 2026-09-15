/* ══════════════════════════════════════════════════════════════════════
   Z TRADE UNIVERSITY — SHARED "ALREADY VERIFIED MEMBER — GET ACCESS" FLOW
   ----------------------------------------------------------------------
   ONE tiny orchestration used by every resource entry page's 4th button.
   It creates NO new authentication: it only sequences two components that
   already exist and are already shared site-wide —
     window.ZTUPremiumBadge.isPremium()  (assets/ztu-premium-badge.js)
     window.ZTUPremiumCard.open(...)     (assets/ztu-premium-card.js)
   — exactly the pattern trading-journal-intro.html's own handleGetAccess()
   already used inline. This just lets every resource page call it instead
   of re-implementing it.

   Usage:
     window.ZTUAccessGate.requestAccess({
       entry: 'journal' | 'mt5bot' | 'library' | 'rescue' | 'paidcourses',
       onVerified: function () { ... } // called once access is confirmed
     });

   Include once per page:
     <script src="/assets/ztu-premium-badge.js" defer></script>
     <script src="/assets/ztu-premium-card.js" defer></script>
     <script src="/assets/ztu-access-gate.js" defer></script>
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.ZTUAccessGate) return; // guard against a double include

  function requestAccess(opts) {
    opts = opts || {};
    var entry = opts.entry || '';
    var onVerified = typeof opts.onVerified === 'function' ? opts.onVerified : function () {};

    // Fast path: the shared client-side badge already knows this browser has
    // a live, unexpired session (Section 10/28/30 — no OTP, no phone prompt,
    // direct access). Backend authorization is NOT bypassed by this check —
    // it only decides whether to skip the redundant popup; the resource's
    // OWN existing gate (journal.html's session check, library.html's
    // verify-session call, etc.) remains the real, authoritative check on
    // every subsequent load (Section 15).
    try {
      if (window.ZTUPremiumBadge && window.ZTUPremiumBadge.isPremium()) {
        onVerified();
        return;
      }
    } catch (e) {}

    // Not currently verified in this browser: the shared OTP modal (Section
    // 11/12/44) — same component Journal/Library/Rescue/Paid-Courses already
    // use, never a new one. On success it saves the shared session itself.
    if (window.ZTUPremiumCard && typeof window.ZTUPremiumCard.open === 'function') {
      window.ZTUPremiumCard.open({
        entry: entry,
        dismissible: true,
        onApproved: function () { onVerified(); },
      });
    } else {
      // Component failed to load (e.g. blocked script) — the only remaining
      // safe path is the real License Request page; never invent a fallback
      // verification flow.
      window.location.href = 'license-request.html';
    }
  }

  window.ZTUAccessGate = { requestAccess: requestAccess };
})();
