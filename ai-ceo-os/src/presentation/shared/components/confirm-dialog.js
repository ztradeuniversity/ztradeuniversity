// confirm-dialog.js — the confirmation pattern for anything Heavy-weight or
// approval-queue-adjacent (UX Governance). A Light, reversible action never
// uses this — it would train the founder to click through it unread.

import { openModal, closeModal } from './modal.js';

/**
 * @param {{ title: string, message: string, confirmLabel?: string, destructive?: boolean }} opts
 * @returns {Promise<boolean>} resolves true if confirmed, false if cancelled
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', destructive = false }) {
  return new Promise((resolve) => {
    const confirmClass = destructive ? 'ceo-btn-destructive' : 'ceo-btn-primary';

    openModal(`
      <h3>${escapeHtml(title)}</h3>
      <p class="ceo-text-secondary">${escapeHtml(message)}</p>
      <div class="ceo-modal-actions">
        <button class="ceo-btn ceo-btn-secondary" id="ceo-confirm-cancel">Cancel</button>
        <button class="${confirmClass} ceo-btn" id="ceo-confirm-ok">${escapeHtml(confirmLabel)}</button>
      </div>
    `);

    document.getElementById('ceo-confirm-cancel').addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
    document.getElementById('ceo-confirm-ok').addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
