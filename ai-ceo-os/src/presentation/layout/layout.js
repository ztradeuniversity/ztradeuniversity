// layout.js
//
// Injects the shared sidebar/header/footer partials into every dashboard
// page's designated slots (avoids duplicating ~150 lines of markup per page
// without needing a build step), wires nav active-state and the logout
// button, and runs the session guard first.

import { guardPage } from '../shared/session-guard.js';
import { getSupabaseClient } from '../shared/supabase-client.js';

// Founder OS Restructure, Step 2 (2026-07-12): nav collapsed from 7 equal
// destinations to Today/Trading/Growth (the two business outcomes + the
// daily anchor) + a "More" utility group. Per-module "wave" badges stay
// removed (2026-07-11, Wave 5 audit) — data-readiness status has exactly one
// home, the Module Status card on Home.
const PRIMARY_NAV = [
  { key: 'command-center', label: 'Today', href: '/ai-ceo-os/src/presentation/command-center/index.html' },
  { key: 'trading', label: 'Trading', href: '/ai-ceo-os/src/presentation/trading/index.html' },
  { key: 'growth', label: 'Growth', href: '/ai-ceo-os/src/presentation/growth/index.html' },
];

// Utility cluster — supports the two pillars, isn't a destination visited on
// its own. Reviews joins this group too (not named in the Step 2 spec's list,
// but folding it out of primary nav without a "More" home would orphan a real
// working page — kept reachable, not deleted, per "no dead code").
const MORE_NAV = [
  { key: 'intelligence', label: 'Playbooks', href: '/ai-ceo-os/src/presentation/intelligence/index.html' },
  { key: 'automation', label: 'Automation', href: '/ai-ceo-os/src/presentation/automation/index.html' },
  { key: 'review', label: 'Reviews', href: '/ai-ceo-os/src/presentation/review/index.html' },
  { key: 'settings', label: 'Settings', href: '/ai-ceo-os/src/presentation/settings/index.html' },
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
  const primaryItems = PRIMARY_NAV.map((item) => navLink(item, activeKey)).join('');
  const moreItems = MORE_NAV.map((item) => navLink(item, activeKey)).join('');
  const moreIsActive = MORE_NAV.some((item) => item.key === activeKey);

  return `
    <div class="ceo-sidebar-brand">AI CEO OS</div>
    <nav class="ceo-nav" aria-label="Primary">
      ${primaryItems}
      <details class="ceo-nav-more"${moreIsActive ? ' open' : ''}>
        <summary class="ceo-nav-link${moreIsActive ? ' ceo-nav-link-active' : ''}">More</summary>
        <div class="ceo-nav-more-items">${moreItems}</div>
      </details>
    </nav>`;
}

function navLink(item, activeKey) {
  const isActive = item.key === activeKey;
  return `
      <a href="${item.href}" class="ceo-nav-link${isActive ? ' ceo-nav-link-active' : ''}">
        <span>${item.label}</span>
      </a>`;
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
