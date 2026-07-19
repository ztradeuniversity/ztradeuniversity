/* ══════════════════════════════════════════════════════════════════════
   Z TRADE UNIVERSITY — SITE-WIDE LANGUAGE SYSTEM (shared, single source)
   ----------------------------------------------------------------------
   • One free, client-side translation engine (Google Translate widget) used
     by every page — no paid API, no server code, no per-page duplication.
   • The chosen language persists in localStorage + the domain-wide `googtrans`
     cookie, so every page it is included on auto-applies the saved language.
   • A self-contained premium selector (own namespaced CSS + brand colours +
     dark-mode support) is injected into each page's header when a natural
     anchor exists, otherwise as a fixed floating control — never altering the
     host page's existing layout flow.
   • The external Google script is lazy-loaded only when a non-English language
     is active/chosen, so English visitors pay zero performance cost.
   • Brand names & trading terminology (see PROTECTED_TERMS) are wrapped in
     Google-recognised notranslate spans at runtime, on every page, without
     ever editing page-source content.
   • If the Google service fails to load or times out, the page degrades
     gracefully: a small toast reads "Translation is temporarily unavailable."
     and the site keeps working in its current language — no thrown errors,
     no frozen UI, no broken functionality.
   Include once per page:  <script src="/assets/ztu-lang.js" defer></script>
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ztuLangInit) return;          // guard against a double include
  window.__ztuLangInit = true;

  var LANG_KEY  = 'ztu-lang';
  var LANGS = [
    ['en',    'EN', 'English'],
    ['ur',    'UR', 'اردو (Urdu)'],
    ['ar',    'AR', 'العربية (Arabic)'],
    ['id',    'ID', 'Bahasa Indonesia'],
    ['ms',    'MS', 'Bahasa Melayu'],
    ['vi',    'VI', 'Tiếng Việt'],
    ['hi',    'HI', 'हिन्दी (Hindi)'],
    ['bn',    'BN', 'বাংলা (Bengali)'],
    ['tr',    'TR', 'Türkçe (Turkish)'],
    ['fa',    'FA', 'فارسی (Persian)'],
    ['es',    'ES', 'Español (Spanish)'],
    ['fr',    'FR', 'Français (French)'],
    ['pt',    'PT', 'Português (Portuguese)'],
    ['ru',    'RU', 'Русский (Russian)'],
    ['zh-CN', 'ZH', '中文 (Chinese)'],
    ['ja',    'JA', '日本語 (Japanese)'],
    ['de',    'DE', 'Deutsch (German)'],
    ['it',    'IT', 'Italiano (Italian)']
  ];
  var INCLUDED = LANGS.map(function (l) { return l[0]; }).join(',');

  /* ── injected styles (namespaced, self-contained, theme-aware) ── */
  var CSS = '' +
    '.ztu-lang{position:relative;flex-shrink:0;font-family:"Inter","Poppins",system-ui,sans-serif;}' +
    '.ztu-lang__btn{display:inline-flex;align-items:center;gap:7px;height:44px;padding:0 13px;border-radius:100px;background:#fff;border:1px solid #EAEAEA;color:#64708A;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:color .2s,border-color .2s,transform .2s;line-height:1;}' +
    '.ztu-lang__btn:hover{color:#F7931A;border-color:#F7931A;transform:translateY(-1px);}' +
    '.ztu-lang__globe{width:18px;height:18px;}' +
    '.ztu-lang__code{letter-spacing:.5px;}' +
    '.ztu-lang__chev{width:13px;height:13px;transition:transform .2s;}' +
    '.ztu-lang.open .ztu-lang__chev{transform:rotate(180deg);}' +
    '.ztu-lang__menu{position:absolute;top:calc(100% + 8px);right:0;z-index:9500;width:212px;max-height:340px;overflow-y:auto;background:#fff;border:1px solid #EAEAEA;border-radius:14px;box-shadow:0 20px 50px rgba(15,23,42,.14);padding:6px;opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .2s,transform .2s;}' +
    '.ztu-lang.open .ztu-lang__menu{opacity:1;transform:translateY(0);pointer-events:auto;}' +
    '.ztu-lang__opt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:10px 12px;border-radius:10px;border:0;background:transparent;font-family:inherit;font-size:14px;font-weight:600;color:#0F172A;cursor:pointer;text-align:left;transition:background .15s,color .15s;}' +
    '.ztu-lang__opt:hover{background:rgba(247,147,26,.12);color:#F7931A;}' +
    '.ztu-lang__opt.active{color:#F7931A;}' +
    '.ztu-lang__tick{width:15px;height:15px;flex-shrink:0;opacity:0;}' +
    '.ztu-lang__opt.active .ztu-lang__tick{opacity:1;}' +
    'html[data-theme="dark"] .ztu-lang__btn{background:#131C30;border-color:rgba(255,255,255,.09);color:#93A0B8;}' +
    'html[data-theme="dark"] .ztu-lang__btn:hover{color:#F7931A;border-color:#F7931A;}' +
    'html[data-theme="dark"] .ztu-lang__menu{background:#131C30;border-color:rgba(255,255,255,.09);box-shadow:0 20px 50px rgba(0,0,0,.55);}' +
    'html[data-theme="dark"] .ztu-lang__opt{color:#E8EDF6;}' +
    'html[data-theme="dark"] .ztu-lang__opt:hover{background:rgba(247,147,26,.14);color:#F7931A;}' +
    '.ztu-lang--fab{position:fixed;left:16px;bottom:16px;z-index:9500;}' +
    '.ztu-lang--fab .ztu-lang__menu{top:auto;bottom:calc(100% + 8px);right:auto;left:0;transform:translateY(6px);}' +
    '.ztu-lang--fab.open .ztu-lang__menu{transform:translateY(0);}' +
    '.ztu-lang--fab .ztu-lang__btn{box-shadow:0 8px 28px rgba(15,23,42,.18);}' +
    '@media (max-width:760px){.ztu-lang__btn{padding:0 11px;height:42px;}.ztu-lang__code,.ztu-lang__chev{display:none;}.ztu-lang__menu{width:194px;}}' +
    /* hide Google's injected chrome + keep layout stable */
    '.goog-te-banner-frame,.goog-te-balloon-frame,#goog-gt-tt,.skiptranslate iframe{display:none!important;}' +
    'body{top:0!important;}' +
    '.goog-text-highlight{background:none!important;box-shadow:none!important;}' +
    '#google_translate_element{display:none!important;position:absolute!important;left:-9999px!important;}' +
    /* graceful-degradation toast: fixed, never reflows the page, never blocks clicks */
    '.ztu-lang-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(10px);z-index:9700;background:#0F172A;color:#fff;font-family:"Inter","Poppins",system-ui,sans-serif;font-size:13px;font-weight:600;padding:10px 20px;border-radius:100px;box-shadow:0 10px 30px rgba(15,23,42,.35);opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s ease;max-width:calc(100vw - 32px);text-align:center;}' +
    '.ztu-lang-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}' +
    'html[data-theme="dark"] .ztu-lang-toast{background:#1e2a44;}';

  function injectCSS() {
    if (document.getElementById('ztu-lang-css')) return;
    var s = document.createElement('style');
    s.id = 'ztu-lang-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var TICK = '<svg class="ztu-lang__tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var GLOBE = '<svg class="ztu-lang__globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
  var CHEV = '<svg class="ztu-lang__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  var sel, btn, menu, codeEl, loaded = false, ready = false;

  function buildSelector() {
    sel = document.createElement('div');
    sel.className = 'ztu-lang notranslate';
    sel.id = 'ztuLangSel';
    sel.setAttribute('translate', 'no');

    var opts = '';
    for (var i = 0; i < LANGS.length; i++) {
      var c = LANGS[i][0], sh = LANGS[i][1], label = LANGS[i][2];
      opts += '<button class="ztu-lang__opt' + (c === 'en' ? ' active' : '') + '" role="option" ' +
              'aria-selected="' + (c === 'en' ? 'true' : 'false') + '" data-code="' + c + '" data-short="' + sh + '">' +
              label + TICK + '</button>';
    }
    sel.innerHTML =
      '<button type="button" class="ztu-lang__btn" id="ztuLangBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="Select language">' +
        GLOBE + '<span class="ztu-lang__code" id="ztuLangCode">EN</span>' + CHEV +
      '</button>' +
      '<div class="ztu-lang__menu" role="listbox" aria-label="Choose a language">' + opts + '</div>';

    btn    = sel.querySelector('#ztuLangBtn');
    menu   = sel.querySelector('.ztu-lang__menu');
    codeEl = sel.querySelector('#ztuLangCode');

    btn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(); });
    menu.addEventListener('click', function (e) {
      var o = e.target.closest('.ztu-lang__opt');
      if (o) pick(o.getAttribute('data-code'), o.getAttribute('data-short'), o);
    });
    return sel;
  }

  function toFloating() {
    if (sel.parentNode) sel.parentNode.removeChild(sel);
    sel.classList.add('ztu-lang--fab');        // fixed control: never touches page flow
    document.body.appendChild(sel);
  }

  /* Place the selector inline in a real header actions row when one exists;
     if that inline placement would push the page past the viewport (tight
     headers), self-correct to a floating control so no page ever overflows. */
  function mountSelector() {
    var docEl = document.documentElement;
    var vw = docEl.clientWidth;
    var widthBefore = docEl.scrollWidth;

    var anchor = document.querySelector('.head-right') ||
                 document.querySelector('.nav-actions') ||
                 document.querySelector('.nav-bar');
    if (anchor) {
      anchor.insertBefore(sel, anchor.firstChild);
    } else {
      var nav = document.querySelector('header nav.container') ||
                document.querySelector('header nav') ||
                document.querySelector('header');
      if (nav) {
        var ham = nav.querySelector('.hamburger, .mobile-toggle, [class*="hamburger"]');
        if (ham) nav.insertBefore(sel, ham);
        else nav.appendChild(sel);
      } else {
        toFloating();
        return;
      }
    }

    // Overflow guard: float ONLY when the page fit before and this inline
    // placement is what pushed it past the viewport. If the page already
    // overflowed (e.g. a very narrow header), floating wouldn't fix that, so
    // stay inline and keep the selector consistent with the header.
    if (widthBefore <= vw + 1 && docEl.scrollWidth > vw + 1) toFloating();
  }

  function toggleMenu() {
    var open = sel.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeMenu() { sel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

  function markActive(code, short) {
    if (codeEl && short) codeEl.textContent = short;
    var opts = menu.querySelectorAll('.ztu-lang__opt');
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute('data-code') === code;
      opts[i].classList.toggle('active', on);
      opts[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  /* ── translation engine ── */
  function writeCookie(lang) {
    if (lang === 'en') {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    } else {
      document.cookie = 'googtrans=/en/' + lang + '; path=/';
    }
  }

  function ensureMount() {
    if (document.getElementById('google_translate_element')) return;
    var m = document.createElement('div');
    m.id = 'google_translate_element';
    m.setAttribute('aria-hidden', 'true');
    document.body.appendChild(m);
  }

  /* ── graceful-degradation toast (non-intrusive, auto-dismiss, never blocks UI) ── */
  var toastEl, toastTimer;
  function showToast(msg) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'ztu-lang-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4000);
    } catch (e) {}
  }

  /* Widget bootstrap: loads the Google gadget once, times out and degrades
     gracefully (toast + stay in original language) if it never becomes ready
     — offline, blocked by an ad/privacy blocker, or Google's service down.
     Concurrent callers share one load attempt (no duplicate scripts/timers). */
  var WIDGET_TIMEOUT_MS = 9000;
  var widgetPending = false, widgetFailed = false;
  var okCbs = [], failCbs = [];

  function ensureWidget(cb, onFail) {
    if (ready) { cb(); return; }
    if (widgetFailed) { if (onFail) onFail(); return; }   // already known-down this pageview
    okCbs.push(cb);
    if (onFail) failCbs.push(onFail);
    if (widgetPending) return;
    widgetPending = true;
    ensureMount();

    var settled = false;
    function succeed() {
      if (settled) return; settled = true; widgetPending = false;
      ready = true;
      var q = okCbs; okCbs = []; failCbs = [];
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) {} }
    }
    function fail() {
      if (settled) return; settled = true; widgetPending = false; widgetFailed = true;
      showToast('Translation is temporarily unavailable.');
      var q = failCbs; failCbs = []; okCbs = [];
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) {} }
    }

    if (!loaded) {
      loaded = true;
      window.googleTranslateElementInit = function () {
        try {
          new google.translate.TranslateElement(
            { pageLanguage: 'en', includedLanguages: INCLUDED, autoDisplay: false },
            'google_translate_element'
          );
        } catch (err) { fail(); }
      };
      try {
        var s = document.createElement('script');
        s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        s.async = true;
        s.onerror = fail;                    // blocked / network failure
        document.head.appendChild(s);
      } catch (err) { fail(); return; }
    }

    var tries = 0;
    var maxTries = Math.ceil(WIDGET_TIMEOUT_MS / 100);
    (function wait() {
      if (settled) return;
      var combo;
      try { combo = document.querySelector('.goog-te-combo'); } catch (e) { combo = null; }
      // the combo is inserted before its <option> list — wait for the options
      if (combo && combo.options && combo.options.length > 1) { succeed(); return; }
      if (tries++ > maxTries) { fail(); return; }
      setTimeout(wait, 100);
    })();
  }

  function applyTranslation(lang) {
    protectTerms();                          // must run before Google's first DOM scan
    writeCookie(lang);
    ensureWidget(function () {
      try {
        var combo = document.querySelector('.goog-te-combo');
        if (!combo) return;
        // Google only runs its handler on a real value change — force a transition.
        if (combo.value === lang) { combo.value = 'en'; combo.dispatchEvent(new Event('change')); }
        combo.value = lang;
        combo.dispatchEvent(new Event('change'));
      } catch (e) {}
    });
    // On failure the page simply stays in its current (original) language —
    // no further action needed; showToast() already ran inside ensureWidget.
  }

  function pick(lang, short, el) {
    markActive(lang, short);
    try { localStorage.setItem(LANG_KEY, JSON.stringify({ lang: lang, short: short })); } catch (e) {}
    closeMenu();
    applyTranslation(lang);                  // 'en' restores the original text
  }

  /* Keep brand names in English wherever headers expose them (cheap, always-on). */
  function protectBrand() {
    var nodes = document.querySelectorAll('.logo, .brand, .logo-text, .brand-text, [class*="logo-text"], [class*="brand-text"]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('translate', 'no');
      nodes[i].classList.add('notranslate');
    }
  }

  /* ── SITE-WIDE BRAND & TERMINOLOGY PROTECTION ──────────────────────────
     Extend this list to protect more brand names / industry terms — one
     place, applies everywhere, no page content is ever edited on disk.
     Longest phrases are listed first so multi-word terms (e.g. "Z Trade
     University") win over their own substrings ("Z Trade") at the same
     position in the text. */
  var PROTECTED_TERMS = [
    'Z Trade University', 'MetaTrader 5', 'Trading Journal', 'Trading Assistant',
    'Risk Management', 'Stop Loss', 'Take Profit', 'Z Trade', 'ZTU', 'MT5',
    'Forex', 'Dashboard', 'API', 'Premium', 'Exness', 'Login', 'AI'
  ].sort(function (a, b) { return b.length - a.length; });

  var termsProtected = false;
  var termsRegex = null;

  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function buildTermsRegex() {
    if (termsRegex) return termsRegex;
    var alt = PROTECTED_TERMS.map(escapeRegex).join('|');
    termsRegex = new RegExp('\\b(?:' + alt + ')\\b', 'g');
    return termsRegex;
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1 };

  function wrapProtectedText(node, regex) {
    var text = node.nodeValue;
    regex.lastIndex = 0;
    var m = regex.exec(text);
    if (!m) return;
    var frag = document.createDocumentFragment();
    var lastIdx = 0;
    regex.lastIndex = 0;
    while ((m = regex.exec(text))) {
      if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      var span = document.createElement('span');
      span.className = 'notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = m[0];
      frag.appendChild(span);
      lastIdx = m.index + m[0].length;
      if (m[0].length === 0) regex.lastIndex++;   // safety: never loop on a zero-length match
    }
    if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    if (node.parentNode) node.parentNode.replaceChild(frag, node);
  }

  /* One-time (per page load) DOM-text scan that wraps every occurrence of a
     protected term in a Google-recognised notranslate span — inline, zero
     visual/layout impact, no page-source file is touched. Runs ONLY when a
     non-English language is actually requested, and MUST complete before
     Google's widget performs its first DOM scan (called synchronously,
     before ensureWidget/script injection, in applyTranslation()). */
  function protectTerms() {
    if (termsProtected) return;
    termsProtected = true;
    try {
      var regex = buildTermsRegex();
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          var p = node.parentNode;
          if (!p || SKIP_TAGS[p.nodeName]) return NodeFilter.FILTER_REJECT;
          if (p.closest && p.closest('.notranslate, #google_translate_element, .ztu-lang-toast')) return NodeFilter.FILTER_REJECT;
          regex.lastIndex = 0;
          return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var nodes = [];
      var n;
      while ((n = walker.nextNode())) nodes.push(n);
      for (var i = 0; i < nodes.length; i++) wrapProtectedText(nodes[i], regex);
    } catch (e) {}
  }

  function init() {
    try {
      injectCSS();
      protectBrand();
      buildSelector();
      mountSelector();

      document.addEventListener('click', function (e) { try { if (sel && !sel.contains(e.target)) closeMenu(); } catch (err) {} });
      document.addEventListener('keydown', function (e) { try { if (e.key === 'Escape') closeMenu(); } catch (err) {} });

      /* Restore + auto-apply the previously chosen language (skip English). */
      var saved = JSON.parse(localStorage.getItem(LANG_KEY) || 'null');
      if (saved && saved.lang && saved.lang !== 'en') {
        markActive(saved.lang, saved.short);
        applyTranslation(saved.lang);
      }

      window.ZTULang = { pick: pick, apply: applyTranslation, langs: LANGS };
    } catch (e) {
      /* Never let a page-specific DOM quirk throw — the site must keep working. */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
