/**
 * Página Recursos — cards por clase, chip nivel +/-, añadir con +.
 */

import { CustomSelect } from '../ui/custom-select.js';
import { showToast } from '../ui/toast.js';
import { getClasses, getClassById } from '../api/classes-api.js';
import {
  getClassResources,
  getResourceClassIds,
} from '../api/resources-api.js';
import {
  listClassFavoriteIds,
  loadClassFavorite,
  saveClassFavorite,
  clearClassFavorite,
} from '../classes/class-favorites-storage.js';
import {
  getArchetypeUnlockLevel,
  getClassArchetypes,
} from '../classes/archetype-features.js';
import {
  loadResourcesState,
  saveResourcesState,
  newEntryId,
} from './resources-storage.js';
import { reconcileUsage, createFreshUsage } from './resource-model.js';

const GUERRERO_ARCHETYPE_TOAST =
  'Selecciona un arquetipo en esta tarjeta: los rasgos activos del guerrero dependen de él.';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.page
 * @param {(classId: string, opts?: { classLevel?: number }) => void|Promise<void>} [opts.onOpenClass]
 */
export function createResourcesPage({ page, onOpenClass }) {
  if (!page) {
    console.error('[Atlas] No se encontró #resources-page');
    return { show() {}, hide() {}, load() {} };
  }

  /** @type {object[]} clases con progresión disponible */
  let classes = [];
  /** @type {Set<string>} */
  let resourceClassIds = new Set();
  /** @type {object|null} */
  let classDetail = null;
  /** @type {Map<string, object>} classId → detalle */
  const classDetailCache = new Map();
  /** @type {Map<string, object[]>} entryId → resources */
  const resourcesByEntry = new Map();
  /** @type {Map<string, CustomSelect>} */
  const cardArchetypeSelects = new Map();

  let state = loadResourcesState();
  let mounted = false;

  /** @type {CustomSelect|null} */
  let favSelect = null;
  /** @type {CustomSelect|null} */
  let classSelect = null;
  /** @type {CustomSelect|null} */
  let levelSelect = null;
  /** @type {CustomSelect|null} */
  let archetypeSelect = null;

  function showArchetypeRequiredToast(classId, classLevel) {
    const name = classLabel(classId);
    showToast({
      type: 'warning',
      message: `${name} requiere un rasgo activo,`,
      action: {
        label: 'Actívalo aquí',
        onClick: () => {
          if (typeof onOpenClass === 'function') {
            onOpenClass(classId, { classLevel });
          }
        },
      },
    });
  }

  function persist() {
    saveResourcesState(state);
  }

  function classLabel(id) {
    return classes.find((c) => c.id === id)?.name || id || 'Clase';
  }

  async function ensureClassDetail(classId) {
    if (!classId) return null;
    if (classDetailCache.has(classId)) return classDetailCache.get(classId);
    if (classDetail?.id === classId) {
      classDetailCache.set(classId, classDetail);
      return classDetail;
    }
    const detail = await getClassById(classId);
    if (detail) classDetailCache.set(classId, detail);
    classDetail = detail;
    return detail;
  }

  function classNeedsArchetype(detail, level) {
    if (!detail) return false;
    const arches = getClassArchetypes(detail);
    if (arches.length === 0) return false;
    const unlock = getArchetypeUnlockLevel(detail);
    if (unlock == null) return false;
    return level >= unlock;
  }

  /**
   * Sincroniza nivel/arquetipo con favoritos.
   * Si no existía, lo crea marcado fromResources (efímero).
   * Si ya existía (Clases u otro), solo actualiza nivel/arquetipo y conserva el origen.
   */
  function syncFavoriteLevel(classId, classLevel, archetypeId) {
    if (!classId) return;
    const existing = loadClassFavorite(classId);
    if (existing) {
      saveClassFavorite(classId, {
        ...existing,
        classLevel,
        archetypeId:
          archetypeId !== undefined ? archetypeId : existing.archetypeId,
      });
      return;
    }
    saveClassFavorite(classId, {
      classLevel,
      archetypeId: archetypeId || null,
      spellQuery: '',
      spellLevels: [],
      previousFeaturesOpen: false,
      selectedSpellId: null,
      fromResources: true,
    });
  }

  /** Quita favorito efímero si ya no hay cards de esa clase. */
  function clearEphemeralFavoriteIfOrphaned(classId) {
    if (!classId) return;
    const stillTracked = state.entries.some((e) => e.classId === classId);
    if (stillTracked) return;
    const fav = loadClassFavorite(classId);
    if (fav?.fromResources) clearClassFavorite(classId);
  }

  async function fetchEntryResources(entry) {
    const data = await getClassResources({
      classId: entry.classId,
      level: entry.classLevel,
      archetypeId: entry.archetypeId,
      manualUses: entry.manualUses,
    });
    const resources = data.resources || [];
    entry.usage = reconcileUsage(resources, entry.usage);
    resourcesByEntry.set(entry.id, resources);
    return resources;
  }

  function mountShell() {
    page.innerHTML = `
      <div class="resources-page">
        <div class="resources-page__scroll">
          <header class="resources-page__header">
            <div class="resources-page__title-row">
              <h2 class="resources-page__title">Rasgos activos</h2>
              <button type="button" class="resources-add-btn" id="resources-add-btn" aria-label="Añadir clase">
                +
              </button>
            </div>
            <p class="resources-page__lead">
              Cada casilla es 1 punto o uso. Usa +/− para cambiar el nivel.
            </p>
          </header>
          <div id="resources-root" class="resources-root"></div>
        </div>
        <footer class="resources-page__footer">
          <button type="button" class="resources-btn resources-rest-btn" id="resources-rest-btn">
            Descanso
          </button>
        </footer>
      </div>
    `;

    page.querySelector('#resources-add-btn')?.addEventListener('click', () => {
      state.setupOpen = true;
      state.draft = {
        classId: null,
        classLevel: 1,
        archetypeId: null,
        favoritePick: '',
      };
      persist();
      render();
    });

    page.querySelector('#resources-rest-btn')?.addEventListener('click', () => {
      applyRest();
    });

    mounted = true;
  }

  function applyRest() {
    if (state.entries.length === 0) {
      showToast({ type: 'info', message: 'No hay usos que restaurar.' });
      return;
    }

    for (const entry of state.entries) {
      const resources = resourcesByEntry.get(entry.id) || [];
      entry.usage = createFreshUsage(resources);
    }
    persist();
    render();
    syncRestButton();
    showToast({ type: 'success', message: 'Usos restaurados.' });
  }

  function syncRestButton() {
    const btn = page.querySelector('#resources-rest-btn');
    if (!btn) return;
    btn.disabled = state.entries.length === 0;
  }

  function render() {
    const root = page.querySelector('#resources-root');
    if (!root) return;

    const parts = [];
    if (state.setupOpen || state.entries.length === 0) {
      parts.push('<div id="resources-setup-host"></div>');
    }
    parts.push('<div id="resources-cards-host" class="resources-cards"></div>');
    root.innerHTML = parts.join('');

    if (state.setupOpen || state.entries.length === 0) {
      state.setupOpen = true;
      renderSetup(page.querySelector('#resources-setup-host'));
    }

    renderCards(page.querySelector('#resources-cards-host'));
    syncRestButton();
  }

  function destroySelects() {
    [favSelect, classSelect, levelSelect, archetypeSelect].forEach((s) => {
      if (s) s.destroy();
    });
    favSelect = null;
    classSelect = null;
    levelSelect = null;
    archetypeSelect = null;
  }

  function destroyCardArchetypeSelects() {
    cardArchetypeSelects.forEach((s) => s.destroy());
    cardArchetypeSelects.clear();
  }

  function renderSetup(host) {
    if (!host) return;
    destroySelects();

    const favIds = listClassFavoriteIds().filter((id) =>
      resourceClassIds.has(id)
    );
    const showFavDropdown = favIds.length > 1;

    if (
      state.draft.classId &&
      !resourceClassIds.has(state.draft.classId)
    ) {
      state.draft.classId = null;
      state.draft.archetypeId = null;
      state.draft.favoritePick = '';
    }

    host.innerHTML = `
      <section class="resources-box" aria-label="Cargar rasgos activos">
        <h3 class="resources-box__title">Nueva clase</h3>
        ${
          showFavDropdown
            ? `<div id="resources-fav-mount" class="resources-setup__fav"></div>`
            : ''
        }
        <div class="resources-setup__row">
          <div id="resources-class-mount"></div>
          <div id="resources-level-mount"></div>
        </div>
        <div id="resources-archetype-row" class="resources-setup__archetype" hidden>
          <div id="resources-archetype-mount"></div>
        </div>
        <div class="resources-box__actions">
          <button type="button" class="resources-btn resources-btn--primary" id="resources-load-btn">
            Cargar
          </button>
          ${
            state.entries.length > 0
              ? `<button type="button" class="resources-btn resources-btn--ghost" id="resources-cancel-setup">Cancelar</button>`
              : ''
          }
        </div>
      </section>
    `;

    if (showFavDropdown) {
      favSelect = new CustomSelect({
        id: 'resources-fav',
        name: 'resourcesFav',
        options: [
          { value: '', text: 'Favorito (opcional)' },
          ...favIds.map((id) => ({
            value: id,
            text: classLabel(id),
          })),
        ],
        value: state.draft.favoritePick || '',
        className: 'resources-select',
        onChange: (value) => {
          state.draft.favoritePick = value || '';
          if (value) {
            const fav = loadClassFavorite(value);
            state.draft.classId = value;
            state.draft.classLevel = fav?.classLevel || 1;
            state.draft.archetypeId = fav?.archetypeId || null;
            if (classSelect) classSelect.setValue(value);
            if (levelSelect) levelSelect.setValue(String(state.draft.classLevel));
            refreshArchetypeRow();
          }
          persist();
        },
      });
      host
        .querySelector('#resources-fav-mount')
        ?.appendChild(favSelect.getElement());
    } else if (favIds.length === 1 && !state.draft.classId) {
      const only = favIds[0];
      const fav = loadClassFavorite(only);
      state.draft.classId = only;
      state.draft.classLevel = fav?.classLevel || 1;
      state.draft.archetypeId = fav?.archetypeId || null;
    }

    classSelect = new CustomSelect({
      id: 'resources-class',
      name: 'resourcesClass',
      options: [
        { value: '', text: 'Selecciona una clase' },
        ...classes.map((c) => ({ value: c.id, text: c.name })),
      ],
      value: state.draft.classId || '',
      className: 'resources-select',
      onChange: async (value) => {
        state.draft.classId = value || null;
        state.draft.archetypeId = null;
        state.draft.favoritePick = '';
        if (favSelect) favSelect.setValue('');
        persist();
        await refreshArchetypeRow();
      },
    });

    levelSelect = new CustomSelect({
      id: 'resources-level',
      name: 'resourcesLevel',
      options: Array.from({ length: 20 }, (_, i) => ({
        value: String(i + 1),
        text: `Nivel ${i + 1}`,
      })),
      value: String(state.draft.classLevel || 1),
      className: 'resources-select',
      onChange: (value) => {
        state.draft.classLevel = Math.min(
          20,
          Math.max(1, parseInt(value, 10) || 1)
        );
        persist();
        refreshArchetypeRow();
      },
    });

    host
      .querySelector('#resources-class-mount')
      ?.appendChild(classSelect.getElement());
    host
      .querySelector('#resources-level-mount')
      ?.appendChild(levelSelect.getElement());

    host.querySelector('#resources-load-btn')?.addEventListener('click', () => {
      onLoadClick();
    });
    host
      .querySelector('#resources-cancel-setup')
      ?.addEventListener('click', () => {
        state.setupOpen = false;
        persist();
        render();
      });

    refreshArchetypeRow();
  }

  async function refreshArchetypeRow() {
    const row = page.querySelector('#resources-archetype-row');
    const mount = page.querySelector('#resources-archetype-mount');
    if (!row || !mount) return;

    const classId = state.draft.classId;
    const level = state.draft.classLevel || 1;

    if (classId !== 'guerrero') {
      row.hidden = true;
      if (archetypeSelect) {
        archetypeSelect.destroy();
        archetypeSelect = null;
      }
      return;
    }

    let detail;
    try {
      detail = await ensureClassDetail(classId);
    } catch {
      row.hidden = true;
      return;
    }

    if (!classNeedsArchetype(detail, level)) {
      row.hidden = true;
      if (archetypeSelect) {
        archetypeSelect.destroy();
        archetypeSelect = null;
      }
      return;
    }

    const arches = getClassArchetypes(detail);
    row.hidden = false;
    if (archetypeSelect) archetypeSelect.destroy();
    archetypeSelect = new CustomSelect({
      id: 'resources-archetype',
      name: 'resourcesArchetype',
      options: [
        { value: '', text: 'Selecciona arquetipo' },
        ...arches.map((a) => ({ value: a.id, text: a.name || a.id })),
      ],
      value: state.draft.archetypeId || '',
      className: 'resources-select',
      onChange: (value) => {
        state.draft.archetypeId = value || null;
        persist();
      },
    });
    mount.innerHTML = '';
    mount.appendChild(archetypeSelect.getElement());
  }

  async function onLoadClick() {
    const classId = classSelect?.getValue() || state.draft.classId;
    const level = Math.min(
      20,
      Math.max(
        1,
        parseInt(levelSelect?.getValue() || state.draft.classLevel, 10) || 1
      )
    );

    if (!classId) {
      showToast({ type: 'warning', message: 'Selecciona una clase.' });
      return;
    }
    if (!resourceClassIds.has(classId)) {
      showToast({
        type: 'warning',
        message: 'Esa clase no tiene rasgos activos.',
      });
      return;
    }

    let detail;
    try {
      detail = await ensureClassDetail(classId);
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        message: 'No se pudo cargar la información de la clase.',
      });
      return;
    }

    const needsArchetype = classNeedsArchetype(detail, level);
    const fav = loadClassFavorite(classId);
    let archetypeId = null;

    if (classId === 'guerrero') {
      archetypeId =
        archetypeSelect?.getValue() ||
        state.draft.archetypeId ||
        fav?.archetypeId ||
        null;
      if (needsArchetype && !archetypeId) {
        showToast({ type: 'warning', message: GUERRERO_ARCHETYPE_TOAST });
        return;
      }
    } else if (needsArchetype) {
      if (!fav?.archetypeId) {
        showArchetypeRequiredToast(classId, level);
        return;
      }
      archetypeId = fav.archetypeId;
    } else {
      archetypeId = fav?.archetypeId || null;
    }

    const entry = {
      id: newEntryId(),
      classId,
      classLevel: level,
      archetypeId,
      manualUses: 3,
      usage: {},
    };

    try {
      await fetchEntryResources(entry);
      state.entries.push(entry);
      state.setupOpen = false;
      state.draft = {
        classId: null,
        classLevel: 1,
        archetypeId: null,
        favoritePick: '',
      };
      syncFavoriteLevel(classId, level, archetypeId);
      persist();
      render();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        message: err?.message || 'No se pudieron cargar los rasgos activos.',
      });
    }
  }

  function renderCards(host) {
    if (!host) return;
    destroyCardArchetypeSelects();

    if (state.entries.length === 0) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = state.entries
      .map((entry) => {
        const resources = resourcesByEntry.get(entry.id) || [];
        const body =
          resources.length === 0
            ? `<p class="resources-empty">Sin rasgos activos a este nivel.</p>`
            : resources
                .map((res) => renderResourceBlock(entry, res))
                .join('');

        const archMount =
          entry.classId === 'guerrero'
            ? `<div class="resources-session__archetype" data-card-archetype-mount="${entry.id}"></div>`
            : '';

        return `
          <section class="resources-box resources-box--session" data-entry-id="${entry.id}">
            <button type="button" class="resources-remove-btn" data-remove-entry="${entry.id}" aria-label="Quitar">
              <i data-lucide="x"></i>
            </button>
            <header class="resources-session__header">
              <h3 class="resources-session__title">${classLabel(entry.classId)}</h3>
              <div class="resources-level-chip" aria-label="Nivel">
                <span class="resources-level-chip__label">Lvl ${entry.classLevel}</span>
                <button type="button" class="resources-level-chip__btn" data-level-delta="-1" data-entry-id="${entry.id}" aria-label="Bajar nivel">−</button>
                <button type="button" class="resources-level-chip__btn" data-level-delta="1" data-entry-id="${entry.id}" aria-label="Subir nivel">+</button>
              </div>
            </header>
            ${archMount}
            <div class="resources-session__body">${body}</div>
          </section>`;
      })
      .join('');

    host.querySelectorAll('[data-level-delta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-entry-id');
        const delta = Number(btn.getAttribute('data-level-delta'));
        changeEntryLevel(id, delta);
      });
    });

    host.querySelectorAll('[data-remove-entry]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-entry');
        const entry = state.entries.find((e) => e.id === id);
        const classId = entry?.classId;
        state.entries = state.entries.filter((e) => e.id !== id);
        resourcesByEntry.delete(id);
        clearEphemeralFavoriteIfOrphaned(classId);
        if (state.entries.length === 0) state.setupOpen = true;
        persist();
        render();
      });
    });

    bindSlotEvents(host);
    mountGuerreroCardArchetypes(host);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  async function mountGuerreroCardArchetypes(host) {
    const guerreroEntries = state.entries.filter((e) => e.classId === 'guerrero');
    if (guerreroEntries.length === 0) return;

    let detail;
    try {
      detail = await ensureClassDetail('guerrero');
    } catch {
      return;
    }
    const arches = getClassArchetypes(detail);
    const unlock = getArchetypeUnlockLevel(detail) ?? 3;

    for (const entry of guerreroEntries) {
      const mount = host.querySelector(
        `[data-card-archetype-mount="${entry.id}"]`
      );
      if (!mount) continue;

      if (entry.classLevel < unlock) {
        mount.hidden = true;
        mount.innerHTML = '';
        continue;
      }

      mount.hidden = false;
      const select = new CustomSelect({
        id: `resources-card-arch-${entry.id}`,
        name: `resourcesCardArch-${entry.id}`,
        options: [
          { value: '', text: 'Selecciona arquetipo' },
          ...arches.map((a) => ({ value: a.id, text: a.name || a.id })),
        ],
        value: entry.archetypeId || '',
        className: 'resources-select',
        onChange: (value) => {
          changeEntryArchetype(entry.id, value || null);
        },
      });
      mount.innerHTML = '';
      mount.appendChild(select.getElement());
      cardArchetypeSelects.set(entry.id, select);
    }
  }

  async function changeEntryArchetype(entryId, archetypeId) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    entry.archetypeId = archetypeId;
    entry.usage = {};
    try {
      await fetchEntryResources(entry);
      syncFavoriteLevel(entry.classId, entry.classLevel, entry.archetypeId);
      persist();
      render();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        message: 'No se pudo actualizar el arquetipo.',
      });
    }
  }

  async function changeEntryLevel(entryId, delta) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const next = Math.min(20, Math.max(1, entry.classLevel + delta));
    if (next === entry.classLevel) return;

    if (entry.classId === 'guerrero') {
      let detail;
      try {
        detail = await ensureClassDetail('guerrero');
      } catch {
        detail = null;
      }
      const unlock = getArchetypeUnlockLevel(detail) ?? 3;
      if (next >= unlock && !entry.archetypeId) {
        entry.classLevel = next;
        persist();
        render();
        showToast({ type: 'warning', message: GUERRERO_ARCHETYPE_TOAST });
        return;
      }
    } else if (!entry.archetypeId) {
      try {
        const detail = await ensureClassDetail(entry.classId);
        if (classNeedsArchetype(detail, next)) {
          const fav = loadClassFavorite(entry.classId);
          if (fav?.archetypeId) {
            entry.archetypeId = fav.archetypeId;
          } else {
            showArchetypeRequiredToast(entry.classId, next);
          }
        }
      } catch {
        /* ignore */
      }
    }

    entry.classLevel = next;
    try {
      await fetchEntryResources(entry);
      syncFavoriteLevel(entry.classId, entry.classLevel, entry.archetypeId);
      persist();
      render();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        message: 'No se pudo actualizar el nivel.',
      });
    }
  }

  function bindSlotEvents(root) {
    root.querySelectorAll('[data-points-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        togglePoint(
          btn.getAttribute('data-entry-id'),
          btn.getAttribute('data-resource-id'),
          Number(btn.getAttribute('data-index'))
        );
      });
    });
    root.querySelectorAll('[data-slot-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleSpellSlot(
          btn.getAttribute('data-entry-id'),
          btn.getAttribute('data-level'),
          Number(btn.getAttribute('data-index'))
        );
      });
    });
    root.querySelectorAll('[data-arcanum-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleArcanum(
          btn.getAttribute('data-entry-id'),
          btn.getAttribute('data-spell-level')
        );
      });
    });
    root.querySelectorAll('[data-manual-uses]').forEach((input) => {
      input.addEventListener('change', () => {
        const entryId = input.getAttribute('data-entry-id');
        const raw = parseInt(/** @type {HTMLInputElement} */ (input).value, 10);
        changeManualUses(entryId, raw);
      });
    });
  }

  async function changeManualUses(entryId, raw) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const next = Math.min(20, Math.max(1, Number.isFinite(raw) ? raw : 3));
    entry.manualUses = next;
    try {
      await fetchEntryResources(entry);
      persist();
      render();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        message: 'No se pudo actualizar la cantidad de usos.',
      });
    }
  }

  function renderResourceBlock(entry, res) {
    const eid = entry.id;
    if (res.kind === 'spellSlots') {
      const usage = entry.usage?.spells || {};
      const rows = (res.levels || [])
        .map((lv) => {
          const key = String(lv.spellLevel);
          const flags = Array.isArray(usage[key])
            ? usage[key]
            : Array.from({ length: lv.count }, () => false);
          const cells = flags
            .map(
              (consumed, i) => `
              <button type="button" class="resources-slot-btn${consumed ? ' is-consumed' : ''}"
                data-slot-toggle data-entry-id="${eid}" data-level="${key}" data-index="${i}">${i + 1}</button>`
            )
            .join('');
          return `
            <div class="resources-slot-row">
              <span class="resources-slot-label">Lvl ${lv.spellLevel}</span>
              <div class="resources-slot-cells">${cells}</div>
            </div>`;
        })
        .join('');
      return `
        <div class="resources-block">
          <h4 class="resources-block__title">${res.label}</h4>
          <div class="resources-slots">${rows}</div>
        </div>`;
    }

    if (res.kind === 'arcanum') {
      const map = entry.usage?.[res.id] || {};
      const items = (res.entries || [])
        .map((e) => {
          const key = String(e.spellLevel);
          const used = !!map[key];
          return `<button type="button" class="resources-slot-btn resources-slot-btn--wide${used ? ' is-consumed' : ''}"
            data-arcanum-toggle data-entry-id="${eid}" data-spell-level="${key}">Lvl ${e.spellLevel}</button>`;
        })
        .join('');
      return `
        <div class="resources-block">
          <h4 class="resources-block__title">${res.label}</h4>
          <div class="resources-slot-cells">${items}</div>
        </div>`;
    }

    if (res.infinite) {
      return `
        <div class="resources-block">
          <h4 class="resources-block__title">${res.label}</h4>
          <p class="resources-card__note">∞ usos</p>
        </div>`;
    }

    const flags = Array.isArray(entry.usage?.[res.id])
      ? entry.usage[res.id]
      : Array.from({ length: res.count }, () => false);
    const available = flags.filter((c) => !c).length;
    const manualField = res.usesManual
      ? `<label class="resources-manual-uses">
            <span class="resources-manual-uses__text">Usos</span>
            <input class="resources-manual-uses__input" type="number" min="1" max="20"
              value="${entry.manualUses}" data-manual-uses data-entry-id="${eid}"
              aria-label="Cantidad de usos" />
          </label>`
      : '';
    const cells = flags
      .map(
        (consumed, i) => `
        <button type="button" class="resources-slot-btn${consumed ? ' is-consumed' : ''}"
          data-points-toggle data-entry-id="${eid}" data-resource-id="${res.id}" data-index="${i}">${i + 1}</button>`
      )
      .join('');

    return `
      <div class="resources-block">
        <div class="resources-block__head">
          <h4 class="resources-block__title">${res.label}</h4>
          ${manualField}
          <span class="resources-card__count">${available} / ${res.count}</span>
        </div>
        <div class="resources-slot-cells">${cells}</div>
      </div>`;
  }

  function togglePoint(entryId, resourceId, index) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const row = Array.isArray(entry.usage[resourceId])
      ? [...entry.usage[resourceId]]
      : [];
    if (index < 0 || index >= row.length) return;
    row[index] = !row[index];
    entry.usage = { ...entry.usage, [resourceId]: row };
    persist();
    render();
  }

  function toggleSpellSlot(entryId, levelKey, index) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const slots = { ...(entry.usage.spells || {}) };
    const row = Array.isArray(slots[levelKey]) ? [...slots[levelKey]] : [];
    if (index < 0 || index >= row.length) return;
    row[index] = !row[index];
    slots[levelKey] = row;
    entry.usage = { ...entry.usage, spells: slots };
    persist();
    render();
  }

  function toggleArcanum(entryId, spellLevel) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const id = 'arcanum_mistico';
    const map = { ...(entry.usage[id] || {}) };
    map[spellLevel] = !map[spellLevel];
    entry.usage = { ...entry.usage, [id]: map };
    persist();
    render();
  }

  async function load() {
    if (!mounted) mountShell();
    state = loadResourcesState();

    try {
      const [classesRes, ids] = await Promise.all([
        getClasses(),
        getResourceClassIds(),
      ]);
      resourceClassIds = new Set(ids);
      classes = (classesRes.classes || []).filter((c) =>
        resourceClassIds.has(c.id)
      );
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: 'No se pudieron cargar las clases.' });
      classes = [];
      resourceClassIds = new Set();
    }

    // Descarta entries sin progresión (evita 404 en cards viejas)
    const kept = [];
    for (const entry of state.entries) {
      if (!resourceClassIds.has(entry.classId)) {
        resourcesByEntry.delete(entry.id);
        continue;
      }
      kept.push(entry);
    }
    state.entries = kept;

    await Promise.all(
      state.entries.map(async (entry) => {
        try {
          await fetchEntryResources(entry);
          syncFavoriteLevel(
            entry.classId,
            entry.classLevel,
            entry.archetypeId
          );
        } catch (err) {
          console.error(err);
          resourcesByEntry.set(entry.id, []);
        }
      })
    );

    if (state.entries.length === 0) state.setupOpen = true;
    persist();
    render();
  }

  return {
    load,
    show() {
      page.hidden = false;
      page.removeAttribute('hidden');
    },
    hide() {
      page.hidden = true;
    },
  };
}
