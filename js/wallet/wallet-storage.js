/**
 * Persistencia del monedero único de Atlas (localStorage).
 */

import {
  createEmptyPurse,
  normalizePurse,
} from './coin-converter.js';

const STORAGE_KEY = 'atlas:wallet';

/**
 * @returns {{ ppt: number, po: number, pe: number, pp: number, pc: number }}
 */
export function loadPurse() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyPurse();
    const data = JSON.parse(raw);
    return normalizePurse(data);
  } catch {
    return createEmptyPurse();
  }
}

/**
 * @param {{ ppt?: number, po?: number, pe?: number, pp?: number, pc?: number }} purse
 */
export function savePurse(purse) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePurse(purse)));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Reinicia el monedero a ceros.
 */
export function clearPurse() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
