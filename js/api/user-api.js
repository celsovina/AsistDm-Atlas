/**
 * API de datos de jugador (login por nombre + documento persistente).
 */

import { apiGet, apiSend, ApiError } from './client.js';

/**
 * @returns {Promise<string[]>}
 */
export async function listUsers() {
  const data = await apiGet('api/users');
  return Array.isArray(data.users) ? data.users : [];
}

/**
 * @param {string} slug
 * @returns {Promise<object|null>} documento del jugador, o null si no existe
 */
export async function fetchUser(slug) {
  try {
    const data = await apiGet(`api/user?slug=${encodeURIComponent(slug)}`);
    return data.user || null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Crea el jugador (o devuelve el existente).
 * @param {string} name
 * @returns {Promise<object>}
 */
export async function createUser(name) {
  const data = await apiSend('api/user', 'POST', { name });
  return data.user;
}

/**
 * Reemplaza el documento del jugador.
 * @param {string} slug
 * @param {object} doc
 * @returns {Promise<object>}
 */
export async function saveUser(slug, doc) {
  const data = await apiSend(
    `api/user?slug=${encodeURIComponent(slug)}`,
    'PUT',
    { doc }
  );
  return data.user;
}

export { ApiError };
