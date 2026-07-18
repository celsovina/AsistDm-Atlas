/**
 * Helpers HTTP compartidos (Express + Vercel).
 */

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} payload
 */
export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
}

/**
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} data
 * @param {number} [status]
 */
export function sendOk(res, data = {}, status = 200) {
  sendJson(res, status, { ok: true, ...data });
}

/**
 * @param {import('http').ServerResponse} res
 * @param {string} message
 * @param {number} [status]
 */
export function sendError(res, message, status = 500) {
  sendJson(res, status, { ok: false, error: message });
}
