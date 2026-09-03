/**
 * Persistencia del monedero — vía sesión de jugador (Redis + espejo local).
 * Mantiene la misma firma pública que la versión localStorage.
 */

import { createEmptyPurse, normalizePurse } from './coin-converter.js';
import { isReady, getSection, setSection } from '../user/session.js';

const LEGACY_KEY = 'atlas:wallet';

/**
 * @returns {{ ppt: number, po: number, pe: number, pp: number, pc: number }}
 */
export function loadPurse() {
  if (isReady()) {
    const wallet = getSection('wallet');
    return wallet ? normalizePurse(wallet) : createEmptyPurse();
  }
  // Fallback defensivo si se llama antes de que la sesión esté lista.
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? normalizePurse(JSON.parse(raw)) : createEmptyPurse();
  } catch {
    return createEmptyPurse();
  }
}

/**
 * @param {{ ppt?: number, po?: number, pe?: number, pp?: number, pc?: number }} purse
 */
export function savePurse(purse) {
  setSection('wallet', normalizePurse(purse));
}

/**
 * Reinicia el monedero a ceros.
 */
export function clearPurse() {
  setSection('wallet', createEmptyPurse());
}
