// tabs.js — wires up a `.ceo-tabs` / `.ceo-tab-panel` pair already present in
// the page's HTML. Progressive disclosure is the pattern (Frontend
// Constitution §7); this module only handles the show/hide + aria state.

/**
 * @param {string} containerSelector — element containing both .ceo-tab buttons and .ceo-tab-panel elements
 */
export function initTabs(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const tabs = Array.from(container.querySelectorAll('.ceo-tab'));
  const panels = Array.from(container.querySelectorAll('.ceo-tab-panel'));

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.tab));
  });

  function activate(key) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === key)));
    panels.forEach((p) => {
      p.hidden = p.dataset.tabPanel !== key;
    });
  }

  const initiallySelected = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
  if (initiallySelected) activate(initiallySelected.dataset.tab);
}
