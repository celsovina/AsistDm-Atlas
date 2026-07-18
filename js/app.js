/**
 * Atlas — catálogo de conjuros
 * Datos desde API Node + filtros locales.
 */

import { getAllSpells } from './api/spells-api.js';
import { getClassSpells } from './api/class-spells-api.js';
import { ApiError } from './api/client.js';
import {
  createEmptyFilters,
  applySpellFilters,
} from './spells/filter-model.js';
import { createFilterPanel } from './spells/filter-panel.js';
import { createClassesPage } from './classes/class-page.js';
import { createHomePage } from './home/home-page.js';
import { createWalletPage } from './wallet/wallet-page.js';

const MOBILE_MQ = window.matchMedia('(max-width: 767px)');

const state = {
  spells: [],
  classSpellIds: null,
  loading: true,
  error: null,
  query: '',
  selectedId: null,
  filters: createEmptyFilters(),
};

const els = {
  app: document.getElementById('atlas-app'),
  search: document.getElementById('spells-search-input'),
  list: document.getElementById('spells-list'),
  detail: document.getElementById('spells-detail-pane'),
  selectedBar: document.getElementById('selected-bar'),
  selectedBarName: document.getElementById('selected-bar-name'),
  selectedBarMeta: document.getElementById('selected-bar-meta'),
  filterMount: document.getElementById('filter-mount'),
};

function levelBadge(level) {
  return level === 0 ? 'Truco' : `N${level}`;
}

function getSpell(id) {
  return state.spells.find((s) => s.id === id) || null;
}

function getFilteredSpells() {
  let spells = applySpellFilters(
    state.spells,
    state.filters,
    state.classSpellIds
  );

  if (state.query.trim()) {
    const q = state.query.trim().toLowerCase();
    spells = spells.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.school || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q)
    );
  }

  spells.sort((a, b) => {
    const byLevel = (a.level ?? 0) - (b.level ?? 0);
    if (byLevel !== 0) return byLevel;
    return (a.name || '').localeCompare(b.name || '', 'es');
  });

  return spells;
}

function renderList() {
  if (state.loading) {
    els.list.innerHTML =
      '<div class="description-placeholder">Cargando conjuros…</div>';
    return;
  }

  if (state.error) {
    els.list.innerHTML = `<div class="description-placeholder">${state.error}</div>`;
    return;
  }

  const spells = getFilteredSpells();

  if (!spells.length) {
    els.list.innerHTML =
      '<div class="description-placeholder">No se encontraron conjuros.</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  spells.forEach((spell) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className =
      'spells-list-item' +
      (spell.id === state.selectedId ? ' spells-list-item--selected' : '');
    row.dataset.spellId = spell.id;

    row.innerHTML = `
      <span class="spells-list-item__name">${spell.name || spell.id}</span>
      <span class="spells-list-item__meta">
        <span class="spells-badge">${levelBadge(spell.level)}</span>
        <span class="spells-badge">${spell.school || '—'}</span>
      </span>
    `;

    row.addEventListener('click', () => selectSpell(spell.id));
    frag.appendChild(row);
  });

  els.list.innerHTML = '';
  els.list.appendChild(frag);
}

function renderDetail(spell) {
  if (!spell) {
    els.detail.innerHTML =
      '<div class="description-placeholder">Selecciona un hechizo para ver su información detallada.</div>';
    return;
  }

  const comps = Array.isArray(spell.components)
    ? spell.components.join(', ')
    : spell.components || '—';

  const metaRows = [
    ['Nivel', String(spell.level ?? '—')],
    ['Escuela', spell.school || '—'],
    ['Ritual', spell.ritual ? 'Sí' : 'No'],
    ['Concentración', spell.concentration ? 'Sí' : 'No'],
    ['Tiempo', spell.castingTime || '—'],
    ['Alcance', spell.range || '—'],
    ['Componentes', comps],
    ['Duración', spell.duration || '—'],
  ];

  if (spell.areaOfEffect) {
    metaRows.push(['Área', spell.areaOfEffect]);
  }

  if (spell.materials && spell.materials.length) {
    metaRows.push(['Materiales', spell.materials.join('; ')]);
  }

  if (spell.savingThrow?.type) {
    metaRows.push(['Salvación', spell.savingThrow.type]);
  }

  const upcastHtml = spell.upcast
    ? `<div class="spells-upcast"><strong>A niveles superiores</strong>${spell.upcast}</div>`
    : '';

  els.detail.innerHTML = `
    <div class="spells-detail-content">
      <h4>${spell.name || spell.id}</h4>
      <ul>
        ${metaRows.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}
      </ul>
      <div class="spells-description-content">
        <p>${spell.description || '—'}</p>
        ${upcastHtml}
      </div>
    </div>
  `;
}

function updateSelectedBar(spell) {
  if (!spell) {
    els.selectedBar.hidden = true;
    return;
  }
  els.selectedBar.hidden = false;
  els.selectedBarName.textContent = spell.name || spell.id;
  els.selectedBarMeta.textContent = levelBadge(spell.level);
}

