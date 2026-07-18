/**
 * GET /api/resources?classId=monje&level=10&archetypeId=
 * Resuelve recursos de sesión desde tabla_progresion.classSpecific.
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

const COUNT_KEYS = ['kiPoints', 'points', 'dice', 'count', 'amount'];

function findRowAtOrBefore(rows, level) {
  let best = null;
  for (const row of rows) {
    const lv = Number(row.level);
    if (!Number.isFinite(lv) || lv > level) continue;
    if (!best || lv > Number(best.level)) best = row;
  }
  return best;
}

function trackLabel(trackKey) {
  if (trackKey === 'spells') return 'Slots de conjuro';
  return String(trackKey).replace(/_/g, ' ');
}

function clampManualUses(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.min(20, Math.max(1, Math.floor(v)));
}

/**
 * Resuelve cantidad desde la fila de progresión.
 * - `uses` string (p. ej. charisma_mod) → cantidad manual
 * - `uses` numérico → cantidad fija
 * - otras claves numéricas / infinito
 * @param {object} row
 * @param {number} manualUses
 */
function resolvePointCount(row, manualUses = 3) {
  if (row.uses != null) {
    const raw = row.uses;
    if (raw === 'infinito' || raw === Infinity) {
      return { count: 0, infinite: true };
    }
    if (typeof raw === 'string') {
      return {
        count: clampManualUses(manualUses),
        infinite: false,
        usesManual: true,
      };
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return { count: Math.floor(n), infinite: false };
    }
    return null;
  }

  for (const key of COUNT_KEYS) {
    if (row[key] == null) continue;
    const raw = row[key];
    if (raw === 'infinito' || raw === Infinity) {
      return { count: 0, infinite: true };
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return { count: Math.floor(n), infinite: false };
    }
  }
  return null;
}

function composeTracks(classTracks, classId, archetypeId, allSpecific) {
  const base =
    classTracks && typeof classTracks === 'object' ? { ...classTracks } : {};

  if (classId === 'guerrero') {
    if (archetypeId !== 'maestro_combate') {
      delete base.dados_superioridad;
    }
    if (archetypeId === 'caballero_arcano' && allSpecific?.caballero_arcano) {
      Object.assign(base, allSpecific.caballero_arcano);
    }
  }

  return base;
}

/**
 * @param {object} tracks
 * @param {number} level
 * @param {number} manualUses
 */
export function resolveResourcesFromTracks(tracks, level, manualUses = 3) {
  const src = tracks && typeof tracks === 'object' ? tracks : {};
  /** @type {object[]} */
  const out = [];

  for (const [trackKey, rows] of Object.entries(src)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const label = trackLabel(trackKey);

    if (trackKey === 'spells') {
      const row = findRowAtOrBefore(rows, level);
      const slots = row?.spellSlots || {};
      const levels = [];
      for (let n = 1; n <= 9; n += 1) {
        const count = Number(slots[`level${n}`] || 0);
        if (count > 0) levels.push({ spellLevel: n, count });
      }
      if (levels.length > 0) {
        out.push({
          id: 'spells',
          label,
          kind: 'spellSlots',
          levels,
          cantripsKnown: Number(slots.level0 || 0) || null,
        });
      }
      continue;
    }

    if (trackKey === 'arcanum_mistico') {
      const unlocked = rows.filter((r) => Number(r.level) <= level);
      if (unlocked.length === 0) continue;
      out.push({
        id: trackKey,
        label,
        kind: 'arcanum',
        entries: unlocked.map((r) => ({
          spellLevel: Number(r.spellLevel),
          unlockLevel: Number(r.level),
        })),
      });
      continue;
    }

    const row = findRowAtOrBefore(rows, level);
    if (!row) continue;

    const resolved = resolvePointCount(row, manualUses);
    if (!resolved) continue;
    if (resolved.infinite) {
      out.push({ id: trackKey, label, kind: 'points', count: 0, infinite: true });
      continue;
    }
    if (resolved.count <= 0) continue;

    const suffix = row.diceType
      ? ` (${row.diceType})`
      : row.dice
        ? ` (${row.dice})`
        : '';

    out.push({
      id: trackKey,
      label: `${label}${suffix}`,
      kind: 'points',
      count: resolved.count,
      infinite: false,
      note: resolved.note || null,
      usesManual: !!resolved.usesManual,
    });
  }

  return out;
}

/**
 * Claves de classSpecific que no son clases jugables (tracks auxiliares).
 */
const NON_CLASS_TRACK_KEYS = new Set(['caballero_arcano']);

/**
 * @param {object} allSpecific
 * @returns {string[]}
 */
export function listResourceClassIds(allSpecific) {
  const src = allSpecific && typeof allSpecific === 'object' ? allSpecific : {};
  return Object.keys(src)
    .filter((id) => {
      if (NON_CLASS_TRACK_KEYS.has(id)) return false;
      const tracks = src[id];
      return tracks && typeof tracks === 'object' && !Array.isArray(tracks);
    })
    .sort();
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleGetResources(req, res) {
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
    const levelRaw = getParam(req, 'level');
    const archetypeId = getParam(req, 'archetypeId') || null;
    // manualUses (nuevo) o chaMod (legacy)
    const manualRaw =
      getParam(req, 'manualUses') || getParam(req, 'chaMod');

    const data = await loadJson('tabla_progresion');
    const allSpecific = data.classSpecific || {};

    // Sin classId → catálogo de clases con recursos rastreados
    if (!classId) {
      sendOk(res, { classIds: listResourceClassIds(allSpecific) });
      return;
    }

    const level = Math.min(
      20,
      Math.max(1, parseInt(levelRaw, 10) || 1)
    );
    const manualUses = Math.min(
      20,
      Math.max(1, parseInt(manualRaw, 10) || 3)
    );

    const classTracks = allSpecific[classId];

    if (!classTracks || typeof classTracks !== 'object') {
      sendError(res, `Sin progresión para clase: ${classId}`, 404);
      return;
    }

    const tracks = composeTracks(
      classTracks,
      classId,
      archetypeId,
      allSpecific
    );
    const resources = resolveResourcesFromTracks(tracks, level, manualUses);
    const trackKeys = Object.keys(tracks).filter((k) =>
      Array.isArray(tracks[k])
    );

    sendOk(res, {
      classId,
      level,
      archetypeId: archetypeId || null,
      trackKeys,
      resources,
    });
  } catch (err) {
    sendError(res, err.message || 'Error interno', err.status || 500);
  }
}
