/**
 * Botón limpiar para campos de búsqueda.
 * Aparece con texto; al pulsar vacía el input y dispara `input`.
 */

/**
 * @param {HTMLInputElement | null} input
 * @returns {HTMLInputElement | null}
 */
export function enhanceSearchClear(input) {
  if (!input || input.dataset.searchClearEnhanced === '1') return input;

  const wrap = document.createElement('div');
  wrap.className = 'atlas-search-field';

  const parent = input.parentNode;
  if (!parent) return input;
  parent.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'atlas-search-clear';
  btn.setAttribute('aria-label', 'Limpiar búsqueda');
  btn.title = 'Limpiar';
  btn.hidden = true;
  btn.innerHTML = '<i data-lucide="x"></i>';
  wrap.appendChild(btn);

  input.dataset.searchClearEnhanced = '1';

  function sync() {
    const hasText = String(input.value || '').length > 0;
    btn.hidden = !hasText;
  }

  input.addEventListener('input', sync);
  input.addEventListener('change', sync);

  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!input.value) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    sync();
  });

  sync();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  return input;
}

/**
 * @param {ParentNode} [root]
 * @param {string} [selector]
 */
export function enhanceAllSearchClears(
  root = document,
  selector = 'input.spells-search-input, input[data-search-clear]'
) {
  root.querySelectorAll(selector).forEach((el) => {
    if (el instanceof HTMLInputElement) enhanceSearchClear(el);
  });
}
