/**
 * Persistencia de arquetipo elegido por clase — vía sesión de jugador
 * (Redis + espejo local). Misma firma pública que la versión localStorage.
 */

import { isReady, getSection, update } from '../user/session.js';

const LEGACY_PREFIX = 'atlas:classArchetype:';

function readLegacy(classId) {
  try {
    const v = localStorage.getItem(LEGACY_PREFIX + classId);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} classId
 * @returns {string|null}
 */
export function loadArchetypeSelection(classId) {
  if (!classId) return null;
  if (isReady()) {
    const v = getSection('classArchetypes')?.[classId];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return readLegacy(classId);
}

/**
 * @param {string} classId
 * @param {string} archetypeId
 */
export function saveArchetypeSelection(classId, archetypeId) {
  if (!classId || !archetypeId) return;
  update((doc) => {
    doc.classArchetypes[classId] = String(archetypeId).trim();
  });
}

/**
 * @param {string} classId
 */
export function clearArchetypeSelection(classId) {
  if (!classId) return;
  update((doc) => {
    delete doc.classArchetypes[classId];
  });
}

/**
 * Resuelve la selección visible según el nivel.
 * Si `clearIfBelow` es true y el nivel baja del umbral, borra la selección.
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
