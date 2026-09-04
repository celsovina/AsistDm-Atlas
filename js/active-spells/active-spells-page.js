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
 */
export function createActiveSpellsPage({ page, onOpenClass }) {
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
    } else {
      root.innerHTML = favs
        .map(
          (f) => `
          <div class="asp-card-wrap">
            ${cardHtml(f)}
            <button type="button" class="resources-btn resources-btn--primary asp-go-classes"
              data-class="${f.classId}" data-level="${f.classLevel}">
              Ir a Clases
            </button>
          </div>`
        )
        .join('');
      favs.forEach((f) => wireCard(root, f));
    }

    root.querySelectorAll('.asp-go-classes').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.class || null;
        const lvl = Number(btn.dataset.level);
        onOpenClass?.(cid, Number.isFinite(lvl) ? { classLevel: lvl } : {});
      });
    });
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
      <section class="asp-card" data-class="${f.classId}">
        <header class="asp-card__header">
          <h3 class="asp-card__title">${esc(classLabel(f.classId))}</h3>
          ${modHtml}
          <span class="asp-card__level spells-badge">Nivel ${f.classLevel}</span>
        </header>
        <div class="asp-card__pills">${pills.join('')}</div>
        <div class="asp-card__body">${body || placeholder()}</div>
      </section>`;
  }

  function placeholder() {
    return `<div class="description-placeholder">Aún no has marcado conjuros. Ábrelos en la ficha de la clase con la estrella.</div>`;
  }

  /** Niveles de espacio disponibles desde `minLevel` en adelante. */
  function slotLevels(f, minLevel) {
    const slots = f.row?.spellSlots || {};
    const out = [];
    for (let lvl = Math.max(1, minLevel || 1); lvl <= 9; lvl += 1) {
      const n = Number(slots[`level${lvl}`] || 0);
      if (n > 0) out.push({ lvl, count: n });
    }
    return out;
  }

  function slotsPanelHtml(f, sp) {
    const levels = slotLevels(f, sp.level ?? 1);
    if (!levels.length) {
      return `<div class="asp-slots"><span class="asp-slots__empty">Sin espacios de conjuro disponibles.</span></div>`;
    }
    const rows = levels
      .map(
        (l) => `
        <div class="asp-slot-row">
          <span class="asp-slot-row__label">Nivel ${l.lvl}</span>
          <span class="asp-slot-row__cells">
            ${Array.from(
              { length: l.count },
              (_, i) =>
                `<button type="button" class="asp-slot-btn" disabled>${i + 1}</button>`
            ).join('')}
          </span>
        </div>`
      )
      .join('');
    return `<div class="asp-slots">${rows}</div>`;
  }

  function spellRowHtml(sp, f, opts = {}) {
    const { orphan = false, prepared = null } = opts;
    const lvl = sp.level ?? 0;
    const prep =
      prepared === null
        ? ''
        : `<span class="atlas-switch atlas-switch--sm asp-prep" data-spell="${sp.id}" data-class="${f.classId}">
             <input type="checkbox" ${prepared ? 'checked' : ''} aria-label="Preparar" />
             <span class="switch-slider"></span>
           </span>`;
    const use =
      lvl >= 1
        ? `<button type="button" class="asp-row__use" data-spell="${sp.id}"
             aria-expanded="false" title="Usar un espacio de conjuro">Usar</button>`
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

  /** Lista plana ordenada por nivel; el nivel se ve en la pill de cada fila. */
  function listSection(title, spells, f, rowOpts) {
    if (!spells.length) return '';
    const inner = rowsHtml(spells, f, rowOpts);
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
      rowsHtml(spells, f, (sp) => ({ prepared: prepared.has(sp.id) }))
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
    return section('Preparados', rowsHtml(spells, f));
  }

  function extraSection(f, book) {
    const spells = spellObjs(book.extra);
    const orphan = !book.extraUnlocked;
    return section(
      `Otros orígenes${orphan ? ' — sin confirmar' : ''}`,
      rowsHtml(spells, f, { orphan })
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

    card.querySelectorAll('.asp-prep input').forEach((input) => {
      input.addEventListener('change', () => {
        const wrap = input.closest('.asp-prep');
        togglePrepared(f.classId, wrap.dataset.spell);
        render();
      });
    });

    card.querySelectorAll('.asp-row__use').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = btn
          .closest('.asp-row-wrap')
          ?.querySelector('.asp-row-slots');
        if (!panel) return;
        const open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('is-open', open);
      });
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
