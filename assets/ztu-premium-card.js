/* ════════════════════════════════════════════════════════════════════════
   ZTU UNIFIED PREMIUM ACCESS CARD — single shared component  (Phase 4B Ext.)
   File: /assets/ztu-premium-card.js

   ONE access wall reused by Trading Journal, AI Trading Assistant and Library.
   No surface keeps its own access markup. Verification reuses the existing
   unified gate (/api/journal-access → library-auth → ib_stars_active /
   special_access). No new access logic, no new tables.

   USAGE (any surface):
     <script src="/assets/ztu-premium-card.js" defer></script>
     ZTUPremiumCard.open({
       entry: 'journal' | 'ai' | 'library',   // headline emphasis only
       dismissible: true,                      // false = hard gate (Journal)
       onApproved: function (result) { ... }   // surface-specific unlock
     });
     ZTUPremiumCard.close();

   On a successful verify the component itself writes the SHARED sessions
   ('ztu_journal_v1' + 'ztu_lib_v3'), refreshes any ZTU premium badges, and
   shows the "Access Approved" modal. `onApproved(result)` then runs each
   surface's own finalization (result = { account, uuid, jwt, expiresAt }).

   WhatsApp support number is a single config constant (never hardcoded inline);
   override before load via window.ZTU_PREMIUM_CARD_CONFIG.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.ZTUPremiumCard) return; // singleton

  var CFG = Object.assign({
    WHATSAPP_SUPPORT_NUMBER: '17189730347',      // project convention (see access-copy.js)
    ACCESS_ENDPOINT:         '/api/journal-access',
    JOIN_URL:                'create-account-with-us.html',
    SUBMIT_URL:              'license-request.html',
  }, window.ZTU_PREMIUM_CARD_CONFIG || {});

  var JOURNAL_KEY = 'ztu_journal_v1';
  var LIB_KEY     = 'ztu_lib_v3';
  var STYLE_ID    = 'zpc-style';

  var state = { otpToken: null, account: null, opts: null };

  // ── shared sessions (write-through so one approval unlocks every surface) ──
  function persistSessions(account) {
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify({ account: account, sessionStart: Date.now() })); } catch (e) {}
    try {
      var ex = JSON.parse(localStorage.getItem(LIB_KEY) || 'null');
      if (!ex || ex.account !== account) {
        localStorage.setItem(LIB_KEY, JSON.stringify({ account: account, createdAt: Date.now() }));
      }
    } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
    + '.zpc-overlay{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:18px;'
    + 'background:rgba(6,5,2,0.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);'
    + 'font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;}'
    + '.zpc-overlay.on{display:flex;}'
    // Phase 4C: NO internal scroll (no max-height / no overflow). The whole card
    // is sized to fit one viewport at every breakpoint, with prominent icon-led
    // benefit cards and stronger typography. Priority order top→bottom:
    // benefits → Verify Access → Join IB → Submit Record → WhatsApp.
    + '.zpc-card{width:100%;max-width:980px;position:relative;'
    + 'background:linear-gradient(165deg,#1d170d 0%,#120d06 100%);border:1px solid rgba(214,176,90,0.5);'
    + 'border-radius:22px;padding:24px 30px;color:#fff;'
    + 'box-shadow:0 30px 80px rgba(0,0,0,0.66),0 0 0 1px rgba(230,201,135,0.1) inset,0 -2px 44px rgba(200,156,63,0.14) inset;}'
    + '.zpc-card::before{content:"";position:absolute;top:-110px;right:-80px;width:340px;height:340px;'
    + 'background:radial-gradient(circle,rgba(230,201,135,0.2) 0%,transparent 70%);pointer-events:none;}'
    + '.zpc-close{position:absolute;top:14px;right:16px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(214,176,90,0.35);'
    + 'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.75);font-size:19px;line-height:1;cursor:pointer;z-index:3;}'
    + '.zpc-close:hover{color:#fff;border-color:rgba(230,201,135,0.7);background:rgba(230,201,135,0.14);}'
    + '.zpc-eyebrow{position:relative;font-size:11px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;color:#f0d488;}'
    + '.zpc-title{position:relative;font-family:Manrope,Inter,sans-serif;font-size:29px;font-weight:900;color:#fff;letter-spacing:-.7px;margin:5px 0 4px;line-height:1.05;}'
    + '.zpc-title span{background:linear-gradient(135deg,#f9ecc4,#e6c987 50%,#c89c3f);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}'
    + '.zpc-sub{position:relative;font-size:14px;color:rgba(255,255,255,0.72);line-height:1.45;margin-bottom:16px;}'
    // benefits — 3 prominent icon-led product cards
    + '.zpc-benefits3{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-bottom:15px;}'
    + '.zpc-pcard{background:rgba(255,255,255,0.05);border:1px solid rgba(214,176,90,0.26);border-radius:14px;padding:13px 14px;}'
    + '.zpc-pcard h4{font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#f0d488;'
    + 'margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid rgba(214,176,90,0.22);}'
    + '.zpc-feat{display:flex;gap:9px;align-items:center;margin-bottom:8px;}'
    + '.zpc-feat:last-child{margin-bottom:0;}'
    + '.zpc-feat .ic{font-size:16px;line-height:1;flex-shrink:0;width:20px;text-align:center;}'
    + '.zpc-feat .lbl{font-size:13px;font-weight:600;color:rgba(255,255,255,0.93);line-height:1.25;}'
    // middle — verify (primary) | side (requirement + join/submit + whatsapp)
    + '.zpc-mid{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch;}'
    + '.zpc-verify{background:rgba(230,201,135,0.07);border:1px solid rgba(214,176,90,0.3);border-radius:14px;padding:15px 16px;}'
    + '.zpc-vtitle{font-family:Manrope,Inter,sans-serif;font-size:16px;font-weight:800;color:#fff;margin:0 0 11px;}'
    + '.zpc-label{display:block;font-size:12px;font-weight:700;color:rgba(255,255,255,0.8);margin-bottom:7px;}'
    + '.zpc-input{width:100%;padding:13px 14px;border-radius:10px;background:rgba(255,255,255,0.08);'
    + 'border:1.5px solid rgba(214,176,90,0.38);color:#fff;font-size:15px;font-family:inherit;box-sizing:border-box;}'
    + '.zpc-input::placeholder{color:rgba(255,255,255,0.42);}'
    + '.zpc-input:focus{outline:none;border-color:#e6c987;box-shadow:0 0 0 3px rgba(230,201,135,0.22);background:rgba(255,255,255,0.11);}'
    + '.zpc-btn{width:100%;margin-top:11px;padding:14px 18px;border-radius:11px;border:0;cursor:pointer;'
    + 'background:linear-gradient(135deg,#f9ecc4 0%,#e6c987 45%,#c89c3f 100%);color:#3a2c08;font-size:15px;font-weight:900;letter-spacing:.2px;'
    + 'box-shadow:0 12px 28px rgba(200,156,63,0.5);transition:transform .15s,box-shadow .15s,filter .15s;}'
    + '.zpc-btn:hover{transform:translateY(-1px);box-shadow:0 16px 34px rgba(230,201,135,0.62);filter:brightness(1.04);}'
    + '.zpc-btn:disabled{opacity:.55;cursor:default;transform:none;}'
    + '.zpc-msg{font-size:12.5px;padding:9px 12px;border-radius:9px;margin-top:10px;display:none;}'
    + '.zpc-msg.err{display:block;background:rgba(239,68,68,0.16);color:#fca5a5;border:1px solid rgba(239,68,68,0.32);}'
    + '.zpc-msg.ok{display:block;background:rgba(16,185,129,0.16);color:#6ee7b7;border:1px solid rgba(16,185,129,0.32);}'
    + '.zpc-links{font-size:12px;color:rgba(255,255,255,0.58);margin-top:10px;text-align:center;}'
    + '.zpc-links a{color:#f0d488;font-weight:700;cursor:pointer;text-decoration:none;}'
    + '.zpc-links a:hover{text-decoration:underline;}'
    + '.zpc-side{display:flex;flex-direction:column;gap:10px;}'
    + '.zpc-req{background:linear-gradient(135deg,rgba(230,201,135,0.18),rgba(200,156,63,0.06));'
    + 'border:1px solid rgba(214,176,90,0.45);border-radius:12px;padding:12px 14px;}'
    + '.zpc-req-badge{display:inline-block;font-size:10px;font-weight:900;letter-spacing:.8px;color:#1a1410;'
    + 'background:linear-gradient(135deg,#f9ecc4,#d4ae5e);padding:4px 11px;border-radius:100px;margin-bottom:7px;}'
    + '.zpc-req p{font-size:12.5px;color:rgba(255,255,255,0.88);line-height:1.45;margin:0;}'
    + '.zpc-req b{color:#f0d488;}'
    + '.zpc-alt{display:flex;gap:10px;}'
    + '.zpc-alt-col{flex:1;display:flex;flex-direction:column;gap:6px;}'
    + '.zpc-alt-label{font-size:11px;color:rgba(255,255,255,0.6);line-height:1.3;}'
    + '.zpc-link-btn{display:inline-flex;align-items:center;justify-content:center;margin-top:auto;padding:11px 14px;border-radius:10px;'
    + 'text-decoration:none;background:linear-gradient(135deg,#f9ecc4,#e6c987 50%,#c89c3f);color:#3a2c08;font-size:13px;font-weight:900;'
    + 'box-shadow:0 8px 18px rgba(200,156,63,0.42);}'
    + '.zpc-link-btn:hover{filter:brightness(1.04);}'
    + '.zpc-ghost-btn{display:inline-flex;align-items:center;justify-content:center;margin-top:auto;padding:11px 14px;border-radius:10px;'
    + 'text-decoration:none;background:rgba(255,255,255,0.06);border:1px solid rgba(214,176,90,0.45);color:#f0d488;font-size:13px;font-weight:800;}'
    + '.zpc-ghost-btn:hover{background:rgba(230,201,135,0.16);}'
    + '.zpc-support{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;'
    + 'margin-top:auto;padding-top:10px;border-top:1px solid rgba(214,176,90,0.22);}'
    + '.zpc-support span{font-size:12px;color:rgba(255,255,255,0.62);}'
    + '.zpc-wa{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:100px;text-decoration:none;'
    + 'background:linear-gradient(135deg,#25d366,#1aa84f);color:#fff;font-size:13px;font-weight:800;box-shadow:0 8px 18px rgba(37,211,102,0.38);}'
    + '.zpc-wa svg{width:16px;height:16px;}'
    /* approved modal */
    + '.zpc-approved .zpc-card{max-width:430px;text-align:center;}'
    + '.zpc-ac-ico{width:62px;height:62px;border-radius:50%;margin:0 auto 15px;background:rgba(16,185,129,0.14);'
    + 'border:1px solid rgba(16,185,129,0.4);color:#10b981;display:flex;align-items:center;justify-content:center;}'
    + '.zpc-ac-ico svg{width:30px;height:30px;}'
    + '.zpc-ac-title{font-family:Manrope,Inter,sans-serif;font-size:22px;font-weight:900;color:#fff;margin:0 0 6px;}'
    + '.zpc-ac-lead{font-size:13.5px;color:rgba(255,255,255,0.6);margin:0 0 18px;}'
    + '.zpc-grant{display:flex;gap:9px;align-items:center;justify-content:flex-start;text-align:left;font-size:13.5px;'
    + 'font-weight:600;color:rgba(255,255,255,0.9);padding:8px 0;}'
    + '.zpc-grant i{width:21px;height:21px;border-radius:50%;background:rgba(16,185,129,0.14);color:#10b981;'
    + 'display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;font-size:12px;flex-shrink:0;}'
    // ── responsive: collapse to single column, compact to keep NO scroll ──
    // Tablet/large-phone: 2-col benefits, single-col mid.
    + '@media(max-width:880px){.zpc-benefits3{grid-template-columns:repeat(2,1fr);gap:9px;}.zpc-mid{grid-template-columns:1fr;gap:11px;}'
    + '.zpc-card{padding:20px 18px;}.zpc-title{font-size:24px;}.zpc-sub{margin-bottom:12px;font-size:13px;}'
    + '.zpc-pcard{padding:10px 13px;}.zpc-pcard h4{margin:0 0 7px;padding-bottom:6px;}.zpc-feat{margin-bottom:7px;}}'
    // Phone: benefits become a compact 3-column icon-over-label feature grid
    // (cards side by side), helper sub-labels hidden (buttons stay), everything
    // ultra-compact so the whole card fits with NO scroll on small phones.
    + '@media(max-width:560px){.zpc-card{padding:11px 12px;}.zpc-title{font-size:19px;margin:2px 0;}.zpc-sub{font-size:11.5px;line-height:1.3;margin-bottom:8px;}'
    + '.zpc-eyebrow{font-size:9.5px;letter-spacing:1.8px;}.zpc-overlay{padding:7px;}'
    + '.zpc-benefits3{grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;}'
    + '.zpc-pcard{padding:8px 5px;}.zpc-pcard h4{font-size:9px;letter-spacing:.4px;text-align:center;margin:0 0 6px;padding-bottom:5px;}'
    + '.zpc-pcard .feats{display:flex;flex-direction:column;gap:6px;}'
    + '.zpc-feat{flex-direction:column;align-items:center;text-align:center;gap:3px;margin:0;background:none;border:0;padding:0;}'
    + '.zpc-feat .ic{width:auto;font-size:15px;}.zpc-feat .lbl{font-size:9.5px;font-weight:600;line-height:1.12;}'
    + '.zpc-mid{gap:8px;}.zpc-side{gap:6px;}'
    + '.zpc-verify{padding:10px 12px;}.zpc-vtitle{font-size:14px;margin-bottom:7px;}.zpc-label{margin-bottom:5px;font-size:11.5px;}'
    + '.zpc-input{padding:10px 12px;font-size:14px;}.zpc-btn{margin-top:7px;padding:11px;font-size:14px;}'
    + '.zpc-req{padding:7px 11px;}.zpc-req-badge{margin-bottom:4px;font-size:9px;}.zpc-req p{font-size:11.5px;line-height:1.28;}'
    + '.zpc-alt-label{display:none;}'                                  /* hide helper text, keep buttons */
    + '.zpc-alt{gap:7px;}.zpc-link-btn,.zpc-ghost-btn{padding:9px 11px;font-size:12.5px;}'
    + '.zpc-support{padding-top:7px;justify-content:center;}.zpc-support span{display:none;}'  /* keep WhatsApp button */
    + '.zpc-wa{padding:9px 16px;}}';
    var el = document.createElement('style');
    el.id = STYLE_ID; el.textContent = css;
    document.head.appendChild(el);
  }

  function waLink() {
    var msg = encodeURIComponent('Hi ZTU — I need help with premium access to the Trading Journal / Library / AI Assistant.');
    return 'https://wa.me/' + CFG.WHATSAPP_SUPPORT_NUMBER + '?text=' + msg;
  }

  function headlineFor(entry) {
    if (entry === 'library') return ['Unlock the ZTU <span>Library</span>', 'One approval unlocks the Library — plus your Trading Journal and AI Unlimited.'];
    if (entry === 'ai')      return ['Unlock <span>Unlimited AI</span>', 'One approval unlocks Unlimited AI — plus your Trading Journal and Library.'];
    return ['Unlock ZTU <span>Premium</span>', 'One approval unlocks your Trading Journal — plus the Library and Unlimited AI.'];
  }

  function cardInner(entry, dismissible) {
    var h = headlineFor(entry);
    return ''
    + (dismissible ? '<button class="zpc-close" data-zpc-close aria-label="Close">&times;</button>' : '')
    + '<div class="zpc-eyebrow">● Z Trade University · Premium Access</div>'
    + '<h2 class="zpc-title">' + h[0] + '</h2>'
    + '<p class="zpc-sub">' + h[1] + '</p>'

    // ── BENEFITS — 3 prominent icon-led product cards ──
    + '<div class="zpc-benefits3">'
    +   '<div class="zpc-pcard"><h4>Library Access</h4><div class="feats">'
    +     '<div class="zpc-feat"><span class="ic">📚</span><span class="lbl">Premium Books</span></div>'
    +     '<div class="zpc-feat"><span class="ic">🎧</span><span class="lbl">Audio Lessons</span></div>'
    +     '<div class="zpc-feat"><span class="ic">🎥</span><span class="lbl">Video Courses</span></div>'
    +   '</div></div>'
    +   '<div class="zpc-pcard"><h4>Trading Journal</h4><div class="feats">'
    +     '<div class="zpc-feat"><span class="ic">📈</span><span class="lbl">Track Every Trade</span></div>'
    +     '<div class="zpc-feat"><span class="ic">🧠</span><span class="lbl">Psychology Analysis</span></div>'
    +     '<div class="zpc-feat"><span class="ic">📊</span><span class="lbl">Performance Reports</span></div>'
    +   '</div></div>'
    +   '<div class="zpc-pcard"><h4>AI Assistant</h4><div class="feats">'
    +     '<div class="zpc-feat"><span class="ic">🤖</span><span class="lbl">Unlimited AI</span></div>'
    +     '<div class="zpc-feat"><span class="ic">🎯</span><span class="lbl">Trade Guidance</span></div>'
    +     '<div class="zpc-feat"><span class="ic">📚</span><span class="lbl">Market Learning</span></div>'
    +   '</div></div>'
    + '</div>'

    // ── MIDDLE — Verify (primary) | requirement + Join/Submit + WhatsApp ──
    + '<div class="zpc-mid">'

    +   '<div class="zpc-verify">'
    +     '<h3 class="zpc-vtitle">Already joined our IB?</h3>'
    +     '<form data-zpc-acct-form>'
    +       '<label class="zpc-label">Account Number</label>'
    +       '<input class="zpc-input" data-zpc-account type="text" placeholder="e.g. 171929726" autocomplete="off" maxlength="64" required />'
    +       '<button class="zpc-btn" data-zpc-request type="submit">Verify Access</button>'
    +     '</form>'
    +     '<form data-zpc-code-form style="display:none;">'
    +       '<label class="zpc-label">Verification Code <span data-zpc-mask style="color:rgba(255,255,255,0.5);font-weight:500;"></span></label>'
    +       '<input class="zpc-input" data-zpc-code type="text" placeholder="6-digit code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />'
    +       '<button class="zpc-btn" data-zpc-verify type="submit">Verify &amp; Unlock</button>'
    +       '<p class="zpc-links">Didn\'t get it? <a data-zpc-resend>Resend code</a> · <a data-zpc-change>Change account</a></p>'
    +     '</form>'
    +     '<div class="zpc-msg" data-zpc-msg></div>'
    +   '</div>'

    +   '<div class="zpc-side">'
    +     '<div class="zpc-req"><div class="zpc-req-badge">FREE FOR IB MEMBERS</div>'
    +       '<p><b>FREE for approved ZTU IB members.</b> No subscription, no fees.</p></div>'
    +     '<div class="zpc-alt">'
    +       '<div class="zpc-alt-col"><span class="zpc-alt-label">Not an IB member yet?</span>'
    +         '<a class="zpc-link-btn" href="' + CFG.JOIN_URL + '">Join IB Now</a></div>'
    +       '<div class="zpc-alt-col"><span class="zpc-alt-label">Joined but record not submitted?</span>'
    +         '<a class="zpc-ghost-btn" href="' + CFG.SUBMIT_URL + '">Submit Record</a></div>'
    +     '</div>'
    +     '<div class="zpc-support"><span>Need help? Contact us on WhatsApp.</span>'
    +       '<a class="zpc-wa" href="' + waLink() + '" target="_blank" rel="noopener">'
    +         '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.94 1.34-.5.04-.97.22-3.27-.68-2.76-1.09-4.52-3.91-4.66-4.09-.14-.18-1.12-1.49-1.12-2.84 0-1.35.71-2.01.96-2.29.25-.27.55-.34.73-.34.18 0 .37 0 .53.01.17.01.4-.06.62.48.24.55.81 1.9.88 2.04.07.14.12.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.57.16.27.71 1.17 1.53 1.9 1.05.93 1.94 1.22 2.21 1.36.27.14.43.12.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.22.61-.13.25.09 1.6.76 1.87.9.27.14.45.2.52.32.07.11.07.66-.17 1.34z"/></svg>'
    +         'WhatsApp Support</a></div>'
    +   '</div>'

    + '</div>';
  }

  // ── overlays ──
  var cardOv = null, approvedOv = null;

  function ensureOverlays() {
    injectStyle();
    if (!cardOv) {
      cardOv = document.createElement('div');
      cardOv.className = 'zpc-overlay';
      cardOv.innerHTML = '<div class="zpc-card" data-zpc-cardbody></div>';
      document.body.appendChild(cardOv);
      cardOv.addEventListener('click', function (e) {
        if (e.target === cardOv && state.opts && state.opts.dismissible !== false) close();
        var t = e.target.closest ? e.target.closest('[data-zpc-close]') : null;
        if (t) close();
      });
    }
    if (!approvedOv) {
      approvedOv = document.createElement('div');
      approvedOv.className = 'zpc-overlay zpc-approved';
      approvedOv.innerHTML =
        '<div class="zpc-card">'
        + '<div class="zpc-ac-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>'
        + '<h3 class="zpc-ac-title">Access Approved</h3>'
        + '<p class="zpc-ac-lead" data-zpc-ac-lead>You now have full ZTU membership access.</p>'
        + '<div style="display:inline-block;text-align:left;">'
        +   '<div class="zpc-grant"><i>✓</i> Trading Journal Access</div>'
        +   '<div class="zpc-grant"><i>✓</i> Library Access</div>'
        +   '<div class="zpc-grant"><i>✓</i> AI Unlimited Access</div>'
        + '</div>'
        + '<button class="zpc-btn" data-zpc-ac-continue style="margin-top:20px;">Continue</button>'
        + '</div>';
      document.body.appendChild(approvedOv);
      approvedOv.querySelector('[data-zpc-ac-continue]').addEventListener('click', function () {
        approvedOv.classList.remove('on');
      });
    }
  }

  function q(root, sel) { return root.querySelector(sel); }
  function showMsg(root, text, kind) {
    var el = q(root, '[data-zpc-msg]');
    el.textContent = text || '';
    el.className = 'zpc-msg' + (text ? (' ' + kind) : '');
  }

  async function callAccess(payload) {
    var res = await fetch(CFG.ACCESS_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return res.json();
  }

  function wire(root) {
    var acctForm = q(root, '[data-zpc-acct-form]');
    var codeForm = q(root, '[data-zpc-code-form]');

    acctForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var account = q(root, '[data-zpc-account]').value.trim();
      if (!account) { showMsg(root, 'Enter your account number.', 'err'); return; }
      var btn = q(root, '[data-zpc-request]'); btn.disabled = true; showMsg(root, '');
      try {
        var r = await callAccess({ action: 'request', account: account });
        if (r.ok) {
          state.otpToken = r.otpToken;
          q(root, '[data-zpc-mask]').textContent = r.email_mask ? ('· sent to ' + r.email_mask) : '';
          acctForm.style.display = 'none'; codeForm.style.display = 'block';
          q(root, '[data-zpc-code]').focus();
          showMsg(root, 'Verification code sent. Check your email.', 'ok');
        } else { showMsg(root, r.message || 'Could not start verification.', 'err'); }
      } catch (err) { showMsg(root, 'Network error. Please try again.', 'err'); }
      finally { btn.disabled = false; }
    });

    codeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var code = q(root, '[data-zpc-code]').value.trim();
      if (!/^\d{6}$/.test(code)) { showMsg(root, 'Enter the 6-digit code.', 'err'); return; }
      var btn = q(root, '[data-zpc-verify]'); btn.disabled = true; showMsg(root, '');
      try {
        var r = await callAccess({ action: 'verify', otpToken: state.otpToken, code: code });
        if (r.ok) { showMsg(root, ''); await handleApproved(r); }
        else { if (r.otpToken) state.otpToken = r.otpToken; showMsg(root, r.message || 'Incorrect or expired code.', 'err'); }
      } catch (err) { showMsg(root, 'Network error. Please try again.', 'err'); }
      finally { btn.disabled = false; }
    });

    q(root, '[data-zpc-resend]').addEventListener('click', async function () {
      if (!state.otpToken) return; showMsg(root, '');
      try {
        var r = await callAccess({ action: 'resend', otpToken: state.otpToken });
        if (r.ok) { state.otpToken = r.otpToken; showMsg(root, 'A new code has been sent.', 'ok'); }
        else showMsg(root, r.message || 'Could not resend the code.', 'err');
      } catch (err) { showMsg(root, 'Network error. Please try again.', 'err'); }
    });

    q(root, '[data-zpc-change]').addEventListener('click', function () {
      state.otpToken = null;
      codeForm.style.display = 'none'; acctForm.style.display = 'block';
      q(root, '[data-zpc-code]').value = ''; showMsg(root, '');
      q(root, '[data-zpc-account]').focus();
    });
  }

  async function handleApproved(result) {
    var account = result.account;
    persistSessions(account);
    if (window.ZTUPremiumBadge) { try { window.ZTUPremiumBadge.refresh(); } catch (e) {} }

    // surface-specific finalization
    if (state.opts && typeof state.opts.onApproved === 'function') {
      try { await state.opts.onApproved(result); } catch (e) {}
    }

    // close the access card, then show the approval modal
    if (cardOv) cardOv.classList.remove('on');
    var entry = state.opts ? state.opts.entry : 'journal';
    var lead = entry === 'library' ? 'Your Library is unlocked — plus your Trading Journal and Unlimited AI.'
      : entry === 'ai' ? 'Your Unlimited AI is unlocked — plus your Trading Journal and Library.'
      : 'Your Trading Journal is unlocked — plus your Library and Unlimited AI.';
    if (!state.opts || state.opts.showApprovedModal !== false) {
      approvedOv.querySelector('[data-zpc-ac-lead]').textContent = lead;
      approvedOv.classList.add('on');
    }
  }

  // ── public API ──
  function open(opts) {
    ensureOverlays();
    state.opts = opts || {};
    state.otpToken = null; state.account = null;
    var body = cardOv.querySelector('[data-zpc-cardbody]');
    body.innerHTML = cardInner(state.opts.entry || 'journal', state.opts.dismissible !== false);
    wire(body);
    cardOv.classList.add('on');
    var inp = body.querySelector('[data-zpc-account]');
    if (inp) setTimeout(function () { inp.focus(); }, 80);
  }

  function close() {
    if (cardOv) cardOv.classList.remove('on');
    state.opts = null; state.otpToken = null;
  }

  // ── UNIFIED LOGOUT (Phase 4C) ──
  // One logout flow shared by Journal + AI + Library. Clears EVERY unified
  // access session key so the premium badge disappears, verified state clears,
  // and all three products re-gate. opts.onLogout runs surface-specific cleanup
  // before the (default) reload, which re-gates the current page.
  var SESSION_KEYS = [
    'ztu_journal_v1',   // Trading Journal unified session
    'ztu_lib_v3',       // Library shared session
    'ztu_ai_verified',  // AI verified flag
    'ztu_ai_identity',  // AI access (gating) token
    'ztu_ai_acct',      // AI verified account number
  ];
  function logout(opts) {
    opts = opts || {};
    SESSION_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    if (cardOv) cardOv.classList.remove('on');
    if (approvedOv) approvedOv.classList.remove('on');
    if (window.ZTUPremiumBadge) { try { window.ZTUPremiumBadge.refresh(); } catch (e) {} }
    if (typeof opts.onLogout === 'function') { try { opts.onLogout(); } catch (e) {} }
    if (opts.reload !== false) { try { location.reload(); } catch (e) {} }
  }

  window.ZTUPremiumCard = { open: open, close: close, logout: logout, config: CFG, _persistSessions: persistSessions };
})();
