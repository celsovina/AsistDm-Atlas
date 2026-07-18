/**
 * GET /api/classes — listado o detalle (?id=mago)
 */

import { loadJson } from './json-store.js';
import { sendOk, sendError } from './http.js';

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
export async function handleGetClasses(req, res) {
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
    const data = await loadJson('clases');
    const clases = Array.isArray(data.clases) ? data.clases : [];
    const id = getParam(req, 'id');

    if (id) {
      const found = clases.find((c) => c.id === id);
      if (!found) {
        sendError(res, `Clase no encontrada: ${id}`, 404);
        return;
      }
      sendOk(res, { class: found });
      return;
    }

    const list = clases.map((c) => ({
      id: c.id,
      name: c.name,
      hitDie: c.hitDie,
      primaryAbility: c.primaryAbility,
      spellCasterType: c.spellCasterType,
      spellcastingAbility: c.spellcastingAbility,
      description: c.description,
    }));

    sendOk(res, {
      metadata: data.metadata || {},
      count: list.length,
      classes: list,
    });
  } catch (err) {
    sendError(res, err.message || 'Error interno', err.status || 500);
  }
}
