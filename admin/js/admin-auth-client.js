// admin/js/admin-auth-client.js
// ════════════════════════════════════════════════════════════════════════════
// ENTERPRISE ADMIN PORTAL — shared client-side login gate.
// Every admin page includes THIS script first (before its own page script) and
// calls AdminGate.init({module, title, subtitle, onUnlock}). The page's own
// bootstrap/data-fetching function must be renamed to run ONLY from onUnlock —
// never from a bare DOMContentLoaded — so a wrong password can never let any
// page logic execute (closes the "wrong password partially loads the page" bug).
//
// Sessions are isolated per module: sessionStorage key `ztu_admin_sess::<module>`.
// Unlocking one module never reads or writes another module's key, so modules
// can never cross-unlock each other. Backed by POST /api/admin-auth (login /
// change-password / forgot-password / reset-password).
// ════════════════════════════════════════════════════════════════════════════

(function () {
  const API = '/api/admin-auth';

  // Every module page now lives in admin/pages/, side-by-side, with the
  // launcher one level up at admin/index.html — so these paths are the same
  // relative to EVERY module page. Kept in sync with admin/index.html's TOOLS.
  const MODULES = [
    { key: 'dashboard',    icon: '🏛', title: 'Executive Dashboard',    href: 'admin-dashboard.html' },
    { key: 'kb',           icon: '🕸', title: 'Knowledge Graph Admin',  href: 'kb-admin.html' },
    { key: 'signals',      icon: '📡', title: 'Signal Admin',           href: 'signal-admin.html' },
    { key: 'governance',   icon: '⚖️', title: 'Governance',             href: 'governance-admin.html' },
    { key: 'articles',     icon: '📰', title: 'AI Article Manager',     href: 'ai-articles.html' },
    { key: 'feedback',     icon: '💬', title: 'AI Feedback',            href: 'ai-feedback.html' },
    { key: 'architecture', icon: '🧭', title: 'System Architecture',    href: 'system-architecture.html' },
    { key: 'journal',      icon: '📓', title: 'Journal Admin',          href: 'journal-admin.html' },
    { key: 'library',      icon: '📖', title: 'Library Admin',          href: 'library-admin.html' },
  ];
  const BACK_TO_PORTAL = '../index.html';

  function sessKey(mod) { return 'ztu_admin_sess::' + mod; }

  function decodeTokenPayload(tok) {
    const dot = tok.indexOf('.');
    if (dot < 1) return null;
    try {
      const pad = tok.slice(0, dot).replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(pad + '==='.slice((pad.length + 3) % 4)))));
    } catch { return null; }
  }

  // Read-only local check: is there a token that LOOKS unexpired? The real
  // authorization decision always happens server-side (HMAC-verified) on the
  // next API call — this is purely so the gate doesn't re-prompt every reload.
  function liveToken(mod) {
    const tok = sessionStorage.getItem(sessKey(mod));
    if (!tok) return null;
    const payload = decodeTokenPayload(tok);
    if (!payload || payload.module !== mod || !payload.exp || Date.now() > payload.exp) { sessionStorage.removeItem(sessKey(mod)); return null; }
    return tok;
  }

  async function callApi(action, module, extra) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, module, ...extra }),
      });
      return await res.json();
    } catch { return { ok: false, reason: 'network' }; }
  }

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // Shared chrome — ONE implementation, inherited by every admin page the
  // instant it calls AdminGate.init(). Deliberately NOT position:fixed/sticky:
  // several pages already have their own sticky header, and a second fixed
  // bar would visually collide with it. This bar sits as the first element in
  // <body>, in normal flow, so it can never overlap a page's own layout.
  function mountChrome(mod, title, token, onLogout) {
    const self = MODULES.find(m => m.key === mod);
    const header = el('div', { class: 'zap-chrome-header' });
    header.innerHTML =
      '<div class="zap-chrome-left">' +
        '<button class="zap-btn zap-hamburger" id="zapHamburger" type="button" title="All admin modules" aria-label="Open module menu">☰</button>' +
        '<div class="zap-breadcrumb"><a href="' + BACK_TO_PORTAL + '">Admin Portal</a><span class="sep">›</span><span class="cur">' + (title || (self && self.title) || mod) + '</span></div>' +
      '</div>' +
      '<div class="zap-chrome-right">' +
        '<span class="zap-session-timer" id="zapSessionTimer" title="Time remaining before this session expires"></span>' +
        '<a class="zap-btn" href="' + BACK_TO_PORTAL + '">↩ Back to Admin Portal</a>' +
        '<button class="zap-btn" id="zapChromeSettings" type="button">⚙ Settings</button>' +
        '<button class="zap-btn" id="zapChromeLogout" type="button">⏻ Logout</button>' +
      '</div>';
    document.body.insertBefore(header, document.body.firstChild);

    header.querySelector('#zapChromeLogout').addEventListener('click', function () {
      sessionStorage.removeItem(sessKey(mod));
      onLogout();
    });
    header.querySelector('#zapChromeSettings').addEventListener('click', function () { openSettingsModal(mod); });

    // ── session timer — reads exp straight off the real signed token; never invents a countdown ──
    const timerEl = header.querySelector('#zapSessionTimer');
    const payload = decodeTokenPayload(token);
    function tickTimer() {
      if (!payload || !payload.exp) { timerEl.textContent = ''; return; }
      const msLeft = payload.exp - Date.now();
      if (msLeft <= 0) { timerEl.textContent = 'Session expired'; onLogout(); return; }
      const h = Math.floor(msLeft / 3600000), m = Math.floor((msLeft % 3600000) / 60000);
      timerEl.textContent = 'Session: ' + (h > 0 ? h + 'h ' : '') + m + 'm';
    }
    tickTimer();
    setInterval(tickTimer, 30000);

    // ── off-canvas module drawer (the "common sidebar") ──
    const drawer = el('div', { class: 'zap-drawer', id: 'zapDrawer' });
    drawer.innerHTML =
      '<div class="zap-drawer-head">All Admin Modules</div>' +
      MODULES.map(m =>
        '<a class="zap-drawer-item' + (m.key === mod ? ' active' : '') + '" href="' + (m.key === mod ? '#' : m.href) + '">' +
          '<span class="icon">' + m.icon + '</span>' + m.title +
        '</a>'
      ).join('') +
      '<a class="zap-drawer-item zap-drawer-portal" href="' + BACK_TO_PORTAL + '"><span class="icon">↩</span>Admin Portal (launcher)</a>';
    const scrim = el('div', { class: 'zap-drawer-scrim', id: 'zapDrawerScrim' });
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    function closeDrawer() { drawer.classList.remove('open'); scrim.classList.remove('open'); }
    header.querySelector('#zapHamburger').addEventListener('click', function () {
      drawer.classList.add('open'); scrim.classList.add('open');
    });
    scrim.addEventListener('click', closeDrawer);

    // ── common footer ──
    const footer = el('div', { class: 'zap-chrome-footer' },
      'Z Trade University — Enterprise Admin Portal · ' + ((self && self.title) || mod) + ' · session active');
    document.body.appendChild(footer);
  }

  function openSettingsModal(mod) {
    let backdrop = document.getElementById('zapSettingsModal');
    if (backdrop) { backdrop.classList.add('open'); return; }
    backdrop = el('div', { class: 'zap-modal-backdrop', id: 'zapSettingsModal' });
    backdrop.innerHTML =
      '<div class="zap-modal">' +
        '<h2>Admin Settings</h2>' +
        '<div class="tabs">' +
          '<div class="tab active" data-tab="change">Change Password</div>' +
          '<div class="tab" data-tab="forgot">Forgot Password</div>' +
          '<div class="tab" data-tab="recovery">Recovery Center</div>' +
        '</div>' +
        '<div data-pane="change">' +
          '<input type="password" placeholder="Current password" id="zapCurPwd" autocomplete="current-password" />' +
          '<input type="password" placeholder="New password (min 8 chars)" id="zapNewPwd" autocomplete="new-password" />' +
          '<input type="password" placeholder="Confirm new password" id="zapConfirmPwd" autocomplete="new-password" />' +
          '<div class="msg" id="zapChangeMsg"></div>' +
          '<div class="row"><button class="ghost" data-close="1">Cancel</button><button class="primary" id="zapChangeBtn">Update Password</button></div>' +
        '</div>' +
        '<div data-pane="forgot" style="display:none;">' +
          '<p style="font-size:12.5px;color:var(--zap-muted);margin:0 0 12px;">Sends a one-time code to this module\'s configured recovery email.</p>' +
          '<div class="row" style="margin-top:0;"><button class="primary" id="zapSendOtpBtn">Send Reset Code</button></div>' +
          '<div id="zapOtpFields" style="display:none;margin-top:12px;">' +
            '<input type="text" placeholder="6-digit code" id="zapOtpCode" />' +
            '<input type="password" placeholder="New password (min 8 chars)" id="zapOtpNewPwd" autocomplete="new-password" />' +
            '<input type="password" placeholder="Confirm new password" id="zapOtpConfirmPwd" autocomplete="new-password" />' +
            '<div class="row"><button class="ghost" data-close="1">Cancel</button><button class="primary" id="zapResetBtn">Reset Password</button></div>' +
          '</div>' +
          '<div class="msg" id="zapForgotMsg"></div>' +
        '</div>' +
        '<div data-pane="recovery" style="display:none;">' +
          '<div class="zap-recovery-row"><span class="l">Master Recovery Email</span><span class="v" id="zapRecEmail">…</span></div>' +
          '<div class="zap-recovery-row"><span class="l">Verification Status</span><span class="v" id="zapRecVerified">…</span></div>' +
          '<div class="zap-recovery-row"><span class="l">Last Updated</span><span class="v" id="zapRecUpdated">…</span></div>' +
          '<div class="row"><button class="primary" id="zapChangeEmailBtn" style="flex:none;">Change Email</button></div>' +
          '<div id="zapEmailChangeStep1" style="display:none;margin-top:14px;">' +
            '<p style="font-size:12.5px;color:var(--zap-muted);margin:0 0 10px;">Confirm your current admin password — a verification code will be sent to the CURRENT recovery email above.</p>' +
            '<input type="password" placeholder="Current admin password" id="zapEmailChangePwd" autocomplete="current-password" />' +
            '<div class="row"><button class="ghost" data-close="1">Cancel</button><button class="primary" id="zapSendEmailOtpBtn">Send Verification Code</button></div>' +
          '</div>' +
          '<div id="zapEmailChangeStep2" style="display:none;margin-top:14px;">' +
            '<input type="text" placeholder="6-digit code" id="zapEmailOtpCode" />' +
            '<input type="email" placeholder="New recovery email" id="zapNewRecEmail" />' +
            '<div class="row"><button class="ghost" data-close="1">Cancel</button><button class="primary" id="zapSaveEmailBtn">Save New Email</button></div>' +
          '</div>' +
          '<div class="msg" id="zapRecoveryMsg"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    backdrop.classList.add('open');

    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => backdrop.classList.remove('open')));
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.classList.remove('open'); });
    backdrop.querySelectorAll('.tab').forEach(t => t.addEventListener('click', function () {
      backdrop.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      backdrop.querySelector('[data-pane="change"]').style.display = t.dataset.tab === 'change' ? 'block' : 'none';
      backdrop.querySelector('[data-pane="forgot"]').style.display = t.dataset.tab === 'forgot' ? 'block' : 'none';
      backdrop.querySelector('[data-pane="recovery"]').style.display = t.dataset.tab === 'recovery' ? 'block' : 'none';
      if (t.dataset.tab === 'recovery') loadRecoveryStatus();
    }));

    async function loadRecoveryStatus() {
      const r = await callApi('recovery-status', mod, {});
      if (r.ok) {
        backdrop.querySelector('#zapRecEmail').textContent = r.email_mask + (r.is_default ? ' (system default)' : '');
        backdrop.querySelector('#zapRecVerified').textContent = r.verified ? '✅ Verified' : '⚠ Unverified';
        backdrop.querySelector('#zapRecUpdated').textContent = r.updated_at ? new Date(r.updated_at).toLocaleString() : 'Never changed — using system default';
      }
    }

    backdrop.querySelector('#zapChangeEmailBtn').addEventListener('click', function () {
      backdrop.querySelector('#zapEmailChangeStep1').style.display = 'block';
    });

    backdrop.querySelector('#zapSendEmailOtpBtn').addEventListener('click', async function () {
      const pwd = backdrop.querySelector('#zapEmailChangePwd').value;
      const msg = backdrop.querySelector('#zapRecoveryMsg');
      msg.className = 'msg';
      if (!pwd) { msg.textContent = 'Enter your current admin password.'; msg.className = 'msg err'; return; }
      const r = await callApi('request-email-change', mod, { password: pwd });
      if (r.ok) {
        msg.textContent = 'Verification code sent to ' + r.email_mask; msg.className = 'msg ok';
        backdrop.querySelector('#zapEmailChangeStep1').style.display = 'none';
        backdrop.querySelector('#zapEmailChangeStep2').style.display = 'block';
      } else {
        msg.textContent = r.reason === 'wrong_password' ? 'Current password is incorrect.' : 'Could not send verification code.'; msg.className = 'msg err';
      }
    });

    backdrop.querySelector('#zapSaveEmailBtn').addEventListener('click', async function () {
      const code = backdrop.querySelector('#zapEmailOtpCode').value;
      const newEmail = backdrop.querySelector('#zapNewRecEmail').value.trim();
      const msg = backdrop.querySelector('#zapRecoveryMsg');
      if (!code || !newEmail || newEmail.indexOf('@') < 0) { msg.textContent = 'Enter the code and a valid new email.'; msg.className = 'msg err'; return; }
      const r = await callApi('verify-email-change', mod, { code, newEmail });
      if (r.ok) {
        msg.textContent = 'Recovery email updated.'; msg.className = 'msg ok';
        backdrop.querySelector('#zapEmailChangeStep2').style.display = 'none';
        backdrop.querySelector('#zapEmailOtpCode').value = ''; backdrop.querySelector('#zapNewRecEmail').value = '';
        loadRecoveryStatus();
      } else {
        msg.textContent = 'Could not verify code — check it and try again.'; msg.className = 'msg err';
      }
    });

    backdrop.querySelector('#zapChangeBtn').addEventListener('click', async function () {
      const cur = backdrop.querySelector('#zapCurPwd').value;
      const next = backdrop.querySelector('#zapNewPwd').value;
      const confirm = backdrop.querySelector('#zapConfirmPwd').value;
      const msg = backdrop.querySelector('#zapChangeMsg');
      msg.className = 'msg';
      if (!cur || !next || next !== confirm) { msg.textContent = 'Check the fields — new password and confirmation must match.'; msg.className = 'msg err'; return; }
      const r = await callApi('change-password', mod, { current: cur, next });
      if (r.ok) { msg.textContent = 'Password updated.'; msg.className = 'msg ok'; backdrop.querySelector('#zapCurPwd').value = backdrop.querySelector('#zapNewPwd').value = backdrop.querySelector('#zapConfirmPwd').value = ''; }
      else { msg.textContent = r.reason === 'wrong_current' ? 'Current password is incorrect.' : 'Could not update password.'; msg.className = 'msg err'; }
    });

    backdrop.querySelector('#zapSendOtpBtn').addEventListener('click', async function () {
      const msg = backdrop.querySelector('#zapForgotMsg');
      msg.className = 'msg';
      const r = await callApi('forgot-password', mod, {});
      if (r.ok) { msg.textContent = 'Code sent to ' + r.email_mask; msg.className = 'msg ok'; backdrop.querySelector('#zapOtpFields').style.display = 'block'; }
      else { msg.textContent = 'Could not send code — email delivery failed.'; msg.className = 'msg err'; }
    });

    backdrop.querySelector('#zapResetBtn').addEventListener('click', async function () {
      const code = backdrop.querySelector('#zapOtpCode').value;
      const next = backdrop.querySelector('#zapOtpNewPwd').value;
      const confirm = backdrop.querySelector('#zapOtpConfirmPwd').value;
      const msg = backdrop.querySelector('#zapForgotMsg');
      if (!code || !next || next !== confirm) { msg.textContent = 'Check the fields — new password and confirmation must match.'; msg.className = 'msg err'; return; }
      const r = await callApi('reset-password', mod, { code, next });
      if (r.ok) { msg.textContent = 'Password reset — log in again with your new password.'; msg.className = 'msg ok'; setTimeout(() => location.reload(), 1200); }
      else { msg.textContent = 'Reset failed — check the code and try again.'; msg.className = 'msg err'; }
    });
  }

  function buildGate(mod, title, subtitle) {
    const gate = el('div', { class: 'zap-gate', id: 'zapGate' });
    gate.innerHTML =
      '<div class="zap-gate-card">' +
        '<h1>' + title + '</h1>' +
        '<p class="sub">' + subtitle + '</p>' +
        '<label>Password</label>' +
        '<input type="password" id="zapPwdInput" autocomplete="current-password" autofocus />' +
        '<button type="button" id="zapUnlockBtn">Unlock</button>' +
        '<div class="zap-gate-err" id="zapGateErr">Incorrect password. Access denied.</div>' +
        '<div class="zap-gate-ok" id="zapGateOk"></div>' +
        '<div><span class="zap-gate-link" id="zapForgotLink">Forgot password?</span></div>' +
      '</div>';
    document.body.appendChild(gate);
    return gate;
  }

  const AdminGate = {
    init(opts) {
      const mod = opts.module;
      const title = opts.title || 'Admin Access';
      const subtitle = opts.subtitle || 'Enter the admin password to continue.';
      const onUnlock = opts.onUnlock || function () {};

      const existing = liveToken(mod);
      if (existing) {
        mountChrome(mod, title, existing, function () { location.reload(); });
        onUnlock(existing);
        return;
      }

      const gate = buildGate(mod, title, subtitle);
      const input = gate.querySelector('#zapPwdInput');
      const err = gate.querySelector('#zapGateErr');
      const ok = gate.querySelector('#zapGateOk');
      const btn = gate.querySelector('#zapUnlockBtn');
      const card = gate.querySelector('.zap-gate-card');

      async function attempt() {
        const pwd = input.value;
        if (!pwd) return;
        err.style.display = 'none'; ok.style.display = 'none';
        btn.disabled = true; btn.textContent = 'Checking…';
        const r = await callApi('login', mod, { password: pwd });
        btn.disabled = false; btn.textContent = 'Unlock';
        if (r.ok && r.token) {
          sessionStorage.setItem(sessKey(mod), r.token);
          gate.remove();
          mountChrome(mod, title, r.token, function () { location.reload(); });
          onUnlock(r.token);
        } else {
          input.value = '';
          if (r.reason === 'locked') { err.textContent = 'Too many attempts — locked for 60 seconds.'; card.classList.add('zap-gate-locked'); setTimeout(() => card.classList.remove('zap-gate-locked'), 60000); }
          else err.textContent = 'Incorrect password. Access denied.';
          err.style.display = 'block';
          // Never calls onUnlock — no page logic beyond this gate ever runs.
        }
      }

      btn.addEventListener('click', attempt);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') attempt(); });

      gate.querySelector('#zapForgotLink').addEventListener('click', async function () {
        err.style.display = 'none';
        const r = await callApi('forgot-password', mod, {});
        if (r.ok) {
          ok.textContent = 'Reset code sent to ' + r.email_mask + '. Enter it below with a new password.';
          ok.style.display = 'block';
          if (!gate.querySelector('#zapResetInline')) {
            const box = el('div', { id: 'zapResetInline' },
              '<input type="text" placeholder="6-digit code" id="zapInlineCode" style="margin-top:12px;" />' +
              '<input type="password" placeholder="New password (min 8 chars)" id="zapInlineNewPwd" autocomplete="new-password" />' +
              '<input type="password" placeholder="Confirm new password" id="zapInlineConfirmPwd" autocomplete="new-password" />' +
              '<button type="button" id="zapInlineResetBtn">Reset Password</button>');
            card.appendChild(box);
            box.querySelector('#zapInlineResetBtn').addEventListener('click', async function () {
              const code = box.querySelector('#zapInlineCode').value;
              const next = box.querySelector('#zapInlineNewPwd').value;
              const confirm = box.querySelector('#zapInlineConfirmPwd').value;
              if (!code || !next || next !== confirm) { err.textContent = 'Check the fields — new password and confirmation must match.'; err.style.display = 'block'; return; }
              const rr = await callApi('reset-password', mod, { code, next });
              if (rr.ok) { ok.textContent = 'Password reset. Enter your new password above to unlock.'; box.remove(); }
              else { err.textContent = 'Reset failed — check the code and try again.'; err.style.display = 'block'; }
            });
          }
        } else {
          err.textContent = 'Could not send reset code — email delivery failed.';
          err.style.display = 'block';
        }
      });
    },

    // Convenience for page scripts calling their own protected APIs.
    authFetch(mod, url, opts) {
      opts = opts || {};
      const tok = liveToken(mod);
      opts.headers = Object.assign({}, opts.headers, tok ? { Authorization: 'Bearer ' + tok } : {});
      return fetch(url, opts);
    },
    token(mod) { return liveToken(mod); },

    // Exposed so pages with their OWN bespoke gate (e.g. admin-dashboard.html)
    // can still reuse the shared Change Password / Forgot Password modal
    // instead of building a second one.
    openSettings(mod) { openSettingsModal(mod); },

    // Exposed for the same reason: a page with its own bespoke gate still
    // gets the SAME shared header/breadcrumb/session-timer/sidebar/footer as
    // every other module, mounted right after its own login succeeds.
    mountChrome(mod, title, token, onLogout) { mountChrome(mod, title, token, onLogout); },
  };

  window.AdminGate = AdminGate;
})();
