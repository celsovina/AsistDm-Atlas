/**
 * Almacén de datos de jugador en Upstash Redis (REST API, sin dependencias).
 *
 * Un documento JSON por jugador bajo la clave `atlas:user:<slug>`.
 * Índice de nombres en el set `atlas:users`.
 *
 * Requiere las variables de entorno que inyecta la integración de Vercel:
 *   KV_REST_API_URL, KV_REST_API_TOKEN
 * Si no están configuradas, `isConfigured()` devuelve false y los handlers
 * responden 503 para que el cliente siga en modo local (localStorage).
 */

const USERS_SET = 'atlas:users';
const USER_KEY_PREFIX = 'atlas:user:';

// Se leen de forma perezosa: en local, server.js carga `.env` después de que
// este módulo se haya importado (los `import` se evalúan antes del cuerpo).
function restUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}
function restToken() {
  return (
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
  );
}

/** @returns {boolean} */
export function isConfigured() {
  return !!(restUrl() && restToken());
}

/**
 * Ejecuta un comando Redis contra la REST API de Upstash.
 * @param {(string|number)[]} args - p. ej. ['GET', 'atlas:user:celso']
 * @returns {Promise<unknown>} el valor de `result`
 */
async function redis(args) {
  if (!isConfigured()) {
    const err = new Error('Almacén de jugadores no configurado (falta KV_REST_API_*)');
    err.status = 503;
    throw err;
  }

  let res;
  try {
    res = await fetch(restUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${restToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args.map(String)),
    });
  } catch (cause) {
    const err = new Error('No se pudo contactar con el almacén de jugadores');
    err.status = 502;
    err.cause = cause;
    throw err;
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    const err = new Error('Respuesta inválida del almacén de jugadores');
    err.status = 502;
    throw err;
  }

  if (!res.ok || payload?.error) {
    const err = new Error(payload?.error || `Error del almacén (HTTP ${res.status})`);
    err.status = 502;
    throw err;
  }

  return payload.result;
}

/**
 * Normaliza un nombre a slug: minúsculas, sin acentos, `[a-z0-9_-]`.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * @param {string} slug
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function getUser(slug) {
  const raw = await redis(['GET', USER_KEY_PREFIX + slug]);
  if (raw == null) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * Guarda (reemplaza) el documento del jugador y lo añade al índice.
 * @param {string} slug
 * @param {Record<string, unknown>} doc
 * @returns {Promise<Record<string, unknown>>}
 */
export async function saveUser(slug, doc) {
  const toStore = { ...doc, slug, updatedAt: Date.now() };
  await redis(['SET', USER_KEY_PREFIX + slug, JSON.stringify(toStore)]);
  await redis(['SADD', USERS_SET, slug]);
  return toStore;
}

/**
 * @returns {Promise<string[]>} slugs registrados, ordenados
 */
export async function listUsers() {
  const members = await redis(['SMEMBERS', USERS_SET]);
  return Array.isArray(members) ? members.map(String).sort() : [];
}
