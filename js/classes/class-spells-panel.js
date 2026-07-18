/**
 * Panel de conjuros dentro de la ficha de clase:
 * búsqueda + filtro de nivel (hasta el máximo desbloqueado) + detalle al seleccionar.
 */

import { createFilterPanel } from '../spells/filter-panel.js';
import { renderSpellDetail, spellLevelBadge } from '../spells/spell-detail.js';

/**
 * Opciones de nivel disponibles según slots desbloqueados.
 * @param {number|null|undefined} maxSpellLevel
 * @param {boolean} hasCantrips
 * @returns {{ id: string, label: string }[]}
 */
export function buildUnlockedLevelOptions(maxSpellLevel, hasCantrips) {
  const options = [];
  if (hasCantrips) {
    options.push({ id: '0', label: 'Truco' });
  }
  if (typeof maxSpellLevel === 'number' && maxSpellLevel >= 1) {
    for (let n = 1; n <= maxSpellLevel; n += 1) {
      options.push({ id: String(n), label: `Nivel ${n}` });
    }
  }
  return options;
}

/**
 * @param {Set<string>} levelFilter
 * @param {{ id: string }[]} options
 */
export function pruneLevelFilter(levelFilter, options) {
  if (!levelFilter || !levelFilter.size) return;
  const allowed = new Set(options.map((o) => o.id));
  for (const id of [...levelFilter]) {
    if (!allowed.has(id)) levelFilter.delete(id);
  }
}

/**
 * @param {object[]} spells
 * @param {string} query
 * @param {Set<string>} levelFilter
 * @returns {object[]}
 */
export function filterClassSpells(spells, query, levelFilter) {
  let list = spells.slice();

  if (levelFilter && levelFilter.size > 0) {
    list = list.filter((sp) => levelFilter.has(String(sp.level ?? 0)));
  }

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    list = list.filter(
      (sp) =>
        (sp.name || '').toLowerCase().includes(q) ||
        (sp.school || '').toLowerCase().includes(q) ||
        (sp.id || '').toLowerCase().includes(q)
    );
  }

  return list;
}

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Controlador del panel: se recrea cuando cambia la progresión/clase;
 * búsqueda y selección solo actualizan lista/detalle.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.sectionEl
 * @param {() => object[]} opts.getSpells
 * @param {() => number|null} opts.getMaxSpellLevel
 * @param {() => boolean} opts.getHasCantrips
 * @param {() => string} opts.getQuery
 * @param {(q: string) => void} opts.setQuery
 * @param {Set<string>} opts.levelFilter
 * @param {() => string|null} opts.getSelectedSpellId
 * @param {(id: string|null) => void} opts.setSelectedSpellId
 * @param {() => string|null} [opts.getSubtitle]
 * @param {() => void} [opts.onLevelFilterChange]
 */
