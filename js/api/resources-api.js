import { apiGet } from './client.js';

/**
 * Clases con progresión/recursos rastreados en tabla_progresion.
 * @returns {Promise<string[]>}
 */
export async function getResourceClassIds() {
  const data = await apiGet('api/resources');
  return Array.isArray(data.classIds) ? data.classIds.map(String) : [];
}

/**
 * @param {{ classId: string, level: number, archetypeId?: string|null, manualUses?: number }} params
 */
export async function getClassResources(params) {
  const q = new URLSearchParams();
  q.set('classId', params.classId);
  q.set('level', String(params.level || 1));
  if (params.archetypeId) q.set('archetypeId', params.archetypeId);
  if (params.manualUses) q.set('manualUses', String(params.manualUses));

  const data = await apiGet(`api/resources?${q.toString()}`);
  return {
    classId: data.classId,
    level: data.level,
    archetypeId: data.archetypeId || null,
    trackKeys: Array.isArray(data.trackKeys) ? data.trackKeys : [],
    resources: Array.isArray(data.resources) ? data.resources : [],
  };
}
