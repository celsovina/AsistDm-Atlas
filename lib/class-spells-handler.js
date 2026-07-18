/**
 * Handler GET mapa clase → conjuros.
 */

import { loadJson } from './json-store.js';
import { sendOk, sendError } from './http.js';

/**
 * Aplana class_spells a { classId: string[] } de ids únicos.
 * @param {Record<string, unknown>} classSpells
 */
function flattenClassSpells(classSpells) {
  const out = {};
  for (const [classId, buckets] of Object.entries(classSpells || {})) {
    const ids = new Set();
    if (buckets && typeof buckets === 'object') {
      for (const list of Object.values(buckets)) {
        if (Array.isArray(list)) {
          for (const id of list) {
            if (typeof id === 'string') ids.add(id);
          }
        }
      }
    }
    out[classId] = [...ids];
  }
  return out;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleGetClassSpells(req, res) {
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    sendOk(res, {});
    return;
  }

  if (method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    sendError(res, 'Método no permitido', 405);
    return;
  }

  try {
    const data = await loadJson('clase_conjuros');
    const classSpells =
      data.class_spells && typeof data.class_spells === 'object'
        ? data.class_spells
        : {};
    const byClass = flattenClassSpells(classSpells);
    const classes = Array.isArray(data.metadata?.classes)
      ? data.metadata.classes
      : Object.keys(byClass);

    sendOk(res, {
      metadata: data.metadata || {},
      classes,
      byClass,
    });
  } catch (err) {
    sendError(res, err.message || 'Error interno', err.status || 500);
  }
}
