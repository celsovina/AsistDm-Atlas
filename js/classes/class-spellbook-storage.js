/**
 * Lista de conjuros del jugador por clase ("mi lista") — vía sesión (Redis +
 * espejo local). Un registro por (jugador, clase): id `<slug>_<classId>`.
 *
 * Buckets:
 *   cantrips  — trucos elegidos de la lista de clase
 *   spells    — conjuros preparados/aprendidos de la lista de clase
 *   grimoire  — conjuros en el grimorio (solo mago)
 *   extra     — conjuros de otros orígenes (raza, dotes, objetos…), sin límite
 */

import { isReady, getSection, update, getActiveSlug } from '../user/session.js';

/**
 * @param {string} classId
 * @returns {string}
 */
export function spellbookId(classId) {
  return `${getActiveSlug() || 'anon'}_${classId}`;
}

/**
 * @param {string} id
 * @param {string} classId
 */
function freshSpellbook(id, classId) {
  return {
    id,
    classId,
    archetypeId: null,
    abilityMod: null,
    grimoireMax: null,
    extraUnlocked: false,
    cantrips: [],
    spells: [],
    grimoire: [],
    extra: [],
  };
}

/**
 * @param {any} raw
 * @param {string} id
 * @param {string} classId
 */
function normalize(raw, id, classId) {
  const base = freshSpellbook(id, classId);
  if (!raw || typeof raw !== 'object') return base;
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    ...base,
    archetypeId:
      typeof raw.archetypeId === 'string' && raw.archetypeId
        ? raw.archetypeId
        : null,
    abilityMod:
      Number.isFinite(raw.abilityMod) ? Math.trunc(raw.abilityMod) : null,
    grimoireMax:
      Number.isFinite(raw.grimoireMax) && raw.grimoireMax >= 0
        ? Math.trunc(raw.grimoireMax)
        : null,
    extraUnlocked: !!raw.extraUnlocked,
    cantrips: arr(raw.cantrips),
    spells: arr(raw.spells),
    grimoire: arr(raw.grimoire),
    extra: arr(raw.extra),
  };
}

/**
 * Devuelve el registro (normalizado) o null si la sesión aún no está lista.
 * @param {string} classId
 * @returns {ReturnType<typeof freshSpellbook>|null}
 */
export function getSpellbook(classId) {
  if (!classId || !isReady()) return null;
  const id = spellbookId(classId);
  return normalize(getSection('spellbooks')?.[id], id, classId);
}

/**
 * Aplica una mutación al registro (creándolo si no existe) y persiste.
 * @param {string} classId
 * @param {(book: ReturnType<typeof freshSpellbook>) => void} mutator
 */
export function updateSpellbook(classId, mutator) {
  if (!classId || !isReady()) return;
  const id = spellbookId(classId);
  update((doc) => {
    const current = normalize(doc.spellbooks[id], id, classId);
    mutator(current);
    doc.spellbooks[id] = current;
  });
}

/**
 * Añade/quita un id de conjuro de un bucket.
 * @param {string} classId
 * @param {'cantrips'|'spells'|'grimoire'|'extra'} bucket
 * @param {string} spellId
 * @returns {boolean} nuevo estado (true = está en la lista)
 */
export function toggleSpell(classId, bucket, spellId) {
  let present = false;
  updateSpellbook(classId, (book) => {
    const list = book[bucket];
    const idx = list.indexOf(spellId);
    if (idx >= 0) {
      list.splice(idx, 1);
      present = false;
    } else {
      list.push(spellId);
      present = true;
    }
  });
  return present;
}
