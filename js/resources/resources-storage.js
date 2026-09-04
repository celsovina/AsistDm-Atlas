/**
 * Persistencia de "Rasgos activos" (multiclase / multi-PJ) — vía sesión de
 * jugador (Redis + espejo local). Misma firma pública que la versión anterior.
 *
 * Además expone helpers para consumir espacios de conjuro desde "Conjuros
 * activos" sin pasar por la página de recursos.
 */

import { isReady, getSection, setSection, update } from '../user/session.js';

const LEGACY_KEY = 'atlas:resources:entries';

/**
 * @typedef {object} ResourceEntry
 * @property {string} id
 * @property {string} classId
 * @property {number} classLevel
 * @property {string|null} archetypeId
 * @property {number} manualUses
 * @property {object} usage
 */

export function newEntryId() {
  return `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampLevel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(20, Math.max(1, Math.floor(v)));
}

function clampManualUses(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.min(20, Math.max(1, Math.floor(v)));
}

function emptyDraft() {
  return { classId: null, classLevel: 1, archetypeId: null, favoritePick: '' };
}

function normalizeDraft(d) {
  if (!d || typeof d !== 'object') return emptyDraft();
  return {
    classId: d.classId || null,
    classLevel: clampLevel(d.classLevel),
    archetypeId: d.archetypeId || null,
    favoritePick: typeof d.favoritePick === 'string' ? d.favoritePick : '',
  };
}

function cloneUsage(u) {
  try {
    return u && typeof u === 'object' ? JSON.parse(JSON.stringify(u)) : {};
  } catch {
    return {};
  }
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || !e.classId) return null;
  return {
    id: e.id || newEntryId(),
    classId: e.classId,
    classLevel: clampLevel(e.classLevel),
    archetypeId: e.archetypeId || null,
    manualUses: clampManualUses(e.manualUses ?? e.chaMod),
    usage: cloneUsage(e.usage),
  };
}

function emptyState() {
  return { entries: [], draft: emptyDraft(), setupOpen: true };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState();
  return {
    entries: Array.isArray(raw.entries)
      ? raw.entries.map(normalizeEntry).filter(Boolean)
      : [],
    draft: normalizeDraft(raw.draft),
    setupOpen: !!raw.setupOpen,
  };
}

/**
 * @returns {{ entries: ResourceEntry[], draft: object, setupOpen: boolean }}
 */
export function loadResourcesState() {
  if (isReady()) {
    return normalizeState(getSection('resources'));
  }
  // Fallback defensivo antes de que la sesión esté lista.
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return normalizeState(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyState();
  }
}

/**
 * @param {{ entries: ResourceEntry[], draft: object, setupOpen: boolean }} state
 */
export function saveResourcesState(state) {
  setSection('resources', normalizeState(state));
}

/* ------------------------------------------------------------------ *
 *  Espacios de conjuro — compartidos con "Conjuros activos"
 * ------------------------------------------------------------------ */

/**
 * @param {string} classId
 * @returns {ResourceEntry|null}
 */
export function findResourceEntry(classId) {
  const st = loadResourcesState();
  return st.entries.find((e) => e.classId === classId) || null;
}

/**
 * Devuelve la entry de esa clase; la crea si no existe.
 * @param {string} classId
 * @param {{ classLevel?: number, archetypeId?: string|null }} [opts]
 * @returns {ResourceEntry|null}
 */
export function ensureResourceEntry(classId, opts = {}) {
  if (!classId || !isReady()) return null;
  let entry = findResourceEntry(classId);
  if (entry) return entry;

  entry = {
    id: newEntryId(),
    classId,
    classLevel: clampLevel(opts.classLevel),
    archetypeId: opts.archetypeId || null,
    manualUses: 3,
    usage: {},
  };
  update((doc) => {
    const st = normalizeState(doc.resources);
    st.entries.push(entry);
    st.setupOpen = false;
    doc.resources = st;
  });
  return entry;
}

/**
 * Estado de consumo de espacios de conjuro de una clase.
 * @param {string} classId
 * @returns {Record<string, boolean[]>} nivel → [consumido…]
 */
export function spellSlotUsage(classId) {
  const entry = findResourceEntry(classId);
  const spells = entry?.usage?.spells;
  return spells && typeof spells === 'object' ? spells : {};
}

/**
 * Marca un espacio de conjuro concreto como consumido.
 * @param {string} classId
 * @param {number} level
 * @param {number} index
 * @param {number} slotCount total de espacios de ese nivel (para inicializar)
 * @returns {string|null} id de la entry afectada
 */
export function consumeSpellSlot(classId, level, index, slotCount) {
  let entryId = null;
  update((doc) => {
    const st = normalizeState(doc.resources);
    const entry = st.entries.find((e) => e.classId === classId);
    if (!entry) return;
    if (!entry.usage.spells || typeof entry.usage.spells !== 'object') {
      entry.usage.spells = {};
    }
    const key = String(level);
    const count = Math.max(
      slotCount || 0,
      index + 1,
      Array.isArray(entry.usage.spells[key]) ? entry.usage.spells[key].length : 0
    );
    const row = Array.from({ length: count }, (_, i) =>
      Array.isArray(entry.usage.spells[key]) ? !!entry.usage.spells[key][i] : false
    );
    row[index] = true;
    entry.usage.spells[key] = row;
    entryId = entry.id;
    doc.resources = st;
  });
  return entryId;
}
