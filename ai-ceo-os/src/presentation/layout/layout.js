// layout.js
//
// Injects the shared sidebar/header/footer partials into every dashboard
// page's designated slots (avoids duplicating ~150 lines of markup per page
// without needing a build step), wires nav active-state and the logout
// button, and runs the session guard first.

import { guardPage } from '../shared/session-guard.js';
import { getSupabaseClient } from '../shared/supabase-client.js';

// Per-module "wave" badges were removed from here (2026-07-11, Wave 5 audit):
// they drifted out of sync with the Home page's Module Status card once Wave 4
// gave every module a real UI shell. Data-readiness status has exactly one
// home now — the Module Status card on Home — so it can't drift again.
const NAV_ITEMS = [
  { key: 'command-center', label: 'Home', href: '/ai-ceo-os/src/presentation/command-center/index.html' },
  { key: 'trading', label: 'Trading Discipline', href: '/ai-ceo-os/src/presentation/trading/index.html' },
  { key: 'clients', label: 'IB Client Engine', href: '/ai-ceo-os/src/presentation/clients/index.html' },
  { key: 'growth', label: 'Growth Engine', href: '/ai-ceo-os/src/presentation/growth/index.html' },
  { key: 'intelligence', label: 'Intelligence Center', href: '/ai-ceo-os/src/presentation/intelligence/index.html' },
  { key: 'automation', label: 'Automation Center', href: '/ai-ceo-os/src/presentation/automation/index.html' },
  { key: 'review', label: 'Reviews', href: '/ai-ceo-os/src/presentation/review/index.html' },
];

export async function initLayout(activeKey) {
  const user = await guardPage();
  if (!user) return null; // guardPage already redirected

  await Promise.all([injectPartial('ceo-sidebar-slot', sidebarHtml(activeKey)), injectPartial('ceo-header-slot', headerHtml(user))]);
  injectPartial('ceo-footer-slot', footerHtml());

  wireLogout();

  return user;
}

function sidebarHtml(activeKey) {
  const items = NAV_ITEMS.map((item) => {
    const isActive = item.key === activeKey;
    return `
      <a href="${item.href}" class="ceo-nav-link${isActive ? ' ceo-nav-link-active' : ''}">
        <span>${item.label}</span>
      </a>`;
  }).join('');

  return `
    <div class="ceo-sidebar-brand">AI CEO OS</div>
    <nav class="ceo-nav" aria-label="Primary">${items}</nav>`;
}

function headerHtml(user) {
  return `
    <div class="ceo-header-title"></div>
    <div class="ceo-flex ceo-items-center ceo-gap-4">
      <a href="/ai-ceo-os/src/presentation/settings/index.html" class="ceo-icon-btn" title="Settings, Notifications, Audit, System Health" aria-label="Settings and system utilities">⚙</a>
      <span class="ceo-text-secondary" style="font-size: var(--ceo-font-size-sm)">${escapeHtml(user.email)}</span>
      <button id="ceo-logout-btn" class="ceo-btn ceo-btn-secondary">Log out</button>
    </div>`;
}

function footerHtml() {
  const year = new Date().getFullYear();
  return `<span>AI CEO Operating System — private, admin-only. © ${year} Z Trade University.</span>`;
}

function injectPartial(slotId, html) {
  const slot = document.getElementById(slotId);
  if (slot) slot.innerHTML = html;
}

function wireLogout() {
  const btn = document.getElementById('ceo-logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const supabase = await getSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/ai-ceo-os/src/presentation/auth/login.html';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
