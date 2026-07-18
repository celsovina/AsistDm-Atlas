import { apiGet } from './client.js';

/**
 * @returns {Promise<{ classes: object[], count: number }>}
 */
export async function getClasses() {
  const data = await apiGet('api/classes');
  return {
    classes: Array.isArray(data.classes) ? data.classes : [],
    count: data.count ?? (data.classes || []).length,
  };
}

/**
 * @param {string} id
 */
export async function getClassById(id) {
  const data = await apiGet(`api/classes?id=${encodeURIComponent(id)}`);
  return data.class || null;
}
