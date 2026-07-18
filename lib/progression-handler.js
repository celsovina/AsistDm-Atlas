/**
 * GET /api/progression?classId=explorador
 * Devuelve progresión de conjuros por nivel de clase + resumen de slots.
 */

import { loadJson } from './json-store.js';
import { sendOk, sendError } from './http.js';
import { maxSpellLevelFromSlots } from './progression-utils.js';

function parseQuery(req) {
  try {
    const host = req.headers?.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    return url.searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function getParam(req, name) {
  if (req.query && req.query[name] != null && req.query[name] !== '') {
    return String(req.query[name]).trim();
  }
  return (parseQuery(req).get(name) || '').trim();
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleGetProgression(req, res) {
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
    const classId = getParam(req, 'classId') || getParam(req, 'id');
    if (!classId) {
      sendError(res, 'Falta classId', 400);
      return;
    }

    const data = await loadJson('tabla_progresion');
    const specific = data.classSpecific?.[classId] || null;
    const spellRows = Array.isArray(specific?.spells) ? specific.spells : [];

    const byClassLevel = spellRows.map((row) => {
      const slots = row.spellSlots || {};
      return {
        classLevel: row.level,
        spellsKnown: row.spellsKnown ?? null,
        cantripsKnown: row.cantripsKnown ?? null,
        spellSlots: slots,
        maxSpellLevel: maxSpellLevelFromSlots(slots),
        hasCantrips: Number(slots.level0 || 0) > 0,
      };
    });

    sendOk(res, {
      classId,
      hasSpellProgression: byClassLevel.length > 0,
      byClassLevel,
      baseProgression: data.baseProgression || [],
      metadata: data.metadata || {},
    });
  } catch (err) {
    sendError(res, err.message || 'Error interno', err.status || 500);
  }
}
