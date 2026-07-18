/**
 * Lógica de rasgos de clase + arquetipo (sin UI).
 */

/**
 * Rasgo que desbloquea la elección de arquetipo.
 * @param {object|null} classDetail
 * @returns {object|null}
 */
export function getArchetypeSelectorFeature(classDetail) {
  if (!classDetail || !Array.isArray(classDetail.features)) return null;
  return (
    classDetail.features.find((f) => f && f.selector_arquetipo === true) || null
  );
}

/**
 * @param {object|null} classDetail
 * @returns {number|null}
 */
export function getArchetypeUnlockLevel(classDetail) {
  const feat = getArchetypeSelectorFeature(classDetail);
  if (!feat) return null;
  return typeof feat.level === 'number' ? feat.level : 1;
}

/**
 * @param {object|null} classDetail
 * @returns {{ id: string, name: string, features?: object[] }[]}
 */
export function getClassArchetypes(classDetail) {
  if (!classDetail || !Array.isArray(classDetail.archetypes)) return [];
  return classDetail.archetypes.filter((a) => a && a.id);
}

/**
 * @param {object|null} classDetail
 * @param {string|null} archetypeId
 * @returns {object|null}
 */
export function findArchetype(classDetail, archetypeId) {
  if (!archetypeId) return null;
  return getClassArchetypes(classDetail).find((a) => a.id === archetypeId) || null;
}

/**
 * Rasgos base visibles (excluye el selector de arquetipo).
 * @param {object|null} classDetail
 * @returns {object[]}
 */
export function getBaseFeatures(classDetail) {
  if (!classDetail || !Array.isArray(classDetail.features)) return [];
  return classDetail.features.filter(
    (f) => f && f.selector_arquetipo !== true
  );
}

/**
 * Rasgos del arquetipo elegido.
 * @param {object|null} classDetail
 * @param {string|null} archetypeId
 * @returns {object[]}
 */
export function getArchetypeFeatures(classDetail, archetypeId) {
  const arch = findArchetype(classDetail, archetypeId);
  if (!arch || !Array.isArray(arch.features)) return [];
  return arch.features.filter(Boolean);
}

/**
 * Une rasgos base + arquetipo, ordenados por nivel.
 * @param {object|null} classDetail
 * @param {string|null} archetypeId
 * @returns {object[]}
 */
export function getMergedFeatures(classDetail, archetypeId) {
  const merged = [
    ...getBaseFeatures(classDetail),
    ...getArchetypeFeatures(classDetail, archetypeId),
  ];
  return merged.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
}

/**
 * Partición: rasgos del nivel actual vs niveles inferiores.
 * @param {object[]} features
 * @param {number} classLevel
 * @returns {{ current: object[], previous: object[] }}
 */
export function partitionFeaturesByLevel(features, classLevel) {
  const current = [];
  const previous = [];
  for (const f of features) {
    const lvl = f.level ?? 1;
    if (lvl === classLevel) current.push(f);
    else if (lvl < classLevel) previous.push(f);
  }
  return { current, previous };
}

/**
 * ¿El rasgo desbloquea lanzamiento de conjuros?
 * @param {object} f
 * @returns {boolean}
 */
export function isSpellcastingFeature(f) {
  if (!f) return false;
  return (
    /^lanzamiento_conjuros/i.test(f.id || '') ||
    /^lanzamiento de conjuros$/i.test(f.name || '')
  );
}

/**
 * Nivel de desbloqueo de conjuros (base o arquetipo seleccionado).
 * @param {object|null} classDetail
 * @param {string|null} archetypeId
 * @returns {number|null}
 */
export function getSpellcastingFeatureUnlockLevel(classDetail, archetypeId) {
  const fromBase = getBaseFeatures(classDetail).find(isSpellcastingFeature);
  if (fromBase) {
    return typeof fromBase.level === 'number' ? fromBase.level : 1;
  }

  const fromArch = getArchetypeFeatures(classDetail, archetypeId).find(
    isSpellcastingFeature
  );
  if (fromArch) {
    return typeof fromArch.level === 'number' ? fromArch.level : 1;
  }

  return null;
}
