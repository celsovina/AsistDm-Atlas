/**
 * Handler GET conjuros — usable desde Express y Vercel.
 */

import { loadJson } from './json-store.js';
import { sendOk, sendError } from './http.js';

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleGetSpells(req, res) {
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
    const data = await loadJson('spells');
    const spells = Array.isArray(data.spells) ? data.spells : [];
    const metadata = data.metadata && typeof data.metadata === 'object'
      ? data.metadata
      : {};

    sendOk(res, {
      metadata,
      count: spells.length,
      spells,
    });
  } catch (err) {
    const status = err.status || 500;
    sendError(res, err.message || 'Error interno', status);
  }
}
