/**
 * Sesión de jugador: identifica a la persona por nombre y mantiene un único
 * documento persistente (favoritos de clase, grimorios, monedero…).
 *
 * - Fuente de verdad: Redis vía /api/user (cuando está disponible).
 * - Espejo local: localStorage (`atlas:userDoc:<slug>`) para arranque instantáneo
 *   y para seguir funcionando sin conexión / sin almacén configurado.
 * - Migración única: importa las claves antiguas (`atlas:wallet`,
 *   `atlas:classFavorite:*`) la primera vez.
 *
 * El resto de la app NO habla con este módulo directamente para wallet/favoritos:
 * usa los adaptadores de almacenamiento, que llaman aquí.
 */

import {
  listUsers,
  fetchUser,
  createUser,
  saveUser,
  ApiError,
} from '../api/user-api.js';

const ACTIVE_KEY = 'atlas:activeUser';
const ACTIVE_NAME_KEY = 'atlas:activeUserName';
const DOC_PREFIX = 'atlas:userDoc:';
const LEGACY_WALLET_KEY = 'atlas:wallet';
const LEGACY_FAV_PREFIX = 'atlas:classFavorite:';
const LEGACY_ARCHETYPE_PREFIX = 'atlas:classArchetype:';
const LEGACY_RESOURCES_KEY = 'atlas:resources:entries';
const LEGACY_RESOURCES_MAIN_KEY = 'atlas:resources:main';
const SAVE_DEBOUNCE_MS = 1500;

/** @typedef {{ name: string, slug: string, schemaVersion: number, classFavorites: Record<string, object>, classArchetypes: Record<string, string>, spellbooks: Record<string, object>, resources: object|null, wallet: object|null }} UserDoc */

const state = {
  /** @type {UserDoc|null} */
  doc: null,
  slug: '',
  /** true si el almacén remoto respondió al arrancar */
  remote: false,
  ready: false,
  /** @type {ReturnType<typeof setTimeout>|null} */
  saveTimer: null,
  saving: false,
  dirtyWhileSaving: false,
  /** @type {Set<() => void>} */
  listeners: new Set(),
};

/* ------------------------------------------------------------------ *
 *  Utilidades
 * ------------------------------------------------------------------ */

function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function emptyDoc(name, slug) {
  return {
    name: String(name || slug).trim().slice(0, 60),
    slug,
    schemaVersion: 1,
    classFavorites: {},
    classArchetypes: {},
    spellbooks: {},
    resources: null,
    wallet: null,
  };
}

function normalizeDoc(raw, fallbackName, slug) {
  const base = emptyDoc(fallbackName, slug);
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : base.name,
    slug,
    classFavorites:
      raw.classFavorites && typeof raw.classFavorites === 'object'
        ? raw.classFavorites
        : {},
    classArchetypes:
      raw.classArchetypes && typeof raw.classArchetypes === 'object'
        ? raw.classArchetypes
        : {},
    spellbooks:
      raw.spellbooks && typeof raw.spellbooks === 'object' ? raw.spellbooks : {},
    resources:
      raw.resources && typeof raw.resources === 'object' ? raw.resources : null,
    wallet: raw.wallet && typeof raw.wallet === 'object' ? raw.wallet : null,
  };
}

function readLocalDoc(slug) {
  try {
    const raw = localStorage.getItem(DOC_PREFIX + slug);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalDoc() {
  if (!state.slug || !state.doc) return;
  try {
    localStorage.setItem(DOC_PREFIX + state.slug, JSON.stringify(state.doc));
  } catch {
    /* cuota / modo privado */
  }
}

/* ------------------------------------------------------------------ *
 *  Migración de claves antiguas
 * ------------------------------------------------------------------ */

function collectLegacyData() {
  const out = {
    wallet: null,
    classFavorites: {},
    classArchetypes: {},
    resources: null,
  };
  try {
    const w = localStorage.getItem(LEGACY_WALLET_KEY);
    if (w) out.wallet = JSON.parse(w);
  } catch {
    /* ignore */
  }
  try {
    const r = localStorage.getItem(LEGACY_RESOURCES_KEY);
    if (r) {
      const parsed = JSON.parse(r);
      if (parsed && typeof parsed === 'object') out.resources = parsed;
    }
  } catch {
    /* ignore */
  }
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(LEGACY_FAV_PREFIX)) {
        const classId = key.slice(LEGACY_FAV_PREFIX.length);
        const val = localStorage.getItem(key);
        if (classId && val) out.classFavorites[classId] = JSON.parse(val);
      } else if (key.startsWith(LEGACY_ARCHETYPE_PREFIX)) {
        const classId = key.slice(LEGACY_ARCHETYPE_PREFIX.length);
        const val = localStorage.getItem(key);
        if (classId && val && val.trim()) out.classArchetypes[classId] = val.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Rellena el doc con datos antiguos si aún no tiene nada equivalente. */
function migrateLegacyInto(doc) {
  let changed = false;
  const legacy = collectLegacyData();

  if (doc.wallet == null && legacy.wallet && typeof legacy.wallet === 'object') {
    doc.wallet = legacy.wallet;
    changed = true;
  }

  if (
    Object.keys(doc.classFavorites).length === 0 &&
    Object.keys(legacy.classFavorites).length > 0
  ) {
    doc.classFavorites = legacy.classFavorites;
    changed = true;
  }

  if (
    Object.keys(doc.classArchetypes).length === 0 &&
    Object.keys(legacy.classArchetypes).length > 0
  ) {
    doc.classArchetypes = legacy.classArchetypes;
    changed = true;
  }

  if (
    doc.resources == null &&
    legacy.resources &&
    Array.isArray(legacy.resources.entries) &&
    legacy.resources.entries.length > 0
  ) {
    doc.resources = legacy.resources;
    changed = true;
  }

  return changed;
}

/**
 * Borra las claves antiguas ya consumidas por la migración. Evita que el
 * siguiente jugador de este dispositivo herede datos que no son suyos.
 */
function clearLegacyKeys() {
  try {
    const toRemove = [
      LEGACY_WALLET_KEY,
      LEGACY_RESOURCES_KEY,
      LEGACY_RESOURCES_MAIN_KEY,
    ];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith(LEGACY_FAV_PREFIX) ||
          key.startsWith(LEGACY_ARCHETYPE_PREFIX))
      ) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 *  Guardado
 * ------------------------------------------------------------------ */

function notify() {
  state.listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('[Atlas] listener de sesión falló:', err);
    }
  });
}

