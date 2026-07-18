/**
 * Utilidades de progresión (cliente) — espejo ligero del server.
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

export function spellAvailableWithSlots(spell, spellSlots) {
  if (!spellSlots) return false;
  const lvl = typeof spell.level === 'number' ? spell.level : 0;
  if (lvl === 0) return Number(spellSlots.level0 || 0) > 0;
  const max = maxSpellLevelFromSlots(spellSlots);
  return max != null && lvl <= max;
}
