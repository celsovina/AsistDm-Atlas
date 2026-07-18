/**
 * D6CubeRenderer — solo presentación (sin tiradas, sin DOM externo)
 * Responsabilidades:
 * - Generar HTML para un d6 3D CSS (cubo) con pips
 * - Proveer rotación final consistente según el valor (1..6)
 * - Proveer “seed” de animación para que no se vea repetitivo
 */
(function () {
  'use strict';

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const xi = Math.trunc(x);
    return Math.min(max, Math.max(min, xi));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function randDeg() {
    return Math.floor(Math.random() * 360) + 'deg';
  }

  function rotationForValue(value) {
    // Mapeo: cara frontal = resultado.
    // Caras del cubo (por construcción):
    // - front: 1
    // - right: 2
    // - top: 3
    // - bottom: 4
    // - left: 5
    // - back: 6
    const v = clampInt(value, 1, 6);
    switch (v) {
      case 1: return { rx: '0deg', ry: '0deg', rz: '0deg' };
      case 2: return { rx: '0deg', ry: '-90deg', rz: '0deg' };
      // Nota: en CSS, el eje X queda invertido respecto a la intuición “top/bottom”.
      // Intercambiamos el signo para que el valor mostrado coincida con la cara visible.
      case 3: return { rx: '-90deg', ry: '0deg', rz: '0deg' };
      case 4: return { rx: '90deg', ry: '0deg', rz: '0deg' };
      case 5: return { rx: '0deg', ry: '90deg', rz: '0deg' };
      case 6: return { rx: '0deg', ry: '180deg', rz: '0deg' };
      default: return { rx: '0deg', ry: '0deg', rz: '0deg' };
    }
  }

  function pipsForValue(value) {
    const v = clampInt(value, 1, 6);
    // posiciones: tl,tr,ml,mr,bl,br,c
    const map = {
      1: ['c'],
      2: ['tl', 'br'],
      3: ['tl', 'c', 'br'],
      4: ['tl', 'tr', 'bl', 'br'],
      5: ['tl', 'tr', 'c', 'bl', 'br'],
      6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
    };
    return (map[v] || [])
      .map(function (pos) { return '<span class="rd-pip rd-pip--' + pos + '"></span>'; })
      .join('');
  }

  function cubeHtml(options) {
    options = options || {};
    const value = clampInt(options.value, 1, 6);
    const token = String(options.token || '');

    const rot = rotationForValue(value);
    const seed = { sx: randDeg(), sy: randDeg(), sz: randDeg() };

    return [
      '<div class="rd-die rd-die--tray rd-die--cube rd-die--rolling" data-roll-token="' + escapeHtml(token) + '">',
      '  <div class="rd-cube" style="--rx:' + rot.rx + ';--ry:' + rot.ry + ';--rz:' + rot.rz + ';--sx:' + seed.sx + ';--sy:' + seed.sy + ';--sz:' + seed.sz + ';">',
      '    <div class="rd-cube__body" aria-hidden="true">',
      '      <div class="rd-cube__face rd-cube__face--front"><div class="rd-pips">' + pipsForValue(1) + '</div></div>',
      '      <div class="rd-cube__face rd-cube__face--right"><div class="rd-pips">' + pipsForValue(2) + '</div></div>',
      '      <div class="rd-cube__face rd-cube__face--top"><div class="rd-pips">' + pipsForValue(3) + '</div></div>',
      '      <div class="rd-cube__face rd-cube__face--bottom"><div class="rd-pips">' + pipsForValue(4) + '</div></div>',
      '      <div class="rd-cube__face rd-cube__face--left"><div class="rd-pips">' + pipsForValue(5) + '</div></div>',
      '      <div class="rd-cube__face rd-cube__face--back"><div class="rd-pips">' + pipsForValue(6) + '</div></div>',
      '    </div>',
      '  </div>',
      '  <div class="rd-die__result" aria-label="Resultado">' + escapeHtml(String(value)) + '</div>',
      '</div>',
    ].join('');
  }

  window.D6CubeRenderer = {
    cubeHtml: cubeHtml,
  };
})();

