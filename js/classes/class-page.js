/**
 * Vista de Clases: lista + ficha (rasgos y conjuros por nivel de clase).
 */

import { getClasses, getClassById } from '../api/classes-api.js';
import { getClassProgression } from '../api/progression-api.js';
import { getClassSpells } from '../api/class-spells-api.js';
import { getAllSpells } from '../api/spells-api.js';
import { ApiError } from '../api/client.js';
import { spellAvailableWithSlots } from './progression-utils.js';
import { CustomSelect } from '../ui/custom-select.js';
import { createClassSpellsPanelController } from './class-spells-panel.js';
import {
  clearArchetypeSelection,
  saveArchetypeSelection,
  syncArchetypeWithLevel,
} from './archetype-storage.js';
import {
  findArchetype,
  getArchetypeSelectorFeature,
  getArchetypeUnlockLevel,
  getClassArchetypes,
  getMergedFeatures,
  getSpellcastingFeatureUnlockLevel,
  partitionFeaturesByLevel,
} from './archetype-features.js';
import {
  resolveProgressionClassId,
  resolveSpellListClassId,
} from './spellcasting-source.js';
import {
  clearClassFavorite,
  isClassFavorite,
  loadClassFavorite,
  saveClassFavorite,
} from './class-favorites-storage.js';

/**
 * @param {object} rootEls
 */
