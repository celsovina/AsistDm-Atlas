/**
 * Conjuros activos — resumen por clase lanzadora favorita de los conjuros que el
 * jugador ha marcado con la estrella en la ficha de clase.
 *
 * Una tarjeta por clase favorita lanzadora: contadores (rojo al pasarse del
 * límite, sin bloquear), lista de conjuros agrupada por nivel y, para el mago,
 * grimorio + preparados. Al pulsar un conjuro se abre su detalle (igual que en
 * los demás catálogos).
 */

import { getClasses, getClassById } from '../api/classes-api.js';
import { getClassProgression } from '../api/progression-api.js';
import { getClassSpells } from '../api/class-spells-api.js';
import { getAllSpells } from '../api/spells-api.js';
import { renderSpellDetail, spellLevelBadge } from '../spells/spell-detail.js';
import { schoolColor } from '../spells/spell-schools.js';
import {
  listClassFavoriteIds,
  loadClassFavorite,
} from '../classes/class-favorites-storage.js';
import {
  getSpellbook,
  updateSpellbook,
  togglePrepared,
  toggleFavorite,
} from '../classes/class-spellbook-storage.js';
import {
  resolveCasterType,
  needsAbilityMod,
  hasGrimoire,
  cantripLimit,
  spellLimit,
  defaultGrimoireSize,
} from '../classes/spellcasting-limits.js';
import { resolveProgressionClassId } from '../classes/spellcasting-source.js';
import {
  spellSlotUsage,
  ensureResourceEntry,
  consumeSpellSlot,
} from '../resources/resources-storage.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function refreshIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.page
 * @param {(classId: string, opts?: object) => void} [opts.onOpenClass]
 * @param {(classId: string, slot: object) => void} [opts.onOpenResources]
 */
