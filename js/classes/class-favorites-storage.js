/**
 * Favoritos de clase (nivel, arquetipo, filtros, búsqueda) — vía sesión de
 * jugador (Redis + espejo local). Misma firma pública que la versión anterior.
 */

import {
  isReady,
  getSection,
  update,
  getActiveSlug,
} from '../user/session.js';

const LEGACY_PREFIX = 'atlas:classFavorite:';

/**
 * @typedef {object} ClassFavoriteSnapshot
 * @property {number} classLevel
 * @property {string|null} archetypeId
 * @property {string} spellQuery
 * @property {string[]} spellLevels
 * @property {string[]} spellSources
 * @property {boolean} previousFeaturesOpen
 * @property {string|null} [selectedSpellId]
 * @property {boolean} [fromResources] favorito creado solo desde Recursos (efímero)
 */

/**
 * @param {any} data
 * @returns {ClassFavoriteSnapshot|null}
 */
function normalizeSnapshot(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    classLevel:
      typeof data.classLevel === 'number'
        ? Math.min(20, Math.max(1, data.classLevel))
        : 1,
    archetypeId:
      typeof data.archetypeId === 'string' && data.archetypeId
        ? data.archetypeId
        : null,
    spellQuery: typeof data.spellQuery === 'string' ? data.spellQuery : '',
    spellLevels: Array.isArray(data.spellLevels)
      ? data.spellLevels.map(String)
      : [],
    spellSources: Array.isArray(data.spellSources)
      ? data.spellSources.map(String)
      : [],
    previousFeaturesOpen: !!data.previousFeaturesOpen,
    selectedSpellId:
      typeof data.selectedSpellId === 'string' && data.selectedSpellId
        ? data.selectedSpellId
        : null,
    fromResources: !!data.fromResources,
  };
}

function readLegacy(classId) {
  try {
    const raw = localStorage.getItem(LEGACY_PREFIX + classId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} classId
 * @returns {boolean}
 */
export function isClassFavorite(classId) {
  return loadClassFavorite(classId) != null;
}

/**
 * @param {string} classId
 * @returns {ClassFavoriteSnapshot|null}
 */
export function loadClassFavorite(classId) {
  if (!classId) return null;
  const source = isReady()
    ? getSection('classFavorites')?.[classId]
    : readLegacy(classId);
  return normalizeSnapshot(source);
}

/**
 * @param {string} classId
 * @param {ClassFavoriteSnapshot} snapshot
 */
export function saveClassFavorite(classId, snapshot) {
  if (!classId || !snapshot) return;
  const clean = {
    classLevel: snapshot.classLevel ?? 1,
    archetypeId: snapshot.archetypeId ?? null,
    spellQuery: snapshot.spellQuery ?? '',
    spellLevels: Array.isArray(snapshot.spellLevels) ? snapshot.spellLevels : [],
    spellSources: Array.isArray(snapshot.spellSources)
      ? snapshot.spellSources
      : [],
    previousFeaturesOpen: !!snapshot.previousFeaturesOpen,
    selectedSpellId: snapshot.selectedSpellId ?? null,
    fromResources: !!snapshot.fromResources,
  };
  update((doc) => {
    doc.classFavorites[classId] = clean;
  });
}

/**
 * @param {string} classId
 */
export function clearClassFavorite(classId) {
  if (!classId) return;
  update((doc) => {
    delete doc.classFavorites[classId];
  });
}

/**
 * @returns {string[]}
 */
export function listClassFavoriteIds() {
  if (isReady()) {
    return Object.keys(getSection('classFavorites') || {}).sort();
  }
  const ids = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
      const id = key.slice(LEGACY_PREFIX.length);
      if (id) ids.push(id);
    }
  } catch {
    /* ignore */
  }
  return ids.sort();
}

// `getActiveSlug` reexportado por si otros módulos quieren namespacar por jugador.
export { getActiveSlug };
