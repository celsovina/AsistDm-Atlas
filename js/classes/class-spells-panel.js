/**
 * Panel de conjuros dentro de la ficha de clase:
 * búsqueda + filtro de nivel (hasta el máximo desbloqueado) + detalle al seleccionar.
 */

import { createFilterPanel } from '../spells/filter-panel.js';
import { SOURCE_OPTIONS } from '../spells/filter-model.js';
import { renderSpellDetail, spellLevelBadge } from '../spells/spell-detail.js';
import { schoolColor } from '../spells/spell-schools.js';
import {
  getSpellbook,
  allMarkedIds,
  toggleFavorite,
  setExtraUnlocked,
} from './class-spellbook-storage.js';

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
 * @param {Set<string>} [sourceFilter]
 * @returns {object[]}
 */
export function filterClassSpells(spells, query, levelFilter, sourceFilter) {
  let list = spells.slice();

  if (levelFilter && levelFilter.size > 0) {
    list = list.filter((sp) => levelFilter.has(String(sp.level ?? 0)));
  }

  if (sourceFilter && sourceFilter.size > 0) {
    list = list.filter((sp) => sourceFilter.has(sp.source));
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
 * @param {Set<string>} [opts.sourceFilter]
 * @param {() => string|null} opts.getSelectedSpellId
 * @param {(id: string|null) => void} opts.setSelectedSpellId
 * @param {() => string|null} [opts.getSubtitle]
 * @param {() => void} [opts.onLevelFilterChange]
 * @param {() => string} [opts.getClassId]
 * @param {() => string|null} [opts.getCasterType]
 * @param {() => void} [opts.onFavoriteChange]
 * @param {() => object[]} [opts.getAllSpells]
 * @param {() => Set<string>} [opts.getClassSpellIdSet]
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
    sourceFilter = new Set(),
    getSelectedSpellId,
    setSelectedSpellId,
    getSubtitle,
    onLevelFilterChange,
    getClassId = () => null,
    getCasterType = () => null,
    onFavoriteChange,
    getAllSpells = () => [],
    getClassSpellIdSet = () => new Set(),
  } = opts;

  function extraUnlocked() {
    const classId = getClassId();
    return !!(classId && getSpellbook(classId)?.extraUnlocked);
  }

  /**
   * Filtro "Clase": solo aparece con "otros orígenes" activo. Por defecto
   * restringe el catálogo a la lista de la clase ('mine' presente).
   */
  const classScopeFilter = new Set(['mine']);

  function classScoped() {
    return classScopeFilter.has('mine');
  }

  /**
   * Con "otros orígenes" activo y sin el filtro "Clase", el catálogo abarca toda
   * la base de conjuros; en cualquier otro caso, solo la lista de la clase.
   */
  function activeSpellSource() {
    if (!extraUnlocked() || classScoped()) return getSpells();
    return (getAllSpells() || []).slice().sort((a, b) => {
      const byLvl = (a.level ?? 0) - (b.level ?? 0);
      return byLvl !== 0
        ? byLvl
        : (a.name || '').localeCompare(b.name || '', 'es');
    });
  }

  function inClassList(spellId) {
    return getClassSpellIdSet().has(spellId);
  }

  function markedIds() {
    const classId = getClassId();
    const book = classId ? getSpellbook(classId) : null;
    return book ? allMarkedIds(book) : new Set();
  }

  function toggleFav(spell) {
    const classId = getClassId();
    if (!classId) return;
    toggleFavorite(classId, spell.id, {
      casterType: getCasterType(),
      level: spell.level ?? 0,
      inClassList: inClassList(spell.id),
    });
    if (typeof onFavoriteChange === 'function') onFavoriteChange();
    renderListAndDetail();
  }

  function starButtonHtml(marked) {
    const label = marked ? 'Quitar de mis conjuros' : 'Añadir a mis conjuros';
    return `
      <button type="button" class="class-favorite-btn class-spell-star${
        marked ? ' is-active' : ''
      }" aria-pressed="${marked ? 'true' : 'false'}" aria-label="${label}" title="${label}">
        <i data-lucide="${marked ? 'star-check' : 'star'}"></i>
      </button>`;
  }

  /** @type {string} */
  let mountedKey = '';
  /** @type {ReturnType<typeof createFilterPanel>|null} */
  let filterPanel = null;

  function levelOptionsKey(options) {
    return options.map((o) => o.id).join(',');
  }

  function mountKey(maxSpellLevel, hasCantrips, levelOptions) {
    return `${maxSpellLevel ?? 'x'}|${hasCantrips ? 1 : 0}|${levelOptionsKey(
      levelOptions
    )}|${extraUnlocked() ? 1 : 0}`;
  }

  function renderListAndDetail() {
    // Re-sincroniza el interruptor de "otros orígenes" (puede cambiar desde fuera)
    const extraRow = sectionEl.querySelector('#class-spells-extra');
    const extraCheck = sectionEl.querySelector('#class-spells-extra-check');
    if (extraRow) extraRow.hidden = !getClassId();
    if (extraCheck) extraCheck.checked = extraUnlocked();

    const spells = activeSpellSource();
    const query = getQuery();
    const selectedSpellId = getSelectedSpellId();
    const filtered = filterClassSpells(spells, query, levelFilter, sourceFilter);

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

    const marked = markedIds();
    const canFavorite = !!getClassId();

    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.innerHTML =
        '<div class="description-placeholder">No se encontraron conjuros.</div>';
    } else {
      const frag = document.createDocumentFragment();
      filtered.forEach((sp) => {
        const isMarked = marked.has(sp.id);
        const row = document.createElement('div');
        row.className =
          'spells-list-item class-spell-row' +
          (sp.id === selectedSpellId ? ' spells-list-item--selected' : '') +
          (isMarked ? ' class-spell-row--marked' : '');
        row.dataset.spellId = sp.id;
        if (sp.school) row.dataset.school = sp.school;
        row.style.setProperty('--school-color', schoolColor(sp.school));
        row.title = sp.school || '';
        row.innerHTML = `
          ${canFavorite ? starButtonHtml(isMarked) : ''}
          <button type="button" class="class-spell-row__body">
            <span class="spells-list-item__name">${escapeHtml(sp.name || sp.id)}</span>
            <span class="spells-list-item__meta">
              <span class="spells-badge">${spellLevelBadge(sp.level)}</span>
            </span>
          </button>`;
        row.querySelector('.class-spell-row__body').addEventListener('click', () => {
          setSelectedSpellId(sp.id);
          renderListAndDetail();
        });
        const star = row.querySelector('.class-spell-star');
        if (star) star.addEventListener('click', () => toggleFav(sp));
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
      if (canFavorite) {
        const wrap = document.createElement('div');
        wrap.className = 'class-spell-detail__star';
        wrap.innerHTML = starButtonHtml(marked.has(selectedSpell.id));
        wrap
          .querySelector('.class-spell-star')
          .addEventListener('click', () => toggleFav(selectedSpell));
        detailEl.prepend(wrap);
      }
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

    const key = mountKey(maxSpellLevel, hasCantrips, levelOptions);
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

      <label class="class-spells-extra" id="class-spells-extra" hidden>
        <span class="atlas-switch atlas-switch--sm">
          <input type="checkbox" id="class-spells-extra-check" />
          <span class="switch-slider"></span>
        </span>
        <span>Conjuros de otros orígenes (raza, dotes, objetos…)</span>
      </label>

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

    const extraRow = sectionEl.querySelector('#class-spells-extra');
    const extraCheck = sectionEl.querySelector('#class-spells-extra-check');
    if (extraRow && extraCheck) {
      const classId = getClassId();
      extraRow.hidden = !classId;
      extraCheck.checked = extraUnlocked();
      extraCheck.addEventListener('change', () => {
        const cid = getClassId();
        if (!cid) return;
        setExtraUnlocked(cid, extraCheck.checked);
        setSelectedSpellId(null);
        if (typeof onFavoriteChange === 'function') onFavoriteChange();
        // El filtro "Clase" aparece/desaparece → reconstruir el shell.
        mountShell();
      });
    }

    filterPanel = null;
    const filterMount = sectionEl.querySelector('#class-spells-filter-mount');
    const filterSections = [
      { key: 'levels', title: 'Nivel', options: levelOptions },
      { key: 'sources', title: 'Origen', options: SOURCE_OPTIONS },
    ];
    if (extraUnlocked()) {
      filterSections.unshift({
        key: 'classScope',
        title: 'Clase',
        options: [{ id: 'mine', label: 'Solo conjuros de mi clase' }],
      });
    }
    if (filterSections.some((s) => s.options.length) && filterMount) {
      filterPanel = createFilterPanel({
        mountEl: filterMount,
        filters: {
          levels: levelFilter,
          sources: sourceFilter,
          classScope: classScopeFilter,
        },
        sections: filterSections,
        toggleId: 'class-spells-filter-btn',
        ariaLabel: 'Filtros de conjuros',
        idPrefix: 'class-spells-filter',
        badgeExcludeKeys: ['classScope'],
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
    const key = mountKey(maxSpellLevel, hasCantrips, levelOptions);

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
