/**
 * Toast reutilizable (Atlas) — feedback no bloqueante.
 */

const HOST_ID = 'atlas-toast-host';
const DEFAULT_DURATION_MS = 3200;
const ACTION_DURATION_MS = 8000;

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
 * @param {{ label: string, onClick: () => void }} [opts.action]
 */
export function showToast({
  message,
  type = 'info',
  duration,
  action = null,
}) {
  const text = String(message || '').trim();
  if (!text && !action?.label) return;

  const host = ensureHost();
  const el = document.createElement('div');
  el.className = `atlas-toast atlas-toast--${type}`;
  el.setAttribute(
    'role',
    type === 'error' || type === 'warning' ? 'alert' : 'status'
  );

  const msg = document.createElement('span');
  msg.className = 'atlas-toast__text';
  msg.textContent = text;
  el.appendChild(msg);

  const hasAction =
    action &&
    typeof action.label === 'string' &&
    action.label.trim() &&
    typeof action.onClick === 'function';

  if (hasAction) {
    el.classList.add('atlas-toast--interactive');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'atlas-toast__action';
    btn.textContent = action.label.trim();
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        action.onClick();
      } finally {
        el.classList.remove('atlas-toast--visible');
        window.setTimeout(() => el.remove(), 220);
      }
    });
    el.appendChild(btn);
  }

  host.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('atlas-toast--visible');
  });

  const hideMs = Math.max(
    1200,
    Number(duration) || (hasAction ? ACTION_DURATION_MS : DEFAULT_DURATION_MS)
  );
  window.setTimeout(() => {
    if (!document.body.contains(el)) return;
    el.classList.remove('atlas-toast--visible');
    window.setTimeout(() => {
      el.remove();
    }, 220);
  }, hideMs);
}
