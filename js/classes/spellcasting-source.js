/**
 * Resolución de lista/progresión de conjuros cuando el arquetipo aporta magia.
 */

/** Arquetipos que usan la lista de otra clase. */
export const ARCHETYPE_SPELL_LIST_SOURCE = {
  caballero_arcano: 'mago',
};

/**
 * Id de clase cuya lista de conjuros debe usarse.
 * @param {string} classId
 * @param {string|null} archetypeId
 * @returns {string}
 */
export function resolveSpellListClassId(classId, archetypeId) {
  if (archetypeId && ARCHETYPE_SPELL_LIST_SOURCE[archetypeId]) {
    return ARCHETYPE_SPELL_LIST_SOURCE[archetypeId];
  }
  return classId;
}

/**
 * Id para pedir progresión de espacios: arquetipo si aporta magia propia.
 * @param {string} classId
 * @param {string|null} archetypeId
 * @param {boolean} classHasSpellProgression
 * @returns {string}
 */
export function resolveProgressionClassId(
  classId,
  archetypeId,
  classHasSpellProgression
) {
  if (
    !classHasSpellProgression &&
    archetypeId &&
    ARCHETYPE_SPELL_LIST_SOURCE[archetypeId]
  ) {
    return archetypeId;
  }
  return classId;
}