export function createClassesPage(rootEls) {
  const state = {
    classes: [],
    classSpellMap: null,
    allSpells: [],
    spellsById: new Map(),
    loading: true,
    error: null,
    selectedClassId: null,
    classDetail: null,
    /** Progresión de la clase base */
    classProgression: null,
    /** Progresión efectiva (clase o arquetipo lanzador) */
    progression: null,
    classLevel: 1,
    selectedArchetypeId: null,
    selectedSpellId: null,
    spellQuery: '',
    spellLevelFilter: new Set(),
    isFavorite: false,
    query: '',
    previousFeaturesOpen: false,
  };

  /** @type {CustomSelect|null} */
  let levelSelect = null;
  /** @type {CustomSelect|null} */
  let archetypeSelect = null;
  /** @type {ReturnType<typeof createClassSpellsPanelController>|null} */
  let spellsPanel = null;

  const els = rootEls;

  function getProgressionRow() {
    const rows = state.progression?.byClassLevel || [];
    return rows.find((r) => r.classLevel === state.classLevel) || null;
  }

  function getSpellListClassId() {
    return resolveSpellListClassId(
      state.selectedClassId,
      state.selectedArchetypeId
    );
  }

  function getClassSpellsForLevel() {
    if (!state.selectedClassId || !state.classSpellMap) return [];
    const listId = getSpellListClassId();
    const ids = state.classSpellMap[listId];
    if (!ids || !ids.size) return [];

    const row = getProgressionRow();
    const slots = row?.spellSlots || null;
    if (!slots) return [];

    const spells = [];
    for (const id of ids) {
      const spell = state.spellsById.get(id);
      if (!spell) continue;
      if (spellAvailableWithSlots(spell, slots)) spells.push(spell);
    }

    spells.sort((a, b) => {
      const byLevel = (a.level ?? 0) - (b.level ?? 0);
      if (byLevel !== 0) return byLevel;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
    return spells;
  }

  /**
   * Nivel en el que se desbloquea el lanzamiento de conjuros.
   * @returns {number|null}
   */
  function getSpellcastingUnlockLevel() {
    const fromFeat = getSpellcastingFeatureUnlockLevel(
      state.classDetail,
      state.selectedArchetypeId
    );
    if (fromFeat != null) return fromFeat;

    if (!state.progression?.hasSpellProgression) return null;

    const first = (state.progression.byClassLevel || []).find(
      (r) => r.maxSpellLevel != null || r.hasCantrips
    );
    return first ? first.classLevel : null;
  }

  function shouldShowClassSpellsSection() {
    const cls = state.classDetail;
    if (!cls) return false;

    const listId = getSpellListClassId();
    const hasSpellList = !!(
      state.classSpellMap?.[listId] && state.classSpellMap[listId].size > 0
    );
    const hasProg = !!state.progression?.hasSpellProgression;
    if (!hasSpellList && !hasProg) return false;

    const unlockLevel = getSpellcastingUnlockLevel();
    if (unlockLevel == null) return false;

    return state.classLevel >= unlockLevel;
  }

  /**
   * Arquetipo en UI según nivel. Solo lee/escribe storage si hay favorito.
   * @param {{ clearIfBelow?: boolean }} [opts]
   */
  function syncArchetypeFromStorage(opts = {}) {
    const unlock = getArchetypeUnlockLevel(state.classDetail);

    if (!state.isFavorite) {
      clearArchetypeSelection(state.selectedClassId);
      if (unlock != null && state.classLevel < unlock) {
        state.selectedArchetypeId = null;
      }
      return;
    }

    const saved = syncArchetypeWithLevel(
      state.selectedClassId,
      state.classLevel,
      unlock,
      opts
    );
    if (saved && findArchetype(state.classDetail, saved)) {
      state.selectedArchetypeId = saved;
    } else if (unlock != null && state.classLevel < unlock) {
      state.selectedArchetypeId = null;
    } else if (!saved) {
      // Favorito sin arquetipo en storage auxiliar: intentar snapshot
      const snap = loadClassFavorite(state.selectedClassId);
      if (snap?.archetypeId && findArchetype(state.classDetail, snap.archetypeId)) {
        state.selectedArchetypeId = snap.archetypeId;
        saveArchetypeSelection(state.selectedClassId, snap.archetypeId);
      } else {
        state.selectedArchetypeId = null;
      }
    }
  }

  function persistArchetypeSelection(archetypeId) {
    if (!state.selectedClassId) return;
    if (!state.isFavorite) {
      clearArchetypeSelection(state.selectedClassId);
      return;
    }
    if (archetypeId) {
      saveArchetypeSelection(state.selectedClassId, archetypeId);
    } else {
      clearArchetypeSelection(state.selectedClassId);
    }
  }

  function snapshotFavoriteState() {
    let archetypeId = state.selectedArchetypeId;
    // Si el nivel está bajo el umbral, conservar el arquetipo ya guardado en favorito.
    if (!archetypeId && state.isFavorite && state.selectedClassId) {
      const prev = loadClassFavorite(state.selectedClassId);
      if (prev?.archetypeId) archetypeId = prev.archetypeId;
    }
    return {
      classLevel: state.classLevel,
      archetypeId,
      spellQuery: state.spellQuery,
      spellLevels: [...state.spellLevelFilter],
      previousFeaturesOpen: state.previousFeaturesOpen,
      selectedSpellId: state.selectedSpellId,
      // Uso en Clases = favorito real (deja de ser efímero de Recursos)
      fromResources: false,
    };
  }

  function persistFavoriteIfNeeded() {
    if (!state.selectedClassId || !state.isFavorite) return;
    const snap = snapshotFavoriteState();
    saveClassFavorite(state.selectedClassId, snap);
    persistArchetypeSelection(snap.archetypeId);
  }

  /**
   * Aplica snapshot de favorito. Devuelve true si había favorito.
   * @param {string} classId
   */
  function applyFavoriteOrDefaults(classId) {
    const snap = loadClassFavorite(classId);
    if (!snap) {
      state.isFavorite = false;
      state.classLevel = 1;
      state.selectedArchetypeId = null;
      state.spellQuery = '';
      state.spellLevelFilter.clear();
      state.previousFeaturesOpen = false;
      state.selectedSpellId = null;
      clearArchetypeSelection(classId);
      return false;
    }

    state.isFavorite = true;
    state.classLevel = snap.classLevel;
    state.selectedArchetypeId = snap.archetypeId;
    state.spellQuery = snap.spellQuery;
    state.spellLevelFilter = new Set(snap.spellLevels);
    state.previousFeaturesOpen = snap.previousFeaturesOpen;
    state.selectedSpellId = snap.selectedSpellId;
    if (snap.archetypeId) {
      persistArchetypeSelection(snap.archetypeId);
    } else {
      clearArchetypeSelection(classId);
    }
    return true;
  }

  /**
   * Carga progresión efectiva según clase / arquetipo lanzador.
   */
  async function refreshProgression() {
    const classId = state.selectedClassId;
    if (!classId) {
      state.progression = null;
      return;
    }

    const classProg = state.classProgression || {
      classId,
      hasSpellProgression: false,
      byClassLevel: [],
    };

    const progId = resolveProgressionClassId(
      classId,
      state.selectedArchetypeId,
      !!classProg.hasSpellProgression
    );

    if (progId === classId) {
      state.progression = classProg;
      return;
    }

    try {
      state.progression = await getClassProgression(progId);
    } catch {
      state.progression = classProg;
    }
  }

  function renderClassList() {
    if (state.loading) {
      els.list.innerHTML =
        '<div class="description-placeholder">Cargando clases…</div>';
      return;
    }
    if (state.error) {
      els.list.innerHTML = `<div class="description-placeholder">${state.error}</div>`;
      return;
    }

    let list = state.classes.slice();
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      list = list.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.id || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));

    if (!list.length) {
      els.list.innerHTML =
        '<div class="description-placeholder">No se encontraron clases.</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach((cls) => {
      const row = document.createElement('button');
      row.type = 'button';
      const fav = isClassFavorite(cls.id);
      row.className =
        'spells-list-item' +
        (cls.id === state.selectedClassId ? ' spells-list-item--selected' : '') +
        (fav ? ' spells-list-item--favorite' : '');
      row.dataset.classId = cls.id;

      const caster =
        cls.spellCasterType != null
          ? `<span class="spells-badge">Lanzador</span>`
          : `<span class="spells-badge">Marcial</span>`;

      const favIcon = fav
        ? `<span class="spells-list-item__fav" title="Favorito" aria-hidden="true"><i data-lucide="star-check"></i></span>`
        : '';

      row.innerHTML = `
        <span class="spells-list-item__name">${cls.name || cls.id}</span>
        <span class="spells-list-item__meta">
          ${favIcon}
          <span class="spells-badge">${cls.hitDie || '—'}</span>
          ${caster}
        </span>
      `;
      row.addEventListener('click', () => selectClass(cls.id));
      frag.appendChild(row);
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    els.list.innerHTML = '';
    els.list.appendChild(frag);
  }

  /**
   * @param {object[]} features
   * @param {{ expanded?: boolean }} [opts]
   */
  function featureCardsHtml(features, opts = {}) {
    if (!features.length) {
      return '<div class="description-placeholder">Sin rasgos a este nivel.</div>';
    }
    const expanded = opts.expanded === true;
    return features
      .map(
        (f) => `
        <details class="class-feature"${expanded ? ' open' : ''}>
          <summary class="class-feature__summary">
            <span class="class-feature__name">${f.name || f.id}</span>
            <span class="spells-badge">Nivel ${f.level ?? '—'}</span>
          </summary>
          <p class="class-feature__desc">${f.description || '—'}</p>
        </details>`
      )
      .join('');
  }

  function destroySelects() {
    if (levelSelect) {
      levelSelect.destroy();
      levelSelect = null;
    }
    if (archetypeSelect) {
      archetypeSelect.destroy();
      archetypeSelect = null;
    }
  }

  function mountLevelSelect(mount) {
    const options = [];
    for (let n = 1; n <= 20; n += 1) {
      options.push({ value: String(n), text: `Nivel ${n}` });
    }

    levelSelect = new CustomSelect({
      id: 'class-level-select',
      name: 'classLevel',
      className: 'custom-select--compact',
      value: String(state.classLevel),
      options,
      onChange: (value) => {
        let n = Number(value);
        if (!Number.isFinite(n)) n = 1;
        n = Math.min(20, Math.max(1, Math.round(n)));
        state.classLevel = n;
        state.selectedSpellId = null;
        // Sin favorito: bajar de nivel borra arquetipo. Con favorito solo se oculta en UI.
        syncArchetypeFromStorage({
          clearIfBelow: !state.isFavorite,
        });
        persistFavoriteIfNeeded();
        refreshProgression().then(() => {
          renderDetail();
          renderClassList();
        });
      },
    });

    mount.appendChild(levelSelect.getElement());
  }

  /**
   * Selector de arquetipo dentro de la card de rasgo.
   * @param {HTMLElement} mount
   */
  function mountArchetypeSelect(mount) {
    const archetypes = getClassArchetypes(state.classDetail);
    const options = archetypes.map((a) => ({
      value: a.id,
      text: a.name || a.id,
    }));

    archetypeSelect = new CustomSelect({
      id: 'class-archetype-select',
      name: 'classArchetype',
      placeholder: 'Elegir…',
      value: state.selectedArchetypeId || '',
      options,
      onChange: (value) => {
        if (!value) {
          state.selectedArchetypeId = null;
          persistArchetypeSelection(null);
        } else {
          state.selectedArchetypeId = value;
          persistArchetypeSelection(value);
        }
        state.selectedSpellId = null;
        persistFavoriteIfNeeded();
        refreshProgression().then(() => {
          renderDetail();
        });
      },
    });

    mount.appendChild(archetypeSelect.getElement());
  }

  /**
   * Card fija del rasgo selector_arquetipo (visible si nivel ≥ umbral).
   * Colapsada si ya hay arquetipo; abierta si aún no.
   * @param {object} selectorFeat
   * @param {string|null} archName
   * @returns {string}
   */
  function archetypeSelectorCardHtml(selectorFeat, archName) {
    const hasSelection = !!state.selectedArchetypeId;
    const openAttr = hasSelection ? '' : ' open';
    const desc = selectorFeat.description
      ? `<p class="class-feature__desc">${selectorFeat.description}</p>`
      : '';
    const chosenBadge = archName
      ? `<span class="spells-badge">${archName}</span>`
      : '';

    return `
      <details class="class-feature class-feature--archetype"${openAttr}>
        <summary class="class-feature__summary">
          <span class="class-feature__name">${
            selectorFeat.name || selectorFeat.id
          }</span>
          ${chosenBadge}
          <span class="spells-badge">Nivel ${selectorFeat.level ?? '—'}</span>
        </summary>
        <div class="class-feature__body">
          ${desc}
          <div id="class-archetype-select-mount" class="class-feature__select"></div>
        </div>
      </details>`;
  }

  async function renderDetail() {
    destroySelects();

    if (!state.selectedClassId || !state.classDetail) {
      els.detail.innerHTML =
        '<div class="description-placeholder">Selecciona una clase para ver su información.</div>';
      els.selectedBar.hidden = true;
      els.selectedBarMeta.hidden = false;
      els.app.classList.remove('has-class-selection');
      return;
    }

    const cls = state.classDetail;
    els.app.classList.add('has-class-selection');
    els.selectedBar.hidden = false;
    els.selectedBarName.textContent = cls.name || cls.id;
    els.selectedBarMeta.textContent = '';
    els.selectedBarMeta.hidden = true;

    syncArchetypeFromStorage();
    await refreshProgression();

    const row = getProgressionRow();
    const maxSpell = row?.maxSpellLevel;
    const unlockLevel = getSpellcastingUnlockLevel();
    const showSpells = shouldShowClassSpellsSection();
    const archUnlock = getArchetypeUnlockLevel(cls);
    const showArchetype = archUnlock != null && state.classLevel >= archUnlock;

    let spellHint = 'Esta clase no lanza conjuros';
    if (unlockLevel != null) {
      if (state.classLevel < unlockLevel) {
        spellHint = `Lanzamiento de conjuros desde nivel ${unlockLevel}`;
      } else if (maxSpell != null) {
        spellHint = `Conjuros hasta nivel ${maxSpell}${
          row?.hasCantrips ? ' (+ trucos)' : ''
        }`;
      } else if (row?.hasCantrips) {
        spellHint = 'Trucos disponibles';
      } else if (showSpells) {
        spellHint = 'Sin espacios de conjuro a este nivel';
      }
    } else if (showArchetype && !state.selectedArchetypeId) {
      const sel = getArchetypeSelectorFeature(cls);
      if (sel) {
        spellHint = `Elige ${sel.name || 'arquetipo'} para ver rasgos adicionales`;
      }
    }

    const merged = getMergedFeatures(cls, state.selectedArchetypeId);
    const { current, previous } = partitionFeaturesByLevel(
      merged,
      state.classLevel
    );
    const spells = showSpells ? getClassSpellsForLevel() : [];
    if (!showSpells) {
      state.selectedSpellId = null;
      state.spellQuery = '';
      state.spellLevelFilter.clear();
    } else if (
      state.selectedSpellId &&
      !spells.some((s) => s.id === state.selectedSpellId)
    ) {
      state.selectedSpellId = null;
    }

    const archName = state.selectedArchetypeId
      ? findArchetype(cls, state.selectedArchetypeId)?.name
      : null;

    const selectorFeat = showArchetype
      ? getArchetypeSelectorFeature(cls)
      : null;
    const archetypeCardHtml = selectorFeat
      ? archetypeSelectorCardHtml(selectorFeat, archName)
      : '';

    const previousHtml =
      previous.length > 0
        ? `
        <details class="class-features-previous" ${
          state.previousFeaturesOpen ? 'open' : ''
        }>
          <summary class="class-features-previous__summary">
            Rasgos de niveles anteriores (${previous.length})
          </summary>
          <div class="class-features class-features--previous">
            ${featureCardsHtml(previous, { expanded: false })}
          </div>
        </details>`
        : '';

    const currentFeaturesHtml = current.length
      ? featureCardsHtml(current, { expanded: true })
      : '';
    const featuresInner =
      archetypeCardHtml || currentFeaturesHtml
        ? `${archetypeCardHtml}${currentFeaturesHtml}`
        : featureCardsHtml([], { expanded: true });

    const spellsSectionHtml = showSpells
      ? `<section class="class-detail__section class-spells-section" id="class-spells-section"></section>`
      : '';

    els.detail.innerHTML = `
      <div class="class-detail">
        <header class="class-detail__header">
          <div class="class-detail__title-row">
            <h3 class="class-detail__title">${cls.name || cls.id}</h3>
            <button
              type="button"
              class="class-favorite-btn${state.isFavorite ? ' is-active' : ''}"
              id="class-favorite-btn"
              title="${
                state.isFavorite ? 'Quitar de favoritos' : 'Guardar como favorito'
              }"
              aria-label="${
                state.isFavorite ? 'Quitar de favoritos' : 'Guardar como favorito'
              }"
              aria-pressed="${state.isFavorite ? 'true' : 'false'}"
            >
              <i data-lucide="${
                state.isFavorite ? 'star-check' : 'star'
              }"></i>
            </button>
          </div>
          <p class="class-detail__desc">${cls.description || ''}</p>
          <div class="class-detail__meta">
            <span class="spells-badge">Dado ${cls.hitDie || '—'}</span>
            <span class="spells-badge">${cls.primaryAbility || '—'}</span>
            ${
              cls.spellCasterType
                ? `<span class="spells-badge">${cls.spellCasterType}</span>`
                : ''
            }
            ${
              cls.spellcastingAbility
                ? `<span class="spells-badge">${cls.spellcastingAbility}</span>`
                : ''
            }
            ${
              archName
                ? `<span class="spells-badge">${archName}</span>`
                : ''
            }
          </div>
        </header>

        <div class="class-level-control">
          <label class="class-level-control__label" for="class-level-select">Nivel</label>
          <div id="class-level-select-mount"></div>
          <span class="class-level-control__hint" id="class-spell-hint">${spellHint}</span>
        </div>

        <section class="class-detail__section">
          <h4 class="class-detail__section-title">Rasgos de nivel ${
            state.classLevel
          }</h4>
          <div class="class-features">${featuresInner}</div>
          ${previousHtml}
        </section>

        ${spellsSectionHtml}
      </div>
    `;

    const levelMount = els.detail.querySelector('#class-level-select-mount');
    if (levelMount) mountLevelSelect(levelMount);

    const archMount = els.detail.querySelector('#class-archetype-select-mount');
    if (archMount) mountArchetypeSelect(archMount);

    const favBtn = els.detail.querySelector('#class-favorite-btn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        if (!state.selectedClassId) return;
        if (state.isFavorite) {
          state.isFavorite = false;
          clearClassFavorite(state.selectedClassId);
          clearArchetypeSelection(state.selectedClassId);
        } else {
          state.isFavorite = true;
          saveClassFavorite(state.selectedClassId, snapshotFavoriteState());
          persistArchetypeSelection(state.selectedArchetypeId);
        }
        renderDetail();
        renderClassList();
      });
    }

    const prevDetails = els.detail.querySelector('.class-features-previous');
    if (prevDetails) {
      prevDetails.addEventListener('toggle', () => {
        state.previousFeaturesOpen = prevDetails.open;
        persistFavoriteIfNeeded();
      });
    }

    if (showSpells) {
      syncSpellsPanel();
    } else if (spellsPanel) {
      spellsPanel.reset();
      spellsPanel = null;
    }

    // Iconos Lucide (favorito, barra, etc.) después de montar el DOM
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function syncSpellsPanel() {
    const spellsSection = els.detail.querySelector('#class-spells-section');
    if (!spellsSection || !shouldShowClassSpellsSection()) {
      if (spellsPanel) {
        spellsPanel.reset();
        spellsPanel = null;
      }
      return;
    }

    const spells = getClassSpellsForLevel();
    if (
      state.selectedSpellId &&
      !spells.some((s) => s.id === state.selectedSpellId)
    ) {
      state.selectedSpellId = null;
    }

    if (!spellsPanel || spellsPanel._sectionEl !== spellsSection) {
      spellsPanel = createClassSpellsPanelController({
        sectionEl: spellsSection,
        getSpells: () => getClassSpellsForLevel(),
        getMaxSpellLevel: () => getProgressionRow()?.maxSpellLevel ?? null,
        getHasCantrips: () => !!getProgressionRow()?.hasCantrips,
        getQuery: () => state.spellQuery,
        setQuery: (q) => {
          state.spellQuery = q;
          persistFavoriteIfNeeded();
        },
        levelFilter: state.spellLevelFilter,
        getSelectedSpellId: () => state.selectedSpellId,
        setSelectedSpellId: (id) => {
          state.selectedSpellId = id;
          persistFavoriteIfNeeded();
        },
        onLevelFilterChange: () => {
          persistFavoriteIfNeeded();
        },
        getSubtitle: () =>
          state.selectedArchetypeId
            ? findArchetype(state.classDetail, state.selectedArchetypeId)
                ?.name || null
            : null,
      });
      spellsPanel._sectionEl = spellsSection;
    }

    spellsPanel.sync();
  }

  async function selectClass(classId) {
    state.selectedClassId = classId;
    state.classProgression = null;
    state.progression = null;

    const hadFavorite = applyFavoriteOrDefaults(classId);
    if (!hadFavorite) {
      // Sin favorito: arranque limpio; el arquetipo se resuelve al subir de nivel.
      state.classLevel = 1;
      state.selectedArchetypeId = null;
      state.spellQuery = '';
      state.spellLevelFilter.clear();
      state.previousFeaturesOpen = false;
      state.selectedSpellId = null;
    }

    renderClassList();

    try {
      const [detail, progression] = await Promise.all([
        getClassById(classId),
        getClassProgression(classId).catch(() => ({
          classId,
          hasSpellProgression: false,
          byClassLevel: [],
        })),
      ]);
      state.classDetail = detail;
      state.classProgression = progression;
      state.progression = progression;

      if (hadFavorite) {
        const snap = loadClassFavorite(classId);
        const unlock = getArchetypeUnlockLevel(detail);
        const archId = snap?.archetypeId;
        if (archId && findArchetype(detail, archId)) {
          if (unlock != null && state.classLevel >= unlock) {
            state.selectedArchetypeId = archId;
            persistArchetypeSelection(archId);
          } else {
            state.selectedArchetypeId = null;
          }
        } else {
          state.selectedArchetypeId = null;
          clearArchetypeSelection(classId);
        }
      } else {
        clearArchetypeSelection(classId);
        state.selectedArchetypeId = null;
      }

      await refreshProgression();
    } catch (err) {
      console.error('[Atlas] Error cargando clase:', err);
      state.classDetail = null;
      state.classProgression = null;
      state.progression = null;
    }

    await renderDetail();
  }

  function clearSelection() {
    destroySelects();
    if (spellsPanel) {
      spellsPanel.reset();
      spellsPanel = null;
    }
    state.selectedClassId = null;
    state.classDetail = null;
    state.classProgression = null;
    state.progression = null;
    state.selectedArchetypeId = null;
    state.selectedSpellId = null;
    state.spellQuery = '';
    state.spellLevelFilter.clear();
    state.isFavorite = false;
    renderDetail();
    renderClassList();
  }

  async function load() {
    state.loading = true;
    state.error = null;
    renderClassList();

    try {
      const [classesRes, spellsRes, classSpellsRes] = await Promise.all([
        getClasses(),
        getAllSpells(),
        getClassSpells(),
      ]);
      state.classes = classesRes.classes;
      state.allSpells = spellsRes.spells;
      state.spellsById = new Map(spellsRes.spells.map((s) => [s.id, s]));
      const map = {};
      for (const [cid, ids] of Object.entries(classSpellsRes.byClass || {})) {
        map[cid] = new Set(ids);
      }
      state.classSpellMap = map;
      state.loading = false;
    } catch (err) {
      state.loading = false;
      state.error =
        err instanceof ApiError
          ? err.message
          : 'No se pudieron cargar las clases.';
      console.error('[Atlas] Error cargando clases:', err);
    }

    renderClassList();
    await renderDetail();
  }

  function bind() {
    els.search.addEventListener('input', () => {
      state.query = els.search.value;
      renderClassList();
    });
    els.selectedBar.addEventListener('click', clearSelection);
  }

  bind();

  return {
    load,
    /**
     * Abre una clase (p. ej. desde Rasgos activos para elegir arquetipo).
     * @param {string} classId
     * @param {{ classLevel?: number }} [opts]
     */
    async openClass(classId, opts = {}) {
      if (!classId) return;
      if (!state.classes.length) {
        await load();
      }
      await selectClass(classId);

      const preferred = Number(opts.classLevel);
      if (!Number.isFinite(preferred) || preferred < 1) return;

      const unlock = getArchetypeUnlockLevel(state.classDetail);
      if (unlock == null) return;
      if (state.selectedArchetypeId) return;

      const target = Math.min(20, Math.max(1, Math.floor(preferred)));
      if (target < unlock) return;
      if (state.classLevel >= unlock && state.classLevel === target) return;

      state.classLevel = Math.max(state.classLevel, target);
      persistFavoriteIfNeeded();
      await refreshProgression();
      await renderDetail();
    },
    show() {
      els.page.hidden = false;
      // Refrescar lista: favoritos pueden haber cambiado desde Recursos
      if (!state.loading && state.classes.length) {
        renderClassList();
      }
    },
    hide() {
      els.page.hidden = true;
    },
  };
}