export function createActiveSpellsPage({ page, onOpenClass, onOpenResources }) {
  if (!page) {
    return { show() {}, hide() {}, load() {} };
  }

  const state = {
    mounted: false,
    loading: false,
    error: null,
    /** @type {Map<string, object>} classId → detalle */
    classDetail: new Map(),
    /** @type {Map<string, object[]>} progId → byClassLevel */
    progression: new Map(),
    /** @type {Map<string, object>} id → conjuro */
    spellsById: new Map(),
    /** @type {Record<string, Set<string>>} listId → ids de la lista de clase */
    classSpellIds: {},
    classes: [],
    /** conjuro abierto en detalle */
    selectedSpellId: null,
  };

  /* ---------------------------------------------------------------- */

  function classLabel(id) {
    return state.classes.find((c) => c.id === id)?.name || id;
  }

  function progRow(progId, level) {
    const rows = state.progression.get(progId) || [];
    return rows.find((r) => r.classLevel === level) || null;
  }

  /** Clases favoritas que lanzan conjuros. */
  function casterFavorites() {
    const out = [];
    for (const classId of listClassFavoriteIds()) {
      const fav = loadClassFavorite(classId);
      if (!fav) continue;
      const detail = state.classDetail.get(classId);
      const casterType = resolveCasterType(detail, fav.archetypeId);
      if (!casterType) continue;
      out.push({
        classId,
        archetypeId: fav.archetypeId || null,
        classLevel: fav.classLevel || 1,
        casterType,
        detail,
      });
    }
    out.sort((a, b) => classLabel(a.classId).localeCompare(classLabel(b.classId), 'es'));
    return out;
  }

  function spellObjs(ids) {
    return ids
      .map((id) => state.spellsById.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        const l = (a.level ?? 0) - (b.level ?? 0);
        return l !== 0 ? l : (a.name || '').localeCompare(b.name || '', 'es');
      });
  }


  /* ---------------------------------------------------------------- *
   *  Carga
   * ---------------------------------------------------------------- */

  async function ensureClassData(classId, archetypeId) {
    if (!state.classDetail.has(classId)) {
      try {
        state.classDetail.set(classId, await getClassById(classId));
      } catch {
        state.classDetail.set(classId, null);
      }
    }
    const detail = state.classDetail.get(classId);
    const classProg = state.progression.has(classId)
      ? state.progression.get(classId)
      : null;

    if (!state.progression.has(classId)) {
      try {
        const p = await getClassProgression(classId);
        state.progression.set(classId, p.byClassLevel || []);
      } catch {
        state.progression.set(classId, []);
      }
    }

    const hasProg = (state.progression.get(classId) || []).length > 0;
    const progId = resolveProgressionClassId(classId, archetypeId, hasProg);
    if (progId !== classId && !state.progression.has(progId)) {
      try {
        const p = await getClassProgression(progId);
        state.progression.set(progId, p.byClassLevel || []);
      } catch {
        state.progression.set(progId, []);
      }
    }
    void classProg;
    void detail;
  }

  async function load() {
    if (!state.mounted) mountShell();
    state.loading = true;
    state.error = null;
    state.selectedSpellId = null;
    render();

    try {
      const [classesRes, spellsRes, classSpellsRes] = await Promise.all([
        getClasses(),
        getAllSpells(),
        getClassSpells(),
      ]);
      state.classes = classesRes.classes || [];
      state.spellsById = new Map((spellsRes.spells || []).map((s) => [s.id, s]));
      const map = {};
      for (const [cid, ids] of Object.entries(classSpellsRes.byClass || {})) {
        map[cid] = new Set(ids);
      }
      state.classSpellIds = map;

      // Detalle + progresión de cada clase favorita
      for (const classId of listClassFavoriteIds()) {
        const fav = loadClassFavorite(classId);
        await ensureClassData(classId, fav?.archetypeId || null);
      }
      state.loading = false;
    } catch (err) {
      console.error('[Atlas] Conjuros activos:', err);
      state.loading = false;
      state.error = 'No se pudieron cargar los datos.';
    }
    render();
  }

  /* ---------------------------------------------------------------- *
   *  Render
   * ---------------------------------------------------------------- */

  function mountShell() {
    page.innerHTML = `
      <div class="active-spells-page">
        <div class="active-spells-page__scroll">
          <header class="active-spells-page__header">
            <h2 class="active-spells-page__title">Conjuros activos</h2>
            <p class="active-spells-page__lead">
              Los conjuros que has seleccionado para tu uso.
            </p>
          </header>
          <div id="active-spells-root" class="active-spells-root"></div>
        </div>
      </div>
    `;
    state.mounted = true;
  }

  function render() {
    const root = page.querySelector('#active-spells-root');
    if (!root) return;

    if (state.loading) {
      root.innerHTML =
        '<div class="description-placeholder">Cargando…</div>';
      return;
    }
    if (state.error) {
      root.innerHTML = `<div class="description-placeholder">${esc(state.error)}</div>`;
      return;
    }

    if (state.selectedSpellId) {
      renderDetail(root);
      return;
    }

    const favs = casterFavorites();

    if (!favs.length) {
      root.innerHTML = `
        <div class="active-spells-empty">
          <p>No hay ninguna clase lanzadora marcada como favorita.</p>
          <button type="button" class="resources-btn resources-btn--primary asp-go-classes" data-class="">
            Ir a Clases
          </button>
        </div>`;
      root.querySelector('.asp-go-classes')?.addEventListener('click', () => {
        onOpenClass?.(null);
      });
    } else {
      root.innerHTML = favs.map((f) => cardHtml(f)).join('');
      favs.forEach((f) => wireCard(root, f));
      root.querySelectorAll('.asp-card__open').forEach((btn) => {
        btn.addEventListener('click', () => {
          const lvl = Number(btn.dataset.level);
          onOpenClass?.(
            btn.dataset.class,
            Number.isFinite(lvl) ? { classLevel: lvl } : {}
          );
        });
      });
    }
    refreshIcons();
  }

  function pill(label, count, cap, over) {
    if (count === 0 && cap === 0) return '';
    const capTxt = cap != null ? `/${cap}` : '';
    return `<span class="asp-pill${over ? ' is-over' : ''}">
      ${esc(label)} <b>${count}${capTxt}</b></span>`;
  }

  function cardHtml(f) {
    const book = getSpellbook(f.classId);
    if (!book) return '';
    const row = progRow(
      resolveProgressionClassId(
        f.classId,
        f.archetypeId,
        (state.progression.get(f.classId) || []).length > 0
      ),
      f.classLevel
    );
    f.row = row;

    const cLimit = cantripLimit(row);
    const sLimit = spellLimit({
      casterType: f.casterType,
      classId: f.classId,
      classLevel: f.classLevel,
      progressionRow: row,
      abilityMod: book.abilityMod,
    });

    const grimoireSpells = book.grimoires.flatMap((g) => g.spellIds);

    let pills;
    if (hasGrimoire(f.casterType)) {
      pills = [
        pill('Trucos', book.cantrips.length, cLimit, book.cantrips.length > cLimit),
        pill('Grimorio', grimoireSpells.length, null, false),
        pill(
          'Preparados',
          book.prepared.length,
          sLimit.value,
          sLimit.value != null && book.prepared.length > sLimit.value
        ),
      ];
    } else {
      pills = [
        pill('Trucos', book.cantrips.length, cLimit, book.cantrips.length > cLimit),
        pill(
          'Conjuros',
          book.spells.length,
          sLimit.value,
          sLimit.value != null && book.spells.length > sLimit.value
        ),
      ];
    }
    if (book.extraUnlocked) {
      pills.push(pill('Otros orígenes', book.extra.length, null, false));
    }

    const modHtml = needsAbilityMod(f.casterType)
      ? `<label class="asp-mod" title="Modificador de característica lanzadora">
           <span>Mod.</span>
           <input type="number" class="asp-mod__input" data-class="${f.classId}"
             value="${book.abilityMod ?? ''}" placeholder="0" inputmode="numeric" />
         </label>`
      : '';

    let body;
    if (hasGrimoire(f.casterType)) {
      body = `
        ${listSection('Trucos', spellObjs(book.cantrips), f)}
        ${grimoireSection(f, book)}
        ${preparedSection(f, book)}`;
    } else {
      body = listSection(null, spellObjs([...book.cantrips, ...book.spells]), f);
    }
    if (book.extra.length) {
      body += extraSection(f, book);
    }

    return `
      <div class="asp-card-wrap" data-class="${f.classId}">
        <div class="asp-card-open-row">
          <button type="button" class="atlas-icon-btn asp-card__open"
            data-class="${f.classId}" data-level="${f.classLevel}"
            title="Ir a la ficha de la clase" aria-label="Ir a la ficha de la clase">
            <i data-lucide="square-arrow-out-up-right"></i>
          </button>
        </div>
        <section class="asp-card" data-class="${f.classId}">
          <header class="asp-card__header">
            <h3 class="asp-card__title">${esc(classLabel(f.classId))}</h3>
            ${modHtml}
            <span class="asp-card__level spells-badge">Nivel ${f.classLevel}</span>
          </header>
          <div class="asp-card__pills">${pills.join('')}</div>
          <div class="asp-card__body">${body || placeholder()}</div>
        </section>
      </div>`;
  }

  function placeholder() {
    return `<div class="description-placeholder">Aún no has marcado conjuros. Ábrelos en la ficha de la clase con la estrella.</div>`;
  }

  /** Niveles de espacio (nivel + cuenta) desde `minLevel` en adelante. */
  function slotLevels(f, minLevel) {
    const slots = f.row?.spellSlots || {};
    const out = [];
    for (let lvl = Math.max(1, minLevel || 1); lvl <= 9; lvl += 1) {
      const n = Number(slots[`level${lvl}`] || 0);
      if (n > 0) out.push({ lvl, count: n });
    }
    return out;
  }

  /** ¿Queda algún espacio libre de nivel ≥ `spellLevel` para lanzar el conjuro? */
  function hasFreeSlot(f, spellLevel) {
    const usage = spellSlotUsage(f.classId);
    return slotLevels(f, spellLevel).some(({ lvl, count }) => {
      const used = Array.isArray(usage[lvl]) ? usage[lvl] : [];
      for (let i = 0; i < count; i += 1) if (!used[i]) return true;
      return false;
    });
  }

  function slotsPanelHtml(f, sp) {
    const levels = slotLevels(f, sp.level ?? 1);
    if (!levels.length) {
      return `<div class="asp-slots"><span class="asp-slots__empty">Sin espacios de conjuro.</span></div>`;
    }
    const usage = spellSlotUsage(f.classId);
    const rows = levels
      .map(({ lvl, count }) => {
        const used = Array.isArray(usage[lvl]) ? usage[lvl] : [];
        const cells = Array.from({ length: count }, (_, i) => {
          const consumed = !!used[i];
          return `<button type="button" class="asp-slot-btn${
            consumed ? ' is-consumed' : ''
          }" ${consumed ? 'disabled' : ''} data-class="${f.classId}"
            data-level="${lvl}" data-index="${i}" data-count="${count}">${i + 1}</button>`;
        }).join('');
        return `
        <div class="asp-slot-row">
          <span class="asp-slot-row__label">Nivel ${lvl}</span>
          <span class="asp-slot-row__cells">${cells}</span>
        </div>`;
      })
      .join('');
    return `<div class="asp-slots">${rows}</div>`;
  }

  function spellRowHtml(sp, f, opts = {}) {
    const { orphan = false, prepared = null } = opts;
    const lvl = sp.level ?? 0;
    const prep =
      prepared === null
        ? ''
        : `<button type="button" class="asp-prep-btn${prepared ? ' is-on' : ''}"
             data-spell="${sp.id}" data-class="${f.classId}" aria-pressed="${prepared ? 'true' : 'false'}"
             title="${prepared ? 'Quitar de preparados' : 'Preparar'}"
             aria-label="${prepared ? 'Quitar de preparados' : 'Preparar'}">
             <i data-lucide="${prepared ? 'book-open-check' : 'book-open'}"></i>
           </button>`;
    const canUse = lvl >= 1 && hasFreeSlot(f, lvl);
    const use =
      lvl >= 1
        ? `<button type="button" class="asp-row__use" data-spell="${sp.id}"
             aria-expanded="false" ${canUse ? '' : 'disabled'}
             title="${canUse ? 'Usar un espacio de conjuro' : 'Sin espacios de conjuro disponibles'}">Usar</button>`
        : '';
    return `
      <div class="asp-row-wrap" data-spell="${sp.id}">
        <div class="spells-list-item asp-row${orphan ? ' asp-row--orphan' : ''}"
          data-spell="${sp.id}" style="--school-color:${schoolColor(sp.school)}" title="${esc(sp.school || '')}">
          ${prep}
          <button type="button" class="asp-row__body" data-spell="${sp.id}">
            <span class="spells-list-item__name">${esc(sp.name || sp.id)}</span>
            <span class="spells-list-item__meta">
              <span class="spells-badge">${spellLevelBadge(sp.level)}</span>
            </span>
          </button>
          ${use}
          <button type="button" class="asp-row__remove" data-spell="${sp.id}" data-class="${f.classId}"
            title="Quitar" aria-label="Quitar de mis conjuros"><i data-lucide="x"></i></button>
        </div>
        ${lvl >= 1 ? `<div class="asp-row-slots" data-spell="${sp.id}" hidden>${slotsPanelHtml(f, sp)}</div>` : ''}
      </div>`;
  }

  /**
   * @param {(sp:object)=>string} rowFn
   */
  function rowsHtml(spells, f, rowOpts) {
    return spells
      .map((sp) =>
        spellRowHtml(
          sp,
          f,
          typeof rowOpts === 'function' ? rowOpts(sp) : rowOpts || {}
        )
      )
      .join('');
  }

  function section(title, inner) {
    return `<div class="asp-section"><h4 class="asp-section__title">${esc(
      title
    )}</h4>${inner}</div>`;
  }

  /** A partir de 10 conjuros, la lista scrollea; si no, altura natural. */
  const SCROLL_AT = 10;
  function scrollList(inner, count) {
    return `<div class="asp-scroll-list atlas-scroll${
      count > SCROLL_AT ? ' is-scroll' : ''
    }">${inner}</div>`;
  }

  /** Lista plana ordenada por nivel; el nivel se ve en la pill de cada fila. */
  function listSection(title, spells, f, rowOpts) {
    if (!spells.length) return '';
    const inner = scrollList(rowsHtml(spells, f, rowOpts), spells.length);
    return title ? section(title, inner) : inner;
  }

  function grimoireSection(f, book) {
    const spells = spellObjs(book.grimoires.flatMap((g) => g.spellIds));
    if (!spells.length) {
      return section('Grimorio', '<div class="description-placeholder">Grimorio vacío.</div>');
    }
    const prepared = new Set(book.prepared);
    return section(
      'Grimorio',
      scrollList(
        rowsHtml(spells, f, (sp) => ({ prepared: prepared.has(sp.id) })),
        spells.length
      )
    );
  }

  function preparedSection(f, book) {
    const spells = spellObjs(book.prepared);
    if (!spells.length) {
      return section(
        'Preparados',
        '<div class="description-placeholder">Marca conjuros del grimorio para prepararlos.</div>'
      );
    }
    return section('Preparados', scrollList(rowsHtml(spells, f), spells.length));
  }

  function extraSection(f, book) {
    const spells = spellObjs(book.extra);
    const orphan = !book.extraUnlocked;
    return section(
      `Otros orígenes${orphan ? ' — sin confirmar' : ''}`,
      scrollList(rowsHtml(spells, f, { orphan }), spells.length)
    );
  }

  function wireCard(root, f) {
    const card = root.querySelector(`.asp-card[data-class="${f.classId}"]`);
    if (!card) return;

    card.querySelector('.asp-mod__input')?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      updateSpellbook(f.classId, (b) => {
        b.abilityMod = Number.isFinite(v) ? v : null;
      });
      render();
    });

    card.querySelectorAll('.asp-row__body').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedSpellId = btn.dataset.spell;
        render();
      });
    });

    card.querySelectorAll('.asp-row__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sp = state.spellsById.get(btn.dataset.spell);
        toggleFavorite(f.classId, btn.dataset.spell, {
          casterType: f.casterType,
          level: sp?.level ?? 0,
        });
        render();
      });
    });

    card.querySelectorAll('.asp-prep-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        togglePrepared(f.classId, btn.dataset.spell);
        render();
      });
    });

    card.querySelectorAll('.asp-row__use').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const panel = btn
          .closest('.asp-row-wrap')
          ?.querySelector('.asp-row-slots');
        if (!panel) return;
        const willOpen = panel.hidden;
        closeAllSlotPopovers();
        if (willOpen) openSlotPopover(btn, panel);
      });
    });

    card.querySelectorAll('.asp-slot-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const level = Number(btn.dataset.level);
        const index = Number(btn.dataset.index);
        const count = Number(btn.dataset.count);
        ensureResourceEntry(f.classId, {
          classLevel: f.classLevel,
          archetypeId: f.archetypeId,
        });
        const entryId = consumeSpellSlot(f.classId, level, index, count);
        closeAllSlotPopovers();
        onOpenResources?.(f.classId, { entryId, level, index });
      });
    });
  }

  function openSlotPopover(btn, panel) {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('is-open');
    // Posición: bajo el botón, alineado a su borde derecho, dentro del viewport.
    const r = btn.getBoundingClientRect();
    panel.style.visibility = 'hidden';
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left = Math.min(r.right - pw, window.innerWidth - pw - 12);
    left = Math.max(12, left);
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 6);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = '';
  }

  function closeAllSlotPopovers() {
    page.querySelectorAll('.asp-row-slots').forEach((p) => {
      p.hidden = true;
    });
    page.querySelectorAll('.asp-row__use.is-open').forEach((b) => {
      b.classList.remove('is-open');
      b.setAttribute('aria-expanded', 'false');
    });
  }

  function renderDetail(root) {
    const sp = state.spellsById.get(state.selectedSpellId);
    root.innerHTML = `
      <button type="button" class="atlas-selected-bar asp-back" id="asp-back">
        <span class="atlas-selected-bar__back" aria-hidden="true"><i data-lucide="chevron-left"></i></span>
        <span class="atlas-selected-bar__name">${esc(sp?.name || '—')}</span>
        <span class="spells-badge">${sp ? spellLevelBadge(sp.level) : ''}</span>
      </button>
      <div class="description-box asp-detail" id="asp-detail"></div>`;
    renderSpellDetail(root.querySelector('#asp-detail'), sp || null);
    root.querySelector('#asp-back').addEventListener('click', () => {
      state.selectedSpellId = null;
      render();
    });
    refreshIcons();
  }

  /* ---------------------------------------------------------------- */

  document.addEventListener('click', (e) => {
    if (page.hidden) return;
    if (!e.target.closest('.asp-row-slots') && !e.target.closest('.asp-row__use')) {
      closeAllSlotPopovers();
    }
  });
  page.addEventListener('scroll', () => closeAllSlotPopovers(), true);
  window.addEventListener('resize', () => closeAllSlotPopovers());

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