function syncSelectionUi() {
  const spell = state.selectedId ? getSpell(state.selectedId) : null;

  if (state.selectedId && spell) {
    els.app.classList.add('has-selection');
    updateSelectedBar(spell);
    renderDetail(spell);
  } else {
    els.app.classList.remove('has-selection');
    updateSelectedBar(null);
    renderDetail(null);
  }

  els.list.querySelectorAll('.spells-list-item').forEach((row) => {
    row.classList.toggle(
      'spells-list-item--selected',
      row.dataset.spellId === state.selectedId
    );
  });
}

function selectSpell(spellId) {
  state.selectedId = spellId;
  syncSelectionUi();
}

function clearMobileSelection() {
  if (!MOBILE_MQ.matches) return;
  state.selectedId = null;
  syncSelectionUi();
  renderList();
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function toClassIdSets(byClass) {
  const out = {};
  for (const [classId, ids] of Object.entries(byClass || {})) {
    out[classId] = new Set(Array.isArray(ids) ? ids : []);
  }
  return out;
}

async function loadSpells() {
  state.loading = true;
  state.error = null;
  renderList();

  try {
    const spellsRes = await getAllSpells();
    state.spells = spellsRes.spells;
    state.loading = false;
    state.error = null;
  } catch (err) {
    state.spells = [];
    state.classSpellIds = null;
    state.loading = false;
    state.error =
      err instanceof ApiError
        ? err.message
        : 'No se pudieron cargar los conjuros.';
    console.error('[Atlas] Error cargando conjuros:', err);
    renderList();
    syncSelectionUi();
    return;
  }

  try {
    const classRes = await getClassSpells();
    state.classSpellIds = toClassIdSets(classRes.byClass);
  } catch (err) {
    state.classSpellIds = null;
    console.warn('[Atlas] No se pudo cargar el mapa de clases:', err);
  }

  renderList();
  syncSelectionUi();
}

function bindEvents() {
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    renderList();
  });

  els.selectedBar.addEventListener('click', () => {
    clearMobileSelection();
  });

  MOBILE_MQ.addEventListener('change', () => {
    syncSelectionUi();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && MOBILE_MQ.matches && state.selectedId) {
      clearMobileSelection();
    }
  });
}

function init() {
  createFilterPanel({
    mountEl: els.filterMount,
    filters: state.filters,
    onChange: () => {
      renderList();
      syncSelectionUi();
    },
  });

  const classesPage = createClassesPage({
    app: els.app,
    page: document.getElementById('classes-page'),
    search: document.getElementById('classes-search-input'),
    list: document.getElementById('classes-list'),
    detail: document.getElementById('classes-detail-pane'),
    selectedBar: document.getElementById('classes-selected-bar'),
    selectedBarName: document.getElementById('classes-selected-bar-name'),
    selectedBarMeta: document.getElementById('classes-selected-bar-meta'),
  });

  const spellsPage = document.getElementById('spells-page');
  const walletPageEl = document.getElementById('wallet-page');
  const homePageEl = document.getElementById('home-page');
  let classesLoaded = false;
  let spellsLoaded = false;
  let walletLoaded = false;

  const homePage = createHomePage({
    page: homePageEl,
    onNavigate: (sectionId) => setSection(sectionId),
  });

  const walletPage = createWalletPage({
    page: walletPageEl,
  });

  function setSection(sectionId) {
    document.querySelectorAll('.atlas-nav-btn').forEach((btn) => {
      btn.classList.toggle(
        'atlas-nav-btn--active',
        btn.dataset.section === sectionId
      );
    });

    // Ocultar todas las secciones de forma explícita
    if (homePageEl) homePageEl.hidden = true;
    classesPage.hide();
    spellsPage.hidden = true;
    walletPage.hide();

    els.app.classList.remove('has-selection');
    els.app.classList.remove('has-class-selection');
    els.app.classList.toggle('atlas-app--home', sectionId === 'home');

    if (sectionId === 'home') {
      homePage.show();
    } else if (sectionId === 'clases') {
      classesPage.show();
      if (!classesLoaded) {
        classesLoaded = true;
        classesPage.load();
      }
    } else if (sectionId === 'billetera') {
      walletPage.show();
      if (!walletLoaded) {
        walletLoaded = true;
        walletPage.load();
      }
    } else {
      // Conjuros: siempre catálogo completo (sin conjuro abierto)
      state.selectedId = null;
      spellsPage.hidden = false;
      if (!spellsLoaded) {
        spellsLoaded = true;
        loadSpells();
      } else {
        syncSelectionUi();
        renderList();
      }
    }

    refreshIcons();
  }

  document.querySelectorAll('.atlas-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSection(btn.dataset.section);
    });
  });

  bindEvents();
  refreshIcons();
  setSection('home');
}

init();
