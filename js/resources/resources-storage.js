/**
 * Persistencia de recursos: varias clases cargadas (multiclase / multi-PJ).
 */

const STORAGE_KEY = 'atlas:resources:entries';

/**
 * @typedef {object} ResourceEntry
 * @property {string} id
 * @property {string} classId
 * @property {number} classLevel
 * @property {string|null} archetypeId
 * @property {number} manualUses cantidad cuando `uses` en progresión es string
 * @property {object} usage
 */

/**
 * @returns {{ entries: ResourceEntry[], draft: object, setupOpen: boolean }}
 */
export function loadResourcesState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacy() || emptyState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyState();
    return {
      entries: Array.isArray(data.entries)
        ? data.entries.map(normalizeEntry).filter(Boolean)
        : [],
      draft: normalizeDraft(data.draft),
      setupOpen: !!data.setupOpen,
    };
  } catch {
    return emptyState();
  }
}

/**
 * @param {{ entries: ResourceEntry[], draft: object, setupOpen: boolean }} state
 */
export function saveResourcesState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function newEntryId() {
  return `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyState() {
  return {
    entries: [],
    draft: emptyDraft(),
    setupOpen: true,
  };
}

function emptyDraft() {
  return {
    classId: null,
    classLevel: 1,
    archetypeId: null,
    favoritePick: '',
  };
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

function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || !e.classId) return null;
  return {
    id: e.id || newEntryId(),
    classId: e.classId,
    classLevel: clampLevel(e.classLevel),
    archetypeId: e.archetypeId || null,
    manualUses: clampManualUses(e.manualUses ?? e.chaMod),
    usage: e.usage && typeof e.usage === 'object' ? e.usage : {},
  };
}

/** Migra el storage antiguo de una sola clase. */
function migrateLegacy() {
  try {
    const raw = localStorage.getItem('atlas:resources:main');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.classId || !data.loaded) return null;
    const state = {
      entries: [
        normalizeEntry({
          id: newEntryId(),
          classId: data.classId,
          classLevel: data.classLevel,
          archetypeId: data.archetypeId,
          manualUses: data.manualUses ?? data.chaMod,
          usage: data.usage,
        }),
      ].filter(Boolean),
      draft: emptyDraft(),
      setupOpen: false,
    };
    saveResourcesState(state);
    return state;
  } catch {
    return null;
  }
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
