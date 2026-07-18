/**
 * Toast reutilizable (Atlas) — feedback no bloqueante.
 */

const HOST_ID = 'atlas-toast-host';
const DEFAULT_DURATION_MS = 3200;

/** @type {HTMLElement|null} */
let hostEl = null;

function ensureHost() {
  if (hostEl && document.body.contains(hostEl)) return hostEl;
  hostEl = document.getElementById(HOST_ID);
  if (!hostEl) {
    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    hostEl.className = 'atlas-toast-host';
    hostEl.setAttribute('aria-live', 'polite');
    hostEl.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(hostEl);
  }
  return hostEl;
}

/**
 * @param {object} opts
 * @param {string} opts.message
 * @param {'success'|'warning'|'error'|'info'} [opts.type]
 * @param {number} [opts.duration]
 */
export function showToast({ message, type = 'info', duration = DEFAULT_DURATION_MS }) {
  const text = String(message || '').trim();
  if (!text) return;

  const host = ensureHost();
  const el = document.createElement('div');
  el.className = `atlas-toast atlas-toast--${type}`;
  el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
  el.textContent = text;
  host.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('atlas-toast--visible');
  });

  const hideMs = Math.max(1200, Number(duration) || DEFAULT_DURATION_MS);
  window.setTimeout(() => {
    el.classList.remove('atlas-toast--visible');
    window.setTimeout(() => {
      el.remove();
    }, 220);
  }, hideMs);
}
