/**
 * Cliente HTTP base para la API de Atlas.
 */

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/**
 * @param {string} path - Ruta relativa al root de Atlas (ej. "api/spells/")
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function apiGet(path, options = {}) {
  const url = path.startsWith('/') ? path.slice(1) : path;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (err) {
    throw new ApiError(
      'No se pudo conectar con la API. ¿Está corriendo el servidor Node (npm start)?',
      0,
      err
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('Respuesta inválida del servidor', response.status);
  }

  if (!response.ok || data?.ok === false) {
    throw new ApiError(
      data?.error || `Error HTTP ${response.status}`,
      response.status,
      data
    );
  }

  return data;
}
