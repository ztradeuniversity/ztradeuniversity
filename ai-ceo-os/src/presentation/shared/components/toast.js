// toast.js — the Info/Warning/Critical visual treatment for transient
// messages. Notification-class routing (which class fires when) is Wave 5+
// business logic; this module only renders whatever it's told to.

let region = null;

function getRegion() {
  if (!region) {
    region = document.createElement('div');
    region.className = 'ceo-toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  return region;
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'critical'} [level='info']
 * @param {number} [durationMs=4000]
 */
export function showToast(message, level = 'info', durationMs = 4000) {
  const el = document.createElement('div');
  el.className = `ceo-toast ceo-toast-${level}`;
  el.textContent = message;
  getRegion().appendChild(el);

  setTimeout(() => {
    el.remove();
  }, durationMs);
}
