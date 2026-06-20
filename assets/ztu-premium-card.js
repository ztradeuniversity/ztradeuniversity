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
    + '.zpc-card{width:100%;max-width:600px;max-height:92vh;overflow-y:auto;position:relative;'
    + 'background:linear-gradient(180deg,#15110a 0%,#100c06 100%);border:1px solid rgba(200,156,63,0.32);'
    + 'border-radius:22px;padding:32px 30px;box-shadow:0 30px 80px rgba(0,0,0,0.6);color:rgba(255,255,255,0.88);}'
    + '.zpc-card::before{content:"";position:absolute;top:-120px;right:-90px;width:320px;height:320px;'
    + 'background:radial-gradient(circle,rgba(200,156,63,0.14) 0%,transparent 70%);pointer-events:none;}'
    + '.zpc-close{position:absolute;top:14px;right:16px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(200,156,63,0.22);'
    + 'background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.6);font-size:18px;line-height:1;cursor:pointer;z-index:2;}'
    + '.zpc-close:hover{color:#fff;border-color:rgba(200,156,63,0.5);}'
    + '.zpc-eyebrow{position:relative;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#e6c987;}'
    + '.zpc-title{position:relative;font-family:Manrope,Inter,sans-serif;font-size:27px;font-weight:900;color:#fff;letter-spacing:-.6px;margin:7px 0 6px;}'
    + '.zpc-title span{background:linear-gradient(135deg,#e6c987,#c89c3f 60%,#8c6c1f);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}'
    + '.zpc-sub{position:relative;font-size:13.5px;color:rgba(255,255,255,0.56);line-height:1.55;margin-bottom:20px;}'
    + '.zpc-benefits{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px;}'
    + '.zpc-bcol{background:rgba(255,255,255,0.03);border:1px solid rgba(200,156,63,0.16);border-radius:14px;padding:13px 13px;}'
    + '.zpc-bcol h4{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#e6c987;margin:0 0 9px;}'
    + '.zpc-bitem{display:flex;gap:7px;align-items:flex-start;font-size:12px;color:rgba(255,255,255,0.82);line-height:1.4;margin-bottom:7px;}'
    + '.zpc-bitem:last-child{margin-bottom:0;}'
    + '.zpc-tick{color:#10b981;font-weight:900;font-size:11px;flex-shrink:0;margin-top:1px;}'
    + '.zpc-req{position:relative;background:linear-gradient(135deg,rgba(200,156,63,0.12),rgba(200,156,63,0.05));'
    + 'border:1px solid rgba(200,156,63,0.32);border-radius:13px;padding:13px 16px;margin-bottom:18px;}'
    + '.zpc-req-badge{display:inline-block;font-size:9.5px;font-weight:900;letter-spacing:1px;color:#1a1410;'
    + 'background:linear-gradient(135deg,#e6c987,#c89c3f);padding:4px 10px;border-radius:100px;margin-bottom:8px;}'
    + '.zpc-req p{font-size:12.5px;color:rgba(255,255,255,0.82);line-height:1.55;margin:0;}'
    + '.zpc-req b{color:#e6c987;}'
    + '.zpc-verify{position:relative;margin-bottom:16px;}'
    + '.zpc-vtitle{font-family:Manrope,Inter,sans-serif;font-size:15px;font-weight:800;color:#fff;margin:0 0 12px;}'
    + '.zpc-label{display:block;font-size:12px;font-weight:700;color:rgba(255,255,255,0.72);margin-bottom:6px;}'
    + '.zpc-input{width:100%;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,0.04);'
    + 'border:1px solid rgba(200,156,63,0.18);color:#fff;font-size:14.5px;font-family:inherit;box-sizing:border-box;}'
    + '.zpc-input:focus{outline:none;border-color:#c89c3f;box-shadow:0 0 0 3px rgba(200,156,63,0.16);}'
    + '.zpc-btn{width:100%;margin-top:11px;padding:13px 18px;border-radius:11px;border:0;cursor:pointer;'
    + 'background:linear-gradient(135deg,#e6c987 0%,#c89c3f 50%,#8c6c1f 100%);color:#fff;font-size:14px;font-weight:800;'
    + 'box-shadow:0 10px 24px rgba(200,156,63,0.32);transition:transform .15s,box-shadow .15s;}'
    + '.zpc-btn:hover{transform:translateY(-1px);box-shadow:0 14px 30px rgba(200,156,63,0.46);}'
    + '.zpc-btn:disabled{opacity:.55;cursor:default;transform:none;}'
    + '.zpc-msg{font-size:12.5px;padding:9px 12px;border-radius:9px;margin-top:11px;display:none;}'
    + '.zpc-msg.err{display:block;background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.28);}'
    + '.zpc-msg.ok{display:block;background:rgba(16,185,129,0.12);color:#6ee7b7;border:1px solid rgba(16,185,129,0.28);}'
    + '.zpc-links{font-size:12px;color:rgba(255,255,255,0.5);margin-top:10px;text-align:center;}'
    + '.zpc-links a{color:#e6c987;font-weight:700;cursor:pointer;text-decoration:none;}'
    + '.zpc-links a:hover{text-decoration:underline;}'
    + '.zpc-alt{position:relative;display:flex;gap:14px;padding-top:18px;border-top:1px solid rgba(200,156,63,0.18);}'
    + '.zpc-alt-col{flex:1;display:flex;flex-direction:column;gap:8px;}'
    + '.zpc-alt-label{font-size:11.5px;color:rgba(255,255,255,0.52);line-height:1.4;}'
    + '.zpc-link-btn{display:inline-flex;align-items:center;justify-content:center;margin-top:auto;padding:10px 16px;border-radius:10px;'
    + 'text-decoration:none;background:linear-gradient(135deg,#e6c987,#c89c3f 50%,#8c6c1f);color:#fff;font-size:13px;font-weight:800;'
    + 'box-shadow:0 8px 18px rgba(200,156,63,0.3);}'
    + '.zpc-ghost-btn{display:inline-flex;align-items:center;justify-content:center;margin-top:auto;padding:10px 16px;border-radius:10px;'
    + 'text-decoration:none;background:rgba(255,255,255,0.04);border:1px solid rgba(200,156,63,0.3);color:#e6c987;font-size:13px;font-weight:800;}'
    + '.zpc-ghost-btn:hover{background:rgba(200,156,63,0.12);}'
    + '.zpc-support{position:relative;margin-top:16px;padding-top:15px;border-top:1px solid rgba(200,156,63,0.18);'
    + 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}'
    + '.zpc-support span{font-size:12.5px;color:rgba(255,255,255,0.56);}'
    + '.zpc-wa{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:100px;text-decoration:none;'
    + 'background:linear-gradient(135deg,#25d366,#1aa84f);color:#fff;font-size:12.5px;font-weight:800;box-shadow:0 8px 18px rgba(37,211,102,0.32);}'
    + '.zpc-wa svg{width:15px;height:15px;}'
    /* approved modal */
    + '.zpc-approved .zpc-card{max-width:430px;text-align:center;}'
    + '.zpc-ac-ico{width:62px;height:62px;border-radius:50%;margin:0 auto 15px;background:rgba(16,185,129,0.14);'
    + 'border:1px solid rgba(16,185,129,0.4);color:#10b981;display:flex;align-items:center;justify-content:center;}'
    + '.zpc-ac-ico svg{width:30px;height:30px;}'
    + '.zpc-ac-title{font-family:Manrope,Inter,sans-serif;font-size:22px;font-weight:900;color:#fff;margin:0 0 6px;}'
    + '.zpc-ac-lead{font-size:13.5px;color:rgba(255,255,255,0.56);margin:0 0 18px;}'
    + '.zpc-grant{display:flex;gap:9px;align-items:center;justify-content:flex-start;text-align:left;font-size:13.5px;'
    + 'font-weight:600;color:rgba(255,255,255,0.88);padding:8px 0;}'
    + '.zpc-grant i{width:21px;height:21px;border-radius:50%;background:rgba(16,185,129,0.14);color:#10b981;'
    + 'display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;font-size:12px;flex-shrink:0;}'
    + '@media(max-width:560px){.zpc-benefits{grid-template-columns:1fr;}.zpc-alt{flex-direction:column;}.zpc-card{padding:26px 18px;}}';
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

    + '<div class="zpc-benefits">'
    +   '<div class="zpc-bcol"><h4>Library</h4>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Thousands of books</div>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Premium educational videos</div>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Premium audio content</div>'
    +   '</div>'
    +   '<div class="zpc-bcol"><h4>Trading Journal</h4>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>AI Trading Mentor</div>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Psychology tracking</div>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Performance reports</div>'
    +   '</div>'
    +   '<div class="zpc-bcol"><h4>AI Assistant</h4>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Unlimited AI questions</div>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Trading guidance</div>'
    +     '<div class="zpc-bitem"><span class="zpc-tick">✓</span>Market learning support</div>'
    +   '</div>'
    + '</div>'

    + '<div class="zpc-req"><div class="zpc-req-badge">FREE FOR IB MEMBERS</div>'
    +   '<p><b>FREE for approved Z Trade University IB members.</b> Provided at no additional cost — no subscription, no separate fee.</p></div>'

    + '<div class="zpc-verify">'
    +   '<h3 class="zpc-vtitle">Already joined our IB?</h3>'
    +   '<form data-zpc-acct-form>'
    +     '<label class="zpc-label">Account Number</label>'
    +     '<input class="zpc-input" data-zpc-account type="text" placeholder="e.g. 171929726" autocomplete="off" maxlength="64" required />'
    +     '<button class="zpc-btn" data-zpc-request type="submit">Verify Access</button>'
    +   '</form>'
    +   '<form data-zpc-code-form style="display:none;">'
    +     '<label class="zpc-label">Verification Code <span data-zpc-mask style="color:rgba(255,255,255,0.5);font-weight:500;"></span></label>'
    +     '<input class="zpc-input" data-zpc-code type="text" placeholder="6-digit code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />'
    +     '<button class="zpc-btn" data-zpc-verify type="submit">Verify &amp; Unlock</button>'
    +     '<p class="zpc-links">Didn\'t get it? <a data-zpc-resend>Resend code</a> · <a data-zpc-change>Change account</a></p>'
    +   '</form>'
    +   '<div class="zpc-msg" data-zpc-msg></div>'
    + '</div>'

    + '<div class="zpc-alt">'
    +   '<div class="zpc-alt-col"><span class="zpc-alt-label">Not an IB member yet?</span>'
    +     '<a class="zpc-link-btn" href="' + CFG.JOIN_URL + '">Join IB Now</a></div>'
    +   '<div class="zpc-alt-col"><span class="zpc-alt-label">Already joined but record not submitted?</span>'
    +     '<a class="zpc-ghost-btn" href="' + CFG.SUBMIT_URL + '">Submit Record</a></div>'
    + '</div>'

    + '<div class="zpc-support"><span>Need help? Contact us on WhatsApp.</span>'
    +   '<a class="zpc-wa" href="' + waLink() + '" target="_blank" rel="noopener">'
    +     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.94 1.34-.5.04-.97.22-3.27-.68-2.76-1.09-4.52-3.91-4.66-4.09-.14-.18-1.12-1.49-1.12-2.84 0-1.35.71-2.01.96-2.29.25-.27.55-.34.73-.34.18 0 .37 0 .53.01.17.01.4-.06.62.48.24.55.81 1.9.88 2.04.07.14.12.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.57.16.27.71 1.17 1.53 1.9 1.05.93 1.94 1.22 2.21 1.36.27.14.43.12.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.22.61-.13.25.09 1.6.76 1.87.9.27.14.45.2.52.32.07.11.07.66-.17 1.34z"/></svg>'
    +     'WhatsApp Support</a></div>';
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

  window.ZTUPremiumCard = { open: open, close: close, config: CFG, _persistSessions: persistSessions };
})();
