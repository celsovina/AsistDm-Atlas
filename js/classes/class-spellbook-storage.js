/**
 * Conjuros marcados por el jugador para cada clase — vía sesión (Redis + espejo
 * local). Un registro por (jugador, clase): id `<slug>_<classId>`.
 *
 * Forma:
 *   cantrips   — trucos marcados
 *   spells     — conjuros marcados (aprendidos / preparados)  [clases no-mago]
 *   grimoires  — [{ id, name, spellIds }]  biblioteca de grimorios  [solo mago]
 *   prepared   — subconjunto preparado, unión de todos los grimorios  [solo mago]
 *   extra      — conjuros de otros orígenes (raza, dotes, objetos…), sin límite
 *   abilityMod — modificador de característica lanzadora (manual)
 *   extraUnlocked — el jugador declara que tiene conjuros de otros orígenes
 *
 * v1: `grimoires` siempre tiene un único elemento "default". La estructura queda
 * lista para una biblioteca de varios grimorios sin migración.
 * Falta la UI (varios grimorios, nombrar, mover conjuros): ver PENDIENTE.md.
 */

import { isReady, getSection, update, getActiveSlug } from '../user/session.js';

const DEFAULT_GRIMOIRE_ID = 'default';

/**
 * @param {string} classId
 * @returns {string}
 */
export function spellbookId(classId) {
  return `${getActiveSlug() || 'anon'}_${classId}`;
}

function freshGrimoire() {
  return { id: DEFAULT_GRIMOIRE_ID, name: 'Grimorio', spellIds: [] };
}

function freshSpellbook(id, classId) {
  return {
    id,
    classId,
    archetypeId: null,
    abilityMod: null,
    extraUnlocked: false,
    cantrips: [],
    spells: [],
    grimoires: [freshGrimoire()],
    prepared: [],
    extra: [],
  };
}

const strArr = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];

/**
 * Normaliza y migra desde la forma anterior (`grimoire` plano).
 * @param {any} raw
 * @param {string} id
 * @param {string} classId
 */
function normalize(raw, id, classId) {
  const base = freshSpellbook(id, classId);
  if (!raw || typeof raw !== 'object') return base;

  // Grimorios: forma nueva, o migración desde `grimoire` plano.
  let grimoires;
  if (Array.isArray(raw.grimoires) && raw.grimoires.length) {
    grimoires = raw.grimoires
      .filter((g) => g && typeof g === 'object')
      .map((g, i) => ({
        id: typeof g.id === 'string' && g.id ? g.id : `g${i}`,
        name: typeof g.name === 'string' && g.name ? g.name : `Grimorio ${i + 1}`,
        spellIds: strArr(g.spellIds),
      }));
    if (!grimoires.length) grimoires = [freshGrimoire()];
  } else {
    const legacy = strArr(raw.grimoire);
    grimoires = [{ ...freshGrimoire(), spellIds: legacy }];
  }

  // Preparados: forma nueva, o si venía de mago antiguo (`grimoire` + `spells`),
  // los `spells` antiguos eran los preparados.
  let prepared = strArr(raw.prepared);
  if (!prepared.length && strArr(raw.grimoire).length && strArr(raw.spells).length) {
    prepared = strArr(raw.spells);
  }

  return {
    ...base,
    archetypeId:
      typeof raw.archetypeId === 'string' && raw.archetypeId
        ? raw.archetypeId
        : null,
    abilityMod: Number.isFinite(raw.abilityMod) ? Math.trunc(raw.abilityMod) : null,
    extraUnlocked: !!raw.extraUnlocked,
    cantrips: strArr(raw.cantrips),
    spells: strArr(raw.spells),
    grimoires,
    prepared,
    extra: strArr(raw.extra),
  };
}

/**
 * @param {string} classId
 * @returns {ReturnType<typeof freshSpellbook>|null}
 */
export function getSpellbook(classId) {
  if (!classId || !isReady()) return null;
  const id = spellbookId(classId);
  return normalize(getSection('spellbooks')?.[id], id, classId);
}

/**
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
 * Todos los ids marcados de un registro (cualquier bucket).
 * @param {ReturnType<typeof freshSpellbook>} book
 * @returns {Set<string>}
 */
export function allMarkedIds(book) {
  const set = new Set([...book.cantrips, ...book.spells, ...book.extra]);
  for (const g of book.grimoires) for (const sid of g.spellIds) set.add(sid);
  return set;
}

/**
 * ¿Está marcado el conjuro para esta clase?
 * @param {string} classId
 * @param {string} spellId
 */
export function isFavorite(classId, spellId) {
  const book = getSpellbook(classId);
  return !!book && allMarkedIds(book).has(spellId);
}

/**
 * Bucket donde vive (o iría) un conjuro según tipo de lanzador y nivel.
 * @param {'aprendidos'|'preparados'|'grimorio'|null} casterType
 * @param {number} spellLevel
 * @param {boolean} inClassList
 * @returns {'cantrips'|'spells'|'grimoire'|'extra'}
 */
function targetBucket(casterType, spellLevel, inClassList) {
  if (inClassList === false) return 'extra';
  if ((spellLevel ?? 0) === 0) return 'cantrips';
  if (casterType === 'grimorio') return 'grimoire';
  return 'spells';
}

/**
 * Marca / desmarca un conjuro para la clase. Lo coloca en el bucket correcto.
 * @param {string} classId
 * @param {string} spellId
 * @param {{ casterType: string|null, level: number, inClassList?: boolean }} ctx
 * @returns {boolean} nuevo estado (true = marcado)
 */
export function toggleFavorite(classId, spellId, { casterType, level, inClassList = true }) {
  let marked = false;
  updateSpellbook(classId, (book) => {
    const bucket = targetBucket(casterType, level, inClassList);
    const removeFrom = (list) => {
      const i = list.indexOf(spellId);
      if (i >= 0) list.splice(i, 1);
    };

    if (allMarkedIds(book).has(spellId)) {
      // Quitar de donde esté + de preparados
      removeFrom(book.cantrips);
      removeFrom(book.spells);
      removeFrom(book.extra);
      for (const g of book.grimoires) removeFrom(g.spellIds);
      removeFrom(book.prepared);
      marked = false;
    } else if (bucket === 'grimoire') {
      book.grimoires[0].spellIds.push(spellId);
      marked = true;
    } else {
      book[bucket].push(spellId);
      marked = true;
    }
  });
  return marked;
}

/**
 * @param {string} classId
 * @param {boolean} on
 */
export function setExtraUnlocked(classId, on) {
  updateSpellbook(classId, (book) => {
    book.extraUnlocked = !!on;
  });
}

/**
 * Marca / desmarca un conjuro del grimorio como preparado (solo mago).
 * @param {string} classId
 * @param {string} spellId
 */
export function togglePrepared(classId, spellId) {
  updateSpellbook(classId, (book) => {
    const inGrimoire = book.grimoires.some((g) => g.spellIds.includes(spellId));
    const i = book.prepared.indexOf(spellId);
    if (i >= 0) book.prepared.splice(i, 1);
    else if (inGrimoire) book.prepared.push(spellId);
  });
}
