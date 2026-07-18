/**
 * Panel de filtros: menú de categorías + submenú con toggles (hover/clic).
 */

import {
  FILTER_SECTIONS,
  countActiveFilters,
} from './filter-model.js';

/**
 * @param {object} options
 * @param {HTMLElement} options.mountEl
 * @param {Record<string, Set<string>>} options.filters
 * @param {(filters: object) => void} options.onChange
 * @param {typeof FILTER_SECTIONS} [options.sections] Secciones a mostrar (por defecto todas)
 * @param {string} [options.toggleId]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.idPrefix] Prefijo único para ids de inputs (evita colisiones)
 * @param {boolean} [options.flat] Si true, muestra opciones directas sin categoría/submenú
 */
export function createFilterPanel({
  mountEl,
  filters,
  onChange,
  sections = FILTER_SECTIONS,
  toggleId = 'filter-btn',
  ariaLabel = 'Filtros de conjuros',
  idPrefix = 'filter',
  flat = false,
}) {
  const root = document.createElement('div');
  root.className = `atlas-filter${flat ? ' atlas-filter--flat' : ''}`.trim();

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'atlas-icon-btn atlas-filter__toggle';
  toggleBtn.id = toggleId;
  toggleBtn.title = 'Filtros';
  toggleBtn.setAttribute('aria-label', 'Filtros');
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.innerHTML = '<i data-lucide="list-sort-descending"></i>';

  const badge = document.createElement('span');
  badge.className = 'atlas-filter__badge';
  badge.hidden = true;
  toggleBtn.appendChild(badge);

  const panel = document.createElement('div');
  panel.className = 'atlas-filter__panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', ariaLabel);

  const clearId = `${idPrefix}-clear`;
  const header = document.createElement('div');
  header.className = 'atlas-filter__header';
  header.innerHTML = `
    <span class="atlas-filter__title">Filtros</span>
    <button type="button" class="atlas-filter__clear" id="${clearId}" aria-label="Limpiar" title="Limpiar">
      <i data-lucide="brush-cleaning"></i>
    </button>
  `;
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'atlas-filter__body';

  /** @type {HTMLElement|null} */
  let activeItem = null;

  /**
   * @param {object} section
   * @param {HTMLElement} parent
   */
  function appendOptionRows(section, parent) {
    section.options.forEach((opt) => {
      const safeId = String(opt.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const rowId = `${idPrefix}-${section.key}-${safeId}`;

      const row = document.createElement('label');
      row.className = 'atlas-filter__row';
      row.htmlFor = rowId;
      row.dataset.group = section.key;
      row.dataset.id = opt.id;

      const labelText = document.createElement('span');
      labelText.className = 'atlas-filter__label';
      labelText.textContent = opt.label;
      labelText.id = `${rowId}-label`;

      const switchWrap = document.createElement('span');
      switchWrap.className = 'switch-container atlas-filter__switch';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = rowId;
      input.dataset.group = section.key;
      input.dataset.id = opt.id;
      input.setAttribute('aria-labelledby', `${rowId}-label`);

      const slider = document.createElement('span');
      slider.className = 'switch-slider';

      switchWrap.appendChild(input);
      switchWrap.appendChild(slider);

      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const set = filters[section.key];
        if (!set) return;
        if (input.checked) set.add(opt.id);
        else set.delete(opt.id);
        row.classList.toggle('is-active', input.checked);
        updateBadge();
        updateItemCounts();
        onChange(filters);
      });

      row.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      row.appendChild(labelText);
      row.appendChild(switchWrap);
      parent.appendChild(row);
    });
  }

  if (flat) {
    sections.forEach((section) => {
      const group = document.createElement('div');
      group.className = 'atlas-filter__flat-group';
      group.dataset.key = section.key;
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', section.title);

      const title = document.createElement('div');
      title.className = 'atlas-filter__submenu-title';
      title.textContent = section.title;
      group.appendChild(title);

      appendOptionRows(section, group);
      body.appendChild(group);
    });
  } else {
    sections.forEach((section) => {
      const item = document.createElement('div');
      item.className = 'atlas-filter__item';
      item.dataset.key = section.key;

      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.className = 'atlas-filter__item-btn';
      itemBtn.setAttribute('aria-expanded', 'false');
      itemBtn.innerHTML = `
        <span class="atlas-filter__item-name">${section.title}</span>
        <span class="atlas-filter__item-meta">
          <span class="atlas-filter__item-count" hidden></span>
          <span class="atlas-filter__item-chevron" aria-hidden="true">›</span>
        </span>
      `;

      const submenu = document.createElement('div');
      submenu.className = 'atlas-filter__submenu';
      submenu.hidden = true;
      submenu.setAttribute('role', 'group');
      submenu.setAttribute('aria-label', section.title);

      const submenuTitle = document.createElement('div');
      submenuTitle.className = 'atlas-filter__submenu-title';
      submenuTitle.textContent = section.title;
      submenu.appendChild(submenuTitle);

      appendOptionRows(section, submenu);

      item.appendChild(itemBtn);
      item.appendChild(submenu);
      body.appendChild(item);

      itemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeItem === item) closeSubmenu();
        else openSubmenu(item);
      });

      item.addEventListener('mouseenter', () => {
        openSubmenu(item);
      });
    });
  }

  panel.appendChild(body);
  root.appendChild(toggleBtn);
  root.appendChild(panel);
  mountEl.appendChild(root);

  panel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  function openSubmenu(item) {
    if (activeItem && activeItem !== item) {
      activeItem.classList.remove('is-open');
      const prev = activeItem.querySelector('.atlas-filter__submenu');
      const prevBtn = activeItem.querySelector('.atlas-filter__item-btn');
      if (prev) prev.hidden = true;
      if (prevBtn) prevBtn.setAttribute('aria-expanded', 'false');
    }
    activeItem = item;
    item.classList.add('is-open');
    const submenu = item.querySelector('.atlas-filter__submenu');
    const itemBtn = item.querySelector('.atlas-filter__item-btn');
    if (submenu) submenu.hidden = false;
    if (itemBtn) itemBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSubmenu() {
    if (!activeItem) return;
    activeItem.classList.remove('is-open');
    const submenu = activeItem.querySelector('.atlas-filter__submenu');
    const itemBtn = activeItem.querySelector('.atlas-filter__item-btn');
    if (submenu) submenu.hidden = true;
    if (itemBtn) itemBtn.setAttribute('aria-expanded', 'false');
    activeItem = null;
  }

  function syncRow(row, active) {
    row.classList.toggle('is-active', active);
    const input = row.querySelector('input[type="checkbox"]');
    if (input) input.checked = !!active;
  }

  function syncAllRows() {
    panel.querySelectorAll('.atlas-filter__row').forEach((row) => {
      const group = row.dataset.group;
      const id = row.dataset.id;
      syncRow(row, filters[group]?.has(id));
    });
    updateBadge();
    updateItemCounts();
  }

  function updateItemCounts() {
    panel.querySelectorAll('.atlas-filter__item').forEach((item) => {
      const key = item.dataset.key;
      const n = filters[key]?.size || 0;
      const countEl = item.querySelector('.atlas-filter__item-count');
      if (!countEl) return;
      if (n > 0) {
        countEl.hidden = false;
        countEl.textContent = String(n);
        item.classList.add('has-active');
      } else {
        countEl.hidden = true;
        countEl.textContent = '';
        item.classList.remove('has-active');
      }
    });
  }

  function updateBadge() {
    const n = countActiveFilters(filters);
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function open() {
    panel.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
  }

  function close() {
    if (!flat) closeSubmenu();
    panel.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
  }

  function toggle() {
    if (panel.hidden) open();
    else close();
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  header.querySelector(`#${clearId}`).addEventListener('click', (e) => {
    e.stopPropagation();
    Object.values(filters).forEach((set) => {
      if (set && typeof set.clear === 'function') set.clear();
    });
    syncAllRows();
    onChange(filters);
  });

  function onDocClick(e) {
    if (!root.isConnected) {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onDocKeydown);
      return;
    }
    if (!root.contains(e.target) && !panel.hidden) close();
  }

  function onDocKeydown(e) {
    if (!root.isConnected) {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onDocKeydown);
      return;
    }
    if (e.key === 'Escape' && !panel.hidden) {
      if (!flat && activeItem) closeSubmenu();
      else close();
    }
  }

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);

  syncAllRows();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  return {
    root,
    open,
    close,
    syncAllRows,
    refreshIconsTarget: toggleBtn,
  };
}
