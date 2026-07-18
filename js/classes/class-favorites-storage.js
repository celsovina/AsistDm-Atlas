/**
 * Favoritos de clase: conserva nivel, arquetipo, filtros y búsqueda.
 */

const KEY_PREFIX = 'atlas:classFavorite:';

/**
 * @param {string} classId
 * @returns {string}
 */
function storageKey(classId) {
  return `${KEY_PREFIX}${classId}`;
}

/**
 * @typedef {object} ClassFavoriteSnapshot
 * @property {number} classLevel
 * @property {string|null} archetypeId
 * @property {string} spellQuery
 * @property {string[]} spellLevels
 * @property {boolean} previousFeaturesOpen
 * @property {string|null} [selectedSpellId]
 */

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
  try {
    const raw = localStorage.getItem(storageKey(classId));
    if (!raw) return null;
    const data = JSON.parse(raw);
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
      previousFeaturesOpen: !!data.previousFeaturesOpen,
      selectedSpellId:
        typeof data.selectedSpellId === 'string' && data.selectedSpellId
          ? data.selectedSpellId
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} classId
 * @param {ClassFavoriteSnapshot} snapshot
 */
export function saveClassFavorite(classId, snapshot) {
  if (!classId || !snapshot) return;
  try {
    localStorage.setItem(
      storageKey(classId),
      JSON.stringify({
        classLevel: snapshot.classLevel ?? 1,
        archetypeId: snapshot.archetypeId ?? null,
        spellQuery: snapshot.spellQuery ?? '',
        spellLevels: Array.isArray(snapshot.spellLevels)
          ? snapshot.spellLevels
          : [],
        previousFeaturesOpen: !!snapshot.previousFeaturesOpen,
        selectedSpellId: snapshot.selectedSpellId ?? null,
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} classId
 */
export function clearClassFavorite(classId) {
  if (!classId) return;
  try {
    localStorage.removeItem(storageKey(classId));
  } catch {
    /* ignore */
  }
}
