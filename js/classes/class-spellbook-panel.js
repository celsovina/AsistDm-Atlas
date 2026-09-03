/**
 * "Mi lista de conjuros": selección manual por jugador y clase, limitada por la
 * cantidad que puede llevar según nivel/tipo de lanzador. Se guarda en la sesión
 * (Redis + espejo local) y queda abierta a llenarse dinámicamente más adelante.
 */

import { renderSpellDetail, spellLevelBadge } from '../spells/spell-detail.js';
import { getSection } from '../user/session.js';
import {
  getSpellbook,
  updateSpellbook,
  toggleSpell,
  spellbookId,
} from './class-spellbook-storage.js';
import {
  resolveCasterType,
  needsAbilityMod,
  hasGrimoire,
  cantripLimit,
  spellLimit,
  defaultGrimoireSize,
} from './spellcasting-limits.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.sectionEl
 * @param {() => string} opts.getClassId
 * @param {() => string|null} opts.getArchetypeId
 * @param {() => string|null} opts.getArchetypeName
 * @param {() => number} opts.getClassLevel
 * @param {() => object|null} opts.getClassDetail
 * @param {() => object|null} opts.getProgressionRow
 * @param {() => object[]} opts.getClassSpellPool  lista de clase disponible al nivel actual
 * @param {() => object[]} opts.getAllSpells
 * @param {() => boolean} opts.getCanCast  la clase/subclase lanza conjuros a este nivel
 */
