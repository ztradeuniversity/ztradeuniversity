// operational-section.js
//
// The reusable loading -> empty pattern every module workspace uses (Wave 4).
// No module has live data yet (their DB tables aren't migrated until later
// waves — see docs/architecture/wave-4-module-foundation.md), so this shows
// the honest, correct behavior a freshly-migrated-but-empty table will
// actually have: a brief loading state, then a real empty state — never a
// duplicated markup block per module.
//
// Usage: mark a section `data-operational-section`, wrap its real (empty-
// state) markup in a child `[data-section-body]`. This module shows a
// skeleton first, then reveals the real markup — nothing is invented, the
// empty-state content already in the HTML is exactly what renders.

const SKELETON_DELAY_MS = 350;

export function initOperationalSection(sectionEl) {
  const body = sectionEl.querySelector('[data-section-body]');
  if (!body) return;

  const realContent = body.innerHTML;
  const skeletonRows = Number(sectionEl.dataset.skeletonRows || 3);

  body.innerHTML = Array.from({ length: skeletonRows })
    .map(() => '<div class="ceo-skeleton ceo-skeleton-card" style="margin-bottom: var(--ceo-space-3);"></div>')
    .join('');

  setTimeout(() => {
    body.innerHTML = realContent;
  }, SKELETON_DELAY_MS);
}

export function initAllOperationalSections(root = document) {
  root.querySelectorAll('[data-operational-section]').forEach(initOperationalSection);
}
