/**
 * Lectura segura de JSON oficiales en Atlas/database.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_DIR = path.resolve(__dirname, '../database');

/** Nombres de archivo permitidos (sin .json) */
const ALLOWED = new Set([
  'spells',
  'clase_conjuros',
  'clases',
  'items',
  'Razas',
  'trasfondos',
  'dotes',
  'habilidades',
  'estados',
  'efectos',
  'resistencias',
  'tipos_dano',
  'tabla_progresion',
  'pergaminos_spells',
  'choices',
  'competencias',
  'alineamientos',
  'estilos_combate',
  'elemental-disciplines',
  'invocaciones_sobrenaturales',
  'resource-abilities',
  'shop-types',
  'shops',
]);

/**
 * @param {string} name
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadJson(name) {
  if (!ALLOWED.has(name)) {
    const err = new Error(`Recurso no permitido: ${name}`);
    err.status = 400;
    throw err;
  }

  const safeName = path.basename(name);
  const filePath = path.join(DATABASE_DIR, `${safeName}.json`);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(DATABASE_DIR + path.sep) && resolved !== DATABASE_DIR) {
    const err = new Error(`Ruta inválida para: ${safeName}.json`);
    err.status = 400;
    throw err;
  }

  let raw;
  try {
    raw = await readFile(resolved, 'utf8');
  } catch {
    const err = new Error(`Archivo no encontrado: ${safeName}.json`);
    err.status = 404;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const err = new Error(`JSON inválido: ${safeName}.json`);
    err.status = 500;
    throw err;
  }

  if (!data || typeof data !== 'object') {
    const err = new Error(`JSON inválido: ${safeName}.json`);
    err.status = 500;
    throw err;
  }

  return data;
}

export { DATABASE_DIR };
