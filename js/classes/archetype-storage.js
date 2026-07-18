/**
 * Persistencia de arquetipo elegido por clase (localStorage).
 */

const KEY_PREFIX = 'atlas:classArchetype:';

/**
 * @param {string} classId
 * @returns {string}
 */
function storageKey(classId) {
  return `${KEY_PREFIX}${classId}`;
}

/**
 * @param {string} classId
 * @returns {string|null}
 */
export function loadArchetypeSelection(classId) {
  if (!classId) return null;
  try {
    const value = localStorage.getItem(storageKey(classId));
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} classId
 * @param {string} archetypeId
 */
export function saveArchetypeSelection(classId, archetypeId) {
  if (!classId || !archetypeId) return;
  try {
    localStorage.setItem(storageKey(classId), archetypeId);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {string} classId
 */
export function clearArchetypeSelection(classId) {
  if (!classId) return;
  try {
    localStorage.removeItem(storageKey(classId));
  } catch {
    /* ignore */
  }
}

/**
 * Resuelve la selección visible según el nivel.
 * Si `clearIfBelow` es true y el nivel baja del umbral, borra localStorage.
 * @param {string} classId
 * @param {number} classLevel
 * @param {number|null} unlockLevel
 * @param {{ clearIfBelow?: boolean }} [opts]
 * @returns {string|null}
 */
export function syncArchetypeWithLevel(
  classId,
  classLevel,
  unlockLevel,
  opts = {}
) {
  const clearIfBelow = opts.clearIfBelow === true;
  if (unlockLevel == null || classLevel < unlockLevel) {
    if (clearIfBelow) clearArchetypeSelection(classId);
    return null;
  }
  return loadArchetypeSelection(classId);
}
