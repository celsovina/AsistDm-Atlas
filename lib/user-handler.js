/**
 * Handlers de datos de jugador (Express + Vercel).
 *
 *   GET  /api/users            → { users: string[] }
 *   GET  /api/user?slug=celso  → { user: doc }            (404 si no existe)
 *   POST /api/user  { name }   → { user: doc }            (crea o devuelve el existente)
 *   PUT  /api/user?slug=celso  { doc }  → { user: doc }   (reemplaza el documento)
 */

import { sendJson } from './http.js';
import {
  getUser,
  saveUser,
  listUsers,
  slugify,
  isConfigured,
} from './user-store.js';

function sendOk(res, data = {}, status = 200) {
  sendJson(res, status, { ok: true, ...data });
}
function sendError(res, message, status = 500) {
  sendJson(res, status, { ok: false, error: message });
}

/** CORS con métodos de escritura (los otros endpoints son solo-GET). */
function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseQuery(req) {
  try {
    const host = req.headers?.host || 'localhost';
    return new URL(req.url || '/', `http://${host}`).searchParams;
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
 * Lee el cuerpo JSON de la petición (Vercel lo pre-parsea; Express con
 * express.json() también; si no, se lee del stream).
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(chunk);
  } catch {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Estructura base de un documento nuevo. */
function emptyDoc(name, slug) {
  return {
    name: String(name).trim().slice(0, 60),
    slug,
    schemaVersion: 1,
    classFavorites: {},
    classArchetypes: {},
    spellbooks: {},
    resources: null,
    wallet: null,
  };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {'user'|'users'} resource
 */
export async function handleUser(req, res, resource) {
  const method = (req.method || 'GET').toUpperCase();
  applyCors(res);

  if (method === 'OPTIONS') {
    sendOk(res, {});
    return;
  }

  if (!isConfigured()) {
    sendError(res, 'Almacén de jugadores no disponible', 503);
    return;
  }

  try {
    if (resource === 'users') {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        sendError(res, 'Método no permitido', 405);
        return;
      }
      const users = await listUsers();
      sendOk(res, { users });
      return;
    }

    // resource === 'user'
    if (method === 'GET') {
      const slug = slugify(getParam(req, 'slug') || getParam(req, 'name'));
      if (!slug) {
        sendError(res, 'Falta slug', 400);
        return;
      }
      const user = await getUser(slug);
      if (!user) {
        sendError(res, 'Jugador no encontrado', 404);
        return;
      }
      sendOk(res, { user });
      return;
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const name = String(body.name || '').trim();
      const slug = slugify(name);
      if (!slug) {
        sendError(res, 'Nombre inválido', 400);
        return;
      }
      const existing = await getUser(slug);
      if (existing) {
        sendOk(res, { user: existing, created: false });
        return;
      }
      const created = await saveUser(slug, emptyDoc(name, slug));
      sendOk(res, { user: created, created: true }, 201);
      return;
    }

    if (method === 'PUT') {
      const slug = slugify(getParam(req, 'slug'));
      if (!slug) {
        sendError(res, 'Falta slug', 400);
        return;
      }
      const body = await readJsonBody(req);
      const doc = body && typeof body.doc === 'object' ? body.doc : body;
      if (!doc || typeof doc !== 'object') {
        sendError(res, 'Documento inválido', 400);
        return;
      }
      const prev = await getUser(slug);
      const merged = {
        ...(prev || {}),
        ...doc,
        slug,
        name: (prev?.name || doc.name || slug).toString().slice(0, 60),
        schemaVersion: 1,
      };
      const saved = await saveUser(slug, merged);
      sendOk(res, { user: saved });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT, OPTIONS');
    sendError(res, 'Método no permitido', 405);
  } catch (err) {
    sendError(res, err.message || 'Error interno', err.status || 500);
  }
}
