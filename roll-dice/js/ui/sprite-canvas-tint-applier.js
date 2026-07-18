/**
 * SpriteCanvasTintApplier — tint por Canvas sin export (file:// safe)
 * Responsabilidades:
 * - Renderizar el tile actual del atlas en un <canvas> dentro de .rd-sprite
 * - Aplicar tint (multiply) preservando alpha
 * - Redibujar cuando cambien u/v (shuffle) o preferencias de color
 *
 * Nota:
 * - Evita `toDataURL()` porque en file:// suele fallar por seguridad (canvas tainted/opaque origin).
 */
(function () {
  'use strict';

  const _imgCache = new Map(); // srcUrl -> Promise<HTMLImageElement>
  const _obs = new WeakMap();   // spriteEl -> MutationObserver

  function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function parseUrlFunc(v) {
    const s = String(v || '').trim();
    const m = s.match(/^url\((.*)\)$/i);
    if (!m) return null;
    let inside = m[1].trim();
    if ((inside.startsWith('"') && inside.endsWith('"')) || (inside.startsWith("'") && inside.endsWith("'"))) {
      inside = inside.slice(1, -1);
    }
    return inside;
  }

  function loadImage(srcUrl) {
    if (_imgCache.has(srcUrl)) return _imgCache.get(srcUrl);
    const p = new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('No se pudo cargar imagen: ' + srcUrl)); };
      img.src = srcUrl;
    });
    _imgCache.set(srcUrl, p);
    return p;
  }

  function getPrefs() {
    if (!window.RollDiceColorPrefs || typeof window.RollDiceColorPrefs.get !== 'function') {
      return { mode: 'none', fixedColor: '#60a5fa', intensity: 70 };
    }
    return window.RollDiceColorPrefs.get();
  }

  function getDieTintColor(dieEl, prefs) {
    // Preferir SOLO si fue seteado explícitamente en el elemento (no el default del CSS),
    // porque el default era azul y rompía el modo random en el catálogo.
    try {
      const inline = dieEl && dieEl.style ? dieEl.style.getPropertyValue('--rd-tint') : '';
      const c = String(inline || '').trim();
      if (c) return c;
    } catch (_) {}

    // Si no hay color (p.ej. catálogo en modo random), generar uno determinístico por dieId
    const dieId = String(dieEl.getAttribute('data-die-id') || '').trim();
    if (prefs && prefs.mode === 'random') {
      // hash simple estable
      let h = 0;
      for (let i = 0; i < dieId.length; i++) h = ((h << 5) - h) + dieId.charCodeAt(i);
      const hue = Math.abs(h) % 360;
      return 'hsl(' + hue + ' 85% 60%)';
    }

    return (prefs && prefs.fixedColor) ? prefs.fixedColor : '#60a5fa';
  }

  function getIntensityFromDie(dieEl, prefs) {
    // Preferir --rd-tint-a (0..0.85) porque ya está en el DOM por entidad/catálogo
    try {
      const a = parseFloat(getComputedStyle(dieEl).getPropertyValue('--rd-tint-a').trim());
      if (Number.isFinite(a)) return clamp01(a / 0.85);
    } catch (_) {}
    return clamp01((prefs && prefs.intensity != null ? prefs.intensity : 70) / 100);
  }

  function ensureCanvas(spriteEl) {
    let canvas = spriteEl.querySelector('canvas.rd-sprite__canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'rd-sprite__canvas';
      canvas.setAttribute('aria-hidden', 'true');
      spriteEl.appendChild(canvas);
    }
    return canvas;
  }

  function cssColorToRgb(color) {
    // normalizamos usando canvas 1x1 (acepta hex, rgb, hsl, etc.)
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext('2d');
    try {
      ctx.fillStyle = '#000';
      ctx.fillStyle = String(color || '').trim();
      const norm = ctx.fillStyle;
      // 1) hex normalizado
      const mh = String(norm).match(/^#([0-9a-f]{6})$/i);
      if (mh) {
        const hex = mh[1];
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
      }
      // 2) rgb()/rgba() normalizado (Chrome/Win suele devolver rgb(...))
      const mr = String(norm).match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i);
      if (mr) {
        return { r: Math.max(0, Math.min(255, parseFloat(mr[1]) | 0)), g: Math.max(0, Math.min(255, parseFloat(mr[2]) | 0)), b: Math.max(0, Math.min(255, parseFloat(mr[3]) | 0)) };
      }
    } catch (_) {}
    return { r: 96, g: 165, b: 250 };
  }

  function uvToCell(uPct, vPct, cols, rows) {
    const c = Math.max(1, cols | 0);
    const r = Math.max(1, rows | 0);
    const col = (c <= 1) ? 0 : Math.round((uPct / 100) * (c - 1));
    const row = (r <= 1) ? 0 : Math.round((vPct / 100) * (r - 1));
    return { col: Math.max(0, Math.min(c - 1, col)), row: Math.max(0, Math.min(r - 1, row)) };
  }

  async function redrawSprite(spriteEl, dieEl, prefs) {
    const cs = getComputedStyle(spriteEl);
    const srcVar = cs.getPropertyValue('--rd-sprite-img').trim();
    const srcUrl = parseUrlFunc(srcVar);
    if (!srcUrl) return;

    // tile info
    const cols = parseInt(cs.getPropertyValue('--cols').trim(), 10) || 1;
    const rows = parseInt(cs.getPropertyValue('--rows').trim(), 10) || 1;
    const u = parseFloat(cs.getPropertyValue('--u').trim()) || 0;
    const v = parseFloat(cs.getPropertyValue('--v').trim()) || 0;
    const cell = uvToCell(u, v, cols, rows);

    const img = await loadImage(srcUrl);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const tileW = Math.floor(iw / Math.max(1, cols));
    const tileH = Math.floor(ih / Math.max(1, rows));
    const sx = cell.col * tileW;
    const sy = cell.row * tileH;

    const canvas = ensureCanvas(spriteEl);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(spriteEl.clientWidth * dpr));
    const h = Math.max(1, Math.round(spriteEl.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, sx, sy, tileW, tileH, 0, 0, w, h);

    if (!prefs || prefs.mode === 'none') return;
    const intensity = getIntensityFromDie(dieEl, prefs);
    if (intensity <= 0) return;

    const color = getDieTintColor(dieEl, prefs);
    const rgb = cssColorToRgb(color);

    // Funcionamiento oficial: “pintar cuerpo” únicamente.
    // Usamos OVERLAY como modo fijo.
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = intensity;
    ctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
    ctx.fillRect(0, 0, w, h);

    // preservar alpha original del tile
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, sx, sy, tileW, tileH, 0, 0, w, h);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function attachObserver(spriteEl, dieEl) {
    if (_obs.has(spriteEl)) return;
    const mo = new MutationObserver(function () {
      // Redibujar cuando cambien variables (u/v durante shuffle) o estilos.
      redrawSprite(spriteEl, dieEl, getPrefs());
    });
    mo.observe(spriteEl, { attributes: true, attributeFilter: ['style'] });
    _obs.set(spriteEl, mo);
  }

  async function applyAll(root) {
    root = root || document;
    const prefs = getPrefs();

    // Aplicar solo a dados tintados (evita trabajo innecesario)
    const tintedDice = Array.from(root.querySelectorAll('.rd-die--tinted'));
    for (let i = 0; i < tintedDice.length; i++) {
      const dieEl = tintedDice[i];
      const sprites = Array.from(dieEl.querySelectorAll('.rd-sprite'));
      for (let k = 0; k < sprites.length; k++) {
        // ocultar el background actual para evitar doble render
        sprites[k].style.backgroundImage = 'none';
        attachObserver(sprites[k], dieEl);
        await redrawSprite(sprites[k], dieEl, prefs);
      }
    }
  }

  function init() {
    // aplicar al cargar
    applyAll(document);

    // re-aplicar al cambiar color/pack (el DOM se re-renderiza mucho)
    window.addEventListener('rd:colorChange', function () { applyAll(document); });
    window.addEventListener('rd:spritePackChange', function () { applyAll(document); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SpriteCanvasTintApplier = { applyAll: applyAll };
})();