export function createClassSpellbookPanelController(opts) {
  const {
    sectionEl,
    getClassId,
    getArchetypeId,
    getArchetypeName,
    getClassLevel,
    getClassDetail,
    getProgressionRow,
    getClassSpellPool,
    getAllSpells,
    getCanCast,
  } = opts;

  const ui = {
    bucket: 'spells',
    query: '',
    selectedSpellId: /** @type {string|null} */ (null),
  };

  let spellsById = new Map();

  function refreshSpellIndex() {
    const all = getAllSpells() || [];
    if (spellsById.size !== all.length) {
      spellsById = new Map(all.map((s) => [s.id, s]));
    }
  }

  function book() {
    return getSpellbook(getClassId());
  }

  function casterType() {
    return resolveCasterType(getClassDetail(), getArchetypeId());
  }

  /** Buckets visibles según tipo de lanzador y si hay "otros orígenes". */
  function availableBuckets(bk) {
    const ct = casterType();
    const list = [];
    if (getCanCast() && ct) {
      if (cantripLimit(getProgressionRow()) > 0 || bk.cantrips.length) {
        list.push('cantrips');
      }
      list.push('spells');
      if (hasGrimoire(ct)) list.push('grimoire');
    }
    if (bk?.extraUnlocked) list.push('extra');
    return list;
  }

  function bucketLabel(key) {
    return {
      cantrips: 'Trucos',
      spells: 'Conjuros',
      grimoire: 'Grimorio',
      extra: 'Otros',
    }[key];
  }

  /** Límite del bucket actual: { value:number|null, formula:string }. */
  function limitFor(key, bk) {
    const row = getProgressionRow();
    if (key === 'cantrips') {
      return { value: cantripLimit(row), formula: 'trucos por nivel de clase' };
    }
    if (key === 'grimoire') {
      const max =
        bk.grimoireMax != null
          ? bk.grimoireMax
          : defaultGrimoireSize(getClassLevel());
      return { value: max, formula: '6 al nivel 1, +2 por nivel (editable)' };
    }
    if (key === 'extra') {
      return { value: null, formula: 'sin límite' };
    }
    return spellLimit({
      casterType: casterType(),
      classId: getClassId(),
      classLevel: getClassLevel(),
      progressionRow: row,
      abilityMod: bk.abilityMod,
    });
  }

  /** Pool de conjuros elegibles para un bucket. */
  function poolFor(key, bk) {
    if (key === 'extra') return getAllSpells() || [];

    const classPool = getClassSpellPool() || [];
    if (key === 'cantrips') {
      return classPool.filter((s) => (s.level ?? 0) === 0);
    }
    if (key === 'grimoire') {
      return classPool.filter((s) => (s.level ?? 0) >= 1);
    }
    // 'spells': para el mago se preparan desde el grimorio; el resto, de la lista de clase
    if (hasGrimoire(casterType())) {
      return bk.grimoire
        .map((id) => spellsById.get(id))
        .filter(Boolean)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    }
    return classPool.filter((s) => (s.level ?? 0) >= 1);
  }

  function filterPool(pool) {
    const q = ui.query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.school || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q)
    );
  }

  /* ---------------------------------------------------------------- *
   *  Render
   * ---------------------------------------------------------------- */

  function render() {
    refreshSpellIndex();
    const bk = book();
    if (!bk) {
      sectionEl.innerHTML = '';
      return;
    }

    const ct = casterType();
    const isCaster = !!(getCanCast() && ct);

    // Ni lanzador ni "otros orígenes" activado: solo la casilla para activarlo.
    if (!isCaster && !bk.extraUnlocked) {
      sectionEl.className = 'class-detail__section class-spellbook-section class-spellbook-section--optin';
      sectionEl.innerHTML = `
        <label class="spellbook-config__toggle spellbook-optin">
          <input type="checkbox" id="spellbook-extra-toggle" />
          <span>Conjuros de otros orígenes (raza, dotes, objetos…)</span>
        </label>`;
      const t = sectionEl.querySelector('#spellbook-extra-toggle');
      t.addEventListener('change', () => {
        updateSpellbook(getClassId(), (b) => {
          b.extraUnlocked = t.checked;
        });
        ui.bucket = 'extra';
        render();
      });
      return;
    }

    const buckets = availableBuckets(bk);
    if (!buckets.includes(ui.bucket)) ui.bucket = buckets[0];
    const archName = getArchetypeName ? getArchetypeName() : null;
    const titleExtra = archName ? ` (${escapeHtml(archName)})` : '';

    const countsHtml = buckets
      .map((key) => {
        const lim = limitFor(key, bk);
        const count = bk[key].length;
        const over = lim.value != null && count > lim.value;
        const cap = lim.value != null ? `/${lim.value}` : '';
        return `
          <button type="button"
            class="spellbook-bucket${key === ui.bucket ? ' is-active' : ''}${over ? ' is-over' : ''}"
            data-bucket="${key}">
            <span class="spellbook-bucket__label">${bucketLabel(key)}</span>
            <span class="spellbook-bucket__count">${count}${cap}</span>
          </button>`;
      })
      .join('');

    const modHtml = needsAbilityMod(ct)
      ? `
        <label class="spellbook-config__field">
          <span>Mod. de característica</span>
          <input type="number" id="spellbook-mod" class="spellbook-config__input"
            value="${bk.abilityMod ?? ''}" placeholder="0" inputmode="numeric" />
        </label>`
      : '';

    const grimoireMaxHtml =
      hasGrimoire(ct)
        ? `
        <label class="spellbook-config__field">
          <span>Tamaño del grimorio</span>
          <input type="number" id="spellbook-grimoire-max" class="spellbook-config__input"
            min="0" value="${
              bk.grimoireMax ?? defaultGrimoireSize(getClassLevel())
            }" inputmode="numeric" />
        </label>`
        : '';

    const currentLimit = limitFor(ui.bucket, bk);
    const limitHint = currentLimit.formula
      ? `<span class="spellbook-list-hint">${escapeHtml(bucketLabel(ui.bucket))}: ${escapeHtml(
          currentLimit.formula
        )}</span>`
      : '';

    sectionEl.className = 'class-detail__section class-spellbook-section';
    sectionEl.innerHTML = `
      <h4 class="class-detail__section-title">Mi lista de conjuros${titleExtra}</h4>

      <div class="spellbook-config">
        ${modHtml}
        ${grimoireMaxHtml}
        <label class="spellbook-config__toggle">
          <input type="checkbox" id="spellbook-extra-toggle" ${bk.extraUnlocked ? 'checked' : ''} />
          <span>Tengo conjuros de otros orígenes (raza, dotes, objetos…)</span>
        </label>
      </div>

      <div class="spellbook-buckets" role="tablist">${countsHtml}</div>

      <div class="spellbook-toolbar atlas-search-row">
        <input type="search" id="spellbook-search" class="spells-search-input"
          placeholder="Buscar conjuro…" autocomplete="off" enterkeyhint="search"
          value="${escapeHtml(ui.query)}" />
      </div>
      ${limitHint}

      <button type="button" class="atlas-selected-bar class-spellbook-selected-bar" id="spellbook-selected-bar" hidden>
        <span class="atlas-selected-bar__back" aria-hidden="true"><i data-lucide="chevron-left"></i></span>
        <span class="atlas-selected-bar__name" id="spellbook-selected-name">—</span>
        <span class="spells-badge" id="spellbook-selected-meta"></span>
      </button>

      <div class="spellbook-list description-box" id="spellbook-list"></div>
      <div class="spellbook-detail description-box" id="spellbook-detail" hidden></div>
    `;

    wireShell(bk);
    renderList(bk);
  }

  function wireShell(bk) {
    sectionEl.querySelectorAll('.spellbook-bucket').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.bucket = btn.dataset.bucket;
        ui.selectedSpellId = null;
        render();
      });
    });

    const search = sectionEl.querySelector('#spellbook-search');
    if (search) {
      search.addEventListener('input', () => {
        ui.query = search.value;
        renderList(bk);
      });
    }

    const modInput = sectionEl.querySelector('#spellbook-mod');
    if (modInput) {
      modInput.addEventListener('change', () => {
        const v = parseInt(modInput.value, 10);
        updateSpellbook(getClassId(), (b) => {
          b.abilityMod = Number.isFinite(v) ? v : null;
        });
        render();
      });
    }

    const gmax = sectionEl.querySelector('#spellbook-grimoire-max');
    if (gmax) {
      gmax.addEventListener('change', () => {
        const v = parseInt(gmax.value, 10);
        updateSpellbook(getClassId(), (b) => {
          b.grimoireMax = Number.isFinite(v) && v >= 0 ? v : null;
        });
        render();
      });
    }

    const extraToggle = sectionEl.querySelector('#spellbook-extra-toggle');
    if (extraToggle) {
      extraToggle.addEventListener('change', () => {
        updateSpellbook(getClassId(), (b) => {
          b.extraUnlocked = extraToggle.checked;
        });
        if (!extraToggle.checked && ui.bucket === 'extra') ui.bucket = 'spells';
        render();
      });
    }

    const bar = sectionEl.querySelector('#spellbook-selected-bar');
    if (bar) {
      bar.addEventListener('click', () => {
        ui.selectedSpellId = null;
        renderList(bk);
      });
    }
  }

  function renderList(bk) {
    const listEl = sectionEl.querySelector('#spellbook-list');
    const detailEl = sectionEl.querySelector('#spellbook-detail');
    const bar = sectionEl.querySelector('#spellbook-selected-bar');
    if (!listEl || !detailEl || !bar) return;

    const selected =
      ui.selectedSpellId && spellsById.get(ui.selectedSpellId)
        ? spellsById.get(ui.selectedSpellId)
        : null;
    sectionEl.classList.toggle('has-spellbook-selection', !!selected);

    if (selected) {
      bar.hidden = false;
      const name = sectionEl.querySelector('#spellbook-selected-name');
      const meta = sectionEl.querySelector('#spellbook-selected-meta');
      if (name) name.textContent = selected.name || selected.id;
      if (meta) meta.textContent = spellLevelBadge(selected.level);
      detailEl.hidden = false;
      renderSpellDetail(detailEl, selected);
      if (window.lucide?.createIcons) window.lucide.createIcons();
      return;
    }

    bar.hidden = true;
    detailEl.hidden = true;
    detailEl.innerHTML = '';

    const chosen = new Set(bk[ui.bucket]);
    const pool = filterPool(poolFor(ui.bucket, bk)).slice().sort((a, b) => {
      const inA = chosen.has(a.id) ? 0 : 1;
      const inB = chosen.has(b.id) ? 0 : 1;
      if (inA !== inB) return inA - inB;
      const byLvl = (a.level ?? 0) - (b.level ?? 0);
      if (byLvl !== 0) return byLvl;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });

    listEl.innerHTML = '';

    if (!pool.length) {
      const msg =
        ui.bucket === 'spells' && hasGrimoire(casterType())
          ? 'Añade conjuros al grimorio primero.'
          : 'No hay conjuros para mostrar.';
      listEl.innerHTML = `<div class="description-placeholder">${msg}</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    pool.forEach((sp) => {
      const inList = chosen.has(sp.id);
      const row = document.createElement('div');
      row.className =
        'spellbook-row spells-list-item' + (inList ? ' spellbook-row--in' : '');

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'spellbook-row__check';
      check.checked = inList;
      check.setAttribute('aria-label', `Añadir ${sp.name || sp.id} a mi lista`);
      check.addEventListener('change', () => {
        toggleSpell(getClassId(), ui.bucket, sp.id);
        render();
      });

      const body = document.createElement('button');
      body.type = 'button';
      body.className = 'spellbook-row__body';
      body.innerHTML = `
        <span class="spells-list-item__name">${escapeHtml(sp.name || sp.id)}</span>
        <span class="spells-list-item__meta">
          <span class="spells-badge">${spellLevelBadge(sp.level)}</span>
          <span class="spells-badge">${escapeHtml(sp.school || '—')}</span>
        </span>`;
      body.addEventListener('click', () => {
        ui.selectedSpellId = sp.id;
        renderList(bk);
      });

      row.appendChild(check);
      row.appendChild(body);
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
  }

  /* ---------------------------------------------------------------- *
   *  API
   * ---------------------------------------------------------------- */

  /** Re-renderiza. Solo toca el almacén si ya hay un registro que mantener. */
  function sync() {
    refreshSpellIndex();
    const classId = getClassId();
    const stored = classId
      ? getSection('spellbooks')?.[spellbookId(classId)]
      : null;

    if (stored) {
      const archetypeId = getArchetypeId();
      const hasDead = ['cantrips', 'spells', 'grimoire', 'extra'].some((k) =>
        (stored[k] || []).some((id) => !spellsById.has(id))
      );
      if (stored.archetypeId !== (archetypeId || null) || hasDead) {
        updateSpellbook(classId, (b) => {
          b.archetypeId = archetypeId || null;
          for (const key of ['cantrips', 'spells', 'grimoire', 'extra']) {
            b[key] = b[key].filter((id) => spellsById.has(id));
          }
        });
      }
    }
    render();
  }

  function reset() {
    ui.selectedSpellId = null;
    sectionEl.innerHTML = '';
  }

  return { sync, reset };
}