export function createClassSpellsPanelController(opts) {
  const {
    sectionEl,
    getSpells,
    getMaxSpellLevel,
    getHasCantrips,
    getQuery,
    setQuery,
    levelFilter,
    getSelectedSpellId,
    setSelectedSpellId,
    getSubtitle,
    onLevelFilterChange,
  } = opts;

  /** @type {string} */
  let mountedKey = '';
  /** @type {ReturnType<typeof createFilterPanel>|null} */
  let filterPanel = null;

  function levelOptionsKey(options) {
    return options.map((o) => o.id).join(',');
  }

  function renderListAndDetail() {
    const spells = getSpells();
    const query = getQuery();
    const selectedSpellId = getSelectedSpellId();
    const filtered = filterClassSpells(spells, query, levelFilter);

    const selectedSpell =
      selectedSpellId && spells.find((s) => s.id === selectedSpellId)
        ? spells.find((s) => s.id === selectedSpellId)
        : null;
    const hasSelection = !!selectedSpell;

    sectionEl.classList.toggle('has-class-spell-selection', hasSelection);

    const listEl = sectionEl.querySelector('#class-spells-list');
    const detailEl = sectionEl.querySelector('#class-spell-detail');
    const selectedBar = sectionEl.querySelector('#class-spells-selected-bar');
    const selectedName = sectionEl.querySelector('#class-spells-selected-name');
    const selectedMeta = sectionEl.querySelector('#class-spells-selected-meta');

    if (!listEl || !detailEl || !selectedBar) return;

    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.innerHTML =
        '<div class="description-placeholder">No se encontraron conjuros.</div>';
    } else {
      const frag = document.createDocumentFragment();
      filtered.forEach((sp) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className =
          'spells-list-item class-spell-row' +
          (sp.id === selectedSpellId ? ' spells-list-item--selected' : '');
        row.dataset.spellId = sp.id;
        row.innerHTML = `
          <span class="spells-list-item__name">${escapeHtml(sp.name || sp.id)}</span>
          <span class="spells-list-item__meta">
            <span class="spells-badge">${spellLevelBadge(sp.level)}</span>
            <span class="spells-badge">${escapeHtml(sp.school || '—')}</span>
          </span>`;
        row.addEventListener('click', () => {
          setSelectedSpellId(sp.id);
          renderListAndDetail();
        });
        frag.appendChild(row);
      });
      listEl.appendChild(frag);
    }

    if (hasSelection) {
      selectedBar.hidden = false;
      if (selectedName) {
        selectedName.textContent = selectedSpell.name || selectedSpell.id;
      }
      if (selectedMeta) {
        selectedMeta.textContent = spellLevelBadge(selectedSpell.level);
      }
      detailEl.hidden = false;
      renderSpellDetail(detailEl, selectedSpell);
    } else {
      selectedBar.hidden = true;
      detailEl.hidden = true;
      detailEl.innerHTML = '';
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function mountShell() {
    const maxSpellLevel = getMaxSpellLevel();
    const hasCantrips = getHasCantrips();
    const levelOptions = buildUnlockedLevelOptions(maxSpellLevel, hasCantrips);
    pruneLevelFilter(levelFilter, levelOptions);

    const key = `${maxSpellLevel ?? 'x'}|${hasCantrips ? 1 : 0}|${levelOptionsKey(
      levelOptions
    )}`;
    const subtitle = getSubtitle ? getSubtitle() : null;
    const titleExtra = subtitle ? ` (${escapeHtml(subtitle)})` : '';

    sectionEl.className = 'class-detail__section class-spells-section';
    sectionEl.innerHTML = `
      <h4 class="class-detail__section-title">Conjuros de la clase${titleExtra}</h4>

      <div class="class-spells-toolbar atlas-search-row" id="class-spells-toolbar">
        <input
          type="search"
          id="class-spells-search"
          class="spells-search-input"
          placeholder="Buscar conjuro…"
          autocomplete="off"
          enterkeyhint="search"
        />
        <div id="class-spells-filter-mount"></div>
      </div>

      <button type="button" class="atlas-selected-bar class-spells-selected-bar" id="class-spells-selected-bar" hidden>
        <span class="atlas-selected-bar__back" aria-hidden="true">
          <i data-lucide="chevron-left"></i>
        </span>
        <span class="atlas-selected-bar__name" id="class-spells-selected-name">—</span>
        <span class="spells-badge" id="class-spells-selected-meta"></span>
      </button>

      <div class="class-spells-list description-box" id="class-spells-list"></div>
      <div class="class-spell-detail description-box" id="class-spell-detail" hidden></div>
    `;

    const searchEl = sectionEl.querySelector('#class-spells-search');
    searchEl.value = getQuery() || '';
    searchEl.addEventListener('input', () => {
      setQuery(searchEl.value);
      renderListAndDetail();
    });

    sectionEl
      .querySelector('#class-spells-selected-bar')
      .addEventListener('click', () => {
        setSelectedSpellId(null);
        renderListAndDetail();
      });

    filterPanel = null;
    const filterMount = sectionEl.querySelector('#class-spells-filter-mount');
    if (levelOptions.length > 0 && filterMount) {
      filterPanel = createFilterPanel({
        mountEl: filterMount,
        filters: { levels: levelFilter },
        sections: [{ key: 'levels', title: 'Nivel', options: levelOptions }],
        toggleId: 'class-spells-filter-btn',
        ariaLabel: 'Filtro de nivel de conjuros',
        idPrefix: 'class-spells-filter',
        flat: true,
        onChange: () => {
          if (typeof onLevelFilterChange === 'function') {
            onLevelFilterChange();
          }
          renderListAndDetail();
        },
      });
    }

    mountedKey = key;
    renderListAndDetail();
  }

  /**
   * Monta o refresca el shell si cambió el máximo de nivel desbloqueado.
   */
  function sync() {
    const maxSpellLevel = getMaxSpellLevel();
    const hasCantrips = getHasCantrips();
    const levelOptions = buildUnlockedLevelOptions(maxSpellLevel, hasCantrips);
    pruneLevelFilter(levelFilter, levelOptions);
    const key = `${maxSpellLevel ?? 'x'}|${hasCantrips ? 1 : 0}|${levelOptionsKey(
      levelOptions
    )}`;

    const needsShell =
      !sectionEl.querySelector('#class-spells-list') || mountedKey !== key;

    if (needsShell) {
      mountShell();
      return;
    }

    const subtitle = getSubtitle ? getSubtitle() : null;
    const title = sectionEl.querySelector('.class-detail__section-title');
    if (title) {
      title.textContent = subtitle
        ? `Conjuros de la clase (${subtitle})`
        : 'Conjuros de la clase';
    }

    renderListAndDetail();
  }

  function reset() {
    mountedKey = '';
    filterPanel = null;
    sectionEl.innerHTML = '';
  }

  return { sync, reset, renderListAndDetail };
}
