/**
 * API de conjuros — consulta al backend Node (Express / Vercel).
 */

import { apiGet } from './client.js';

/**
 * Obtiene todos los conjuros oficiales.
 * @returns {Promise<{ metadata: object, count: number, spells: object[] }>}
 */
export async function getAllSpells() {
  const data = await apiGet('api/spells/');
  return {
    metadata: data.metadata || {},
    count: typeof data.count === 'number' ? data.count : (data.spells || []).length,
    spells: Array.isArray(data.spells) ? data.spells : [],
  };
}
