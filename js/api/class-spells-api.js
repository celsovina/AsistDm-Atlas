/**
 * API — conjuros por clase.
 */

import { apiGet } from './client.js';

/**
 * @returns {Promise<{ classes: string[], byClass: Record<string, string[]> }>}
 */
export async function getClassSpells() {
  const data = await apiGet('api/class-spells');
  return {
    classes: Array.isArray(data.classes) ? data.classes : [],
    byClass:
      data.byClass && typeof data.byClass === 'object' ? data.byClass : {},
  };
}
