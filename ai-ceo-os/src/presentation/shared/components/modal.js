// modal.js — one shared modal shell (Frontend Constitution §3: chrome —
// close behavior, backdrop, focus trap — never varies; only content does).

let overlay = null;
let lastFocused = null;

function ensureOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.className = 'ceo-modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="ceo-modal" role="dialog" aria-modal="true"></div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeModal();
  });

  return overlay;
}

/**
 * @param {string} contentHtml
 */
export function openModal(contentHtml) {
  const el = ensureOverlay();
  el.querySelector('.ceo-modal').innerHTML = contentHtml;
  lastFocused = document.activeElement;
  el.hidden = false;

  const focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]');
  if (focusable) focusable.focus();
}

export function closeModal() {
  if (!overlay) return;
  overlay.hidden = true;
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
}
