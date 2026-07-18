/**
 * Helpers de progresión: nivel de clase → slots / nivel máximo de conjuro.
 */

/**
 * Nivel máximo de conjuro con slots (ignora trucos / level0).
 * @param {Record<string, number>|null|undefined} spellSlots
 * @returns {number|null}
 */
export function maxSpellLevelFromSlots(spellSlots) {
  let max = null;
  for (const [key, val] of Object.entries(spellSlots || {})) {
    if (!val || Number(val) <= 0) continue;
    const n = Number(String(key).replace(/^level/i, ''));
    if (!Number.isFinite(n) || n === 0) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

/**
 * ¿El conjuro está disponible a este nivel de clase según slots?
 * @param {{ level?: number }} spell
 * @param {Record<string, number>|null|undefined} spellSlots
 */
export function spellAvailableWithSlots(spell, spellSlots) {
  if (!spellSlots) return false;
  const lvl = typeof spell.level === 'number' ? spell.level : 0;
  if (lvl === 0) {
    return Number(spellSlots.level0 || 0) > 0;
  }
  const max = maxSpellLevelFromSlots(spellSlots);
  return max != null && lvl <= max;
}

/**
 * Fila de progresión de conjuros para un nivel de clase.
 * @param {object|null} classProgression - classSpecific[classId]
 * @param {number} classLevel
 */
export function getSpellProgressionRow(classProgression, classLevel) {
  const rows = classProgression?.spells;
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => r.level === classLevel) || null;
}
