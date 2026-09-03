/**
 * Paleta de escuelas de magia — código de color compartido.
 *
 * Uso:
 *  - Catálogo de conjuros de clase: franja lateral por fila.
 *  - Filtro "Escuela": misma franja en cada opción.
 *  - Enciclopedia general: pill coloreado (borde + texto + fondo al 30%).
 */

/** @type {Record<string, string>} nombre de escuela → color base */
export const SCHOOL_COLORS = {
  Conjuración: '#9B6DD6',
  Evocación: '#B23B4E',
  Abjuración: '#86D8A0',
  Ilusión: '#39C6C0',
  Transmutación: '#E0B341',
  Encantamiento: '#4C9BE8',
  Adivinación: '#C3C9D4',
  Nigromancia: '#4A4650',
};

/** Color neutro para escuela desconocida / ausente. */
export const SCHOOL_COLOR_FALLBACK = '#64748b';

/**
 * Tinta (texto + borde) del pill cuando el color base no contrasta.
 * Nigromancia es casi negro: su pill usa gris muy claro para texto y borde,
 * y solo el fondo mantiene el tono oscuro.
 * @type {Record<string, string>}
 */
export const SCHOOL_INK = {
  Nigromancia: '#C7CDD6',
};

/**
 * @param {string|null|undefined} school
 * @returns {string} color hex
 */
export function schoolColor(school) {
  return SCHOOL_COLORS[school] || SCHOOL_COLOR_FALLBACK;
}

/**
 * Color de texto/borde para el pill (con override cuando hace falta contraste).
 * @param {string|null|undefined} school
 * @returns {string} color hex
 */
export function schoolInk(school) {
  return SCHOOL_INK[school] || schoolColor(school);
}

/**
 * Convierte un hex de 6 dígitos a `rgba(r, g, b, alpha)`.
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
  if (!m) return `rgba(100, 116, 139, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Estilo inline para un pill de escuela (enciclopedia).
 * Texto y borde en `schoolInk`; fondo con el color base al 30%.
 * @param {string|null|undefined} school
 * @returns {string} valor para el atributo style
 */
export function schoolPillStyle(school) {
  const bg = schoolColor(school);
  const ink = schoolInk(school);
  const bgAlpha = school === 'Nigromancia' ? 0.5 : 0.3;
  return `color:${ink};border-color:${ink};background:${hexToRgba(bg, bgAlpha)}`;
}

/**
 * Aplica el color de escuela como variable CSS a un elemento (para la franja).
 * @param {HTMLElement} el
 * @param {string|null|undefined} school
 */
export function applySchoolStripe(el, school) {
  if (!el) return;
  el.style.setProperty('--school-color', schoolColor(school));
  if (school) el.dataset.school = school;
}