async function saveNow() {
  if (!state.doc || !state.slug) return;
  writeLocalDoc();

  if (!state.remote) return;

  if (state.saving) {
    state.dirtyWhileSaving = true;
    return;
  }

  state.saving = true;
  state.dirtyWhileSaving = false;
  let ok = false;
  try {
    const saved = await saveUser(state.slug, state.doc);
    ok = true;
    // Conserva lo que el servidor devuelva (updatedAt, etc.) sin pisar
    // cambios locales que hayan entrado mientras guardábamos.
    if (saved && typeof saved === 'object' && !state.dirtyWhileSaving) {
      state.doc = normalizeDoc(saved, state.doc.name, state.slug);
      writeLocalDoc();
    }
  } catch (err) {
    console.warn('[Atlas] No se pudo guardar en el servidor (se reintentará):', err);
    // Reintento suave
    scheduleSave(4000);
  } finally {
    state.saving = false;
    if (state.dirtyWhileSaving) scheduleSave(300);
  }
  return ok;
}

function scheduleSave(delay = SAVE_DEBOUNCE_MS) {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    saveNow();
  }, delay);
}

/* ------------------------------------------------------------------ *
 *  API pública
 * ------------------------------------------------------------------ */

export function isReady() {
  return state.ready;
}

export function isRemote() {
  return state.remote;
}

export function getActiveSlug() {
  return state.slug;
}

export function getActiveName() {
  return state.doc?.name || state.slug;
}

/**
 * @param {'classFavorites'|'classArchetypes'|'spellbooks'|'resources'|'wallet'} key
 */
export function getSection(key) {
  return state.doc ? state.doc[key] : undefined;
}

/**
 * Aplica una mutación al documento. El espejo local se escribe al instante
 * (red de seguridad); el guardado remoto va con debounce.
 * @param {(doc: UserDoc) => void} mutator
 */
export function update(mutator) {
  if (!state.doc) return;
  mutator(state.doc);
  writeLocalDoc();
  scheduleSave();
  notify();
}

/**
 * @param {'wallet'|'resources'} key
 * @param {object} value
 */
export function setSection(key, value) {
  update((doc) => {
    doc[key] = value;
  });
}

/**
 * Se llama tras cualquier cambio del documento (para re-render de páginas).
 * @param {() => void} fn
 * @returns {() => void} desuscriptor
 */
export function subscribe(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

/**
 * Fuerza un guardado inmediato (p. ej. antes de cambiar de jugador).
 * @returns {Promise<boolean>} true si el guardado remoto se confirmó
 */
export async function flush() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }
  return (await saveNow()) === true;
}

/** Elimina del navegador los datos de sesión (punteros y espejos). */
function wipeLocalSession({ keepActiveMirror = false } = {}) {
  try {
    const keep = keepActiveMirror ? DOC_PREFIX + state.slug : null;
    const toRemove = [ACTIVE_KEY, ACTIVE_NAME_KEY];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DOC_PREFIX) && key !== keep) toRemove.push(key);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Cierra la sesión: guarda todo, descarga los datos del navegador y vuelve a
 * pedir el nombre. Si el guardado remoto falla, conserva el espejo local del
 * jugador activo para no perder nada.
 */
export async function logout() {
  let savedRemotely = true;
  try {
    savedRemotely = await flush();
  } catch {
    savedRemotely = false;
  }
  // En modo local no hay servidor: el espejo ES la única copia, hay que conservarlo.
  const keepActiveMirror = !state.remote || !savedRemotely;
  wipeLocalSession({ keepActiveMirror });
  window.location.reload();
}

