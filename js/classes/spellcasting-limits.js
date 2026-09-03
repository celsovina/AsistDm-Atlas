/**
 * Reglas de límite de conjuros por nivel de clase (funciones puras).
 *
 * Tipos de lanzador (`spellCasterType` en clases.json):
 *   'aprendidos'  → nº fijo de conjuros conocidos por nivel (bardo, hechicero,
 *                   brujo, explorador). Límite = `spellsKnown` de la progresión.
 *   'preparados'  → puedes preparar `nivel + mod` (clérigo, druida) o
 *                   `½ nivel + mod` (paladín). El modificador se escribe a mano.
 *   'grimorio'    → como 'preparados' para lo que llevas preparado, + un grimorio
 *                   propio (mago).
 *
 * Trucos: el límite es `spellSlots.level0` de la fila de progresión.
 */

/** Arquetipos que lanzan conjuros aunque su clase base no lo haga. */
export const ARCHETYPE_CASTER_TYPE = {
  caballero_arcano: 'aprendidos',
};

/**
 * Tipo de lanzador efectivo de la clase + arquetipo.
 * @param {object|null} classDetail
 * @param {string|null} archetypeId
 * @returns {'aprendidos'|'preparados'|'grimorio'|null}
 */
export function resolveCasterType(classDetail, archetypeId) {
  if (archetypeId && ARCHETYPE_CASTER_TYPE[archetypeId]) {
    return ARCHETYPE_CASTER_TYPE[archetypeId];
  }
  const t = classDetail?.spellCasterType;
  return t === 'aprendidos' || t === 'preparados' || t === 'grimorio' ? t : null;
}

/**
 * ¿Este lanzador necesita que el jugador introduzca el modificador de
 * característica para calcular su límite?
 * @param {string|null} casterType
 */
export function needsAbilityMod(casterType) {
  return casterType === 'preparados' || casterType === 'grimorio';
}

/** ¿Lleva grimorio propio (mago)? */
export function hasGrimoire(casterType) {
  return casterType === 'grimorio';
}

/**
 * Límite de trucos conocidos.
 * @param {object|null} progressionRow fila de /api/progression byClassLevel
 * @returns {number}
 */
export function cantripLimit(progressionRow) {
  const n = Number(progressionRow?.spellSlots?.level0 ?? progressionRow?.cantripsKnown ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Límite de conjuros (sin trucos).
 * @param {object} opts
 * @param {string|null} opts.casterType
 * @param {string} opts.classId
 * @param {number} opts.classLevel
 * @param {object|null} opts.progressionRow
 * @param {number|null} opts.abilityMod
 * @returns {{ value: number|null, formula: string }}
 */
export function spellLimit({
  casterType,
  classId,
  classLevel,
  progressionRow,
  abilityMod,
}) {
  const mod = Number.isFinite(abilityMod) ? Math.trunc(abilityMod) : 0;
  const lvl = Number.isFinite(classLevel) ? classLevel : 1;

  if (casterType === 'aprendidos') {
    const known = Number(progressionRow?.spellsKnown ?? 0);
    return {
      value: Number.isFinite(known) && known > 0 ? Math.floor(known) : 0,
      formula: 'conjuros conocidos por nivel de clase',
    };
  }

  if (casterType === 'preparados' || casterType === 'grimorio') {
    if (classId === 'paladin') {
      return {
        value: Math.max(0, Math.floor(lvl / 2) + mod),
        formula: '½ nivel de paladín + mod. de característica',
      };
    }
    return {
      value: Math.max(0, lvl + mod),
      formula: 'nivel de clase + mod. de característica',
    };
  }

  return { value: null, formula: '' };
}

/**
 * Tamaño del grimorio del mago por defecto: 6 a nivel 1, +2 por nivel.
 * @param {number} classLevel
 * @returns {number}
 */
export function defaultGrimoireSize(classLevel) {
  const lvl = Number.isFinite(classLevel) ? classLevel : 1;
  return 6 + Math.max(0, lvl - 1) * 2;
}
