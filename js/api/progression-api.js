import { apiGet } from './client.js';

/**
 * @param {string} classId
 * @returns {Promise<{
 *   classId: string,
 *   hasSpellProgression: boolean,
 *   byClassLevel: object[],
 *   tracks: object,
 * }>}
 */
export async function getClassProgression(classId) {
  const data = await apiGet(
    `api/progression?classId=${encodeURIComponent(classId)}`
  );
  return {
    classId: data.classId,
    hasSpellProgression: !!data.hasSpellProgression,
    byClassLevel: Array.isArray(data.byClassLevel) ? data.byClassLevel : [],
    tracks:
      data.tracks && typeof data.tracks === 'object' ? data.tracks : {},
  };
}