/** @deprecated usar `logout` */
export const switchUser = logout;

/* ------------------------------------------------------------------ *
 *  Arranque + modal de login
 * ------------------------------------------------------------------ */

function readStoredName() {
  try {
    return localStorage.getItem(ACTIVE_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function setActive(slug, doc) {
  state.slug = slug;
  const fallbackName = doc?.name || readStoredName() || slug;
  state.doc = normalizeDoc(doc, fallbackName, slug);
  try {
    localStorage.setItem(ACTIVE_KEY, slug);
    localStorage.setItem(ACTIVE_NAME_KEY, state.doc.name);
  } catch {
    /* ignore */
  }
  const migrated = migrateLegacyInto(state.doc);
  writeLocalDoc();
  if (migrated) clearLegacyKeys();
  state.ready = true;
  if (migrated) scheduleSave(200);
}

/**
 * @param {{ knownUsers: string[], offline: boolean }} opts
 * @returns {Promise<{ name: string }>}
 */
function promptForName({ knownUsers, offline }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'session-modal';
    overlay.innerHTML = `
      <div class="session-modal__panel" role="dialog" aria-modal="true" aria-labelledby="session-modal-title">
        <h2 class="session-modal__title" id="session-modal-title">¿Quién juega?</h2>
        <p class="session-modal__lead">
          Tu nombre carga tus clases, conjuros y monedas. Escríbelo igual cada vez.
        </p>
        ${
          offline
            ? `<p class="session-modal__warn">Sin conexión con el servidor: los datos se guardarán solo en este dispositivo.</p>`
            : ''
        }
        <form class="session-modal__form" id="session-modal-form">
          <input
            type="text"
            id="session-modal-name"
            class="session-modal__input"
            list="session-modal-users"
            placeholder="Tu nombre"
            autocomplete="off"
            autocapitalize="words"
            spellcheck="false"
            required
          />
          <datalist id="session-modal-users">
            ${knownUsers.map((u) => `<option value="${u}"></option>`).join('')}
          </datalist>
          <button type="submit" class="session-modal__submit">Entrar</button>
        </form>
        ${
          knownUsers.length
            ? `<div class="session-modal__known">
                 <span class="session-modal__known-label">Jugadores:</span>
                 ${knownUsers
                   .map(
                     (u) =>
                       `<button type="button" class="session-modal__chip" data-name="${u}">${u}</button>`
                   )
                   .join('')}
               </div>`
            : ''
        }
      </div>
    `;

    document.body.appendChild(overlay);
    const input = /** @type {HTMLInputElement} */ (
      overlay.querySelector('#session-modal-name')
    );
    const form = overlay.querySelector('#session-modal-form');
    input.focus();

    function finish(name) {
      const clean = String(name || '').trim();
      if (!clean || !slugify(clean)) {
        input.focus();
        return;
      }
      overlay.remove();
      resolve({ name: clean });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      finish(input.value);
    });
    overlay.querySelectorAll('.session-modal__chip').forEach((btn) => {
      btn.addEventListener('click', () => finish(btn.getAttribute('data-name')));
    });
  });
}

/**
 * Inicializa la sesión. Resuelve cuando hay un jugador activo y su documento
 * cargado. Debe llamarse antes de arrancar la app.
 * @returns {Promise<void>}
 */
export async function initSession() {
  // 1. ¿Está el almacén remoto disponible? (y de paso, lista de jugadores)
  let knownUsers = [];
  try {
    knownUsers = await listUsers();
    state.remote = true;
  } catch (err) {
    state.remote = false;
    if (!(err instanceof ApiError) || (err.status !== 503 && err.status !== 0)) {
      console.warn('[Atlas] Almacén de jugadores no disponible:', err);
    }
  }

  // 2. ¿Hay jugador recordado?
  let slug = '';
  try {
    slug = localStorage.getItem(ACTIVE_KEY) || '';
  } catch {
    slug = '';
  }

  if (slug) {
    if (state.remote) {
      try {
        const doc = await fetchUser(slug);
        if (doc) {
          setActive(slug, doc);
          return;
        }
        // recordado pero ya no existe en el servidor → recrear al vuelo
        const recreated = await createUser(slug);
        setActive(recreated.slug || slug, recreated);
        return;
      } catch (err) {
        console.warn('[Atlas] Fallo al cargar jugador remoto, uso caché local:', err);
      }
    }
    const cached = readLocalDoc(slug);
    if (cached || !state.remote) {
      setActive(slug, cached || emptyDoc(slug, slug));
      return;
    }
  }

  // 3. Pedir nombre
  const { name } = await promptForName({
    knownUsers,
    offline: !state.remote,
  });
  const newSlug = slugify(name);

  if (state.remote) {
    try {
      const doc = await createUser(name);
      setActive(doc.slug || newSlug, doc);
      return;
    } catch (err) {
      console.warn('[Atlas] No se pudo crear el jugador en el servidor:', err);
      state.remote = false;
    }
  }

  const cached = readLocalDoc(newSlug);
  setActive(newSlug, cached || emptyDoc(name, newSlug));
}
